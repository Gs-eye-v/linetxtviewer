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

const searchSortBtn = document.getElementById('search-sort-btn');
const searchDateStart = document.getElementById('search-date-start');
const searchDateEnd = document.getElementById('search-date-end');

// V12: Member filter
let searchMemberFilter = new Set(); // Selection for filtering

function triggerSearch() {
    kwSearchNode.dispatchEvent(new Event('input', { bubbles: true }));
}

if (searchSortBtn) {
    searchSortBtn.addEventListener('click', () => {
        const currentSort = searchSortBtn.getAttribute('data-sort');
        if (currentSort === 'desc') {
            searchSortBtn.setAttribute('data-sort', 'asc');
            searchSortBtn.textContent = '古い順';
        } else {
            searchSortBtn.setAttribute('data-sort', 'desc');
            searchSortBtn.textContent = '新しい順';
        }
        triggerSearch();
    });
}

if (searchDateStart) searchDateStart.addEventListener('change', triggerSearch);
if (searchDateEnd) searchDateEnd.addEventListener('change', triggerSearch);

document.addEventListener('chatOpened', () => {
    kwSearchNode.value = '';
    window.searchKeyword = '';
    searchModal.classList.add('hidden');
    searchNav.classList.add('hidden');
    dateModal.classList.add('hidden');
    
    searchMatches = [];
    currentMatchPos = -1;
    searchHighlightIndices.clear();
    activeSearchIndexValue = -1;
    searchResultList.innerHTML = '';
    searchMemberFilter.clear();
    
    if (searchToggleBtn) searchToggleBtn.style.color = '';
    if (searchQuickCount) searchQuickCount.textContent = '';
});

closeSearchModalBtn.addEventListener('click', () => searchModal.classList.add('hidden'));
closeDateModalBtn.addEventListener('click', () => dateModal.classList.add('hidden'));

