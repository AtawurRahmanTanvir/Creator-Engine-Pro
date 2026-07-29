// ==========================================
// FILE: AI_Workers/flow_engine.js
// ==========================================

const { chromium, firefox } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

const fs = require('fs');
const path = require('path');
const MASTER_DIR = path.join(__dirname, '..', 'Master_Controller');
const INPUT_SELECTOR = (() => { try { return JSON.parse(fs.readFileSync(path.join(MASTER_DIR, 'ai_selectors.json'))).flow.chatBox; } catch (e) { return 'div[role="textbox"]'; } })();

const profileName = process.argv[2] || 'Normal_Browser';
const browserChoice = process.argv[3] || 'chrome';
const ACCOUNTS_DIR = path.join(__dirname, '..', 'Accounts', profileName);

if (!fs.existsSync(ACCOUNTS_DIR)) fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });

let browser, context, page;
let isRunning = false;
let isPaused = false;
let waitForUserPromise = null;

function sendLog(type, text) {
    if (process.send) process.send({ type: 'console', logType: type, text: text });
    else console.log(`[${type.toUpperCase()}] ${text}`);
}

function sendStatus(state, data = {}) {
    if (process.send) process.send({ type: 'status', state, ...data });
}

const randomDelay = (min, max) => new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

function getBrowserExecutablePath(browserName) {
    const platform = process.platform;
    const userProfile = process.env.USERPROFILE || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const paths = {
        brave: {
            win32: [
                `${programFiles}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
                `${programFilesX86}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
                `${localAppData}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`
            ],
            darwin: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser']
        },
        opera: {
            win32: [
                `${localAppData}\\Programs\\Opera\\launcher.exe`,
                `${localAppData}\\Programs\\Opera\\opera.exe`,
                `${localAppData}\\Programs\\Opera GX\\launcher.exe`,
                `${localAppData}\\Programs\\Opera GX\\opera.exe`,
                `${programFiles}\\Opera\\launcher.exe`,
                `${programFiles}\\Opera\\opera.exe`,
                `${programFilesX86}\\Opera\\launcher.exe`,
                `${programFilesX86}\\Opera\\opera.exe`
            ],
            darwin: ['/Applications/Opera.app/Contents/MacOS/Opera']
        },
        vivaldi: {
            win32: [
                `${localAppData}\\Vivaldi\\Application\\vivaldi.exe`,
                `${programFiles}\\Vivaldi\\Application\\vivaldi.exe`
            ],
            darwin: ['/Applications/Vivaldi.app/Contents/MacOS/Vivaldi']
        },
        tor: {
            win32: [
                `${userProfile}\\Desktop\\Tor Browser\\Browser\\firefox.exe`,
                `${userProfile}\\OneDrive\\Desktop\\Tor Browser\\Browser\\firefox.exe`,
                `${localAppData}\\Tor Browser\\Browser\\firefox.exe`,
                `${programFiles}\\Tor Browser\\Browser\\firefox.exe`,
                `${programFilesX86}\\Tor Browser\\Browser\\firefox.exe`,
                `C:\\Tor Browser\\Browser\\firefox.exe`
            ],
            darwin: ['/Applications/Tor Browser.app/Contents/MacOS/firefox']
        },
        firefox: {
            win32: [
                `${programFiles}\\Mozilla Firefox\\firefox.exe`,
                `${programFilesX86}\\Mozilla Firefox\\firefox.exe`,
                `${localAppData}\\Mozilla Firefox\\firefox.exe`
            ],
            darwin: ['/Applications/Firefox.app/Contents/MacOS/firefox']
        }
    };

    if (paths[browserName] && paths[browserName][platform]) {
        for (let p of paths[browserName][platform]) {
            if (fs.existsSync(p)) return p;
        }
    }
    return undefined;
}

const DOWNLOAD_URLS = {
    brave: 'https://brave.com/download/',
    opera: 'https://www.opera.com/download',
    vivaldi: 'https://vivaldi.com/download/',
    tor: 'https://www.torproject.org/download/',
    firefox: 'https://www.mozilla.org/firefox/new/'
};

