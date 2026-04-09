let currentChat = null;
let currentChatId = null;
let vScroll = null;
let flipSender = false;

let searchHighlightIndices = new Set();
let activeSearchIndexValue = -1;

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

document.addEventListener('DOMContentLoaded', async () => {
    const savedHash = localStorage.getItem('app_password_hash');
    if (savedHash) {
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
            if (updateLockDisplay()) return;
            if (passcodeInput.value.length === 0) return;
            passcodeError.textContent = '';
            
            try {
                const currentHash = await hashStr(passcodeInput.value);
                if (currentHash === savedHash) {
                    lockScreen.style.display = 'none';
                    mainApp.style.display = 'flex';
                    passcodeFailCount = 0;
                    initApp();
                } else {
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
            } catch(e) {
                console.error('Unlock error:', e);
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
                
                if (btn.type === 'submit') return; // Handled by form submission
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
    } else {
        mainApp.style.display = 'flex';
        initApp();
    }
});

// -- Settings Modal --
settingsBtn.onclick = () => {
    const confirmPassInput = document.getElementById('confirm-password');
    passToggle.checked = !!localStorage.getItem('app_password_hash');
    passSetupContainer.style.display = passToggle.checked ? 'block' : 'none';
    newPassInput.value = '';
    confirmPassInput.value = '';
    settingsModal.classList.remove('hidden');
};
closeSettingsBtn.onclick = () => settingsModal.classList.add('hidden');

if (manualBtn) manualBtn.onclick = () => manualModal.classList.remove('hidden');
if (closeManualBtn) closeManualBtn.onclick = () => manualModal.classList.add('hidden');

passToggle.onchange = () => {
    if (passToggle.checked) {
        passSetupContainer.style.display = 'block';
    } else {
        passSetupContainer.style.display = 'none';
        localStorage.removeItem('app_password_hash');
        showToast('パスワードロックを無効にしました');
    }
};

const passSetupContainerForm = document.getElementById('password-setup-container');
passSetupContainerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const val = newPassInput.value;
    const confirmVal = document.getElementById('confirm-password').value;
    
    if (val.length === 0) {
        alert('パスワードを入力してください。');
        return;
    }
    if (val !== confirmVal) {
        alert('確認用パスワードが一致しません。');
        return;
    }
    
    savePassBtn.disabled = true;
    try {
        const hash = await hashStr(val);
        localStorage.setItem('app_password_hash', hash);
        
        // パスワードのチェックが入ったままにする
        passToggle.checked = true;
        
        showToast('パスワードを保存しました');
        settingsModal.classList.add('hidden');
        
        // 強制的にトーク一覧画面へ切り替え
        roomView.classList.remove('active');
        listView.classList.add('active');
        currentChat = null;
        vScroll.setItems([]);
        
    } catch (err) {
        console.error('Save passcode error:', err);
        alert('パスワードの保存中にエラーが発生しました。');
    } finally {
        savePassBtn.disabled = false;
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

        let senderInitial = item.sender ? item.sender.charAt(0).toUpperCase() : '?';
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
                nameHtml = ''; // 相手の名前を非表示にする
            }
        }

        const timeHtml = isNextSameTime ? `<div style="width: 30px;"></div>` : `<div class="time" style="margin:0 4px;">${item.time}</div>`;
        const alignFlex = isSelfMsg ? 'flex-end' : 'flex-start';
        const rowDir = isSelfMsg ? 'row-reverse' : 'row';
        const marginTop = isConsecutive ? '2px' : '12px';

        el.innerHTML = `
            <div class="message-wrapper ${isSelfMsg ? 'sent' : 'received'} ${activeClass}" style="margin-top: ${marginTop}; width:100%; max-width:100%;">
                ${iconHtml}
                <div style="display: flex; flex-direction: column; align-items: ${alignFlex}; max-width: calc(100% - 40px);">
                    ${nameHtml}
                    <div style="display: flex; align-items: flex-end; flex-direction: ${rowDir};">
                        <div class="bubble">${formattedText}</div>
                        ${timeHtml}
                    </div>
                </div>
        `;
    }
    return el;
});

async function initApp() {
    await LineChatDB.init();
    await loadChatList();
}

let openSwipeElement = null;