// Helper: Format seconds to H:M:S
function formatCallTime(seconds) {
    if (!seconds) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

// CALENDAR LOGIC
dateBtn.addEventListener('click', () => {
    if (!currentChat || !currentChat.messages) {
        console.warn("No active chat for calendar");
        return;
    }
    
    validDatesMap = {};
    
    currentChat.messages.forEach((msg, idx) => {
        if (msg.date) {
            const dKey = msg.date.replace(/\//g, '-');
            const parts = dKey.split('-');
            const y = parseInt(parts[0]);
            const m = parseInt(parts[1]);
            const d = parseInt(parts[2]);
            const key = `${y}-${m}-${d}`;

            if (validDatesMap[key] === undefined) {
                validDatesMap[key] = { index: idx, count: 0, callTime: 0 };
            }
            if (msg.type === 'msg' || msg.type === 'sys') {
                if (msg.type === 'msg') validDatesMap[key].count++;
                if (msg.callDuration) validDatesMap[key].callTime += msg.callDuration;
            }
        }
    });

    // V12-13: Sync calendar to current visible message
    const centerIdx = typeof vScroll !== 'undefined' ? vScroll.getMiddleVisibleIndex() : 0;
    const centerMsg = currentChat.messages[centerIdx];
    if (centerMsg && centerMsg.date) {
        const parts = centerMsg.date.split('/');
        currentCalYear = parseInt(parts[0]);
        currentCalMonth = parseInt(parts[1]) - 1;
    } else {
        const lastMsg = currentChat.messages[currentChat.messages.length - 1];
        if (lastMsg && lastMsg.date) {
            const parts = lastMsg.date.split('/');
            currentCalYear = parseInt(parts[0]);
            currentCalMonth = parseInt(parts[1]) - 1;
        }
    }
    
    renderCalendar();
    dateModal.classList.remove('hidden');
});

function renderCalendar() {
    calGrid.innerHTML = '';
    calMonthLabel.textContent = `${currentCalYear}年 ${currentCalMonth + 1}月`;
    calMonthLabel.style.cursor = 'pointer';
    
    document.getElementById('cal-prev-btn').classList.remove('hidden');
    document.getElementById('cal-next-btn').classList.remove('hidden');
    
    // Boundary check for arrows
    const months = Object.keys(validDatesMap).map(k => {
        const p = k.split('-');
        return parseInt(p[0]) * 12 + (parseInt(p[1]) - 1);
    });
    const minM = Math.min(...months);
    const maxM = Math.max(...months);
    const currM = currentCalYear * 12 + currentCalMonth;

    calPrevBtn.style.opacity = currM <= minM ? "0.2" : "1";
    calPrevBtn.style.pointerEvents = currM <= minM ? "none" : "auto";
    calNextBtn.style.opacity = currM >= maxM ? "0.2" : "1";
    calNextBtn.style.pointerEvents = currM >= maxM ? "none" : "auto";

    const days = ['日','月','火','水','木','金','土'];
    days.forEach(d => {
        const div = document.createElement('div');
        div.className = 'cal-cell cal-header-cell';
        div.textContent = d;
        calGrid.appendChild(div);
    });
    
    const firstDay = new Date(currentCalYear, currentCalMonth, 1).getDay();
    const daysInMonth = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();
    
    let monthTotal = 0;
    let monthCall = 0;

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
                monthTotal += data.count;
                cell.innerHTML += `<div class="cal-activity-badge">${data.count}</div>`;
            }
            if (data.callTime > 0) {
                monthCall += data.callTime;
                cell.innerHTML += `<div style="font-size:9px; color:#5ac8fa; margin-top:1px;">☎${formatCallTime(data.callTime)}</div>`;
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
    
    const totalCountNode = document.getElementById('cal-total-count');
    if (totalCountNode) {
        let text = `月合計: ${monthTotal.toLocaleString()}件`;
        if (monthCall > 0) text += ` / ☎ ${formatCallTime(monthCall)}`;
        totalCountNode.textContent = text;
    }
}

calMonthLabel.addEventListener('click', () => {
    const monthListView = document.getElementById('month-list-view');
    const calendarHeaderMain = document.getElementById('calendar-header-main');
    const calGrid = document.getElementById('calendar-grid');
    const calPrev = document.getElementById('cal-prev-btn');
    const calNext = document.getElementById('cal-next-btn');

    if (!monthListView.classList.contains('hidden')) {
        closeMonthList();
        return;
    }
    
    monthListView.classList.add('full-screen');
    monthListView.classList.remove('hidden');
    calGrid.classList.add('hidden');
    calGrid.style.display = 'none';
    calPrev.classList.add('hidden');
    calNext.classList.add('hidden');
    calendarHeaderMain.style.visibility = 'hidden';

    // V12: Add X button to top right
    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '×';
    closeBtn.style = "position:absolute; right:20px; top:20px; font-size:30px; cursor:pointer; z-index:100; color:var(--text-main); font-weight:normal;";
    closeBtn.onclick = closeMonthList;
    monthListView.appendChild(closeBtn);
    
    const monthStats = {};
    let minT = Infinity, maxT = -Infinity;
    
    for (const key in validDatesMap) {
        const parts = key.split('-');
        const y = parseInt(parts[0]), m = parseInt(parts[1]);
        const mKey = `${y}-${m}`;
        const t = y * 12 + (m - 1);
        if (t < minT) minT = t;
        if (t > maxT) maxT = t;
        if (!monthStats[mKey]) monthStats[mKey] = { count: 0, call: 0 };
        monthStats[mKey].count += validDatesMap[key].count;
        monthStats[mKey].call += validDatesMap[key].callTime;
    }
    
    // V12: Fill gaps
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
        if (data.call > 0) subText += ` / ☎${formatCallTime(data.call)}`;
        
        div.innerHTML = `<span style="font-size:16px; font-weight:bold;">${y}年 ${m}月</span> <span style="font-size:14px; color:var(--text-muted);">${subText}</span>`;
        div.onclick = () => {
            currentCalYear = y;
            currentCalMonth = m - 1;
            closeMonthList();
            renderCalendar();
        };
        listContainer.appendChild(div);
    }
    monthListView.appendChild(listContainer);
});

function closeMonthList() {
    const monthListView = document.getElementById('month-list-view');
    const calendarHeaderMain = document.getElementById('calendar-header-main');
    const calGrid = document.getElementById('calendar-grid');
    monthListView.innerHTML = '';
    monthListView.classList.remove('full-screen');
    monthListView.classList.add('hidden');
    calGrid.classList.remove('hidden');
    calGrid.style.display = 'grid';
    document.getElementById('cal-prev-btn').classList.remove('hidden');
    document.getElementById('cal-next-btn').classList.remove('hidden');
    calendarHeaderMain.style.visibility = 'visible';
}

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

// Touch Swipe
let calStartX = 0; let calStartY = 0;
calGrid.addEventListener('touchstart', (e) => {
    calStartX = e.touches[0].clientX; calStartY = e.touches[0].clientY;
}, {passive:true});
calGrid.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - calStartX;
    const dy = e.changedTouches[0].clientY - calStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
        if (dx > 0) calPrevBtn.click();
        else calNextBtn.click();
    }
});

