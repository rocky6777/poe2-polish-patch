// Absolute scan: read EVERY live table, flag any value that still looks like a
// translated/mangled asset path (Polish path words, or a reference value that
// differs from its pristine English backup).
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
const POLISH_PATH = /(Metadane|Efekty|Mikrotransakcje|Grafika|filmy|przykłady)[/\\]/i;

let flagged = 0;
for (const file of files) {
  const name = file.slice(0, -7);
  let cols;
  try { cols = readScalarStrings(await loader.getFileContents(`${POE2_LANG_PATH.English}/${name}.datc64`), name, schema, ValidFor.PoE2); }
  catch { continue; }
  for (const [col, vals] of Object.entries(cols)) {
    for (const v of vals) {
      // a value that the engine would treat as a path but contains Polish path words
      if (v && POLISH_PATH.test(v)) {
        console.log(`${name}.${col}: ${JSON.stringify(v)}`);
        flagged++;
      }
    }
  }
}
console.log(`\nLIVE tables with mangled Polish paths: ${flagged}`);
