window.searchKeyword = '';
const kwSearchNode = document.getElementById('keyword-search');
const searchModal = document.getElementById('search-modal');
const closeSearchModalBtn = document.getElementById('close-search-modal');
const searchResultList = document.getElementById('search-result-list');
const searchTotalHits = document.getElementById('search-total-hits');

const searchNav = document.getElementById('search-nav');
const searchCount = document.getElementById('search-count');
const searchPrev = document.getElementById('search-prev');
const searchNext = document.getElementById('search-next');
const searchClose = document.getElementById('search-close');

const searchToggleBtn = document.getElementById('search-toggle-btn');
const searchInputWrapper = document.getElementById('search-input-wrapper');
const searchQuickCount = document.getElementById('search-quick-count');

const dateBtn = document.getElementById('date-btn');
const dateModal = document.getElementById('date-modal');
const closeDateModalBtn = document.getElementById('close-date-modal');

const calMonthLabel = document.getElementById('cal-month-label');
const calPrevBtn = document.getElementById('cal-prev-btn');
const calNextBtn = document.getElementById('cal-next-btn');
const calGrid = document.getElementById('calendar-grid');

let searchMatches = [];
let currentMatchPos = -1;
let debounceTimer = null;

let currentCalYear = new Date().getFullYear();
let currentCalMonth = new Date().getMonth();
let validDatesMap = {}; 

document.addEventListener('chatOpened', () => {
    kwSearchNode.value = '';
    window.searchKeyword = '';
    searchModal.classList.add('hidden');
    searchNav.classList.add('hidden');
    dateModal.classList.add('hidden');
    if (searchToggleBtn) searchToggleBtn.style.color = '';
    if (searchQuickCount) searchQuickCount.textContent = '';
});

closeSearchModalBtn.addEventListener('click', () => searchModal.classList.add('hidden'));
closeDateModalBtn.addEventListener('click', () => dateModal.classList.add('hidden'));

// CALENDAR LOGIC (V4/V5)
dateBtn.addEventListener('click', () => {
    if (!currentChat) return;
    
    validDatesMap = {};
    let lastDate = null;
    
    currentChat.messages.forEach((msg, idx) => {
        if (msg.date) {
            const match = msg.date.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
            if (match) {
                const y = parseInt(match[1]);
                const m = parseInt(match[2]);
                const d = parseInt(match[3]);
                const key = `${y}-${m}-${d}`;
                if (validDatesMap[key] === undefined) {
                    validDatesMap[key] = { index: idx, count: 0 };
                    lastDate = { y, m: m - 1, d };
                }
                if (msg.type === 'msg') {
                    validDatesMap[key].count++;
                }
            }
        }
    });

    if (lastDate) {
        currentCalYear = lastDate.y;
        currentCalMonth = lastDate.m;
    } else {
        const d = new Date();
        currentCalYear = d.getFullYear();
        currentCalMonth = d.getMonth();
    }
    
    renderCalendar();
    dateModal.classList.remove('hidden');
});

function renderCalendar() {
    calGrid.innerHTML = '';
    calMonthLabel.textContent = `${currentCalYear}年 ${currentCalMonth + 1}月`;
    calMonthLabel.style.cursor = 'pointer';
    
    const days = ['日','月','火','水','木','金','土'];
    days.forEach(d => {
        const div = document.createElement('div');
        div.className = 'cal-cell cal-header-cell';
        div.textContent = d;
        calGrid.appendChild(div);
    });
    
    const firstDay = new Date(currentCalYear, currentCalMonth, 1).getDay();
    const daysInMonth = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();
    
    for (let i = 0; i < firstDay; i++) {
        const blank = document.createElement('div');
        blank.className = 'cal-cell';
        calGrid.appendChild(blank);
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
        const cell = document.createElement('div');
        const key = `${currentCalYear}-${currentCalMonth + 1}-${i}`;
        
        cell.className = 'cal-cell';
        cell.innerHTML = `<span>${i}</span>`;
        
        const data = validDatesMap[key];
        if (data !== undefined) {
            cell.classList.add('cal-day_valid');
            if (data.count > 0) {
                cell.innerHTML += `<div class="cal-activity-badge" style="background:#00B900; width:6px; height:6px; border-radius:50%; padding:0; margin-top:5px; color:transparent; font-size:0;"></div>`;
            }
            cell.onclick = () => {
                dateModal.classList.add('hidden');
                vScroll.scrollToIndex(data.index);
            };
        } else {
            cell.classList.add('cal-day_invalid');
        }
        calGrid.appendChild(cell);
    }
}