// SEARCH LOGIC
if (searchToggleBtn) {
    searchToggleBtn.addEventListener('click', () => {
        searchModal.classList.remove('hidden');
        setTimeout(() => kwSearchNode.focus(), 50);
    });
}

// V12: Member filter Modal
const memberFilterBtn = document.getElementById('search-member-filter-btn');
const memberFilterModal = document.getElementById('member-filter-modal');
const closeMemberFilterBtn = document.getElementById('close-member-filter-modal');
const memberFilterList = document.getElementById('member-filter-list');
const memberFilterApply = document.getElementById('member-filter-apply');
const memberFilterAll = document.getElementById('member-filter-all');

memberFilterBtn.addEventListener('click', () => {
    if (!currentChat) return;
    const senders = new Set();
    currentChat.messages.forEach(m => { if(m.sender) senders.add(m.sender); });
    
    memberFilterList.innerHTML = '';
    senders.forEach(name => {
        const label = document.createElement('label');
        label.style = "display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid #eee; font-size:16px;";
        const isChecked = searchMemberFilter.has(name) || searchMemberFilter.size === 0;
        label.innerHTML = `<input type="checkbox" value="${name}" ${isChecked ? 'checked' : ''} style="width:20px; height:20px;"> <span>${name}</span>`;
        memberFilterList.appendChild(label);
    });
    memberFilterModal.classList.remove('hidden');
});

closeMemberFilterBtn.addEventListener('click', () => memberFilterModal.classList.add('hidden'));
memberFilterAll.addEventListener('click', () => {
    const checks = memberFilterList.querySelectorAll('input');
    const allChecked = Array.from(checks).every(c => c.checked);
    checks.forEach(c => c.checked = !allChecked);
});
memberFilterApply.addEventListener('click', () => {
    const checks = memberFilterList.querySelectorAll('input');
    searchMemberFilter.clear();
    let allSelected = true;
    checks.forEach(c => {
        if (c.checked) searchMemberFilter.add(c.value);
        else allSelected = false;
    });
    // If everyone is selected, treat it as "no filter" (everything matches)
    if (allSelected) searchMemberFilter.clear();
    memberFilterModal.classList.add('hidden');
    triggerSearch();
});

