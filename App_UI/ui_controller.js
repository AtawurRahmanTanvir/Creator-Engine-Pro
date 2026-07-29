// ==========================================
// ১. ELECTRON SAFE LOADER (CRASH PROOF)
// ==========================================
let ipcRenderer = null;
try {
    if (typeof require !== 'undefined') {
        ipcRenderer = require('electron').ipcRenderer;
    } else {
        console.error("⚠️ WARNING: require() is blocked by Electron Security!");
    }
} catch (e) {
    console.error(e);
}

// ==========================================
// ২. GLOBAL SPA ROUTER & UTILS 
// ==========================================
window.switchPage = function (pageId, navElement, fallbackTitle) {
    document.querySelectorAll('.app-page').forEach(page => {
        page.style.display = 'none';
        page.classList.remove('active-page');
    });

    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.style.display = 'block';
        void targetPage.offsetWidth;
        targetPage.classList.add('active-page');
    }

    document.querySelectorAll('.sidebar-nav .nav-item').forEach(nav => nav.classList.remove('nav-item--active'));

    let title = fallbackTitle || "Dashboard";
    if (navElement) {
        navElement.classList.add('nav-item--active');
        const label = navElement.querySelector('.nav-label');
        if (label) title = label.textContent;
    } else {
        // আগের কোড:
        // const mapping = { 'page-dashboard': 0, 'page-gemini': 1, 'page-flow': 2, 'page-workspace': 3 };

        // নতুন কোড:
        const mapping = { 'page-dashboard': 0, 'page-gemini': 1, 'page-flow': 2, 'page-media-studio': 3, 'page-workspace': 4 };
        const items = document.querySelectorAll('.sidebar-nav .nav-item');
        if (items[mapping[pageId]]) {
            items[mapping[pageId]].classList.add('nav-item--active');
            title = items[mapping[pageId]].querySelector('.nav-label').textContent;
        }
    }

    const topbarTitle = document.getElementById('topbar-page-title');
    if (topbarTitle) topbarTitle.textContent = title;

    if (typeof window.runCountUp === 'function') window.runCountUp();
};

const TAG_LABELS = { connect: 'CONNECT', ready: 'READY', loaded: 'LOADED', sent: 'SENT', generating: 'RUNNING', completed: 'DONE', waiting: 'WAIT', progress: 'SYNC', info: 'INFO', error: 'ERROR' };

function nowStamp(offsetMs) {
    const d = new Date(Date.now() - (offsetMs || 0));
    return d.toTimeString().slice(0, 8);
}

function createConsoleLogger(panelId) {
    return function (type, text, timeOverride) {
        const panel = document.getElementById(panelId);
        if (!panel) return;
        const row = document.createElement('div');
        row.className = 'console-line';
        const tag = TAG_LABELS[type] || type.toUpperCase();
        row.innerHTML = `<span class="console-time">${timeOverride || nowStamp()}</span><span class="console-tag ${type}">${tag}</span><span class="console-text">${text}</span>`;
        panel.appendChild(row);
        panel.scrollTop = panel.scrollHeight;
        while (panel.children.length > 60) panel.removeChild(panel.firstChild);
    }
}

window.logLine = createConsoleLogger('workspace-consolePanel');
window.geminiLogLine = createConsoleLogger('gemini-consolePanel');
window.flowLogLine = createConsoleLogger('flow-consolePanel');

// ==========================================
// ২.৫ LIVE DASHBOARD CONTROLLER
// ==========================================
window.LiveStats = { sessions: 0, images: 0, videos: 0, workflows: 0 };

window.updateDashboardStat = function (statName, value, deltaText, deltaClass) {
    const el = document.getElementById(`dash-stat-${statName}`);
    const deltaEl = document.getElementById(`dash-delta-${statName}`);
    if (el) { el.dataset.countTo = value; el.textContent = value; }
    if (deltaEl && deltaText) { deltaEl.textContent = deltaText; if (deltaClass) deltaEl.className = `stat-delta ${deltaClass}`; }
};

window.addRecentActivity = function (sysName, text, colorVar) {
    const list = document.getElementById('dash-activity-list');
    if (!list) return;
    const empty = list.querySelector('.popover-empty');
    if (empty) empty.remove();
    const row = document.createElement('div');
    row.className = 'activity-row material-react whisper';
    row.innerHTML = `<span class="system-dot" style="background: var(--${colorVar});"></span><div class="activity-body"><div class="activity-system" style="color: var(--${colorVar});">${sysName}</div><div class="activity-text">${text.replace(/<[^>]*>?/gm, '')}</div></div><span class="activity-time">${nowStamp()}</span>`;
    list.prepend(row);
    while (list.children.length > 8) list.removeChild(list.lastChild);
};

window.updateDashboardSystemStatus = function (id, isConnected) {
    const row = document.getElementById(`dash-status-${id}`);
    if (!row) return;
    const dot = row.querySelector('.system-dot');
    const pill = row.querySelector('.status-pill');
    if (isConnected) {
        dot.classList.add('live'); pill.textContent = 'Connected'; pill.className = 'status-pill connected';
    } else {
        dot.classList.remove('live'); pill.textContent = 'Idle'; pill.className = 'status-pill idle';
    }
    const activeCount = document.querySelectorAll('#page-dashboard .status-pill.connected').length;
    window.updateDashboardStat('sessions', activeCount, activeCount > 0 ? `${activeCount} Systems Online` : 'All Offline', activeCount > 0 ? 'positive' : 'neutral');
};

