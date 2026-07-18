// ==========================================
// FILE: AI_Workers/gemini_image_engine.js
// ==========================================

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const MASTER_DIR = path.join(__dirname, '..', 'Master_Controller');
const INPUT_SELECTOR = (() => { try { return JSON.parse(fs.readFileSync(path.join(MASTER_DIR, 'ai_selectors.json'))).gemini.chatBox; } catch(e) { return 'rich-textarea, textarea, div[role="textbox"][contenteditable="true"], .ql-editor'; } })();

// UI থেকে পাঠানো অ্যাকাউন্টের নাম রিসিভ করা (ডিফল্ট: Gemini_Profile)
const profileName = process.argv[2] || 'Normal_Browser';
const ACCOUNTS_DIR = path.join(__dirname, '..', 'Accounts', profileName);

if (!fs.existsSync(ACCOUNTS_DIR)) fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });

let browser, context, page;
let isRunning = false;
let waitForUserPromise = null; // 🔴 ইউজারের জন্য অনন্তকাল ওয়েট করার প্রমিস

// 🔴 Helper: main.js এর মাধ্যমে UI-তে লাইভ কনসোল লগ পাঠানো
function sendLog(type, text) {
    if (process.send) process.send({ type: 'console', logType: type, text: text });
    else console.log(`[${type.toUpperCase()}] ${text}`);
}

// 🔴 Helper: প্রগ্রেস বার আপডেট করার জন্য স্ট্যাটাস পাঠানো
function sendStatus(state, data = {}) {
    if (process.send) process.send({ type: 'status', state, ...data });
}

const randomDelay = (min, max) => new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

async function startAutomation(prompts) {
    if (isRunning) return;
    isRunning = true;

    try {
        sendLog('info', `🚀 Launching Gemini Image Automation on Profile: [${profileName}]`);
        sendLog('info', `📊 Total Prompts Received: ${prompts.length}`);

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

        sendLog('connect', 'Navigating to Gemini...');
        await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });

        // ==========================================================
        // 🔥 MAGIC FIX: ইউজারের জন্য অনন্তকাল অপেক্ষা করবে
        // ==========================================================
        sendLog('waiting', '🛑 ACTION REQUIRED: ব্রাউজারে লগইন করুন এবং চ্যাট সিলেক্ট করুন। রেডি হলে ড্যাশবোর্ড থেকে "Resume" বাটনে ক্লিক করুন!');
        sendStatus('paused'); // UI কে বলে দিলাম যে বট পজ হয়ে আছে
        
        // যতক্ষণ না ইউজার Resume বাটনে ক্লিক করবে, কোড এখানে আটকে থাকবে
        await new Promise(resolve => { waitForUserPromise = resolve; });
        
        sendLog('ready', '▶️ Resume signal received! Starting automation...');
        sendStatus('running');

        let sessionPromptCount = 0;

        for (let i = 0; i < prompts.length; i++) {
            if (!isRunning) break; 

            const currentPrompt = prompts[i];
            
            sendLog('progress', `--- 🎨 Generating Image (Prompt ${i + 1} / ${prompts.length}) ---`);
            sendStatus('prompt', { index: i, text: currentPrompt });

// ইনপুট বক্সটি লোড হওয়া পর্যন্ত অপেক্ষা করা
            const promptBox = page.locator(INPUT_SELECTOR).last(); // .first() এর বদলে .last() হবে
            await promptBox.waitFor({ state: 'visible', timeout: 0 });

            await promptBox.click({ force: true });
            await page.waitForTimeout(300);
            
            // কিবোর্ড দিয়ে সিলেক্ট অল করে ডিলিট করা
            await page.keyboard.press('Control+A');
            await page.keyboard.press('Backspace');
            await randomDelay(300, 600);

            sendLog('typing', `Typing prompt...`);
            
            // সুপার ফাস্ট কপি-পেস্ট ইনজেকশন (যেকোনো বক্সে কাজ করবে)
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

            await page.keyboard.press('Enter');

            // জেমিনির প্রসেসিং-এর সময় অপেক্ষা করা
            sendLog('generating', `[PROMPT ${i + 1}] Waiting for image generation to complete...`);
            await randomDelay(3000, 5000); 
            
            // জেনারেট হওয়া পর্যন্ত অপেক্ষা করা (Stop বাটন দেখা গেলে বুঝব জেনারেট হচ্ছে)
            const stopButtonSelector = 'button[aria-label*="Stop"]';
            const isGenerating = await page.locator(stopButtonSelector).count();
            if (isGenerating > 0) {
                await page.waitForSelector(stopButtonSelector, { state: 'hidden', timeout: 0 });
            }
            
            sendLog('completed', `🎉 Image generated successfully!`);
            await randomDelay(4000, 6000); 

            // UI তে প্রগ্রেস বার আপডেট পাঠানো
            sendStatus('progress', { completed: i + 1, total: prompts.length });

            // অটো-রিফ্রেশ লজিক (প্রতি ৮টি প্রম্পট পর পর)
            sessionPromptCount++;
            if (sessionPromptCount >= 8) {
                sendLog('info', `[🔄 AUTO-REFRESH] Refreshing page to clear RAM/Memory...`);
                await page.reload({ waitUntil: 'domcontentloaded' });
                await randomDelay(8000, 12000); 
                sessionPromptCount = 0; 
            }
        }

        sendLog('ready', '✅ Automation Complete! All images generated.');
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
        // UI থেকে Resume সিগন্যাল পেলে বটের আটকে থাকা প্রমিস সলভ করে দেবে
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