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
const editTitleBtn = document.getElementById('edit-title-btn');
const setMeBtn = document.getElementById('set-me-btn'); 
const flipBtn = document.getElementById('flip-btn');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-modal');
const passToggle = document.getElementById('password-toggle');
const passSetupContainer = document.getElementById('password-setup-container');
const newPassInput = document.getElementById('new-password');
const savePassBtn = document.getElementById('save-password-btn');

const listContainer = document.getElementById('message-list');
const scrollContainer = document.getElementById('message-container');
const spacerContainer = document.getElementById('virtual-spacer');

vScroll = new VirtualScroll(scrollContainer, listContainer, spacerContainer);

let tooltipTimer = null;
const scrollDateLabel = document.getElementById('scroll-date-label');
const longpressTooltip = document.getElementById('longpress-tooltip');

// -- V9/V10 Auth Crypto & Boot --
async function hashStr(str) {
    const raw = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', raw);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
    const savedHash = localStorage.getItem('app_password_hash');
    if (savedHash) {
        lockScreen.style.display = 'flex';
        
        const tryUnlock = async () => {
            if (passcodeInput.value.length === 0) return;
            passcodeError.textContent = '';
            try {
                const currentHash = await hashStr(passcodeInput.value);
                if (currentHash === savedHash) {
                    lockScreen.style.display = 'none';
                    mainApp.style.display = 'flex';
                    initApp();
                } else {
                    passcodeError.textContent = 'パスワードが違います';
                    passcodeInput.value = '';
                    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                }
            } catch(e) {
                console.error('Unlock error:', e);
            }
        };

        // Keypad mappings
        document.querySelectorAll('.key-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const val = btn.textContent;
                
                if (val === 'Del') {
                    passcodeInput.value = passcodeInput.value.slice(0, -1);
                } else if (val === 'OK') {
                    await tryUnlock();
                } else {
                    if (passcodeInput.value.length < 12) {
                        passcodeInput.value += val;
                    }
                }
            });
        });

        // native enter
        passcodeInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                await tryUnlock();
            }
        });
    } else {
        mainApp.style.display = 'flex';
        initApp();
    }
});

// -- V10 Settings Modal & Save Logic --
settingsBtn.onclick = () => {
    passToggle.checked = !!localStorage.getItem('app_password_hash');
    passSetupContainer.style.display = passToggle.checked ? 'block' : 'none';
    newPassInput.value = '';
    settingsModal.classList.remove('hidden');
};
closeSettingsBtn.onclick = () => settingsModal.classList.add('hidden');

passToggle.onchange = () => {
    if (passToggle.checked) {
        passSetupContainer.style.display = 'block';
    } else {
        passSetupContainer.style.display = 'none';
        localStorage.removeItem('app_password_hash');
        alert('パスワードロックを無効にしました。');
    }
};

