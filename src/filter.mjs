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

// The in-game value of an English string after patching: its Polish translation
// if we translated that column, else the unchanged English.
const inGameValue = (cache, col, table, en) =>
  (shouldTranslate(col, en, table) && cache[en]) ? cache[en] : en;

// Build, from the pristine English tables + the translation cache:
//   item / mod : en->pl Maps of CHANGED full names (for rewriting filter values)
//   itemFrag   : en->pl Map for PARTIAL base-type rules — n-gram fragments of base
//                names (e.g. "Essence" -> "Esencja") whose translation still
//                substring-matches a Polish base, so `BaseType "Essence"` keeps working
//   itemNames  : full SET of valid in-game base/class names (for == validation)
//   modNames   : full LIST of valid in-game mod names (for substring validation)
// The name sets are what the game actually holds, so we can drop any filter value
// that matches nothing — those otherwise make the WHOLE filter fail to load
// ("No base types found exactly matching ..." / "No mods found matching ...").
export async function buildFilterDict({ srcBalanceDir, cache, schema } = {}) {
  schema ??= await loadSchema();
  const out = { itemNames: new Set(), modNames: new Set() };
  const enItemNames = [];
  for (const [group, tables] of Object.entries(DICT_TABLES)) {
    const dict = new Map();
    const nameSet = group === 'item' ? out.itemNames : out.modNames;
    for (const [table, col] of tables) {
      let buf;
      try { buf = readFileSync(path.join(srcBalanceDir, table + '.datc64')); }
      catch { continue; }
      const cols = readScalarStrings(buf, table, schema, ValidFor.PoE2);
      for (const en of cols[col]) {
        if (!en) continue;
        const ig = inGameValue(cache, col, table, en);
        nameSet.add(ig);
        if (group === 'item') enItemNames.push(en);
        if (!dict.has(en) && ig !== en) dict.set(en, ig); // changed -> translation entry
      }
    }
    out[group] = dict;
  }
  out.modNames = [...out.modNames]; // list, for substring scans

  // Fragment dict for partial (non-==) BaseType/Class rules: 1..3-word n-grams of
  // base names, translated via the general cache, kept only when the Polish form
  // still appears inside some in-game base name. >=3 chars avoids noise words.
  const itemNamesArr = [...out.itemNames];
  const frag = new Map();
  const seen = new Set();
  for (const en of enItemNames) {
    const w = en.split(/\s+/);
    for (let i = 0; i < w.length; i++) {
      for (let n = 1; n <= 3 && i + n <= w.length; n++) {
        const g = w.slice(i, i + n).join(' ');
        if (g.length < 3 || seen.has(g)) continue;
        seen.add(g);
        const pl = cache[g];
        if (pl && pl !== g && !out.item.has(g) && itemNamesArr.some((nm) => nm.includes(pl))) frag.set(g, pl);
      }
    }
  }
  out.itemFrag = frag;
  return out;
}

// A condition line starts (after indentation) with one of these keywords; the
// op group captures any comparison operator (== marks an EXACT-match rule).
const VALUE_KEYWORDS = /^(\s*)(BaseType|Class|HasExplicitMod|HasImplicitMod|HasMod)(\b[^\S\r\n]*(?:==|!=|<=|>=|=|<|>)?[^\S\r\n]*)(.*)$/;
const QUOTED = /"([^"]*)"/g;

// Resolve a quoted filter value to the form that matches in-game, or report it as
// unmatchable. The game fails the WHOLE filter on ANY value matching nothing —
// partial (non-==) rules included — so unmatchable values must be dropped.
//   item ==   : must EXACTLY equal a base/class name (translate full name)
//   item (no =): substring of some base/class name; try as-is, then full-name,
//                then a fragment translation ("Essence" -> "Esencja")
//   mod        : substring of some mod name (translate full affix)
// Returns { out, ok }: out is the value to emit, ok=false means drop it.
function resolveValue(group, exact, val, dicts) {
  if (group === 'mod') {
    const cand = dicts.mod.get(val) ?? val;
    return { out: cand, ok: dicts.modNames.some((n) => n.includes(cand)) };
  }
  if (exact) {
    const cand = dicts.item.get(val) ?? val;
    return { out: cand, ok: dicts.itemNames.has(cand) };
  }
  // non-exact item: prefer the value that already matches.
  for (const n of dicts.itemNames) if (n.includes(val)) return { out: val, ok: true };
  const cand = dicts.item.get(val) ?? dicts.itemFrag.get(val);
  if (cand) for (const n of dicts.itemNames) if (n.includes(cand)) return { out: cand, ok: true };
  return { out: val, ok: false };
}

// Translate one filter into Polish AND make it load cleanly: each BaseType /
// Class / Has*Mod value is rewritten to its in-game Polish name, and any value
// that matches nothing in-game is DROPPED (those otherwise fail the whole filter).
// A rule whose values are all dropped is commented out so the file still parses.
export function translateFilter(text, dicts) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  let touchedLines = 0, values = 0, translated = 0;
  const dropped = [], commented = [];

  const out = lines.map((line) => {
    const m = VALUE_KEYWORDS.exec(line);
    if (!m) return line;
    const [, indent, keyword, op, rest] = m;
    const group = KEYWORD_GROUP[keyword.toLowerCase()];
    const exact = /==/.test(op);
    let changed = false, kept = 0;

    const newRest = rest.replace(QUOTED, (whole, val) => {
      values++;
      const { out: pl, ok } = resolveValue(group, exact, val, dicts);
      if (!ok) { dropped.push(val); changed = true; return ''; } // unmatchable -> remove
      if (pl !== val) { translated++; changed = true; }
      kept++;
      return `"${pl}"`;
    }).replace(/[^\S\r\n]{2,}/g, ' ').replace(/[^\S\r\n]+$/, ''); // tidy gaps from removals

    if (kept === 0) {
      // No values survive -> the rule would error ("missing/!match"). Comment it.
      commented.push(line.trim());
      return `${indent}# [pl] removed (no in-game match): ${line.trim()}`;
    }
    if (changed) touchedLines++;
    return `${indent}${keyword}${op}${newRest}`;
  });

  return {
    text: out.join(eol),
    stats: {
      lines: touchedLines, values, translated,
      dropped: [...new Set(dropped)], commented,
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
  console.log(`Dictionary: ${dicts.item.size} item + ${dicts.mod.size} mod + ${dicts.itemFrag.size} fragment entries`);
  console.log(`Rewrote ${stats.translated}/${stats.values} values across ${stats.lines} lines -> ${dest}`);
  if (stats.dropped.length) {
    console.log(`\nDropped ${stats.dropped.length} value(s) that match nothing in-game (would otherwise fail the whole filter):`);
    for (const v of stats.dropped.slice(0, 40)) console.log('   ', JSON.stringify(v));
    if (stats.dropped.length > 40) console.log(`   … +${stats.dropped.length - 40} more`);
  }
  if (stats.commented.length) {
    console.log(`\nCommented out ${stats.commented.length} rule line(s) left with no valid values (the block still loads):`);
    for (const v of stats.commented.slice(0, 20)) console.log('   ', v);
  }
}
