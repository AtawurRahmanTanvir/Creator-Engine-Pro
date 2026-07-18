var { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // ১. উইন্ডো কন্ট্রোলস (Minimize, Maximize, Close)
    // ==========================================
    const minBtn = document.querySelector('.win-btn[aria-label="Minimize"]');
    const maxBtn = document.querySelector('.win-btn[aria-label="Maximize"]');
    const closeBtn = document.querySelector('.win-btn--close');

    if (minBtn) minBtn.addEventListener('click', () => ipcRenderer.send('window-minimize'));
    if (maxBtn) maxBtn.addEventListener('click', () => ipcRenderer.send('window-maximize'));
    if (closeBtn) closeBtn.addEventListener('click', () => ipcRenderer.send('window-close'));

    // ==========================================
    // 🔴 NEW: Recording Switch (Warm-up Mode)
    // ==========================================
    const recordingSwitch = document.getElementById('recordingSwitch');
    const recordStatusText = document.getElementById('recordStatusText');
    
    if (recordingSwitch) {
        recordingSwitch.addEventListener('click', () => {
            const isCurrentlyOn = recordingSwitch.classList.contains('is-on');
            const newState = !isCurrentlyOn;
            
            if (newState) {
                recordingSwitch.classList.add('is-on');
                recordingSwitch.setAttribute('aria-checked', 'true');
                recordStatusText.textContent = "System Recording: ON";
                recordStatusText.style.color = "var(--text-tertiary)";
            } else {
                recordingSwitch.classList.remove('is-on');
                recordingSwitch.setAttribute('aria-checked', 'false');
                recordStatusText.textContent = "Warm-up Mode (No Record)";
                recordStatusText.style.color = "var(--color-warning)";
            }
            
            // main.js কে সিগন্যাল পাঠানো হচ্ছে
            ipcRenderer.send('toggle-recording', newState);
        });
    }

    // ==========================================
    // 🔴 Target Chip Selection (AI সিলেক্ট করার বাটন লজিক)
    // ==========================================
    const targetChips = Array.from(document.querySelectorAll('.target-chip'));
    const autoChip = document.querySelector('.target-chip[data-target="auto"]');

    if (targetChips.length > 0 && autoChip) {
        targetChips.forEach((chip) => {
            chip.addEventListener('click', () => {
                if (chip.disabled) return; // Qwen বা Grok এর মতো Disabled থাকলে কাজ করবে না
                
                // প্রথমে সব চিপ থেকে সিলেকশন রিমুভ করা
                targetChips.forEach(c => c.classList.remove('is-selected'));
                
                // এরপর যেটাতে ক্লিক করা হয়েছে, শুধু সেটাকে সিলেক্ট করা
                chip.classList.add('is-selected');
            });
        });
    }

    // ==============================================================
    // 🔴 ২. AI Workspace - Prompt Connection (SMART TAG ROUTING)
    // ==============================================================
    const composerInput = document.getElementById('composerInput');
    const composerSend = document.getElementById('composerSend');

    // UI-এর নামের সাথে ব্যাকএন্ডের @tag এর ম্যাপ (Map)
    const TAG_TO_ROUTE = {
        'administrator': '@administrator',
        'chatgpt': '@chatgpt',
        'gemini': '@gemini',
        'claude': '@claude',
        'deepseek': '@deepseek',
        'qwen': '@qwen',
        'perplexity': '@perplexity',
        'grok': '@grok',
        'final': '@final'
    };

    if (composerSend && composerInput) {
        const sendToEngine = () => {
            let promptText = composerInput.value.trim();
            
            if (promptText) {
                // ১. অরিজিনাল চিপ সিলেক্ট করা
                const activeChip = document.querySelector('.target-chip.is-selected');
                
                // ২. 🔴 ফিক্স: আপনার অরিজিনাল target ভ্যালুটা ধরা হলো (যাতে main.js-এর ফাইল পাথ নষ্ট না হয়)
                const targetAI = activeChip ? activeChip.dataset.target : 'auto';

                // ৩. UI থেকে নামটা নিয়ে প্রম্পটের শুরুতে @ ট্যাগ বসানো
                let selectedUIName = activeChip ? activeChip.innerText.trim().toLowerCase() : 'administrator';
                let targetRoute = TAG_TO_ROUTE[selectedUIName] || '@administrator';

                if (!promptText.startsWith('@')) {
                    promptText = `${targetRoute} ${promptText}`;
                }

                console.log(`[UI ROUTER] Sending prompt to ${targetAI} with tag ${targetRoute}`);

                // ৪. 🔴 মাস্টার ফিক্স: target প্যারামিটারে @ ট্যাগ না পাঠিয়ে, অরিজিনাল targetAI পাঠানো হলো! 
                ipcRenderer.send('send-ai-command', { text: promptText, target: targetAI });
                
                composerInput.value = ''; 
            }
        };

        composerSend.addEventListener('click', sendToEngine, true);
        composerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); 
                sendToEngine();
            }
        }, true);
    }

    // ==========================================
    // ৩. অন/অফ সুইচ (Toggle) ইঞ্জিন কন্ট্রোলার
    // ==========================================
    document.querySelectorAll('.ai-switch').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.ai-card');
            if (!card) return;
            
            const systemId = card.dataset.system;

            setTimeout(() => {
                const isActive = btn.classList.contains('is-on');
                let accountName = card.querySelector('.account-name').textContent.trim();

                if (isActive) {
                    if (accountName === 'Select Account' || accountName === '-- Select Account --' || accountName.includes('Select First')) {
                        accountName = 'Normal_Browser'; 
                    }
                    ipcRenderer.send('start-engine', { systemId, accountName });
                    
                } else {
                    ipcRenderer.send('stop-engine', systemId);
                    card.classList.remove('is-active', 'active', 'connected'); 
                    const statusPill = card.querySelector('.status-pill, .status-badge');
                    if (statusPill) {
                        statusPill.textContent = 'Idle';
                        statusPill.classList.remove('connected', 'active', 'is-on');
                    }
                }
            }, 100);
        });
    });

    // ==========================================
    // ৪. Account Manager & Memory Controller
    // ==========================================
    const openAddAccountBtn = document.getElementById('openAddAccountModal');
    const addAccountModal = document.getElementById('addAccountModal');
    const cancelAccountBtn = document.getElementById('cancelAccountBtn');
    const saveAccountBtn = document.getElementById('saveAccountBtn');
    const newAccountInput = document.getElementById('newAccountInput');
    const dynamicAccountList = document.getElementById('dynamicAccountList');

    document.querySelectorAll('.ai-card').forEach(card => {
        const systemId = card.dataset.system;
        const savedAcc = localStorage.getItem(`saved_account_${systemId}`); 
        
        if (savedAcc) {
            const accountNameEl = card.querySelector('.account-name');
            if (accountNameEl) accountNameEl.textContent = savedAcc;

            const accountAvatarEl = card.querySelector('.account-avatar');
            if (accountAvatarEl) accountAvatarEl.textContent = savedAcc.substring(0, 2).toUpperCase();
        }
    });

    function setActiveRootProfile(accountName) {
        const profileNameEl = document.querySelector('.sidebar-profile .profile-name');
        if (profileNameEl) profileNameEl.textContent = accountName; 

        const avatarEl = document.querySelector('.sidebar-profile .avatar');
        if (avatarEl) avatarEl.textContent = accountName.substring(0, 2).toUpperCase();

        localStorage.setItem('activeRootAccount', accountName);
    }

    const savedRootAccount = localStorage.getItem('activeRootAccount');
    if (savedRootAccount) setActiveRootProfile(savedRootAccount);

    async function loadAccountsIntoDropdown() {
        const accounts = await ipcRenderer.invoke('get-existing-accounts');
        
        if (dynamicAccountList) {
            dynamicAccountList.innerHTML = ''; 
            accounts.forEach(acc => {
                const btn = document.createElement('button');
                btn.className = 'popover-item';
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; flex-shrink: 0;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                 <span style="flex-grow:1; text-align:left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${acc}</span>
                                 ${acc === savedRootAccount ? '<span style="font-size:10px; color:#2563eb; font-weight:bold; margin-left: 5px;">Active</span>' : ''}`;
                
                btn.addEventListener('click', () => {
                    setActiveRootProfile(acc);
                    loadAccountsIntoDropdown();
                });
                dynamicAccountList.appendChild(btn);
            });
        }

        document.querySelectorAll('.card-account-list').forEach(listContainer => {
            listContainer.innerHTML = ''; 

            if (accounts.length === 0) {
                listContainer.innerHTML = '<p style="padding: 8px 12px; font-size: 12px; color: #777;">No accounts found.</p>';
                return;
            }

            accounts.forEach(acc => {
                const btn = document.createElement('button');
                btn.className = 'popover-item';
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; width:16px; height:16px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> ${acc}`;
                
                btn.addEventListener('click', (e) => {
                    e.stopPropagation(); 
                    const card = btn.closest('.ai-card');
                    if (!card) return;
                    
                    const systemId = card.dataset.system;
                    
                    const accountNameEl = card.querySelector('.account-name');
                    if (accountNameEl) accountNameEl.textContent = acc;

                    const accountAvatarEl = card.querySelector('.account-avatar');
                    if (accountAvatarEl) accountAvatarEl.textContent = acc.substring(0, 2).toUpperCase();

                    localStorage.setItem(`saved_account_${systemId}`, acc);

                    const popover = btn.closest('.popover');
                    if (popover) popover.classList.remove('open');

                    const isActive = card.querySelector('.ai-switch').classList.contains('is-on');
                    if (isActive) {
                        ipcRenderer.send('stop-engine', systemId); 
                        setTimeout(() => {
                            ipcRenderer.send('start-engine', { systemId, accountName: acc }); 
                        }, 1500); 
                    }
                });
                listContainer.appendChild(btn);
            });
        });
    }

    loadAccountsIntoDropdown();

    // ==========================================
    // ৫. Add Account Modal Controller
    // ==========================================
    if (openAddAccountBtn && addAccountModal) {
        openAddAccountBtn.addEventListener('click', () => {
            addAccountModal.style.display = 'flex';
            newAccountInput.focus();
        });

        cancelAccountBtn.addEventListener('click', () => {
            addAccountModal.style.display = 'none';
            newAccountInput.value = '';
        });

        saveAccountBtn.addEventListener('click', () => {
            const accountName = newAccountInput.value.trim();
            if (accountName !== "") {
                setActiveRootProfile(accountName); 
                ipcRenderer.send('create-new-account', accountName); 
                addAccountModal.style.display = 'none';
                newAccountInput.value = '';
                setTimeout(loadAccountsIntoDropdown, 1000); 
            }
        });
    }

    // ==========================================
    // 🔴 ৬. Real-time Console Logger & Dynamic Stats 
    // ==========================================
    let reportsCount = parseInt(localStorage.getItem('reports_completed')) || 0;
    let systemHealth = 100;

    // ইউনিভার্সাল ফাংশন: যেকোনো HTML স্ট্রাকচারেই কাজ করবে
    function updateStatUI(cardIndex, value) {
        const statCards = document.querySelectorAll('.stat-card');
        if (statCards[cardIndex]) {
            const valEl = statCards[cardIndex].querySelector('.stat-value, h2, h3, [data-count-to]');
            if (valEl) valEl.innerHTML = value;
        }
    }

    // অ্যাপ চালুর সাথে সাথে ফেক ডাটা (412, 99%) মুছে লাইভ ডাটা বসিয়ে দেবে!
    setTimeout(() => {
        updateStatUI(0, "0<span style='font-size:14px; color:#888;'> /5</span>"); // Workflow Stage
        updateStatUI(2, systemHealth + "<span style='font-size:14px; color:#888;'> %</span>"); // System Health
        updateStatUI(3, reportsCount); // Reports Count
    }, 500);

    // লাইভ ওয়ার্কার কাউন্ট
    function updateActiveWorkerStat() {
        const activeSwitches = document.querySelectorAll('.ai-switch.is-on').length;
        updateStatUI(1, activeSwitches);
    }
    setTimeout(updateActiveWorkerStat, 800);
    
    document.addEventListener('click', (e) => {
        if(e.target.closest('.ai-switch')) setTimeout(updateActiveWorkerStat, 300);
    });

    ipcRenderer.on('ui-console-log', (event, data) => {
        // ১. কনসোলে লাইভ লগ প্রিন্ট করা
        if (typeof window.logLine === 'function') {
            window.logLine(data.type, data.text);
        }
        
        // ২. Workflow Stage লাইভ আপডেট করা
        if (data.text.includes('Task sent')) {
            updateStatUI(0, "1<span style='font-size:14px; color:#888;'> /5</span>");
        } else if (data.text.includes('Generating') || data.text.includes('Typing')) {
            updateStatUI(0, "2<span style='font-size:14px; color:#888;'> /5</span>");
        } else if (data.text.includes('Final Output ready')) {
            updateStatUI(0, "3<span style='font-size:14px; color:#888;'> /5</span>");
        }

        // ৩. System Health আপডেট (এরর খেলে হেলথ কমবে)
        if (data.type === 'error') {
            systemHealth = Math.max(0, systemHealth - 1);
            updateStatUI(2, systemHealth + "<span style='font-size:14px; color:#888;'> %</span>");
            
            const healthDelta = document.querySelectorAll('.stat-card')[2]?.querySelector('.stat-delta');
            if(healthDelta) {
                healthDelta.className = 'stat-delta neutral';
                healthDelta.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Attention required`;
                healthDelta.style.color = "var(--color-warning)";
            }
        }
    });

    // ==========================================
    // ৭. Final Output বক্সে ডাটা দেখানো
    // ==========================================
    ipcRenderer.on('final-output-ready', (event, data) => {
        // 🔴 Update Daily Report Count
        reportsCount++;
        localStorage.setItem('reports_completed', reportsCount);
        updateStatUI(3, reportsCount);
        const viewer = document.getElementById('finalOutputViewer');
        const statusPill = document.getElementById('foStatusPill');
        const timeLabel = document.getElementById('foTimestamp');
        const generatedBy = document.getElementById('foGeneratedBy');
        
        if(viewer) {
            viewer.innerHTML = `<div style="white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: var(--text-primary); text-align: left; width: 100%; height: 100%; overflow-y: auto;">${data.response}</div>`;
        }
        
        if(statusPill) {
            statusPill.textContent = 'Report Ready';
            statusPill.className = 'status-pill connected';
        }
        
        if(timeLabel && generatedBy) {
            const now = new Date();
            timeLabel.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            generatedBy.textContent = data.sender.replace('@', '').toUpperCase();
        }
        
        const copyBtn = document.getElementById('foCopyBtn');
        const saveBtn = document.getElementById('foSaveBtn');
        const exportBtn = document.getElementById('foExportBtn');
        if(copyBtn) copyBtn.disabled = false;
        if(saveBtn) saveBtn.disabled = false;
        if(exportBtn) exportBtn.disabled = false;
    });

    // ==========================================
    // ৮. Live AI Chatter বক্সে ডাটা দেখানো
    // ==========================================
    ipcRenderer.on('live-ai-chat', (event, data) => {
        const chatViewer = document.getElementById('liveChatterViewer');
        const placeholder = document.getElementById('liveChatPlaceholder');
        
        if (placeholder) placeholder.style.display = 'none'; // প্লেসহোল্ডার হাইড করা
        
        if (chatViewer) {
            const isFromAdmin = data.sender.toLowerCase().includes('admin');
            
            // চ্যাট বাবল ডিজাইন
            const bubble = document.createElement('div');
            bubble.style.display = 'flex';
            bubble.style.flexDirection = 'column';
            bubble.style.alignItems = isFromAdmin ? 'flex-end' : 'flex-start';
            bubble.style.marginBottom = '10px';
            
            const header = document.createElement('div');
            header.style.fontSize = '10px';
            header.style.fontWeight = 'bold';
            header.style.color = isFromAdmin ? 'var(--accent-primary)' : 'var(--text-secondary)';
            header.style.marginBottom = '4px';
            header.style.textTransform = 'uppercase';
            header.innerText = `${data.sender} ➔ ${data.receiver}`;
            
            const messageBox = document.createElement('div');
            messageBox.style.background = isFromAdmin ? 'rgba(201,154,91,0.1)' : 'var(--bg-elevated)';
            messageBox.style.border = `1px solid ${isFromAdmin ? 'var(--accent-primary)' : 'var(--border-default)'}`;
            messageBox.style.padding = '8px 12px';
            messageBox.style.borderRadius = '8px';
            messageBox.style.color = 'var(--text-primary)';
            messageBox.style.fontSize = '12px';
            messageBox.style.maxWidth = '85%';
            messageBox.style.wordWrap = 'break-word';
            messageBox.innerText = data.text.length > 200 ? data.text.substring(0, 200) + '...' : data.text; // অতিরিক্ত বড় হলে কেটে দেখাবে
            
            bubble.appendChild(header);
            bubble.appendChild(messageBox);
            chatViewer.appendChild(bubble);
            
            // অটো স্ক্রল ডাউন
            chatViewer.scrollTop = chatViewer.scrollHeight;
        }
    });

    // ==========================================
    // 🔴 9. MODALS & UI BUTTONS (Settings, Help, Notifications)
    // ==========================================
    // এই লজিকটি এমনভাবে লেখা হয়েছে যাতে পুরোনো কোনো 'alert' কাজ করতে না পারে।
    
    const btnSettings = document.getElementById('btnSettings');
    const btnHelp = document.getElementById('btnHelp');
    const btnNotification = document.getElementById('btnNotification');
    const btnSearch = document.getElementById('btnSearch');

    if(btnSettings) {
        // আগের সব ইভেন্ট ওভাররাইট করার জন্য
        btnSettings.onclick = (e) => {
            e.preventDefault();
            const modal = document.getElementById('settingsModal');
            if(modal) modal.style.display = 'flex';
        };
    }

    if(btnHelp) {
        btnHelp.onclick = (e) => {
            e.preventDefault();
            const modal = document.getElementById('helpModal');
            if(modal) modal.style.display = 'flex';
        };
    }

    if(btnNotification) {
        // নোটিফিকেশনে ক্লিক করলে মোডাল ওপেন হবে (আর কোনো alert আসবে না)
        btnNotification.onclick = (e) => {
            e.preventDefault();
            const modal = document.getElementById('notificationModal');
            if(modal) modal.style.display = 'flex';
        };
    }

    if(btnSearch) {
        btnSearch.onclick = (e) => {
            e.preventDefault();
            const searchInput = btnSearch.querySelector('input') || document.querySelector('input[placeholder*="Search"]');
            if (searchInput) searchInput.focus();
        };
    }

    // কীবোর্ড শর্টকাট (Cmd/Ctrl + K)
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            const searchInput = document.querySelector('input[placeholder*="Search"], input[placeholder*="jump to"]');
            if (searchInput) searchInput.focus();
        }
    });

    // HTML-এ ID না থাকলেও যেন কাজ করে, তার জন্য ফলব্যাক লজিক:
    document.body.addEventListener('click', (e) => {
        const text = e.target.textContent || '';
        
        // Settings 
        if (text.includes('Settings') && !e.target.closest('#settingsModal')) {
            const modal = document.getElementById('settingsModal');
            if (modal) modal.style.display = 'flex';
        }
        
        // Help
        if (text.includes('Help') && !e.target.closest('#helpModal')) {
            const modal = document.getElementById('helpModal');
            if (modal) modal.style.display = 'flex';
        }
    });

});
// ==============================================================
// 🔴 10 & 11. DASHBOARD ENGINE & REMEMBER ALL 9 AI SWITCH STATES
// ==============================================================
document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // 11. RESTORE SWITCH STATES (All 9 systems)
    // ==========================================
    setTimeout(() => {
        document.querySelectorAll('.ai-card').forEach(card => {
            const systemId = card.dataset.system; // এটা ৯টা কার্ডেরই আলাদা আইডি ধরবে (যেমন: prompt, final)
            const switchBtn = card.querySelector('.ai-switch');
            
            if (systemId && switchBtn) {
                // মেমোরি থেকে চেক করবে এই আইডিটা অন নাকি অফ ছিল
                const savedState = localStorage.getItem(`ai_state_${systemId}`);
                
                if (savedState) {
                    const shouldBeOn = (savedState === 'on');
                    const isCurrentlyOn = switchBtn.classList.contains('is-on');

                    // যদি বর্তমান অবস্থার সাথে মেমোরির অবস্থা না মেলে, তবে আপডেট করবে
                    if (isCurrentlyOn !== shouldBeOn) {
                        if (typeof setWorkerEnabled === 'function') {
                            if (systemId === 'prompt' || systemId === 'final') {
                                if(typeof setInfraEnabled === 'function') setInfraEnabled(systemId, shouldBeOn);
                            } else {
                                setWorkerEnabled(systemId, shouldBeOn);
                            }
                        } else {
                            if (shouldBeOn) {
                                switchBtn.classList.add('is-on');
                                switchBtn.setAttribute('aria-checked', 'true');
                                card.classList.add('is-active');
                            } else {
                                switchBtn.classList.remove('is-on');
                                switchBtn.setAttribute('aria-checked', 'false');
                                card.classList.remove('is-active', 'active', 'connected');
                            }
                        }
                    }
                }
            }
        });
    }, 300);

    // ==========================================
    // 10. DASHBOARD DYNAMIC DATA
    // ==========================================
    const isDashboard = document.querySelector('.page-title')?.textContent.includes('Dashboard');

    if (!localStorage.getItem('dash_sessions')) localStorage.setItem('dash_sessions', '12');
    if (!localStorage.getItem('dash_images')) localStorage.setItem('dash_images', '1204');
    if (!localStorage.getItem('dash_videos')) localStorage.setItem('dash_videos', '342');
    if (!localStorage.getItem('dash_workflows')) localStorage.setItem('dash_workflows', '5');

    let activities = JSON.parse(localStorage.getItem('dash_activities')) || [
        { sys: 'Claude', color: 'var(--ai-claude)', text: 'Summarized Q3 report draft', time: '12 min ago' },
        { sys: 'Gemini', color: 'var(--ai-gemini)', text: 'Generated 4 product images', time: '48 min ago' },
        { sys: 'Perplexity', color: 'var(--ai-perplexity)', text: 'Researched competitor pricing', time: '1 hr ago' },
        { sys: 'DeepSeek', color: 'var(--ai-deepseek)', text: 'Refactored authentication flow', time: '3 hr ago' },
        { sys: 'Grok', color: 'var(--ai-grok)', text: 'Drafted social copy variations', time: '5 hr ago' }
    ];

    let statuses = JSON.parse(localStorage.getItem('dash_statuses')) || {
        'ChatGPT': 'Connected', 'Gemini': 'Connected', 'Claude': 'Connected',
        'DeepSeek': 'Connected', 'Qwen': 'Idle', 'Perplexity': 'Connected', 'Grok': 'Idle'
    };

    if (isDashboard) {
        const statValues = document.querySelectorAll('.stats-grid .stat-value');
        if (statValues.length >= 4) {
            statValues[0].removeAttribute('data-count-to');
            statValues[1].removeAttribute('data-count-to');
            statValues[2].removeAttribute('data-count-to');
            statValues[3].removeAttribute('data-count-to');
            statValues[0].innerHTML = localStorage.getItem('dash_sessions');
            statValues[1].innerHTML = localStorage.getItem('dash_images');
            statValues[2].innerHTML = localStorage.getItem('dash_videos');
            statValues[3].innerHTML = localStorage.getItem('dash_workflows');
        }

        const activityPanel = document.querySelectorAll('.lower-grid .list-panel')[0];
        if (activityPanel) {
            activityPanel.innerHTML = ''; 
            activities.forEach(act => {
                activityPanel.innerHTML += `
                    <div class="activity-row material-react whisper">
                        <span class="system-dot" style="background: ${act.color};"></span>
                        <div class="activity-body">
                            <div class="activity-system" style="color: ${act.color};">${act.sys}</div>
                            <div class="activity-text">${act.text}</div>
                        </div>
                        <span class="activity-time">${act.time}</span>
                    </div>
                `;
            });
        }

        const statusPanel = document.querySelectorAll('.lower-grid .list-panel')[1];
        if (statusPanel) {
            statusPanel.innerHTML = ''; 
            const sysColors = {
                'ChatGPT': 'var(--ai-chatgpt)', 'Gemini': 'var(--ai-gemini)', 'Claude': 'var(--ai-claude)',
                'DeepSeek': 'var(--ai-deepseek)', 'Qwen': 'var(--ai-qwen)', 'Perplexity': 'var(--ai-perplexity)', 'Grok': 'var(--ai-grok)'
            };
            
            Object.keys(statuses).forEach((sysName, index) => {
                const status = statuses[sysName];
                const isConnected = status === 'Connected';
                const pillClass = isConnected ? 'connected' : 'idle';
                const dotClass = isConnected ? 'live' : '';
                const delay = isConnected ? `animation-delay: ${index * 0.6}s;` : '';

                statusPanel.innerHTML += `
                    <div class="system-row material-react whisper">
                        <span class="system-dot ${dotClass}" style="background: ${sysColors[sysName]}; ${delay}"></span>
                        <span class="system-name">${sysName}</span>
                        <span class="status-pill ${pillClass}">${status}</span>
                    </div>
                `;
            });
        }
    }

    function addActivity(sys, color, text, time) {
        let acts = JSON.parse(localStorage.getItem('dash_activities')) || activities;
        acts.unshift({ sys, color, text, time });
        if (acts.length > 5) acts.pop(); 
        localStorage.setItem('dash_activities', JSON.stringify(acts));
    }

    if (typeof ipcRenderer !== 'undefined') {
        ipcRenderer.on('gemini-image-status', (event, msg) => {
            if (msg.state === 'done') {
                let currentImgs = parseInt(localStorage.getItem('dash_images') || 0);
                localStorage.setItem('dash_images', currentImgs + 1);
                addActivity('Gemini', 'var(--ai-gemini)', 'Generated new image sequence', 'Just now');
            }
        });

        ipcRenderer.on('flow-status', (event, msg) => {
            if (msg.state === 'done') {
                let currentVids = parseInt(localStorage.getItem('dash_videos') || 0);
                localStorage.setItem('dash_videos', currentVids + 1);
                addActivity('ChatGPT', 'var(--ai-chatgpt)', 'Processed new Flow video prompt', 'Just now');
            }
        });

        ipcRenderer.on('final-output-ready', (event, msg) => {
            let currentWorkflows = parseInt(localStorage.getItem('dash_workflows') || 0);
            localStorage.setItem('dash_workflows', currentWorkflows + 1);
            
            let sender = msg.sender ? msg.sender.replace('@', '') : 'System';
            let formattedSender = sender.charAt(0).toUpperCase() + sender.slice(1);
            let sysColors = {
                'Chatgpt': 'var(--ai-chatgpt)', 'Gemini': 'var(--ai-gemini)', 'Claude': 'var(--ai-claude)',
                'Deepseek': 'var(--ai-deepseek)', 'Qwen': 'var(--ai-qwen)', 'Perplexity': 'var(--ai-perplexity)', 'Grok': 'var(--ai-grok)'
            };
            let color = sysColors[formattedSender] || 'var(--color-success)';
            addActivity(formattedSender, color, 'Completed automated workflow task', 'Just now');
        });
    }

    // 🔴 SAVE STATE ON CLICK (সবগুলো ৯টা কার্ডের ডাটা ধরবে)
    document.body.addEventListener('click', (e) => {
        const switchBtn = e.target.closest('.ai-switch');
        if(switchBtn) {
            const card = switchBtn.closest('.ai-card');
            if(card) {
                const systemId = card.dataset.system; // যেমন 'prompt', 'final', 'chatgpt'
                const sysNameEl = card.querySelector('.ai-card-name');
                
                setTimeout(() => {
                    const isOn = switchBtn.classList.contains('is-on');
                    
                    // 🔴 ৯টা সিস্টেমের প্রত্যেকটার জন্য আলাদা মেমোরি সেভ করবে
                    if (systemId) {
                        localStorage.setItem(`ai_state_${systemId}`, isOn ? 'on' : 'off');
                    }

                    // ড্যাশবোর্ডের সিস্টেম স্ট্যাটাসের জন্য (শুধু ৭টা মেইন ওয়ার্কারের নাম থাকলে)
                    if (sysNameEl) {
                        const sysName = sysNameEl.textContent.trim();
                        let currentStatuses = JSON.parse(localStorage.getItem('dash_statuses')) || statuses;
                        if (currentStatuses[sysName] !== undefined) {
                            currentStatuses[sysName] = isOn ? 'Connected' : 'Idle';
                            localStorage.setItem('dash_statuses', JSON.stringify(currentStatuses));
                            addActivity('System', 'var(--text-tertiary)', `${sysName} module ${isOn ? 'connected' : 'disconnected'}`, 'Just now');
                        }
                    }
                }, 100);
            }
        }
    });
});