async function startAutomation(prompts, startIndex = 0) {
    if (isRunning) return;
    isRunning = true;

    try {
        sendLog('info', `🚀 Launching Google Flow on Profile: [${profileName}] via [${browserChoice.toUpperCase()}]`);

        const bName = browserChoice.toLowerCase();

        if (['brave', 'opera', 'vivaldi', 'tor', 'firefox'].includes(bName)) {
            const customPath = getBrowserExecutablePath(bName);
            if (!customPath) {
                sendLog('error', `⚠️ ${bName.toUpperCase()} is not installed on your PC!`);
                sendLog('info', `Redirecting to the official download page...`);

                try {
                    const tempBrowser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--start-maximized'] });
                    const tempPage = await tempBrowser.newPage();
                    await tempPage.goto(DOWNLOAD_URLS[bName]);
                } catch (fallbackError) {
                    const tempBrowserEdge = await chromium.launch({ channel: 'msedge', headless: false, args: ['--start-maximized'] });
                    const tempPageEdge = await tempBrowserEdge.newPage();
                    await tempPageEdge.goto(DOWNLOAD_URLS[bName]);
                }

                sendStatus('idle');
                isRunning = false;
                return;
            }
        }

        const PORTS_FILE = path.join(MASTER_DIR, 'active_ports.json');
        let targetPort = 9222;

        try {
            if (fs.existsSync(PORTS_FILE)) {
                let portsData = JSON.parse(fs.readFileSync(PORTS_FILE, 'utf8'));
                if (portsData[profileName]) {
                    targetPort = portsData[profileName];
                } else {
                    const usedPorts = Object.values(portsData);
                    targetPort = usedPorts.length > 0 ? Math.max(...usedPorts) + 1 : 9222;
                    portsData[profileName] = targetPort;
                    fs.writeFileSync(PORTS_FILE, JSON.stringify(portsData, null, 4));
                }
            } else {
                fs.writeFileSync(PORTS_FILE, JSON.stringify({ [profileName]: 9222 }, null, 4));
            }
        } catch (e) { }

        const endpoint = `http://127.0.0.1:${targetPort}`;

        try {
            sendLog('connect', `Checking for existing Browser on Port ${targetPort}...`);
            if (bName !== 'firefox' && bName !== 'tor') {
                browser = await chromium.connectOverCDP(endpoint);
                context = browser.contexts()[0];
                page = await context.newPage();
                sendLog('connect', `✅ Connected to existing browser session!`);
            } else {
                throw new Error("Firefox/Tor needs fresh launch");
            }
        } catch (cdpError) {
            sendLog('connect', `Launching new ${browserChoice.toUpperCase()} window...`);

            let launchConfig = {
                headless: false,
                viewport: null,
                ignoreDefaultArgs: ["--enable-automation"],
                args: [
                    `--remote-debugging-port=${targetPort}`,
                    '--start-maximized',
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-infobars'
                ]
            };

            if (bName === 'firefox' || bName === 'tor') {
                let ffConfig = { headless: false, viewport: null, args: ['--start-maximized'] };
                const customPath = getBrowserExecutablePath(bName);
                if (customPath) ffConfig.executablePath = customPath;
                context = await firefox.launchPersistentContext(ACCOUNTS_DIR, ffConfig);
            } else {
                if (bName === 'edge') launchConfig.channel = 'msedge';
                else if (bName === 'chrome') launchConfig.channel = 'chrome';
                else if (['brave', 'opera', 'vivaldi'].includes(bName)) launchConfig.executablePath = getBrowserExecutablePath(bName);

                context = await chromium.launchPersistentContext(ACCOUNTS_DIR, launchConfig);
            }

            page = context.pages()[0] || (await context.newPage());
        }

        page.setDefaultTimeout(0);

        sendLog('connect', 'Navigating to Google Flow...');
        await page.goto('https://labs.google/fx/tools/flow', { waitUntil: 'domcontentloaded' });

        sendLog('waiting', '🛑 ACTION REQUIRED: ব্রাউজারে লগইন করুন এবং প্রজেক্ট সিলেক্ট করুন। রেডি হলে ড্যাশবোর্ড থেকে "Resume" বাটনে ক্লিক করুন!');
        sendStatus('paused');

        await new Promise(resolve => { waitForUserPromise = resolve; });

        // 🔴 MAGIC FIX: ইউজার নতুন ট্যাব খুললেও যেন ইঞ্জিন ক্র্যাশ না করে
        const allTabs = context.pages();
        if (allTabs.length > 0) {
            page = allTabs.find(p => p.url().includes('google.com')) || allTabs[allTabs.length - 1];
            try { await page.bringToFront(); } catch (e) { } // ট্যাবটিকে সামনে নিয়ে আসা
        }

        sendLog('ready', '▶️ Resume signal received! Starting video generation...');
        sendStatus('running');

        let sessionPromptCount = 0;

        for (let i = startIndex; i < prompts.length; i++) {
            if (!isRunning) break;

            // 🔴 MAGIC PAUSE LOCK: উইন্ডো খোলা থাকবে, কিন্তু পজ করা হলে লুপটি এখানেই আটকে থাকবে!
            while (isPaused && isRunning) {
                await new Promise(r => setTimeout(r, 1000));
            }
            if (!isRunning) break;

            const currentPrompt = prompts[i];
            sendLog('progress', `--- 🎨 Processing Prompt ${i + 1} of ${prompts.length} ---`);
            sendStatus('prompt', { index: i, text: currentPrompt });

            const promptBox = page.locator(INPUT_SELECTOR);
            await promptBox.waitFor({ state: 'visible', timeout: 0 });

            await promptBox.click();
            await promptBox.fill('');
            await randomDelay(300, 600);

            sendLog('generating', `Pasting prompt stealthily...`);

            // 🔴 ফাস্ট এবং 100% বট-প্রুফ কপি-পেস্ট ইনজেকশন
            await page.evaluate((text) => {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }, currentPrompt);

            await promptBox.click({ force: true });
            await page.keyboard.press('Control+V');
            await randomDelay(800, 1500);

            const initialVideoCount = await page.evaluate(() => {
                const getVideos = (root) => {
                    let count = 0;
                    root.querySelectorAll('*').forEach(el => {
                        if (el.tagName === 'VIDEO') count++;
                        if (el.shadowRoot) count += getVideos(el.shadowRoot);
                    });
                    return count;
                };
                return getVideos(document);
            });

            await page.keyboard.press('Enter');
            sendLog('generating', `[PROMPT ${i + 1}] Render started. Waiting for new <video> element...`);

            try {
                await page.waitForFunction((initialCount) => {
                    const getVideos = (root) => {
                        let count = 0;
                        root.querySelectorAll('*').forEach(el => {
                            if (el.tagName === 'VIDEO') count++;
                            if (el.shadowRoot) count += getVideos(el.shadowRoot);
                        });
                        return count;
                    };
                    return getVideos(document) > initialCount;
                }, initialVideoCount, { timeout: 420000, polling: 5000 });

                sendLog('completed', `🎉 New video generated successfully!`);
            } catch (e) {
                sendLog('error', `[WARNING] 7-minute timeout reached. Skipping to next prompt...`);
            }

            sendStatus('progress', { completed: i + 1, total: prompts.length });

            sendLog('waiting', `Waiting 5 seconds before next prompt...`);
            await page.waitForTimeout(5000);

            sessionPromptCount++;
            if (sessionPromptCount >= 10) {
                sendLog('info', `[🔄 AUTO-REFRESH] Refreshing page to clear RAM/Memory...`);
                await page.reload({ waitUntil: 'domcontentloaded' });
                await randomDelay(8000, 12000);
                sessionPromptCount = 0;
            }
        }

        sendLog('ready', '✅ Automation Complete! All videos generated.');
        sendStatus('done');
        isRunning = false;

    } catch (error) {
        sendLog('error', `Engine Crashed: ${error.message}`);
        isRunning = false;
    }
}

process.on('message', async (msg) => {
    if (msg.type === 'start') {
        startAutomation(msg.prompts, msg.startIndex);
    } else if (msg.type === 'pause') {
        isPaused = true;
        sendLog('waiting', '⏸️ Automation Paused. Waiting for resume signal...');
    } else if (msg.type === 'resume') {
        isPaused = false;
        if (waitForUserPromise) {
            waitForUserPromise();
            waitForUserPromise = null;
        }
        sendLog('ready', '▶️ Resuming automation...');
    } else if (msg === 'shutdown' || msg.type === 'stop') {
        isRunning = false;
        isPaused = false;
        sendLog('info', 'Shutting down engine...');
        try {
            if (page) await page.close();
            if (context) await context.close();
        } catch (e) { }
        process.exit(0);
    }
});