let currentChat = null;
let currentChatId = null;
let vScroll = null;
let flipSender = false;

let searchHighlightIndices = new Set();
let activeSearchIndexValue = -1;
window.isOpenedFromArchive = false;

const mainApp = document.getElementById('main-app');
const lockScreen = document.getElementById('lock-screen');
const passcodeInput = document.getElementById('passcode-input');
const passcodeError = document.getElementById('passcode-error');
window.dbReady = false;
async function waitDBReady() {
    while(!window.dbReady) {
        await new Promise(r => setTimeout(r, 100));
    }
}

let gCalDate = new Date();
window.currentGlobalHitSenders = new Set(); 

window.initGlobalCalendar = async () => {
    const chats = await LineChatDB.getAllChats();
    const stats = {};
    chats.forEach(chat => {
        chat.messages.forEach(m => {
            if (m.date) {
                const dateStr = m.date.replace(/\//g, '-');
                if (!stats[dateStr]) stats[dateStr] = { count: 0, callTime: 0 };
                if (m.type === 'msg') stats[dateStr].count++;
                if (m.callDuration) stats[dateStr].callTime += m.callDuration;
            }
        });
    });
    const year = gCalDate.getFullYear();
    const month = gCalDate.getMonth();
    const monthLabel = findViewById('global-cal-month-label');
    if (monthLabel) monthLabel.textContent = `${year}年 ${month + 1}月`;
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    
    const grid = findViewById('global-calendar-grid');
    if (!grid) return;
    grid.innerHTML = '';
    ['日','月','火','水','木','金','土'].forEach(d => {
        const cell = document.createElement('div');
        cell.className = 'cal-cell cal-header-cell';
        cell.textContent = d;
        grid.appendChild(cell);
    });
    for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement('div'));
    const statsNode = findViewById('global-cal-stats');
    let monthTotal = 0;
    let monthCall = 0;

    for (let d = 1; d <= lastDate; d++) {
        const dateStr = `${year}/${String(month+1).padStart(2,'0')}/${String(d).padStart(2,'0')}`;
        const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        cell.innerHTML = `<span>${d}</span>`;
        const data = stats[dateKey];
        if (data && (data.count > 0 || data.callTime > 0)) {
            cell.classList.add('cal-day_valid');
            if (data.count > 0) {
                monthTotal += data.count;
                cell.innerHTML += `<div class="cal-activity-badge">${data.count}</div>`;
                cell.style.cursor = 'pointer';
                cell.onclick = () => window.showGlobalDailyLogs(dateKey.replace(/-/g, '/'));
            }
            if (data.callTime > 0) {
                monthCall += data.callTime;
                cell.innerHTML += `<div style="font-size:9px; color:#5ac8fa;">☎${formatCallTime(data.callTime)}</div>`;
            }
        }
        grid.appendChild(cell);
    }

    // V36: Constant height (always 6 weeks = 42 cells)
    const currentCells = firstDay + lastDate;
    const remainingCells = 42 - currentCells;
    for (let i = 0; i < remainingCells; i++) {
        const blank = document.createElement('div');
        blank.className = 'cal-cell cal-day_invalid';
        grid.appendChild(blank);
    }
    
    if (statsNode) {
        let text = `月合計: ${monthTotal.toLocaleString()}件`;
        if (monthCall > 0) text += ` / ☎ ${formatCallTime(monthCall)}`;
        else text += ` / ☎ 0:00`;
        statsNode.textContent = text;
    }
};

function setupGlobalCalNav() {
    const prev = findViewById('global-cal-prev-btn');
    const next = findViewById('global-cal-next-btn');
    const monthLabel = findViewById('global-cal-month-label');
    
    if(prev) prev.onclick = () => {
        gCalDate.setMonth(gCalDate.getMonth() - 1);
        window.initGlobalCalendar();
    };
    if(next) next.onclick = () => {
        gCalDate.setMonth(gCalDate.getMonth() + 1);
        window.initGlobalCalendar();
    };
    if(monthLabel) monthLabel.onclick = () => window.renderGlobalMonthList();
}

window.renderGlobalMonthList = async () => {
    const list = findViewById('global-month-list-view');
    const grid = findViewById('global-calendar-grid');
    const prev = findViewById('global-cal-prev-btn');
    const next = findViewById('global-cal-next-btn');
    if (!list) return;

    if (!list.classList.contains('hidden')) {
        window.closeGlobalMonthList();
        return;
    }

    grid.classList.add('hidden');
    grid.style.display = 'none';
    prev.classList.add('hidden');
    next.classList.add('hidden');
    list.classList.add('full-screen');
    list.classList.remove('hidden');

    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '×';
    closeBtn.style = "position:absolute; right:20px; top:20px; font-size:30px; cursor:pointer; z-index:100; color:var(--text-main); font-weight:normal;";
    closeBtn.onclick = window.closeGlobalMonthList;
    list.appendChild(closeBtn);

    const monthStats = {};
    const chats = await LineChatDB.getAllChats();
    let minT = Infinity, maxT = -Infinity;

    chats.forEach(chat => {
        chat.messages.forEach(m => {
            if (m.date && m.date.includes('/')) {
                const parts = m.date.split('/');
                const y = parseInt(parts[0]), m_val = parseInt(parts[1]);
                const mKey = `${y}-${m_val}`;
                const t = y * 12 + (m_val - 1);
                if (t < minT) minT = t;
                if (t > maxT) maxT = t;
                if (!monthStats[mKey]) monthStats[mKey] = { count: 0, call: 0 };
                if (m.type === 'msg') monthStats[mKey].count++;
                if (m.callDuration) monthStats[mKey].call += m.callDuration;
            }
        });
    });

    const listContainer = document.createElement('div');
    listContainer.style.paddingTop = "50px";

    for (let t = maxT; t >= minT; t--) {
        const y = Math.floor(t / 12);
        const m = (t % 12) + 1;
        const mKey = `${y}-${m}`;
        const data = monthStats[mKey] || { count: 0, call: 0 };
        
        const div = document.createElement('div');
        div.className = 'modal-list-item';
        div.style.flexDirection = 'row';
        div.style.justifyContent = 'space-between';
        
        let subText = `${data.count}件`;
        if (data.call > 0) subText += ` / ☎${window.formatCallTime(data.call)}`;
        
        div.innerHTML = `<span style="font-size:16px; font-weight:bold;">${y}年 ${m}月</span> <span style="font-size:14px; color:var(--text-muted);">${subText}</span>`;
        div.onclick = () => {
            gCalDate = new Date(y, m - 1, 1);
            window.closeGlobalMonthList();
            window.initGlobalCalendar();
        };
        listContainer.appendChild(div);
    }
    list.appendChild(listContainer);
};

window.closeGlobalMonthList = () => {
    const list = findViewById('global-month-list-view');
    const grid = findViewById('global-calendar-grid');
    if (!list) return;
    list.innerHTML = '';
    list.classList.remove('full-screen');
    list.classList.add('hidden');
    grid.classList.remove('hidden');
    grid.style.display = 'grid';
    findViewById('global-cal-prev-btn').classList.remove('hidden');
    findViewById('global-cal-next-btn').classList.remove('hidden');
};

window.showGlobalDailyLogs = async (dateStr) => {
    const chats = await LineChatDB.getAllChats();
    let hits = [];
    chats.forEach(chat => {
        chat.messages.forEach((m, idx) => {
            if (m.date === dateStr && m.type === 'msg') {
                hits.push({ chat, message: m, index: idx });
            }
        });
    });

    if (hits.length === 0) {
        if (typeof showToast === 'function') showToast('この日の記録はありません');
        return;
    }

    // Sort by timestamp ascending (Timeline order)
    hits.sort((a, b) => (a.message._timestamp || 0) - (b.message._timestamp || 0));

    const modal = findViewById(UI_MODALS.G_SEARCH);
    const resultsNode = findViewById('global-search-results');
    const titleNode = modal.querySelector('h3');

    // UI Tweak: Transform Search Modal to "Daily Log" mode
    titleNode.innerHTML = `${dateStr} の記録 (<span id="global-search-total-hits">${hits.length}</span>件)`;
    findViewById('global-search-input').style.display = 'none';
    findViewById('global-search-config').style.display = 'none';

    let html = '';
    hits.forEach(h => {
        // V34: Unified HTML with global search and individual search
        html += `<div class="modal-list-item global-hit-card" data-id="${h.chat.id}" data-idx="${h.index}">
            <div class="search-hit-sender">
                <span style="color:var(--primary-color); font-weight:bold;">[${h.chat.title}]</span> 
                <span style="color:#7494c0; margin-left:5px;">${h.message.date || ''}</span> 
                ${h.message.sender} 
                <span style="color:#777; font-weight:normal;">(${h.message.time || ''})</span>
            </div>
            <div class="search-hit-text">${h.message.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        </div>`;
    });
    resultsNode.innerHTML = html;
    
    pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.G_SEARCH });
};

// V21: State Constants
const UI_VIEWS = {
    LIST: 'list',
    ROOM: 'room',
    MANUAL: 'manual',
    LOCK: 'lock',
    FAKE: 'fake',
    FAKE_MEMO: 'fake_memo'
};

const UI_MODALS = {
    SETTINGS: 'settings-modal',
    SEARCH: 'search-modal',
    DATE: 'date-modal',
    FAVORITES: 'favorites-modal',
    ARCHIVED: 'archived-modal',
    MEMO_LIST: 'memo-modal',
    ROOM_SETTINGS: 'room-settings-modal',
    BACKUP_OPT: 'backup-options-modal',
    G_SEARCH: 'global-search-modal',
    G_CAL: 'global-calendar-modal'
};

