// Find which table/column holds the scalar string "Mercenary" (and "Najemnik").
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSchema, ValidFor } from '../src/schema.mjs';
import { readScalarStrings } from '../src/datWriter.mjs';
import { shouldTranslate } from '../src/translatable.mjs';

const SRCBAK = path.join(import.meta.dirname, '..', 'out', 'source-en', 'Data', 'Balance');
const schema = await loadSchema();

const files = (await fs.readdir(SRCBAK)).filter((f) => f.endsWith('.datc64'));
const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['Mercenary'];

for (const f of files) {
  const name = f.replace(/\.datc64$/, '');
  let cols;
  try { cols = readScalarStrings(await fs.readFile(path.join(SRCBAK, f)), name, schema, ValidFor.PoE2); }
  catch { continue; }
  if (!cols) continue;
  for (const [col, values] of Object.entries(cols)) {
    values.forEach((v, row) => {
      if (targets.some((t) => v === t)) {
        console.log(`${name}.${col}[${row}] = ${JSON.stringify(v)}  shouldTranslate=${shouldTranslate(col, v)}`);
      }
    });
  }
}
