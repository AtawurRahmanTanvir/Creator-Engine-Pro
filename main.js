// ==========================================
// FILE: main.js (Integrated Router + Record Switch + Smart Tag Stripper)
// ==========================================

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { fork, spawn } = require('child_process');

// মাস্টার কন্ট্রোলার ফোল্ডারের পাথ
const MASTER_DIR = path.join(__dirname, 'Master_Controller');
if (!fs.existsSync(MASTER_DIR)) fs.mkdirSync(MASTER_DIR, { recursive: true });
const SELECTOR_FILE = path.join(MASTER_DIR, 'ai_selectors.json');

// গিটহাব থেকে লাইভ পাথ আপডেট করার ফাংশন
function fetchRemoteSelectors() {
    const rawUrl = 'https://gist.githubusercontent.com/AtawurRahmanTanvir/ebe8653d9b5f6860dbd2b8d1ae8482c4/raw/ai_selectors.json';

    https.get(rawUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const fetched = JSON.parse(data);
                if (fetched && fetched.chatgpt) {
                    // সফল হলে মাস্টার ফোল্ডারে সেভ করে রাখবে
                    fs.writeFileSync(SELECTOR_FILE, JSON.stringify(fetched, null, 4));
                    console.log("✅ Remote AI Selectors Saved to File!");
                }
            } catch (e) {
                console.log("⚠️ Remote Config Error.");
            }
        });
    }).on('error', (e) => {
        console.log("⚠️ No Internet.");
    });
}

// অ্যাপ চালুর সাথে সাথেই আপডেট চেক করবে
fetchRemoteSelectors();

let mainWindow;
let activeEngines = {}; 

// 🔴 WARM-UP / RECORDING SWITCH
// ডিফল্টভাবে True থাকবে, UI থেকে আমরা এটা অন/অফ করার সুইচ বানাবো
let isRecordingActive = true; 

// ==========================================
// 🔴 STRICT QA ROUTING ARCHITECTURE
// ==========================================
const ALLOWED_ROUTES = {
    '@admin': ['@administrator', '@final', '@chatgpt', '@claude', '@gemini', '@qwen', '@deepseek', '@perplexity', '@grok'],
    '@administrator': ['@final', '@chatgpt', '@claude', '@gemini', '@qwen', '@deepseek', '@perplexity', '@grok'],
    // Final AI হয় আপনাকে (admin) আউটপুট দেবে, নয়তো ভুল ধরিয়ে দিয়ে Administrator কে ফেরত পাঠাবে
    '@final': ['@admin', '@administrator'], 
    // Worker AI রা শুধুই Administrator এর সাথে কথা বলতে পারবে
    '@chatgpt': ['@administrator'],
    '@claude': ['@administrator'],
    '@gemini': ['@administrator'],
    '@qwen': ['@administrator'],
    '@deepseek': ['@administrator'],
    '@perplexity': ['@administrator'],
    '@grok': ['@administrator']
};

// এই ট্যাগগুলোই শুধু মেসেজ থেকে রিমুভ করা হবে (অন্য কোনো @ ট্যাগ কাটবে না)
const SYSTEM_TAGS_REGEX = /@(admin|administrator|final|chatgpt|claude|gemini|qwen|deepseek|perplexity|grok)\b/gi;

function sendToUIConsole(type, text) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ui-console-log', { type, text });
    }
}

// ==========================================
// 🔴 অটো ব্রাউজার ম্যানেজার (Auto Browser Manager)
// ==========================================
let activeBrowsers = {}; 
let basePort = 9222;     

const ENGINE_FILES = {
    'chatgpt': 'AI_Workers/Chatgpt_engine.js', 
    'claude': 'AI_Workers/claude_engine.js',
    'deepseek': 'AI_Workers/deepseek_engine.js',
    'gemini': 'AI_Workers/gemini_engine.js',
    'grok': 'AI_Workers/grok_engine.js',
    'perplexity': 'AI_Workers/perplexity_engine.js',
    'qwen': 'AI_Workers/qwen_engine.js',
    'prompt': 'Core_Systems/administrator_engine.js', 
    'final': 'Core_Systems/Final_engine.js' 
};

