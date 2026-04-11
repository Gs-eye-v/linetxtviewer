let vScroll = null;
let flipSender = false;
let currentChat = null;
let currentChatId = null;

let searchHighlightIndices = new Set();
let activeSearchIndexValue = -1;
window.isOpenedFromArchive = false;

const APP_VERSION = "v1.1.20";

const I18N_MAP = {
    ja: {
        TITLE_GLOBAL_SEARCH: "全トーク検索",
        TITLE_GLOBAL_CALENDAR: "カレンダー",
        TITLE_RANDOM_JUMP: "ランダムジャンプ",
        TITLE_MENU: "メニュー",
        MENU_IMPORT: "トーク読み込み",
        MENU_FAV: "お気に入り",
        MENU_ARCHIVE: "アーカイブ",
        MENU_MEMO: "メモ",
        MENU_MANUAL: "マニュアル",
        MENU_SETTINGS: "設定",
        SETTING_THEME: "テーマ",
        SETTING_LANG: "Language",
        SETTING_PASS_LOCK: "パスコードロックを有効にする",
        SETTING_PASS_WARN: "【最重要：パスコード紛失の警告】パスコードを忘れると復元不可能です。",
        SETTING_MAIN_PASS: "メインパスコードを設定",
        SETTING_FAKE_PASS: "偽パスコードを設定",
        SETTING_BACKUP_RESTORE: "バックアップと復元",
        RANKING_TITLE: "ランキング",
        RANKING_CHARS_UP: "文字以上",
        RANKING_REFRESH: "更新",
        BTN_SAVE: "保存",
        BTN_APPLY: "適用",
        BTN_CANCEL: "キャンセル",
        BTN_CLOSE: "閉じる"
    },
    en: {
        TITLE_GLOBAL_SEARCH: "Global Search",
        TITLE_GLOBAL_CALENDAR: "Global Calendar",
        TITLE_RANDOM_JUMP: "Random Jump",
        TITLE_MENU: "Menu",
        MENU_IMPORT: "Import Chat",
        MENU_FAV: "Favorites",
        MENU_ARCHIVE: "Archive",
        MENU_MEMO: "Memo",
        MENU_MANUAL: "Manual",
        MENU_SETTINGS: "Settings",
        SETTING_THEME: "Theme",
        SETTING_LANG: "Language",
        SETTING_PASS_LOCK: "Enable Passcode Lock",
        SETTING_PASS_WARN: "[IMPORTANT: Passcode Warning] Locked out data is unrecoverable.",
        SETTING_MAIN_PASS: "Set Main Passcode",
        SETTING_FAKE_PASS: "Set Fake Passcode",
        SETTING_BACKUP_RESTORE: "Backup & Restore",
        RANKING_TITLE: "Ranking",
        RANKING_CHARS_UP: "chars+",
        RANKING_REFRESH: "Refresh",
        BTN_SAVE: "Save",
        BTN_APPLY: "Apply",
        BTN_CANCEL: "Cancel",
        BTN_CLOSE: "Close"
    }
};

let currentLang = 'ja';
window.updateAppLanguage = function(lang) {
    currentLang = lang;
    const map = I18N_MAP[lang] || I18N_MAP['ja'];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (map[key]) el.textContent = map[key];
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (map[key]) el.title = map[key];
    });
    localStorage.setItem('app_lang', lang);
};

// Global UI Elements
const mainApp = document.getElementById('main-app');
const lockScreen = document.getElementById('lock-screen');
const listView = document.getElementById('list-view');
const roomView = document.getElementById('room-view');
const rankingView = document.getElementById('ranking-view');
const fakeApp = document.getElementById('fake-app');
const manualView = document.getElementById('manual-view');
// VIEWS: Using optional chaining for safety in hybrid environments
const views = [mainApp, lockScreen, listView, roomView, rankingView, fakeApp, manualView].filter(Boolean);

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
    const allMessages = [];
    chats.forEach(c => allMessages.push(...c.messages));
    
    if (allMessages.length > 0) {
        const lastMsg = allMessages[allMessages.length - 1];
        if (lastMsg && lastMsg.date) {
            const p = lastMsg.date.split('/');
            gCalDate = new Date(parseInt(p[0]), parseInt(p[1]) - 1, 1);
        }
    }
    renderCalendar(allMessages, { isGlobal: true }, gCalDate);
};

async function renderCalendar(messages, context, date) {
    const isGlobal = !!context.isGlobal;
    const year = date.getFullYear();
    const month = date.getMonth();
    if (isGlobal) gCalDate = date; else window.roomCalDate = date;

    const config = isGlobal ? {
        modal: 'global-calendar-modal',
        grid: 'global-calendar-grid',
        monthLabel: 'global-cal-month-label',
        statsColor: '#5ac8fa',
        statsLabel: 'global-cal-stats',
        prevBtn: 'global-cal-prev-btn',
        nextBtn: 'global-cal-next-btn',
        list: 'global-month-list-view',
        header: null
    } : {
        modal: 'date-modal',
        grid: 'calendar-grid',
        monthLabel: 'cal-month-label',
        statsColor: '#5ac8fa',
        statsLabel: 'cal-total-count',
        prevBtn: 'cal-prev-btn',
        nextBtn: 'cal-next-btn',
        list: 'month-list-view',
        header: 'calendar-header-main'
    };

    const stats = {};
    let minT = Infinity, maxT = -Infinity;
    messages.forEach(m => {
        if (m.date && m.date.includes('/')) {
            const p = m.date.split('/');
            const y = parseInt(p[0]), mo = parseInt(p[1]), d = parseInt(p[2]);
            const t = y * 12 + (mo - 1);
            if (t < minT) minT = t;
            if (t > maxT) maxT = t;
            const key = `${y}-${mo}-${d}`;
            if (!stats[key]) stats[key] = { count: 0, call: 0 };
            if (m.type === 'msg') stats[key].count++;
            if (m.callDuration) stats[key].call += m.callDuration;
        }
    });

    const currentT = year * 12 + month;
    const label = findViewById(config.monthLabel);
    if (label) {
        label.textContent = `${year}年 ${month + 1}月`;
        label.onclick = () => renderMonthJumpList(messages, context, date, { minT, maxT });
    }

    const pb = findViewById(config.prevBtn);
    const nb = findViewById(config.nextBtn);
    if (pb) {
        pb.style.opacity = currentT <= minT ? "0.2" : "1";
        pb.style.pointerEvents = currentT <= minT ? "none" : "auto";
        pb.onclick = () => renderCalendar(messages, context, new Date(year, month - 1, 1));
    }
    if (nb) {
        nb.style.opacity = currentT >= maxT ? "0.2" : "1";
        nb.style.pointerEvents = currentT >= maxT ? "none" : "auto";
        nb.onclick = () => renderCalendar(messages, context, new Date(year, month + 1, 1));
    }

    const grid = findViewById(config.grid);
    if (!grid) return;
    grid.innerHTML = '';
    ['日','月','火','水','木','金','土'].forEach(d => {
        const cell = document.createElement('div');
        cell.className = 'cal-cell cal-header-cell';
        cell.textContent = d;
        grid.appendChild(cell);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) grid.appendChild(document.createElement('div'));

    let monthTotal = 0, monthCall = 0;
    const fmt = (s) => (typeof formatCallTime === 'function' ? formatCallTime(s) : (window.formatCallTime ? window.formatCallTime(s) : s));

    for (let d = 1; d <= daysInMonth; d++) {
        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        cell.innerHTML = `<span>${d}</span>`;
        const key = `${year}-${month + 1}-${d}`;
        const data = stats[key];
        if (data) {
            cell.classList.add('cal-day_valid');
            if (data.count > 0) {
                monthTotal += data.count;
                cell.innerHTML += `<div class="cal-activity-badge">${data.count}</div>`;
            }
            if (data.call > 0) {
                monthCall += data.call;
                cell.innerHTML += `<div style="font-size:9px; color:${config.statsColor};">☎${fmt(data.call)}</div>`;
            }
            cell.onclick = () => {
                if (isGlobal) window.showGlobalDailyLogs(`${year}/${String(month+1).padStart(2,'0')}/${String(d).padStart(2,'0')}`);
                else {
                    const ds = `${year}/${String(month+1).padStart(2,'0')}/${String(d).padStart(2,'0')}`;
                    const idx = messages.findIndex(m => m.date === ds);
                    if (idx >= 0) { findViewById(config.modal).classList.add('hidden'); vScroll.scrollToIndex(idx); }
                }
            };
        } else {
            cell.classList.add('cal-day_invalid');
        }
        grid.appendChild(cell);
    }

    const statsNode = findViewById(config.statsLabel);
    if (statsNode) {
        let text = `月合計: ${monthTotal.toLocaleString()}件`;
        text += ` / ☎ ${monthCall > 0 ? fmt(monthCall) : '0:00'}`;
        statsNode.textContent = text;
    }
}

function renderMonthJumpList(messages, context, currentDate, range) {
    const isGlobal = !!context.isGlobal;
    const config = isGlobal ? {
        list: 'global-month-list-view',
        grid: 'global-calendar-grid',
        prev: 'global-cal-prev-btn',
        next: 'global-cal-next-btn',
        header: 'global-calendar-header-main'
    } : {
        list: 'month-list-view',
        grid: 'calendar-grid',
        prev: 'cal-prev-btn',
        next: 'cal-next-btn',
        header: 'calendar-header-main'
    };
    const lv = findViewById(config.list);
    const gv = findViewById(config.grid);
    if (!lv || !gv) return;
    if (!lv.classList.contains('hidden')) { closeMonthList(config); return; }

    gv.classList.add('hidden'); gv.style.display = 'none';
    if (config.header && findViewById(config.header)) findViewById(config.header).style.display = 'none';
    
    const pBtn = findViewById(config.prev);
    if (pBtn) pBtn.classList.add('hidden');
    const nBtn = findViewById(config.next);
    if (nBtn) nBtn.classList.add('hidden');
    
    lv.classList.remove('hidden');
    lv.style.overflowY = 'auto';
    lv.style.flex = '1';
    lv.innerHTML = '';

    const monthStats = {};
    messages.forEach(m => {
        if (m.date && m.date.includes('/')) {
            const p = m.date.split('/');
            const y = parseInt(p[0], 10);
            const mo = parseInt(p[1], 10);
            const mKeyTyped = `${y}-${mo}`;
            if (!monthStats[mKeyTyped]) monthStats[mKeyTyped] = { count: 0, call: 0 };
            if (m.type === 'msg') monthStats[mKeyTyped].count++;
            if (m.callDuration) monthStats[mKeyTyped].call += m.callDuration;
        }
    });

    const container = document.createElement('div');
    const fmt = (s) => (typeof formatCallTime === 'function' ? formatCallTime(s) : (window.formatCallTime ? window.formatCallTime(s) : s));
    for (let t = range.maxT; t >= range.minT; t--) {
        const y = Math.floor(t / 12), m = (t % 12) + 1;
        const data = monthStats[`${y}-${m}`] || { count: 0, call: 0 };
        const div = document.createElement('div');
        div.className = 'modal-list-item';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.innerHTML = `<span style="font-weight:bold;">${y}年 ${m}月</span> <span style="font-size:12px; color:var(--text-muted);">${data.count}件${data.call > 0 ? ' / ☎' + fmt(data.call) : ''}</span>`;
        div.onclick = () => { closeMonthList(config); renderCalendar(messages, context, new Date(y, m - 1, 1)); };
        container.appendChild(div);
    }
    lv.appendChild(container);
}

function closeMonthList(config) {
    const lv = findViewById(config.list);
    const gv = findViewById(config.grid);
    if (lv) { lv.classList.add('hidden'); lv.innerHTML = ''; }
    if (gv) { gv.classList.remove('hidden'); gv.style.display = 'grid'; }
    if (config.header && findViewById(config.header)) findViewById(config.header).style.display = 'flex';
    
    const pBtn = findViewById(config.prev);
    if (pBtn) pBtn.classList.remove('hidden');
    const nBtn = findViewById(config.next);
    if (nBtn) nBtn.classList.remove('hidden');
}

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

    hits.sort((a, b) => (a.message._timestamp || 0) - (b.message._timestamp || 0));

    const modal = findViewById(UI_MODALS.G_SEARCH);
    const resultsNode = findViewById('global-search-results');
    const titleNode = modal.querySelector('h3');

    titleNode.innerHTML = `${dateStr} の記録 (<span id="global-search-total-hits">${hits.length}</span>件)`;
    findViewById('global-search-input').style.display = 'none';
    findViewById('global-search-config').style.display = 'none';

    let html = '';
    hits.forEach(h => {
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

const UI_VIEWS = {
    LIST: 'list',
    ROOM: 'room',
    MANUAL: 'manual',
    LOCK: 'lock',
    FAKE: 'fake',
    FAKE_MEMO: 'fake_memo',
    RANKING: 'ranking'
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
    G_CAL: 'global-calendar-modal',
    ABOUT: 'about-modal'
};

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

const scrollDateLabel = document.getElementById('scroll-date-label');
const longpressTooltip = document.getElementById('longpress-tooltip');

function showToast(msg) {
    if (!toastNode) return;
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

const savedTheme = localStorage.getItem('app_theme') || 'line';
if (themeSelect) themeSelect.value = savedTheme;
applyTheme(savedTheme);

if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
        localStorage.setItem('app_theme', e.target.value);
        applyTheme(e.target.value);
    });
}

document.addEventListener('click', (e) => {
    if (contextMenu && !e.target.closest('#context-menu') && !e.target.closest('.chat-item-wrapper') && !e.target.closest('.message-row')) {
        contextMenu.classList.remove('active');
    }
});

if (chatListContainer) {
    chatListContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.chat-item');
        if (item && item.dataset.id) {
            window.isOpenedFromArchive = false;
            openChat(item.dataset.id);
        }
    });
}
const archivedListContainer = document.getElementById('archived-list');
if (archivedListContainer) {
    archivedListContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.chat-item');
        if (item && item.dataset.id) {
            window.isOpenedFromArchive = true;
            openChat(item.dataset.id);
        }
    });
}

