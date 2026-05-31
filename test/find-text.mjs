// Search every datc64 string value AND every csd display string for needles,
// reporting where it lives, whether we'd translate it, and cache status.
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSchema, ValidFor } from '../src/schema.mjs';
import { readScalarStrings } from '../src/datWriter.mjs';
import { shouldTranslate, valueIsNonText } from '../src/translatable.mjs';
import { collectCsdStrings } from '../src/csd.mjs';

const BAL = path.join(import.meta.dirname, '..', 'out', 'source-en', 'Data', 'Balance');
const CSD = path.join(import.meta.dirname, '..', 'out', 'source-en', 'Data', 'StatDescriptions');
const schema = await loadSchema();
const cache = JSON.parse(await fs.readFile(new URL('../.cache/translations.pl.json', import.meta.url), 'utf8'));
const needles = process.argv.slice(2).map((s) => s.toLowerCase());
const hit = (v) => needles.every((n) => v.toLowerCase().includes(n));

let n = 0;
for (const f of (await fs.readdir(BAL)).filter((x) => x.endsWith('.datc64'))) {
  const name = f.replace(/\.datc64$/, '');
  let cols; try { cols = readScalarStrings(await fs.readFile(path.join(BAL, f)), name, schema, ValidFor.PoE2); } catch { continue; }
  for (const [col, vs] of Object.entries(cols)) for (const v of vs) {
    if (v && hit(v) && n++ < 60) {
      console.log(`[dat ${name}.${col}] translate=${shouldTranslate(col, v, name)} cache=${cache[v] ? 'yes' : 'MISSING'}  ${JSON.stringify(v.slice(0, 100))}`);
    }
  }
}
for (const f of (await fs.readdir(CSD)).filter((x) => x.endsWith('.csd'))) {
  for (const s of collectCsdStrings(await fs.readFile(path.join(CSD, f)))) {
    if (hit(s) && n++ < 80) {
      console.log(`[csd ${f}] nonText=${valueIsNonText(s)} cache=${cache[s] ? 'yes' : 'MISSING'}  ${JSON.stringify(s.slice(0, 100))}`);
    }
  }
}
console.log(`\ntotal hits: ${n}`);