const listView = document.getElementById('list-view');
const roomView = document.getElementById('room-view');
const chatListContainer = document.getElementById('chat-list');
const fileInput = document.getElementById('file-input');
const backBtn = document.getElementById('back-btn');
const roomTitle = document.getElementById('room-title');
const flipBtn = document.getElementById('flip-btn');
const roomFileInput = document.getElementById('room-file-input');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-modal');
const manualBtn = document.getElementById('manual-btn');
const manualModal = document.getElementById('manual-modal');
const closeManualBtn = document.getElementById('close-manual-modal');

const passToggle = document.getElementById('password-toggle');
const passSetupContainer = document.getElementById('password-setup-container');
const newPassInput = document.getElementById('new-password');
const savePassBtn = document.getElementById('save-password-btn');

const themeSelect = document.getElementById('theme-select');
const toastNode = document.getElementById('toast');
const contextMenu = document.getElementById('context-menu');
const ctxRename = document.getElementById('ctx-rename');
const ctxDelete = document.getElementById('ctx-delete');
const ctxAdd = document.getElementById('ctx-add');
let contextTargetId = null;

const iconDisplay = document.getElementById('room-icon-display');
const iconText = document.getElementById('room-icon-text');
const iconInput = document.getElementById('icon-input');

const listContainer = document.getElementById('message-list');
const scrollContainer = document.getElementById('message-container');
const spacerContainer = document.getElementById('virtual-spacer');

vScroll = new VirtualScroll(scrollContainer, listContainer, spacerContainer);

let tooltipTimer = null;
const scrollDateLabel = document.getElementById('scroll-date-label');
const longpressTooltip = document.getElementById('longpress-tooltip');

function showToast(msg) {
    toastNode.textContent = msg;
    toastNode.classList.add('show');
    setTimeout(() => {
        toastNode.classList.remove('show');
    }, 3000);
}

function showLoading() {
    const loader = document.getElementById('loading-overlay');
    if (loader) {
        loader.classList.remove('hidden');
        loader.style.display = 'flex';
    }
}

function hideLoading() {
    const loader = document.getElementById('loading-overlay');
    if (loader) {
        loader.classList.add('hidden');
        loader.style.display = 'none';
    }
}

function applyTheme(theme) {
    if (theme === 'system') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
}
const savedTheme = localStorage.getItem('app_theme') || 'system';
themeSelect.value = savedTheme;
applyTheme(savedTheme);

themeSelect.addEventListener('change', (e) => {
    localStorage.setItem('app_theme', e.target.value);
    applyTheme(e.target.value);
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu') && !e.target.closest('.chat-item-wrapper')) {
        contextMenu.classList.remove('active');
    }
});

// V23: Event Delegation for Chat List
if (chatListContainer) {
    chatListContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.chat-item');
        if (item && item.dataset.id) {
            console.log('トークがクリックされました (List):', item.dataset.id);
            window.isOpenedFromArchive = false;
            openChat(item.dataset.id);
        }
    });
}
// V23: Event Delegation for Archived List
const archivedListContainer = document.getElementById('archived-list');
if (archivedListContainer) {
    archivedListContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.chat-item');
        if (item && item.dataset.id) {
            console.log('トークがクリックされました (Archive):', item.dataset.id);
            window.isOpenedFromArchive = true;
            openChat(item.dataset.id);
        }
    });
}

ctxRename.addEventListener('click', async () => {
    contextMenu.classList.remove('active');
    if (!contextTargetId) return;
    const chat = await LineChatDB.getChatById(contextTargetId);
    if (!chat) return;
    const newName = prompt('新しい名前を入力してください：', chat.title);
    if (newName && newName.trim() !== '') {
        chat.title = newName.trim();
        await LineChatDB.updateChat(chat);
        await loadChatList();
        showToast('名前を変更しました');
    }
});

ctxDelete.addEventListener('click', async () => {
    contextMenu.classList.remove('active');
    if (!contextTargetId) return;
    const confirmDelete = confirm('このトーク履歴を完全に削除しますか？\n（元に戻せません）');
    if (confirmDelete) {
        await LineChatDB.deleteChat(contextTargetId);
        await loadChatList();
        showToast('トークを削除しました');
    }
});

// -- Crypto & Boot --
async function hashStr(str) {
    if (crypto.subtle) {
        const raw = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', raw);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
        // Fallback for file:// or unsecure HTTP
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash.toString(16);
    }
}

async function initCrypto(passcode) {
    let saltB64 = localStorage.getItem('app_crypto_salt');
    let salt;
    if (!saltB64) {
        salt = ArkiveCrypto.generateSalt();
        localStorage.setItem('app_crypto_salt', ArkiveCrypto.saltToBase64(salt));
    } else {
        salt = ArkiveCrypto.base64ToSalt(saltB64);
    }
    // V21: Always encrypt with at least ark_default_secret
    const key = await ArkiveCrypto.deriveKey(passcode || "ark_default_secret", salt);
    LineChatDB.setKey(key);
}

async function initApp(isRestore = false) {
    // V20-21: Unified initialization
    await LineChatDB.init(); 
    window.dbReady = true;
    if (!isRestore) {
        // Initial state for History API
        history.replaceState({ view: UI_VIEWS.LIST }, "");
    }
    currentChat = null;
    currentChatId = null;
    window.isFakeMode = false;
    
    // Hide all main views
    roomView.classList.remove('active');
    listView.classList.add('active');
    findViewById('manual-view').style.display = 'none';
    findViewById('fake-app').style.display = 'none';
    
    await loadChatList();
    initV21();
}

function findViewById(id) { return document.getElementById(id); }

/**
 * V21 History API Navigation
 */
window.pushViewState = function(state) {
    history.pushState(state, "");
    applyState(state);
};

window.onpopstate = function(event) {
    if (event.state) {
        applyState(event.state);
    } else {
        // Default to list if empty
        applyState({ view: UI_VIEWS.LIST });
    }
};

async function applyState(state) {
    const views = [listView, roomView, findViewById('manual-view'), findViewById('fake-app')];
    try {
        await waitDBReady();
        closeAllModals(false); // Close modals without pushing state
        
        views.forEach(v => { v.style.display = 'none'; v.classList.remove('active'); });

        if (state.view === UI_VIEWS.LIST) {
            listView.style.display = 'flex';
            listView.classList.add('active');
            await loadChatList();
        } else if (state.view === UI_VIEWS.ROOM && state.chatId) {
            roomView.style.display = 'flex';
            roomView.classList.add('active');
            await openChatInternal(Number(state.chatId));
        } else if (state.view === UI_VIEWS.MANUAL) {
            findViewById('manual-view').style.display = 'flex';
            findViewById('manual-view').classList.add('active');
        } else if (state.view === UI_VIEWS.FAKE) {
            initFakeModeInternal();
        }

        if (state.modal) {
            if (state.modal === UI_MODALS.MEMO_LIST) {
                initMemoInternal();
            } else if (state.modal === UI_MODALS.SETTINGS) {
                openSettingsInternal();
            } else if (state.modal === UI_MODALS.ARCHIVED) {
                renderArchivedList();
                archivedModal.classList.remove('hidden');
            } else if (state.modal === UI_MODALS.FAVORITES) {
                openFavs(state.chatId);
            } else if (state.modal === UI_MODALS.G_SEARCH) {
                // V33: Reset Search UI (might have been hidden by Daily Logs)
                const gModal = findViewById(UI_MODALS.G_SEARCH);
                gModal.querySelector('h3').innerHTML = `全トーク横断検索 (<span id="global-search-total-hits">0</span>件)`;
                findViewById('global-search-input').style.display = 'block';
                findViewById('global-search-config').style.display = 'flex';
                gModal.classList.remove('hidden');
                findViewById('global-search-input').focus();
            } else if (state.modal === UI_MODALS.G_CAL) {
                // V30: Safe global call
                if (typeof window.initGlobalCalendar === 'function') {
                    await window.initGlobalCalendar();
                } else {
                    console.warn('initGlobalCalendar is not ready yet');
                }
                findViewById(UI_MODALS.G_CAL).classList.remove('hidden');
            } else {
                const modal = findViewById(state.modal);
                if (modal) modal.classList.remove('hidden');
            }
        }
    } catch (e) {
        console.error('applyState error:', e);
        // V30: Fail-safe recovery to List View
        views.forEach(v => { v.style.display = 'none'; v.classList.remove('active'); });
        listView.style.display = 'flex';
        listView.classList.add('active');
        alert('画面切り替え時にエラーが発生しましたが、一覧に復帰しました。');
    }
}

function closeAllModals(push = true) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(m => m.classList.add('hidden'));
    
    // If we closed a modal, we might need to update the history state if it was a push
    // For simplicity, closeAllModals(false) is used in applyState.
}