if (ctxRename) {
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
}

if (ctxDelete) {
    ctxDelete.addEventListener('click', async () => {
        contextMenu.classList.remove('active');
        if (!contextTargetId) return;
        
        if (typeof contextTargetId === 'string' && contextTargetId.startsWith('msg-')) {
            const idx = parseInt(contextTargetId.replace('msg-', ''));
            if (currentChat && confirm('このメッセージを削除しますか？')) {
                currentChat.messages.splice(idx, 1);
                await LineChatDB.updateChat(currentChat);
                showToast('メッセージを削除しました');
                await openChatInternal(currentChat.id);
            }
            return;
        }

        const confirmDelete = confirm('このトーク履歴を完全に削除しますか？\n（元に戻せません）');
        if (confirmDelete) {
            await LineChatDB.deleteChat(contextTargetId);
            await loadChatList();
            showToast('トークを削除しました');
        }
    });
}

const ctxCopyBtn = document.getElementById('ctx-copy');
if (ctxCopyBtn) {
    ctxCopyBtn.addEventListener('click', () => {
    contextMenu.classList.remove('active');
    if (!contextTargetId || !contextTargetId.startsWith('msg-')) return;
    const idx = parseInt(contextTargetId.replace('msg-', ''));
    const msg = currentChat.messages[idx];
    if (msg) {
        navigator.clipboard.writeText(msg.text).then(() => showToast('コピーしました'));
    }
});
}

const ctxFavToggleBtn = document.getElementById('ctx-fav-toggle');
if (ctxFavToggleBtn) {
    ctxFavToggleBtn.addEventListener('click', async () => {
    contextMenu.classList.remove('active');
    if (!contextTargetId || !contextTargetId.startsWith('msg-')) return;
    const idx = parseInt(contextTargetId.replace('msg-', ''));
    const msg = currentChat.messages[idx];
    if (msg) {
        msg.isFavorite = !msg.isFavorite;
        await LineChatDB.updateChat(currentChat);
        showToast(msg.isFavorite ? 'お気に入りに追加しました' : '解除しました');
    }
});
}

async function hashStr(str) {
    if (crypto.subtle) {
        const raw = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', raw);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
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
    const key = await ArkiveCrypto.deriveKey(passcode || "ark_default_secret", salt);
    LineChatDB.setKey(key);
}

async function initApp(isRestore = false) {
    await LineChatDB.init(); 
    window.dbReady = true;
    if (!isRestore) {
        history.replaceState({ view: UI_VIEWS.LIST }, "");
    }
    currentChat = null;
    currentChatId = null;
    window.isFakeMode = false;
    
    views.forEach(v => {
        v.style.display = 'none';
        v.classList.remove('active');
    });
    
    if (mainApp) mainApp.style.display = 'flex';
    if (listView) {
        listView.classList.add('active');
        listView.style.display = 'flex';
    }
    
    await loadChatList();
    initV21();
}

function findViewById(id) { return document.getElementById(id); }

window.pushViewState = function(state) {
    history.pushState(state, "");
    applyState(state);
};

window.onpopstate = function(event) {
    if (event.state) {
        applyState(event.state);
    } else {
        applyState({ view: UI_VIEWS.LIST });
    }
};

async function applyState(state) {
    if (!mainApp) return; 
    
    try {
        await waitDBReady();
        closeAllModals(false); 
        
        views.forEach(v => {
            v.style.display = 'none';
            v.classList.remove('active');
        });

        if (state.view === UI_VIEWS.LIST) {
            mainApp.style.display = 'flex';
            listView.style.display = 'flex';
            listView.classList.add('active');
            await loadChatList();
        } else if (state.view === UI_VIEWS.ROOM && state.chatId) {
            mainApp.style.display = 'flex';
            roomView.style.display = 'flex';
            roomView.classList.add('active');
            await openChatInternal(Number(state.chatId));
        } else if (state.view === UI_VIEWS.MANUAL) {
            manualView.style.display = 'flex';
            manualView.classList.add('active');
        } else if (state.view === UI_VIEWS.RANKING) {
            mainApp.style.display = 'flex';
            rankingView.style.display = 'flex';
            rankingView.classList.add('active');
        } else if (state.view === UI_VIEWS.FAKE) {
            fakeApp.style.display = 'flex';
            initFakeModeInternal();
        }

        if (state.modal) {
            const modal = findViewById(state.modal);
            if (modal) modal.classList.remove('hidden');

            if (state.modal === UI_MODALS.ROOM_SETTINGS && state.chatId) {
                roomView.style.display = 'flex';
                roomView.classList.add('active');
                await openChatInternal(Number(state.chatId));
            }
            
            if (state.modal === UI_MODALS.MEMO_LIST) {
                initMemoInternal();
            } else if (state.modal === UI_MODALS.SEARCH) {
                const kwInput = findViewById('keyword-search');
                if (kwInput) kwInput.focus();
                if (typeof window.triggerSearch === 'function') window.triggerSearch();
            } else if (state.modal === UI_MODALS.SETTINGS) {
                openSettingsInternal();
            } else if (state.modal === UI_MODALS.ROOM_SETTINGS) {
                openRoomSettingsInternal();
            } else if (state.modal === UI_MODALS.ARCHIVED) {
                renderArchivedList();
            } else if (state.modal === UI_MODALS.FAVORITES) {
                openFavs(state.chatId);
            } else if (state.modal === UI_MODALS.G_SEARCH) {
                modal.querySelector('h3').innerHTML = `全トーク横断検索 (<span id="global-search-total-hits">0</span>件)`;
                findViewById('global-search-input').style.display = 'block';
                findViewById('global-search-config').style.display = 'flex';
                findViewById('global-search-input').focus();
            } else if (state.modal === UI_MODALS.G_CAL) {
                const chats = await LineChatDB.getAllChats();
                let allMessages = [];
                chats.forEach(c => { if(c.messages) allMessages = allMessages.concat(c.messages); });
                renderCalendar(allMessages, { isGlobal: true }, gCalDate);
            } else if (state.modal === UI_MODALS.DATE) {
                if (currentChat && currentChat.messages) {
                    const centerIdx = typeof vScroll !== 'undefined' ? vScroll.getMiddleVisibleIndex() : 0;
                    const centerMsg = currentChat.messages[centerIdx];
                    let d = new Date();
                    if (centerMsg && centerMsg.date) {
                        const p = centerMsg.date.split('/');
                        d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, 1);
                    }
                    renderCalendar(currentChat.messages, { isGlobal: false }, d);
                }
            }
        }
    } catch (e) {
        console.error('applyState error:', e);
        views.forEach(v => {
            v.style.display = 'none';
            v.classList.remove('active');
        });
        if (listView) {
            listView.style.display = 'flex';
            listView.classList.add('active');
        }
    }
}

function closeAllModals(push = true) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(m => m.classList.add('hidden'));
}

document.addEventListener('DOMContentLoaded', async () => {
    const savedHash = localStorage.getItem('app_password_hash');
    const fakeHash = localStorage.getItem('app_fake_password_hash');

    if (!savedHash && !fakeHash) {
        if (!window.crypto || !window.crypto.subtle) {
            alert('環境エラー: HTTPSまたはlocalhostが必要です');
            return;
        }
        if (lockScreen) lockScreen.style.display = 'none';
        if (mainApp) mainApp.style.display = 'flex';
        await initCrypto(""); 
        await initApp();
        return;
    }

    if (lockScreen) lockScreen.style.display = 'flex';
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
            
            const currentHash = await hashStr(inputVal);
            passcodeError.textContent = '';

            if (!savedHash && fakeHash) {
                if (inputVal === "") {
                    lockScreen.style.display = 'none';
                    mainApp.style.display = 'flex';
                    await initCrypto("");
                    await initApp();
                } else if (currentHash === fakeHash) {
                    lockScreen.style.display = 'none';
                    await initCrypto(inputVal);
                    initFakeMode();
                } else {
                    passcodeError.textContent = "パスコードが正しくありません";
                    passcodeInput.value = '';
                }
                return;
            }

            if ((fakeHash && currentHash === fakeHash) || (savedHash && currentHash === savedHash)) {
                const isFake = (currentHash === fakeHash);
                lockScreen.style.display = 'none';
                await initCrypto(inputVal);
                initFakeUI(isFake);
            } else if (savedHash || fakeHash) {
                passcodeFailCount++;
                passcodeInput.value = '';
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                
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
        }
    };

    const lockForm = document.getElementById('lock-form');
    if (lockForm) {
        lockForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await tryUnlock();
        });
    }

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