savePassBtn.addEventListener('click', async (e) => {
    e.preventDefault(); // Stop unseen reloads
    const val = newPassInput.value;
    
    // Strict Validation
    if (!/^[a-zA-Z0-9]{1,12}$/.test(val)) {
        alert('パスワードは1〜12桁の英数字（記号不可）で入力してください。');
        return;
    }
    
    // Robust saving
    savePassBtn.disabled = true;
    try {
        const hash = await hashStr(val);
        localStorage.setItem('app_password_hash', hash);
        alert('設定を保存しました');
        settingsModal.classList.add('hidden');
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
        el.innerHTML = `<div class="date-label" style="background:rgba(0,0,0,0.1); color:#333;">${item.text}</div>`;
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

        const activeClass = isActiveHighlight ? 'active-highlight' : '';

        el.innerHTML = `
            <div class="message-wrapper ${isSelfMsg ? 'sent' : 'received'} ${activeClass}">
                <div class="user-icon" title="${item.sender}"></div>
                <div style="display: flex; align-items: flex-end;">
                    <div class="bubble">${formattedText}</div>
                    <div class="time">${item.time}</div>
                </div>
            </div>
        `;
        
        const bubbleEl = el.querySelector('.bubble');
        if (bubbleEl && item.date) {
            const clearTimer = () => { clearTimeout(tooltipTimer); hideTooltip(); };
            
            const startPress = (e) => {
                if (e.target.tagName && e.target.tagName.toLowerCase() === 'a') return;
                
                clearTimeout(tooltipTimer);
                let x, y;
                if (e.touches && e.touches.length > 0) {
                    x = e.touches[0].clientX; 
                    y = e.touches[0].clientY;
                } else {
                    const rect = bubbleEl.getBoundingClientRect();
                    x = rect.left + rect.width / 2; 
                    y = rect.top;
                }
                
                tooltipTimer = setTimeout(() => {
                    showTooltip(`${item.date} ${item.time}`, x, y);
                }, 500); 
            };
            
            bubbleEl.addEventListener('touchstart', startPress, {passive: true});
            bubbleEl.addEventListener('touchend', clearTimer);
            bubbleEl.addEventListener('touchmove', clearTimer);
            bubbleEl.addEventListener('touchcancel', clearTimer);
            
            bubbleEl.addEventListener('mousedown', startPress);
            bubbleEl.addEventListener('mouseup', clearTimer);
            bubbleEl.addEventListener('mouseleave', clearTimer);
        }
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
        chatListContainer.innerHTML = `<div style="padding:40px 20px; text-align:center; color:#888; font-size:14px; line-height:1.6;">トーク履歴がありません。<br>右上の「＋」ボタンから新しいファイルを読み込んでください。</div>`;
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
                await loadChatList();
            } else {
                div.style.transform = `translateX(0px)`;
                openSwipeElement = null;
            }
        };
        wrapper.appendChild(deleteBtn);

        const div = document.createElement('div');
        div.className = 'chat-item';
        
        let startX = 0, startY = 0, currentX = 0;
        let isDragging = false, isHorizontal = false;
        let pressTimer = null, isHolding = false;
        
        const clearLongPress = () => {
            clearTimeout(pressTimer);
            if (isHolding) {
                div.classList.remove('holding');
                isHolding = false;
            }
        };

        div.addEventListener('touchstart', (e) => {
            if (openSwipeElement && openSwipeElement !== div) {
                openSwipeElement.style.transform = `translateX(0px)`;
                openSwipeElement = null;
            }
            if (!openSwipeElement || openSwipeElement !== div) {
                div.style.transition = 'none';
            }
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isDragging = true;
            isHorizontal = false;
            
            if (!openSwipeElement || openSwipeElement !== div) {
                pressTimer = setTimeout(async () => {
                    if (isDragging && !isHorizontal) {
                        isHolding = true;
                        div.classList.add('holding');
                        if (navigator.vibrate) navigator.vibrate(50);
                        
                        const confirmDelete = confirm('このトーク履歴を完全に削除しますか？\n（元に戻せません）');
                        div.classList.remove('holding');
                        isHolding = false;
                        if (confirmDelete) {
                            await LineChatDB.deleteChat(chat.id);
                            await loadChatList();
                        }
                    }
                }, 600);
            }
        }, {passive: true});
        
        div.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            
            if (!isHorizontal) {
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
                    isHorizontal = true;
                    clearLongPress();
                } else if (Math.abs(dy) > 10) {
                    isDragging = false; 
                    clearLongPress();
                    return;
                }
            }
            
            if (isHorizontal) {
                e.cancelable && e.preventDefault(); 
                currentX = dx;
                if (openSwipeElement === div) currentX -= 80;
                if (currentX > 0) currentX = 0; 
                if (currentX < -80) currentX = -80 - (Math.abs(currentX)-80)*0.2; 
                div.style.transform = `translateX(${currentX}px)`;
            }
        }, {passive: false});
        
        div.addEventListener('touchend', () => {
            clearLongPress();
            if (!isDragging) return;
            isDragging = false;
            div.style.transition = 'transform 0.2s ease-out';
            if (currentX < -40) {
                div.style.transform = `translateX(-80px)`;
                openSwipeElement = div;
            } else {
                div.style.transform = `translateX(0px)`;
                if (openSwipeElement === div) openSwipeElement = null;
            }
            currentX = 0;
        });
        
        div.addEventListener('touchcancel', clearLongPress);
        div.addEventListener('contextmenu', (e) => e.preventDefault());
        
        div.addEventListener('mousedown', (e) => {
            startX = e.clientX; startY = e.clientY;
            pressTimer = setTimeout(async () => {
                isHolding = true;
                div.classList.add('holding');
                const confirmDelete = confirm('このトーク履歴を完全に削除しますか？\n（元に戻せません）');
                div.classList.remove('holding');
                isHolding = false;
                if (confirmDelete) {
                    await LineChatDB.deleteChat(chat.id);
                    await loadChatList();
                }
            }, 600);
        });
        div.addEventListener('mousemove', (e) => {
            if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) clearLongPress();
        });
        div.addEventListener('mouseup', clearLongPress);
        div.addEventListener('mouseleave', clearLongPress);

        div.onclick = (e) => {
            if (isHolding) return; 
            if (div.style.transform && div.style.transform !== "translateX(0px)") {
                div.style.transform = `translateX(0px)`;
                openSwipeElement = null;
                return; 
            }
            openChat(chat.id);
        };
        
        const sizeStr = chat.sizeKB ? `${chat.sizeKB.toLocaleString()} KB` : 'ファイル容量不明';
        const dateRangeStr = (chat.firstDate && chat.lastDate && chat.firstDate !== chat.lastDate) 
            ? `${chat.firstDate} 〜 ${chat.lastDate}` 
            : (chat.firstDate || chat.date || '日付不明');
        
        div.innerHTML = `
            <div class="chat-info">
                <h3>${chat.title}</h3>
                <p>${chat.lastMessageText || 'メッセージがありません'}</p>
                <div class="chat-date" style="margin-top:5px;">${dateRangeStr}</div>
            </div>
            <div class="chat-meta" style="flex-shrink:0;">
                <div style="font-size:10px; background:#e0e0e0; color:#555; border-radius:10px; padding:3px 8px; text-align:center; margin-bottom:4px;">
                    ${sizeStr}
                </div>
                <div style="font-size:10px; background:#e0e0e0; color:#555; border-radius:10px; padding:3px 8px; text-align:center;">
                    ${chat.messages.length.toLocaleString()}件
                </div>
            </div>
        `;
        
        wrapper.appendChild(div);
        chatListContainer.appendChild(wrapper);
    });
}