document.addEventListener('DOMContentLoaded', async () => {
    const savedHash = localStorage.getItem('app_password_hash');
    const fakeHash = localStorage.getItem('app_fake_password_hash');

    // V15-21 Auth Logic
    if (!savedHash && !fakeHash) {
        if (!window.crypto || !window.crypto.subtle) {
            alert('環境エラー: HTTPSまたはlocalhostが必要です');
            return;
        }
        lockScreen.style.display = 'none';
        mainApp.style.display = 'flex';
        await initCrypto(""); // uses default secret internally in v21
        await initApp();
        return;
    }

    lockScreen.style.display = 'flex';
    let passcodeFailCount = 0;
    let passcodeLockEndTime = 0;
    let lockInterval = null;

    const updateLockDisplay = () => {
        if (Date.now() < passcodeLockEndTime) {
            const remain = Math.ceil((passcodeLockEndTime - Date.now()) / 1000);
            passcodeError.textContent = `ロック中です。あと ${remain} 秒`;
            return true;
        } else {
            if (lockInterval) {
                clearInterval(lockInterval);
                lockInterval = null;
                passcodeError.textContent = '再度入力してください';
            }
            return false;
        }
    };

    const tryUnlock = async () => {
        try {
            if (!window.crypto || !window.crypto.subtle) {
                alert('暗号化機能（Web Crypto API）がサポートされていない環境です。HTTPS環境またはlocalhostで実行してください。');
                return;
            }

            if (updateLockDisplay()) return;
            const inputVal = (passcodeInput.value || "").trim();
            
            // ログなどは出さないが内部でハッシュ化
            const currentHash = await hashStr(inputVal);
            passcodeError.textContent = '';

            // [6.2] Fake set, Real not set logic
            if (!savedHash && fakeHash) {
                if (inputVal === "") {
                    // Empty OK -> Real
                    lockScreen.style.display = 'none';
                    mainApp.style.display = 'flex';
                    await initCrypto("");
                    await initApp();
                } else if (currentHash === fakeHash) {
                    // Fake passcode -> Fake Mode
                    lockScreen.style.display = 'none';
                    await initCrypto(inputVal);
                    initFakeMode();
                } else {
                    passcodeError.textContent = "パスコードが正しくありません";
                    passcodeInput.value = '';
                }
                return;
            }

            // Both set or Real set
            if (fakeHash && currentHash === fakeHash) {
                lockScreen.style.display = 'none';
                await initCrypto(inputVal);
                initFakeMode();
                return;
            }

            if (savedHash && currentHash === savedHash) {
                lockScreen.style.display = 'none';
                mainApp.style.display = 'flex';
                passcodeFailCount = 0;
                await initCrypto(inputVal);
                await initApp(); // V20: Unified init
            } else if (savedHash || fakeHash) {
                // 不一致時の処理
                passcodeFailCount++;
                passcodeInput.value = '';
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                
                // ポップアップは不要（画面表示のみ）

                if (passcodeFailCount >= 3) {
                    const lockSeconds = 10 * Math.pow(2, passcodeFailCount - 3);
                    passcodeLockEndTime = Date.now() + lockSeconds * 1000;
                    lockInterval = setInterval(updateLockDisplay, 1000);
                    updateLockDisplay();
                } else {
                    passcodeError.textContent = `パスワードが違います（${passcodeFailCount}回失敗）`;
                }
            }
        } catch (e) {
            console.error('Unlock fatal error:', e);
            alert('認証処理中にエラーが発生しました: ' + e.message);
        }
    };

    const lockForm = document.getElementById('lock-form');
    lockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await tryUnlock();
    });

    document.querySelectorAll('.key-btn').forEach(btn => {
        btn.addEventListener('pointerdown', async (e) => {
            if (Date.now() < passcodeLockEndTime) return e.preventDefault();
            if (btn.type === 'submit') return;
            e.preventDefault();
            const val = btn.textContent;
            if (val === 'Del') {
                passcodeInput.value = passcodeInput.value.slice(0, -1);
            } else {
                passcodeInput.value += val;
            }
            passcodeInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });
});

// -- Settings Modal --
settingsBtn.onclick = () => {
    // V22: Use pushViewState
    pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.SETTINGS });
};

// Internal open logic called by applyState
function openSettingsInternal() {
    const confirmPassInput = document.getElementById('confirm-password');
    const fakePassInput = document.getElementById('fake-password');
    const confirmFakePassInput = document.getElementById('confirm-fake-password');
    
    passToggle.checked = !!localStorage.getItem('app_password_hash');
    passSetupContainer.style.display = passToggle.checked ? 'block' : 'none';
    
    newPassInput.value = '';
    confirmPassInput.value = '';
    fakePassInput.value = '';
    confirmFakePassInput.value = '';
    
    settingsModal.classList.remove('hidden');
}
closeSettingsBtn.onclick = () => history.back();

if (manualBtn) manualBtn.onclick = () => pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.MANUAL });
if (closeManualBtn) closeManualBtn.onclick = () => history.back();

passToggle.onchange = async () => {
    if (passToggle.checked) {
        passSetupContainer.style.display = 'block';
    } else {
        if (!confirm('パスコードを無効にしますか？データは暗号化されずに保存されるようになります。')) {
            passToggle.checked = true;
            return;
        }
        showLoading();
        try {
            // 1. 旧鍵でデータを読み出し
            const chats = await LineChatDB.getAllChats();
            const settings = await LineChatDB.getAllSettings();

            // 2. 鍵の設定をクリア
            passSetupContainer.style.display = 'none';
            localStorage.removeItem('app_password_hash');
            localStorage.removeItem('app_fake_password_hash');
            await initCrypto(""); // デフォルト（平文）鍵に更新

            // 3. 新しい状態ですべて保存し直し
            for (const chat of chats) {
                await LineChatDB.updateChat(chat);
            }
            for (const key in settings) {
                await LineChatDB.setSetting(key, settings[key]);
            }

            showToast('パスコードロックを無効にしました');
        } catch (err) {
            console.error('Disable passcode error:', err);
            alert('無効化処理中にエラーが発生しました。');
            passToggle.checked = true;
        } finally {
            hideLoading();
        }
    }
};

    const passSetupContainerForm = document.getElementById('password-setup-container');
    passSetupContainerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const val = newPassInput.value;
        const confirmVal = document.getElementById('confirm-password').value;
        const fakeVal = document.getElementById('fake-password').value;
        const confirmFakeVal = document.getElementById('confirm-fake-password').value;
        
        if (val.length === 0) {
            alert('本物のパスコードを入力してください。');
            return;
        }
        if (val !== confirmVal) {
            alert('確認用パスコードが一致しません。');
            return;
        }
        
        savePassBtn.disabled = true;
        showLoading();
        try {
            // 1. まず現在の有効な鍵ですべてのデータを取得（退避）
            const chats = await LineChatDB.getAllChats();
            const settings = await LineChatDB.getAllSettings();

            // 2. 新しいパスコードでハッシュと鍵を更新
            const hash = await hashStr(val);
            localStorage.setItem('app_password_hash', hash);
            
            if (fakeVal !== "") {
                if (fakeVal !== confirmFakeVal) {
                    alert('偽パスコードの確認が一致しません。');
                    savePassBtn.disabled = false;
                    hideLoading();
                    return;
                }
                const fHash = await hashStr(fakeVal);
                localStorage.setItem('app_fake_password_hash', fHash);
            } else {
                localStorage.removeItem('app_fake_password_hash');
            }
            
            // 3. LineChatDB の鍵を新パスコードに更新
            await initCrypto(val);

            // 4. 退避しておいたデータを新鍵で保存し直し（再暗号化）
            for (const chat of chats) {
                await LineChatDB.updateChat(chat);
            }
            for (const key in settings) {
                await LineChatDB.setSetting(key, settings[key]);
            }
            
            passToggle.checked = true;
            showToast('パスコードとデータを更新しました');
            settingsModal.classList.add('hidden');
            
            // UI更新
            await loadChatList();
            roomView.classList.remove('active');
            listView.classList.add('active');
            currentChat = null;
        } catch (err) {
            console.error('Save passcode error:', err);
            alert('パスワードの保存または再暗号化中にエラーが発生しました。');
        } finally {
            savePassBtn.disabled = false;
            hideLoading();
        }
    });

function showTooltip(text, x, y) {
    longpressTooltip.textContent = text;
    longpressTooltip.style.left = `${x}px`;
    longpressTooltip.style.top = `${y}px`;
    longpressTooltip.classList.remove('hidden');
    if (navigator.vibrate) navigator.vibrate(20);
}

function hideTooltip() {
    longpressTooltip.classList.add('hidden');
}

vScroll.setScrollCallback((startIndex) => {
    if (!currentChat || !currentChat.messages) return;
    const msg = currentChat.messages[startIndex];
    if (msg) {
        if (msg.date) {
            scrollDateLabel.textContent = msg.date;
        } else if (msg.type === 'date') {
            const match = msg.text.match(/^(\d{4}\/\d{1,2}\/\d{1,2})/);
            if (match) scrollDateLabel.textContent = match[1];
        }
    }
});

