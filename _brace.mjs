import { readFileSync } from 'node:fs';
const lines = readFileSync('backend/src/db/pgStore.ts', 'utf8').split(/\r?\n/);
let depth = 0;
let inT = false;
const opens = []; // {line, text} for each depth 1->2 transition
for (let i = 0; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '`') inT = !inT;
    else if (!inT) {
      if (ch === '{') {
        if (depth <= 1) opens.push({ line: i + 1, text: lines[i].trim(), closed: false, d: depth });
        depth++;
      } else if (ch === '}') {
        depth--;
        if (opens.length && opens[opens.length - 1].d === depth) opens[opens.length - 1].closed = true;
      }
    }
  }
}
console.log('final depth=' + depth);
for (const o of opens) if (!o.closed) console.log('NEVER-CLOSED line ' + o.line + ': ' + o.text);