function updateActiveWorkers() {
    const masterDir = path.join(__dirname, 'Master_Controller');
    if (!fs.existsSync(masterDir)) fs.mkdirSync(masterDir, { recursive: true });
    fs.writeFileSync(path.join(masterDir, 'active_workers.json'), JSON.stringify(Object.keys(activeEngines), null, 4));
}

function updateActivePorts() {
    const masterDir = path.join(__dirname, 'Master_Controller');
    if (!fs.existsSync(masterDir)) fs.mkdirSync(masterDir, { recursive: true });
    
    let portsData = {};
    for (let acc in activeBrowsers) {
        portsData[acc] = activeBrowsers[acc].port;
    }
    fs.writeFileSync(path.join(masterDir, 'active_ports.json'), JSON.stringify(portsData, null, 4));
}

function ensureBrowserRunning(accountName) {
    if (activeBrowsers[accountName]) {
        activeBrowsers[accountName].users++; 
        return activeBrowsers[accountName].port;
    }

    const port = basePort++;
    const safeAccountName = accountName.replace(/[^a-zA-Z0-9@.-]/g, '_');
    const profilePath = path.join(__dirname, 'Accounts', safeAccountName);
    
    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
    ];
    const chromeExe = chromePaths.find(p => fs.existsSync(p));

    if (!chromeExe) {
        console.log("❌ Error: Chrome not found!");
        sendToUIConsole('error', "Google Chrome was not found on this PC!");
        return null;
    }

    console.log(`🌐 Auto-Launching Chrome Window for [${accountName}] on port ${port}...`);
    sendToUIConsole('progress', `Launching Chrome for account [${accountName}]...`);
    
    const browserProc = spawn(chromeExe, [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profilePath}`,
        '--no-first-run',
        '--no-default-browser-check'
    ]);

    browserProc.on('exit', () => {
        console.log(`⚠️ Chrome Window for [${accountName}] was closed manually!`);
        sendToUIConsole('waiting', `Chrome Window for [${accountName}] was closed!`);
        if (activeBrowsers[accountName]) {
            delete activeBrowsers[accountName]; 
            updateActivePorts();
        }
    });

    activeBrowsers[accountName] = { process: browserProc, port: port, users: 1 };
    updateActivePorts();
    return port;
}

function releaseBrowser(accountName) {
    if (activeBrowsers[accountName]) {
        activeBrowsers[accountName].users--;
        if (activeBrowsers[accountName].users <= 0) {
            console.log(`🛑 No AI using [${accountName}], closing the Chrome Window...`);
            sendToUIConsole('info', `Closing Chrome Window for [${accountName}]...`);
            try { activeBrowsers[accountName].process.kill(); } catch(e){}
            delete activeBrowsers[accountName];
            updateActivePorts();
        }
    }
}

app.on('ready', () => {

    // 🔴 1. STARTUP CLEANUP: পুরনো ইনবক্স/আউটবক্স রিমুভ করা
    const inboxDir = path.join(__dirname, 'Master_Controller', 'Inbox');
    const outboxDir = path.join(__dirname, 'Master_Controller', 'Outbox');
    const finalReportsDir = path.join(__dirname, 'Master_Controller', 'Final_Reports');
    
    [inboxDir, outboxDir].forEach(dir => {
        if (fs.existsSync(dir)) {
            fs.readdirSync(dir).forEach(file => {
                if (file.endsWith('.json')) {
                    try { fs.unlinkSync(path.join(dir, file)); } catch(e){}
                }
            });
        } else {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
    if (!fs.existsSync(finalReportsDir)) fs.mkdirSync(finalReportsDir, { recursive: true });
    console.log("🧹 Startup Cleanup: Old Inbox & Outbox files removed!");

// 🔴 1. CREATE SPLASH SCREEN (ANIMATION WINDOW)
    let splashWindow = new BrowserWindow({
        width: 500, 
        height: 400, 
        transparent: true, // ব্যাকগ্রাউন্ড গ্লাস ইফেক্টের জন্য
        frame: false,      // উপরের বোরিং টাইটেল বার সরাতে
        alwaysOnTop: true, // লোডিং এর সময় সবার উপরে থাকবে
        icon: path.join(__dirname, 'icon.ico')
    });

    splashWindow.loadFile(path.join(__dirname, 'App_UI', 'splash.html'));

    // 🔴 2. LAUNCH MAIN UI (HIDDEN IN BACKGROUND)
    mainWindow = new BrowserWindow({
        width: 1280, height: 800, minWidth: 1024, minHeight: 768,
        title: "Creator Engine Pro", autoHideMenuBar: true,
        show: false, // 🔴 এটা false করা হলো, কারণ আগে স্প্ল্যাশ স্ক্রিন দেখাবো
        icon: path.join(__dirname, 'icon.ico'), 
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });

    mainWindow.loadFile(path.join(__dirname, 'App_UI', 'Dashboard.html'));

    // 🔴 3. SWITCH FROM SPLASH TO MAIN UI AFTER 5 SECONDS
    mainWindow.once('ready-to-show', () => {
        setTimeout(() => {
            splashWindow.close(); // ৫ সেকেন্ড পর স্প্ল্যাশ স্ক্রিন বন্ধ হবে
            mainWindow.show();    // এবং আসল ড্যাশবোর্ড চালু হবে
        }, 5000); 
    });

    ipcMain.on('window-minimize', () => mainWindow.minimize());
    ipcMain.on('window-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
    ipcMain.on('window-close', () => mainWindow.close());

    // 🔴 4. TOGGLE RECORDING SWITCH (WARM-UP MODE)
    ipcMain.on('toggle-recording', (event, state) => {
        isRecordingActive = state;
        const status = isRecordingActive ? 'ON (Active Routing)' : 'OFF (Warm-up Mode)';
        console.log(`🎙️ Recording Switch: ${status}`);
        sendToUIConsole('info', `System Recording: ${status}`);
    });

// 🔴 4. Smart Task Routing (UI থেকে ইনবক্সে মেসেজ পাঠানো)
    ipcMain.on('send-ai-command', (event, data) => {
        const { text, target } = data; 
        
        // 🔴 MAGIC FIX: UI থেকে আসা প্রথম মেসেজ থেকেও ট্যাগ মুছে ফেলা হচ্ছে!
        const SYSTEM_TAGS_REGEX = /@(admin|administrator|final|chatgpt|claude|gemini|qwen|deepseek|perplexity|grok)\b/gi;
        let cleanPrompt = text.replace(SYSTEM_TAGS_REGEX, '').trim();
        if (cleanPrompt === "") cleanPrompt = text; 

        const taskData = {
            task_id: `task_admin_${Date.now()}`, 
            sender: "@admin",
            prompt: cleanPrompt, // 🔴 ক্লিন করা ফ্রেশ টেক্সট ইনবক্সে যাচ্ছে
            timestamp: new Date().toISOString()
        };

        let targetFile = '';
        if (target === 'auto') {
            targetFile = 'administrator_inbox.json'; 
            console.log(`🧠 Task sent to ADMINISTRATOR AI!`);
            sendToUIConsole('sent', `Task sent to Administrator AI.`);
        } else {
            targetFile = `${target}_inbox.json`; 
            console.log(`🎯 Task routed directly to ${target.toUpperCase()}'s Inbox!`);
            sendToUIConsole('sent', `Task routed directly to ${target.toUpperCase()}`);
        }
        
        fs.writeFileSync(path.join(inboxDir, targetFile), JSON.stringify(taskData, null, 4));
    });

    // 🔴 5. এআই ইঞ্জিন কন্ট্রোলার (Start/Stop)
    ipcMain.on('start-engine', (event, data) => {
        let systemId = typeof data === 'string' ? data : data.systemId;
        let accountName = typeof data === 'string' ? 'Select Account' : data.accountName;

        if (!systemId) return;
        systemId = systemId.toLowerCase(); 

        if (accountName && accountName !== 'Select Account') {
            if (typeof WORKERS !== 'undefined' && WORKERS[systemId]) WORKERS[systemId].account = accountName;
            if (typeof SYSTEMS !== 'undefined' && SYSTEMS[systemId]) SYSTEMS[systemId].account = accountName;
        }

        if (activeEngines[systemId]) {
            try { activeEngines[systemId].process.kill(); } catch(e){}
            delete activeEngines[systemId]; 
        }

        const relativePath = ENGINE_FILES[systemId];
        if (!relativePath) return;

        const enginePath = path.join(__dirname, relativePath);
        if (!fs.existsSync(enginePath)) {
            sendToUIConsole('error', `${systemId.toUpperCase()} Engine file not found!`);
            return;
        }

        console.log(`🚀 Starting ${systemId.toUpperCase()} with Profile: [${accountName}]`);
        sendToUIConsole('connect', `Connecting ${systemId.toUpperCase()} on [${accountName}]`);
        
        setTimeout(() => {
            const proc = fork(enginePath, [accountName], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });

            proc.stdout.on('data', (data) => {
                const msg = data.toString().trim();
                console.log(`[${systemId.toUpperCase()}] ${msg}`);
                if(msg.includes('Error')) sendToUIConsole('error', `[${systemId.toUpperCase()}] ${msg}`);
                else if(msg.includes('Finished') || msg.includes('Done')) sendToUIConsole('completed', `[${systemId.toUpperCase()}] ${msg}`);
                else if(msg.includes('Typing') || msg.includes('Generating')) sendToUIConsole('generating', `[${systemId.toUpperCase()}] ${msg}`);
                else sendToUIConsole('info', `[${systemId.toUpperCase()}] ${msg}`);
            });

            proc.stderr.on('data', (data) => {
                sendToUIConsole('error', `[${systemId.toUpperCase()}] ${data.toString().trim()}`);
            });

            proc.on('exit', () => {
                delete activeEngines[systemId];
                updateActiveWorkers();
                sendToUIConsole('info', `${systemId.toUpperCase()} Engine disconnected.`);
            });

            activeEngines[systemId] = { process: proc, account: accountName };
            updateActiveWorkers();
            sendToUIConsole('ready', `${systemId.toUpperCase()} is hooked and ready!`);
        }, 2000); 
    });

    ipcMain.on('stop-engine', (event, systemId) => {
        if (!systemId) return;
        let sysId = typeof systemId === 'string' ? systemId.toLowerCase() : systemId;
        const engineData = activeEngines[sysId];
        
        if (engineData) {
            sendToUIConsole('waiting', `Shutting down ${sysId.toUpperCase()}...`);
            try { engineData.process.send('shutdown'); } catch(e) {}
            setTimeout(() => {
                releaseBrowser(engineData.account);
                try { engineData.process.kill(); } catch(e){}
                delete activeEngines[sysId];
                updateActiveWorkers();
                sendToUIConsole('info', `${sysId.toUpperCase()} Engine offline.`);
            }, 1500);
        } else {
            delete activeEngines[sysId];
            updateActiveWorkers();
        }
    });

    // =======================================================
    // 🔴 6. INTEGRATED ROUTER (The Brain of the QA Loop)
    // =======================================================
    setInterval(() => {
        if (!fs.existsSync(outboxDir)) return;
        
        fs.readdir(outboxDir, (err, files) => {
            if (err) return;
            
            files.forEach(file => {
                if (file.startsWith('outbox_')) {
                    const filePath = path.join(outboxDir, file);
                    try {
                        const rawData = fs.readFileSync(filePath, 'utf8');
                        const data = JSON.parse(rawData);
                        
                        const sender = (data.sender || '').toLowerCase();
                        const text = data.response || data.original_prompt || "";

                        // 🛑 RECORDING SWITCH LOGIC (WARM-UP)
                        if (!isRecordingActive) {
                            console.log(`[WARM-UP] 🛑 Ignored output from ${sender} (Recording is OFF)`);
                            sendToUIConsole('info', `[WARM-UP] Ignored response from ${sender.toUpperCase()}`);
                            fs.unlinkSync(filePath); // জাস্ট ডিলিট করে দেবে, লুপে পাঠাবে না
                            return;
                        }

                        // 🔀 QA ROUTING LOGIC
                        const allTags = text.match(/@\w+/g) || [];
                        if (data.receiver && data.receiver.startsWith('@')) {
                            allTags.unshift(data.receiver.toLowerCase());
                        }

                        let finalTarget = null;
                        const allowedForSender = ALLOWED_ROUTES[sender] || [];

                        // স্ট্রিক্ট চেকিং: প্রথম ভ্যালিড ট্যাগটাই গ্রহণ করবে!
                        for (const tag of allTags) {
                            const cleanTag = tag.toLowerCase();
                            if (allowedForSender.includes(cleanTag)) {
                                finalTarget = cleanTag;
                                break; 
                            }
                        }

                        // 🔴 অ্যান্টি-চালাকি / অটো-রাউটিং (ট্যাগ না দিলেও ঠিক জায়গায় যাবে)
                        if (!finalTarget) {
                            if (sender === '@final') finalTarget = '@admin'; 
                            else if (sender === '@administrator') finalTarget = '@final'; 
                            else if (sender !== '@admin') finalTarget = '@administrator'; 
                            else {
                                fs.unlinkSync(filePath);
                                return;
                            }
                        }

                        console.log(`[ROUTER] 🔀 Validated Route: ${sender} ➔ ${finalTarget}`);

                        // 🔴 UI কে লাইভ চ্যাট ডেটা পাঠানো হচ্ছে (এখানে অরিজিনাল টেক্সটটাই যাবে যাতে আপনি দেখতে পান কে কী ট্যাগ ইউজ করেছে)
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('live-ai-chat', { sender: sender, receiver: finalTarget, text: text });
                        }

                        // 🔴 MAGIC: প্রম্পট থেকে সব সিস্টেম ট্যাগ মুছে ফেলা হচ্ছে, যাতে AI শুধু আসল টেক্সট পায়!
                        let cleanPrompt = text.replace(SYSTEM_TAGS_REGEX, '').trim();
                        // যদি ট্যাগ মোছার পর টেক্সট ফাঁকা হয়ে যায়, তবে অরিজিনালটাই রাখবে
                        if (cleanPrompt === "") cleanPrompt = text; 

                        // 🎯 মেসেজ ডেলিভারি
                        if (finalTarget === '@admin') {
                            console.log(`🎉 Final Output ready for Admin! Sending to UI...`);
                            
                            // ফাইনাল আউটপুটেও ট্যাগ ক্লিন করে পাঠানো হলো
                            data.response = cleanPrompt;

                            if (mainWindow && !mainWindow.isDestroyed()) {
                                mainWindow.webContents.send('final-output-ready', data);
                            }
                            fs.renameSync(filePath, path.join(finalReportsDir, file));
                        } 
                        else {
                            const targetWorker = finalTarget.replace('@', ''); 
                            const targetInbox = path.join(inboxDir, `${targetWorker}_inbox.json`);

                            const newTask = {
                                task_id: data.task_id || `task_${Date.now()}`, 
                                sender: sender, 
                                prompt: cleanPrompt, // 🔴 ক্লিন করা ফ্রেশ প্রম্পটটাই শুধু AI এর ইনবক্সে যাবে
                                timestamp: new Date().toISOString()
                            };

                            fs.writeFileSync(targetInbox, JSON.stringify(newTask, null, 4));
                            fs.unlinkSync(filePath);
                        }
                    } catch (e) {
                        console.log(`[ERROR] Processing file ${file}: ${e.message}`);
                    }
                }
            });
        });
    }, 2000); 

    // Account Managers
    ipcMain.handle('get-existing-accounts', async () => {
        const accPath = path.join(__dirname, 'Accounts');
        if (!fs.existsSync(accPath)) return [];
        return fs.readdirSync(accPath, { withFileTypes: true })
                 .filter(dirent => dirent.isDirectory())
                 .map(dirent => dirent.name);
    });

    ipcMain.on('create-new-account', (event, accountName) => {
        const safeAccountName = accountName.replace(/[^a-zA-Z0-9@.-]/g, '_');
        const profilePath = path.join(__dirname, 'Accounts', safeAccountName);
        if (!fs.existsSync(profilePath)) fs.mkdirSync(profilePath, { recursive: true });
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
        ];
        const chromeExe = chromePaths.find(p => fs.existsSync(p));
        if (chromeExe) {
            spawn(chromeExe, [`--user-data-dir=${profilePath}`, '--no-first-run', '--no-default-browser-check']);
        }
    });
});

