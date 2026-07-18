// ==========================================
// FILE: AI_Workers/flow_engine.js
// ==========================================

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const MASTER_DIR = path.join(__dirname, '..', 'Master_Controller');
const INPUT_SELECTOR = (() => { try { return JSON.parse(fs.readFileSync(path.join(MASTER_DIR, 'ai_selectors.json'))).flow.chatBox; } catch(e) { return 'div[role="textbox"]'; } })();

const profileName = process.argv[2] || 'Normal_Browser';
const ACCOUNTS_DIR = path.join(__dirname, '..', 'Accounts', profileName);

if (!fs.existsSync(ACCOUNTS_DIR)) fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });

let browser, context, page;
let isRunning = false;
let waitForUserPromise = null; // 🔴 নতুন: ইউজারের জন্য অনন্তকাল ওয়েট করার প্রমিস

function sendLog(type, text) {
    if (process.send) process.send({ type: 'console', logType: type, text: text });
    else console.log(`[${type.toUpperCase()}] ${text}`);
}

function sendStatus(state, data = {}) {
    if (process.send) process.send({ type: 'status', state, ...data });
}

const randomDelay = (min, max) => new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

async function startAutomation(prompts) {
    if (isRunning) return;
    isRunning = true;

    try {
        sendLog('info', `🚀 Launching Google Flow Automation on Profile: [${profileName}]`);
        
// --- 🔴 ডাইনামিক পোর্ট ও হাইব্রিড কানেকশন ম্যাজিক ---
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
        } catch(e) {}

        const endpoint = `http://127.0.0.1:${targetPort}`;
        
        try {
            sendLog('connect', `Checking for existing Browser on Port ${targetPort}...`);
            browser = await chromium.connectOverCDP(endpoint);
            context = browser.contexts()[0];
            page = await context.newPage();
            sendLog('connect', `✅ Connected to existing browser session!`);
        } catch (cdpError) {
            sendLog('connect', `Launching new browser window...`);
            context = await chromium.launchPersistentContext(ACCOUNTS_DIR, {
                channel: 'chrome',
                headless: false,
                viewport: null,
                args: [
                    `--remote-debugging-port=${targetPort}`,
                    '--start-maximized', 
                    '--disable-blink-features=AutomationControlled'
                ]
            });
            page = context.pages()[0] || (await context.newPage());
        }
        // ---------------------------------------------------------

        page.setDefaultTimeout(0);

        sendLog('connect', 'Navigating to Google Flow...');
        await page.goto('https://labs.google/fx/tools/flow', { waitUntil: 'domcontentloaded' });

        // ==========================================================
        // 🔥 MAGIC FIX: ইউজারের জন্য অনন্তকাল অপেক্ষা করবে
        // ==========================================================
        sendLog('waiting', '🛑 ACTION REQUIRED: ব্রাউজারে লগইন করুন এবং প্রজেক্ট সিলেক্ট করুন। রেডি হলে ড্যাশবোর্ড থেকে "Resume" বাটনে ক্লিক করুন!');
        sendStatus('paused'); // UI কে বলে দিলাম যে বট পজ হয়ে আছে
        
        // যতক্ষণ না ইউজার Resume বাটনে ক্লিক করবে, কোড এখানে অনন্তকাল আটকে থাকবে!
        await new Promise(resolve => { waitForUserPromise = resolve; });
        
        sendLog('ready', '▶️ Resume signal received! Starting video generation...');
        sendStatus('running');

        let sessionPromptCount = 0;

        for (let i = 0; i < prompts.length; i++) {
            if (!isRunning) break; 

            const currentPrompt = prompts[i];
            sendLog('progress', `--- 🎨 Processing Prompt ${i + 1} of ${prompts.length} ---`);
            sendStatus('prompt', { index: i, text: currentPrompt });

            const promptBox = page.locator('div[role="textbox"]');
            await promptBox.waitFor({ state: 'visible', timeout: 0 });

            await promptBox.click();
            await promptBox.fill('');
            await randomDelay(300, 600);

            sendLog('generating', `Typing prompt...`);
            await promptBox.pressSequentially(currentPrompt, { delay: 5 });
            await randomDelay(800, 1500);

            // ==========================================================
            // 🔥 ডাইনামিক ডিটেকশন শুরু
            // ==========================================================
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

// 🔴 Master Controller এর সিগন্যাল রিসিভ করা
process.on('message', async (msg) => {
    if (msg.type === 'start') {
        startAutomation(msg.prompts);
    } else if (msg.type === 'resume') {
        // 🔴 UI থেকে Resume সিগন্যাল পেলে বটের আটকে থাকা প্রমিস সলভ করে দেবে!
        if (waitForUserPromise) {
            waitForUserPromise();
            waitForUserPromise = null;
        }
    } else if (msg === 'shutdown' || msg.type === 'stop') {
        isRunning = false;
        sendLog('info', 'Shutting down engine...');
        try { if (page) await page.close(); if (context) await context.close(); } catch(e){}
        process.exit(0);
    }
});