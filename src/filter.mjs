// Loot-filter localizer: rewrite a PoE2 .filter's BaseType / Class string values
// into the EXACT Polish we wrote into the game, so filtering works after the patch.
//
// Why this is needed: the patch overwrites the English locale with Polish, and the
// client's filter engine matches `BaseType "..."` / `Class "..."` against the loaded
// (now-Polish) BaseItemTypes.Name / ItemClasses.Name (the `PrecalcBaseTypeHashMap`
// is keyed by those loaded strings). An English filter therefore matches nothing.
// We translate each quoted BaseType/Class value with the SAME en->pl cache used to
// patch those tables, guaranteeing a byte-exact match in-game. All other lines
// (colours, sounds, ItemLevel, Rarity, Sockets, comments, Show/Hide …) are
// untouched — they are language-independent.
import * as fs from 'fs/promises';
import { readFileSync } from 'fs';
import * as path from 'path';
import { loadSchema, ValidFor } from './schema.mjs';
import { readScalarStrings } from './datWriter.mjs';
import { shouldTranslate } from './translatable.mjs';

// Tables/columns the filter engine matches against (see binary symbols
// ItemFilter::LoadFilterFromString / PrecalcBaseTypeHashMap).
const FILTER_TABLES = [
  ['BaseItemTypes', 'Name'],
  ['ItemClasses', 'Name'],
];

// Build the en->pl map for filterable columns from the pristine English tables +
// the translation cache. Only includes entries whose in-game value actually
// CHANGED (skipped/identity columns keep English, so the filter keeps English too).
export async function buildFilterDict({ srcBalanceDir, cache, schema } = {}) {
  schema ??= await loadSchema();
  const dict = new Map();
  for (const [table, col] of FILTER_TABLES) {
    let buf;
    try { buf = readFileSync(path.join(srcBalanceDir, table + '.datc64')); }
    catch { continue; }
    const cols = readScalarStrings(buf, table, schema, ValidFor.PoE2);
    for (const en of cols[col]) {
      if (!en || dict.has(en)) continue;
      if (!shouldTranslate(col, en, table)) continue; // kept English in-game
      const pl = cache[en];
      if (pl && pl !== en) dict.set(en, pl);
    }
  }
  return dict;
}

// A condition line starts (after indentation) with one of these keywords.
const VALUE_KEYWORDS = /^(\s*)(BaseType|Class)(\b[^\S\r\n]*(?:==|!=|<=|>=|=|<|>)?[^\S\r\n]*)(.*)$/;
const QUOTED = /"([^"]*)"/g;

// Translate one filter's text. Returns { text, stats:{ lines, values, translated, misses } }
// where misses is the list of quoted values with no dictionary entry (left as-is).
export function translateFilter(text, dict) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const misses = [];
  let touchedLines = 0, values = 0, translated = 0;

  const out = lines.map((line) => {
    const m = VALUE_KEYWORDS.exec(line);
    if (!m) return line;
    const [, indent, keyword, op, rest] = m;
    let changed = false;
    const newRest = rest.replace(QUOTED, (whole, val) => {
      values++;
      const pl = dict.get(val);
      if (pl) { translated++; changed = true; return `"${pl}"`; }
      misses.push(val);
      return whole; // leave untranslated value verbatim
    });
    if (changed) touchedLines++;
    return `${indent}${keyword}${op}${newRest}`;
  });

  return {
    text: out.join(eol),
    stats: { lines: touchedLines, values, translated, misses: [...new Set(misses)] },
  };
}

// ---- CLI: node src/filter.mjs <input.filter> [output.filter] ----
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('filter.mjs')) {
  const [input, output] = process.argv.slice(2);
  if (!input) {
    console.error('Usage: node src/filter.mjs <input.filter> [output.filter]');
    process.exit(2);
  }
  const cachePath = new URL('../.cache/translations.pl.json', import.meta.url);
  const srcBalanceDir = path.join(import.meta.dirname, '..', 'out', 'source-en', 'Data', 'Balance');
  const cache = JSON.parse(await fs.readFile(cachePath, 'utf8'));
  const dict = await buildFilterDict({ srcBalanceDir, cache });
  const src = await fs.readFile(input, 'utf8');
  const { text, stats } = translateFilter(src, dict);
  const dest = output || input.replace(/(\.filter)?$/i, '.pl.filter');
  await fs.writeFile(dest, text, 'utf8');
  console.log(`Dictionary: ${dict.size} BaseType/Class entries`);
  console.log(`Rewrote ${stats.translated}/${stats.values} values across ${stats.lines} lines -> ${dest}`);
  if (stats.misses.length) {
    console.log(`\n${stats.misses.length} value(s) had no Polish match (left English — may be partial/substring rules):`);
    for (const v of stats.misses.slice(0, 40)) console.log('   ', JSON.stringify(v));
    if (stats.misses.length > 40) console.log(`   … +${stats.misses.length - 40} more`);
  }
}