// ==========================================
// ৩. DOM INITIALIZATION (Buttons & Modals)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 🔴 MAGIC FIX: Notification Logic (100% Electron Safe, No Duplicates)
    // ==========================================
    const notifBadge = document.getElementById('mainNotifBadge');

    function updateNotifBadge() {
        const unreadCount = document.querySelectorAll('.notif-item.unread').length;
        if (notifBadge) notifBadge.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    const notifItems = document.querySelectorAll('.notif-item');
    notifItems.forEach(item => {
        item.removeAttribute('onclick');

        const preview = item.querySelector('.notif-preview');
        const fullBody = item.querySelector('.notif-full-body');

        if (fullBody) {
            fullBody.style.maxHeight = '0px';
            fullBody.style.overflow = 'hidden';
            fullBody.style.opacity = '0';
            fullBody.style.marginTop = '0px';
            fullBody.style.paddingTop = '0px';
            fullBody.style.transition = 'all 0.4s ease';
        }

        item.addEventListener('click', function (e) {
            e.stopPropagation();
            const isExpanded = this.classList.contains('expanded');

            if (isExpanded) {
                this.classList.remove('expanded');
                if (preview) preview.style.display = 'block';
                if (fullBody) {
                    fullBody.style.maxHeight = '0px';
                    fullBody.style.opacity = '0';
                    fullBody.style.marginTop = '0px';
                    fullBody.style.paddingTop = '0px';
                    fullBody.style.borderTop = 'none';
                }
            } else {
                this.classList.add('expanded');
                if (preview) preview.style.display = 'none';
                if (fullBody) {
                    fullBody.style.maxHeight = '500px';
                    fullBody.style.opacity = '1';
                    fullBody.style.marginTop = '10px';
                    fullBody.style.paddingTop = '10px';
                    fullBody.style.borderTop = '1px solid rgba(255, 255, 255, 0.05)';
                }
            }

            if (this.classList.contains('unread')) {
                this.classList.replace('unread', 'read');
                this.style.background = 'transparent';
                const dot = this.querySelector('.notif-unread-dot');
                if (dot) {
                    dot.style.opacity = '0';
                    dot.style.transform = 'scale(0)';
                }
                updateNotifBadge();
            }
        });
    });

    const markAllBtn = document.getElementById('markAllReadBtn');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.notif-item.unread').forEach(item => {
                item.classList.replace('unread', 'read');
                item.style.background = 'transparent';
                const dot = item.querySelector('.notif-unread-dot');
                if (dot) {
                    dot.style.opacity = '0';
                    dot.style.transform = 'scale(0)';
                }
            });
            updateNotifBadge();
        });
    }

    updateNotifBadge();
    // ==========================================


    const hour = new Date().getHours();
    const gEl = document.getElementById('greeting');
    if (gEl) gEl.textContent = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';

    const minBtn = document.querySelector('.win-btn[aria-label="Minimize"]');
    const maxBtn = document.querySelector('.win-btn[aria-label="Maximize"]');
    const closeBtn = document.querySelector('.win-btn--close');
    if (minBtn) minBtn.addEventListener('click', () => ipcRenderer && ipcRenderer.send('window-minimize'));
    if (maxBtn) maxBtn.addEventListener('click', () => ipcRenderer && ipcRenderer.send('window-maximize'));
    if (closeBtn) closeBtn.addEventListener('click', () => ipcRenderer && ipcRenderer.send('window-close'));

    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('collapseBtn');
    if (collapseBtn) collapseBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));

    document.querySelectorAll('[data-popover-target]').forEach((btn) => {
        const pop = document.getElementById(btn.dataset.popoverTarget);
        if (pop) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (btn.disabled) return;
                document.querySelectorAll('.popover').forEach((p) => { if (p !== pop) p.classList.remove('open'); });
                pop.classList.toggle('open');
            });
        }
    });

    const wire = (btnId, popId) => {
        const btn = document.getElementById(btnId);
        const pop = document.getElementById(popId);
        if (!btn || !pop) return;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.popover').forEach(p => { if (p !== pop) p.classList.remove('open'); });
            pop.classList.toggle('open');
        });
    };
    wire('notifBtn', 'notifPopover');
    wire('profileBtn', 'profilePopover');

    document.body.addEventListener('click', (e) => {
        const btnSettings = e.target.closest('#btnSettings');
        if (btnSettings) {
            const m = document.getElementById('settingsModal');
            if (m) m.style.display = 'flex';
            document.querySelectorAll('.popover').forEach(p => p.classList.remove('open'));
        }

        const btnHelp = e.target.closest('#btnHelp');
        if (btnHelp) {
            const m = document.getElementById('helpModal');
            if (m) m.style.display = 'flex';
            document.querySelectorAll('.popover').forEach(p => p.classList.remove('open'));
        }

        const btnClose = e.target.closest('button[onclick*="style.display=\'none\'"]');
        if (btnClose) {
            const modal = btnClose.closest('div[id$="Modal"]');
            if (modal) modal.style.display = 'none';
        }

        if (!e.target.closest('.popover') && !e.target.closest('[data-popover-target]') && !e.target.closest('#notifBtn') && !e.target.closest('#profileBtn')) {
            document.querySelectorAll('.popover').forEach(p => p.classList.remove('open'));
        }
    });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.popover').forEach((p) => p.classList.remove('open')); });

    const foCopyBtn = document.getElementById('foCopyBtn');
    if (foCopyBtn) {
        foCopyBtn.addEventListener('click', () => {
            const viewerContent = document.querySelector('#finalOutputViewer div');
            if (viewerContent && viewerContent.innerText) {
                navigator.clipboard.writeText(viewerContent.innerText).then(() => {
                    const originalHtml = foCopyBtn.innerHTML;
                    foCopyBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Copied!</span>`;
                    foCopyBtn.style.color = "var(--color-success)";
                    setTimeout(() => { foCopyBtn.innerHTML = originalHtml; foCopyBtn.style.color = ""; }, 2000);
                });
            }
        });
    }

    // ==========================================
    // 🔴 MAGIC FIX: GitHub Version History Fetcher (100% Secure & Tokenless)
    // ==========================================
    const btnVersionHistory = document.getElementById('btnVersionHistory');
    const versionHistoryPanel = document.getElementById('versionHistoryPanel');
    const versionListContent = document.getElementById('versionListContent');

    if (btnVersionHistory && versionHistoryPanel && versionListContent) {
        btnVersionHistory.addEventListener('click', async () => {
            // প্যানেল ওপেন/ক্লোজ টগল করা
            if (versionHistoryPanel.style.display === 'block') {
                versionHistoryPanel.style.display = 'none';
                return;
            }

            versionHistoryPanel.style.display = 'block';
            versionListContent.innerHTML = '<div style="text-align: center; color: var(--text-tertiary); font-size: 12px; padding: 10px;">Connecting to GitHub Engine...</div>';

            try {
                // 🔴 PRO TIP: পাবলিক রিপোর জন্য কোনো টোকেন লাগে না! সরাসরি API কল।
                const repoUrl = 'https://api.github.com/repos/AtawurRahmanTanvir/Creator-Engine-Pro/releases';

                const response = await fetch(repoUrl, {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (!response.ok) {
                    if (response.status === 403) throw new Error('API Rate Limit Exceeded. Try again later.');
                    throw new Error('Failed to fetch from GitHub');
                }

                const releases = await response.json();

                versionListContent.innerHTML = '';

                if (releases.length === 0) {
                    versionListContent.innerHTML = '<div style="text-align: center; color: var(--text-tertiary); font-size: 12px; padding: 10px;">No previous versions found.</div>';
                    return;
                }

                // গিটহাব থেকে পাওয়া ডেটা দিয়ে সুন্দর করে লিস্ট তৈরি করা
                releases.forEach((release, index) => {
                    const isLatest = index === 0; // প্রথম আইটেমটাই সবসময় Latest
                    const date = new Date(release.published_at).toLocaleDateString();

                    const versionBox = document.createElement('div');
                    versionBox.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);';

                    versionBox.innerHTML = `
                        <div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 13px; font-weight: 600; color: #fff;">${release.tag_name}</span>
                                ${isLatest ? `<span style="font-size: 9px; background: rgba(0, 198, 255, 0.15); color: #00c6ff; padding: 2px 6px; border-radius: 10px; border: 1px solid rgba(0, 198, 255, 0.3);">Current</span>` : ''}
                            </div>
                            <div style="font-size: 11px; color: var(--text-tertiary); margin-top: 4px;">Published: ${date}</div>
                        </div>
                        <button class="switch-version-btn" data-version="${release.tag_name}" style="background: ${isLatest ? 'transparent' : 'rgba(201, 154, 91, 0.1)'}; border: 1px solid ${isLatest ? '#444' : 'rgba(201, 154, 91, 0.3)'}; color: ${isLatest ? '#888' : '#C99A5B'}; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: ${isLatest ? 'default' : 'pointer'}; transition: 0.2s;">
                            ${isLatest ? 'Active' : 'Switch'}
                        </button>
                    `;
                    versionListContent.appendChild(versionBox);
                });

                // Switch বাটনের ক্লিক ইভেন্ট
                document.querySelectorAll('.switch-version-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const ver = e.target.getAttribute('data-version');
                        if (e.target.textContent.trim() !== 'Active') {
                            alert(`Rollback Engine Initialized.\n\nTarget: ${ver}\n\nDowngrade request sent to Main Process. (Feature locked in current build)`);
                        }
                    });
                });

            } catch (error) {
                versionListContent.innerHTML = `<div style="text-align: center; color: var(--color-error); font-size: 12px; padding: 10px;">Connection Error: ${error.message}</div>`;
            }
        });
    }

    // ==========================================
    // ৪. ANIMATIONS (CountUp & Hover Effects)
    // ==========================================
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function cubicBezier(x1, y1, x2, y2) {
        function bx(t) { return 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t; }
        function by(t) { return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t; }
        return function (x) {
            let t = x;
            for (let i = 0; i < 8; i++) {
                const dx = bx(t) - x; if (Math.abs(dx) < 0.001) break;
                const d = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
                if (Math.abs(d) < 1e-6) break;
                t -= dx / d;
            }
            return by(t);
        };
    }
    const easeStandard = cubicBezier(0.16, 1, 0.3, 1);

    window.runCountUp = function () {
        document.querySelectorAll('[data-count-to]').forEach((el, i) => {
            const target = parseInt(el.dataset.countTo, 10) || 0;
            if (reduceMotion) { el.textContent = target.toLocaleString(); return; }
            const start = performance.now();
            function tick(now) {
                const t = Math.min((now - start) / 900, 1);
                el.textContent = Math.round(easeStandard(t) * target).toLocaleString();
                if (t < 1) requestAnimationFrame(tick);
                else el.textContent = target.toLocaleString();
            }
            setTimeout(() => requestAnimationFrame(tick), 260 + i * 80);
        });
    };
    window.runCountUp();

    if (!reduceMotion) {
        let pointerX = window.innerWidth / 2, pointerY = window.innerHeight / 2, ticking = false;
        function updateMaterial() {
            if (sidebar) {
                const sRect = sidebar.getBoundingClientRect();
                if (pointerY >= sRect.top && pointerY <= sRect.bottom && pointerX >= sRect.left && pointerX <= sRect.right) {
                    sidebar.style.setProperty('--sidebar-light-y', (((pointerY - sRect.top) / sRect.height) * 100).toFixed(1) + '%');
                }
            }
            document.querySelectorAll('.material-react').forEach((el) => {
                const rect = el.getBoundingClientRect();
                const dist = Math.hypot(pointerX - Math.max(rect.left, Math.min(pointerX, rect.right)), pointerY - Math.max(rect.top, Math.min(pointerY, rect.bottom)));
                const near = dist < 48;
                el.classList.toggle('is-near', near);
                const withinBounds = pointerX >= rect.left && pointerX <= rect.right && pointerY >= rect.top && pointerY <= rect.bottom;
                if (near || withinBounds) {
                    el.style.setProperty('--mx', (((pointerX - rect.left) / rect.width) * 100).toFixed(1) + '%');
                    el.style.setProperty('--my', (((pointerY - rect.top) / rect.height) * 100).toFixed(1) + '%');
                }
                if (el.classList.contains('tilt')) {
                    const maxTilt = el.classList.contains('whisper') ? 1.6 : 3;
                    if (withinBounds) {
                        el.style.setProperty('--tilt-x', ((0.5 - ((pointerY - rect.top) / rect.height)) * maxTilt).toFixed(2) + 'deg');
                        el.style.setProperty('--tilt-y', ((((pointerX - rect.left) / rect.width) - 0.5) * maxTilt).toFixed(2) + 'deg');
                    } else {
                        el.style.setProperty('--tilt-x', '0deg'); el.style.setProperty('--tilt-y', '0deg');
                    }
                }
            });
            ticking = false;
        }
        document.addEventListener('mousemove', (e) => {
            pointerX = e.clientX; pointerY = e.clientY;
            if (!ticking) { requestAnimationFrame(updateMaterial); ticking = true; }
        }, { passive: true });

        let driftX = 0, driftY = 0;
        (function driftLoop() {
            driftX += ((((pointerX / window.innerWidth) - 0.5) * 100) - driftX) * 0.004;
            driftY += ((((pointerY / window.innerHeight) - 0.5) * 40) - driftY) * 0.004;
            document.querySelectorAll('.ambient-glow').forEach(glow => {
                glow.style.transform = `translate(${driftX.toFixed(2)}px, ${driftY.toFixed(2)}px)`;
            });
            requestAnimationFrame(driftLoop);
        })();
    }

    // ==========================================
    // ৫. ACCOUNT MANAGER
    // ==========================================
    const dynamicAccountList = document.getElementById('dynamicAccountList');

    function setActiveRootProfile(accountName) {
        document.querySelectorAll('.profile-name').forEach(el => el.textContent = accountName);
        document.querySelectorAll('.avatar').forEach(el => el.textContent = accountName.substring(0, 2).toUpperCase());
        localStorage.setItem('activeRootAccount', accountName);
    }

    const savedRootAccount = localStorage.getItem('activeRootAccount');
    if (savedRootAccount) setActiveRootProfile(savedRootAccount);

    async function loadAccountsIntoDropdown() {
        if (!ipcRenderer) return;
        try {
            const accounts = await ipcRenderer.invoke('get-existing-accounts');
            if (dynamicAccountList) {
                dynamicAccountList.innerHTML = '';
                accounts.forEach(acc => {
                    const btn = document.createElement('button');
                    btn.className = 'popover-item';
                    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; flex-shrink: 0;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                     <span style="flex-grow:1; text-align:left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${acc}</span>`;
                    btn.addEventListener('click', () => { setActiveRootProfile(acc); loadAccountsIntoDropdown(); });
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
                        if (isActive && ipcRenderer) {
                            ipcRenderer.send('stop-engine', systemId);
                            setTimeout(() => { ipcRenderer.send('start-engine', { systemId, accountName: acc }); }, 1500);
                        }
                    });
                    listContainer.appendChild(btn);
                });
            });

            const deleteAccountList = document.getElementById('deleteAccountList');
            if (deleteAccountList) {
                deleteAccountList.innerHTML = '';
                if (accounts.length === 0) {
                    deleteAccountList.innerHTML = '<p style="color: #777; font-size: 13px;">No accounts found.</p>';
                } else {
                    accounts.forEach(acc => {
                        const row = document.createElement('div');
                        row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: #141418; padding: 12px; border-radius: 6px; border: 1px solid #333;';
                        row.innerHTML = `<span style="font-size: 14px; font-weight: 500;">${acc}</span><button class="delete-acc-btn" data-acc="${acc}" style="background: rgba(229, 115, 115, 0.1); color: #e57373; border: 1px solid rgba(229, 115, 115, 0.3); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Delete</button>`;
                        deleteAccountList.appendChild(row);
                    });
                    document.querySelectorAll('.delete-acc-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            const accToDelete = e.target.getAttribute('data-acc');
                            if (confirm(`Are you sure you want to delete "${accToDelete}"?`)) {
                                if (ipcRenderer) ipcRenderer.send('delete-account', accToDelete);
                                e.target.parentElement.remove();
                                if (localStorage.getItem('activeRootAccount') === accToDelete) localStorage.removeItem('activeRootAccount');
                                setTimeout(loadAccountsIntoDropdown, 1000);
                            }
                        });
                    });
                }
            }
        } catch (err) { }
    }
    loadAccountsIntoDropdown();

    const openAddAccountBtn = document.getElementById('openAddAccountModal');
    const addAccountModal = document.getElementById('addAccountModal');
    const cancelAccountBtn = document.getElementById('cancelAccountBtn');
    const saveAccountBtn = document.getElementById('saveAccountBtn');
    const newAccountInput = document.getElementById('newAccountInput');

    if (openAddAccountBtn && addAccountModal) {
        openAddAccountBtn.addEventListener('click', () => { addAccountModal.style.display = 'flex'; if (newAccountInput) newAccountInput.focus(); });
        if (cancelAccountBtn) cancelAccountBtn.addEventListener('click', () => { addAccountModal.style.display = 'none'; if (newAccountInput) newAccountInput.value = ''; });
        if (saveAccountBtn) saveAccountBtn.addEventListener('click', () => {
            const accountName = newAccountInput.value.trim();
            if (accountName !== "") {
                setActiveRootProfile(accountName);
                if (ipcRenderer) ipcRenderer.send('create-new-account', accountName);
                addAccountModal.style.display = 'none'; newAccountInput.value = '';
                setTimeout(loadAccountsIntoDropdown, 1000);
            }
        });
    }

    const btnSignOut = document.getElementById('openSignOutModal');
    const accountManagerModal = document.getElementById('accountManagerModal');
    if (btnSignOut && accountManagerModal) {
        btnSignOut.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            document.querySelectorAll('.popover').forEach(p => p.classList.remove('open'));
            accountManagerModal.style.display = 'flex';
            loadAccountsIntoDropdown();
        });
    }

    // ==========================================
    // ৬. UPDATER & IPC LISTENERS
    // ==========================================
    const btnCheckUpdate = document.getElementById('btnCheckUpdate');
    const updateStatusText = document.getElementById('updateStatusText');
    if (btnCheckUpdate && ipcRenderer) {
        btnCheckUpdate.addEventListener('click', () => {
            btnCheckUpdate.disabled = true;
            btnCheckUpdate.innerHTML = `<span style="animation: pulseDot 1s infinite;">Checking...</span>`;
            if (updateStatusText) updateStatusText.textContent = "Connecting to GitHub...";
            ipcRenderer.send('check-for-updates');
        });
        ipcRenderer.on('update-status', (event, message) => {
            if (updateStatusText) updateStatusText.textContent = message;
            if (message.includes('available') || message.includes('Downloading')) {
                if (updateStatusText) updateStatusText.style.color = 'var(--accent-primary)';
            } else {
                if (updateStatusText) updateStatusText.style.color = message.includes('Error') ? 'var(--color-error)' : 'var(--color-success)';
                btnCheckUpdate.disabled = false;
                btnCheckUpdate.innerHTML = message.includes('Error') ? `Retry` : `Check`;
            }
        });
    }

    if (ipcRenderer) {
        ipcRenderer.on('ui-console-log', (event, data) => {
            if (data.target === 'gemini' && window.geminiLogLine) {
                window.geminiLogLine(data.type, data.text);
                if (data.type === 'completed' || data.type === 'generating') window.addRecentActivity('Gemini', data.text, 'ai-gemini');
            } else if (data.target === 'flow' && window.flowLogLine) {
                window.flowLogLine(data.type, data.text);
                if (data.type === 'completed' || data.type === 'generating') window.addRecentActivity('Flow Video', data.text, 'accent-primary');
            } else if (window.logLine) {
                window.logLine(data.type, data.text);

                let sysColor = 'accent-primary';
                let sysName = 'System';
                const lowerText = data.text.toLowerCase();

                if (lowerText.includes('chatgpt')) { sysColor = 'ai-chatgpt'; sysName = 'ChatGPT'; }
                else if (lowerText.includes('gemini')) { sysColor = 'ai-gemini'; sysName = 'Gemini'; }
                else if (lowerText.includes('claude')) { sysColor = 'ai-claude'; sysName = 'Claude'; }
                else if (lowerText.includes('deepseek')) { sysColor = 'ai-deepseek'; sysName = 'DeepSeek'; }
                else if (lowerText.includes('qwen')) { sysColor = 'ai-qwen'; sysName = 'Qwen'; }
                else if (lowerText.includes('perplexity')) { sysColor = 'ai-perplexity'; sysName = 'Perplexity'; }
                else if (lowerText.includes('grok')) { sysColor = 'ai-grok'; sysName = 'Grok'; }
                else if (lowerText.includes('orchestrator') || lowerText.includes('administrator')) { sysName = 'Orchestrator'; }

                if (data.type === 'sent' || data.type === 'completed' || data.type === 'ready') {
                    window.addRecentActivity(sysName, data.text, sysColor);
                }
            }
        });

        ipcRenderer.on('final-output-ready', (event, data) => {
            const viewer = document.getElementById('finalOutputViewer');
            const statusPill = document.getElementById('foStatusPill');
            const generatedBy = document.getElementById('foGeneratedBy');
            if (viewer) viewer.innerHTML = `<div style="white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: var(--text-primary); text-align: left; width: 100%; height: 100%; overflow-y: auto;">${data.response}</div>`;
            if (statusPill) { statusPill.textContent = 'Report Ready'; statusPill.className = 'status-pill connected'; }
            if (generatedBy) generatedBy.textContent = data.sender.replace('@', '').toUpperCase();
            const copyBtn = document.getElementById('foCopyBtn');
            if (copyBtn) copyBtn.disabled = false;
        });

        ipcRenderer.on('live-ai-chat', (event, data) => {
            const chatViewer = document.getElementById('liveChatterViewer');
            const placeholder = document.getElementById('liveChatPlaceholder');
            if (placeholder) placeholder.style.display = 'none';
            if (chatViewer) {
                const isFromAdmin = data.sender.toLowerCase().includes('admin');
                const bubble = document.createElement('div');
                bubble.style.cssText = `display: flex; flex-direction: column; align-items: ${isFromAdmin ? 'flex-end' : 'flex-start'}; margin-bottom: 10px;`;
                bubble.innerHTML = `
                    <div style="font-size: 10px; font-weight: bold; color: ${isFromAdmin ? 'var(--accent-primary)' : 'var(--text-secondary)'}; margin-bottom: 4px; text-transform: uppercase;">
                        ${data.sender} ➔ ${data.receiver}
                    </div>
                    <div style="background: ${isFromAdmin ? 'rgba(201,154,91,0.1)' : 'var(--bg-elevated)'}; border: 1px solid ${isFromAdmin ? 'var(--accent-primary)' : 'var(--border-default)'}; padding: 8px 12px; border-radius: 8px; color: var(--text-primary); font-size: 12px; max-width: 85%; word-wrap: break-word;">
                        ${data.text.length > 200 ? data.text.substring(0, 200) + '...' : data.text}
                    </div>`;
                chatViewer.appendChild(bubble);
                chatViewer.scrollTop = chatViewer.scrollHeight;
            }
        });
    }

    // ==========================================
    // ৭. WORKSPACE CONTROLLER (AI Switches & Toggles)
    // ==========================================
    const WORKER_IDS = ['chatgpt', 'gemini', 'claude', 'deepseek', 'qwen', 'perplexity', 'grok'];
    const WORKERS = {
        chatgpt: { name: 'ChatGPT', enabled: true, account: 'Select Account', roles: ['Analyzing project architecture', 'Drafting the technical outline', 'Reviewing API documentation', 'Summarizing research notes'] },
        gemini: { name: 'Gemini', enabled: true, account: 'Select Account', roles: ['Rendering concept images', 'Generating campaign variations', 'Composing moodboard visuals'] },
        claude: { name: 'Claude', enabled: true, account: 'Select Account', roles: ['Reviewing interface copy', 'Editing the brief for tone', 'Drafting release notes'] },
        deepseek: { name: 'DeepSeek', enabled: true, account: 'Select Account', roles: ['Validating workflow logic', 'Flagging edge cases', 'Refactoring the automation script'] },
        qwen: { name: 'Qwen', enabled: false, account: 'Select Account', roles: ['Translating campaign copy', 'Formatting structured data'] },
        perplexity: { name: 'Perplexity', enabled: true, account: 'Select Account', roles: ['Researching competitor pricing', 'Surfacing supporting sources', 'Fact-checking the report draft'] },
        grok: { name: 'Grok', enabled: false, account: 'Select Account', roles: ['Drafting social copy variations', 'Scanning trend signals'] },
    };
    const SYSTEM_IDS = ['prompt', 'final'];
    const SYSTEMS = {
        prompt: { name: 'Prompt Construction AI', enabled: true, account: 'Select Account' },
        final: { name: 'Final Report AI', enabled: true, account: 'Select Account' },
    };

    function enabledWorkerIds() { return WORKER_IDS.filter((id) => WORKERS[id].enabled); }

    function getSystemEls(id) {
        return {
            card: document.querySelector(`.ai-card[data-system="${id}"]`),
            node: document.getElementById(`node-${id}`),
            orchLink: document.querySelector(`[data-link="orch-${id}"]`),
            finalLink: document.querySelector(`[data-link="${id}-final"]`),
            chip: document.querySelector(`.target-chip[data-target="${id}"]`),
        };
    }

    function updateLegend() {
        const activeCount = enabledWorkerIds().length;
        const idleCount = WORKER_IDS.length - activeCount;
        const legendActive = document.getElementById('legendActive');
        const legendIdle = document.getElementById('legendIdle');
        if (legendActive) legendActive.innerHTML = `<span class="legend-dot" style="background:var(--color-success);"></span>${activeCount} of 7 Workers active`;
        if (legendIdle) legendIdle.innerHTML = `<span class="legend-dot" style="background:var(--text-disabled);"></span>${idleCount} idle`;
        const caption = document.getElementById('workerConnectedCount');
        const allIds = [...WORKER_IDS, ...SYSTEM_IDS];
        const connected = allIds.filter((id) => (WORKERS[id] || SYSTEMS[id]).enabled).length;
        if (caption) caption.textContent = `${connected} of ${allIds.length} connected`;
    }

    function triggerEngine(id, isEnabled, accName) {
        if (!ipcRenderer) return;
        if (isEnabled) {
            let safeAcc = accName;
            if (!safeAcc || safeAcc === 'Select Account' || safeAcc === '-- Select Account --' || safeAcc.includes('Not connected')) {
                safeAcc = 'Normal_Browser';
            }
            ipcRenderer.send('start-engine', { systemId: id, accountName: safeAcc });
        } else {
            ipcRenderer.send('stop-engine', id);
        }
    }

    function setWorkerEnabled(id, enabled, isUserClick = false) {
        const w = WORKERS[id];
        w.enabled = enabled;
        const els = getSystemEls(id);
        if (!els.card || !els.node) return;

        els.card.classList.toggle('is-active', enabled);
        els.card.classList.toggle('is-disabled', !enabled);

        const switchBtn = els.card.querySelector('.ai-switch');
        if (switchBtn) {
            switchBtn.classList.toggle('is-on', enabled);
            switchBtn.setAttribute('aria-checked', enabled ? 'true' : 'false');
        }

        const pill = els.card.querySelector('.status-pill');
        if (pill) {
            pill.textContent = enabled ? 'Connected' : 'Idle';
            pill.classList.toggle('connected', enabled);
            pill.classList.toggle('idle', !enabled);
        }

        const acctBtn = els.card.querySelector('.account-switch-btn');
        if (acctBtn) acctBtn.disabled = !enabled;

        const activityEl = els.card.querySelector('.ai-card-activity');
        const stateEl = els.card.querySelector('.readout-value');
        if (activityEl && stateEl) {
            if (!enabled) {
                activityEl.innerHTML = '<span class="label">Current role</span>Standby — disabled by Administrator';
                stateEl.className = 'readout-value state-idle';
                stateEl.textContent = 'Offline';
                els.card.querySelector('.account-name').textContent = 'Not connected';
                els.card.querySelector('.account-avatar').textContent = '—';
            } else {
                activityEl.innerHTML = '<span class="label">Current role</span>Awaiting dispatch from Orchestrator';
                stateEl.className = 'readout-value state-idle';
                stateEl.textContent = 'Idle';
                let currentAcc = localStorage.getItem(`saved_account_${id}`);
                if (currentAcc && currentAcc !== 'Select Account' && !currentAcc.includes('Not connected')) {
                    w.account = currentAcc;
                }
                if (w.account && w.account !== 'Select Account' && !w.account.includes('Not connected')) {
                    els.card.querySelector('.account-name').textContent = w.account;
                    els.card.querySelector('.account-avatar').textContent = w.account.slice(0, 2).toUpperCase();
                } else {
                    els.card.querySelector('.account-name').textContent = 'Select Account';
                    els.card.querySelector('.account-avatar').textContent = '--';
                }
            }
        }

        const timeEl = els.card.querySelector('.activity-time');
        if (timeEl) timeEl.textContent = 'just now';

        els.node.classList.toggle('is-active', enabled);
        els.node.classList.toggle('is-disabled', !enabled);
        const nodeSub = els.node.querySelector('.net-node-label span');
        if (nodeSub) nodeSub.textContent = enabled ? 'Worker' : 'Offline';

        [els.orchLink, els.finalLink].forEach((g) => {
            if (!g) return;
            const path = g.querySelector('.link-path');
            if (path) path.classList.toggle('is-dim', !enabled);
        });
        if (els.chip) els.chip.disabled = !enabled;
        updateLegend();

        if (window.updateDashboardSystemStatus) window.updateDashboardSystemStatus(id, enabled);

        if (isUserClick) triggerEngine(id, enabled, w.account);
    }

    function getInfraLinkEls(id) {
        if (id === 'prompt') return [document.getElementById('link-orch-prompt')].filter(Boolean);
        if (id === 'final') {
            const links = WORKER_IDS.map((wid) => {
                const g = document.querySelector(`[data-link="${wid}-final"]`);
                return g ? g.querySelector('.link-path') : null;
            });
            const loopG = document.querySelector('[data-link="final-admin"]');
            links.push(loopG ? loopG.querySelector('.link-loop') : null);
            return links.filter(Boolean);
        }
        return [];
    }

    function setInfraEnabled(id, enabled, isUserClick = false) {
        const sys = SYSTEMS[id];
        sys.enabled = enabled;
        const card = document.querySelector(`.ai-card[data-system="${id}"]`);
        const node = document.getElementById(`node-${id}`);
        if (!card || !node) return;

        card.classList.toggle('is-active', enabled);
        card.classList.toggle('is-disabled', !enabled);

        const switchBtn = card.querySelector('.ai-switch');
        if (switchBtn) {
            switchBtn.classList.toggle('is-on', enabled);
            switchBtn.setAttribute('aria-checked', enabled ? 'true' : 'false');
        }

        const pill = card.querySelector('.status-pill');
        if (pill) {
            pill.textContent = enabled ? 'Connected' : 'Idle';
            pill.classList.toggle('connected', enabled);
            pill.classList.toggle('idle', !enabled);
        }
        const acctBtn = card.querySelector('.account-switch-btn');
        if (acctBtn) acctBtn.disabled = !enabled;

        const activityEl = card.querySelector('.ai-card-activity');
        const stateEl = card.querySelector('.readout-value');
        const idleRoleText = id === 'prompt' ? 'Awaiting objective from Orchestrator' : 'Awaiting Worker output';

        if (activityEl && stateEl) {
            if (!enabled) {
                activityEl.innerHTML = '<span class="label">Current role</span>Standby — disabled by Administrator';
                stateEl.className = 'readout-value state-idle';
                stateEl.textContent = 'Offline';
                card.querySelector('.account-name').textContent = 'Not connected';
                card.querySelector('.account-avatar').textContent = '—';
            } else {
                activityEl.innerHTML = `<span class="label">Current role</span>${idleRoleText}`;
                stateEl.className = 'readout-value state-idle';
                stateEl.textContent = 'Idle';
                let currentAcc = localStorage.getItem(`saved_account_${id}`);
                if (currentAcc && currentAcc !== 'Select Account' && !currentAcc.includes('Not connected')) {
                    sys.account = currentAcc;
                }
                if (sys.account && sys.account !== 'Select Account' && !sys.account.includes('Not connected')) {
                    card.querySelector('.account-name').textContent = sys.account;
                    card.querySelector('.account-avatar').textContent = sys.account.slice(0, 2).toUpperCase();
                } else {
                    card.querySelector('.account-name').textContent = 'Select Account';
                    card.querySelector('.account-avatar').textContent = '--';
                }
            }
        }

        const timeEl = card.querySelector('.activity-time');
        if (timeEl) timeEl.textContent = 'just now';

        node.classList.toggle('is-active', enabled);
        node.classList.toggle('is-disabled', !enabled);
        getInfraLinkEls(id).forEach((el) => el.classList.toggle('is-dim', !enabled));
        updateLegend();

        if (window.updateDashboardSystemStatus) window.updateDashboardSystemStatus(id, enabled);

        if (isUserClick) triggerEngine(id, enabled, sys.account);
    }

    function triggerReconnect(id, then) {
        const card = document.querySelector(`.ai-card[data-system="${id}"]`);
        if (!card) return;
        card.classList.add('is-reconnecting');
        setTimeout(() => {
            card.classList.remove('is-reconnecting');
            if (then) then();
        }, reduceMotion ? 60 : 950);
    }

    document.querySelectorAll('.ai-switch').forEach((btn) => {
        if (btn.id === 'recordingSwitch') return;

        const card = btn.closest('.ai-card');
        if (!card) return;
        const id = card.dataset.system;

        const press = () => btn.classList.add('is-pressing');
        const release = () => btn.classList.remove('is-pressing');
        btn.addEventListener('mousedown', press);
        btn.addEventListener('touchstart', press, { passive: true });
        ['mouseup', 'mouseleave', 'touchend'].forEach((evt) => btn.addEventListener(evt, release));

        btn.addEventListener('click', () => {
            const turningOn = !btn.classList.contains('is-on');
            if (WORKERS[id]) {
                const w = WORKERS[id];
                if (turningOn) {
                    if (!w.account) w.account = 'Select Account';
                    setWorkerEnabled(id, true, true);
                    triggerReconnect(id);
                    if (window.logLine) window.logLine('connect', `${w.name} reconnected by Administrator`);
                } else {
                    setWorkerEnabled(id, false, true);
                    if (window.logLine) window.logLine('info', `${w.name} disabled by Administrator`);
                }
            } else if (SYSTEMS[id]) {
                const s = SYSTEMS[id];
                if (turningOn) {
                    if (!s.account) s.account = 'Select Account';
                    setInfraEnabled(id, true, true);
                    triggerReconnect(id);
                    if (window.logLine) window.logLine('connect', `${s.name} reconnected by Administrator`);
                } else {
                    setInfraEnabled(id, false, true);
                    if (window.logLine) window.logLine('info', `${s.name} disabled by Administrator`);
                }
            }

            setTimeout(() => { localStorage.setItem(`ai_state_${id}`, turningOn ? 'on' : 'off'); }, 100);
        });
    });

    const recSwitch = document.getElementById('recordingSwitch');
    const recText = document.getElementById('recordStatusText');
    if (recSwitch) {
        recSwitch.addEventListener('click', () => {
            const isCurrentlyOn = recSwitch.classList.contains('is-on');
            const newState = !isCurrentlyOn;
            recSwitch.classList.toggle('is-on', newState);
            recSwitch.setAttribute('aria-checked', newState.toString());
            if (recText) {
                recText.textContent = newState ? "System Recording: ON" : "Warm-up Mode (No Record)";
                recText.style.color = newState ? "var(--text-tertiary)" : "var(--color-warning)";
            }
            if (ipcRenderer) ipcRenderer.send('toggle-recording', newState);
        });
    }

    const stopAllBtn = document.getElementById('stopAllBtn');
    if (stopAllBtn) {
        stopAllBtn.addEventListener('click', () => {
            clearPipelineTimers();
            resetTransientVisuals();

            document.querySelectorAll('.ai-card').forEach(card => {
                if (!card.classList.contains('is-disabled')) {
                    const stateEl = card.querySelector('.readout-value');
                    if (stateEl && (stateEl.classList.contains('state-running') || stateEl.classList.contains('state-complete'))) {
                        stateEl.className = 'readout-value state-idle';
                        stateEl.textContent = 'Idle';
                    }
                }
            });

            if (ipcRenderer) ipcRenderer.send('clear-queue');
        });
    }

    const composerInput = document.getElementById('composerInput');
    const composerSend = document.getElementById('composerSend');
    const targetChips = Array.from(document.querySelectorAll('.target-chip'));
    const autoChip = document.querySelector('.target-chip[data-target="auto"]');

    if (composerInput) {
        composerInput.addEventListener('input', function () {
            this.style.height = '80px';
            let newHeight = this.scrollHeight;
            if (newHeight >= 180) {
                this.style.height = '180px';
                this.style.overflowY = 'auto';
            } else {
                this.style.height = newHeight + 'px';
                this.style.overflowY = 'hidden';
            }
        });
    }

    targetChips.forEach((chip) => {
        chip.addEventListener('click', () => {
            if (chip.disabled) return;
            if (chip === autoChip) {
                targetChips.forEach((c) => c.classList.toggle('is-selected', c === autoChip));
                return;
            }
            autoChip.classList.remove('is-selected');
            chip.classList.toggle('is-selected');
            const anyChosen = targetChips.some((c) => c !== autoChip && c.classList.contains('is-selected'));
            if (!anyChosen) autoChip.classList.add('is-selected');
        });
    });

    function getRequestedWorkers() {
        if (!autoChip || autoChip.classList.contains('is-selected')) return ['auto'];
        const chosen = targetChips.filter((c) => c !== autoChip && c.classList.contains('is-selected'));
        return chosen.map(c => c.dataset.target);
    }

    function escapeHtml(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

    let pendingTimers = [];
    function clearPipelineTimers() { pendingTimers.forEach((t) => clearTimeout(t)); pendingTimers = []; }
    function scheduleNext(fn, delay) { pendingTimers.push(setTimeout(fn, delay)); }

    function pulseNode(id, on) { const el = document.getElementById(`node-${id}`); if (el) el.classList.toggle('is-thinking', on); }
    function flowLink(linkKey, on) {
        const g = document.querySelector(`[data-link="${linkKey}"]`);
        if (!g) return;
        const path = g.querySelector('.link-path, .link-loop'); if (path) path.classList.toggle('is-flowing', on);
        const particle = g.querySelector('.link-particle'); if (particle) particle.classList.toggle('is-visible', on);
    }
    function flowBond(on) { const bond = document.getElementById('link-orch-prompt'); if (bond) bond.classList.toggle('is-flowing', on); }
    function setCardRuntime(id, stateClass, stateText, activityText) {
        const card = document.querySelector(`.ai-card[data-system="${id}"]`);
        if (!card || !WORKERS[id].enabled) return;
        const stateEl = card.querySelector('.readout-value');
        stateEl.className = 'readout-value ' + stateClass;
        stateEl.textContent = stateText;
        if (activityText) card.querySelector('.ai-card-activity').innerHTML = `<span class="label">Current role</span>${activityText}`;
        card.querySelector('.activity-time').textContent = 'just now';
    }
    function resetTransientVisuals() {
        document.querySelectorAll('.net-node.is-thinking').forEach((n) => n.classList.remove('is-thinking'));
        document.querySelectorAll('.link-path.is-flowing, .link-loop.is-flowing').forEach((p) => p.classList.remove('is-flowing'));
        document.querySelectorAll('.link-particle.is-visible').forEach((p) => p.classList.remove('is-visible'));
        flowBond(false);
        const admin = document.getElementById('node-admin');
        if (admin) admin.classList.remove('is-flashing');
    }

    function runPipelineCycle(forcedWorkerId, objectiveText) {
        clearPipelineTimers();
        resetTransientVisuals();

        window.LiveStats.workflows++;
        window.updateDashboardStat('workflows', window.LiveStats.workflows, '1 running now', 'positive');

        const avail = enabledWorkerIds();
        if (avail.length === 0) {
            if (window.logLine) window.logLine('waiting', 'No Workers enabled — Orchestrator is standing by');
            scheduleNext(() => runPipelineCycle(), 7000);
            return;
        }
        const workerId = (forcedWorkerId && WORKERS[forcedWorkerId] && WORKERS[forcedWorkerId].enabled) ? forcedWorkerId : avail[Math.floor(Math.random() * avail.length)];
        const worker = WORKERS[workerId];
        const roleText = worker.roles[Math.floor(Math.random() * worker.roles.length)];

        if (window.logLine) window.logLine('info', objectiveText ? `Receiving objective: "${escapeHtml(truncate(objectiveText, 60))}"` : 'Receiving objective from Administrator');
        pulseNode('admin', true); pulseNode('orchestrator', true); flowLink('admin-orch', true);

        scheduleNext(() => {
            pulseNode('admin', false); flowLink('admin-orch', false);
            if (window.logLine) window.logLine('progress', `Selecting Worker AI — ${worker.name}`);
            pulseNode(workerId, true);
        }, 1500);

        scheduleNext(() => {
            if (window.logLine) window.logLine('generating', 'Prompt Construction AI drafting instructions');
            if (SYSTEMS.prompt.enabled) { pulseNode('prompt', true); flowBond(true); }
        }, 3100);

        scheduleNext(() => {
            if (SYSTEMS.prompt.enabled) { flowBond(false); pulseNode('prompt', false); }
            if (window.logLine) window.logLine('sent', `Dispatching task to ${worker.name}`);
            flowLink(`orch-${workerId}`, true);
            setCardRuntime(workerId, 'state-running', 'Running', roleText);
        }, 4700);

        scheduleNext(() => {
            flowLink(`orch-${workerId}`, false);
            if (window.logLine) window.logLine('generating', `${worker.name} processing`);
        }, 6500);

        scheduleNext(() => {
            if (window.logLine) window.logLine('progress', `Collecting response from ${worker.name}`);
            if (SYSTEMS.final.enabled) { flowLink(`${workerId}-final`, true); pulseNode('final', true); }
        }, 9600);

        scheduleNext(() => {
            if (SYSTEMS.final.enabled) flowLink(`${workerId}-final`, false);
            pulseNode(workerId, false);
            setCardRuntime(workerId, 'state-complete', 'Complete', `Completed: ${roleText}`);
            if (window.logLine) window.logLine('generating', 'Building final report');
        }, 11300);

        scheduleNext(() => {
            if (window.logLine) window.logLine('completed', 'Final report completed — delivered to Administrator');
            if (SYSTEMS.final.enabled) { pulseNode('final', false); flowLink('final-admin', true); }
            pulseNode('admin', true);
            document.getElementById('node-admin').classList.add('is-flashing');
        }, 13200);

        scheduleNext(() => {
            if (SYSTEMS.final.enabled) flowLink('final-admin', false);
            pulseNode('admin', false); pulseNode('orchestrator', false);
            document.getElementById('node-admin').classList.remove('is-flashing');
            setCardRuntime(workerId, 'state-idle', 'Idle', 'Awaiting dispatch from Orchestrator');
            window.updateDashboardStat('workflows', window.LiveStats.workflows, 'Idle', 'neutral');
        }, 15200);
    }

    if (composerSend && composerInput) {
        const TAG_TO_ROUTE = { 'administrator': '@administrator', 'chatgpt': '@chatgpt', 'gemini': '@gemini', 'claude': '@claude', 'deepseek': '@deepseek', 'qwen': '@qwen', 'perplexity': '@perplexity', 'grok': '@grok', 'final': '@final' };

        const sendObjective = () => {
            let basePrompt = composerInput.value.trim();
            if (basePrompt) {
                const requestedList = getRequestedWorkers();

                const visualTarget = requestedList[0] === 'auto' ? null : requestedList[Math.floor(Math.random() * requestedList.length)];
                runPipelineCycle(visualTarget, "Objective dispatched by Administrator");

                requestedList.forEach(targetId => {
                    let selectedUIName = targetId === 'auto' ? 'administrator' : targetId;
                    let targetRoute = TAG_TO_ROUTE[selectedUIName] || '@administrator';

                    let finalPrompt = basePrompt;
                    if (!finalPrompt.startsWith('@')) {
                        finalPrompt = `${targetRoute} ${finalPrompt}`;
                    }

                    if (ipcRenderer) {
                        ipcRenderer.send('send-ai-command', { text: finalPrompt, target: targetId });
                    }
                });

                composerInput.value = '';
                composerInput.style.height = '80px';
                composerInput.style.overflowY = 'hidden';

                composerSend.classList.remove('is-sent');
                void composerSend.offsetWidth;
                composerSend.classList.add('is-sent');
            }
        };
        composerSend.addEventListener('click', sendObjective);
        composerInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendObjective(); }
        });
    }

    setTimeout(() => {
        document.querySelectorAll('.ai-card').forEach(card => {
            const systemId = card.dataset.system;
            const switchBtn = card.querySelector('.ai-switch');
            if (systemId && switchBtn) {
                const savedState = localStorage.getItem(`ai_state_${systemId}`);
                if (savedState) {
                    const shouldBeOn = (savedState === 'on');
                    if (WORKERS[systemId]) setWorkerEnabled(systemId, shouldBeOn, false);
                    else if (SYSTEMS[systemId]) setInfraEnabled(systemId, shouldBeOn, false);
                } else {
                    if (WORKERS[systemId]) setWorkerEnabled(systemId, WORKERS[systemId].enabled, false);
                    else if (SYSTEMS[systemId]) setInfraEnabled(systemId, SYSTEMS[systemId].enabled, false);
                }
            }
        });
    }, 300);

    // ==========================================
    // ৮. GEMINI & FLOW CONTROLLERS (SMART RESUME & MEMORY)
    // ==========================================
    ['gemini', 'flow'].forEach(prefix => {
        const editor = document.getElementById(`${prefix}-promptEditor`);
        const gutter = document.getElementById(`${prefix}-editorGutter`);
        const queueCount = document.getElementById(`${prefix}-queueCount`);
        if (!editor || !gutter) return;

        let activeTotal = 0;
        let activeCompleted = 0;

        function updateProgressUI(completed, total) {
            const completedEl = document.getElementById(`${prefix}-readoutCompleted`);
            const remainingEl = document.getElementById(`${prefix}-readoutRemaining`);
            const percentEl = document.getElementById(`${prefix}-progressPercent`);
            const fillEl = document.getElementById(`${prefix}-progressFill`);

            if (completedEl) completedEl.textContent = completed;
            if (remainingEl) remainingEl.textContent = Math.max(0, total - completed);

            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
            if (percentEl) percentEl.textContent = `${percent}%`;
            if (fillEl) fillEl.style.width = `${percent}%`;
        }

        // 🔴 MAGIC FIX: Load Saved Progress on Startup
        const savedStateStr = localStorage.getItem(`${prefix}_progress_state`);
        let sessionState = 'idle';

        if (savedStateStr) {
            try {
                const savedState = JSON.parse(savedStateStr);
                if (savedState && savedState.text) {
                    editor.value = savedState.text;
                    activeCompleted = savedState.completed || 0;
                    activeTotal = editor.value.split('\n').filter(l => l.trim().length > 0).length;
                    updateProgressUI(activeCompleted, activeTotal);

                    if (activeCompleted > 0 && activeCompleted < activeTotal) {
                        sessionState = 'paused';
                        const stateText = document.getElementById(`${prefix}-currentStateText`);
                        if (stateText) stateText.textContent = `Crash Recovered: Ready to resume from line ${activeCompleted + 1}`;
                    }
                }
            } catch (e) { }
        }

        function updateGutter() {
            const lines = editor.value.split('\n');
            let out = ''; for (let i = 1; i <= lines.length; i++) out += i + '\n';
            gutter.textContent = out;
            const n = lines.map(l => l.trim()).filter(l => l.length > 0).length;
            if (queueCount) queueCount.textContent = n + (n === 1 ? ' prompt' : ' prompts');

            // Auto-save whenever text changes
            localStorage.setItem(`${prefix}_progress_state`, JSON.stringify({ text: editor.value, completed: activeCompleted }));
        }
        editor.addEventListener('input', updateGutter);
        editor.addEventListener('scroll', () => { gutter.scrollTop = editor.scrollTop; });
        updateGutter();

        document.getElementById(`${prefix}-clearQueueBtn`)?.addEventListener('click', () => {
            editor.value = ''; updateGutter();
            localStorage.removeItem(`${prefix}_progress_state`);
            if (window[`${prefix}LogLine`]) window[`${prefix}LogLine`]('info', 'Queue cleared');
        });

        const startBtn = document.getElementById(`${prefix}-startBtn`);
        const resumeBtn = document.getElementById(`${prefix}-resumeBtn`);
        const resetBtn = document.getElementById(`${prefix}-resetBtn`);
        const pauseBtn = document.getElementById(`${prefix}-pauseBtn`);
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                sessionState = 'paused';
                updateBtns();

                const dot = document.getElementById(`${prefix}-browserDot`);
                if (dot) dot.className = 'chip-dot connected';
                const status = document.getElementById(`${prefix}-browserStatusText`);
                if (status) status.textContent = 'Connected (Paused)';
                const stateText = document.getElementById(`${prefix}-currentStateText`);
                if (stateText) stateText.textContent = 'Automation Paused';

                if (ipcRenderer) ipcRenderer.send(`pause-${prefix === 'gemini' ? 'gemini-image' : 'flow'}-engine`);
            });
        }

        function updateBtns() {
            if (startBtn) startBtn.disabled = sessionState === 'running' || sessionState === 'paused';
            const pauseBtn = document.getElementById(`${prefix}-pauseBtn`);
            if (pauseBtn) pauseBtn.disabled = sessionState !== 'running';
            if (resumeBtn) resumeBtn.disabled = sessionState !== 'paused';
        }

        // Ensure UI buttons update on startup if memory loaded
        if (activeCompleted > 0 && activeCompleted < activeTotal) updateBtns();

        if (startBtn) startBtn.addEventListener('click', () => {
            const lines = editor.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (!lines.length) return;

            // 🔴 Smart Prompt: Restart or Resume?
            if (activeCompleted > 0 && activeCompleted < lines.length) {
                const confirmRestart = window.confirm(`Progress detected: ${activeCompleted}/${lines.length} completed.\n\nClick OK to RESTART from Line 1.\nClick Cancel to RESUME from where you left off.`);
                if (!confirmRestart) {
                    if (resumeBtn) resumeBtn.click();
                    return;
                }
            }

            sessionState = 'running'; updateBtns();
            activeTotal = lines.length;
            activeCompleted = 0;
            updateProgressUI(activeCompleted, activeTotal);
            localStorage.setItem(`${prefix}_progress_state`, JSON.stringify({ text: editor.value, completed: 0 }));

            const dot = document.getElementById(`${prefix}-browserDot`); if (dot) dot.className = 'chip-dot connecting';
            const status = document.getElementById(`${prefix}-browserStatusText`); if (status) status.textContent = 'Connecting';
            const stateText = document.getElementById(`${prefix}-currentStateText`); if (stateText) stateText.textContent = 'Launching Engine...';

            const acc = localStorage.getItem('activeRootAccount') || (prefix === 'gemini' ? 'Gemini_Profile' : 'Flow_Profile');
            const browserSpan = document.getElementById(`${prefix}-selected-browser`);
            const bName = browserSpan ? browserSpan.dataset.value : 'chrome';

            if (ipcRenderer) {
                ipcRenderer.send(`start-${prefix === 'gemini' ? 'gemini-image' : 'flow'}-engine`, {
                    prompts: lines, accountName: acc, browserName: bName, startIndex: 0
                });
            }
        });

        if (resumeBtn) resumeBtn.addEventListener('click', () => {
            sessionState = 'running'; updateBtns();
            const stateText = document.getElementById(`${prefix}-currentStateText`); if (stateText) stateText.textContent = 'Resuming Automation...';

            const lines = editor.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const acc = localStorage.getItem('activeRootAccount') || (prefix === 'gemini' ? 'Gemini_Profile' : 'Flow_Profile');
            const browserSpan = document.getElementById(`${prefix}-selected-browser`);
            const bName = browserSpan ? browserSpan.dataset.value : 'chrome';

            if (ipcRenderer) ipcRenderer.send(`resume-${prefix === 'gemini' ? 'gemini-image' : 'flow'}-engine`, {
                prompts: lines, accountName: acc, browserName: bName, startIndex: activeCompleted
            });
        });

        if (resetBtn) resetBtn.addEventListener('click', () => {
            sessionState = 'idle'; updateBtns();
            if (ipcRenderer) ipcRenderer.send(`stop-${prefix === 'gemini' ? 'gemini-image' : 'flow'}-engine`);

            const dot = document.getElementById(`${prefix}-browserDot`); if (dot) dot.className = 'chip-dot';
            const status = document.getElementById(`${prefix}-browserStatusText`); if (status) status.textContent = 'Disconnected';
            const stateText = document.getElementById(`${prefix}-currentStateText`); if (stateText) stateText.textContent = 'Idle';
            const currentP = document.getElementById(`${prefix}-currentPromptText`); if (currentP) currentP.textContent = '—';

            activeCompleted = 0; activeTotal = 0;
            updateProgressUI(0, 0);
            localStorage.setItem(`${prefix}_progress_state`, JSON.stringify({ text: editor.value, completed: 0 }));

            if (window[`${prefix}LogLine`]) window[`${prefix}LogLine`]('info', 'Session reset.');
        });

        if (ipcRenderer) {
            ipcRenderer.on(`${prefix === 'gemini' ? 'gemini-image' : 'flow'}-status`, (event, msg) => {
                if (msg.state === 'paused') {
                    sessionState = 'paused'; updateBtns();
                    const dot = document.getElementById(`${prefix}-browserDot`); if (dot) dot.className = 'chip-dot connected';
                    const status = document.getElementById(`${prefix}-browserStatusText`); if (status) status.textContent = 'Connected (Waiting)';
                    const stateText = document.getElementById(`${prefix}-currentStateText`); if (stateText) stateText.textContent = 'Waiting for User Login...';
                } else if (msg.state === 'running') {
                    sessionState = 'running'; updateBtns();
                    const dot = document.getElementById(`${prefix}-browserDot`); if (dot) dot.className = 'chip-dot connected';
                    const status = document.getElementById(`${prefix}-browserStatusText`); if (status) status.textContent = 'Connected';
                    const stateText = document.getElementById(`${prefix}-currentStateText`); if (stateText) stateText.textContent = `Generating ${prefix === 'gemini' ? 'Images' : 'Videos'}...`;

                } else if (msg.state === 'prompt') {
                    const currentP = document.getElementById(`${prefix}-currentPromptText`); if (currentP) currentP.textContent = msg.text;
                    updateProgressUI(activeCompleted, activeTotal);
                    activeCompleted++;

                } else if (msg.state === 'progress') {
                    if (msg.completed !== undefined) activeCompleted = msg.completed;
                    if (msg.total !== undefined) activeTotal = msg.total;
                    updateProgressUI(activeCompleted, activeTotal);
                    // 🔴 Update save state on progress
                    localStorage.setItem(`${prefix}_progress_state`, JSON.stringify({ text: editor.value, completed: activeCompleted }));

                } else if (msg.state === 'done') {
                    sessionState = 'complete'; updateBtns();
                    const stateText = document.getElementById(`${prefix}-currentStateText`); if (stateText) stateText.textContent = 'All Prompts Completed';

                    activeCompleted = activeTotal > 0 ? activeTotal : 1;
                    activeTotal = activeCompleted;
                    updateProgressUI(activeCompleted, activeTotal);
                    localStorage.removeItem(`${prefix}_progress_state`); // Clear memory when completely done

                    if (prefix === 'gemini') {
                        window.LiveStats.images += msg.total || activeTotal || 1;
                        window.updateDashboardStat('images', window.LiveStats.images, `+${window.LiveStats.images} this session`, 'positive');
                    } else if (prefix === 'flow') {
                        window.LiveStats.videos += msg.total || activeTotal || 1;
                        window.updateDashboardStat('videos', window.LiveStats.videos, `+${window.LiveStats.videos} this session`, 'positive');
                    }
                }
            });
        }
    });

    // ==========================================
    // ৯. SYSTEM BOOT SEQUENCE (Visual Consoles)
    // ==========================================
    setTimeout(() => {
        if (window.logLine) {
            window.logLine('info', 'System Core initializing...');
            setTimeout(() => window.logLine('ready', 'Orchestrator is online and listening.'), 700);
        }
        if (window.geminiLogLine) {
            window.geminiLogLine('info', 'Gemini Image Engine booted.');
            setTimeout(() => window.geminiLogLine('waiting', 'Awaiting prompt queue...'), 450);
        }
        if (window.flowLogLine) {
            window.flowLogLine('info', 'Flow Video Engine booted.');
            setTimeout(() => window.flowLogLine('waiting', 'Awaiting prompt queue...'), 550);
        }
    }, 600);

    // ==========================================
    // ১০. SYSTEM OVERVIEW AUTO-UPDATER
    // ==========================================
    setInterval(() => {
        const activeWorkers = enabledWorkerIds().length;
        const stageEl = document.querySelector('.page-workspace .stat-card:nth-child(1) .stat-value [data-count-to]');
        if (stageEl) {
            stageEl.dataset.countTo = activeWorkers > 0 ? 2 : 1;
            stageEl.textContent = activeWorkers > 0 ? '2' : '1';
        }

        const collabEl = document.querySelector('.page-workspace .stat-card:nth-child(2) .stat-value [data-count-to]');
        if (collabEl) {
            collabEl.dataset.countTo = activeWorkers;
            collabEl.textContent = activeWorkers;
        }

        const healthEl = document.querySelector('.page-workspace .stat-card:nth-child(3) .stat-value [data-count-to]');
        if (healthEl) {
            const health = activeWorkers === 0 ? 100 : Math.max(80, 100 - (7 - activeWorkers) * 2);
            healthEl.dataset.countTo = health;
            healthEl.textContent = health;
        }

        const reportsEl = document.querySelector('.page-workspace .stat-card:nth-child(4) .stat-value [data-count-to]');
        if (reportsEl) {
            reportsEl.dataset.countTo = window.LiveStats.workflows;
            reportsEl.textContent = window.LiveStats.workflows;
        }
    }, 3000);

