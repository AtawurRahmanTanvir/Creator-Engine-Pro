const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const profileName = process.argv[2] || 'Normal_Browser';

const MASTER_DIR = path.join(__dirname, '..', 'Master_Controller');
const INBOX_FILE = path.join(MASTER_DIR, 'Inbox', 'chatgpt_inbox.json');
const OUTBOX_DIR = path.join(MASTER_DIR, 'Outbox');

if (!fs.existsSync(OUTBOX_DIR)) fs.mkdirSync(OUTBOX_DIR, { recursive: true });
if (!fs.existsSync(path.dirname(INBOX_FILE))) fs.mkdirSync(path.dirname(INBOX_FILE), { recursive: true });

const State = {
    INITIATING: 'Initiating System',
    CONVERSATION_READY: 'Conversation Ready',
    LISTENING: 'Listening for Tasks',
    TYPING: 'Typing',
    PROMPT_SENT: 'Prompt Sent',
    GENERATING: 'Generating',
    COMPLETED: 'Completed',
    OUTPUT_COPIED: 'Output Copied',
    OUTPUT_SAVED: 'Output Saved'
};

let currentState = State.INITIATING;
let browser, context, page;
let currentTask = null; 
let currentOutput = "";
let networkPromise; 

const INPUT_SELECTOR = (() => { try { return JSON.parse(fs.readFileSync(path.join(MASTER_DIR, 'ai_selectors.json'))).chatgpt.chatBox; } catch(e) { return '#prompt-textarea, textarea, div[contenteditable="true"]'; } })();
const randomDelay = (min, max) => new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

