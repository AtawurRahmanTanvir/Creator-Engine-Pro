const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const profileName = process.argv[2] || 'Normal_Browser';

const MASTER_DIR = path.join(__dirname, '..', 'Master_Controller');
const INBOX_FILE = path.join(MASTER_DIR, 'Inbox', 'gemini_inbox.json');
const OUTBOX_DIR = path.join(MASTER_DIR, 'Outbox');

// 🔴 ম্যাজিক ফিক্স ১: অ্যাকাউন্টের ফোল্ডার পাথ
const ACCOUNTS_DIR = path.join(__dirname, '..', 'Accounts', profileName); 

if (!fs.existsSync(OUTBOX_DIR)) fs.mkdirSync(OUTBOX_DIR, { recursive: true });
if (!fs.existsSync(path.dirname(INBOX_FILE))) fs.mkdirSync(path.dirname(INBOX_FILE), { recursive: true });
if (!fs.existsSync(ACCOUNTS_DIR)) fs.mkdirSync(ACCOUNTS_DIR, { recursive: true }); // প্রোফাইল ফোল্ডার তৈরি

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

// 🔴 সুপার-সিলেক্টর: জেমিনাইয়ের যেকোনো বক্স সে খুঁজে বের করবে
const INPUT_SELECTOR = (() => { try { return JSON.parse(fs.readFileSync(path.join(MASTER_DIR, 'ai_selectors.json'))).gemini.chatBox; } catch(e) { return 'rich-textarea, textarea, div[role="textbox"][contenteditable="true"], .ql-editor'; } })();
const randomDelay = (min, max) => new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

(async () => {
    console.log(`\n======================================================`);
    console.log(` 🚀 Gemini Worker Node [Profile: ${profileName}]`);
    console.log(`======================================================\n`);

    while (true) { 
        switch (currentState) {
            
            // 🔴 100% FIXED: SMART HYBRID MODE + ANTI-BOT BYPASS + DYNAMIC PORT
            case State.INITIATING:
                try {
                    // --- 🔴 আলাদা অ্যাকাউন্টের জন্য আলাদা পোর্ট সেট করার ম্যাজিক ---
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
                        // ১. প্রথমে চেক করবে পোর্ট ${targetPort} তে কোনো মাস্টার ব্রাউজার অন আছে কি না
                        console.log(`[STATE] 🌐 Checking for Browser on Port ${targetPort} (Profile: ${profileName})...`);
                        browser = await chromium.connectOverCDP(endpoint);
                        context = browser.contexts()[0];
                        page = await context.newPage();
                        console.log(`[INFO] ✅ Connected! Opening Gemini in a new tab...`);
                    } catch (cdpError) {
                        // ২. যদি না থাকে, তবে সে নিজেই নতুন ব্রাউজার উইন্ডো খুলবে!
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
                    await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
                    
                    await page.waitForTimeout(5000); 
                    currentState = State.CONVERSATION_READY;
                } catch (err) {
                    console.log(`[ERROR DETAILS] ${err.message}`); 
                    await new Promise(r => setTimeout(r, 5000));
                }
                break;

            case State.CONVERSATION_READY: 
                console.log(`[STATE] 💬 ${currentState}: Handling popups and waiting for Gemini input box...`);
                
                try {
                    await page.evaluate(() => {
                        document.querySelectorAll('div[role="dialog"]').forEach(e => {
                            const btn = e.querySelector('button, [role="button"]');
                            if(btn) btn.click();
                            else e.remove();
                        });
                    });
                } catch(e) {}

                await page.locator(INPUT_SELECTOR).last().waitFor({ state: 'attached', timeout: 15000 }).catch(() => console.log("[INFO] Input box wait timeout, proceeding anyway..."));
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
                
                const promptBox = page.locator(INPUT_SELECTOR).last();
                await promptBox.click({ force: true });
                await page.waitForTimeout(300);
                
                await page.keyboard.press('Control+A');
                await page.keyboard.press('Backspace');
                await randomDelay(100, 200);
                
                // 🔴 ফাস্ট কপি-পেস্ট ইনজেকশন
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
                console.log(`[STATE] 🚀 ${currentState}: Pressing 'Enter' to submit.`);
                await page.keyboard.press('Enter');
                currentState = State.GENERATING;
                break;

            case State.GENERATING: 
                console.log(`[STATE] ⚙️  ${currentState}: Monitoring Gemini's text stream...`);
                
                try {
                    await page.waitForTimeout(3000); 
                    console.log(`[WAITING] ⏳ AI is streaming... Watching text growth.`);
                    
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
                        await page.waitForTimeout(1500); 
                    }

                    console.log(`[INFO] Generation stream finished!`);
                    currentState = State.COMPLETED;
                } catch (e) {
                    console.log(`[ERROR] Generation Phase Error: ${e.message}`);
                    currentState = State.COMPLETED; 
                }
                break;

            case State.COMPLETED:
                console.log(`[STATE] ✅ ${currentState}: AI response finalized.`);
                await randomDelay(1000, 2000); 
                currentState = State.OUTPUT_COPIED;
                break;

            case State.OUTPUT_COPIED: 
                console.log(`[STATE] 📋 ${currentState}: Extracting raw text from Gemini...`);
                
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
                console.log(`[STATE] 💾 ${currentState}: Saving to Master Outbox...`);
                
                const outboxData = {
                    task_id: currentTask.task_id,
                    sender: "@gemini", 
                    receiver: "@admin", // 🔴 ফিক্স: এটা স্ট্রিক্টলি @admin হবে, তা না হলে UI তে শো করবে না!
                    original_prompt: currentTask.prompt,
                    response: currentOutput,
                    timestamp: new Date().toISOString()
                };

                const outboxFilePath = path.join(OUTBOX_DIR, `outbox_gemini_${Date.now()}.json`);
                fs.writeFileSync(outboxFilePath, JSON.stringify(outboxData, null, 4));
                
                // 🔴 ইনবক্সের ফাইলটা ডিলিট করে দেওয়া হলো
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
// 🔴 Graceful Shutdown: 100% FIXED: শুধুমাত্র নিজের ট্যাব কেটে বিদায় নেবে
// ========================================================
process.on('message', async (msg) => {
    if (msg === 'shutdown') {
        console.log(`[🛑 SHUTDOWN] Closing Gemini tab...`);
        setTimeout(() => { process.exit(0); }, 2500);

        try {
            if (typeof page !== 'undefined' && page && !page.isClosed()) {
                await page.close(); // 🔴 শুধু নিজের ট্যাব কাটবে, ব্রাউজার নয়!
            }
            if (typeof browser !== 'undefined' && browser && typeof browser.disconnect === 'function') {
                await browser.disconnect(); 
            }
        } catch (err) {}
        
        process.exit(0); 
    }
});