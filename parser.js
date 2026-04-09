function detectAndParse(text, fileName, fileSizeKB = 0) {
    let meta = null;
    const metaMatch = text.match(/^\[Ark-ive Metadata\]\s*(.+)/);
    if (metaMatch) {
        try {
            meta = JSON.parse(metaMatch[1]);
            text = text.replace(/^\[Ark-ive Metadata\].*[\r\n]*/, '');
        } catch(e) { console.error("Metadata parse error", e); }
    }

    let format = 'line_txt'; // default
    if (fileName.endsWith('.json')) {
        try {
            const data = JSON.parse(text);
            if (data.participants && data.messages) format = 'instagram_json';
        } catch(e) {}
    } else if (fileName.endsWith('.html')) {
        if (text.includes('Instagram') || text.includes('message') || text.includes('pam')) format = 'instagram_html';
    } else if (fileName.endsWith('.txt')) {
        if (text.includes('KakaoTalk') || text.includes('カカオトーク')) format = 'kakao_txt';
    }

    let result = null;
    if (format === 'instagram_json') result = parseInstagramJson(text);
    else if (format === 'instagram_html') result = parseInstagramHtml(text);
    else if (format === 'kakao_txt') result = parseKakaoTxt(text);
    else result = parseLineChat(text); // Default LINE

    if (result) {
        result.sizeKB = fileSizeKB;
        result.sourceType = format;
        
        if (meta) {
            result.myName = meta.rightUser || null;
            result.icon = meta.icon || null;
            result.userIcons = meta.userIcons || {};
        }
        
        // タイトルの正規化: "〇〇とのメッセージ履歴"
        if (result.title) {
            let cleanTitle = result.title.replace(/\[LINE\]\s*/i, '')
                .replace(/カカオトーク/g, '')
                .replace(/とのトークルーム$/i, '')
                .replace(/とのトーク履歴$/i, '')
                .replace(/とのカカオトーク.*$/i, '')
                .replace(/のメッセージ$/i, '')
                .trim();
            if (cleanTitle && cleanTitle !== "Talk History") {
                result.title = `${cleanTitle}とのメッセージ履歴`;
            } else if (cleanTitle === "Talk History") {
                result.title = "名称未設定とのメッセージ履歴";
            }
        } else {
             result.title = "名称未設定とのメッセージ履歴";
        }
        
        if (result.messages && result.messages.length > 0) {
            // Sort by timestamp if available
            result.messages.sort((a, b) => (a._timestamp || 0) - (b._timestamp || 0));
            
            const msgs = result.messages.filter(m => m.type === 'msg' || m.type === 'sys');
            if (msgs.length > 0) {
                const l = msgs[msgs.length - 1];
                result.lastMessageText = l.sender ? `${l.sender}: ${l.text}`.replace(/\n/g, ' ') : (l.text || '').replace(/\n/g, ' ');
            }
            
            const dates = result.messages.filter(m => m.type === 'msg' && m.date).map(m => m.date);
            if (dates.length > 0) {
                result.firstDate = dates[0];
                result.lastDate = dates[dates.length - 1];
                result.date = result.lastDate;
            }
        } else {
            result.messages = [];
            result.lastMessageText = "";
            result.firstDate = "";
            result.lastDate = "";
        }
    }
    
    return result;
}

