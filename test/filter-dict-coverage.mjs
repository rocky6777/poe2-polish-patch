// Build the authoritative en->pl dictionary for the two columns loot filters
// match against (BaseItemTypes.Name, ItemClasses.Name) using the SAME cache we
// apply to the game, and report coverage. This is the basis of the .filter converter.
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSchema, ValidFor } from '../src/schema.mjs';
import { readScalarStrings } from '../src/datWriter.mjs';
import { shouldTranslate } from '../src/translatable.mjs';

const SRCBAK = path.join(import.meta.dirname, '..', 'out', 'source-en', 'Data', 'Balance');
const schema = await loadSchema();
const cache = JSON.parse(await fs.readFile(new URL('../.cache/translations.pl.json', import.meta.url), 'utf8'));

function dictFor(table, col) {
  const buf = fsReadSync(path.join(SRCBAK, table + '.datc64'));
  const cols = readScalarStrings(buf, table, schema, ValidFor.PoE2);
  const out = new Map();
  let translated = 0, kept = 0;
  for (const en of cols[col]) {
    if (!en) continue;
    const willTranslate = shouldTranslate(col, en, table);
    const pl = willTranslate ? cache[en] : null;
    if (pl && pl !== en) { out.set(en, pl); translated++; }
    else { out.set(en, en); kept++; } // not translated in-game -> filter keeps English
  }
  return { out, translated, kept };
}
import { readFileSync } from 'fs';
function fsReadSync(p) { return readFileSync(p); }

for (const [t, c] of [['BaseItemTypes', 'Name'], ['ItemClasses', 'Name']]) {
  const { out, translated, kept } = dictFor(t, c);
  console.log(`\n${t}.${c}: ${out.size} entries — ${translated} translated, ${kept} kept-English`);
  let n = 0;
  for (const [en, pl] of out) { if (en !== pl && n++ < 8) console.log(`   ${JSON.stringify(en)} -> ${JSON.stringify(pl)}`); }
}