calMonthLabel.addEventListener('click', () => {
    // Generate month list based on validDatesMap
    const monthCounts = {};
    for (const key in validDatesMap) {
        const parts = key.split('-');
        const monthKey = `${parts[0]}-${parts[1]}`;
        if (!monthCounts[monthKey]) monthCounts[monthKey] = 0;
        monthCounts[monthKey] += validDatesMap[key].count;
    }
    
    const sortedMonths = Object.keys(monthCounts).sort((a,b) => {
        const aP = a.split('-').map(Number);
        const bP = b.split('-').map(Number);
        return (bP[0]*12 + bP[1]) - (aP[0]*12 + aP[1]);
    });
    
    searchResultList.innerHTML = `<div style="padding:15px; font-weight:bold; border-bottom:1px solid var(--border-color); background:var(--surface-color); position:sticky; top:0;">カレンダー年月を選択</div>`;
    sortedMonths.forEach(mKey => {
        const parts = mKey.split('-');
        const y = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const cnt = monthCounts[mKey];
        const div = document.createElement('div');
        div.className = 'modal-list-item';
        div.style.flexDirection = 'row';
        div.style.justifyContent = 'space-between';
        div.innerHTML = `<span style="font-size:16px; font-weight:bold;">${y}年 ${m}月</span> <span style="font-size:14px; color:var(--text-muted);">${cnt}件</span>`;
        div.onclick = () => {
            currentCalYear = y;
            currentCalMonth = m - 1;
            renderCalendar();
            searchModal.classList.add('hidden');
        };
        searchResultList.appendChild(div);
    });
    searchModal.querySelector('.modal-content').classList.remove('fullscreen');
    searchTotalHits.parentElement.style.display = 'none'; // hide title in generic modal use
    searchModal.classList.remove('hidden');
});

calPrevBtn.addEventListener('click', () => {
    currentCalMonth--;
    if (currentCalMonth < 0) { currentCalMonth = 11; currentCalYear--; }
    renderCalendar();
});

calNextBtn.addEventListener('click', () => {
    currentCalMonth++;
    if (currentCalMonth > 11) { currentCalMonth = 0; currentCalYear++; }
    renderCalendar();
});

let calStartX = 0;
let calStartY = 0;
calGrid.addEventListener('touchstart', (e) => {
    calStartX = e.touches[0].clientX;
    calStartY = e.touches[0].clientY;
}, {passive:true});
calGrid.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - calStartX;
    const dy = e.changedTouches[0].clientY - calStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
        if (dx > 0) {
            currentCalMonth--;
            if (currentCalMonth < 0) { currentCalMonth = 11; currentCalYear--; }
            renderCalendar();
        } else {
            currentCalMonth++;
            if (currentCalMonth > 11) { currentCalMonth = 0; currentCalYear++; }
            renderCalendar();
        }
    }
});

// KEYWORD SEARCH
if (searchToggleBtn) {
    searchToggleBtn.addEventListener('click', () => {
        // フルスクリーン検索モーダルを開き、即座にフォーカス
        searchModal.classList.remove('hidden');
        setTimeout(() => kwSearchNode.focus(), 50);
    });
}