vScroll.setRenderer((item, index) => {
    const el = document.createElement('div');
    el.className = 'message-row';

    if (item.type === 'date') {
        el.innerHTML = `<div class="date-label">${item.text}</div>`;
    } else if (item.type === 'sys') {
        el.innerHTML = `<div class="date-label" style="opacity:0.8; font-weight:normal;">${item.text}</div>`;
    } else {
        let isSelfMsg = false;
        if (currentChat && currentChat.myName) {
            isSelfMsg = (item.sender === currentChat.myName);
        }
        if (flipSender) isSelfMsg = !isSelfMsg;
        
        const isHighlight = searchHighlightIndices.has(index);
        const isActiveHighlight = (index === activeSearchIndexValue);
        
        let safeText = item.text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        if (isHighlight && window.searchKeyword) {
            try {
                const escapedKeyword = window.searchKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${escapedKeyword})`, 'gi');
                safeText = safeText.replace(regex, '<mark>$1</mark>');
            } catch(e){}
        }
        
        let formattedText = safeText.replace(/\n/g, '<br>');
        formattedText = formattedText.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

        let isConsecutive = false;
        if (index > 0) {
            const prev = currentChat.messages[index - 1];
            if (prev.type === 'msg' && prev.sender === item.sender) {
                isConsecutive = true;
            }
        }
        let isNextSameTime = false;
        if (index < currentChat.messages.length - 1) {
            const next = currentChat.messages[index + 1];
            if (next.type === 'msg' && next.sender === item.sender && next.time === item.time) {
                isNextSameTime = true;
            }
        }

        const activeClass = isActiveHighlight ? 'active-highlight' : '';

        let senderInitial = (item.sender || '？').charAt(0).toUpperCase();
        let bgStyle = '';
        let initText = senderInitial;

        if (currentChat && currentChat.userIcons && currentChat.userIcons[item.sender]) {
            bgStyle = `background-image: url('${currentChat.userIcons[item.sender]}'); background-size: cover; background-position: center; border: 1px solid var(--border-color); color: transparent;`;
            initText = '';
        } else {
            bgStyle = `background:var(--primary-color); display:flex; align-items:center; justify-content:center; color:var(--surface-color); font-weight:bold; font-size:14px;`;
        }
        
        let iconHtml = '';
        let nameHtml = '';
        
        if (!isSelfMsg) {
            if (isConsecutive) {
                iconHtml = `<div class="user-icon" style="background:transparent; border:none; visibility:hidden;"></div>`;
            } else {
                iconHtml = `<div class="user-icon" title="${item.sender}" style="${bgStyle}">${initText}</div>`;
                nameHtml = '';
            }
        }

        const starHtml = item.isFavorite ? `<div class="favorite-star">★</div>` : '';
        const timeHtml = isNextSameTime ? `<div style="width: 30px;"></div>` : `<div class="time" style="margin:0 4px;">${item.time}</div>`;
        const alignFlex = isSelfMsg ? 'flex-end' : 'flex-start';
        const rowDir = isSelfMsg ? 'row-reverse' : 'row';
        const marginTop = isConsecutive ? '2px' : '12px';

        el.innerHTML = `
            <div class="message-wrapper ${isSelfMsg ? 'sent' : 'received'} ${activeClass}" style="margin-top: ${marginTop}; width:100%; max-width:100%;">
                ${iconHtml}
                <div style="display: flex; flex-direction: column; align-items: ${alignFlex}; max-width: calc(100% - 40px); position:relative;">
                    ${starHtml}
                    <div style="display: flex; align-items: flex-end; flex-direction: ${rowDir};">
                        <div class="bubble">${formattedText}</div>
                        ${timeHtml}
                    </div>
                </div>
            </div>
        `;

        // V12: Long press for favorite
        let pressTimer;
        const bubbleEl = el.querySelector('.bubble');
        const startPress = (e) => {
            pressTimer = setTimeout(async () => {
                item.isFavorite = !item.isFavorite;
                await LineChatDB.updateChat(currentChat);
                vScroll.updateVisibleItems(true);
                showToast(item.isFavorite ? 'お気に入りに追加しました' : '解除しました');
                if (navigator.vibrate) navigator.vibrate(30);
            }, 600);
        };
        const cancelPress = () => clearTimeout(pressTimer);
        bubbleEl.addEventListener('touchstart', startPress, {passive:true});
        bubbleEl.addEventListener('touchend', cancelPress, {passive:true});
        bubbleEl.addEventListener('mousedown', startPress);
        bubbleEl.addEventListener('mouseup', cancelPress);
    }
    return el;
});



let openSwipeElement = null;

async function loadChatList(showArchived = false) {
    const allChats = await LineChatDB.getAllChats();
    const chats = allChats.filter(c => !!c.isArchived === showArchived);
    chatListContainer.innerHTML = '';
    
    if (chats.length === 0) {
        const msg = showArchived ? 'アーカイブされたトークはありません' : 'トーク履歴がありません。<br>右上の「＋」ボタンから新しいファイルを読み込んでください。';
        chatListContainer.innerHTML = `<div style="padding:40px 20px; text-align:center; color:var(--text-muted); font-size:14px; line-height:1.6;">${msg}</div>`;
        return;
    }
    
    chats.reverse().forEach(chat => {
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-item-wrapper';
        
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'delete-btn-bg';
        deleteBtn.textContent = '削除';
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            const confirmDelete = confirm('このトーク履歴を完全に削除しますか？\n（この操作は元に戻せません）');
            if (confirmDelete) {
                await LineChatDB.deleteChat(chat.id);
                showToast('削除しました');
                await loadChatList();
            } else {
                div.style.transform = `translateX(0px)`;
                openSwipeElement = null;
            }
        };
        wrapper.appendChild(deleteBtn);

        const div = document.createElement('div');
        div.className = 'chat-item';
        div.dataset.id = chat.id;
        // V23: イベント委譲を利用するため、個別の onclick は設定しない

        // 右クリック（PC）または一部モバイルブラウザのネイティブ長押しで削除メニューを出す代替
        div.oncontextmenu = (e) => {
            e.preventDefault();
            contextTargetId = chat.id;
            
            let cx = e.clientX, cy = e.clientY;
            if (e.touches && e.touches.length > 0) {
                cx = e.touches[0].clientX;
                cy = e.touches[0].clientY;
            }
            
            contextMenu.style.left = `${Math.min(cx, window.innerWidth - 160)}px`;
            contextMenu.style.top = `${Math.min(cy, window.innerHeight - 100)}px`;
            contextMenu.classList.add('active');
        };

        // もしスワイプ要素が開いたまま他をタップされたら閉じるための最低限の処理
        div.addEventListener('touchstart', (e) => {
            if (openSwipeElement && openSwipeElement !== div) {
                openSwipeElement.style.transform = `translateX(0px)`;
                openSwipeElement = null;
            }
        }, {passive: true});
        
        const sizeStr = chat.sizeKB ? `${chat.sizeKB.toLocaleString()} KB` : '';
        const dateRangeStr = (chat.firstDate && chat.lastDate && chat.firstDate !== chat.lastDate) 
            ? `${chat.firstDate} 〜 ${chat.lastDate}` 
            : (chat.firstDate || chat.date || '日付不明');
            
        const iconStyle = chat.icon ? `background-image: url(${chat.icon});` : '';
        const iconTextNode = chat.icon ? '' : (chat.title || '？').charAt(0);
        
        div.innerHTML = `
            <div class="chat-info">
                <div class="chat-icon list-icon-edit" style="${iconStyle} cursor:pointer;" title="アイコンを変更">${iconTextNode}</div>
                <div class="chat-desc">
                    <h3 class="list-title-edit" style="cursor:pointer;" title="名前を変更">${chat.title}</h3>
                    <p>${chat.lastMessageText || 'メッセージなし'}</p>
                </div>
            </div>
            <div class="chat-meta">
                <div class="chat-date">${dateRangeStr}</div>
                <div style="display:flex; gap:5px;">
                    ${sizeStr ? `<span class="chat-badge">${sizeStr}</span>` : ''}
                    <span class="chat-badge">${(chat.messages || []).length.toLocaleString()}件</span>
                </div>
            </div>
        `;
        
        wrapper.appendChild(div);
        
        const titleEl = div.querySelector('.list-title-edit');
        if (titleEl) {
            titleEl.onclick = async (e) => {
                e.stopPropagation();
                const newName = prompt('トークルーム名を変更:', chat.title);
                if (newName && newName.trim() !== '') {
                    chat.title = newName.trim();
                    await LineChatDB.updateChat(chat);
                    await loadChatList();
                    showToast('名前を変更しました');
                }
            };
        }
        
        const iconEl = div.querySelector('.list-icon-edit');
        if (iconEl) {
            iconEl.onclick = (e) => {
                e.stopPropagation();
                const tempInput = document.createElement('input');
                tempInput.type = 'file';
                tempInput.accept = 'image/*';
                tempInput.onchange = async (ev) => {
                    const file = ev.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const img = new Image();
                        img.onload = async () => {
                            const canvas = document.createElement('canvas');
                            const MAX_SIZE = 120;
                            let width = img.width;
                            let height = img.height;
                            if (width > height) {
                                if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
                            } else {
                                if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
                            }
                            canvas.width = width; canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, width, height);
                            
                            chat.icon = canvas.toDataURL('image/jpeg', 0.8);
                            await LineChatDB.updateChat(chat);
                            await loadChatList();
                            showToast('アイコンを変更しました');
                        };
                        img.src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                };
                tempInput.click();
            };
        }

        chatListContainer.appendChild(wrapper);
    });
}

function promptMergeMapping(newSenders, existingSenders, defaultTitle) {
    return new Promise(resolve => {
        const modal = document.getElementById('merge-mapping-modal');
        const listDiv = document.getElementById('merge-mapping-list');
        const applyBtn = document.getElementById('merge-mapping-apply-btn');
        const closeBtn = document.getElementById('close-merge-mapping-modal');
        const titleInput = document.getElementById('import-mapping-title');
        
        modal.classList.remove('hidden');
        titleInput.value = defaultTitle;
        listDiv.innerHTML = '';
        
        // DataList for autocomplete
        const dsId = 'existing-senders-list';
        let ds = document.getElementById(dsId);
        if(!ds) {
            ds = document.createElement('datalist');
            ds.id = dsId;
            document.body.appendChild(ds);
        }
        ds.innerHTML = existingSenders.map(es => `<option value="${es}"></option>`).join('');
        
        const inputNodes = [];
        
        if (newSenders.length === 0) {
            listDiv.innerHTML = '<p style="padding:20px; text-align:center; font-size:14px; color:var(--text-muted);">新しい発言者は見つかりませんでした。</p>';
        } else {
            newSenders.forEach(ns => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.justifyContent = 'space-between';
                row.style.background = 'var(--surface-color)';
                row.style.padding = '10px';
                row.style.borderRadius = '10px';
                row.style.border = '1px solid var(--border-color)';
                row.style.marginBottom = '8px';
                
                row.innerHTML = `
                    <span style="font-weight:bold; font-size:14px; width:40%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${ns}</span>
                    <span style="font-size:12px; color:var(--text-muted);">→</span>
                    <input type="text" list="${dsId}" placeholder="名前を編集" value="${ns}" style="width:45%; padding:8px; border-radius:8px; border:1px solid var(--border-color); font-size:14px; background:var(--bg-color); color:var(--text-main);" data-new-sender="${ns.replace(/"/g, '&quot;')}">
                `;
                listDiv.appendChild(row);
                inputNodes.push(row.querySelector('input'));
            });
        }
        
        const cleanup = () => {
            modal.classList.add('hidden');
            applyBtn.removeEventListener('click', applyHandler);
            closeBtn.removeEventListener('click', closeHandler);
        };
        const closeHandler = () => { cleanup(); resolve(null); };
        const applyHandler = () => {
            const mapping = {};
            inputNodes.forEach(node => {
                mapping[node.dataset.newSender] = node.value.trim();
            });
            const finalTitle = titleInput.value.trim() || defaultTitle;
            cleanup();
            resolve({ title: finalTitle, mapping });
        };
        
        closeBtn.addEventListener('click', closeHandler);
        applyBtn.addEventListener('click', applyHandler);
    });
}

async function processFiles(files, targetChat = null) {
    if (!files || !files.length) return;
    
    showLoading();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    let successCount = 0;
    let totalMessages = 0;
    
    try {
        for (const file of files) {
            try {
                const text = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = () => reject('Read error');
                    reader.readAsText(file);
                });
                
                const sizeKB = Math.round(file.size / 1024);
                const parsed = detectAndParse(text, file.name, sizeKB);
                
                if (!parsed || !parsed.messages || parsed.messages.length === 0) {
                    continue;
                }
                parsed.originalFilename = file.name;

                // V20: Always show setup/preview modal
                hideLoading(); // Close loading to show modal
                
                const existingChats = await LineChatDB.getAllChats();
                const existingTitles = existingChats.map(c => c.title);
                const allSenders = Array.from(new Set(existingChats.flatMap(c => {
                    if(!c.messages) return [];
                    return c.messages.filter(m => m.type === 'msg').map(m => m.sender);
                })));
                
                const newSenders = Array.from(new Set(parsed.messages.filter(m => m.type === 'msg').map(m => m.sender)));
                
                const previewResult = await promptMergeMapping(newSenders, allSenders, parsed.title);
                if (!previewResult) continue; // Cancelled
                
                showLoading(); // Back to processing
                
                parsed.title = previewResult.title;
                // Apply sender mapping
                parsed.messages.forEach(m => {
                    if (m.type === 'msg' && previewResult.mapping[m.sender]) {
                        m.sender = previewResult.mapping[m.sender];
                    }
                });

                // Check for existing chat with the same title for merge
                const tempMatch = await LineChatDB.getChatByTitle(parsed.title);
                let existingChat = targetChat || tempMatch;

                if (existingChat) {
                    // Optimized Merge logic
                    const existingSet = new Set();
                    existingChat.messages.forEach(m => {
                        if (m.type === 'msg' || m.type === 'sys') {
                            existingSet.add(`${m.date}_${m.time}_${m.sender||''}_${m.text}`);
                        }
                    });
                    
                    let added = 0;
                    parsed.messages.forEach(m => {
                        if (m.type === 'date') return;
                        const key = `${m.date}_${m.time}_${m.sender||''}_${m.text}`;
                        if (!existingSet.has(key)) {
                            existingChat.messages.push(m);
                            added++;
                        }
                    });
                    
                    if (added > 0) {
                        existingChat.messages.sort((a, b) => (a._timestamp || 0) - (b._timestamp || 0));
                        const rebuilt = [];
                        let lastD = "";
                        existingChat.messages.forEach(m => {
                            if (m.type === 'date') return;
                            if (m.date && m.date !== lastD) {
                                rebuilt.push({ type: 'date', text: m.date, date: m.date, _timestamp: getSafeTimestamp(m.date, "00:00")});
                                lastD = m.date;
                            }
                            rebuilt.push(m);
                        });
                        existingChat.messages = rebuilt;
                        existingChat.sizeKB = (existingChat.sizeKB || 0) + sizeKB;
                        
                        await LineChatDB.updateChat(existingChat);
                        successCount++;
                        totalMessages += added;
                    }
                } else {
                    await LineChatDB.saveChat(parsed);
                    successCount++;
                    totalMessages += parsed.messages.filter(m => m.type !== 'date').length;
                }
            } catch (err) {
                console.error(`Import failed for ${file.name}:`, err);
                alert(`失敗：${err.message}`);
            }
        }
    } finally {
        hideLoading();
    }
    
    if (successCount > 0) {
        showToast(`${successCount}件のファイルを処理しました`);
        await loadChatList();
    }
}

const archivedModal = document.getElementById('archived-modal');
const roomSettingsModal = document.getElementById('room-settings-modal');
const closeRoomSettingsModal = document.getElementById('close-room-settings-modal');
const roomSettingsTitle = document.getElementById('room-settings-title');
const roomSettingsMembers = document.getElementById('room-settings-members');
const roomSettingsExportBtn = document.getElementById('room-settings-export-btn');
const roomSettingsApplyBtn = document.getElementById('room-settings-apply-btn');

let tempNameMap = {};
let tempIconMap = {};
let tempMainIconTarget = null;
let targetSenderForIcon = null;
fileInput.addEventListener('change', async (e) => {
    await processFiles(e.target.files);
    e.target.value = '';
});

roomFileInput.addEventListener('change', async (e) => {
    if (!currentChat) return;
    await processFiles(e.target.files, currentChat);
    e.target.value = '';
    await openChat(currentChat.id); // reload view
});

ctxAdd.addEventListener('click', async () => {
    contextMenu.classList.remove('active');
    if (!contextTargetId) return;
    const chat = await LineChatDB.getChatById(contextTargetId);
    if (!chat) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.multiple = true;
    input.onchange = async (e) => {
        await processFiles(e.target.files, chat);
    };
    input.click();
});

// -- Room Settings & UI --

const roomSettingsBtn = document.getElementById('room-settings-btn');

function renderRoomSettingsMembers(senders) {
    roomSettingsMembers.innerHTML = '';
    senders.forEach((s) => {
        tempNameMap[s] = tempNameMap[s] || s;
        
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '10px';
        div.style.marginBottom = '10px';
        
        let iconHtml = '';
        if (tempIconMap[s]) {
            iconHtml = `<div class="user-icon s-icon" style="background-image:url('${tempIconMap[s]}'); background-size:cover; cursor:pointer;" title="アイコン変更"></div>`;
        } else {
            const initial = (s || "？").charAt(0).toUpperCase();
            iconHtml = `<div class="user-icon s-icon" style="background:var(--primary-color); color:white; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="アイコン変更">${initial}</div>`;
        }
        
        div.innerHTML = `
            <input type="radio" name="main-icon" value="${s}" style="width:20px;height:20px; cursor:pointer;" title="代表アイコンにする" ${(currentChat.icon === tempIconMap[s] && tempIconMap[s]) ? 'checked' : ''}>
            ${iconHtml}
            <input type="text" class="s-name" value="${tempNameMap[s]}" style="flex:1; padding:8px; border:1px solid var(--border-color); border-radius:4px; font-size:14px; background:var(--bg-color); color:var(--text-main);">
        `;
        
        const sIcon = div.querySelector('.s-icon');
        sIcon.onclick = () => {
            targetSenderForIcon = s;
            document.getElementById('icon-input').click();
        };
        
        const sName = div.querySelector('.s-name');
        sName.oninput = (e) => {
            tempNameMap[s] = e.target.value.trim();
        };
        
        const radio = div.querySelector('input[type="radio"]');
        radio.onchange = () => {
            if(radio.checked) tempMainIconTarget = s;
        };
        
        roomSettingsMembers.appendChild(div);
    });
}