if (settingsBtn) {
    settingsBtn.onclick = () => {
        pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.SETTINGS });
    };
}

function openSettingsInternal() {
    const confirmPassInput = document.getElementById('confirm-password');
    const fakePassInput = document.getElementById('fake-password');
    const confirmFakePassInput = document.getElementById('confirm-fake-password');
    
    if (passToggle) passToggle.checked = !!localStorage.getItem('app_password_hash');
    if (passSetupContainer) passSetupContainer.style.display = passToggle.checked ? 'block' : 'none';
    
    if (newPassInput) newPassInput.value = '';
    if (confirmPassInput) confirmPassInput.value = '';
    if (fakePassInput) fakePassInput.value = '';
    if (confirmFakePassInput) confirmFakePassInput.value = '';
    
    if (settingsModal) settingsModal.classList.remove('hidden');
}
if (closeSettingsBtn) closeSettingsBtn.onclick = () => history.back();

if (manualBtn) manualBtn.onclick = () => pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.MANUAL });
if (closeManualBtn) closeManualBtn.onclick = () => history.back();

if (passToggle) {
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
                const chats = await LineChatDB.getAllChats();
                const settings = await LineChatDB.getAllSettings();

                passSetupContainer.style.display = 'none';
                localStorage.removeItem('app_password_hash');
                localStorage.removeItem('app_fake_password_hash');
                await initCrypto(""); 

                for (const chat of chats) {
                    await LineChatDB.updateChat(chat);
                }
                for (const key in settings) {
                    await LineChatDB.setSetting(key, settings[key]);
                }

                showToast('パスコードロックを無効にしました');
            } catch (err) {
                console.error('Disable passcode error:', err);
                passToggle.checked = true;
            } finally {
                hideLoading();
            }
        }
    };
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
        
        let safeText = (item.text || "").replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        if (isHighlight && window.searchKeyword) {
            try {
                const tokens = window.searchKeyword.split(/\s+/).filter(t => t.length > 0 && !t.startsWith('-'));
                const highlightPattern = tokens.length > 0 ? tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') : "";
                if (highlightPattern) {
                    const regex = new RegExp(`(${highlightPattern})`, 'gi');
                    safeText = safeText.replace(regex, '<mark>$1</mark>');
                }
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
        
        if (!isSelfMsg) {
            if (isConsecutive) {
                iconHtml = `<div class="user-icon" style="background:transparent; border:none; visibility:hidden;"></div>`;
            } else {
                iconHtml = `<div class="user-icon" title="${item.sender}" style="${bgStyle}">${initText}</div>`;
            }
        }

        const starHtml = item.isFavorite ? `<div class="favorite-star">★</div>` : '';
        const timeHtml = isNextSameTime ? `<div style="width: 30px;"></div>` : `<div class="time" style="margin:0 4px;">${item.time || ''}</div>`;
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
    if (!chatListContainer) return;
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

function promptMergeMapping(newSenders, existingSenders, defaultTitle, imageFiles = []) {
    return new Promise(resolve => {
        const modal = document.getElementById('merge-mapping-modal');
        const listDiv = document.getElementById('merge-mapping-list');
        const applyBtn = document.getElementById('merge-mapping-apply-btn');
        const closeBtn = document.getElementById('close-merge-mapping-modal');
        const titleInput = document.getElementById('import-mapping-title');
        const iconSection = document.getElementById('import-icon-setup-section');
        const iconListDiv = document.getElementById('import-icon-list');
        
        if (modal) modal.classList.remove('hidden');
        if (titleInput) titleInput.value = defaultTitle;
        if (listDiv) listDiv.innerHTML = '';
        if (iconListDiv) iconListDiv.innerHTML = '';
        
        if (iconSection) {
            iconSection.style.display = (imageFiles && imageFiles.length > 0) ? 'block' : 'none';
        }
        
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
            if (listDiv) listDiv.innerHTML = '<p style="padding:20px; text-align:center; font-size:14px; color:var(--text-muted);">新しい発言者は見つかりませんでした。</p>';
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
                if (listDiv) listDiv.appendChild(row);
                inputNodes.push(row.querySelector('input'));
            });
        }

        const senderIconMap = {}; 
        let mainIconTarget = null;

        if (imageFiles && imageFiles.length > 0 && iconListDiv) {
            newSenders.forEach(ns => {
                const item = document.createElement('div');
                item.className = 'modal-list-item';
                item.style.display = 'flex';
                item.style.flexDirection = 'column';
                item.style.gap = '10px';
                item.style.padding = '12px';
                item.style.background = 'var(--surface-hover)';
                
                let thumbnailsHtml = imageFiles.map((img, idx) => `
                    <div class="import-thumbnail" data-sender="${ns.replace(/"/g, '&quot;')}" data-img-idx="${idx}" style="width:40px; height:40px; border-radius:50%; background-image:url('${img.data}'); background-size:cover; border:2px solid transparent; cursor:pointer;" title="${img.name}"></div>
                `).join('');

                item.innerHTML = `
                    <div style="display:flex; align-items:center; justify-content:space-between;">
                        <span style="font-weight:bold; font-size:14px;">${ns} のアイコン</span>
                        <label style="font-size:12px; display:flex; align-items:center; gap:4px;">
                            <input type="radio" name="import-main-icon" value="${ns}" style="width:16px;height:16px;"> 代表
                        </label>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:8px;">
                        <div class="import-thumbnail no-icon active" data-sender="${ns.replace(/"/g, '&quot;')}" data-img-idx="-1" style="width:40px; height:40px; border-radius:50%; background:var(--border-color); display:flex; align-items:center; justify-content:center; font-size:10px; border:2px solid var(--primary-color); cursor:pointer;">なし</div>
                        ${thumbnailsHtml}
                    </div>
                `;
                iconListDiv.appendChild(item);

                const thumbs = item.querySelectorAll('.import-thumbnail');
                thumbs.forEach(t => {
                    t.onclick = () => {
                        thumbs.forEach(other => other.style.borderColor = 'transparent');
                        t.style.borderColor = 'var(--primary-color)';
                        const imgIdx = parseInt(t.dataset.imgIdx);
                        if (imgIdx >= 0) {
                            senderIconMap[ns] = imageFiles[imgIdx].data;
                        } else {
                            delete senderIconMap[ns];
                        }
                    };
                });

                const radio = item.querySelector('input[type="radio"]');
                if (radio) radio.onchange = () => { if(radio.checked) mainIconTarget = ns; };
            });
        }
        
        const cleanup = () => {
            if (modal) modal.classList.add('hidden');
            if (applyBtn) applyBtn.removeEventListener('click', applyHandler);
            if (closeBtn) closeBtn.removeEventListener('click', closeHandler);
        };
        const closeHandler = () => { cleanup(); resolve(null); };
        const applyHandler = () => {
            const mapping = {};
            inputNodes.forEach(node => {
                mapping[node.dataset.newSender] = node.value.trim();
            });
            const finalTitle = (titleInput ? titleInput.value.trim() : "") || defaultTitle;
            cleanup();
            resolve({ title: finalTitle, mapping, userIcons: senderIconMap, mainIcon: mainIconTarget });
        };
        
        if (closeBtn) closeBtn.addEventListener('click', closeHandler);
        if (applyBtn) applyBtn.addEventListener('click', applyHandler);
    });
}

async function processFiles(files, targetChat = null) {
    if (!files || !files.length) return;
    
    showLoading();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const imageFiles = [];
    const textFiles = [];
    for (const f of files) {
        if (f.type.startsWith('image/')) {
            const b64 = await new Promise(res => {
                const reader = new FileReader();
                reader.onload = (e) => res(e.target.result);
                reader.readAsDataURL(f);
            });
            imageFiles.push({ name: f.name, data: b64 });
        } else if (f.name.endsWith('.txt')) {
            textFiles.push(f);
        }
    }

    let successCount = 0;
    
    try {
        for (const file of textFiles) {
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

                hideLoading(); 
                
                const existingChats = await LineChatDB.getAllChats();
                const allSenders = Array.from(new Set(existingChats.flatMap(c => {
                    if(!c.messages) return [];
                    return c.messages.filter(m => m.type === 'msg').map(m => m.sender);
                })));
                
                const newSenders = Array.from(new Set(parsed.messages.filter(m => m.type === 'msg').map(m => m.sender)));
                
                const previewResult = await promptMergeMapping(newSenders, allSenders, parsed.title, imageFiles);
                if (!previewResult) continue; 
                
                showLoading(); 
                
                parsed.title = previewResult.title;
                parsed.userIcons = previewResult.userIcons || {};
                
                const mappedIconCount = Object.keys(parsed.userIcons).length;
                if (mappedIconCount === 1) {
                    parsed.icon = Object.values(parsed.userIcons)[0];
                } else if (imageFiles.length === 1 && mappedIconCount === 0) {
                    parsed.icon = imageFiles[0].data;
                } else if (previewResult.mainIcon) {
                    parsed.icon = previewResult.userIcons[previewResult.mainIcon];
                }

                parsed.messages.forEach(m => {
                    if (m.type === 'msg' && previewResult.mapping[m.sender]) {
                        m.sender = previewResult.mapping[m.sender];
                    }
                });

                const tempMatch = await LineChatDB.getChatByTitle(parsed.title);
                let existingChat = targetChat;

                if (!targetChat && tempMatch) {
                    hideLoading();
                    const choice = await new Promise(resolve => {
                        const modal = document.getElementById('merge-confirm-modal');
                        const mergeBtn = document.getElementById('merge-confirm-apply-btn');
                        const newBtn = document.getElementById('merge-confirm-new-btn');
                        const cancelBtn = document.getElementById('merge-confirm-cancel-btn');
                        
                        if (modal) modal.classList.remove('hidden');
                        
                        const cleanup = (val) => {
                            if (modal) modal.classList.add('hidden');
                            if (mergeBtn) mergeBtn.onclick = null;
                            if (newBtn) newBtn.onclick = null;
                            if (cancelBtn) cancelBtn.onclick = null;
                            resolve(val);
                        };
                        
                        if (mergeBtn) mergeBtn.onclick = () => cleanup('merge');
                        if (newBtn) newBtn.onclick = () => cleanup('new');
                        if (cancelBtn) cancelBtn.onclick = () => cleanup('cancel');
                    });
                    showLoading();
                    
                    if (choice === 'cancel') continue;
                    if (choice === 'merge') {
                        existingChat = tempMatch;
                    } 
                } else {
                    existingChat = targetChat || tempMatch;
                }

                if (existingChat) {
                    const existingSet = new Set();
                    existingChat.messages.forEach(m => {
                        if (m.type === 'msg' || m.type === 'sys') {
                            existingSet.add(`${m.date}_${m.time}_${m.sender||''}_${m.text}`);
                        }
                    });
                    
                    let added = 0;
                    const getSafeTimestamp = (date, time) => {
                        try {
                            return new Date(`${date.replace(/\//g, '-')}T${time || "00:00"}`).getTime();
                        } catch(e) { return 0; }
                    };
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
                    }
                } else {
                    await LineChatDB.saveChat(parsed);
                    successCount++;
                }
            } catch (err) {
                console.error(`Import failed for ${file.name}:`, err);
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

if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
        await processFiles(e.target.files);
        e.target.value = '';
    });
}

