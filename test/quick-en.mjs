// Fast in-game test: translate the first N visible English UI strings to Polish
// and stage the English base ClientStrings. ~N/5 seconds. The rest stay English.
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSchema, ValidFor, POE2_LANG_PATH } from '../src/schema.mjs';
import { patchTable, readScalarStrings } from '../src/datWriter.mjs';
import { translateMany } from '../src/translate.mjs';
import { shouldTranslate } from '../src/translatable.mjs';
import { makeLoader } from '../src/loader.mjs';

const STEAM = process.env.POE2_DIR || 'D:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2';
const STAGE = path.join(import.meta.dirname, '..', 'out', 'staging', 'Data', 'Balance');
const TABLE = 'ClientStrings';
const N = Number(process.argv[2] || 400);

const schema = await loadSchema();
const loader = await makeLoader(STEAM);
const bytes = await loader.getFileContents(`${POE2_LANG_PATH.English}/${TABLE}.datc64`);

// Collect first N unique translatable English strings (in row order).
const cols = readScalarStrings(bytes, TABLE, schema, ValidFor.PoE2);
const picked = new Set();
for (const [col, values] of Object.entries(cols)) {
  for (const s of values) { if (shouldTranslate(col, s)) picked.add(s); if (picked.size >= N) break; }
  if (picked.size >= N) break;
}
console.log(`Translating ${picked.size} English UI strings -> Polish…`);
const map = await translateMany(picked, { sourceLang: 'en', concurrency: 5 });

// Patch only the picked strings; everything else stays English.
const translate = (s, ctx) => (shouldTranslate(ctx.column, s) && map.has(s) ? map.get(s) : null);
const res = patchTable(bytes, TABLE, schema, ValidFor.PoE2, translate);
await fs.mkdir(STAGE, { recursive: true });
await fs.writeFile(path.join(STAGE, `${TABLE}.datc64`), res.bytes);
console.log(`Staged ${TABLE}: ${res.stats.changed} strings translated -> ${path.join(STAGE, TABLE + '.datc64')}`);

// Show a few real samples.
const samples = [...picked].slice(0, 8).map((s) => `  ${JSON.stringify(s)} -> ${JSON.stringify(map.get(s))}`);
console.log('Samples:\n' + samples.join('\n'));