fileInput.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    
    for (const file of files) {
        const text = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = (event) => resolve(event.target.result);
            reader.readAsText(file);
        });
        
        const sizeKB = Math.round(file.size / 1024);
        const parsed = parseLineChat(text, sizeKB);
        await LineChatDB.saveChat(parsed);
    }
    
    alert('トークの読み込みが完了しました！');
    await loadChatList();
    fileInput.value = '';
});

editTitleBtn.addEventListener('click', async () => {
    if (!currentChat) return;
    const newTitle = prompt('トークルームの新しい名前を入力してください：', currentChat.title);
    if (newTitle && newTitle.trim() !== '') {
        currentChat.title = newTitle.trim();
        roomTitle.textContent = currentChat.title;
        await LineChatDB.updateChat(currentChat);
        loadChatList(); 
    }
});

setMeBtn.addEventListener('click', async () => {
    if (!currentChat) return;
    
    const sendersSet = new Set();
    currentChat.messages.forEach(m => {
        if (m.type === 'msg' && m.sender) sendersSet.add(m.sender);
    });
    const senders = Array.from(sendersSet);
    
    if (senders.length === 0) {
        alert('参加者が見つかりません');
        return;
    }
    
    let msg = '「自分（右側）」として表示するユーザーの番号を指定してください：\n\n';
    senders.forEach((s, i) => msg += `[${i + 1}] ${s}\n`);
    
    const choice = prompt(msg, "1");
    if (choice) {
        const idx = parseInt(choice, 10) - 1;
        if (idx >= 0 && idx < senders.length) {
            currentChat.myName = senders[idx];
            await LineChatDB.updateChat(currentChat);
            vScroll.updateVisibleItems(true); 
            alert(`「${currentChat.myName}」を自分（右側）に設定しました。`);
        }
    }
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

flipBtn.addEventListener('click', () => {
    flipSender = !flipSender;
    vScroll.updateVisibleItems(true); 
});
