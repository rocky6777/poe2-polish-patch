// Comprehensive: across ALL tables, every value we intend to KEEP ENGLISH
// (per shouldTranslate: scripts, paths, identifiers, ids, references) must be
// present verbatim in the LIVE game. Any missing one = still-corrupted.
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSchema, ValidFor, POE2_LANG_PATH } from '../src/schema.mjs';
import { readScalarStrings } from '../src/datWriter.mjs';
import { shouldTranslate } from '../src/translatable.mjs';
import { makeLoader } from '../src/loader.mjs';

const schema = await loadSchema();
const loader = await makeLoader(process.env.POE2_DIR);
const bakDir = path.join(import.meta.dirname, '..', 'out', 'source-en', 'Data', 'Balance');
const files = (await fs.readdir(bakDir)).filter((f) => f.endsWith('.datc64'));

let tablesChecked = 0, mismatches = 0;
const examples = [];
for (const file of files) {
  const name = file.slice(0, -7);
  let srcCols, liveCols;
  try {
    srcCols = readScalarStrings(await fs.readFile(path.join(bakDir, file)), name, schema, ValidFor.PoE2);
    liveCols = readScalarStrings(await loader.getFileContents(`${POE2_LANG_PATH.English}/${name}.datc64`), name, schema, ValidFor.PoE2);
  } catch { continue; }
  tablesChecked++;
  const liveSet = new Set(Object.values(liveCols).flat());
  for (const [col, vals] of Object.entries(srcCols)) {
    for (const v of vals) {
      if (v && !shouldTranslate(col, v) && !liveSet.has(v)) {
        mismatches++;
        if (examples.length < 12) examples.push(`${name}.${col}: ${JSON.stringify(v.slice(0, 80))}`);
      }
    }
  }
}
console.log(`tables checked: ${tablesChecked}`);
console.log(`non-text values still translated in live (should be 0): ${mismatches}`);
for (const e of examples) console.log('  ✗', e);
console.log(mismatches === 0 ? '\n✅ All non-text (scripts/paths/ids) are English in the live game.' : '\n✗ still-broken above');