if (roomSettingsBtn) {
    roomSettingsBtn.addEventListener('click', () => {
        if (!currentChat) return;
        
        roomSettingsTitle.value = currentChat.title;
        const origFileSpan = document.getElementById('room-settings-original-file');
        if (origFileSpan) {
            origFileSpan.textContent = currentChat.originalFilename || '未設定';
        }
        
        tempNameMap = {};
        tempIconMap = Object.assign({}, currentChat.userIcons || {});
        tempMainIconTarget = null;
        
        const sendersSet = new Set();
        currentChat.messages.forEach(m => {
            if (m.type === 'msg' && m.sender) sendersSet.add(m.sender);
        });
        const senders = Array.from(sendersSet);
        
        renderRoomSettingsMembers(senders);
        roomSettingsModal.classList.remove('hidden');
    });
}

const rsAddBtn = document.getElementById('room-settings-add-file-btn');
const rsFileInput = document.getElementById('room-settings-file-input');
if (rsAddBtn && rsFileInput) {
    rsAddBtn.addEventListener('click', () => rsFileInput.click());
    rsFileInput.addEventListener('change', async (e) => {
        if (!currentChat) return;
        roomSettingsModal.classList.add('hidden'); // いったん閉じる
        await processFiles(e.target.files, currentChat);
        e.target.value = '';
        await openChat(currentChat.id); // 更新反映
    });
}
if (closeRoomSettingsModal) closeRoomSettingsModal.addEventListener('click', () => roomSettingsModal.classList.add('hidden'));

if (roomSettingsApplyBtn) {
    roomSettingsApplyBtn.addEventListener('click', async () => {
        if (!currentChat) return;
        
        if (roomSettingsTitle.value.trim() !== '') currentChat.title = roomSettingsTitle.value.trim();
        
        let nameChanged = false;
        const nameMapping = {}; 
        for (const oldName in tempNameMap) {
            const newName = tempNameMap[oldName];
            if (newName && newName !== oldName) {
                nameChanged = true;
                nameMapping[oldName] = newName;
            }
        }
        if (nameChanged) {
            currentChat.messages.forEach(m => {
                if (m.type === 'msg' && m.sender && nameMapping[m.sender]) m.sender = nameMapping[m.sender];
            });
            const newIcons = {};
            for (const sender in tempIconMap) {
                const updatedName = nameMapping[sender] || sender;
                newIcons[updatedName] = tempIconMap[sender];
            }
            tempIconMap = newIcons;
            if (currentChat.myName && nameMapping[currentChat.myName]) currentChat.myName = nameMapping[currentChat.myName];
        }
        
        currentChat.userIcons = tempIconMap;
        if (tempMainIconTarget && tempIconMap[tempMainIconTarget]) {
            currentChat.icon = tempIconMap[tempMainIconTarget];
        }
        
        roomTitle.textContent = currentChat.title;
        await LineChatDB.updateChat(currentChat);
        loadChatList();
        
        vScroll.setItems(currentChat.messages);
        showToast('設定を適用しました');
        roomSettingsModal.classList.add('hidden');
    });
}

