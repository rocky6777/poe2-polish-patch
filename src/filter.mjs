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
//
// Two value-spaces, because different filter rules match different tables:
//   item  -> BaseType / Class   match BaseItemTypes.Name / ItemClasses.Name
//   mod   -> HasExplicitMod / HasImplicitMod  match Mods.Name (affix names like
//            "Hellion's"). IMPORTANT: a mod value with no in-game match makes the
//            WHOLE filter fail to load ("No mods found matching ..."), so these
//            must be translated too once Mods.Name is in Polish.
const DICT_TABLES = {
  item: [['BaseItemTypes', 'Name'], ['ItemClasses', 'Name']],
  mod: [['Mods', 'Name']],
};
// filter keyword (lower-cased) -> which dictionary its quoted values use.
const KEYWORD_GROUP = {
  basetype: 'item', class: 'item',
  hasexplicitmod: 'mod', hasimplicitmod: 'mod', hasmod: 'mod',
};

// Build en->pl maps for the filterable columns from the pristine English tables +
// the translation cache. Only includes entries whose in-game value actually
// CHANGED (skipped/identity columns keep English, so the filter keeps English too).
// Returns { item: Map, mod: Map }.
export async function buildFilterDict({ srcBalanceDir, cache, schema } = {}) {
  schema ??= await loadSchema();
  const out = {};
  for (const [group, tables] of Object.entries(DICT_TABLES)) {
    const dict = new Map();
    for (const [table, col] of tables) {
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
    out[group] = dict;
  }
  return out;
}

// A condition line starts (after indentation) with one of these keywords.
const VALUE_KEYWORDS = /^(\s*)(BaseType|Class|HasExplicitMod|HasImplicitMod|HasMod)(\b[^\S\r\n]*(?:==|!=|<=|>=|=|<|>)?[^\S\r\n]*)(.*)$/;
const QUOTED = /"([^"]*)"/g;

// Translate one filter's text using { item, mod } dictionaries. Returns
// { text, stats:{ lines, values, translated, misses, modMisses } } where misses is
// the set of untranslated values (left as-is); modMisses is the subset on mod rules
// — those are the dangerous ones (a non-matching mod value fails the whole filter).
export function translateFilter(text, dicts) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const misses = [], modMisses = [];
  let touchedLines = 0, values = 0, translated = 0;

  const out = lines.map((line) => {
    const m = VALUE_KEYWORDS.exec(line);
    if (!m) return line;
    const [, indent, keyword, op, rest] = m;
    const group = KEYWORD_GROUP[keyword.toLowerCase()];
    const dict = dicts[group];
    let changed = false;
    const newRest = rest.replace(QUOTED, (whole, val) => {
      values++;
      const pl = dict?.get(val);
      if (pl) { translated++; changed = true; return `"${pl}"`; }
      misses.push(val);
      if (group === 'mod') modMisses.push(val);
      return whole; // leave untranslated value verbatim
    });
    if (changed) touchedLines++;
    return `${indent}${keyword}${op}${newRest}`;
  });

  return {
    text: out.join(eol),
    stats: {
      lines: touchedLines, values, translated,
      misses: [...new Set(misses)], modMisses: [...new Set(modMisses)],
    },
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
  const dicts = await buildFilterDict({ srcBalanceDir, cache });
  const src = await fs.readFile(input, 'utf8');
  const { text, stats } = translateFilter(src, dicts);
  const dest = output || input.replace(/(\.filter)?$/i, '.pl.filter');
  await fs.writeFile(dest, text, 'utf8');
  console.log(`Dictionary: ${dicts.item.size} item + ${dicts.mod.size} mod entries`);
  console.log(`Rewrote ${stats.translated}/${stats.values} values across ${stats.lines} lines -> ${dest}`);
  if (stats.misses.length) {
    console.log(`\n${stats.misses.length} value(s) had no Polish match (left English — usually partial/substring rules):`);
    for (const v of stats.misses.slice(0, 40)) console.log('   ', JSON.stringify(v));
    if (stats.misses.length > 40) console.log(`   … +${stats.misses.length - 40} more`);
  }
  if (stats.modMisses.length) {
    console.log(`\nWARNING: ${stats.modMisses.length} mod-rule value(s) left English. If any is NOT a substring of a Polish affix, the game rejects the WHOLE filter ("No mods found matching …"). Review these:`);
    for (const v of stats.modMisses) console.log('   ', JSON.stringify(v));
  }
}
