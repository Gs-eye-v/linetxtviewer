const fs = require('fs');
const content = fs.readFileSync('app.js', 'utf8');
const lines = content.split('\n');

let state = 'normal';
let lastOpenLine = 0;
let lastOpenChar = '';

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (state === 'normal') {
            if (char === "'" || char === '"' || char === '`') {
                state = char;
                lastOpenLine = i + 1;
                lastOpenChar = char;
            }
        } else if (state === lastOpenChar) {
            if (char === lastOpenChar && line[j-1] !== '\\') {
                state = 'normal';
            }
        }
    }
}

if (state !== 'normal') {
    console.log(`Error: Found unclosed ${state === '`' ? 'backtick' : 'quote (' + state + ')'} which was opened at line ${lastOpenLine}`);
} else {
    console.log("No unclosed quotes or backticks found.");
}
