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
    const key = await ArkiveCrypto.deriveKey(passcode || "", salt);
    LineChatDB.setKey(key);
}

async function initApp() {
    // V20: Unified initialization after login or reload
    await LineChatDB.init(); // Ensure DB is initialized with current key
    currentChat = null;
    currentChatId = null;
    roomView.classList.remove('active');
    listView.classList.add('active');
    await loadChatList();
}

document.addEventListener('DOMContentLoaded', async () => {
    const savedHash = localStorage.getItem('app_password_hash');
    const fakeHash = localStorage.getItem('app_fake_password_hash');

    // V15 Auth Logic
    if (!savedHash && !fakeHash) {
        // [6.1] No passcodes set -> Skip
        if (!window.crypto || !window.crypto.subtle) {
            alert('環境エラー: HTTPSまたはlocalhostが必要です');
            return;
        }
        lockScreen.style.display = 'none';
        mainApp.style.display = 'flex';
        await initCrypto("");
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
};
closeSettingsBtn.onclick = () => settingsModal.classList.add('hidden');

if (manualBtn) manualBtn.onclick = () => manualModal.classList.remove('hidden');
if (closeManualBtn) closeManualBtn.onclick = () => manualModal.classList.add('hidden');

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
        // 全ての複雑なスワイプ・カスタム長押し判定を一旦廃止し、最も安全で確実な onclick による発火を保証する
        div.onclick = (e) => {
            if (openSwipeElement === div) {
                div.style.transform = `translateX(0px)`;
                openSwipeElement = null;
                return;
            }
            // 通常のクリックで確実に開く
            window.isOpenedFromArchive = false;
            openChat(chat.id);
        };

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

async function openChat(id) {
    const chat = await LineChatDB.getChatById(id);
    if (!chat) return;
    
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
        // Find all unique senders
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
    
    listView.classList.remove('active');
    roomView.classList.add('active');
    
    vScroll.setItems(chat.messages);
    vScroll.updateVisibleItems(true); 
}

backBtn.addEventListener('click', () => {
    roomView.classList.remove('active');
    listView.classList.add('active');
    currentChat = null;
    vScroll.setItems([]);
    
    if (window.isOpenedFromArchive) {
        document.getElementById('settings-modal').classList.remove('hidden');
        document.getElementById('archived-modal').classList.remove('hidden');
    }
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
document.getElementById('close-about-modal')?.addEventListener('click', () => aboutModal.classList.add('hidden'));

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
document.getElementById('favorites-list-btn')?.addEventListener('click', () => openFavs());
document.getElementById('room-favorites-btn')?.addEventListener('click', () => openFavs(currentChatId));
document.getElementById('close-favorites-modal')?.addEventListener('click', () => favModal.classList.add('hidden'));

// Archived Modal
const archivedList = document.getElementById('archived-list');
document.getElementById('archive-view-btn')?.addEventListener('click', async () => {
    const chats = await LineChatDB.getAllChats();
    const archived = chats.filter(c => c.isArchived);
    archivedList.innerHTML = '';
    if (archived.length === 0) {
        archivedList.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted);">アーカイブはありません</div>';
    } else {
        archived.forEach(c => {
            const div = document.createElement('div');
            div.className = 'chat-item'; // Re-use list style
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
            div.onclick = () => { 
                archivedModal.classList.add('hidden'); 
                document.getElementById('settings-modal').classList.add('hidden'); // V20 Fix
                window.isOpenedFromArchive = true;
                openChat(c.id); 
            };
            
            // Console Menu support for archived
            div.oncontextmenu = (e) => {
                e.preventDefault();
                contextTargetId = c.id;
                let cx = e.clientX, cy = e.clientY;
                if (e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
                contextMenu.style.left = `${Math.min(cx, window.innerWidth - 160)}px`;
                contextMenu.style.top = `${Math.min(cy, window.innerHeight - 100)}px`;
                contextMenu.classList.add('active');
                
                // Switch context menu mode (restore instead of archive)
                ctxArchive.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg> 一覧に戻す';
                ctxArchive.onclick = async () => {
                    contextMenu.classList.remove('active');
                    const target = await LineChatDB.getChatById(contextTargetId);
                    if (target) {
                        target.isArchived = false;
                        await LineChatDB.updateChat(target);
                        showToast("トークを一覧に戻しました");
                        loadChatList();
                        document.getElementById('archive-view-btn').click(); // Refresh archive list
                    }
                };
            };
            archivedList.appendChild(div);
        });
    }
    archivedModal.classList.remove('hidden');
});
document.getElementById('close-archived-modal')?.addEventListener('click', () => {
    archivedModal.classList.add('hidden');
    // Reset context menu for next time
    ctxArchive.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path></svg> アーカイブ';
    ctxArchive.onclick = archiveHandler;
});

// Context Menu Archive logic refactored
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
const ctxArchive = document.createElement('div');
ctxArchive.className = 'context-item';
ctxArchive.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path></svg> アーカイブ';
ctxDelete.before(ctxArchive);
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
// Fake Mode (Shopping List)
/**
 * V17: Advanced Memo System (Main)
 */
async function initMemo(mode) {
    if (mode === 'fake') {
        initFakeMode();
        return;
    }

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
        // Migration: If array of strings, convert to objects
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
    closeBtn.onclick = () => modal.classList.add('hidden');

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
    const fakeApp = document.getElementById('fake-app');
    const todoInput = document.getElementById('fake-todo-input');
    const todoAddBtn = document.getElementById('fake-todo-add-btn');
    const todoList = document.getElementById('fake-todo-list');
    
    fakeApp.style.display = 'flex';
    document.body.style.backgroundColor = '#fff';
    
    const storageKey = 'arkive_fake_memo_data';
    
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
            
            li.querySelector('span').onclick = () => {
                const newT = prompt('編集:', item.text);
                if (newT && newT.trim() !== '') {
                    todos[idx].text = newT.trim();
                    LineChatDB.setSetting(storageKey, todos).then(loadTodos);
                }
            };
            
            li.querySelector('.fake-todo-del').onclick = async () => {
                if(confirm('削除しますか？')) {
                    todos.splice(idx, 1);
                    await LineChatDB.setSetting(storageKey, todos);
                    loadTodos();
                }
            };
            todoList.appendChild(li);
        });
        
        if (todos.length === 0) {
            todoList.innerHTML = '<div style="padding:60px 20px; text-align:center; color:#ccc; font-size:15px;">リストは空です。<br>買いたいものを追加しましょう。</div>';
        }
    };

    todoAddBtn.onclick = async () => {
        const val = todoInput.value.trim();
        if (!val) return;
        const todos = await LineChatDB.getSetting(storageKey, []);
        todos.unshift({ text: val, done: false, time: Date.now() });
        await LineChatDB.setSetting(storageKey, todos);
        todoInput.value = '';
        loadTodos();
    };

    todoInput.onkeypress = (e) => { if(e.key === 'Enter') todoAddBtn.click(); };
    loadTodos();
}

document.getElementById('main-memo-btn')?.addEventListener('click', () => initMemo('main'));

// V13-15: Backup & Restore UI logic
document.getElementById('backup-btn')?.addEventListener('click', async () => {
    try {
        showLoading();
        await new Promise(resolve => setTimeout(resolve, 100));
        const fileNameBase = document.getElementById('backup-filename')?.value.trim() || `arkive_backup_${new Date().toISOString().split('T')[0].replace(/-/g, '')}`;
        const encryptToggle = document.getElementById('backup-encrypt-toggle')?.checked || false;
        
        // Export. Settings includes main memo if encrypted via db.js logic.
        // We explicitly pass excludeImages=true.
        const data = await LineChatDB.exportFullBackup(true); 
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileNameBase}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("バックアップを作成しました");
    } catch (e) {
        console.error(e);
        alert("バックアップの作成に失敗しました");
    } finally {
        hideLoading();
    }
});

const restoreInput = document.getElementById('restore-input');
document.getElementById('restore-btn')?.addEventListener('click', () => {
    restoreInput.click();
});
restoreInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm("データを復元しますか？\n現在保存されているすべてのデータが上書きされます。")) {
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            showLoading();
            await new Promise(resolve => setTimeout(resolve, 100));
            const data = JSON.parse(event.target.result);
            
            // [5.3] Import verification
            // If the data is encrypted via __ENC__, we check if we can decrypt a sample item OR just let db.js try.
            // For now, assume if db.js import succeeds, it's fine.
            
            await LineChatDB.importFullBackup(data);
            alert("復元が完了しました。ページを再読み込みします。");
            location.reload();
        } catch (err) {
            console.error(err);
            alert("復元に失敗しました。ファイル形式またはパスコードが正しくない可能性があります。");
        } finally {
            hideLoading();
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});



