// Find the table holding the blood_howl microtransaction path and compare
// the pristine backup vs the LIVE game — detect contaminated backups too.
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSchema, ValidFor, POE2_LANG_PATH } from '../src/schema.mjs';
import { readScalarStrings } from '../src/datWriter.mjs';
import { looksLikeReference } from '../src/translatable.mjs';
import { makeLoader } from '../src/loader.mjs';

const schema = await loadSchema();
const loader = await makeLoader(process.env.POE2_DIR);
const bakDir = path.join(import.meta.dirname, '..', 'out', 'source-en', 'Data', 'Balance');
const files = (await fs.readdir(bakDir)).filter((f) => f.endsWith('.datc64'));
const NEEDLE = /blood_howl|Mikrotransakcje|Metadane|Microtransactions\/char_level/i;

for (const file of files) {
  const name = file.slice(0, -7);
  let bakCols;
  try { bakCols = readScalarStrings(await fs.readFile(path.join(bakDir, file)), name, schema, ValidFor.PoE2); }
  catch { continue; }
  const hits = [];
  for (const [col, vals] of Object.entries(bakCols)) for (const v of vals) if (v && NEEDLE.test(v)) hits.push([col, v]);
  if (!hits.length) continue;

  const liveCols = readScalarStrings(await loader.getFileContents(`${POE2_LANG_PATH.English}/${name}.datc64`), name, schema, ValidFor.PoE2);
  const liveVals = new Set(Object.values(liveCols).flat());
  console.log(`\nTABLE ${name}:`);
  for (const [col, v] of hits.slice(0, 6)) {
    console.log(`  backup[${col}] = ${JSON.stringify(v)}`);
    console.log(`     backup pristine? ${/Metadane|Efekty|Mikrotransakcje/.test(v) ? 'NO — CONTAMINATED ✗' : 'yes (English)'} | reference-filtered? ${looksLikeReference(v)}`);
    console.log(`     present verbatim in live? ${liveVals.has(v)}`);
  }
}
console.log('\ndone');
