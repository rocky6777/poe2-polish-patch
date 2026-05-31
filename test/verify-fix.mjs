// Confirm identifier strings reverted to English in LIVE bundles, display stays Polish.
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSchema, ValidFor, POE2_LANG_PATH } from '../src/schema.mjs';
import { readScalarStrings } from '../src/datWriter.mjs';
import { makeLoader } from '../src/loader.mjs';

const STEAM = process.env.POE2_DIR;
const schema = await loadSchema();
const loader = await makeLoader(STEAM);
const PROBE = ['negate', 'anger', 'fire_exposure', 'divide_by_one_hundred'];

// Find which tables contain these identifier values (scan pristine backups).
const bakDir = path.join(import.meta.dirname, '..', 'out', 'source-en', 'Data', 'Balance');
const files = await fs.readdir(bakDir);
const found = {};
for (const f of files) {
  if (!f.endsWith('.datc64')) continue;
  const name = f.slice(0, -7);
  let cols;
  try { cols = readScalarStrings(await fs.readFile(path.join(bakDir, f)), name, schema, ValidFor.PoE2); }
  catch { continue; }
  for (const vals of Object.values(cols)) {
    for (const probe of PROBE) {
      if (vals.includes(probe) && !found[probe]) found[probe] = name;
    }
  }
}
console.log('identifier -> table:', found);

// Read those tables from LIVE and confirm the identifier value is present verbatim (English).
for (const [probe, table] of Object.entries(found)) {
  const bytes = await loader.getFileContents(`${POE2_LANG_PATH.English}/${table}.datc64`);
  const cols = readScalarStrings(bytes, table, schema, ValidFor.PoE2);
  let present = false;
  for (const vals of Object.values(cols)) if (vals.includes(probe)) present = true;
  console.log(`  ${probe} in live ${table}: ${present ? 'ENGLISH (fixed ✓)' : 'MISSING — still translated ✗'}`);
}

// And confirm a display string is still Polish.
const cs = readScalarStrings(await loader.getFileContents(`${POE2_LANG_PATH.English}/ClientStrings.datc64`), 'ClientStrings', schema, ValidFor.PoE2);
console.log('  display check — Error =>', JSON.stringify(cs.Text[cs.Id.indexOf('Error')]));
