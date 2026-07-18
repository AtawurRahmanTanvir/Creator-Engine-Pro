// ==========================================
// FILE: Core_Systems/Final_engine.js
// ==========================================

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const profileName = process.argv[2] || 'Normal_Browser';

const MASTER_DIR = path.join(__dirname, '..', 'Master_Controller');
const INBOX_FILE = path.join(MASTER_DIR, 'Inbox', 'final_inbox.json');
const OUTBOX_DIR = path.join(MASTER_DIR, 'Outbox');

// 🔴 ম্যাজিক ফিক্স ১: অ্যাকাউন্টের ফোল্ডার পাথ
const ACCOUNTS_DIR = path.join(__dirname, '..', 'Accounts', profileName); 

if (!fs.existsSync(OUTBOX_DIR)) fs.mkdirSync(OUTBOX_DIR, { recursive: true });
if (!fs.existsSync(path.dirname(INBOX_FILE))) fs.mkdirSync(path.dirname(INBOX_FILE), { recursive: true });
if (!fs.existsSync(ACCOUNTS_DIR)) fs.mkdirSync(ACCOUNTS_DIR, { recursive: true }); 

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

const INPUT_SELECTOR = (() => { try { return JSON.parse(fs.readFileSync(path.join(MASTER_DIR, 'ai_selectors.json'))).gemini.chatBox; } catch(e) { return 'rich-textarea, textarea, div[role="textbox"][contenteditable="true"], .ql-editor'; } })();
const randomDelay = (min, max) => new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