if (roomSettingsExportBtn) {
    roomSettingsExportBtn.addEventListener('click', () => {
        if (!currentChat || !currentChat.messages) return;
        const filename = prompt('保存するファイル名を入力してください（拡張子不要）', currentChat.title);
        if (!filename) return;
        
        // Ensure strictly chronological order for export
        const sortedMsgs = [...currentChat.messages].sort((a, b) => (a._timestamp || 0) - (b._timestamp || 0));
        
        let content = '';
        let lastDate = '';
        sortedMsgs.forEach(m => {
            // Check for date change to insert parser-compatible date line
            if (m.date && m.date !== lastDate) {
                // Ensure format: YYYY/MM/DD(Ark)
                content += `${m.date}(Ark)\n`;
                lastDate = m.date;
            }
            
            if (m.type === 'msg') {
                content += `${m.time}\t${m.sender}\t${m.text.replace(/\n/g, '\\n')}\n`; // safe multiline representation if needed, but here we just restore tabs
            } else if (m.type === 'sys') {
                content += `${m.time}\t${m.text.replace(/\n/g, '\\n')}\n`;
            }
        });
        
        const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('エクスポートが完了しました');
    });
}

iconInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentChat || !targetSenderForIcon) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 120;
            let width = img.width;
            let height = img.height;
            if (width > height) {
                if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
            } else {
                if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
            }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            const b64 = canvas.toDataURL('image/jpeg', 0.8);
            tempIconMap[targetSenderForIcon] = b64;
            
            // Re-render settings modal UI instantly
            if (!roomSettingsModal.classList.contains('hidden')) {
                const sendersSet = new Set();
                currentChat.messages.forEach(m => { if (m.type === 'msg' && m.sender) sendersSet.add(m.sender); });
                renderRoomSettingsMembers(Array.from(sendersSet));
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
});

/**
 * V21 Public Navigation wrapper for Chat
 */
async function openChat(id) {
    pushViewState({ view: UI_VIEWS.ROOM, chatId: id });
}

async function openChatInternal(id) {
    try {
        const numericId = Number(id);
        if (isNaN(numericId)) throw new Error('無効なトークIDです');
        
        const chat = await LineChatDB.getChatById(numericId);
        if (!chat) throw new Error('トークデータが見つかりません');
        
        if (!chat.myName) {
            const uniqueSenders = new Set();
            for (const m of chat.messages) {
                if (m.type === 'msg' && m.sender) uniqueSenders.add(m.sender);
                if (uniqueSenders.size >= 2) break;
            }
            const senderList = Array.from(uniqueSenders);
            if (senderList.length >= 2) {
                chat.myName = senderList[1];
            } else if (senderList.length === 1) {
                chat.myName = senderList[0];
            }
            await LineChatDB.updateChat(chat);
        }
        
        currentChat = chat;
        currentChatId = id;
        roomTitle.textContent = chat.title;
        
        // --- V20: Flip Selection Rotation logic ---
        flipBtn.onclick = async () => {
            if (!currentChat || !currentChat.messages) return;
            const senders = Array.from(new Set(currentChat.messages.map(m => m.sender).filter(s => !!s)));
            if (senders.length <= 1) {
                showToast("発言者が1人以下のため、切り替えは不要です");
                return;
            }
            let currentIndex = senders.indexOf(currentChat.myName);
            let nextIndex = (currentIndex + 1) % senders.length;
            currentChat.myName = senders[nextIndex];
            await LineChatDB.updateChat(currentChat);
            vScroll.updateVisibleItems(true);
            showToast(currentChat.myName + ' を自分(右側)に設定しました');
        };

        if (chat.icon) {
            iconDisplay.style.backgroundImage = `url(${chat.icon})`;
            iconText.style.display = 'none';
        } else {
            iconDisplay.style.backgroundImage = 'none';
            iconText.style.display = 'block';
            iconText.textContent = (chat.title || "？").charAt(0);
        }
        
        flipSender = false;
        searchHighlightIndices.clear();
        activeSearchIndexValue = -1;
        window.searchKeyword = '';
        
        document.dispatchEvent(new Event('chatOpened'));
        
        if (!chat.messages || chat.messages.length === 0) {
            vScroll.setItems([]);
        } else {
            vScroll.setItems(chat.messages);
            
            // V31: Handle pending jump index from global search
            if (window.pendingSearchJumpIndex !== undefined) {
                console.log('保留中のジャンプを実行します:', window.pendingSearchJumpIndex);
                vScroll.scrollToIndex(window.pendingSearchJumpIndex);
                window.pendingSearchJumpIndex = undefined;
            } else {
                vScroll.scrollToIndex(chat.messages.length - 1);
            }
        }
    } catch (err) {
        console.error('Failed to open chat:', err);
        alert('トークデータの読み込みに失敗しました。: ' + err.message);
        hideLoading();
        
        // V27: Fail-safe UI recovery
        roomView.style.display = 'none';
        roomView.classList.remove('active');
        listView.style.display = 'flex';
        listView.classList.add('active');
        
        history.replaceState({ view: UI_VIEWS.LIST }, "");
    }
}

backBtn.addEventListener('click', () => {
    history.back();
});

// V12 Features Implementation
// PWA Update Snackbar
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        // SW has updated, show snackbar
        const snack = document.getElementById('sw-update-snackbar');
        if (snack) snack.style.display = 'flex';
    });
}
document.getElementById('sw-update-yes')?.addEventListener('click', () => {
    location.reload(true);
});
document.getElementById('sw-update-no')?.addEventListener('click', () => {
    document.getElementById('sw-update-snackbar').style.display = 'none';
});

// About Modal
const aboutModal = document.getElementById('about-modal');
document.querySelectorAll('h1').forEach(h => {
    if (h.textContent === 'Ark-ive') {
        h.style.cursor = 'pointer';
        h.onclick = () => aboutModal.classList.remove('hidden');
    }
});
document.getElementById('close-about-modal')?.addEventListener('click', () => history.back());

// Favorites Modal
const favModal = document.getElementById('favorites-modal');
const favList = document.getElementById('favorites-list');
const openFavs = async (specificChatId = null) => {
    const chats = await LineChatDB.getAllChats();
    favList.innerHTML = '';
    let hasFavs = false;
    chats.forEach(chat => {
        // [7.2] Filter by room if specificChatId is provided
        if (specificChatId && chat.id !== specificChatId) return;

        chat.messages.forEach((m, idx) => {
            if (m.isFavorite) {
                hasFavs = true;
                const div = document.createElement('div');
                div.className = 'modal-list-item';
                div.innerHTML = `<div style="color:var(--text-muted); font-size:11px;">${chat.title} - ${m.date}</div><div>${m.text}</div>`;
                div.onclick = () => {
                    favModal.classList.add('hidden');
                    openChat(chat.id).then(() => vScroll.scrollToIndex(idx));
                };
                favList.appendChild(div);
            }
        });
    });
    if (!hasFavs) favList.innerHTML = `<div style="padding:40px; text-align:center; color:var(--text-muted);">${specificChatId ? 'このルームにお気に入りはありません' : 'お気に入りはありません'}</div>`;
    favModal.classList.remove('hidden');
};
document.getElementById('favorites-list-btn')?.addEventListener('click', () => {
    pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.FAVORITES });
});
document.getElementById('room-favorites-btn')?.addEventListener('click', () => {
    pushViewState({ view: UI_VIEWS.ROOM, chatId: currentChatId, modal: UI_MODALS.FAVORITES });
});
document.getElementById('close-favorites-modal')?.addEventListener('click', () => history.back());

// Archived Modal
const archivedList = document.getElementById('archived-list');
document.getElementById('archive-view-btn')?.addEventListener('click', async () => {
    pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.ARCHIVED });
});

async function renderArchivedList() {
    const chats = await LineChatDB.getAllChats();
    const archived = chats.filter(c => c.isArchived);
    archivedList.innerHTML = '';
    if (archived.length === 0) {
        archivedList.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted);">アーカイブはありません</div>';
    } else {
        archived.forEach(c => {
            const div = document.createElement('div');
            div.className = 'chat-item';
            div.dataset.id = c.id;
            div.style.borderBottom = '1px solid var(--border-color)';
            div.innerHTML = `
                <div class="chat-info">
                    <div class="chat-icon" style="${c.icon ? `background-image:url(${c.icon});` : ''}">${c.icon ? '' : (c.title || '？').charAt(0)}</div>
                    <div class="chat-desc">
                        <h3 style="margin:0;">${c.title}</h3>
                        <p style="margin:0; font-size:12px; color:var(--text-muted);">${c.messages.length}件のメッセージ</p>
                    </div>
                </div>
            `;
            // V23: イベント委譲を利用
            
            div.oncontextmenu = (e) => {
                e.preventDefault();
                contextTargetId = c.id;
                let cx = e.clientX, cy = e.clientY;
                if (e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
                contextMenu.style.left = `${Math.min(cx, window.innerWidth - 160)}px`;
                contextMenu.style.top = `${Math.min(cy, window.innerHeight - 100)}px`;
                contextMenu.classList.add('active');
                
                ctxArchive.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg> 一覧に戻す';
                ctxArchive.onclick = async () => {
                    contextMenu.classList.remove('active');
                    const target = await LineChatDB.getChatById(contextTargetId);
                    if (target) {
                        target.isArchived = false;
                        await LineChatDB.updateChat(target);
                        showToast("トークを一覧に戻しました");
                        renderArchivedList();
                        loadChatList();
                    }
                };
            };
            archivedList.appendChild(div);
        });
    }
}

