// ==========================================
// FILE: main.js (With Smart Waiting List Queue & Stop Logic)
// ==========================================
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { fork, spawn } = require('child_process');

let autoUpdater;
try {
    autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
    console.log("⚠️ electron-updater not installed. Auto-update disabled.");
}

const MASTER_DIR = path.join(__dirname, 'Master_Controller');
if (!fs.existsSync(MASTER_DIR)) fs.mkdirSync(MASTER_DIR, { recursive: true });
const SELECTOR_FILE = path.join(MASTER_DIR, 'ai_selectors.json');

function fetchRemoteSelectors() {
    const rawUrl = 'https://gist.githubusercontent.com/AtawurRahmanTanvir/ebe8653d9b5f6860dbd2b8d1ae8482c4/raw/ai_selectors.json';

    https.get(rawUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const fetched = JSON.parse(data);
                if (fetched && fetched.chatgpt) {
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

fetchRemoteSelectors();

let mainWindow;
let activeEngines = {}; 
let isRecordingActive = true; 

// 🔴 MAGIC FIX: GLOBAL WAITING LIST (QUEUE)
const messageQueue = {}; 

const ALLOWED_ROUTES = {
    '@admin': ['@administrator', '@final', '@chatgpt', '@claude', '@gemini', '@qwen', '@deepseek', '@perplexity', '@grok'],
    '@administrator': ['@final', '@chatgpt', '@claude', '@gemini', '@qwen', '@deepseek', '@perplexity', '@grok'],
    '@final': ['@admin', '@administrator'], 
    '@chatgpt': ['@administrator'],
    '@claude': ['@administrator'],
    '@gemini': ['@administrator'],
    '@qwen': ['@administrator'],
    '@deepseek': ['@administrator'],
    '@perplexity': ['@administrator'],
    '@grok': ['@administrator']
};

const SYSTEM_TAGS_REGEX = /@(admin|administrator|final|chatgpt|claude|gemini|qwen|deepseek|perplexity|grok)\b/gi;

function sendToUIConsole(type, text, target = 'workspace') {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ui-console-log', { target, type, text });
    }
}

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

    const inboxDir = path.join(__dirname, 'Master_Controller', 'Inbox');
    const outboxDir = path.join(__dirname, 'Master_Controller', 'Outbox');
    const finalReportsDir = path.join(__dirname, 'Master_Controller', 'Final_Reports');
    
    if (autoUpdater) autoUpdater.checkForUpdatesAndNotify();
    
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

    mainWindow = new BrowserWindow({
        width: 1280, height: 800, minWidth: 1024, minHeight: 768,
        title: "Creator Engine Pro", autoHideMenuBar: true,
        show: true, 
        backgroundColor: '#0A0A0C', 
        icon: path.join(__dirname, 'icon.ico'), 
        webPreferences: { 
            nodeIntegration: true, 
            contextIsolation: false,
            sandbox: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'App_UI', 'index.html'));

    ipcMain.on('window-minimize', () => mainWindow.minimize());
    ipcMain.on('window-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
    ipcMain.on('window-close', () => mainWindow.close());

    ipcMain.on('toggle-recording', (event, state) => {
        isRecordingActive = state;
        const status = isRecordingActive ? 'ON (Active Routing)' : 'OFF (Warm-up Mode)';
        console.log(`🎙️ Recording Switch: ${status}`);
        sendToUIConsole('info', `System Recording: ${status}`);
    });

    // 🔴 NEW: Stop All / Clear Queue Event (এটাই তোমার ফাইলে মিসিং ছিল)
    ipcMain.on('clear-queue', () => {
        for(let key in messageQueue) { 
            messageQueue[key] = []; 
        } // Empty all waiting lists
        console.log("🛑 Administrator halted all tasks!");
        sendToUIConsole('error', "All pending operations stopped. Queue cleared.");
    });

    // 🔴 UI থেকে পাঠানো মেসেজ সরাসরি ওয়েটিং লিস্টে (Queue) যাবে
    ipcMain.on('send-ai-command', (event, data) => {
        const { text, target } = data; 
        
        let cleanPrompt = text.replace(SYSTEM_TAGS_REGEX, '').trim();
        if (cleanPrompt === "") cleanPrompt = text; 

        const taskData = {
            task_id: `task_admin_${Date.now()}_${Math.floor(Math.random()*1000)}`, 
            sender: "@admin",
            prompt: cleanPrompt, 
            timestamp: new Date().toISOString()
        };

        const targetWorker = target === 'auto' ? 'administrator' : target;
        
        if (!messageQueue[targetWorker]) messageQueue[targetWorker] = [];
        messageQueue[targetWorker].push(taskData); // মেসেজ লাইনে দাঁড়িয়ে গেলো!

        console.log(`📥 Added task to ${targetWorker.toUpperCase()}'s Waiting List.`);
        sendToUIConsole('sent', `Task queued for ${targetWorker.toUpperCase()}`);
    });

    ipcMain.on('start-engine', (event, data) => {
        let systemId = typeof data === 'string' ? data : data.systemId;
        let accountName = typeof data === 'string' ? 'Select Account' : data.accountName;

        if (!systemId) return;
        systemId = systemId.toLowerCase(); 

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
    // 🔴 6. INTEGRATED ROUTER & WAITING LIST PROCESSOR
    // =======================================================
    setInterval(() => {
        // Step A: Process Outbox
        if (fs.existsSync(outboxDir)) {
            fs.readdirSync(outboxDir).forEach(file => {
                if (file.startsWith('outbox_')) {
                    const filePath = path.join(outboxDir, file);
                    try {
                        const rawData = fs.readFileSync(filePath, 'utf8');
                        const data = JSON.parse(rawData);
                        
                        const sender = (data.sender || '').toLowerCase();
                        const text = data.response || data.original_prompt || "";

                        if (!isRecordingActive) {
                            console.log(`[WARM-UP] 🛑 Ignored output from ${sender} (Recording is OFF)`);
                            sendToUIConsole('info', `[WARM-UP] Ignored response from ${sender.toUpperCase()}`);
                            fs.unlinkSync(filePath); 
                            return;
                        }

                        const allTags = text.match(/@\w+/g) || [];
                        if (data.receiver && data.receiver.startsWith('@')) {
                            allTags.unshift(data.receiver.toLowerCase());
                        }

                        let finalTarget = null;
                        const allowedForSender = ALLOWED_ROUTES[sender] || [];

                        for (const tag of allTags) {
                            const cleanTag = tag.toLowerCase();
                            if (allowedForSender.includes(cleanTag)) {
                                finalTarget = cleanTag;
                                break; 
                            }
                        }

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

                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('live-ai-chat', { sender: sender, receiver: finalTarget, text: text });
                        }

                        let cleanPrompt = text.replace(SYSTEM_TAGS_REGEX, '').trim();
                        if (cleanPrompt === "") cleanPrompt = text; 

                        if (finalTarget === '@admin') {
                            console.log(`🎉 Final Output ready for Admin! Sending to UI...`);
                            data.response = cleanPrompt;

                            if (mainWindow && !mainWindow.isDestroyed()) {
                                mainWindow.webContents.send('final-output-ready', data);
                            }
                            fs.renameSync(filePath, path.join(finalReportsDir, file));
                        } 
                        else {
                            const targetWorker = finalTarget.replace('@', ''); 
                            
                            const newTask = {
                                task_id: data.task_id || `task_${Date.now()}`, 
                                sender: sender, 
                                prompt: cleanPrompt, 
                                timestamp: new Date().toISOString()
                            };

                            // 🔴 AI এর রিপ্লাইগুলো সরাসরি ফাইলে না লিখে ওয়েটিং লিস্টে (Queue) ঢুকিয়ে দেওয়া হচ্ছে!
                            if (!messageQueue[targetWorker]) messageQueue[targetWorker] = [];
                            messageQueue[targetWorker].push(newTask);
                            
                            fs.unlinkSync(filePath); // আউটবক্স থেকে ফাইল ডিলিট
                        }
                    } catch (e) {
                        console.log(`[ERROR] Processing file ${file}: ${e.message}`);
                    }
                }
            });
        }

        // 🔴 Step B: Process Waiting Lists (Queue Manager)
        for (const worker in messageQueue) {
            if (messageQueue[worker].length > 0) {
                const inboxPath = path.join(inboxDir, `${worker}_inbox.json`);
                
                // শুধুমাত্র যদি ইনবক্স ফাঁকা থাকে (AI আগের কাজ শেষ করে ফাইল ডিলিট করে দেয়), তবেই নতুন মেসেজ ঢুকবে!
                if (!fs.existsSync(inboxPath)) {
                    const nextTask = messageQueue[worker].shift(); // ওয়েটিং লিস্ট থেকে প্রথম মেসেজটা নিলাম
                    fs.writeFileSync(inboxPath, JSON.stringify(nextTask, null, 4)); // ইনবক্সে দিয়ে দিলাম
                    console.log(`✅ [QUEUE] Sent waiting task to ${worker.toUpperCase()}'s Inbox! (${messageQueue[worker].length} tasks remaining)`);
                }
            }
        }

    }, 2000); // প্রতি ২ সেকেন্ড পর পর চেক করবে

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

    ipcMain.on('delete-account', (event, accountName) => {
        const safeAccountName = accountName.replace(/[^a-zA-Z0-9@.-]/g, '_');
        const profilePath = path.join(__dirname, 'Accounts', safeAccountName);
        if (fs.existsSync(profilePath)) {
            try {
                fs.rmSync(profilePath, { recursive: true, force: true });
                console.log(`🗑️ Deleted account folder: ${safeAccountName}`);
            } catch (err) {
                console.error("Failed to delete account:", err);
            }
        }
    });

    if (autoUpdater) {
        ipcMain.on('check-for-updates', () => {
            try {
                autoUpdater.checkForUpdates();
            } catch (error) {
                if (mainWindow) mainWindow.webContents.send('update-status', 'Error connecting to server.');
            }
        });

        autoUpdater.on('checking-for-update', () => {
            if (mainWindow) mainWindow.webContents.send('update-status', 'Checking GitHub repository...');
        });
        autoUpdater.on('update-available', (info) => {
            if (mainWindow) mainWindow.webContents.send('update-status', `Update v${info.version} available. Downloading...`);
        });
        autoUpdater.on('update-not-available', (info) => {
            if (mainWindow) mainWindow.webContents.send('update-status', 'You are on the latest version.');
        });
        autoUpdater.on('error', (err) => {
            if (mainWindow) mainWindow.webContents.send('update-status', 'Error checking for updates.');
        });
    }
});

let flowEngineProcess = null;

ipcMain.on('start-flow-engine', (event, data) => {
    const { prompts, accountName } = data;
    const enginePath = path.join(__dirname, 'AI_Workers', 'flow_engine.js');

    if (flowEngineProcess) {
        try { flowEngineProcess.kill(); } catch(e){}
    }

    console.log(`🚀 Starting Flow Video Engine with Profile: ${accountName}`);
    flowEngineProcess = fork(enginePath, [accountName], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });

    flowEngineProcess.on('message', (msg) => {
        if (msg.type === 'console') {
            sendToUIConsole(msg.logType, msg.text, 'flow'); 
        } else if (msg.type === 'status') {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('flow-status', msg); 
            }
        }
    });

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

let geminiImageEngineProcess = null;

ipcMain.on('start-gemini-image-engine', (event, data) => {
    const { prompts, accountName } = data;
    const enginePath = path.join(__dirname, 'AI_Workers', 'gemini_image_engine.js');

    if (geminiImageEngineProcess) {
        try { geminiImageEngineProcess.kill(); } catch(e){}
    }

    console.log(`🚀 Starting Gemini Image Engine with Profile: ${accountName}`);
    geminiImageEngineProcess = fork(enginePath, [accountName], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });

    geminiImageEngineProcess.on('message', (msg) => {
        if (msg.type === 'console') {
            sendToUIConsole(msg.logType, msg.text, 'gemini'); 
        } else if (msg.type === 'status') {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('gemini-image-status', msg); 
            }
        }
    });

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