// =======================================================
    // 🔴 7. FLOW VIDEO ENGINE CONTROLLER (New)
    // =======================================================
    let flowEngineProcess = null;

    ipcMain.on('start-flow-engine', (event, data) => {
        const { prompts, accountName } = data;
        const enginePath = path.join(__dirname, 'AI_Workers', 'flow_engine.js');

        if (flowEngineProcess) {
            try { flowEngineProcess.kill(); } catch(e){}
        }

        console.log(`🚀 Starting Flow Video Engine with Profile: ${accountName}`);
        flowEngineProcess = fork(enginePath, [accountName], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });

        // ইঞ্জিন থেকে আসা লাইভ কনসোল এবং স্ট্যাটাস আপডেট UI-তে পাঠানো
        flowEngineProcess.on('message', (msg) => {
            if (msg.type === 'console') {
                sendToUIConsole(msg.logType, msg.text); // লাইভ কনসোলে প্রিন্ট হবে
            } else if (msg.type === 'status') {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('flow-status', msg); // প্রগ্রেস বার আপডেট করবে
                }
            }
        });

        // প্রম্পটগুলো দিয়ে ইঞ্জিন স্টার্ট করা
        flowEngineProcess.send({ type: 'start', prompts: prompts });
    });

    ipcMain.on('resume-flow-engine', () => {
        if (flowEngineProcess) flowEngineProcess.send({ type: 'resume' });
    });

    ipcMain.on('stop-flow-engine', () => {
        if (flowEngineProcess) {
            flowEngineProcess.send('shutdown');
            setTimeout(() => { flowEngineProcess = null; }, 1000);
        }
    });