document.getElementById('close-archived-modal')?.addEventListener('click', () => history.back());

const ctxArchive = document.createElement('div');
ctxArchive.className = 'context-item';
ctxArchive.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path></svg> アーカイブ';
ctxDelete.before(ctxArchive);
const archiveHandler = async () => {
    contextMenu.classList.remove('active');
    if (!contextTargetId) return;
    const chat = await LineChatDB.getChatById(contextTargetId);
    if (!chat) return;
    chat.isArchived = true;
    await LineChatDB.updateChat(chat);
    showToast("トークをアーカイブしました");
    loadChatList();
};
ctxArchive.onclick = archiveHandler;

// Shuffle Logic
document.getElementById('shuffle-all-btn')?.addEventListener('click', async () => {
    const chats = await LineChatDB.getAllChats();
    const allMsgs = [];
    chats.forEach(c => {
        c.messages.forEach((m, idx) => { if(m.type === 'msg') allMsgs.push({ chatId: c.id, idx }); });
    });
    if (allMsgs.length === 0) return;
    const pick = allMsgs[Math.floor(Math.random() * allMsgs.length)];
    openChat(pick.chatId).then(() => vScroll.scrollToIndex(pick.idx));
});
document.getElementById('shuffle-room-btn')?.addEventListener('click', () => {
    if (window.shuffleWithinRoom) window.shuffleWithinRoom();
});

// Fake Mode (Shopping List)
/**
 * V17: Advanced Memo System (Main)
 */
async function initMemo(mode) {
    if (mode === 'fake') {
        initFakeMode();
        return;
    }
    
    // V22: History API Support for Main Memo
    pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.MEMO_LIST });
}

// Actual initialization called by applyState
async function initMemoInternal() {
    const modal = document.getElementById('memo-modal');
    const indexView = document.getElementById('memo-index-view');
    const editView = document.getElementById('memo-edit-view');
    const detailView = document.getElementById('memo-detail-view');
    
    const indexList = document.getElementById('memo-index-list');
    const headerAddBtn = document.getElementById('memo-header-add-btn');
    const backBtn = document.getElementById('memo-back-btn');
    const closeBtn = document.getElementById('close-memo-modal-btn');
    
    const editTitle = document.getElementById('memo-edit-title');
    const editContent = document.getElementById('memo-edit-content');
    const saveBtn = document.getElementById('memo-save-btn');
    const deleteBtn = document.getElementById('memo-delete-btn');
    
    const detailTitle = document.getElementById('memo-detail-title');
    const detailContentNode = document.getElementById('memo-detail-content');
    const gotoEditBtn = document.getElementById('memo-goto-edit-btn');
    
    const storageKey = 'arkive_memo_data';
    let currentMemos = [];
    let editingIdx = -1;

    const switchView = (viewName) => {
        [indexView, editView, detailView].forEach(v => v.style.display = 'none');
        backBtn.style.display = 'none';
        closeBtn.style.display = 'none';
        
        if (viewName === 'index') {
            indexView.style.display = 'block';
            closeBtn.style.display = 'flex';
            headerAddBtn.style.display = 'flex';
        } else if (viewName === 'edit') {
            editView.style.display = 'flex';
            editView.style.flexDirection = 'column';
            backBtn.style.display = 'flex';
            headerAddBtn.style.display = 'none';
        } else if (viewName === 'detail') {
            detailView.style.display = 'block';
            backBtn.style.display = 'flex';
            headerAddBtn.style.display = 'none';
        }
    };

    const loadMemos = async () => {
        let raw = await LineChatDB.getSetting(storageKey, []);
        currentMemos = raw.map(m => {
            if (typeof m === 'string') return { title: m.substring(0, 15) || '無題', text: m, time: Date.now() };
            if (m.text && !m.title) return { ...m, title: m.text.substring(0, 15) || '無題' };
            return m;
        });
        
        indexList.innerHTML = '';
        currentMemos.forEach((memo, idx) => {
            const card = document.createElement('div');
            card.className = 'memo-card';
            card.style.borderBottom = '1px solid var(--border-color)';
            card.style.padding = '15px';
            card.style.cursor = 'pointer';
            card.style.transition = 'background 0.2s';
            card.innerHTML = `
                <h4 style="margin:0 0 5px 0;">${memo.title || '無題'}</h4>
                <p style="margin:0; font-size:14px; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${(memo.text || '').replace(/\n/g, ' ')}</p>
                <div style="font-size:10px; color:var(--text-muted); margin-top:5px;">${new Date(memo.time || Date.now()).toLocaleString()}</div>
            `;
            card.onclick = () => {
                editingIdx = idx;
                detailTitle.textContent = memo.title;
                detailContentNode.textContent = memo.text;
                switchView('detail');
            };
            indexList.appendChild(card);
        });
        
        if (currentMemos.length === 0) {
            indexList.innerHTML = '<div style="padding:50px; text-align:center; color:var(--text-muted);">メモがありません</div>';
        }
    };

    // Listeners
    headerAddBtn.onclick = () => {
        editingIdx = -1;
        editTitle.value = '';
        editContent.value = '';
        deleteBtn.style.display = 'none';
        switchView('edit');
    };

    backBtn.onclick = () => switchView('index');
    closeBtn.onclick = () => history.back(); 

    gotoEditBtn.onclick = () => {
        const memo = currentMemos[editingIdx];
        editTitle.value = memo.title || '';
        editContent.value = memo.text || '';
        deleteBtn.style.display = 'block';
        switchView('edit');
    };

    saveBtn.onclick = async () => {
        const t = editTitle.value.trim() || '無題';
        const c = editContent.value.trim();
        if (!c && !editTitle.value.trim()) return;
        
        const newMemo = { title: t, text: c, time: Date.now() };
        if (editingIdx >= 0) {
            currentMemos[editingIdx] = newMemo;
        } else {
            currentMemos.unshift(newMemo);
        }
        
        await LineChatDB.setSetting(storageKey, currentMemos);
        showToast('保存しました');
        await loadMemos();
        switchView('index');
    };

    deleteBtn.onclick = async () => {
        if (confirm('このメモを完全に削除しますか？')) {
            currentMemos.splice(editingIdx, 1);
            await LineChatDB.setSetting(storageKey, currentMemos);
            showToast('削除しました');
            await loadMemos();
            switchView('index');
        }
    };

    modal.classList.remove('hidden');
    switchView('index');
    loadMemos();
}

async function initFakeMode() {
    pushViewState({ view: UI_VIEWS.FAKE });
}

async function initFakeModeInternal() {
    const fakeApp = findViewById('fake-app');
    const todoInput = findViewById('fake-todo-input');
    const todoAddBtn = findViewById('fake-todo-add-btn');
    const todoList = findViewById('fake-todo-list');
    const backBtn = findViewById('fake-back-btn');
    const memoBtn = findViewById('fake-memo-btn');
    const todoView = findViewById('fake-todo-view');
    const memoView = findViewById('fake-memo-view');
    const memoTextarea = findViewById('fake-memo-textarea');
    const memoBackBtn = findViewById('fake-memo-back-btn');
    
    fakeApp.style.display = 'flex';
    document.body.style.backgroundColor = '#fff';
    
    backBtn.onclick = () => location.reload(); 
    memoBtn.onclick = () => {
        todoView.style.display = 'none';
        memoView.style.display = 'flex';
    };
    memoBackBtn.onclick = () => {
        memoView.style.display = 'none';
        todoView.style.display = 'flex';
    };

    const storageKey = 'arkive_fake_todo_data';
    const memoKey = 'arkive_fake_secret_memo';
    
    const loadTodos = async () => {
        const todos = await LineChatDB.getSetting(storageKey, []);
        todoList.innerHTML = '';
        todos.forEach((item, idx) => {
            const li = document.createElement('li');
            li.className = 'fake-todo-item';
            li.innerHTML = `
                <div style="display:flex; align-items:center; gap:12px; flex:1;">
                    <input type="checkbox" ${item.done ? 'checked' : ''} style="width:22px; height:22px; cursor:pointer;">
                    <span style="flex:1; text-decoration: ${item.done ? 'line-through' : 'none'}; color: ${item.done ? '#999' : '#333'}; font-size:17px; line-height:1.4;">${item.text}</span>
                </div>
                <button class="fake-todo-del" style="margin-left:10px; cursor:pointer;">削除</button>
            `;
            const check = li.querySelector('input');
            check.onchange = async () => {
                todos[idx].done = check.checked;
                await LineChatDB.setSetting(storageKey, todos);
                loadTodos();
            };
            li.querySelector('.fake-todo-del').onclick = async () => {
                todos.splice(idx, 1);
                await LineChatDB.setSetting(storageKey, todos);
                loadTodos();
            };
            todoList.appendChild(li);
        });
        if (todos.length === 0) todoList.innerHTML = '<div style="padding:40px; text-align:center; color:#ccc;">リストは空です</div>';
    };

    const loadMemo = async () => {
        const memo = await LineChatDB.getSetting(memoKey, "");
        memoTextarea.value = memo;
    };

    memoTextarea.oninput = async () => {
        await LineChatDB.setSetting(memoKey, memoTextarea.value);
    };

    todoAddBtn.onclick = async () => {
        const val = todoInput.value.trim();
        if (!val) return;
        const todos = await LineChatDB.getSetting(storageKey, []);
        todos.unshift({ text: val, done: false });
        await LineChatDB.setSetting(storageKey, todos);
        todoInput.value = '';
        loadTodos();
    };

    loadTodos();
    loadMemo();
}

/**
 * V21 Global Features
 */
