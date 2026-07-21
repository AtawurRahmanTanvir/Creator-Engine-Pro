const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 🔴 প্রোফাইলের নাম রিসিভ করার কোড 
const profileName = process.argv[2] || 'Normal_Browser';

// --- Master Controller Paths ---
const MASTER_DIR = path.join(__dirname, '..', 'Master_Controller');
const INBOX_FILE = path.join(MASTER_DIR, 'Inbox', 'grok_inbox.json');
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
let initialCopyCount = 0; 

// 🔴 আল্টিমেট সিলেক্টর: লেখা যাই থাকুক না কেন, সে শুধু স্ক্রিনের "দৃশ্যমান" (Visible) বক্সটাকেই ধরবে
const INPUT_SELECTOR = (() => { try { return JSON.parse(fs.readFileSync(path.join(MASTER_DIR, 'ai_selectors.json'))).grok.chatBox; } catch(e) { return 'textarea:visible, [contenteditable="true"]:visible'; } })();
const randomDelay = (min, max) => new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

(async () => {
    console.log(`\n======================================================`);
    console.log(` 🌌 Grok AI Worker Node [Profile: ${profileName}]`);
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
                        console.log(`[INFO] ✅ Connected! Opening Grok in a new tab...`);
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
                    await page.goto('https://grok.com/', { waitUntil: 'domcontentloaded' });
                    
                    await page.waitForTimeout(5000); 
                    currentState = State.CONVERSATION_READY;
                } catch (err) {
                    console.log(`[ERROR DETAILS] ${err.message}`); 
                    await new Promise(r => setTimeout(r, 5000));
                }
                break;

            case State.CONVERSATION_READY: 
                console.log(`[STATE] 💬 ${currentState}: Handling popups and finding input box...`);
                await page.evaluate(() => {
                    document.querySelectorAll('div[role="dialog"], [class*="cookie"], [class*="banner"]').forEach(e => e.remove());
                });
                
                // 🔴 ফিক্স: লুকানো বক্স ইগনোর করে শুধু Visible বক্সের জন্যই অপেক্ষা করবে
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
                
                // 🔴 ফিক্স: স্ক্রিনের একদম সামনের Visible বক্সে ক্লিক করবে
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
                console.log(`[STATE] 🚀 ${currentState}: Pressing 'Enter' to submit.`);
                initialCopyCount = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('button')).filter(b => 
                        (b.getAttribute('aria-label') || '').toLowerCase().includes('copy') || 
                        (b.title || '').toLowerCase().includes('copy')
                    ).length;
                });

                await page.keyboard.press('Enter');
                currentState = State.GENERATING;
                break;

            case State.GENERATING: 
                console.log(`[STATE] ⚙️  ${currentState}: AI is generating. Monitoring DOM...`);
                try {
                    await page.waitForFunction((initial) => {
                        const current = Array.from(document.querySelectorAll('button')).filter(b => 
                            (b.getAttribute('aria-label') || '').toLowerCase().includes('copy') || 
                            (b.title || '').toLowerCase().includes('copy')
                        ).length;
                        return current > initial;
                    }, initialCopyCount, { timeout: 120000 });

                    console.log(`[INFO] New AI message detected! Checking text stability (waiting for stream to stop)...`);

                    let lastText = "";
                    let stableChecks = 0;
                    
                    while (stableChecks < 2) {
                        await page.waitForTimeout(1500); 
                        
                        const currentText = await page.evaluate(() => {
                            const btns = Array.from(document.querySelectorAll('button')).filter(b => 
                                (b.getAttribute('aria-label') || '').toLowerCase().includes('copy') || 
                                (b.title || '').toLowerCase().includes('copy')
                            );
                            if(btns.length === 0) return "";
                            
                            let container = btns[btns.length - 1].parentElement;
                            for(let i=0; i<4; i++) { if(container.parentElement && container.parentElement.tagName !== 'BODY') container = container.parentElement; }
                            return container.innerText;
                        });

                        if (currentText === lastText && currentText.length > 5) {
                            stableChecks++;
                        } else {
                            stableChecks = 0;
                            lastText = currentText;
                        }
                    }

                    console.log(`[INFO] Generation stream completely finished!`);
                    currentState = State.COMPLETED;
                } catch (e) {
                    console.log(`[ERROR] Generation Phase Error: ${e.message}`);
                    currentState = State.COMPLETED; 
                }
                break;

            case State.COMPLETED:
                console.log(`[STATE] ✅ ${currentState}: AI response finalized.`);
                console.log(`[WAITING] ⏳ Waiting 5 seconds before copying (as requested)...`);
                await page.waitForTimeout(5000); 
                currentState = State.OUTPUT_COPIED;
                break;

            case State.OUTPUT_COPIED: 
                console.log(`[STATE] 📋 Extracting text with Multi-Tier Fallback...`);
                
                try {
                    let extractedText = null;

                    // ==========================================
                    // 🚀 PLAN A: Smart DOM Extractor (Best for Tables/Code)
                    // ==========================================
                    extractedText = await page.evaluate(() => {
                        try {
                            let messages = Array.from(document.querySelectorAll('div[data-message-author-role="assistant"], .prose, .markdown-body, .markdown, model-response, message-content, [data-test-id="model-response"], div[dir="auto"]'));
                            messages = messages.filter(m => !m.closest('[role="dialog"]') && m.innerText.trim().length > 0);
                            
                            if (messages.length > 0) {
                                const lastMessage = messages[messages.length - 1];
                                const clone = lastMessage.cloneNode(true);
                                
                                // Clean garbage
                                clone.querySelectorAll('button, svg, img, [role="button"], span.sr-only, .visually-hidden, a.citation, style, script, footer, details').forEach(el => el.remove());
                                
                                // Format Tables to Markdown
                                clone.querySelectorAll('table').forEach(table => {
                                    const rows = Array.from(table.querySelectorAll('tr'));
                                    let tableText = '\n\n';
                                    rows.forEach((row, index) => {
                                        const cells = Array.from(row.querySelectorAll('th, td'));
                                        const rowText = cells.map(cell => cell.innerText.trim().replace(/\n/g, ' ')).join(' | ');
                                        tableText += '| ' + rowText + ' |\n';
                                        if(index === 0) tableText += '|' + cells.map(() => '---').join('|') + '|\n';
                                    });
                                    tableText += '\n';
                                    table.parentNode.replaceChild(document.createTextNode(tableText), table);
                                });

                                // Format Code Blocks to Markdown
                                clone.querySelectorAll('pre').forEach(pre => {
                                    const code = pre.innerText.trim();
                                    pre.parentNode.replaceChild(document.createTextNode('\n\n```\n' + code + '\n```\n\n'), pre);
                                });

                                // Ensure proper line breaks for paragraphs and lists
                                clone.querySelectorAll('p, h1, h2, h3, h4, li').forEach(el => {
                                    el.parentNode.replaceChild(document.createTextNode(el.innerText.trim() + '\n\n'), el);
                                });

                                return clone.innerText.trim().replace(/\n{3,}/g, '\n\n');
                            }
                            return null;
                        } catch(e) { return null; }
                    });

                    // ==========================================
                    // 🛡️ PLAN B: Native Copy Button & Clipboard
                    // ==========================================
                    if (!extractedText || extractedText.trim() === "") {
                        console.log(`[WARNING] Plan A failed. Attempting Plan B: Native Copy Button...`);
                        const isCopied = await page.evaluate(async () => {
                            const btns = Array.from(document.querySelectorAll('button, div[role="button"]')).filter(b => 
                                (b.getAttribute('aria-label') || '').toLowerCase().includes('copy') || 
                                (b.title || '').toLowerCase().includes('copy') ||
                                (b.className || '').toLowerCase().includes('copy')
                            );
                            // Avoid dialog/popup copy buttons
                            const chatBtns = btns.filter(b => !b.closest('[role="dialog"]') && !b.closest('[class*="banner"]') && !b.closest('footer'));
                            
                            if (chatBtns.length > 0) {
                                chatBtns[chatBtns.length - 1].click();
                                return true;
                            }
                            return false;
                        });

                        if (isCopied) {
                            await page.waitForTimeout(1000); 
                            extractedText = await page.evaluate(async () => {
                                try { return await navigator.clipboard.readText(); } catch (e) { return null; }
                            });
                        }
                    }

                    // ==========================================
                    // 🪂 PLAN C: Ultimate Raw Fallback
                    // ==========================================
                    if (!extractedText || extractedText.trim() === "") {
                        console.log(`[WARNING] Plan B failed. Attempting Plan C: Raw Extraction...`);
                        extractedText = await page.evaluate(() => {
                            const fallbacks = document.querySelectorAll('.prose, .markdown, .markdown-body, div[dir="auto"], div[data-message-author-role="assistant"]');
                            if(fallbacks.length > 0) return fallbacks[fallbacks.length - 1].innerText.trim();
                            return "[ERROR] System could not extract text."; 
                        });
                    }

                    currentOutput = extractedText;

                    // ==========================================
                    // 🔴 Universal Cleanup (Qwen/DeepSeek/Claude/etc)
                    // ==========================================
                    if (currentOutput) {
                        currentOutput = currentOutput.replace(/^Thinking completed.*?[\r\n]+/i, '');
                        currentOutput = currentOutput.replace(/^Thinking.*?[\r\n]+/i, '');
                        currentOutput = currentOutput.replace(/^Claude responded:?\s*/i, ''); 
                        currentOutput = currentOutput.replace(/^Thought for .*?s\s*/i, ''); 
                        currentOutput = currentOutput.replace(/AI-generated content may not be accurate.*/gi, '');
                        currentOutput = currentOutput.trim();
                    }

                } catch (err) { 
                    currentOutput = `[ERROR] All Extraction Plans Failed: ${err.message}`; 
                }

                if (!currentOutput || currentOutput.trim() === "") {
                    currentOutput = "[ERROR] Extracted text was empty.";
                }
                
                currentState = State.OUTPUT_SAVED;
                break;

            case State.OUTPUT_SAVED: 
                console.log(`[STATE] 💾 ${currentState}: Saving to Master Outbox...`);
                
                const outboxData = {
                    task_id: currentTask.task_id,
                    sender: "@grok", 
                    receiver: "@administrator", // 🔴 স্ট্রিক্টলি অ্যাডমিনের কাছে যাবে
                    original_prompt: currentTask.prompt,
                    response: currentOutput,
                    timestamp: new Date().toISOString()
                };

                const outboxFilePath = path.join(OUTBOX_DIR, `outbox_grok_${Date.now()}.json`);
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
        console.log(`[🛑 SHUTDOWN] Closing Grok tab...`);
        
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