// =======================================================
    // 🔴 8. GEMINI IMAGE ENGINE CONTROLLER (New)
    // =======================================================
    let geminiImageEngineProcess = null;

    ipcMain.on('start-gemini-image-engine', (event, data) => {
        const { prompts, accountName } = data;
        const enginePath = path.join(__dirname, 'AI_Workers', 'gemini_image_engine.js');

        if (geminiImageEngineProcess) {
            try { geminiImageEngineProcess.kill(); } catch(e){}
        }

        console.log(`🚀 Starting Gemini Image Engine with Profile: ${accountName}`);
        geminiImageEngineProcess = fork(enginePath, [accountName], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });

        // ইঞ্জিন থেকে আসা লাইভ কনসোল এবং স্ট্যাটাস আপডেট UI-তে পাঠানো
        geminiImageEngineProcess.on('message', (msg) => {
            if (msg.type === 'console') {
                sendToUIConsole(msg.logType, msg.text); // লাইভ কনসোলে প্রিন্ট হবে
            } else if (msg.type === 'status') {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('gemini-image-status', msg); // প্রগ্রেস বার আপডেট করবে
                }
            }
        });

        // প্রম্পটগুলো দিয়ে ইঞ্জিন স্টার্ট করা
        geminiImageEngineProcess.send({ type: 'start', prompts: prompts });
    });

    ipcMain.on('resume-gemini-image-engine', () => {
        if (geminiImageEngineProcess) geminiImageEngineProcess.send({ type: 'resume' });
    });

    ipcMain.on('stop-gemini-image-engine', () => {
        if (geminiImageEngineProcess) {
            geminiImageEngineProcess.send('shutdown');
            setTimeout(() => { geminiImageEngineProcess = null; }, 1000);
        }
    });

app.on('window-all-closed', () => {
    for (let id in activeEngines) {
        if (activeEngines[id]) {
            try { activeEngines[id].process.send('shutdown'); } catch(e){}
            setTimeout(() => { try { activeEngines[id].process.kill(); } catch(e){} }, 2000);
        }
    }
    setTimeout(() => {
        for (let acc in activeBrowsers) { try { activeBrowsers[acc].process.kill(); } catch(e){} }
        if (process.platform !== 'darwin') app.quit();
    }, 2500);
});