// Dump several COMPLETE description blocks to learn every line shape.
import { makeLoader } from '../src/loader.mjs';
const loader = await makeLoader(process.env.POE2_DIR);
const bytes = await loader.getFileContents('Data/StatDescriptions/stat_descriptions.csd');
const text = Buffer.from(bytes).toString('utf16le');
const lines = text.split('\r\n');

// Print the first 6 description blocks (default block only: up to first `lang`).
let blocks = 0, i = 0;
while (i < lines.length && blocks < 6) {
  if (lines[i].replace(/^﻿/, '') === 'description') {
    console.log(`\n--- block ${blocks} (line ${i}) ---`);
    let j = i + 1;
    // print until next `description` or after we've shown the default + 1 lang header
    let sawLang = 0;
    while (j < lines.length && lines[j] !== 'description') {
      const raw = lines[j];
      console.log(JSON.stringify(raw));
      if (/^\tlang /.test(raw)) { sawLang++; if (sawLang >= 1) { console.log('   …(lang blocks omitted)…'); break; } }
      j++;
    }
    blocks++;
    // advance to next description
    while (j < lines.length && lines[j] !== 'description') j++;
    i = j;
  } else i++;
}

// Also surface a few lines that have a function AFTER the quote, and reminder strings.
console.log('\n=== sample lines with trailing functions / extra quotes ===');
let shown = 0;
for (const l of lines) {
  if (shown >= 8) break;
  const m = l.match(/"\s*\S/g);
  if (/"\s+\w/.test(l) && /\t\t/.test(l) && /[a-z_]+\s*$/.test(l.trim())) { console.log(JSON.stringify(l)); shown++; }
}