if (roomFileInput) {
    roomFileInput.addEventListener('change', async (e) => {
        if (!currentChat) return;
        await processFiles(e.target.files, currentChat);
        e.target.value = '';
        await openChat(currentChat.id); 
    });
}

if (ctxAdd) {
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
}

const roomSettingsBtn = document.getElementById('room-settings-btn');

function renderRoomSettingsMembers(senders) {
    if (!roomSettingsMembers) return;
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
            const iIn = document.getElementById('icon-input');
            if (iIn) iIn.click();
        };
        
        const sName = div.querySelector('.s-name');
        sName.oninput = (e) => {
            tempNameMap[s] = e.target.value.trim();
        };
        
        const radio = div.querySelector('input[type="radio"]');
        if (radio) radio.onchange = () => {
            if(radio.checked) tempMainIconTarget = s;
        };
        
        roomSettingsMembers.appendChild(div);
    });
}

if (roomSettingsBtn) {
    roomSettingsBtn.addEventListener('click', () => {
        if (!currentChat) return;
        pushViewState({ view: UI_VIEWS.ROOM, chatId: currentChatId, modal: UI_MODALS.ROOM_SETTINGS });
    });
}

function openRoomSettingsInternal() {
    if (!currentChat) return;
    if (roomSettingsTitle) roomSettingsTitle.value = currentChat.title;
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
    if (roomSettingsModal) roomSettingsModal.classList.remove('hidden');
}

const rsAddBtn = document.getElementById('room-settings-add-file-btn');
const rsFileInput = document.getElementById('room-settings-file-input');
if (rsAddBtn && rsFileInput) {
    rsAddBtn.addEventListener('click', () => rsFileInput.click());
    rsFileInput.addEventListener('change', async (e) => {
        if (!currentChat) return;
        roomSettingsModal.classList.add('hidden'); 
        await processFiles(e.target.files, currentChat);
        e.target.value = '';
        await openChat(currentChat.id); 
    });
}
if (closeRoomSettingsModal) closeRoomSettingsModal.addEventListener('click', () => history.back());

if (roomSettingsApplyBtn) {
    roomSettingsApplyBtn.addEventListener('click', async () => {
        if (!currentChat) return;
        
        if (roomSettingsTitle && roomSettingsTitle.value.trim() !== '') currentChat.title = roomSettingsTitle.value.trim();
        
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
        const mappedIconValues = Object.values(tempIconMap).filter(Boolean);
        if (mappedIconValues.length === 1) {
            currentChat.icon = mappedIconValues[0];
        } else if (tempMainIconTarget && tempIconMap[tempMainIconTarget]) {
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

if (iconInput) {
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
                
                if (roomSettingsModal && !roomSettingsModal.classList.contains('hidden')) {
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
}

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
            if (iconText) iconText.style.display = 'none';
        } else {
            iconDisplay.style.backgroundImage = 'none';
            if (iconText) {
                iconText.style.display = 'block';
                iconText.textContent = (chat.title || "？").charAt(0);
            }
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
            if (window.pendingSearchJumpIndex !== undefined) {
                vScroll.scrollToIndex(window.pendingSearchJumpIndex);
                window.pendingSearchJumpIndex = undefined;
            } else {
                vScroll.scrollToIndex(chat.messages.length - 1);
            }
        }
    } catch (err) {
        console.error('Failed to open chat:', err);
        hideLoading();
        
        if (roomView) {
            roomView.style.display = 'none';
            roomView.classList.remove('active');
        }
        if (listView) {
            listView.style.display = 'flex';
            listView.classList.add('active');
        }
        
        history.replaceState({ view: UI_VIEWS.LIST }, "");
    }
}

if (backBtn) {
    backBtn.addEventListener('click', () => {
        history.back();
    });
}

const aboutModal = document.getElementById('about-modal');
document.querySelectorAll('h1').forEach(h => {
    if (h.textContent === 'Ark-ive') {
        h.style.cursor = 'pointer';
        h.onclick = () => {
            if (aboutModal) aboutModal.classList.remove('hidden');
        };
    }
});
const closeAboutModalBtn = document.getElementById('close-about-modal');
if (closeAboutModalBtn) {
    closeAboutModalBtn.addEventListener('click', () => history.back());
}

const favModal = document.getElementById('favorites-modal');
const favList = document.getElementById('favorites-list');
const openFavs = async (specificChatId = null) => {
    if (!favList) return;
    const chats = await LineChatDB.getAllChats();
    favList.innerHTML = '';
    let hasFavs = false;
    chats.forEach(chat => {
        if (specificChatId && chat.id !== specificChatId) return;

        chat.messages.forEach((m, idx) => {
            if (m.isFavorite) {
                hasFavs = true;
                const div = document.createElement('div');
                div.className = 'modal-list-item';
                div.innerHTML = `
                    <div style="color:var(--text-muted); font-size:11px; margin-bottom:8px; opacity:0.8;">[${chat.title}] ${m.date} ${m.time || ''}</div>
                    <div style="display:flex; align-items:flex-start; gap:12px;">
                        <div style="width:75px; flex-shrink:0; font-weight:bold; color:var(--primary-color); font-size:13px; text-align:right; border-right:2px solid var(--border-color); padding-right:10px; word-break:break-all;">
                            ${m.sender || 'Unknown'}
                        </div>
                        <div style="flex:1; font-size:14.5px; line-height:1.5; white-space:pre-wrap; word-break:break-word;">${m.text}</div>
                    </div>
                `;
                div.onclick = () => {
                    if (favModal) favModal.classList.add('hidden');
                    openChat(chat.id).then(() => vScroll.scrollToIndex(idx));
                };
                favList.appendChild(div);
            }
        });
    });
    if (!hasFavs) favList.innerHTML = `<div style="padding:40px; text-align:center; color:var(--text-muted);">${specificChatId ? 'このルームにお気に入りはありません' : 'お気に入りはありません'}</div>`;
    if (favModal) favModal.classList.remove('hidden');
};
const favListBtn = document.getElementById('favorites-list-btn');
if (favListBtn) {
    favListBtn.addEventListener('click', () => {
    pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.FAVORITES });
});
}
const roomFavBtn = document.getElementById('room-favorites-btn');
if (roomFavBtn) {
    roomFavBtn.addEventListener('click', () => {
    pushViewState({ view: UI_VIEWS.ROOM, chatId: currentChatId, modal: UI_MODALS.FAVORITES });
});
}
const closeFavModalBtn = document.getElementById('close-favorites-modal');
if (closeFavModalBtn) {
    closeFavModalBtn.addEventListener('click', () => history.back());
}

const archivedList = document.getElementById('archived-list');
const archiveViewBtn = document.getElementById('archive-view-btn');
if (archiveViewBtn) {
    archiveViewBtn.addEventListener('click', async () => {
    pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.ARCHIVED });
});
}