async function loadChatList() {
    const chats = await LineChatDB.getAllChats();
    chatListContainer.innerHTML = '';
    
    if (chats.length === 0) {
        chatListContainer.innerHTML = `<div style="padding:40px 20px; text-align:center; color:var(--text-muted); font-size:14px; line-height:1.6;">トーク履歴がありません。<br>右上の「＋」ボタンから新しいファイルを読み込んでください。</div>`;
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
        const iconTextNode = chat.icon ? '' : chat.title.charAt(0);
        
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
                    <span class="chat-badge">${chat.messages.length.toLocaleString()}件</span>
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
            listDiv.innerHTML = '<p style="font-size:14px; text-align:center;">新しい発言者は見つかりませんでした。</p>';
        } else {
            newSenders.forEach(ns => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.justifyContent = 'space-between';
                row.style.background = 'var(--surface-color)';
                row.style.padding = '10px';
                row.style.borderRadius = '5px';
                row.style.border = '1px solid var(--border-color)';
                
                row.innerHTML = `
                    <span style="font-weight:bold; font-size:14px; width:45%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${ns}</span>
                    <span style="font-size:14px; color:var(--text-muted);">→</span>
                    <input type="text" list="${dsId}" placeholder="既存の名前を選択or入力" value="${ns}" style="width:45%; padding:5px; border-radius:5px; border:1px solid var(--border-color); font-size:14px; background:var(--bg-color); color:var(--text-main);" data-new-sender="${ns.replace(/"/g, '&quot;')}">
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
            inputNodes.forEach(inp => {
                const val = inp.value.trim();
                const orig = inp.getAttribute('data-new-sender');
                if (val !== "" && val !== orig) mapping[orig] = val;
            });
            cleanup();
            resolve({ title: titleInput.value.trim() || defaultTitle, mapping });
        };
        
        closeBtn.addEventListener('click', closeHandler);
        applyBtn.addEventListener('click', applyHandler);
        modal.classList.remove('hidden');
    });
}

async function processFiles(files, targetChat = null) {
    if (!files || !files.length) return;
    let mergeCountTotal = 0;
    
    for (const file of files) {
        let text;
        try {
            text = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target.result);
                reader.onerror = () => reject('File read error');
                reader.readAsText(file);
            });
        } catch(err) {
            console.error(err);
            continue;
        }
        
        const sizeKB = Math.round(file.size / 1024);
        const parsed = detectAndParse(text, file.name, sizeKB);
        if (!parsed || !parsed.messages || parsed.messages.length === 0) {
            showToast(`${file.name}の解析に失敗したか、中身が空です`);
            continue;
        }
        parsed.originalFilename = file.name;
        
        let existingChat = targetChat;
        if (!existingChat) {
            const tempMatch = await LineChatDB.getChatByTitle(parsed.title);
            if (tempMatch) {
                const doMerge = confirm(`既に「${parsed.title}」という名前のトークが存在します。\n\n・「OK」ボタン：既存のトークに統合（マージ）します。\n・「キャンセル」ボタン：新規トークとして独立して追加します。`);
                if (doMerge) existingChat = tempMatch;
            }
        }
        
        const nsSet = new Set();
        parsed.messages.forEach(m => { if(m.type==='msg' && m.sender) nsSet.add(m.sender); });
        
        const esSet = new Set();
        if (existingChat) {
            existingChat.messages.forEach(m => { if(m.type==='msg' && m.sender) esSet.add(m.sender); });
        }
        
        const mappedData = await promptMergeMapping(Array.from(nsSet), Array.from(esSet), parsed.title);
        if (mappedData === null) {
            showToast('追加インポートをキャンセルしました');
            continue;
        }
        
        parsed.title = mappedData.title;
        const mapping = mappedData.mapping;
        
        parsed.messages.forEach(m => {
            if(m.type==='msg' && m.sender && mapping[m.sender]) {
                m.sender = mapping[m.sender];
            }
        });
        
        // 再度タイトルで合流先を探す（強制されたtargetChatがない場合）
        if (!targetChat) {
            existingChat = await LineChatDB.getChatByTitle(parsed.title);
        }
        
        if (existingChat) {
            // merge data
            
            const existingSet = new Set();
            existingChat.messages.forEach(m => {
                if (m.type === 'msg' || m.type === 'sys') {
                    existingSet.add(`${m.date}_${m.time}_${m.sender||''}_${m.text}`);
                }
            });
            
            let newMsgsAdded = 0;
            parsed.messages.forEach(m => {
                if (m.type === 'date') return;
                const key = `${m.date}_${m.time}_${m.sender||''}_${m.text}`;
                if (!existingSet.has(key)) {
                    existingChat.messages.push(m);
                    newMsgsAdded++;
                }
            });
            
            // マージ時、既存トークに設定がない場合はメタデータを引き継ぐ
            if (parsed.myName && !existingChat.myName) existingChat.myName = parsed.myName;
            if (parsed.icon && !existingChat.icon) existingChat.icon = parsed.icon;
            if (parsed.userIcons) {
                if (!existingChat.userIcons) existingChat.userIcons = {};
                for (const [k, v] of Object.entries(parsed.userIcons)) {
                    if (!existingChat.userIcons[k]) existingChat.userIcons[k] = v;
                }
            }
            
            if (newMsgsAdded > 0) {
                existingChat.messages.sort((a, b) => (a._timestamp || 0) - (b._timestamp || 0));
                
                const rebuiltMsgs = [];
                let lastDate = "";
                existingChat.messages.forEach(m => {
                    if (m.type === 'date') return;
                    if (m.date && m.date !== lastDate) {
                        rebuiltMsgs.push({ type: 'date', text: m.date, date: m.date, _timestamp: new Date(`${m.date.replace(/\//g, '-')}T00:00:00`).getTime() });
                        lastDate = m.date;
                    }
                    rebuiltMsgs.push(m);
                });
                existingChat.messages = rebuiltMsgs;
                
                const mx = rebuiltMsgs.filter(m => m.type === 'msg' || m.type === 'sys');
                if (mx.length > 0) {
                    const l = mx[mx.length - 1];
                    existingChat.lastMessageText = l.sender ? `${l.sender}: ${l.text}`.replace(/\n/g,' ') : (l.text||'').replace(/\n/g,' ');
                }
                const dx = rebuiltMsgs.filter(m => m.type === 'msg' && m.date).map(m => m.date);
                if (dx.length > 0) {
                    existingChat.firstDate = dx[0];
                    existingChat.lastDate = dx[dx.length - 1];
                    existingChat.date = existingChat.lastDate;
                }
                existingChat.sizeKB = Math.round((existingChat.sizeKB || 0) + sizeKB);
                
                await LineChatDB.updateChat(existingChat);
                mergeCountTotal += newMsgsAdded;
                showToast(`${existingChat.title}に${newMsgsAdded}件追加しました`);
            } else {
                showToast(`新しいメッセージがありませんでした`);
            }
        } else {
            await LineChatDB.saveChat(parsed);
            showToast(`${parsed.title}を作成しました`);
        }
    }
    await loadChatList();
}

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
const roomSettingsModal = document.getElementById('room-settings-modal');
const closeRoomSettingsModal = document.getElementById('close-room-settings-modal');
const roomSettingsTitle = document.getElementById('room-settings-title');
const roomSettingsMembers = document.getElementById('room-settings-members');
const roomSettingsExportBtn = document.getElementById('room-settings-export-btn');
const roomSettingsApplyBtn = document.getElementById('room-settings-apply-btn');

