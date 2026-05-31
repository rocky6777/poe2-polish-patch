// For every PoE2 string column, find DESCRIPTOR-like values (bonus text such as
// "10% increased ...") that shouldTranslate() currently REJECTS, and report the
// exact rule that rejects each one. This shows which skill/passive descriptors
// are being left in English and why.
import { loadSchema, ValidFor, POE2_LANG_PATH } from '../src/schema.mjs';
import { readScalarStrings } from '../src/datWriter.mjs';
import { makeLoader } from '../src/loader.mjs';
import {
  shouldTranslate, looksLikeReference, looksLikeIdentifier, looksLikeScript,
} from '../src/translatable.mjs';

const STEAM = process.env.POE2_DIR;
const loader = await makeLoader(STEAM);
const schema = await loadSchema();
const SRC = POE2_LANG_PATH.English;

// Why does shouldTranslate reject (col,val)? Mirror its order.
const SKIP_COLUMNS = new Set(['Id']);
const SKIP_COLUMN_RE = /script|^id$|path|filename|directory|reference|expression|command/i;
function reason(col, v) {
  if (!v) return 'empty';
  if (v.startsWith('[DNT]')) return 'DNT';
  if (SKIP_COLUMNS.has(col)) return 'col=Id';
  if (SKIP_COLUMN_RE.test(col)) return `col~/${SKIP_COLUMN_RE.source}/ (${col})`;
  if (looksLikeReference(v)) return 'looksLikeReference';
  if (looksLikeIdentifier(v)) return 'looksLikeIdentifier';
  if (looksLikeScript(v)) return 'looksLikeScript';
  return null; // not rejected
}

// "Descriptor-like" = reads like a stat/bonus line a player sees.
const DESC = /(\d+%|\bincreased\b|\breduced\b|\bmore\b|\bless\b|\badditional\b|\[[A-Za-z][^\]]*\])/;

const seen = new Set();
const candidates = [];
for (const t of schema.tables) {
  if (!(t.validFor & ValidFor.PoE2)) continue;
  if (seen.has(t.name)) continue;
  if (!t.columns.some((c) => c.type === 'string')) continue;
  seen.add(t.name); candidates.push(t.name);
}

const byReason = new Map();           // reason -> count
const byTableCol = new Map();         // "table.col" -> {count, samples[]}
let scanned = 0;

for (const name of candidates) {
  const buf = await loader.tryGetFileContents(`${SRC}/${name}.datc64`);
  if (!buf) continue;
  let cols;
  try { cols = readScalarStrings(Buffer.from(buf), name, schema, ValidFor.PoE2); }
  catch { continue; }
  for (const [col, values] of Object.entries(cols)) {
    for (const v of values) {
      if (!v || !DESC.test(v)) continue;          // only descriptor-like text
      scanned++;
      const r = reason(col, v);
      if (!r) continue;                            // it WOULD be translated -> fine
      byReason.set(r.split(' ')[0], (byReason.get(r.split(' ')[0]) || 0) + 1);
      const key = `${name}.${col}`;
      const e = byTableCol.get(key) || { count: 0, reason: r, samples: [] };
      e.count++;
      if (e.samples.length < 3) e.samples.push(v.slice(0, 120));
      byTableCol.set(key, e);
    }
  }
}

console.log(`\nDescriptor-like values scanned: ${scanned}`);
console.log('\nRejected descriptor-like values, grouped by rule:');
for (const [r, c] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${c.toString().padStart(6)}  ${r}`);

console.log('\nTop table.column sources of REJECTED descriptors:');
const rows = [...byTableCol.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 25);
for (const [k, e] of rows) {
  console.log(`\n  ${k}  (${e.count})  reason: ${e.reason}`);
  for (const s of e.samples) console.log(`      ${JSON.stringify(s)}`);
}