(async () => {
    console.log(`\n======================================================`);
    console.log(` 🤖 ChatGPT Worker Node [Profile: ${profileName}]`);
    console.log(`======================================================\n`);

    while (true) { 
        switch (currentState) {
            
            // 🔴 100% FIXED: ডাইনামিক পোর্ট জেনারেটর + হাইব্রিড মোড
            case State.INITIATING:
                try {
                    // --- 🔴 আলাদা অ্যাকাউন্টের জন্য আলাদা পোর্ট সেট করার ম্যাজিক ---
                    const PORTS_FILE = path.join(MASTER_DIR, 'active_ports.json');
                    let targetPort = 9222;
                    
                    try {
                        if (fs.existsSync(PORTS_FILE)) {
                            let portsData = JSON.parse(fs.readFileSync(PORTS_FILE, 'utf8'));
                            if (portsData[profileName]) {
                                targetPort = portsData[profileName]; // আগের পোর্ট থাকলে সেটা নেবে
                            } else {
                                // নতুন অ্যাকাউন্ট হলে নতুন পোর্ট বানাবে (যেমন 9223, 9224)
                                const usedPorts = Object.values(portsData);
                                targetPort = usedPorts.length > 0 ? Math.max(...usedPorts) + 1 : 9222;
                                portsData[profileName] = targetPort;
                                fs.writeFileSync(PORTS_FILE, JSON.stringify(portsData, null, 4));
                            }
                        } else {
                            fs.writeFileSync(PORTS_FILE, JSON.stringify({ [profileName]: 9222 }, null, 4));
                        }
                    } catch(e) {}
                    // -------------------------------------------------------------

                    const endpoint = `http://127.0.0.1:${targetPort}`;
                    
                    try {
                        // ১. প্রথমে চেক করবে এই অ্যাকাউন্টের পোর্ট আগে থেকেই অন আছে কিনা
                        console.log(`[STATE] 🌐 Checking for Browser on Port ${targetPort} (Profile: ${profileName})...`);
                        browser = await chromium.connectOverCDP(endpoint);
                        context = browser.contexts()[0];
                        page = await context.newPage();
                        console.log(`[INFO] ✅ Connected! Opening ChatGPT in a new tab...`);
                    } catch (cdpError) {
                        // ২. না থাকলে সে নতুন উইন্ডো খুলবে!
                        console.log(`[INFO] Browser not found. Launching new window for ${profileName}...`);
                        const ACCOUNTS_DIR = path.join(__dirname, '..', 'Accounts', profileName); 
                        if (!fs.existsSync(ACCOUNTS_DIR)) fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
                        
                        context = await chromium.launchPersistentContext(ACCOUNTS_DIR, {
                            headless: false,
                            channel: 'chrome',
                            viewport: null,
                            ignoreDefaultArgs: ["--enable-automation"], // 🔴 Bot Bypass
                            args: [
                                `--remote-debugging-port=${targetPort}`, 
                                '--start-maximized',
                                '--disable-blink-features=AutomationControlled',
                                '--no-sandbox',
                                '--disable-infobars'
                            ]
                        });
                        let pages = context.pages();
                        page = pages.length > 0 ? pages[0] : await context.newPage();
                        console.log(`[INFO] ✅ New Browser Launched successfully on port ${targetPort}!`);
                    }

                    page.setDefaultTimeout(0); 
                    await page.goto('https://chatgpt.com/?role=worker_chatgpt', { waitUntil: 'domcontentloaded' });
                    
                    await page.waitForTimeout(5000); 
                    currentState = State.CONVERSATION_READY;
                } catch (err) {
                    console.log(`[ERROR DETAILS] ${err.message}`); 
                    await new Promise(r => setTimeout(r, 5000));
                }
                break;
                
            case State.CONVERSATION_READY: 
                console.log(`[STATE] 💬 ${currentState}: Waiting for any valid input box...`);
                await page.locator(INPUT_SELECTOR).last().waitFor({ state: 'visible', timeout: 0 });
                currentState = State.LISTENING; 
                break;

            case State.LISTENING:
                await page.waitForTimeout(3000);
                
                try {
                    if (fs.existsSync(INBOX_FILE)) {
                        const rawData = fs.readFileSync(INBOX_FILE, 'utf8');
                        if (rawData.trim() !== "" && rawData.trim() !== "{}") {
                            const data = JSON.parse(rawData);
                            
                            if (data.prompt && data.task_id) {
                                console.log(`\n[STATE] 📥 NEW TASK RECEIVED from ${data.sender}! Task ID: ${data.task_id}`);
                                currentTask = data;
                                currentState = State.TYPING;
                            }
                        }
                    }
                } catch (e) {}
                break;

            case State.TYPING: 
                console.log(`[STATE] ⌨️  ${currentState}: Blazing fast Copy-Paste typing...`);
                
                try {
                    const popupBtn = page.locator('button:has-text("Stay logged out")');
                    if (await popupBtn.isVisible({ timeout: 1000 })) {
                        await popupBtn.click();
                        console.log(`[INFO] Auto-dismissed popup!`);
                        await page.waitForTimeout(500);
                    }
                } catch(e) {}

                const promptBox = page.locator(INPUT_SELECTOR).last();
                await promptBox.click({ force: true });
                await page.waitForTimeout(300);
                
                await page.keyboard.press('Control+A');
                await page.keyboard.press('Backspace');
                await randomDelay(100, 200);
                
                await page.evaluate((text) => {
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                }, currentTask.prompt);

                await promptBox.click({ force: true });
                await page.keyboard.press('Control+V'); 
                
                await randomDelay(800, 1500);
                currentState = State.PROMPT_SENT;
                break;

            case State.PROMPT_SENT: 
                console.log(`[STATE] 🚀 ${currentState}: Hooking into Network Tab & Pressing 'Enter'...`);
                
                networkPromise = new Promise((resolve) => {
                    const handleRequestFinished = (request) => {
                        if (request.url().includes('/conversation') && request.method() === 'POST') {
                            console.log(`[NETWORK] 📡 Stream Closed: ${request.url().split('/').pop()}`);
                            page.removeListener('requestfinished', handleRequestFinished);
                            page.removeListener('requestfailed', handleRequestFailed);
                            resolve();
                        }
                    };
                    
                    const handleRequestFailed = (request) => {
                        if (request.url().includes('/conversation') && request.method() === 'POST') {
                            console.log(`[NETWORK] ⚠️ Stream Failed/Interrupted.`);
                            page.removeListener('requestfinished', handleRequestFinished);
                            page.removeListener('requestfailed', handleRequestFailed);
                            resolve(); 
                        }
                    };

                    page.on('requestfinished', handleRequestFinished);
                    page.on('requestfailed', handleRequestFailed);

                    setTimeout(() => resolve(), 300000); 
                });

                await page.keyboard.press('Enter');
                currentState = State.GENERATING;
                break;

            case State.GENERATING: 
                console.log(`[STATE] ⚙️  ${currentState}: AI is streaming. Monitoring Network API...`);
                await networkPromise;
                console.log(`[INFO] Network stream completely finished! Generation is 100% done.`);
                currentState = State.COMPLETED;
                break;

            case State.COMPLETED:
                console.log(`[STATE] ✅ ${currentState}: AI response finalized.`);
                await randomDelay(500, 1000); 
                currentState = State.OUTPUT_COPIED;
                break;

            case State.OUTPUT_COPIED: 
                console.log(`[STATE] 📋 ${currentState}: Auto-Copying text directly from DOM...`);
                
                try {
                    const assistantMessages = page.locator('div[data-message-author-role="assistant"]');
                    const count = await assistantMessages.count();
                    
                    if (count > 0) {
                        const lastMessage = assistantMessages.nth(count - 1);
                        const markdownContent = lastMessage.locator('.markdown');
                        
                        if (await markdownContent.count() > 0) {
                            currentOutput = await markdownContent.innerText();
                        } else {
                            currentOutput = await lastMessage.innerText();
                        }
                        
                        if (!currentOutput || currentOutput.trim() === "") {
                            currentOutput = "[ERROR] Extracted text was empty.";
                        }
                    } else {
                        currentOutput = "[ERROR] No AI response found on page.";
                    }
                } catch (err) {
                    currentOutput = `[ERROR] Extraction Failed: ${err.message}`;
                }
                
                currentState = State.OUTPUT_SAVED;
                break;

            case State.OUTPUT_SAVED: 
                console.log(`[STATE] 💾 ${currentState}: Saving to Master Outbox...`);
                
                const outboxData = {
                    task_id: currentTask.task_id,
                    sender: "@chatgpt", 
                    receiver: "@administrator", 
                    original_prompt: currentTask.prompt,
                    response: currentOutput,
                    timestamp: new Date().toISOString()
                };

                const outboxFilePath = path.join(OUTBOX_DIR, `outbox_chatgpt_${Date.now()}.json`);
                fs.writeFileSync(outboxFilePath, JSON.stringify(outboxData, null, 4));
                
                if (fs.existsSync(INBOX_FILE)) {
                    fs.unlinkSync(INBOX_FILE);
                }
                
                console.log(`[SUCCESS] Task Delivered to Administrator! Returning to Listening Mode in 3 seconds...`);
                
                currentTask = null;
                currentOutput = "";
                
                await page.waitForTimeout(3000);
                currentState = State.CONVERSATION_READY; 
                break;
        }
    }
    
})();

// ========================================================
// 🔴 Graceful Shutdown: শুধুমাত্র নিজের ট্যাব কেটে বিদায় নেবে
// ========================================================
process.on('message', async (msg) => {
    if (msg === 'shutdown') {
        console.log(`[🛑 SHUTDOWN] Force closing tab...`);
        setTimeout(() => { process.exit(0); }, 2500);

        try {
            if (typeof page !== 'undefined' && page && !page.isClosed()) {
                await page.close(); // 🔴 শুধু নিজের ট্যাব কাটবে, আস্ত ব্রাউজার নয়!
            }
            if (typeof browser !== 'undefined' && browser && typeof browser.disconnect === 'function') {
                await browser.disconnect(); // ব্রাউজার থেকে শুধু ডিসকানেক্ট হবে
            }
        } catch (err) {}
        
        process.exit(0); 
    }
});