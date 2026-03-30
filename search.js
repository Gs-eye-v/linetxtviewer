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
});

closeSearchModalBtn.addEventListener('click', () => searchModal.classList.add('hidden'));
closeDateModalBtn.addEventListener('click', () => dateModal.classList.add('hidden'));

// CALENDAR LOGIC (V4/V5)
dateBtn.addEventListener('click', () => {
    if (!currentChat) return;
    
    validDatesMap = {};
    let lastDate = null;
    
    currentChat.messages.forEach((msg, idx) => {
        if (msg.type === 'date') { 
            const match = msg.text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
            if (match) {
                const y = parseInt(match[1]);
                const m = parseInt(match[2]);
                const d = parseInt(match[3]);
                const key = `${y}-${m}-${d}`;
                if (validDatesMap[key] === undefined) {
                    validDatesMap[key] = idx;
                    lastDate = { y, m: m - 1, d };
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
        cell.textContent = i;
        
        if (validDatesMap[key] !== undefined) {
            cell.classList.add('cal-day_valid');
            cell.onclick = () => {
                dateModal.classList.add('hidden');
                vScroll.scrollToIndex(validDatesMap[key]);
            };
        } else {
            cell.classList.add('cal-day_invalid');
        }
        calGrid.appendChild(cell);
    }
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

// KEYWORD SEARCH
kwSearchNode.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const kw = e.target.value.trim().toLowerCase();
        window.searchKeyword = kw;
        
        if (!kw || !currentChat) {
            searchHighlightIndices.clear();
            activeSearchIndexValue = -1;
            searchMatches = [];
            currentMatchPos = -1;
            searchModal.classList.add('hidden');
            searchNav.classList.add('hidden');
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
        
        if (searchMatches.length === 0) {
            searchResultList.innerHTML = '<div style="padding:20px;text-align:center;">見つかりませんでした</div>';
        } else {
            // V7: Removed search size limit constraint! Renders all nodes inside fragment synchronously matching request.
            for (let j = 0; j < searchMatches.length; j++) {
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
        }
        
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