kwSearchNode.addEventListener('input', (e) => {
    const kw = e.target.value.trim().toLowerCase();
    window.searchKeyword = kw;
    
    // 即時カウント（軽微な処理）
    if (!kw || !currentChat) {
        if (searchQuickCount) searchQuickCount.textContent = '';
    } else {
        let count = 0;
        for (let i = 0; i < currentChat.messages.length; i++) {
            const msg = currentChat.messages[i];
            if (msg.type === 'msg' && msg.text.toLowerCase().includes(kw)) count++;
        }
        if (searchQuickCount) searchQuickCount.textContent = `${count}件`;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        if (!kw || !currentChat) {
            searchHighlightIndices.clear();
            activeSearchIndexValue = -1;
            searchMatches = [];
            currentMatchPos = -1;
            searchResultList.innerHTML = '';
            searchNav.classList.add('hidden');
            searchTotalHits.textContent = '0';
            if (searchQuickCount) searchQuickCount.textContent = '';
            vScroll.updateVisibleItems(true);
            return;
        }

        searchMatches = [];
        searchResultList.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        for (let i = 0; i < currentChat.messages.length; i++) {
            const msg = currentChat.messages[i];
            if (msg.type === 'msg' && msg.text.toLowerCase().includes(kw)) {
                searchMatches.push(i);
            }
        }
        
        searchHighlightIndices = new Set(searchMatches);
        searchTotalHits.textContent = searchMatches.length;
        if (searchQuickCount) searchQuickCount.textContent = `${searchMatches.length}件`;
        searchTotalHits.parentElement.style.display = ''; // Restore title
        
        if (searchMatches.length === 0) {
            searchResultList.innerHTML = '<div style="padding:20px;text-align:center;">見つかりませんでした</div>';
        } else {
            // パフォーマンスのためDOM書き出しは最新150件に制限
            const renderLimit = Math.min(searchMatches.length, 150);
            for (let j = 0; j < renderLimit; j++) {
                const idx = searchMatches[j];
                const msg = currentChat.messages[idx];
                
                const div = document.createElement('div');
                div.className = 'modal-list-item';
                
                let snippet = msg.text;
                if (snippet.length > 50) snippet = snippet.substring(0, 50) + '...';
                
                const escapedKeyword = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${escapedKeyword})`, 'gi');
                snippet = snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                snippet = snippet.replace(regex, '<mark>$1</mark>');
                
                // V7: enforce specific format "2024/05/12 Sender (17:33)"
                const formattedDate = msg.date || '----/--/--';
                const timeClean = msg.time || '--:--';
                
                div.innerHTML = `
                    <div class="search-hit-sender"><span style="color:#7494c0; margin-right:5px; font-weight:bold;">${formattedDate}</span> ${msg.sender} <span style="color:#777; font-weight:normal;">(${timeClean})</span></div>
                    <div class="search-hit-text">${snippet}</div>
                `;
                
                div.onclick = ((pos) => {
                    return () => {
                        searchModal.classList.add('hidden');
                        currentMatchPos = pos;
                        jumpToMatch();
                    };
                })(j);
                
                fragment.appendChild(div);
            }
            searchResultList.appendChild(fragment);
            if (searchMatches.length > 150) {
                const moreInfo = document.createElement('div');
                moreInfo.style = 'padding: 15px; text-align: center; color: var(--text-muted); font-size: 13px;';
                moreInfo.textContent = `他 ${searchMatches.length - 150} 件 (表示上限のため省略)`;
                searchResultList.appendChild(moreInfo);
            }
        }
        
        searchModal.querySelector('.modal-content').classList.add('fullscreen');
        searchModal.classList.remove('hidden');
    }, 400); 
});

function jumpToMatch() {
    if (searchMatches.length === 0 || currentMatchPos < 0) return;
    activeSearchIndexValue = searchMatches[currentMatchPos];
    vScroll.scrollToIndex(activeSearchIndexValue); 
    
    searchCount.textContent = `${currentMatchPos + 1}件 / ${searchMatches.length}件`;
    searchNav.classList.remove('hidden');
}

searchPrev.addEventListener('click', () => {
    if (searchMatches.length === 0) return;
    currentMatchPos--;
    if (currentMatchPos < 0) currentMatchPos = searchMatches.length - 1;
    jumpToMatch();
});

searchNext.addEventListener('click', () => {
    if (searchMatches.length === 0) return;
    currentMatchPos++;
    if (currentMatchPos >= searchMatches.length) currentMatchPos = 0;
    jumpToMatch();
});

searchClose.addEventListener('click', () => {
    searchNav.classList.add('hidden');
    activeSearchIndexValue = -1;
    vScroll.updateVisibleItems(true);
});