const flipSelectionModal = document.getElementById('flip-selection-modal');
const closeFlipSelectionModal = document.getElementById('close-flip-selection-modal');
const flipMembersList = document.getElementById('flip-members-list');

let tempNameMap = {};
let tempIconMap = {};
let tempMainIconTarget = null;
let targetSenderForIcon = null;

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
            const initial = s.charAt(0).toUpperCase();
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
    
    if (chat.icon) {
        iconDisplay.style.backgroundImage = `url(${chat.icon})`;
        iconText.style.display = 'none';
    } else {
        iconDisplay.style.backgroundImage = 'none';
        iconText.style.display = 'block';
        iconText.textContent = chat.title.charAt(0);
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
});

if (flipBtn) {
    flipBtn.addEventListener('click', async () => {
        if (!currentChat) return;
        const sendersSet = new Set();
        currentChat.messages.forEach(m => {
            if (m.type === 'msg' && m.sender) sendersSet.add(m.sender);
        });
        const senders = Array.from(sendersSet);
        if (senders.length === 0) return;
        
        let currentIndex = senders.indexOf(currentChat.myName);
        let nextIndex = (currentIndex + 1) % senders.length;
        
        currentChat.myName = senders[nextIndex];
        await LineChatDB.updateChat(currentChat);
        
        vScroll.updateVisibleItems(true); // 強制再描画
        showToast(`自分側を ${currentChat.myName} に切り替えました`);
    });
}
if (closeFlipSelectionModal) {
    closeFlipSelectionModal.addEventListener('click', () => {
        flipSelectionModal.classList.add('hidden');
    });
}