async function renderArchivedList() {
    if (!archivedList) return;
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
                        <p style="margin:0; font-size:12px; color:var(--text-muted);">${c.messages ? c.messages.length : 0}件のメッセージ</p>
                    </div>
                </div>
            `;
            
            div.oncontextmenu = (e) => {
                e.preventDefault();
                contextTargetId = c.id;
                let cx = e.clientX, cy = e.clientY;
                if (e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
                contextMenu.style.left = `${Math.min(cx, window.innerWidth - 160)}px`;
                contextMenu.style.top = `${Math.min(cy, window.innerHeight - 100)}px`;
                contextMenu.classList.add('active');
                
                if (ctxArchive) {
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
                }
            };
            archivedList.appendChild(div);
        });
    }
}

const closeArchivedBtn = document.getElementById('close-archived-modal');
if (closeArchivedBtn) {
    closeArchivedBtn.addEventListener('click', () => history.back());
}

const ctxArchive = document.createElement('div');
ctxArchive.className = 'context-item';
ctxArchive.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path></svg> アーカイブ';
if (ctxDelete) ctxDelete.before(ctxArchive);
const archiveHandler = async () => {
    if (contextMenu) contextMenu.classList.remove('active');
    if (!contextTargetId) return;
    const chat = await LineChatDB.getChatById(contextTargetId);
    if (!chat) return;
    chat.isArchived = true;
    await LineChatDB.updateChat(chat);
    showToast("トークをアーカイブしました");
    loadChatList();
};
ctxArchive.onclick = archiveHandler;

const listShuffleBtn = document.getElementById('list-shuffle-btn');
if (listShuffleBtn) {
    listShuffleBtn.addEventListener('click', async () => {
    const chats = (await LineChatDB.getAllChats()).filter(c => !c.isArchived);
    if (chats.length === 0) return;
    const chat = chats[Math.floor(Math.random() * chats.length)];
    if (!chat.messages || chat.messages.length === 0) return;
    const idx = Math.floor(Math.random() * chat.messages.length);
    window.pendingSearchJumpIndex = idx;
    openChat(chat.id);
});
}

const roomShuffleBtn = document.getElementById('room-shuffle-btn');
if (roomShuffleBtn) {
    roomShuffleBtn.addEventListener('click', () => {
    if (!currentChat || !currentChat.messages) return;
    const msgs = currentChat.messages.filter(m => m.type === 'msg');
    if (msgs.length === 0) return;
    const target = msgs[Math.floor(Math.random() * msgs.length)];
    const idx = currentChat.messages.indexOf(target);
    vScroll.scrollToIndex(idx);
    showToast('シャッフルジャンプしました');
});
}

async function initMemo(mode) {
    if (mode === 'fake') {
        initMemoInternal('arkive_fake_memo_data', true);
        return;
    }
    initMemoInternal('arkive_memo_data', false);
}
async function initMemoInternal(storageKey = 'arkive_memo_data', isFake = false) {
    const prefix = isFake ? 'fake-memo-' : 'memo-';
    
    // 要素の取得
    const views = {
        index: document.getElementById(prefix + 'index-view'),
        edit: document.getElementById(prefix + 'edit-view'),
        detail: document.getElementById(prefix + 'detail-view')
    };
    
    const elements = {
        list: document.getElementById(prefix + 'index-list'),
        titleLabel: document.getElementById(prefix + 'modal-title'),
        selectionLabel: document.getElementById(prefix + 'selection-label'),
        searchBar: document.getElementById(prefix + 'search-bar'),
        searchInput: document.getElementById(prefix + 'search-input'),
        
        editTitle: document.getElementById(prefix + 'edit-title'),
        editContent: document.getElementById(prefix + 'edit-content'),
        
        detailTitle: document.getElementById(prefix + 'detail-title'),
        detailContent: document.getElementById(prefix + 'detail-content'),
        
        // ボタン類
        backBtn: document.getElementById(prefix + 'back-btn'),
        closeBtn: document.getElementById(isFake ? 'fake-memo-lock-btn' : 'close-memo-modal-btn'),
        addBtn: document.getElementById(prefix + 'header-add-btn'),
        editBtn: document.getElementById(prefix + 'header-edit-btn'),
        deleteBtn: document.getElementById(prefix + 'header-delete-btn'),
        searchBtn: document.getElementById(prefix + 'header-search-btn'),
        bulkDeleteBtn: document.getElementById(prefix + 'header-bulk-delete-btn'),
        deleteConfirmBtn: document.getElementById(prefix + 'header-delete-confirm-btn'),
        saveBtn: document.getElementById(prefix + 'header-save-btn')
    };

    let currentMemos = [];
    let editingIdx = -1;
    let isSelectionMode = false;
    let selectedIndices = new Set();
    let searchKeyword = "";

    // v1.1.25: レイアウトはすべてstyle.cssに集約しました。
    // ここでは初期フラグの管理とイベントの紐付けに集中します。

    const switchView = (viewName) => {
        Object.values(views).forEach(v => { if(v) v.style.display = 'none'; });
        Object.values(elements).forEach(el => {
            if (el && (el.classList.contains('icon-btn') || el.classList.contains('back-btn') || el.id.includes('confirm'))) {
                el.style.display = 'none';
            }
        });
        if (elements.searchBar) elements.searchBar.style.display = 'none';
        if (elements.closeBtn && !isFake) elements.closeBtn.style.display = 'none';

        if (viewName === 'index') {
            if (views.index) {
                views.index.style.display = 'flex';
                views.index.style.flexDirection = 'column';
                views.index.style.alignItems = 'flex-start';
            }
            if (elements.closeBtn) elements.closeBtn.style.display = 'flex';
            if (elements.addBtn) elements.addBtn.style.display = 'flex';
            if (elements.searchBtn) elements.searchBtn.style.display = 'flex';
            if (elements.bulkDeleteBtn) elements.bulkDeleteBtn.style.display = 'flex';
            
            if (isSelectionMode) {
                if (elements.addBtn) elements.addBtn.style.display = 'none';
                if (elements.searchBtn) elements.searchBtn.style.display = 'none';
                if (elements.deleteConfirmBtn) elements.deleteConfirmBtn.style.display = 'flex';
                if (elements.titleLabel) elements.titleLabel.style.display = 'none';
                if (elements.selectionLabel) elements.selectionLabel.style.display = 'block';
                if (elements.bulkDeleteBtn) {
                    elements.bulkDeleteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
                    elements.bulkDeleteBtn.title = "キャンセル";
                }
            } else {
                if (elements.titleLabel) elements.titleLabel.style.display = 'block';
                if (elements.selectionLabel) elements.selectionLabel.style.display = 'none';
                if (elements.bulkDeleteBtn) {
                    elements.bulkDeleteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
                    elements.bulkDeleteBtn.title = "一括削除";
                }
            }
        } else if (viewName === 'edit') {
            if (views.edit) views.edit.style.display = 'flex';
            if (elements.backBtn) elements.backBtn.style.display = 'flex';
            if (elements.saveBtn) elements.saveBtn.style.display = 'flex';
        } else if (viewName === 'detail') {
            if (views.detail) {
                views.detail.style.display = 'flex';
                views.detail.style.flexDirection = 'column';
                views.detail.style.alignItems = 'flex-start';
            }
            if (elements.backBtn) elements.backBtn.style.display = 'flex';
            if (elements.editBtn) elements.editBtn.style.display = 'flex';
            if (elements.deleteBtn) elements.deleteBtn.style.display = 'flex';
        }
    };

    const loadMemos = async () => {
        let raw = await LineChatDB.getSetting(storageKey, []);
        currentMemos = raw.map(m => (typeof m === 'string' ? { title: m.substring(0, 15) || '無題', text: m, time: Date.now() } : m));
        
        if (!elements.list) return;
        elements.list.innerHTML = '';
        const filtered = currentMemos.map((m, i) => ({...m, originalIndex: i}))
            .filter(m => {
                if (!searchKeyword) return true;
                const kw = searchKeyword.toLowerCase();
                return (m.title || "").toLowerCase().includes(kw) || (m.text || "").toLowerCase().includes(kw);
            });

        filtered.forEach((memo) => {
            const idx = memo.originalIndex;
            const card = document.createElement('div');
            card.className = 'memo-card modal-list-item';
            card.style.cursor = 'pointer';
            card.style.gap = '12px';

            card.innerHTML = `
                ${isSelectionMode ? `<input type="checkbox" ${selectedIndices.has(idx) ? 'checked' : ''} style="width:20px; height:20px; flex-shrink:0;">` : ''}
                <div style="flex:1; overflow:hidden; text-align:left;">
                    <h4 style="margin:0 0 5px 0; text-align:left;">${memo.title || '無題'}</h4>
                    <p style="margin:0; font-size:14px; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:left;">${(memo.text || '').replace(/\n/g, ' ')}</p>
                    <div style="font-size:10px; color:var(--text-muted); margin-top:5px; text-align:left;">${new Date(memo.time || Date.now()).toLocaleString()}</div>
                </div>
            `;
            
            card.onclick = () => {
                if (isSelectionMode) {
                    if (selectedIndices.has(idx)) selectedIndices.delete(idx);
                    else selectedIndices.add(idx);
                    loadMemos();
                    return;
                }
                editingIdx = idx;
                if (elements.detailTitle) elements.detailTitle.textContent = memo.title;
                if (elements.detailContent) elements.detailContent.textContent = memo.text;
                switchView('detail');
            };
            elements.list.appendChild(card);
        });
        
        if (filtered.length === 0) {
            elements.list.innerHTML = `<div style="padding:50px; text-align:center; color:var(--text-muted);">${searchKeyword ? '検索結果が見つかりません' : 'メモがありません'}</div>`;
        }
    };

    const deleteMemoAt = async (idx) => {
        currentMemos.splice(idx, 1);
        await LineChatDB.setSetting(storageKey, currentMemos);
        showToast('削除しました');
        await loadMemos();
        switchView('index');
    };

    const autoSave = async () => {
        const t = elements.editTitle.value.trim() || '無題';
        const c = elements.editContent.value.trim();
        if (!t && !c) return;
        const newM = { title: t, text: c, time: Date.now() };
        if (editingIdx >= 0) {
            currentMemos[editingIdx] = newM;
        } else {
            currentMemos.unshift(newM);
            editingIdx = 0; // 新規作成されたのでインデックスを0に固定して上書きを続ける
        }
        await LineChatDB.setSetting(storageKey, currentMemos);
    };

    // イベント紐付け
    if (elements.addBtn) elements.addBtn.onclick = () => {
        editingIdx = -1;
        if (elements.editTitle) elements.editTitle.value = '';
        if (elements.editContent) elements.editContent.value = '';
        switchView('edit');
    };
    if (elements.editBtn) elements.editBtn.onclick = () => {
        const m = currentMemos[editingIdx];
        if (elements.editTitle) elements.editTitle.value = m.title || '';
        if (elements.editContent) elements.editContent.value = m.text || '';
        switchView('edit');
    };
    if (elements.deleteBtn) elements.deleteBtn.onclick = () => {
        if (confirm('このメモを削除しますか？')) deleteMemoAt(editingIdx);
    };
    if (elements.backBtn) {
        elements.backBtn.onclick = async () => {
            await loadMemos();
            switchView('index');
        };
    }
    if (elements.editTitle) elements.editTitle.addEventListener('input', autoSave);
    if (elements.editContent) elements.editContent.addEventListener('input', autoSave);

    if (elements.closeBtn) {
        elements.closeBtn.onclick = () => {
            if (isFake) location.reload();
            else history.back();
        };
    }
    if (elements.saveBtn) {
        elements.saveBtn.textContent = '完了';
        elements.saveBtn.onclick = async () => {
            await autoSave();
            showToast('保存しました');
            await loadMemos();
            switchView('index');
        };
    }
    if (elements.searchBtn) {
        elements.searchBtn.onclick = () => {
            const isHidden = elements.searchBar.style.display === 'none';
            elements.searchBar.style.display = isHidden ? 'block' : 'none';
            if (isHidden) elements.searchInput.focus();
        };
    }
    if (elements.searchInput) {
        elements.searchInput.oninput = (e) => {
            searchKeyword = e.target.value;
            loadMemos();
        };
    }
    if (elements.bulkDeleteBtn) {
        elements.bulkDeleteBtn.onclick = () => {
            isSelectionMode = !isSelectionMode;
            selectedIndices.clear();
            loadMemos();
            switchView('index');
        };
    }
    if (elements.deleteConfirmBtn) {
        elements.deleteConfirmBtn.onclick = async () => {
            if (selectedIndices.size === 0) return;
            if (confirm(`${selectedIndices.size}件のメモを削除しますか？`)) {
                const newList = currentMemos.filter((_, i) => !selectedIndices.has(i));
                await LineChatDB.setSetting(storageKey, newList);
                selectedIndices.clear();
                isSelectionMode = false;
                await loadMemos();
                switchView('index');
            }
        };
    }

    switchView('index');
    await loadMemos();

    // v1.1.25: 修正確認ロジック（実行時に自動検証）
    const verifyLayout = () => {
        const testEl = views.index;
        if (!testEl) return;
        const comp = window.getComputedStyle(testEl);
        const result = (comp.textAlign === 'left' || comp.textAlign === 'start') && comp.alignItems === 'stretch';
        console.log(`[Ark-ive v1.1.25] Alignment Verification: ${result ? 'PASSED (Left-aligned & Stretched)' : 'FAILED'}`);
        if (!result) {
            // 万が一失敗していた場合の最終手段
            testEl.style.setProperty('text-align', 'left', 'important');
            testEl.style.setProperty('align-items', 'stretch', 'important');
        }
    };
    setTimeout(verifyLayout, 500);
}

function initGlobalFeatures() {
    // 既存のコードの続き
    const sMemberBtn = findViewById('search-member-filter-btn');
    if (sMemberBtn) {
        sMemberBtn.onclick = async () => {
            window.isGlobalSearchFilterMode = false;
            if (!currentChat) return;
            const senders = new Set();
            currentChat.messages.forEach(m => { if(m.sender) senders.add(m.sender); });
            if (typeof window.renderMemberFilter === 'function') {
                window.renderMemberFilter(senders);
                const mfM = findViewById('member-filter-modal');
                if (mfM) mfM.classList.remove('hidden');
            }
        };
    }

    const sBtn = findViewById('settings-btn');
    if (sBtn) sBtn.onclick = () => pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.SETTINGS });
    const csBtn = findViewById('close-settings-modal');
    if (csBtn) csBtn.onclick = () => history.back();
    const lmBtn = findViewById('list-manual-btn');
    if (lmBtn) lmBtn.onclick = () => pushViewState({ view: UI_VIEWS.MANUAL });
    const mbBtn = findViewById('manual-back-btn');
    if (mbBtn) mbBtn.onclick = () => history.back();
    const gsBtn = findViewById('global-search-btn');
    if (gsBtn) gsBtn.onclick = () => pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.G_SEARCH });
    const cgsBtn = findViewById('close-global-search-modal');
    if (cgsBtn) cgsBtn.onclick = () => history.back();
    const gcBtn = findViewById('global-calendar-btn');
    if (gcBtn) gcBtn.onclick = () => pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.G_CAL });
    const cgcBtn = findViewById('close-global-calendar-modal');
    if (cgcBtn) {
        cgcBtn.onclick = () => {
            const monthListView = findViewById('global-month-list-view');
            if (monthListView && !monthListView.classList.contains('hidden')) {
                closeMonthList({ list: 'global-month-list-view', grid: 'global-calendar-grid', prev: 'global-cal-prev-btn', next: 'global-cal-next-btn' });
            } else {
                history.back();
            }
        };
    }
    const cdmBtn = findViewById('close-date-modal');
    if (cdmBtn) {
        cdmBtn.onclick = () => {
            const monthListView = findViewById('month-list-view');
            if (monthListView && !monthListView.classList.contains('hidden')) {
                closeMonthList({ list: 'month-list-view', grid: 'calendar-grid', prev: 'cal-prev-btn', next: 'cal-next-btn', header: 'calendar-header-main' });
            } else {
                history.back();
            }
        };
    }
    const dBtn = findViewById('date-btn');
    if (dBtn) dBtn.onclick = () => pushViewState({ view: UI_VIEWS.ROOM, chatId: currentChatId, modal: UI_MODALS.DATE });
    const cabBtn = findViewById('close-about-modal');
    if (cabBtn) cabBtn.onclick = () => history.back();

    const gSearchInput = findViewById('global-search-input');
    const gSearchResults = findViewById('global-search-results');
    const gSearchSort = findViewById('global-search-sort-btn');
    const gSearchDateS = findViewById('global-search-date-start');
    const gSearchDateE = findViewById('global-search-date-end');
    const gSearchMemberBtn = findViewById('global-search-member-btn');
    
    window.gSearchMemberFilter = new Set();

    window.triggerGlobalSearch = async () => {
        if (!gSearchInput) return;
        const val = gSearchInput.value.trim().toLowerCase();
        const gSearchTotalHits = document.getElementById('global-search-total-hits');
        if (val.length < 1) { 
            if (gSearchResults) gSearchResults.innerHTML = ''; 
            if (gSearchTotalHits) gSearchTotalHits.textContent = '0';
            return; 
        }
        
        if (LineChatDB.encryptionKey === null) {
            showToast('データが保護解除されていないため検索できません');
            return;
        }

        const tokens = val.split(/\s+/).filter(t => t.length > 0);
        const includeTokens = tokens.filter(t => !t.startsWith('-'));
        const excludeTokens = tokens.filter(t => t.startsWith('-')).map(t => t.substring(1));

        const dStart = gSearchDateS && gSearchDateS.value ? new Date(gSearchDateS.value + 'T00:00:00').getTime() : 0;
        const dEnd = gSearchDateE && gSearchDateE.value ? new Date(gSearchDateE.value + 'T23:59:59').getTime() : Infinity;
        const sortMode = gSearchSort ? gSearchSort.getAttribute('data-sort') : 'desc';

        try {
            const chats = await LineChatDB.getAllChats();
            let hits = [];
            window.currentGlobalHitSenders.clear();

            chats.forEach(chat => {
                if (!chat.messages) return;
                chat.messages.forEach((m, idx) => {
                    try {
                        if (window.matchMessage(m, includeTokens, excludeTokens, { dStart, dEnd, memberFilter: window.gSearchMemberFilter, mode: window.globalSearchMode || 'AND' })) {
                            hits.push({ chat, message: m, index: idx });
                            if (m.sender) window.currentGlobalHitSenders.add(m.sender);
                        }
                    } catch (e) {}
                });
            });

            hits.sort((a, b) => {
                const tsA = a.message._timestamp || 0;
                const tsB = b.message._timestamp || 0;
                return sortMode === 'desc' ? tsB - tsA : tsA - tsB;
            });

            const totalHitsNode = document.getElementById('global-search-total-hits');
            if (totalHitsNode) totalHitsNode.textContent = hits.length;

            let html = '';
            const highlightPattern = includeTokens.length > 0 ? includeTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') : "";

            hits.slice(0, 200).forEach(h => {
                let snippet = h.message.text || "";
                if (snippet.length > 60) snippet = snippet.substring(0, 60) + '...';
                
                if (highlightPattern) {
                    const regex = new RegExp(`(${highlightPattern})`, 'gi');
                    snippet = snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(regex, '<mark>$1</mark>');
                } else {
                    snippet = snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                }

                html += `<div class="modal-list-item global-hit-card" data-id="${h.chat.id}" data-idx="${h.index}">
                    <div class="search-hit-sender">
                        <span style="color:var(--primary-color); font-weight:bold;">[${h.chat.title}]</span> 
                        <span style="color:#7494c0; margin-left:5px;">${h.message.date || ''}</span> 
                        ${h.message.sender || 'Unknown'} 
                        <span style="color:#777; font-weight:normal;">(${h.message.time || ''})</span>
                    </div>
                    <div class="search-hit-text">${snippet}</div>
                </div>`;
            });
            if (gSearchResults) gSearchResults.innerHTML = html || '<div style="text-align:center; padding:20px; color:var(--text-muted);">見つかりませんでした</div>';
        } catch (err) {
            console.error('Global search error:', err);
        }
    };

    if (gSearchInput) gSearchInput.oninput = window.triggerGlobalSearch;
    if (gSearchDateS) gSearchDateS.onchange = window.triggerGlobalSearch;
    if (gSearchDateE) gSearchDateE.onchange = window.triggerGlobalSearch;
    if (gSearchSort) {
        gSearchSort.onclick = () => {
            const current = gSearchSort.getAttribute('data-sort');
            if (current === 'desc') {
                gSearchSort.setAttribute('data-sort', 'asc');
                gSearchSort.textContent = '古い順';
            } else {
                gSearchSort.setAttribute('data-sort', 'desc');
                gSearchSort.textContent = '新しい順';
            }
            window.triggerGlobalSearch();
        };
    }

    if (gSearchMemberBtn) {
        gSearchMemberBtn.onclick = async () => {
            window.isGlobalSearchFilterMode = true; 
            const senders = window.currentGlobalHitSenders;
            if (senders.size === 0) {
                showToast('検索結果がありません');
                return;
            }
            
            const filterList = document.getElementById('member-filter-list');
            if (filterList) {
                filterList.innerHTML = '';
                Array.from(senders).sort().forEach(name => {
                    const label = document.createElement('label');
                    label.style = "display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid #eee; font-size:16px; color:var(--text-main);";
                    const isChecked = window.gSearchMemberFilter.has(name) || window.gSearchMemberFilter.size === 0;
                    label.innerHTML = `<input type="checkbox" value="${name}" ${isChecked ? 'checked' : ''} style="width:20px; height:20px;"> <span style="flex:1;">${name}</span>`;
                    filterList.appendChild(label);
                });
            }
            const mfM = findViewById('member-filter-modal');
            if (mfM) mfM.classList.remove('hidden');
        };
    }

    if (gSearchResults) {
        gSearchResults.onclick = (e) => {
            const card = e.target.closest('.global-hit-card');
            if (card && card.dataset.id) {
                const idx = parseInt(card.dataset.idx);
                window.pendingSearchJumpIndex = idx;
                openChat(card.dataset.id);
                const gSM = findViewById('global-search-modal');
                if (gSM) gSM.classList.add('hidden');
            }
        };
    }

    // --- 個別トーク画面内の検索ロジック ---
    const sInput = findViewById('keyword-search');
    const sResults = findViewById('search-result-list');
    const sSort = findViewById('search-sort-btn');
    const sDateS = findViewById('search-date-start');
    const sDateE = findViewById('search-date-end');
    const sClose = findViewById('close-search-modal');

    window.triggerSearch = async () => {
        if (!sInput || !currentChat || !currentChat.messages) return;
        const val = sInput.value.trim().toLowerCase();
        const totalHitsNode = document.getElementById('search-total-hits');
        
        if (val.length < 1) {
            if (sResults) sResults.innerHTML = '';
            if (totalHitsNode) totalHitsNode.textContent = '0';
            return;
        }

        const tokens = val.split(/\s+/).filter(t => t.length > 0);
        const includeTokens = tokens.filter(t => !t.startsWith('-'));
        const excludeTokens = tokens.filter(t => t.startsWith('-')).map(t => t.substring(1));

        const dStart = sDateS && sDateS.value ? new Date(sDateS.value + 'T00:00:00').getTime() : 0;
        const dEnd = sDateE && sDateE.value ? new Date(sDateE.value + 'T23:59:59').getTime() : Infinity;
        const sortMode = sSort ? sSort.getAttribute('data-sort') : 'desc';

        let hits = [];
        currentChat.messages.forEach((m, idx) => {
            if (window.matchMessage(m, includeTokens, excludeTokens, { dStart, dEnd, mode: window.individualSearchMode || 'AND' })) {
                hits.push({ ...m, index: idx });
            }
        });

        hits.sort((a, b) => {
            const tsA = a._timestamp || 0;
            const tsB = b._timestamp || 0;
            return sortMode === 'desc' ? tsB - tsA : tsA - tsB;
        });

        if (totalHitsNode) totalHitsNode.textContent = hits.length;

        let html = '';
        const highlightPattern = includeTokens.length > 0 ? includeTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') : "";

        hits.slice(0, 100).forEach(h => {
            let snippet = h.text || "";
            if (snippet.length > 60) snippet = snippet.substring(0, 60) + '...';
            
            if (highlightPattern) {
                const regex = new RegExp(`(${highlightPattern})`, 'gi');
                snippet = snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(regex, '<mark>$1</mark>');
            } else {
                snippet = snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }

            html += `<div class="modal-list-item search-hit-card" data-idx="${h.index}">
                <div class="search-hit-sender">
                    <span style="color:#7494c0;">${h.date || ''}</span> ${h.sender || 'Unknown'} <span style="color:#777; font-weight:normal;">(${h.time || ''})</span>
                </div>
                <div class="search-hit-text">${snippet}</div>
            </div>`;
        });
        if (sResults) sResults.innerHTML = html || '<div style="text-align:center; padding:20px; color:var(--text-muted);">見つかりませんでした</div>';
    };

    if (sInput) sInput.oninput = window.triggerSearch;
    if (sDateS) sDateS.onchange = window.triggerSearch;
    if (sDateE) sDateE.onchange = window.triggerSearch;
    if (sSort) {
        sSort.onclick = () => {
            const current = sSort.getAttribute('data-sort');
            if (current === 'desc') {
                sSort.setAttribute('data-sort', 'asc');
                sSort.textContent = '古い順';
            } else {
                sSort.setAttribute('data-sort', 'desc');
                sSort.textContent = '新しい順';
            }
            window.triggerSearch();
        };
    }
    if (sClose) sClose.onclick = () => history.back();

    if (sResults) {
        sResults.onclick = (e) => {
            const card = e.target.closest('.search-hit-card');
            if (card) {
                const idx = parseInt(card.dataset.idx);
                if (typeof vScroll !== 'undefined') vScroll.scrollToIndex(idx);
                history.back(); // モーダルを閉じる
            }
        };
    }
}

function initSettingsAutoSave() {
    const pToggle = findViewById('password-toggle');
    const fToggle = findViewById('fake-password-toggle');
    const pWarn = findViewById('passcode-warn-msg');
    const pContainer = findViewById('password-setup-container');
    const fInputs = findViewById('fake-password-inputs');
    
    const mainPassInput = findViewById('new-password');
    const mainConfirmInput = findViewById('confirm-password');
    const mainErrorMsg = findViewById('main-pass-error');
    const mainApplyBtn = findViewById('apply-main-pass-btn');
    
    const fakePassInput = findViewById('fake-password');
    const fakeConfirmInput = findViewById('confirm-fake-password');
    const fakeErrorMsg = findViewById('fake-pass-error');
    const fakeApplyBtn = findViewById('apply-fake-pass-btn');

    const updateVisibility = () => {
        const hasMain = localStorage.getItem('app_password_hash');
        const hasFake = localStorage.getItem('app_fake_password_hash');
        
        if (mainPassInput) mainPassInput.placeholder = hasMain ? "●●●●●●●●" : "新しいメインパスコード";
        if (fakePassInput) fakePassInput.placeholder = hasFake ? "●●●●●●●●" : "新しい偽パスコード";
        
        if (pWarn) pWarn.style.display = pToggle.checked ? 'block' : 'none';
        if (pContainer) pContainer.style.display = pToggle.checked ? 'block' : 'none';
        if (fInputs) fInputs.style.display = fToggle.checked ? 'block' : 'none';
    };

    const checkMain = () => {
        const v1 = mainPassInput.value;
        const v2 = mainConfirmInput.value;
        if (v1 && v2 && v1 !== v2) {
            mainErrorMsg.style.display = 'block';
            mainApplyBtn.disabled = true;
        } else {
            mainErrorMsg.style.display = 'none';
            mainApplyBtn.disabled = (v1.length === 0);
        }
    };
    const checkFake = () => {
        const v1 = fakePassInput.value;
        const v2 = fakeConfirmInput.value;
        if (v1 && v2 && v1 !== v2) {
            fakeErrorMsg.style.display = 'block';
            fakeApplyBtn.disabled = true;
        } else {
            fakeErrorMsg.style.display = 'none';
            fakeApplyBtn.disabled = (v1.length === 0);
        }
    };

    if (mainPassInput) mainPassInput.oninput = checkMain;
    if (mainConfirmInput) mainConfirmInput.oninput = checkMain;
    if (fakePassInput) fakePassInput.oninput = checkFake;
    if (fakeConfirmInput) fakeConfirmInput.oninput = checkFake;

    if (mainApplyBtn) {
        mainApplyBtn.onclick = async () => {
            const val = mainPassInput.value;
            if (!val) return;
            mainApplyBtn.disabled = true;
            showLoading();
            try {
                const chats = await LineChatDB.getAllChats();
                const settings = await LineChatDB.getAllSettings();
                
                const hash = await hashStr(val);
                localStorage.setItem('app_password_hash', hash);
                await initCrypto(val);
                
                for (const chat of chats) await LineChatDB.updateChat(chat);
                for (const key in settings) await LineChatDB.setSetting(key, settings[key]);
                
                showToast('メインパスコードを保存・適用しました');
                mainPassInput.value = '';
                mainConfirmInput.value = '';
                updateVisibility();
            } catch (err) {
                console.error('Re-encryption error:', err);
            } finally {
                hideLoading();
                mainApplyBtn.disabled = false;
            }
        };
    }

    if (fakeApplyBtn) {
        fakeApplyBtn.onclick = async () => {
            const val = fakePassInput.value;
            if (!val) return;
            fakeApplyBtn.disabled = true;
            try {
                const hash = await hashStr(val);
                localStorage.setItem('app_fake_password_hash', hash);
                showToast('偽パスコードを保存しました');
                fakePassInput.value = '';
                fakeConfirmInput.value = '';
                updateVisibility();
            } catch (err) {
                console.error('Save error:', err);
            } finally {
                fakeApplyBtn.disabled = false;
            }
        };
    }

    if (pToggle) {
        pToggle.onchange = async () => {
            if (!pToggle.checked) {
                if (!confirm("パスコードロックを無効にしますか？データは暗号化されずに保存されるようになります。")) {
                    pToggle.checked = true;
                    return;
                }
                showLoading();
                try {
                    const chats = await LineChatDB.getAllChats();
                    const settings = await LineChatDB.getAllSettings();
                    localStorage.removeItem('app_password_hash');
                    localStorage.removeItem('app_fake_password_hash');
                    await initCrypto("");
                    for (const chat of chats) await LineChatDB.updateChat(chat);
                    for (const key in settings) await LineChatDB.setSetting(key, settings[key]);
                    showToast("無効化しました");
                    updateVisibility();
                } catch (err) {
                    console.error(err);
                    pToggle.checked = true;
                } finally {
                    hideLoading();
                }
            } else {
                updateVisibility();
            }
        };
    }
    if (fToggle) fToggle.onchange = updateVisibility;
    
    const savedTheme = localStorage.getItem('app_theme') || 'line';
    applyTheme(savedTheme);

    const langSelect = findViewById('lang-select');
    if (langSelect) {
        langSelect.value = localStorage.getItem('app_lang') || 'ja';
        langSelect.onchange = (e) => {
            updateAppLanguage(e.target.value);
            showToast("言語を設定しました / Language set");
        };
    }
    
    const savedHash = localStorage.getItem('app_password_hash');
    const fakeHash = localStorage.getItem('app_fake_password_hash');
    if (savedHash && pToggle) pToggle.checked = true;
    if (fakeHash && fToggle) fToggle.checked = true;
    updateVisibility();
}

function initBackupHandlers() {
    const rsExBtn = findViewById('room-settings-export-btn');
    if (rsExBtn) {
        rsExBtn.onclick = () => {
            pushViewState({ view: UI_VIEWS.ROOM, chatId: currentChatId, modal: UI_MODALS.BACKUP_OPT });
        };
    }
    const bOptJson = findViewById('backup-opt-json');
    if (bOptJson) bOptJson.onclick = () => { history.back(); if (currentChat) exportChatJson(currentChat); };
    const bOptTxt = findViewById('backup-opt-txt');
    if (bOptTxt) bOptTxt.onclick = () => { history.back(); if (currentChat) exportChatTxt(currentChat); };
    const bOptCan = findViewById('backup-opt-cancel');
    if (bOptCan) bOptCan.onclick = () => history.back();
    const cBOBtn = findViewById('close-backup-options-modal');
    if (cBOBtn) cBOBtn.onclick = () => history.back();
}

function exportChatJson(chat) {
    const filename = prompt('保存するファイル名を入力してください', chat.title || 'arkive_export');
    if (!filename) return;
    const blob = new Blob([JSON.stringify(chat, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = `${filename}.json`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
}

function exportChatTxt(chat) {
    const filename = prompt('保存するファイル名を入力してください', chat.title || 'arkive_export');
    if (!filename) return;
    let txt = `[LINE] トーク履歴: ${chat.title}\r\n保存日時：${new Date().toLocaleString('ja-JP')}\r\n\r\n`;
    const days = ['日','月','火','水','木','金','土'];
    chat.messages.forEach(m => {
        if (m.type === 'date') {
            try {
                const d = new Date(m._timestamp || 0);
                txt += `\r\n${m.text}(${days[d.getDay()] || ''})\r\n`;
            } catch(e) { txt += `\r\n${m.text}\r\n`; }
        } else if (m.type === 'msg') {
            txt += `${m.time}\t${m.sender}\t${(m.text || "").replace(/\n/g, '\r\n\t\t')}\r\n`;
        } else if (m.type === 'sys') {
            txt += `${m.time}\t${m.text}\r\n`;
        }
    });
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = `${filename}.txt`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
}

function aggregateWords(messages, minLen = 2) {
    const counts = {};
    const regex = /[a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+/g;
    messages.forEach(m => {
        if (m.type === 'msg' && m.text) {
            const matches = m.text.match(regex);
            if (matches) {
                matches.forEach(word => {
                    if (word.length >= minLen) {
                        counts[word] = (counts[word] || 0) + 1;
                    }
                });
            }
        }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 100);
}

let rankingMinLen = 2;
let pickerScrollTimer = null;
function initDigitPicker(initialVal = 2) {
    const wrap = document.getElementById('picker-min-len');
    if (!wrap) return;
    wrap.innerHTML = '';
    
    const topGap = document.createElement('div');
    topGap.style.minHeight = '30px';
    wrap.appendChild(topGap);
    
    for (let i = 1; i <= 99; i++) {
        const d = document.createElement('div');
        d.className = 'digit-picker-digit';
        d.textContent = i;
        d.dataset.val = i;
        wrap.appendChild(d);
    }
    
    const bottomGap = document.createElement('div');
    bottomGap.style.minHeight = '30px';
    wrap.appendChild(bottomGap);
    
    const updateUI = (val) => {
        rankingMinLen = val;
        const lbl = document.getElementById('ranking-min-len-label');
        if (lbl) lbl.textContent = val;
        wrap.querySelectorAll('.digit-picker-digit').forEach((el) => {
            el.classList.toggle('active', parseInt(el.dataset.val) === val);
        });
    };

    wrap.onscroll = () => {
        const itemHeight = 30;
        const val = Math.max(1, Math.min(99, Math.round(wrap.scrollTop / itemHeight)));
        updateUI(val);
        
        clearTimeout(pickerScrollTimer);
        pickerScrollTimer = setTimeout(() => {
            wrap.scrollTo({ top: val * itemHeight, behavior: 'smooth' });
        }, 150);
    };
    
    wrap.scrollTop = initialVal * 30;
    updateUI(initialVal);
}

async function showRankingView(messages, chatId = 'global') {
    pushViewState({ view: UI_VIEWS.RANKING });
    initDigitPicker(rankingMinLen || 2);
    const lbl = document.getElementById('ranking-min-len-label');
    if (lbl) lbl.textContent = rankingMinLen || 2;
    const listNode = document.getElementById('ranking-list');
    const refreshBtn = document.getElementById('ranking-refresh-btn');
    
    const render = (data) => {
        if (!listNode) return;
        listNode.innerHTML = data.map(([word, count], i) => `
            <div class="ranking-item" onclick="window.jumpToSearch('${word}')">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span class="ranking-rank">${i+1}</span>
                    <span class="ranking-word">${word}</span>
                </div>
                <span class="ranking-count">${count}回</span>
            </div>
        `).join('') || '<p style="text-align:center; padding:20px; color:var(--text-muted);">結果なし</p>';
    };

    const run = async () => {
        showToast("集計中...");
        const data = aggregateWords(messages, rankingMinLen);
        localStorage.setItem(`ranking_cache_${chatId}_${rankingMinLen}`, JSON.stringify(data));
        render(data);
    };

    if (refreshBtn) refreshBtn.onclick = run;
    
    const cached = localStorage.getItem(`ranking_cache_${chatId}_${rankingMinLen}`);
    if (cached) render(JSON.parse(cached));
    else run();
}

window.jumpToSearch = (word) => {
    if (currentChatId) {
        pushViewState({ view: UI_VIEWS.ROOM, chatId: currentChatId, modal: UI_MODALS.SEARCH, searchKw: word });
        const kwN = document.getElementById('keyword-search');
        if (kwN) kwN.value = word;
        if (typeof triggerSearch === 'function') triggerSearch();
    } else {
        pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.G_SEARCH, searchKw: word });
        const gInput = findViewById('global-search-input');
        if (gInput) {
            gInput.value = word;
            window.triggerGlobalSearch();
        }
    }
};

let aboutTapCount = 0;
let aboutTapTimer = null;
function initEasterEgg() {
    const icon = document.getElementById('about-arkive-icon');
    if (!icon) return;
    icon.onclick = () => {
        aboutTapCount++;
        clearTimeout(aboutTapTimer);
        if (aboutTapCount >= 10) {
            aboutTapCount = 0;
            const hpm = document.getElementById('hidden-page-modal');
            if (hpm) hpm.classList.remove('hidden');
        } else {
            aboutTapTimer = setTimeout(() => { aboutTapCount = 0; }, 1500);
        }
    };
}

function initV21() {
    initGlobalFeatures();
    initSettingsAutoSave();
    initBackupHandlers();
    initEasterEgg();

    const rbb = findViewById('ranking-back-btn');
    if (rbb) rbb.onclick = () => history.back();
    
    window.globalSearchMode = 'AND';
    document.querySelectorAll('#global-search-mode-toggle .mode-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#global-search-mode-toggle .mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.globalSearchMode = btn.dataset.mode;
            window.triggerGlobalSearch();
        };
    });
    window.individualSearchMode = 'AND';
    document.querySelectorAll('#search-mode-toggle .mode-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#search-mode-toggle .mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            window.individualSearchMode = btn.dataset.mode;
            if (typeof triggerSearch === 'function') triggerSearch();
        };
    });

    const verLabel = findViewById('settings-version-label');
    if (verLabel) verLabel.textContent = `Ark-ive System Version ${APP_VERSION}`;
    
    const mmBtn = findViewById('main-memo-btn');
    if (mmBtn) {
        mmBtn.onclick = () => {
            const lkd = document.getElementById('list-kebab-dropdown');
            if (lkd) lkd.classList.add('hidden');
            initMemo('main');
        };
    }
    
    const rabBtn = findViewById('list-archive-btn');
    if (rabBtn) {
        rabBtn.onclick = () => {
            const lkd = document.getElementById('list-kebab-dropdown');
            if (lkd) lkd.classList.add('hidden');
            pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.ARCHIVED });
        };
    }

    const grBtn = findViewById('global-ranking-btn');
    if (grBtn) {
        grBtn.onclick = async () => {
            const lkd = document.getElementById('list-kebab-dropdown');
            if (lkd) lkd.classList.add('hidden');
            const chats = await LineChatDB.getAllChats();
            let allMessages = [];
            chats.forEach(c => {
                if (c.messages) allMessages = allMessages.concat(c.messages);
            });
            showRankingView(allMessages, 'global');
        };
    }

    const rrBtn = findViewById('room-ranking-btn');
    if (rrBtn) {
        rrBtn.onclick = () => {
            if (currentChat && currentChat.messages) {
                showRankingView(currentChat.messages, currentChatId);
            }
        };
    }

    const bdbBtn = findViewById('backup-db-btn');
    if (bdbBtn) {
        bdbBtn.onclick = () => {
            pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.BACKUP_OPT });
        };
    }

    const rdbBtn = findViewById('restore-db-btn');
    const rIn = findViewById('restore-input');
    if (rdbBtn && rIn) {
        rdbBtn.onclick = () => rIn.click();
        rIn.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!confirm("既存のデータが上書きされます。よろしいですか？")) return;
            const reader = new FileReader();
            reader.onload = async (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    if (!data.chats) throw new Error("トークデータが見つかりません");

                    const hasSettings = !!data.settings;
                    await LineChatDB.clearAll(hasSettings);

                    for (const chat of data.chats) await LineChatDB.updateChat(chat);
                    if (hasSettings) {
                        for (const k in data.settings) await LineChatDB.setSetting(k, data.settings[k]);
                    }

                    if (data.localStorage) {
                        for (const k in data.localStorage) {
                            localStorage.setItem(k, data.localStorage[k]);
                        }
                        const theme = localStorage.getItem('app_theme');
                        if (theme) applyTheme(theme);
                        const lang = localStorage.getItem('app_lang');
                        if (lang) updateAppLanguage(lang);
                    }

                    alert("復元が完了しました。再起動します。");
                    location.reload();
                } catch (err) { alert("復元に失敗しました: " + err.message); }
            };
            reader.readAsText(file);
        };
    }

    const listHeaderLeft = document.getElementById('list-header-left');
    if (listHeaderLeft) {
        listHeaderLeft.addEventListener('click', () => {
        pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.ABOUT });
    });
}
}

// ==========================================
// 【重要】UIボタンの確実な動作保証（イベント委譲）
// ==========================================
document.addEventListener('click', function(e) {
    // 1. ケバブメニューの開閉 (#list-kebab-btn)
    const kebabBtn = e.target.closest('#list-kebab-btn');
    const kebabDropdown = document.getElementById('list-kebab-dropdown');
    if (kebabBtn && kebabDropdown) {
        e.stopPropagation();
        kebabDropdown.classList.toggle('hidden');
        return;
    }
    if (kebabDropdown && !kebabDropdown.classList.contains('hidden') && !e.target.closest('#list-kebab-dropdown')) {
        kebabDropdown.classList.add('hidden');
    }

    // 2. 全体ランキングボタン (#global-ranking-btn)
    const globalRankingBtn = e.target.closest('#global-ranking-btn');
    if (globalRankingBtn) {
        window.rankingSource = 'global'; // 遷移元を記憶
        if (kebabDropdown) kebabDropdown.classList.add('hidden');
        LineChatDB.getAllChats().then(chats => {
            let allMessages = [];
            chats.forEach(c => { if (c.messages) allMessages = allMessages.concat(c.messages); });
            showRankingView(allMessages, 'global');
        });
        return;
    }

    // 3. 個別ランキングボタン (#room-ranking-btn)
    const roomRankingBtn = e.target.closest('#room-ranking-btn');
    if (roomRankingBtn) {
        window.rankingSource = 'room'; // 遷移元を記憶
        if (kebabDropdown) kebabDropdown.classList.add('hidden');
        if (typeof currentChat !== 'undefined' && currentChat && currentChat.messages) {
            showRankingView(currentChat.messages, currentChatId);
        }
        return;
    }

    // 4. ランキング画面の「戻る（×）」ボタン (#close-ranking-btn)
    const closeRankingBtn = e.target.closest('#close-ranking-btn');
    if (closeRankingBtn) {
        // 標準的な履歴戻りを使用して、元の画面（Room or List）を復元
        history.back();
        return;
    }

    // 5. 個別トークの「検索」ボタン (#search-toggle-btn)
    const searchToggleBtn = e.target.closest('#search-toggle-btn');
    if (searchToggleBtn) {
        if (typeof pushViewState === 'function' && typeof UI_VIEWS !== 'undefined' && typeof UI_MODALS !== 'undefined') {
            pushViewState({ view: UI_VIEWS.ROOM, chatId: currentChatId, modal: UI_MODALS.SEARCH });
        }
        return;
    }

    // 6. ケバブメニュー「メモ」ボタン (#main-memo-btn)
    const kebabMemoBtn = e.target.closest('#main-memo-btn');
    if (kebabMemoBtn) {
        if (kebabDropdown) kebabDropdown.classList.add('hidden');
        if (typeof pushViewState === 'function' && typeof UI_VIEWS !== 'undefined' && typeof UI_MODALS !== 'undefined') {
            pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.MEMO_LIST });
        }
        return;
    }

    // 7. ランキング文字数ピッカー（1〜99文字）の開閉と初期化
    const togglePickerBtn = e.target.closest('#toggle-ranking-picker-btn');
    if (togglePickerBtn) {
        const pickerContainer = document.getElementById('ranking-picker-container');
        if (pickerContainer) {
            pickerContainer.classList.toggle('hidden');
            const pickerWrap = document.getElementById('picker-min-len');
            if (!pickerContainer.classList.contains('hidden') && pickerWrap && pickerWrap.children.length === 0) {
                let html = '<div style="height: 30px;"></div>';
                for (let i = 1; i <= 99; i++) {
                    html += `<div class="digit-picker-digit" data-val="${i}">${i}</div>`;
                }
                html += '<div style="height: 30px;"></div>';
                pickerWrap.innerHTML = html;

                pickerWrap.addEventListener('scroll', () => {
                    clearTimeout(window.pickerScrollTimeout);
                    window.pickerScrollTimeout = setTimeout(() => {
                        const centerPos = pickerWrap.scrollTop + (pickerWrap.clientHeight / 2);
                        let closestItem = null;
                        let minDiff = Infinity;
                        Array.from(pickerWrap.children).forEach(child => {
                            if (!child.classList.contains('digit-picker-digit')) return;
                            const childCenter = child.offsetTop + (child.clientHeight / 2);
                            const diff = Math.abs(centerPos - childCenter);
                            if (diff < minDiff) {
                                minDiff = diff;
                                closestItem = child;
                            }
                        });
                        if (closestItem) {
                            Array.from(pickerWrap.children).forEach(c => c.classList.remove('active'));
                            closestItem.classList.add('active');
                            closestItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
                            const val = closestItem.getAttribute('data-val');
                            const label = document.getElementById('ranking-min-len-label');
                            if (label) label.textContent = val;
                        }
                    }, 150);
                });

                setTimeout(() => {
                    const defaultTarget = pickerWrap.querySelector(`[data-val="2"]`);
                    if (defaultTarget) {
                        defaultTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        defaultTarget.classList.add('active');
                        const label = document.getElementById('ranking-min-len-label');
                        if (label) label.textContent = "2";
                    }
                }, 50);
            }
        }
        return;
    }
});

/**
 * v1.1.13 偽画面絶対保証システム
 */
/**
 * v1.1.14 偽画面初期化 (共通ロジック利用)
 */
function initFakeUI(isFake) {
    if (isFake) {
        // 1. 本物の画面を隠す
        const mainApp = document.getElementById('main-app');
        if (mainApp) mainApp.classList.add('hidden');

        // 2. 偽画面要素を表示する (HTMLはindex.htmlの静的なものを使用)
        const fakeApp = document.getElementById('fake-app');
        if (fakeApp) {
            fakeApp.classList.remove('hidden');
            fakeApp.style.display = 'flex';
        }

        // 3. 共通ロジックの起動
        initMemo('fake');
    } else {
        // 本物パスコードの場合の処理
        const mainApp = document.getElementById('main-app');
        const fakeApp = document.getElementById('fake-app');
        if (fakeApp) {
            fakeApp.classList.add('hidden');
            fakeApp.style.display = 'none';
        }
        if (mainApp) {
            mainApp.classList.remove('hidden');
            mainApp.style.display = 'flex';
        }
        if (typeof initApp === 'function') initApp();
    }
}