// ==========================================
    // ১১. DYNAMIC NOTIFICATION SYSTEM (100% UI Safe + Dynamic Time)
    // ==========================================
    
    // 🔴 সময়ের পার্থক্য বের করার স্মার্ট ফাংশন
    function timeAgo(dateString) {
        if (!dateString) return "Just now";
        const now = new Date();
        const past = new Date(dateString);
        const diffMs = now - past;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        const diffMonth = Math.floor(diffDay / 30);
        const diffYear = Math.floor(diffDay / 365);

        if (diffSec < 60) return "Just now";
        if (diffMin < 60) return `${diffMin} min ago`;
        if (diffHour < 24) return `${diffHour} hr ago`;
        if (diffDay === 1) return "Yesterday";
        if (diffDay < 30) return `${diffDay} days ago`;
        if (diffMonth < 12) return `${diffMonth} mo ago`;
        return `${diffYear} yr ago`;
    }

    async function loadDynamicNotifications() {
        const listContainer = document.getElementById('dynamicNotificationList');
        const badge = document.getElementById('mainNotifBadge');

        if (!listContainer) return;

        try {
            const response = await fetch('../Master_Controller/notifications.json');

            if (!response.ok) {
                listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-tertiary);">No new notifications found.</div>';
                return;
            }

            const notifications = await response.json();
            listContainer.innerHTML = ''; 
            let unreadCount = 0;

            if (notifications.length === 0) {
                listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-tertiary);">No new notifications found.</div>';
                return;
            }

            notifications.forEach(notif => {
                if (!notif.isRead) unreadCount++;

                let iconHtml = '';
                if (notif.iconType === 'system') {
                    iconHtml = `<div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #00c6ff, #0072ff); color: #fff; display: flex; align-items: center; justify-content: center;">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                                </div>`;
                } else {
                    iconHtml = `<div style="width: 40px; height: 40px; border-radius: 50%; background: var(--accent-primary); color: var(--bg-void); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px;">
                                    AR
                                </div>`;
                }

                // 🔴 এখানে timeAgo ফাংশন দিয়ে বর্তমান সময়ের সাথে হিসাব করে স্ট্রিং বানানো হচ্ছে
                const displayTime = notif.timestamp ? timeAgo(notif.timestamp) : (notif.time || "Just now");

                const notifEl = document.createElement('div');
                notifEl.className = `notif-item ${notif.isRead ? 'read' : 'unread'}`;
                notifEl.style.background = notif.isRead ? 'transparent' : (notif.iconType === 'system' ? 'rgba(0, 198, 255, 0.06)' : 'rgba(201, 154, 91, 0.08)');

                notifEl.innerHTML = `
                    <div style="position: relative;">
                      ${iconHtml}
                      <div class="notif-unread-dot" style="opacity: ${notif.isRead ? '0' : '1'}; transform: scale(${notif.isRead ? '0' : '1'});"></div>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
                        <h4 style="margin: 0; font-size: 13px; font-weight: 600; color: ${notif.iconType === 'system' ? '#00c6ff' : 'var(--text-primary)'};">${notif.sender}</h4>
                        <span style="font-size: 11px; color: ${notif.iconType === 'system' ? '#00c6ff' : 'var(--accent-primary)'}; font-weight: 500;">${displayTime}</span>
                      </div>
                      <h5 style="margin: 0; font-size: 12.5px; font-weight: 600; color: var(--text-primary);">${notif.title}</h5>
                      <div class="notif-preview" style="display: block;">${notif.preview}</div>
                      <div class="notif-full-body" style="max-height: 0px; opacity: 0; overflow: hidden; transition: all 0.4s ease;">
                        ${notif.body}
                      </div>
                    </div>
                `;

                notifEl.addEventListener('click', function (e) {
                    e.stopPropagation();
                    const isExpanded = this.classList.contains('expanded');
                    const preview = this.querySelector('.notif-preview');
                    const fullBody = this.querySelector('.notif-full-body');

                    if (isExpanded) {
                        this.classList.remove('expanded');
                        preview.style.display = 'block';
                        fullBody.style.maxHeight = '0px';
                        fullBody.style.opacity = '0';
                        fullBody.style.marginTop = '0px';
                        fullBody.style.paddingTop = '0px';
                        fullBody.style.borderTop = 'none';
                    } else {
                        this.classList.add('expanded');
                        preview.style.display = 'none';
                        fullBody.style.maxHeight = '500px';
                        fullBody.style.opacity = '1';
                        fullBody.style.marginTop = '10px';
                        fullBody.style.paddingTop = '10px';
                        fullBody.style.borderTop = '1px solid rgba(255, 255, 255, 0.05)';
                    }

                    if (this.classList.contains('unread')) {
                        this.classList.replace('unread', 'read');
                        this.style.background = 'transparent';
                        const dot = this.querySelector('.notif-unread-dot');
                        if (dot) { dot.style.opacity = '0'; dot.style.transform = 'scale(0)'; }

                        unreadCount = Math.max(0, unreadCount - 1);
                        if (badge) badge.style.display = unreadCount > 0 ? 'block' : 'none';
                    }
                });

                listContainer.appendChild(notifEl);
            });

            if (badge) badge.style.display = unreadCount > 0 ? 'block' : 'none';

        } catch (err) {
            console.error("Error loading notifications:", err);
            listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-error); font-size: 12px;">Failed to load notifications.</div>';
        }
    }

    setTimeout(loadDynamicNotifications, 500);

