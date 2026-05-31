// Find (a) where "guard/chest" display text lives and whether it's translated,
// and (b) tables that are SKIPPED entirely (schema gaps) yet hold string columns.
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSchema, ValidFor, importHeaders } from '../src/schema.mjs';
import { readScalarStrings, patchTable } from '../src/datWriter.mjs';
import { shouldTranslate } from '../src/translatable.mjs';

const SRCBAK = path.join(import.meta.dirname, '..', 'out', 'source-en', 'Data', 'Balance');
const schema = await loadSchema();
const cache = JSON.parse(await fs.readFile(new URL('../.cache/translations.pl.json', import.meta.url), 'utf8'));
const needles = process.argv.slice(2);

const files = (await fs.readdir(SRCBAK)).filter((f) => f.endsWith('.datc64'));
const skippedReadable = []; // table has string cols but patchTable would return null
let matchCount = 0;

for (const f of files) {
  const name = f.replace(/\.datc64$/, '');
  const buf = await fs.readFile(path.join(SRCBAK, f));
  // Does this table get patched at all? patchTable returns null on schema mismatch.
  let patchable = false;
  try { patchable = !!patchTable(buf, name, schema, ValidFor.PoE2, () => null); } catch { patchable = false; }

  let cols;
  try { cols = readScalarStrings(buf, name, schema, ValidFor.PoE2); } catch { cols = null; }
  if (!cols) {
    // Unreadable: can't even list strings. Note if schema row exists with string cols.
    const sch = schema.tables.find((s) => s.name === name && (s.validFor & ValidFor.PoE2));
    if (sch && sch.columns.some((c) => c.type === 'string')) skippedReadable.push(`${name} (unreadable)`);
    continue;
  }
  if (!patchable) {
    const hasText = Object.entries(cols).some(([col, vs]) => vs.some((v) => shouldTranslate(col, v, name)));
    if (hasText) skippedReadable.push(`${name} (schema-mismatch, NOT patched)`);
  }
  if (needles.length) {
    for (const [col, vs] of Object.entries(cols)) {
      vs.forEach((v) => {
        if (v && needles.some((n) => v.toLowerCase().includes(n.toLowerCase())) && shouldTranslate(col, v, name)) {
          if (matchCount++ < 40) {
            const pl = cache[v];
            console.log(`[${name}.${col}] ${JSON.stringify(v.slice(0, 90))}`);
            console.log(`     patched=${patchable} cache=${pl ? 'yes' : 'MISSING'}`);
          }
        }
      });
    }
  }
}
console.log(`\n=== tables with display text that are NOT patched (schema gaps) ===`);
for (const s of skippedReadable) console.log('  ', s);