kwSearchNode.addEventListener('input', (e) => {
    const kw = e.target.value.trim().toLowerCase();
    window.searchKeyword = kw;
    
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
        
        const sortMode = document.getElementById('search-sort-btn') ? document.getElementById('search-sort-btn').getAttribute('data-sort') : 'desc';
        const dStartInput = document.getElementById('search-date-start');
        const dEndInput = document.getElementById('search-date-end');
        const dStart = dStartInput && dStartInput.value ? new Date(dStartInput.value + 'T00:00:00').getTime() : 0;
        const dEnd = dEndInput && dEndInput.value ? new Date(dEndInput.value + 'T23:59:59').getTime() : Infinity;
        
        const tokens = kw.split(/\s+/).filter(t => t.length > 0);
        const includeTokens = tokens.filter(t => !t.startsWith('-'));
        const excludeTokens = tokens.filter(t => t.startsWith('-')).map(t => t.substring(1));
        
        for (let i = 0; i < currentChat.messages.length; i++) {
            const msg = currentChat.messages[i];
            if (msg.type !== 'msg') continue;
            if (msg.text.includes("メッセージの送信を取り消しました")) continue;
            
            // Member Filter
            if (searchMemberFilter.size > 0 && !searchMemberFilter.has(msg.sender)) continue;
            
            let ts = msg._timestamp;
            if (!ts && msg.date) ts = new Date(msg.date.replace(/\//g,'-') + 'T00:00:00').getTime();
            if (ts && (ts < dStart || ts > dEnd)) continue;
            
            const textLower = msg.text.toLowerCase();
            const matchesAllInclude = includeTokens.every(t => textLower.includes(t));
            if (!matchesAllInclude) continue;
            const matchesAnyExclude = excludeTokens.length > 0 && excludeTokens.some(t => t !== "" && textLower.includes(t));
            if (matchesAnyExclude) continue;
            
            searchMatches.push(i);
        }
        
        searchMatches.sort((a, b) => {
            const tsA = currentChat.messages[a]._timestamp || 0;
            const tsB = currentChat.messages[b]._timestamp || 0;
            return sortMode === 'desc' ? tsB - tsA : tsA - tsB;
        });
        
        searchHighlightIndices = new Set(searchMatches);
        searchTotalHits.textContent = searchMatches.length;
        if (searchQuickCount) searchQuickCount.textContent = `${searchMatches.length}件`;
        
        if (searchMatches.length === 0) {
            searchResultList.innerHTML = '<div style="padding:20px;text-align:center;">見つかりませんでした</div>';
        } else {
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
                snippet = snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(regex, '<mark>$1</mark>');
                
                div.innerHTML = `
                    <div class="search-hit-sender"><span style="color:#7494c0; margin-right:5px; font-weight:bold;">${msg.date || ''}</span> ${msg.sender} <span style="color:#777; font-weight:normal;">(${msg.time || ''})</span></div>
                    <div class="search-hit-text">${snippet}</div>
                `;
                div.onclick = () => { searchModal.classList.add('hidden'); currentMatchPos = j; jumpToMatch(); };
                fragment.appendChild(div);
            }
            searchResultList.appendChild(fragment);
        }
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
    currentMatchPos = (currentMatchPos - 1 + searchMatches.length) % searchMatches.length;
    jumpToMatch();
});

searchNext.addEventListener('click', () => {
    if (searchMatches.length === 0) return;
    currentMatchPos = (currentMatchPos + 1) % searchMatches.length;
    jumpToMatch();
});

searchClose.addEventListener('click', () => {
    searchNav.classList.add('hidden');
    activeSearchIndexValue = -1;
    vScroll.updateVisibleItems(true);
});

// V12: Shuffle (Random Jump) logic
window.shuffleWithinRoom = function() {
    if (!currentChat || currentChat.messages.length === 0) return;
    const msgIndices = [];
    currentChat.messages.forEach((m, idx) => { if(m.type === 'msg') msgIndices.push(idx); });
    if (msgIndices.length === 0) return;
    const randIdx = msgIndices[Math.floor(Math.random() * msgIndices.length)];
    vScroll.scrollToIndex(randIdx);
    showToast("ランダムジャンプしました");
};
