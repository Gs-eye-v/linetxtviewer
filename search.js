window.searchKeyword = '';
window.isGlobalSearchFilterMode = false;

window.matchMessage = function(msg, includeTokens, excludeTokens, options = {}) {
    if (msg.type !== 'msg') return false;
    if (msg.text.includes("メッセージの送信を取り消しました")) return false;
    
    const { dStart = 0, dEnd = Infinity, memberFilter = null, mode = 'AND' } = options;

    if (memberFilter && memberFilter.size > 0 && !memberFilter.has(msg.sender)) return false;
    
    let ts = msg._timestamp;
    if (!ts && msg.date) ts = new Date(msg.date.replace(/\//g,'-') + 'T00:00:00').getTime();
    if (ts && (ts < dStart || ts > dEnd)) return false;
    
    const textLower = msg.text.toLowerCase();
    
    if (includeTokens.length > 0) {
        if (mode === 'OR') {
            const matchesAny = includeTokens.some(t => textLower.includes(t));
            if (!matchesAny) return false;
        } else {
            const matchesAll = includeTokens.every(t => textLower.includes(t));
            if (!matchesAll) return false;
        }
    }
    
    const matchesAnyExclude = excludeTokens.length > 0 && excludeTokens.some(t => t !== "" && textLower.includes(t));
    if (matchesAnyExclude) return false;

    return true;
};

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

// Calendar logic moved to app.js for unification in v1.1.7

function formatCallTime(seconds) {
    if (!seconds) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}
window.formatCallTime = formatCallTime;

const memberFilterBtn = document.getElementById('search-member-filter-btn');
const memberFilterModal = document.getElementById('member-filter-modal');
const closeMemberFilterBtn = document.getElementById('close-member-filter-modal');
const memberFilterList = document.getElementById('member-filter-list');
const memberFilterApply = document.getElementById('member-filter-apply-btn');
const memberFilterAll = document.getElementById('member-filter-clear-btn');

window.renderMemberFilter = (senders) => {
    if (!memberFilterList) return;
    memberFilterList.innerHTML = '';
    
    const sortedSenders = Array.from(senders).sort();
    
    sortedSenders.forEach(name => {
        const label = document.createElement('label');
        label.style = "display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid var(--border-color); font-size:16px; color:var(--text-main);";
        
        let isChecked = false;
        if (window.isGlobalSearchFilterMode) {
            isChecked = !window.gSearchMemberFilter || window.gSearchMemberFilter.size === 0 || window.gSearchMemberFilter.has(name);
        } else {
            isChecked = searchMemberFilter.has(name) || searchMemberFilter.size === 0;
        }
        
        label.innerHTML = `<input type="checkbox" value="${name}" ${isChecked ? 'checked' : ''} style="width:20px; height:20px;"> <span>${name}</span>`;
        memberFilterList.appendChild(label);
    });
};

memberFilterBtn.addEventListener('click', () => {
    window.isGlobalSearchFilterMode = false;
    if (!currentChat) return;
    const senders = new Set();
    currentChat.messages.forEach(m => { if(m.sender) senders.add(m.sender); });
    
    window.renderMemberFilter(Array.from(senders));
    memberFilterModal.classList.remove('hidden');
});

closeMemberFilterBtn.addEventListener('click', () => memberFilterModal.classList.add('hidden'));

if (memberFilterAll) {
    memberFilterAll.addEventListener('click', () => {
        const checks = memberFilterList.querySelectorAll('input');
        const allChecked = Array.from(checks).every(c => c.checked);
        checks.forEach(c => c.checked = !allChecked);
    });
}

if (memberFilterApply) {
    memberFilterApply.addEventListener('click', () => {
        const checks = memberFilterList.querySelectorAll('input');
        
        if (window.isGlobalSearchFilterMode) {
            if (!window.gSearchMemberFilter) window.gSearchMemberFilter = new Set();
            window.gSearchMemberFilter.clear();
            let allSelected = true;
            let checkCount = 0;
            checks.forEach(c => {
                if (c.checked) {
                    window.gSearchMemberFilter.add(c.value);
                    checkCount++;
                } else allSelected = false;
            });
            if (allSelected || checkCount === 0) window.gSearchMemberFilter.clear();
            memberFilterModal.classList.add('hidden');
            if (window.triggerGlobalSearch) window.triggerGlobalSearch();
        } else {
            searchMemberFilter.clear();
            let allSelected = true;
            checks.forEach(c => {
                if (c.checked) searchMemberFilter.add(c.value);
                else allSelected = false;
            });
            if (allSelected) searchMemberFilter.clear();
            memberFilterModal.classList.add('hidden');
            triggerSearch();
        }
    });
}

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
            const filterRes = matchMessage(msg, includeTokens, excludeTokens, {
                dStart, 
                dEnd, 
                memberFilter: searchMemberFilter,
                mode: window.individualSearchMode || 'AND'
            });
            
            if (filterRes) {
                searchMatches.push(i);
            }
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
                
                const tokens = kw.split(/\s+/).filter(t => t.length > 0 && !t.startsWith('-'));
                const highlightPattern = tokens.length > 0 ? tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') : "";
                
                if (highlightPattern) {
                    const regex = new RegExp(`(${highlightPattern})`, 'gi');
                    snippet = snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(regex, '<mark>$1</mark>');
                } else {
                    snippet = snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                }
                
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

window.shuffleWithinRoom = function() {
    if (!currentChat || currentChat.messages.length === 0) return;
    const msgIndices = [];
    currentChat.messages.forEach((m, idx) => { if(m.type === 'msg') msgIndices.push(idx); });
    if (msgIndices.length === 0) return;
    const randIdx = msgIndices[Math.floor(Math.random() * msgIndices.length)];
    vScroll.scrollToIndex(randIdx);
    if (typeof showToast === 'function') showToast("ランダムジャンプしました");
};