// ==========================================
    // ১২. DYNAMIC HELP / DOCUMENTATION SYSTEM
    // ==========================================
    async function loadDynamicHelpDocs() {
        const container = document.getElementById('dynamicHelpContent');
        if (!container) return;

        try {
            const response = await fetch('../Master_Controller/help_docs.json');
            if (!response.ok) throw new Error("Failed to load help docs");

            const data = await response.json();

            let html = `
                <!-- Developer Info & Social Links -->
                <div style="background: rgba(201,154,91,0.05); border: 1px solid rgba(201,154,91,0.2); padding: 16px; border-radius: 8px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <h4 style="color: var(--accent-primary); margin: 0 0 5px 0; font-size: 15px;">${data.appInfo.name} ${data.appInfo.version}</h4>
                    <p style="margin: 0 0 4px 0; color: #fff;"><strong>Developer:</strong> ${data.appInfo.developer}</p>
                    <p style="margin: 0; font-size: 12px;">${data.appInfo.description}</p>
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 8px;">
            `;

            data.socialLinks.forEach(link => {
                html += `
                    <a href="${link.url}" onclick="event.preventDefault(); require('electron').shell.openExternal(this.href);" style="background: ${link.color}; color: #fff; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 11px; display: flex; align-items: center; gap: 6px; transition: 0.2s; cursor: pointer;">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="${link.iconPath}" /></svg>
                      ${link.name}
                    </a>
                `;
            });

            html += `</div></div>`;

            data.documentation.forEach(sec => {
                html += `
                    <h4 style="color: ${sec.titleColor}; margin-bottom: 8px; font-size: 14px;">${sec.title}</h4>
                    ${sec.body}
                `;
            });

            container.innerHTML = html;

        } catch (err) {
            console.error("Error loading help docs:", err);
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-error); font-size: 12px;">Failed to load documentation.<br>Please make sure <b>help_docs.json</b> is saved inside Master_Controller folder.</div>';
        }
    }

    setTimeout(loadDynamicHelpDocs, 600);

}); // <--- এটি আপনার মেইন DOMContentLoaded এর একদম শেষের ক্লোজিং ব্র্যাকেট!