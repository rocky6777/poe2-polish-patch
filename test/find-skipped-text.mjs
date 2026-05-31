// Find sentence-like display text that we SKIP only because of a column-name rule
// (not because the value is a ref/id/script). Those are candidate missed translations.
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSchema, ValidFor } from '../src/schema.mjs';
import { readScalarStrings } from '../src/datWriter.mjs';
import { shouldTranslate, looksLikeReference, looksLikeIdentifier, looksLikeScript } from '../src/translatable.mjs';

const BAL = path.join(import.meta.dirname, '..', 'out', 'source-en', 'Data', 'Balance');
const schema = await loadSchema();
const sentence = (v) => /[A-Za-z]\s+[A-Za-z]/.test(v) && /[a-z]/.test(v) && v.length > 15 && !/[/\\]/.test(v);

const byCol = {};
for (const f of (await fs.readdir(BAL)).filter((x) => x.endsWith('.datc64'))) {
  const name = f.replace(/\.datc64$/, '');
  let cols; try { cols = readScalarStrings(await fs.readFile(path.join(BAL, f)), name, schema, ValidFor.PoE2); } catch { continue; }
  for (const [col, vs] of Object.entries(cols)) for (const v of vs) {
    if (!v || !sentence(v)) continue;
    if (shouldTranslate(col, v, name)) continue;                 // already translated
    if (looksLikeReference(v) || looksLikeIdentifier(v) || looksLikeScript(v)) continue; // legit non-text
    const key = `${name}.${col}`;
    (byCol[key] = byCol[key] || []).push(v);
  }
}
const keys = Object.keys(byCol).sort((a, b) => byCol[b].length - byCol[a].length);
console.log('columns with sentence-like text skipped by COLUMN-NAME rule:', keys.length);
for (const k of keys) console.log(`  ${k} (${byCol[k].length})  e.g. ${JSON.stringify(byCol[k][0].slice(0, 80))}`);