(async () => {
    console.log(`\n======================================================`);
    console.log(` 🎯 Final Editor Node (ULTRA FAST MODE) [Profile: ${profileName}]`);
    console.log(`======================================================\n`);

    while (true) { 
        switch (currentState) {
            
            case State.INITIATING:
                try {
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
                        console.log(`[STATE] 🌐 Checking for Browser on Port ${targetPort} (Profile: ${profileName})...`);
                        browser = await chromium.connectOverCDP(endpoint);
                        context = browser.contexts()[0];
                        page = await context.newPage();
                        console.log(`[INFO] ✅ Connected! Opening Final Editor in a new tab...`);
                    } catch (cdpError) {
                        console.log(`[INFO] Browser not found. Launching new window for ${profileName}...`);
                        const ACCOUNTS_DIR = path.join(__dirname, '..', 'Accounts', profileName); 
                        if (!fs.existsSync(ACCOUNTS_DIR)) fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
                        
                        context = await chromium.launchPersistentContext(ACCOUNTS_DIR, {
                            headless: false,
                            channel: 'chrome',
                            viewport: null,
                            ignoreDefaultArgs: ["--enable-automation"], 
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
                    
                    console.log(`[INFO] Opening Final Editor Tab...`);
                    await page.goto('https://gemini.google.com/app?role=final', { waitUntil: 'domcontentloaded' });
                    
                    await page.bringToFront(); 
                    console.log(`[INFO] ✅ Final Editor hooked successfully!`);
                    
                    await page.waitForTimeout(5000); 
                    currentState = State.CONVERSATION_READY;
                } catch (err) {
                    console.log(`[ERROR DETAILS] ${err.message}`); 
                    console.log(`[WARNING] Browser launch failed. Retrying in 5 seconds...`);
                    await new Promise(r => setTimeout(r, 5000));
                }
                break;

            case State.CONVERSATION_READY: 
                try {
                    await page.evaluate(() => {
                        document.querySelectorAll('div[role="dialog"]').forEach(e => {
                            const btn = e.querySelector('button, [role="button"]');
                            if(btn) btn.click();
                            else e.remove();
                        });
                    });
                } catch(e) {}

                console.log(`[STATE] ⏳ Waiting for Input Box to be completely visible...`);
                await page.locator(INPUT_SELECTOR).last().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
                
                await page.waitForTimeout(3000); 
                
                currentState = State.LISTENING; 
                break;

            case State.LISTENING:
                try {
                    if (fs.existsSync(INBOX_FILE)) {
                        const rawData = fs.readFileSync(INBOX_FILE, 'utf8');
                        if (rawData.trim() !== "" && rawData.trim() !== "{}") {
                            const data = JSON.parse(rawData);
                            
                            if (data.prompt && data.task_id) {
                                console.log(`\n[STATE] 📥 NEW TASK RECEIVED from ${data.sender}!`);
                                currentTask = data;
                                currentState = State.TYPING;
                                break; 
                            }
                        }
                    }
                } catch (e) {}
                
                await page.waitForTimeout(1000);
                break;

            case State.TYPING: 
                console.log(`[STATE] ⌨️  ${currentState}: Blazing fast Copy-Paste typing...`);
                
                const promptBox = page.locator(INPUT_SELECTOR).last();
                
                await promptBox.waitFor({ state: 'visible' }); 
                await promptBox.click({ force: true });
                await page.waitForTimeout(500); 
                
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
                await page.waitForTimeout(200); 
                await page.keyboard.press('Control+V'); 
                
                await randomDelay(800, 1200); 
                currentState = State.PROMPT_SENT;
                break;

            case State.PROMPT_SENT: 
                console.log(`[STATE] 🚀 ${currentState}: Pressing 'Enter' to submit.`);
                await page.keyboard.press('Enter');
                currentState = State.GENERATING;
                break;

            case State.GENERATING: 
                try {
                    await page.waitForTimeout(2000); 
                    let previousText = "";
                    let sameTextCounter = 0;
                    
                    for (let i = 0; i < 120; i++) {
                        const currentText = await page.evaluate(() => {
                            const blocks = Array.from(document.querySelectorAll('model-response, message-content, .message-content, [data-test-id="model-response"]'));
                            if (blocks.length === 0) return "";
                            return blocks[blocks.length - 1].innerText;
                        });
                        
                        if (currentText === previousText && currentText.trim().length > 10) {
                            sameTextCounter++;
                            if (sameTextCounter >= 3) break; 
                        } else {
                            sameTextCounter = 0; 
                            previousText = currentText; 
                        }
                        await page.waitForTimeout(1000); 
                    }
                    currentState = State.COMPLETED;
                } catch (e) {
                    currentState = State.COMPLETED; 
                }
                break;

            case State.COMPLETED:
                console.log(`[STATE] ✅ ${currentState}: AI response finalized.`);
                await randomDelay(300, 600); 
                currentState = State.OUTPUT_COPIED;
                break;

            case State.OUTPUT_COPIED: 
                currentOutput = await page.evaluate(() => {
                    const blocks = Array.from(document.querySelectorAll('model-response, message-content, .message-content, [data-test-id="model-response"]'));
                    if (blocks.length === 0) return "[ERROR] No AI response found on page.";
                    
                    const lastResponse = blocks[blocks.length - 1];
                    const clone = lastResponse.cloneNode(true);
                    clone.querySelectorAll('button, svg, [role="button"], span.sr-only, .info-icon').forEach(el => el.remove());
                    return clone.innerText.trim();
                });
                
                if (!currentOutput || currentOutput.trim() === "") {
                    currentOutput = "[ERROR] Extracted text was empty.";
                }
                currentState = State.OUTPUT_SAVED;
                break;

            case State.OUTPUT_SAVED: 
                console.log(`[STATE] 💾 ${currentState}: Pushing to Outbox for Router to process...`);
                
                // 🔴 100% FIXED: receiver ব্ল্যাঙ্ক রাখা হলো, যাতে main.js রাউটার নিজে সিদ্ধান্ত নেয়
                const outboxData = {
                    task_id: currentTask.task_id,
                    sender: "@final", 
                    receiver: "", 
                    original_prompt: currentTask.prompt,
                    response: currentOutput,
                    timestamp: new Date().toISOString()
                };

                const outboxFilePath = path.join(OUTBOX_DIR, `outbox_final_${Date.now()}.json`);
                fs.writeFileSync(outboxFilePath, JSON.stringify(outboxData, null, 4));
                
                if (fs.existsSync(INBOX_FILE)) {
                    fs.unlinkSync(INBOX_FILE);
                }
                
                console.log(`[SUCCESS] Output saved! Master Router will handle the delivery.`);
                
                currentTask = null;
                currentOutput = "";
                
                await page.waitForTimeout(500); 
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
        console.log(`[🛑 SHUTDOWN] Closing Final Editor tab...`);
        
        setTimeout(() => { process.exit(0); }, 2500);

        try {
            if (typeof page !== 'undefined' && page && !page.isClosed()) {
                await page.close();
            }
            if (typeof browser !== 'undefined' && browser && typeof browser.disconnect === 'function') {
                await browser.disconnect(); 
            }
        } catch (err) {}
        
        process.exit(0); 
    }
});