function initGlobalFeatures() {
    findViewById('settings-btn').onclick = () => pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.SETTINGS });
    findViewById('close-settings-modal').onclick = () => history.back();
    findViewById('list-manual-btn').onclick = () => pushViewState({ view: UI_VIEWS.MANUAL });
    findViewById('manual-back-btn').onclick = () => history.back();
    findViewById('global-search-btn').onclick = () => pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.G_SEARCH });
    findViewById('close-global-search-modal').onclick = () => history.back();
    findViewById('global-calendar-btn').onclick = () => pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.G_CAL });
    findViewById('close-global-calendar-modal').onclick = () => history.back();
    
    const gSearchInput = findViewById('global-search-input');
    const gSearchResults = findViewById('global-search-results');
    const gSearchSort = findViewById('global-search-sort-btn');
    const gSearchDateS = findViewById('global-search-date-start');
    const gSearchDateE = findViewById('global-search-date-end');
    const gSearchMemberBtn = findViewById('global-search-member-btn');
    
    let gSearchMemberFilter = new Set();

    const gSearchTotalHits = findViewById('global-search-total-hits');

    const triggerGlobalSearch = async () => {
        const val = gSearchInput.value.trim().toLowerCase();
        if (val.length < 1) { 
            gSearchResults.innerHTML = ''; 
            if (gSearchTotalHits) gSearchTotalHits.textContent = '0';
            return; 
        }
        
        const tokens = val.split(/\s+/).filter(t => t.length > 0);
        const includeTokens = tokens.filter(t => !t.startsWith('-'));
        const excludeTokens = tokens.filter(t => t.startsWith('-')).map(t => t.substring(1));

        const dStart = gSearchDateS.value ? new Date(gSearchDateS.value + 'T00:00:00').getTime() : 0;
        const dEnd = gSearchDateE.value ? new Date(gSearchDateE.value + 'T23:59:59').getTime() : Infinity;
        const sortMode = gSearchSort.getAttribute('data-sort');

        const chats = await LineChatDB.getAllChats();
        let hits = [];
        window.currentGlobalHitSenders.clear();

        chats.forEach(chat => {
            chat.messages.forEach((m, idx) => {
                if (window.matchMessage(m, includeTokens, excludeTokens, { dStart, dEnd, memberFilter: gSearchMemberFilter })) {
                    hits.push({ chat, message: m, index: idx });
                    if (m.sender) window.currentGlobalHitSenders.add(m.sender);
                }
            });
        });

        hits.sort((a, b) => {
            const tsA = a.message._timestamp || 0;
            const tsB = b.message._timestamp || 0;
            return sortMode === 'desc' ? tsB - tsA : tsA - tsB;
        });

        if (gSearchTotalHits) gSearchTotalHits.textContent = hits.length;

        let html = '';
        const escapedKeyword = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedKeyword})`, 'gi');

        hits.slice(0, 200).forEach(h => {
            let snippet = h.message.text;
            if (snippet.length > 60) snippet = snippet.substring(0, 60) + '...';
            snippet = snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(regex, '<mark>$1</mark>');

            html += `<div class="modal-list-item global-hit-card" data-id="${h.chat.id}" data-idx="${h.index}">
                <div class="search-hit-sender">
                    <span style="color:var(--primary-color); font-weight:bold;">[${h.chat.title}]</span> 
                    <span style="color:#7494c0; margin-left:5px;">${h.message.date || ''}</span> 
                    ${h.message.sender} 
                    <span style="color:#777; font-weight:normal;">(${h.message.time || ''})</span>
                </div>
                <div class="search-hit-text">${snippet}</div>
            </div>`;
        });
        gSearchResults.innerHTML = html || '<div style="text-align:center; padding:20px; color:var(--text-muted);">見つかりませんでした</div>';
    };

    gSearchInput.oninput = triggerGlobalSearch;
    gSearchDateS.onchange = triggerGlobalSearch;
    gSearchDateE.onchange = triggerGlobalSearch;
    gSearchSort.onclick = () => {
        const current = gSearchSort.getAttribute('data-sort');
        if (current === 'desc') {
            gSearchSort.setAttribute('data-sort', 'asc');
            gSearchSort.textContent = '古い順';
        } else {
            gSearchSort.setAttribute('data-sort', 'desc');
            gSearchSort.textContent = '新しい順';
        }
        triggerGlobalSearch();
    };

    gSearchMemberBtn.onclick = async () => {
        const senders = window.currentGlobalHitSenders;
        if (senders.size === 0) {
            if (typeof showToast === 'function') showToast('検索結果がありません');
            return;
        }
        
        const filterList = document.getElementById('member-filter-list');
        filterList.innerHTML = '';
        
        // Sort senders for better UX
        Array.from(senders).sort().forEach(name => {
            const label = document.createElement('label');
            label.style = "display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid #eee; font-size:16px; color:var(--text-main);";
            const isChecked = gSearchMemberFilter.has(name) || gSearchMemberFilter.size === 0;
            label.innerHTML = `<input type="checkbox" value="${name}" ${isChecked ? 'checked' : ''} style="width:20px; height:20px;"> <span style="flex:1;">${name}</span>`;
            filterList.appendChild(label);
        });
        
        // Use existing member filter modal structure but redirect 'Apply' to global
        findViewById('member-filter-modal').classList.remove('hidden');
        const applyBtn = findViewById('member-filter-apply');
        const originalOnClick = applyBtn.onclick; 
        
        applyBtn.onclick = () => {
            const checks = filterList.querySelectorAll('input');
            gSearchMemberFilter.clear();
            let allSelected = true;
            checks.forEach(c => {
                if (c.checked) gSearchMemberFilter.add(c.value);
                else allSelected = false;
            });
            if (allSelected) gSearchMemberFilter.clear();
            findViewById('member-filter-modal').classList.add('hidden');
            applyBtn.onclick = originalOnClick; // Restore
            triggerGlobalSearch();
        };
    };

    // V23: Event Delegation for Global Search Results
    gSearchResults.onclick = (e) => {
        const card = e.target.closest('.global-hit-card');
        if (card && card.dataset.id) {
            const idx = parseInt(card.dataset.idx);
            console.log('グローバル検索ヒットをクリック:', card.dataset.id, idx);
            // V31: Set pending jump and redirect
            window.pendingSearchJumpIndex = idx;
            openChat(card.dataset.id);
            findViewById('global-search-modal').classList.add('hidden');
        }
    };

    gSearchInput.oninput = triggerGlobalSearch;
    gSearchDateS.onchange = triggerGlobalSearch;
    gSearchDateE.onchange = triggerGlobalSearch;
    gSearchSort.onclick = () => {
        const cur = gSearchSort.getAttribute('data-sort');
        if (cur === 'desc') {
            gSearchSort.setAttribute('data-sort', 'asc');
            gSearchSort.textContent = '古い順';
        } else {
            gSearchSort.setAttribute('data-sort', 'desc');
            gSearchSort.textContent = '新しい順';
        }
        triggerGlobalSearch();
    };
}

function initSettingsAutoSave() {
    const pToggle = findViewById('password-toggle');
    const fToggle = findViewById('fake-password-toggle');
    const pWarn = findViewById('passcode-warn-msg');
    const pContainer = findViewById('password-setup-container');
    const fInputs = findViewById('fake-password-inputs');
    const updateVisibility = () => {
        pWarn.style.display = pToggle.checked ? 'block' : 'none';
        pContainer.style.display = pToggle.checked ? 'block' : 'none';
        fInputs.style.display = fToggle.checked ? 'block' : 'none';
    };
    pToggle.onchange = () => {
        updateVisibility();
        if (!pToggle.checked) {
            if (confirm("パスコードロックを無効にしますか？")) {
                localStorage.removeItem('app_password_hash');
                localStorage.removeItem('app_fake_password_hash');
                showToast("無効化しました");
            } else { pToggle.checked = true; updateVisibility(); }
        }
    };
    fToggle.onchange = updateVisibility;
    findViewById('theme-select').onchange = (e) => {
        localStorage.setItem('app_theme', e.target.value);
        applyTheme(e.target.value);
        showToast("テーマを適用しました");
    };
    const savedHash = localStorage.getItem('app_password_hash');
    const fakeHash = localStorage.getItem('app_fake_password_hash');
    if (savedHash) pToggle.checked = true;
    if (fakeHash) fToggle.checked = true;
    updateVisibility();
}

function initBackupHandlers() {
    findViewById('room-settings-export-btn').onclick = () => {
        pushViewState({ view: UI_VIEWS.ROOM, chatId: currentChatId, modal: UI_MODALS.BACKUP_OPT });
    };
    findViewById('backup-opt-json').onclick = () => { history.back(); if (currentChat) exportChatJson(currentChat); };
    findViewById('backup-opt-txt').onclick = () => { history.back(); if (currentChat) exportChatTxt(currentChat); };
    findViewById('backup-opt-cancel').onclick = () => history.back();
    findViewById('close-backup-options-modal').onclick = () => history.back();
}

function exportChatJson(chat) {
    const blob = new Blob([JSON.stringify(chat, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = `${chat.title}.json`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
}

function exportChatTxt(chat) {
    let txt = `[LINE] トーク履歴: ${chat.title}\r\n保存日時：${new Date().toLocaleString('ja-JP')}\r\n\r\n`;
    const days = ['日','月','火','水','木','金','土'];
    chat.messages.forEach(m => {
        if (m.type === 'date') {
            const d = new Date(m._timestamp);
            txt += `\r\n${m.text}(${days[d.getDay()]})\r\n`;
        } else if (m.type === 'msg') {
            txt += `${m.time}\t${m.sender}\t${m.text.replace(/\n/g, '\r\n\t\t')}\r\n`;
        } else if (m.type === 'sys') {
            txt += `${m.time}\t${m.text}\r\n`;
        }
    });
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = `${chat.title}.txt`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
}

function initV21() {
    setupGlobalCalNav();
    initGlobalFeatures();
    initSettingsAutoSave();
    initBackupHandlers();
    document.getElementById('main-memo-btn')?.addEventListener('click', () => initMemo('main'));
}
