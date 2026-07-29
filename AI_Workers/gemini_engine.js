// ==========================================
// FILE: AI_Workers/gemini_engine.js
// ==========================================

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const profileName = process.argv[2] || 'Normal_Browser';

const MASTER_DIR = path.join(__dirname, '..', 'Master_Controller');
// 🔴 ফিক্সড: ইনবক্সের নাম
const INBOX_FILE = path.join(MASTER_DIR, 'Inbox', 'gemini_inbox.json');
const OUTBOX_DIR = path.join(MASTER_DIR, 'Outbox');

// 🔴 অ্যাকাউন্টের ফোল্ডার পাথ
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
    console.log(` ♊ Gemini Worker Node [Profile: ${profileName}]`);
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
                        console.log(`[INFO] ✅ Connected! Opening Gemini Worker in a new tab...`);
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
                    
                    console.log(`[INFO] Opening Gemini Workspace Tab...`);
                    await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
                    
                    await page.bringToFront(); 
                    console.log(`[INFO] ✅ Gemini Worker hooked successfully!`);
                    
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
                console.log(`[STATE] 📋 Extracting text with Multi-Tier Fallback...`);
                
                try {
                    let extractedText = null;

                    // ==========================================
                    // 🚀 PLAN A: Smart DOM Extractor
                    // ==========================================
                    extractedText = await page.evaluate(() => {
                        try {
                            let messages = Array.from(document.querySelectorAll('div[data-message-author-role="assistant"], .prose, .markdown-body, .markdown, model-response, message-content, [data-test-id="model-response"], div[dir="auto"]'));
                            messages = messages.filter(m => !m.closest('[role="dialog"]') && m.innerText.trim().length > 0);
                            
                            if (messages.length > 0) {
                                const lastMessage = messages[messages.length - 1];
                                const clone = lastMessage.cloneNode(true);
                                
                                clone.querySelectorAll('button, svg, img, [role="button"], span.sr-only, .visually-hidden, a.citation, style, script, footer, details').forEach(el => el.remove());
                                
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

                                clone.querySelectorAll('pre').forEach(pre => {
                                    const code = pre.innerText.trim();
                                    pre.parentNode.replaceChild(document.createTextNode('\n\n```\n' + code + '\n```\n\n'), pre);
                                });

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
                    // 🔴 Universal Cleanup
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
                console.log(`[STATE] 💾 ${currentState}: Pushing to Outbox for Router to process...`);
                
                const outboxData = {
                    task_id: currentTask.task_id,
                    sender: "@gemini", 
                    receiver: "@administrator", // 🔴 স্ট্রিক্টলি অ্যাডমিনের কাছে যাবে
                    original_prompt: currentTask.prompt,
                    response: currentOutput,
                    timestamp: new Date().toISOString()
                };

                const outboxFilePath = path.join(OUTBOX_DIR, `outbox_gemini_${Date.now()}.json`);
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
// 🔴 Graceful Shutdown
// ========================================================
process.on('message', async (msg) => {
    if (msg === 'shutdown') {
        console.log(`[🛑 SHUTDOWN] Closing Gemini Worker tab...`);
        
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