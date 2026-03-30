function parseLineChat(text, fileSizeKB = 0) {
    const lines = text.split(/\r?\n/);
    let title = "Talk History";
    let messages = [];
    let currentMessage = null;
    let fallbackDate = null;
    let firstDate = null;
    let lastDate = null;

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
            fallbackDate = line.trim();
            const rawDate = dateMatch[1];
            if (!firstDate) firstDate = rawDate;
            lastDate = rawDate;
            
            messages.push({ type: 'date', text: fallbackDate, date: rawDate });
            currentMessage = null;
            continue;
        }

        const msgMatch = line.match(msgRegexTab);
        if (msgMatch) {
            currentMessage = {
                type: 'msg',
                time: msgMatch[1],
                sender: msgMatch[2].replace(/"/g, ''),
                text: msgMatch[3],
                date: fallbackDate ? fallbackDate.split('(')[0] : ''
            };
            messages.push(currentMessage);
            continue;
        }

        const sysMatch = line.match(sysRegexTab);
        if (sysMatch && !currentMessage && sysMatch[2] !== '') {
            currentMessage = {
                type: 'sys',
                time: sysMatch[1],
                text: sysMatch[2],
                date: fallbackDate ? fallbackDate.split('(')[0] : ''
            };
            messages.push(currentMessage);
            continue;
        }

        if (currentMessage) {
            currentMessage.text += '\n' + line;
        }
    }

    const lastMsgNode = messages.slice().reverse().find(m => m.type === 'msg' || m.type === 'sys');
    const lastMessageText = lastMsgNode ? (lastMsgNode.sender ? `${lastMsgNode.sender}: ${lastMsgNode.text}` : lastMsgNode.text) : "";

    return {
        title: title,
        lastMessageText: lastMessageText.replace(/\n/g, ' '),
        date: lastDate,
        firstDate: firstDate || '',
        lastDate: lastDate || '',
        sizeKB: fileSizeKB,
        messages: messages
    };
}