function parseInstagramJson(text) {
    const data = JSON.parse(text);
    const title = data.participants ? data.participants.map(p => p.name).join(', ') : "Instagram Talk";
    const messages = [];
    let lastDate = "";
    
    const msgs = data.messages || [];
    msgs.sort((a, b) => a.timestamp_ms - b.timestamp_ms);

    msgs.forEach(m => {
        const d = new Date(m.timestamp_ms);
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}/${mo}/${da}`;
        
        if (dateStr !== lastDate) {
            messages.push({ type: 'date', text: dateStr, date: dateStr, _timestamp: getSafeTimestamp(dateStr, "00:00") });
            lastDate = dateStr;
        }
        
        let textContent = m.content || "";
        if (m.photos) textContent += "\n[写真]";
        if (m.videos) textContent += "\n[動画]";
        if (m.audio_files) textContent += "\n[音声]";
        if (m.share) textContent += "\n[シェア]";
        
        messages.push({
            type: 'msg',
            time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
            sender: m.sender_name || "Unknown",
            text: decodeURIComponent(escape(textContent)).trim(), // Fix moji-bake for IG JSON
            date: dateStr,
            _timestamp: m.timestamp_ms
        });
    });
    return { title, messages };
}

function parseInstagramHtml(text) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    const titleObj = doc.querySelector('title');
    const title = titleObj ? titleObj.textContent : "Instagram Talk";
    
    const messages = [];
    const elements = doc.querySelectorAll('.pam'); // IG HTML uses 'pam' class for messages
    let lastDate = "";

    elements.forEach(el => {
        const senderEl = el.querySelector('div:nth-child(1)');
        const contentEl = el.querySelector('div:nth-child(2)');
        const timeEl = el.querySelector('div:nth-child(3)');
        
        if (senderEl && contentEl && timeEl) {
            const sender = senderEl.textContent.trim();
            const content = contentEl.textContent.trim();
            const timeRaw = timeEl.textContent.trim(); 
            // example: "Sep 1, 2023, 10:00 AM" or localized
            
            let dateStr = "";
            let timeStr = "";
            let timestamp = 0;
            
            // Try to parse IG HTML time (localized string)
            const d = new Date(timeRaw);
            if (!isNaN(d.getTime())) {
                const y = d.getFullYear();
                const mo = String(d.getMonth() + 1).padStart(2, '0');
                const da = String(d.getDate()).padStart(2, '0');
                dateStr = `${y}/${mo}/${da}`;
                const hh = String(d.getHours()).padStart(2, '0');
                const mm = String(d.getMinutes()).padStart(2, '0');
                timeStr = `${hh}:${mm}`;
                timestamp = getSafeTimestamp(dateStr, timeStr);
            }

            if (dateStr && dateStr !== lastDate) {
                // Use getSafeTimestamp for date row as well to avoid NaN
                messages.push({ type: 'date', text: dateStr, date: dateStr, _timestamp: getSafeTimestamp(dateStr, "00:00") });
                lastDate = dateStr;
            }

            messages.push({
                type: 'msg',
                time: timeStr,
                sender: sender,
                text: content,
                date: dateStr,
                _timestamp: timestamp
            });
        }
    });

    return { title, messages };
}

function parseKakaoTxt(text) {
    const lines = text.split(/\r?\n/);
    let title = lines[0] ? lines[0].replace('님과 카카오톡 대화', '').trim() : "KakaoTalk";
    
    const messages = [];
    let lastDate = "";
    const dateRegex = /^-+ (\d{4})년 (\d{1,2})월 (\d{1,2})일 .*-+$/; 
    const dateRegexJp = /^-+ (\d{4})年 (\d{1,2})月 (\d{1,2})日 .*-+$/;
    const msgRegex = /^\[([^\]]+)\] \[([^\]]+)\] (.*)$/;
    
    lines.forEach(line => {
        let dm = line.match(dateRegex) || line.match(dateRegexJp);
        if (dm) {
            const y = dm[1];
            const m = dm[2].padStart(2, '0');
            const d = dm[3].padStart(2, '0');
            lastDate = `${y}/${m}/${d}`;
            messages.push({ type: 'date', text: lastDate, date: lastDate, _timestamp: getSafeTimestamp(lastDate, "00:00") });
            return;
        }

        let mm = line.match(msgRegex);
        if (mm) {
            let sender = mm[1];
            let timeRaw = mm[2]; 
            let content = mm[3];
            
            // parse Kakao time: "오전 10:00" or "午後 2:30"
            let isPm = timeRaw.includes('오후') || timeRaw.includes('午後');
            let timeParts = timeRaw.match(/(\d{1,2}):(\d{2})/);
            let timeStr = "";
            let tstamp = 0;
            if (timeParts) {
                let h = parseInt(timeParts[1]);
                let m = timeParts[2];
                if (isPm && h < 12) h += 12;
                if (!isPm && h === 12) h = 0;
                timeStr = `${String(h).padStart(2, '0')}:${m}`;
                if (lastDate) tstamp = getSafeTimestamp(lastDate, timeStr);
            }
            
            messages.push({
                type: 'msg',
                time: timeStr,
                sender: sender,
                text: content,
                date: lastDate,
                _timestamp: tstamp
            });
            return;
        }
        
        // multiline append
        if (messages.length > 0 && messages[messages.length - 1].type === 'msg') {
            messages[messages.length - 1].text += '\n' + line;
        }
    });

    return { title, messages };
}

function parseLineChat(text) {
    const lines = text.split(/\r?\n/);
    let title = "Talk History";
    let messages = [];
    let currentMessage = null;
    let fallbackDate = null;

    for (let i = 0; i < Math.min(5, lines.length); i++) {
        if (lines[i].includes('トーク履歴') || lines[i].includes('Talk history')) {
            title = lines[i].replace(/\[LINE\]\s*/, '').trim();
            break;
        } else if (i === 0 && lines[0].trim() !== '') {
            title = lines[0].trim();
        }
    }

    const dateRegex = /^(\d{4}\/\d{1,2}\/\d{1,2})\([^\)]+\)/;
    const msgRegexTab = /^(\d{1,2}:\d{2})\t([^\t]+)\t(.*)$/;
    const sysRegexTab = /^(\d{1,2}:\d{2})\t(.*)$/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') continue;

        const dateMatch = line.match(dateRegex);
        if (dateMatch) {
            fallbackDate = dateMatch[1]; 
            const dStr = fallbackDate.split('/').map(v => v.padStart(2, '0')).join('/'); // padding
            fallbackDate = dStr;
            const tstamp = getSafeTimestamp(dStr, "00:00");
            messages.push({ type: 'date', text: dStr, date: dStr, _timestamp: tstamp });
            currentMessage = null;
            continue;
        }

        const msgMatch = line.match(msgRegexTab);
        if (msgMatch) {
            let tstamp = 0;
            if (fallbackDate) tstamp = getSafeTimestamp(fallbackDate, msgMatch[1]);
            currentMessage = {
                type: 'msg',
                time: msgMatch[1].padStart(5, '0'),
                sender: msgMatch[2].replace(/"/g, ''),
                text: msgMatch[3],
                date: fallbackDate || '',
                _timestamp: tstamp
            };
            messages.push(currentMessage);
            continue;
        }

        const sysMatch = line.match(sysRegexTab);
        if (sysMatch && !currentMessage && sysMatch[2] !== '') {
            let tstamp = 0;
            if (fallbackDate) tstamp = getSafeTimestamp(fallbackDate, sysMatch[1]);
            currentMessage = {
                type: 'sys',
                time: sysMatch[1].padStart(5, '0'),
                text: sysMatch[2],
                date: fallbackDate || '',
                _timestamp: tstamp
            };
            messages.push(currentMessage);
            continue;
        }

        if (currentMessage) {
            currentMessage.text += '\n' + line;
        }
    }

    return { title, messages };
}

/**
 * Safari/Brave等でISO文字列が NaN になるのを防ぐため、数値引数による日付生成を徹底する
 */
function getSafeTimestamp(dateStr, timeStr) {
    if (!dateStr || !timeStr) return 0;
    const dParts = dateStr.split('/');
    const tParts = timeStr.split(':');
    const y = parseInt(dParts[0], 10);
    const mo = parseInt(dParts[1], 10) - 1; // 月は0始まり
    const d = parseInt(dParts[2], 10);
    const h = parseInt(tParts[0], 10);
    const m = parseInt(tParts[1] || '0', 10);
    const dt = new Date(y, mo, d, h, m, 0);
    return isNaN(dt.getTime()) ? 0 : dt.getTime();
}
