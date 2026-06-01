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
import { fileURLToPath } from 'url';
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
// filter keyword (lower-cased) -> which match space its quoted values use. base and
// class are SEPARATE spaces (BaseType matches only base-type names, Class only class
// names), so they must not be conflated — see buildFilterDict / resolveValue.
const KEYWORD_GROUP = {
  basetype: 'base', class: 'class',
  hasexplicitmod: 'mod', hasimplicitmod: 'mod', hasmod: 'mod',
};

// The game folds capital "Ł" (U+0141) to lowercase "ł" (U+0142) because its font
// has no glyph for the capital (see build.mjs). Filter values are matched against
// those folded in-game names, so every name/value we compare or emit must be folded
// the same way. English keys contain no "Ł", so this is a no-op for them; and it is
// idempotent, so callers that already fold their cache (build.mjs) are unaffected.
export const foldL = (s) => (s == null ? s : s.replaceAll('Ł', 'ł'));

// The in-game value of an English string after patching: its Polish translation
// if we translated that column, else the unchanged English. Folded like the game.
const inGameValue = (cache, col, table, en) =>
  foldL((shouldTranslate(col, en, table) && cache[en]) ? cache[en] : en);

// Build, from the pristine English tables + the translation cache:
//   item / mod : en->pl Maps of CHANGED full names (for rewriting filter values)
//   itemAll    : en->pl Map of ALL item base/class names (for substring-rule EXPANSION)
//   itemFrag   : en->pl Map for PARTIAL base-type rules — n-gram fragments of base
//                names (e.g. "Essence" -> "Esencja") whose translation still
//                substring-matches a Polish base, so `BaseType "Essence"` keeps working
//   baseNames  : SET of valid in-game base-type names (BaseItemTypes.Name)
//   classNames : SET of valid in-game class names    (ItemClasses.Name)
//   modNames   : full LIST of valid in-game mod names (for substring validation)
// baseNames and classNames are kept APART because the game matches a BaseType rule
// only against base-type names and a Class rule only against class names. Conflating
// them lets a class name whose English contains a base fragment (e.g. base "Uncut
// Spirit Gem" is a substring of class "Uncut Spirit Gems") leak into a BaseType
// expansion; matching no base type in-game, it fails the WHOLE filter. The name sets
// are what the game actually holds, so we can drop any filter value that matches
// nothing ("No base types found ..." / "No mods found matching ...").
export async function buildFilterDict({ srcBalanceDir, cache, schema } = {}) {
  schema ??= await loadSchema();
  const out = {
    baseNames: new Set(), classNames: new Set(), modNames: new Set(), itemAll: new Map(),
  };
  // which in-game name set each item-group table feeds (BaseType vs Class match space)
  const tableSet = { BaseItemTypes: out.baseNames, ItemClasses: out.classNames };
  const enItemNames = [];
  for (const [group, tables] of Object.entries(DICT_TABLES)) {
    const dict = new Map();
    for (const [table, col] of tables) {
      let buf;
      try { buf = readFileSync(path.join(srcBalanceDir, table + '.datc64')); }
      catch { continue; }
      const cols = readScalarStrings(buf, table, schema, ValidFor.PoE2);
      const nameSet = group === 'item' ? tableSet[table] : out.modNames;
      for (const en of cols[col]) {
        if (!en) continue;
        const ig = inGameValue(cache, col, table, en);
        nameSet.add(ig);
        if (group === 'item') { enItemNames.push(en); out.itemAll.set(en, ig); } // en->in-game, for expansion
        if (!dict.has(en) && ig !== en) dict.set(en, ig); // changed -> translation entry
      }
    }
    out[group] = dict;
  }
  out.modNames = [...out.modNames]; // list, for substring scans

  // Fragment dict for partial (non-==) BaseType/Class rules: 1..3-word n-grams of
  // base names, translated via the general cache, kept only when the Polish form
  // still appears inside some in-game base/class name. >=3 chars avoids noise words.
  const itemNamesArr = [...out.baseNames, ...out.classNames];
  const frag = new Map();
  const seen = new Set();
  for (const en of enItemNames) {
    const w = en.split(/\s+/);
    for (let i = 0; i < w.length; i++) {
      for (let n = 1; n <= 3 && i + n <= w.length; n++) {
        const g = w.slice(i, i + n).join(' ');
        if (g.length < 3 || seen.has(g)) continue;
        seen.add(g);
        const pl = foldL(cache[g]);
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

// Resolve a quoted filter value to the in-game form(s) that match, or report it as
// unmatchable. The game fails the WHOLE filter on ANY value matching nothing —
// partial (non-==) rules included — so unmatchable values must be dropped.
//   item ==   : must EXACTLY equal a base/class name (translate full name)
//   item (no =): substring match. Polish base names rarely contain the English
//                fragment, and MT renders a base noun inconsistently across items
//                ("Targe" -> "Tarcza", "Rzeźbiona Tarcza", ...), so no single Polish
//                substring works. We instead EXPAND the rule into every in-game name
//                whose ENGLISH source contains the fragment — faithful to the original
//                English-substring intent and guaranteed to match.
//   mod        : substring of some mod name (translate full affix)
// Returns { values, ok }: values is the list to emit (one, or many when expanded);
// ok=false means drop it.
function resolveValue(group, exact, val, dicts) {
  if (group === 'mod') {
    const cand = dicts.mod.get(val) ?? val;
    return { values: [cand], ok: dicts.modNames.some((n) => n.includes(cand)) };
  }
  // base vs class: validate and expand ONLY against that rule's match space, so a
  // class name never satisfies a BaseType rule (or vice versa) — the game keeps them
  // separate and fails the whole filter on a value that matches nothing there.
  const names = group === 'class' ? dicts.classNames : dicts.baseNames;
  if (exact) {
    const cand = dicts.item.get(val) ?? val;
    return { values: [cand], ok: names.has(cand) };
  }
  // non-exact: 1) already a substring of some Polish name in this space -> keep.
  for (const n of names) if (n.includes(val)) return { values: [val], ok: true };
  // 2) expand: every in-game name in this space whose ENGLISH source contains the
  //    fragment (itemAll is base+class; gate on `names` to stay in the right space).
  const exp = [], seenPl = new Set();
  for (const [en, pl] of dicts.itemAll) if (en.includes(val) && names.has(pl) && !seenPl.has(pl)) { seenPl.add(pl); exp.push(pl); }
  if (exp.length) return { values: exp, ok: true };
  // 3) fallback: a fragment translation that still substring-matches some name here.
  const cand = dicts.item.get(val) ?? dicts.itemFrag.get(val);
  if (cand) for (const n of names) if (n.includes(cand)) return { values: [cand], ok: true };
  return { values: [], ok: false };
}

// Translate one filter into Polish AND make it load cleanly: each BaseType /
// Class / Has*Mod value is rewritten to its in-game Polish name(s) — a partial
// BaseType/Class rule may EXPAND into several exact base names — and any value that
// matches nothing in-game is DROPPED (those otherwise fail the whole filter).
// A rule whose values are all dropped is commented out so the file still parses.
export function translateFilter(text, dicts) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  let touchedLines = 0, values = 0, translated = 0, expanded = 0;
  const dropped = [], commented = [];

  const out = lines.map((line) => {
    const m = VALUE_KEYWORDS.exec(line);
    if (!m) return line;
    const [, indent, keyword, op, rest] = m;
    const group = KEYWORD_GROUP[keyword.toLowerCase()];
    const exact = /==/.test(op);
    let changed = false, kept = 0;
    const seenLine = new Set(); // dedupe names within this one rule line

    const newRest = rest.replace(QUOTED, (whole, rawVal) => {
      values++;
      const val = foldL(rawVal); // match the game's folded "ł" names
      const { values: pls, ok } = resolveValue(group, exact, val, dicts);
      if (!ok || !pls.length) { dropped.push(val); changed = true; return ''; } // unmatchable -> remove
      const emit = [];
      for (const pl of pls) if (!seenLine.has(pl)) { seenLine.add(pl); emit.push(`"${pl}"`); }
      if (pls.length > 1) { expanded++; changed = true; }   // one fragment -> many bases
      else if (pls[0] !== val) { translated++; changed = true; }
      kept += emit.length;
      return emit.join(' ');
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
      lines: touchedLines, values, translated, expanded,
      dropped: [...new Set(dropped)], commented,
    },
  };
}

// ---- CLI: node src/filter.mjs <input.filter> [output.filter] ----
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
  console.log(`Dictionary: ${dicts.item.size} item + ${dicts.mod.size} mod + ${dicts.itemFrag.size} fragment + ${dicts.itemAll.size} all-name entries`);
  console.log(`Rewrote ${stats.translated} value(s) + expanded ${stats.expanded} partial rule(s) of ${stats.values} values across ${stats.lines} lines -> ${dest}`);
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
