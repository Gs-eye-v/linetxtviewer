import re
import os

def fix_app_js():
    if not os.path.exists('app.js'):
        print("app.js not found")
        return
        
    with open('app.js', 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.splitlines()

    def replace_range(start_line, end_line, new_code):
        # lines is 0-indexed, but input is 1-indexed
        start = start_line - 1
        end = end_line
        
        # Preserve leading indentation of the first line if possible
        indent = ""
        if start < len(lines):
            m = re.match(r'^\s*', lines[start])
            if m:
                indent = m.group(0)
        
        # Adjust new_code indentation
        code_lines = new_code.strip('\n').split('\n')
        # We assume the new_code is provided with correct relative indentation
        # We just need to make sure the whole block fits
        
        lines[start:end] = code_lines

    # --- Phase 1: Small fixes (Early sections) ---
    # I18N_MAP ja section
    replace_range(14, 37, """        TITLE_GLOBAL_SEARCH: "全体トーク検索",
        TITLE_GLOBAL_CALENDAR: "全体カレンダー",
        TITLE_RANDOM_JUMP: "ランダムジャンプ",
        TITLE_MENU: "メニュー",
        MENU_IMPORT: "トーク履歴をインポート",
        MENU_FAV: "お気に入りメッセージ",
        MENU_ARCHIVE: "アーカイブ一覧",
        MENU_MEMO: "メモ一覧",
        MENU_MANUAL: "操作マニュアル",
        MENU_SETTINGS: "詳細設定",
        SETTING_THEME: "テーマカラー設定",
        SETTING_PASS_LOCK: "パスコードロックを有効にする",
        SETTING_PASS_WARN: "【重要：パスコードに関する注意】\\nロックアウトされたデータは復元できません。メインパスコードを忘れた場合、データの閲覧やエクスポートができなくなります。設定変更やリセットも不可能です。必ず忘れないように管理してください。",
        SETTING_MAIN_PASS: "メインパスコード設定",
        SETTING_FAKE_PASS: "ダミーパスコード設定",
        SETTING_BACKUP_RESTORE: "バックアップと復元",
        RANKING_TITLE: "ランキング",
        RANKING_CHARS_UP: "文字以上",
        RANKING_REFRESH: "更新",
        BTN_SAVE: "保存",
        BTN_APPLY: "適用",
        BTN_CANCEL: "キャンセル",
        BTN_CLOSE: "閉じる\"""")

    # Calendar / Stats (170-300)
    replace_range(170, 170, '        label.textContent = `${year}年 ${month + 1}月`;')
    replace_range(192, 197, """    ['日','月','火','水','木','金','土'].forEach(d => {
        const cell = document.createElement('div');
        cell.className = 'cal-cell cal-header-cell';
        cell.textContent = d;
        grid.appendChild(cell);
    });""")
    replace_range(209, 225, """        cell.innerHTML = `<span>${d}</span>`;
        const key = `${year}-${month + 1}-${d}`;
        const data = stats[key];
        if (data) {
            if (data.count > 0) {
                cell.innerHTML += `<div class="cal-activity-badge">${data.count}</div>`;
                cell.classList.add('cal-day_active');
            }
            if (data.call > 0) {
                cell.innerHTML += `<div style="font-size:9px; color:${config.statsColor};">☎ ${fmt(data.call)}</div>`;
            }
        }""")
    replace_range(238, 239, """        let text = `期間内合計： ${monthTotal.toLocaleString()}件`;
        text += ` / 通話時間：${monthCall > 0 ? fmt(monthCall) : "0:00"}`;""")
    replace_range(300, 300, '        div.innerHTML = `<span style="font-weight:bold;">${y}年 ${m}月</span> <span style="font-size:12px; color:var(--text-muted);">${data.count}件${data.call > 0 ? " / ☎ " + fmt(data.call) : ""}</span>`;')
    replace_range(335, 335, "        if (typeof showToast === 'function') showToast('検索キーワードを入力してください');")
    replace_range(347, 347, '    titleNode.innerHTML = `${dateStr} の検索結果 (<span id="global-search-total-hits">${hits.length}</span>件)`;')

    # Event handlers / UI (487-940)
    replace_range(487, 487, "        console.log('チャットリストのクリック(List):', item.dataset.id);")
    replace_range(511, 511, "                const newName = prompt('トークルーム名を変更:', chat.title);")
    replace_range(527, 530, """            if (currentChat && confirm('本当にこのトークを削除しますか？')) {
                await LineChatDB.deleteChat(currentChat.id);
                showToast('トークを削除しました');""")
    replace_range(766, 766, "        alert('セキュリティエラー: HTTPSまたはlocalhost環境でのみ実行可能です');")
    replace_range(784, 784, "            passcodeError.textContent = `パスコードが違います。 残り ${remain} 回`;")
    replace_range(790, 792, """            passcodeError.textContent = '入力が短すぎます。設定したパスコードを入力してください。';
            return;
        }""")
    replace_range(799, 801, """        alert('エラー: Web Crypto APIを使用するためには、HTTPS接続またはlocalhostでの実行が必要です。');
        return;
    }""")
    replace_range(846, 846, "                    passcodeError.textContent = `パスコードが違います。 あと ${passcodeFailCount} 回間違えると、データは消去されます。`;")
    replace_range(907, 907, "        if (!confirm('パスコードロックを無効にすると、保存されているデータは暗号化されません。共有デバイスなどでは推奨されません。無効にしますか？')) {")
    replace_range(931, 931, "                showToast('パスコードロックを無効に設定しました');")

    # --- Phase 2: Massive Block Restorations ---
    # Import / Mapping (1269-1538)
    replace_range(1269, 1269, "            listDiv.innerHTML = '<p style=\"padding:20px; text-align:center; font-size:14px; color:var(--text-muted);\">新しい発言者は見つかりませんでした。</p>';")
    replace_range(1284, 1285, """                    <span style="font-size:12px; color:var(--text-muted);">→</span>
                    <input type="text" list="${dsId}" placeholder="名前を編集" value="${ns}" style="width:45%; padding:8px; border-radius:8px; border:1px solid var(--border-color); font-size:14px; background:var(--bg-color); color:var(--text-main);" data-new-sender="${ns.replace(/"/g, '&quot;')}">""")
    replace_range(1312, 1318, """                        <span style="font-weight:bold; font-size:14px;">${ns} のアイコン</span>
                        <label style="font-size:12px; display:flex; align-items:center; gap:4px;">
                            <input type="radio" name="import-main-icon" value="${ns}" style="width:16px;height:16px;"> 代表
                        </label>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:8px;">
                        <div class="import-thumbnail no-icon active" data-sender="${ns.replace(/"/g, '&quot;')}" data-img-idx="-1" style="width:40px; height:40px; border-radius:50%; background:var(--border-color); display:flex; align-items:center; justify-content:center; font-size:10px; border:2px solid var(--primary-color); cursor:pointer;">なし</div>""")
    replace_range(1536, 1536, "        showToast(`${successCount}件のファイルを処理しました`);")

    # Room Settings (1580-1785)
    replace_range(1598, 1598, '            iconHtml = `<div class="user-icon s-icon" style="background-image:url(\'${tempIconMap[s]}\'); background-size:cover; cursor:pointer;" title="アイコン変更"></div>`;')
    replace_range(1600, 1601, """            const initial = (s || "？").charAt(0).toUpperCase();
            iconHtml = `<div class="user-icon s-icon" style="background:var(--primary-color); color:white; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="アイコン変更">${initial}</div>`;""")
    replace_range(1605, 1605, '            <input type="radio" name="main-icon" value="${s}" style="width:20px;height:20px; cursor:pointer;" title="代表アイコンにする" ${(currentChat.icon === tempIconMap[s] && tempIconMap[s]) ? \'checked\' : \'\'}>')
    replace_range(1650, 1650, "        origFileSpan.textContent = currentChat.originalFilename || '未設定';")
    replace_range(1722, 1722, "        showToast('設定を適用しました');")
    replace_range(1782, 1782, "        if (isNaN(numericId)) throw new Error('不正なチャットIDです');")
    replace_range(1785, 1785, "        if (!chat) throw new Error('チャットが見つかりません');")
    replace_range(1811, 1811, "                showToast(\"発言者が1人以下のため、表示の左右を切り替えられません（自分を特定できません）。\");")
    replace_range(1819, 1819, "            showToast(currentChat.myName + ' に表示順を変更しました');")
    replace_range(1828, 1828, '            iconText.textContent = (chat.title || "?").charAt(0);')

    # Favorites / Archived / Memo (1930-2312)
    replace_range(1930, 1930, "    if (!hasFavs) favList.innerHTML = `<div style=\"padding:40px; text-align:center; color:var(--text-muted);\">${specificChatId ? 'このルームにお気に入りはありません' : 'お気に入りはありません'}</div>`;")
    replace_range(1980, 1980, "        archivedList.innerHTML = '<div style=\"padding:40px; text-align:center; color:var(--text-muted);\">アーカイブはありません</div>';")
    replace_range(2007, 2007, '                ctxArchive.innerHTML = \'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg> 一覧に戻す\';')
    replace_range(2014, 2014, '                        showToast("トークを一覧に戻しました");')
    replace_range(2032, 2032, 'ctxArchive.innerHTML = \'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path></svg> アーカイブ\';')
    replace_range(2041, 2041, '    showToast("トークをアーカイブしました");')
    replace_range(2069, 2069, "    showToast('シャッフルジャンプしました');")
    replace_range(2111, 2111, "    memoTitleLabel.textContent = 'メモ';")
    replace_range(2154, 2154, "            if (typeof m === 'string') return { title: m.substring(0, 15) || '無題', text: m, time: Date.now() };")
    replace_range(2182, 2182, "                    <h4 style=\"margin:0 0 5px 0;\">${memo.title || '無題'}</h4>")
    replace_range(2205, 2205, "                if (confirm('このメモを削除しますか？')) {")
    replace_range(2214, 2214, "            indexList.innerHTML = `<div style=\"padding:50px; text-align:center; color:var(--text-muted);\">${searchKeyword ? '検索結果が見つかりません' : 'メモがありません'}</div>`;")
    replace_range(2225, 2225, "        if (confirm(`${selectedIndices.size}件のメモを削除しますか？`)) {")
    replace_range(2228, 2228, "            showToast('一括削除しました');")
    replace_range(2271, 2271, "        showToast('削除しました');")
    replace_range(2291, 2291, "        if (confirm('このメモを完全に削除しますか？')) {")
    replace_range(2300, 2300, "        const t = editTitle.value.trim() || '無題';")
    replace_range(2312, 2312, "        showToast('保存しました');")

    # --- Phase 3: Total Reconstruction of the Fragmented End section (2321 to end) ---
    end_section = """
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
    findViewById('close-global-calendar-modal').onclick = () => {
        const monthListView = findViewById('global-month-list-view');
        if (monthListView && !monthListView.classList.contains('hidden')) {
            closeMonthList({ list: 'global-month-list-view', grid: 'global-calendar-grid', prev: 'global-cal-prev-btn', next: 'global-cal-next-btn' });
        } else {
            history.back();
        }
    };
    findViewById('close-date-modal').onclick = () => {
        const monthListView = findViewById('month-list-view');
        if (monthListView && !monthListView.classList.contains('hidden')) {
            closeMonthList({ list: 'month-list-view', grid: 'calendar-grid', prev: 'cal-prev-btn', next: 'cal-next-btn', header: 'calendar-header-main' });
        } else {
            history.back();
        }
    };
    findViewById('date-btn').onclick = () => pushViewState({ view: UI_VIEWS.ROOM, chatId: currentChatId, modal: UI_MODALS.DATE });
    findViewById('close-about-modal').onclick = () => history.back();
    findViewById('close-hidden-page-modal').onclick = () => history.back();

    let iconTapCount = 0;
    let lastTapTime = 0;
    const aboutIcon = document.getElementById('about-arkive-icon');
    if (aboutIcon) {
        aboutIcon.addEventListener('click', () => {
        const now = Date.now();
        if (now - lastTapTime > 1500) iconTapCount = 0; // 1.5秒空いたらリセット
        lastTapTime = now;
        iconTapCount++;
        if (iconTapCount >= 10) {
            iconTapCount = 0;
            pushViewState({ view: UI_VIEWS.LIST, modal: 'hidden-page-modal' });
        }
    });
}
    
    const gSearchInput = findViewById('global-search-input');
    const gSearchResults = findViewById('global-search-results');
    const gSearchSort = findViewById('global-search-sort-btn');
    const gSearchDateS = findViewById('global-search-date-start');
    const gSearchDateE = findViewById('global-search-date-end');
    const gSearchMemberBtn = findViewById('global-search-member-btn');
    
    window.gSearchMemberFilter = new Set();

    window.triggerGlobalSearch = async () => {
        const val = gSearchInput.value.trim().toLowerCase();
        const gSearchTotalHits = document.getElementById('global-search-total-hits');
        if (val.length < 1) { 
            if (gSearchResults) gSearchResults.innerHTML = ''; 
            if (gSearchTotalHits) gSearchTotalHits.textContent = '0';
            return; 
        }
        
        if (LineChatDB.encryptionKey === null) {
            if (typeof showToast === 'function') showToast('データが保護解除されていないため検索できません');
            return;
        }

        const tokens = val.split(/\\s+/).filter(t => t.length > 0);
        const includeTokens = tokens.filter(t => !t.startsWith('-'));
        const excludeTokens = tokens.filter(t => t.startsWith('-')).map(t => t.substring(1));

        const dStart = gSearchDateS.value ? new Date(gSearchDateS.value + 'T00:00:00').getTime() : 0;
        const dEnd = gSearchDateE.value ? new Date(gSearchDateE.value + 'T23:59:59').getTime() : Infinity;
        const sortMode = gSearchSort.getAttribute('data-sort');

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
            const highlightTokens = val.split(/\\s+/).filter(t => t.length > 0 && !t.startsWith('-'));
            const highlightPattern = highlightTokens.length > 0 ? highlightTokens.map(t => t.replace(/[.*+?^${}()|[\\\\\\]]/g, '\\\\$&')).join('|') : "";

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
            gSearchResults.innerHTML = html || '<div style="text-align:center; padding:20px; color:var(--text-muted);">見つかりませんでした</div>';
        } catch (err) {
            console.error('Global search error:', err);
            if (typeof showToast === 'function') showToast('検索中にエラーが発生しました');
        }
    };

    gSearchInput.oninput = window.triggerGlobalSearch;
    gSearchDateS.onchange = window.triggerGlobalSearch;
    gSearchDateE.onchange = window.triggerGlobalSearch;
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

    gSearchMemberBtn.onclick = async () => {
        window.isGlobalSearchFilterMode = true;
        const senders = window.currentGlobalHitSenders;
        if (senders.size === 0) {
            if (typeof showToast === 'function') showToast('検索結果がありません');
            return;
        }
        const filterList = document.getElementById('member-filter-list');
        filterList.innerHTML = '';
        Array.from(senders).sort().forEach(name => {
            const label = document.createElement('label');
            label.style = "display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid #eee; font-size:16px; color:var(--text-main);";
            const isChecked = window.gSearchMemberFilter.has(name) || window.gSearchMemberFilter.size === 0;
            label.innerHTML = `<input type="checkbox" value="${name}" ${isChecked ? 'checked' : ''} style="width:20px; height:20px;"> <span style="flex:1;">${name}</span>`;
            filterList.appendChild(label);
        });
        findViewById('member-filter-modal').classList.remove('hidden');
    };

    gSearchResults.onclick = (e) => {
        const card = e.target.closest('.global-hit-card');
        if (card && card.dataset.id) {
            const idx = parseInt(card.dataset.idx);
            window.pendingSearchJumpIndex = idx;
            openChat(card.dataset.id);
            findViewById('global-search-modal').classList.add('hidden');
        }
    };
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
        mainPassInput.placeholder = hasMain ? "●●●●●●●●" : "新しいメインパスコード";
        fakePassInput.placeholder = hasFake ? "●●●●●●●●" : "新しい偽パスコード";
        pWarn.style.display = pToggle.checked ? 'block' : 'none';
        pContainer.style.display = pToggle.checked ? 'block' : 'none';
        fInputs.style.display = fToggle.checked ? 'block' : 'none';
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

    mainPassInput.oninput = checkMain;
    mainConfirmInput.oninput = checkMain;
    fakePassInput.oninput = checkFake;
    fakeConfirmInput.oninput = checkFake;

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
    fToggle.onchange = updateVisibility;
    
    findViewById('theme-select').onchange = (e) => {
        localStorage.setItem('app_theme', e.target.value);
        applyTheme(e.target.value);
        showToast("テーマを適用しました");
    };

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
    let txt = `[LINE] トーク履歴: ${chat.title}\\r\\n保存日時：${new Date().toLocaleString('ja-JP')}\\r\\n\\r\\n`;
    const days = ['日','月','火','水','木','金','土'];
    chat.messages.forEach(m => {
        if (m.type === 'date') {
            const d = new Date(m._timestamp);
            txt += `\\r\\n${m.text}(${days[d.getDay()]})\\r\\n`;
        } else if (m.type === 'msg') {
            txt += `${m.time}\\t${m.sender}\\t${m.text.replace(/\\n/g, '\\r\\n\\t\\t')}\\r\\n`;
        } else if (m.type === 'sys') {
            txt += `${m.time}\\t${m.text}\\r\\n`;
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
        document.getElementById('ranking-min-len-label').textContent = val;
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
    document.getElementById('ranking-min-len-label').textContent = rankingMinLen || 2;
    const listNode = document.getElementById('ranking-list');
    const refreshBtn = document.getElementById('ranking-refresh-btn');
    const render = (data) => {
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
    refreshBtn.onclick = run;
    const cached = localStorage.getItem(`ranking_cache_${chatId}_${rankingMinLen}`);
    if (cached) render(JSON.parse(cached));
    else run();
}

window.jumpToSearch = (word) => {
    if (currentChatId) {
        pushViewState({ view: UI_VIEWS.ROOM, chatId: currentChatId, modal: UI_MODALS.SEARCH, searchKw: word });
        kwSearchNode.value = word;
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
            document.getElementById('hidden-page-modal').classList.remove('hidden');
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
    findViewById('ranking-back-btn').onclick = () => history.back();
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
    findViewById('main-memo-btn').onclick = () => {
        document.getElementById('list-kebab-dropdown').classList.remove('active');
        initMemo('main');
    };
    findViewById('list-archive-btn').onclick = () => {
        document.getElementById('list-kebab-dropdown').classList.remove('active');
        pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.ARCHIVED });
    };
    findViewById('global-ranking-btn').onclick = async () => {
        document.getElementById('list-kebab-dropdown').classList.remove('active');
        const chats = await LineChatDB.getAllChats();
        let allMessages = [];
        chats.forEach(c => { if (c.messages) allMessages = allMessages.concat(c.messages); });
        showRankingView(allMessages, 'global');
    };
    findViewById('room-ranking-btn').onclick = () => {
        if (currentChat && currentChat.messages) showRankingView(currentChat.messages, currentChatId);
    };
    findViewById('backup-db-btn').onclick = () => {
        pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.BACKUP_OPT });
    };
    const downloadBackup = (data, prefix) => {
        const filename = prompt('バックアップのファイル名を入力してください', `${prefix}_${new Date().toISOString().slice(0,10)}`);
        if (!filename) return;
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("バックアップを作成しました");
        history.back();
    };
    findViewById('backup-opt-all').onclick = async () => {
        const chats = await LineChatDB.getAllChats();
        const settings = await LineChatDB.getAllSettings();
        const ls = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('ranking_cache_') || (key.startsWith('app_') && !key.includes('password_hash') && key !== 'app_salt')) {
                ls[key] = localStorage.getItem(key);
            }
        }
        downloadBackup({ version: APP_VERSION, date: new Date().toISOString(), chats, settings, localStorage: ls }, 'arkive_full_backup');
    };
    findViewById('backup-opt-chats').onclick = async () => {
        const chats = await LineChatDB.getAllChats();
        downloadBackup({ version: APP_VERSION, date: new Date().toISOString(), chats }, 'arkive_chats_only');
    };
    findViewById('backup-opt-cancel').onclick = () => history.back();
    findViewById('close-backup-options-modal').onclick = () => history.back();
    findViewById('restore-db-btn').onclick = () => findViewById('restore-input').click();
    findViewById(UI_MODALS.RESTORE_INPUT).onchange = async (e) => {
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
                if (hasSettings) for (const k in data.settings) await LineChatDB.setSetting(k, data.settings[k]);
                if (data.localStorage) {
                    for (const k in data.localStorage) localStorage.setItem(k, data.localStorage[k]);
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
    const listHeaderLeft = document.getElementById('list-header-left');
    if (listHeaderLeft) {
        listHeaderLeft.addEventListener('click', () => {
            pushViewState({ view: UI_VIEWS.LIST, modal: UI_MODALS.ABOUT });
        });
    }
}

document.addEventListener('click', (e) => {
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
});
"""
    replace_range(2321, 3027, end_section)

    with open('app.js', 'w', encoding='utf-8') as f:
        f.write("\\n".join(lines))

if __name__ == '__main__':
    fix_app_js()
