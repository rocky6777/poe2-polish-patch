// Proves the .datc64 writer round-trips WITHOUT needing oo2core:
// read German ClientStrings -> patch Text only -> re-read -> verify.
import { loadSchema, ValidFor, POE2_LANG_PATH } from '../src/schema.mjs';
import { patchTable, readScalarStrings } from '../src/datWriter.mjs';
import { makeLoader } from '../src/loader.mjs';

const STEAM = 'D:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2';
const TABLE = 'ClientStrings';

const schema = await loadSchema();
const loader = await makeLoader(STEAM);
const orig = await loader.getFileContents(`${POE2_LANG_PATH.German}/${TABLE}.datc64`);
console.log(`Loaded German ${TABLE}.datc64: ${orig.length} bytes`);

const before = readScalarStrings(orig, TABLE, schema, ValidFor.PoE2);

// Fake translator: only "Text"; skip empty + [DNT]; change length + add Polish glyphs.
const fake = (s, ctx) => {
  if (ctx.column !== 'Text') return null;
  if (!s || s.startsWith('[DNT]')) return null;
  return 'PL[' + s + ']ąłżźćńęóś';
};

const { bytes, stats } = patchTable(orig, TABLE, schema, ValidFor.PoE2, fake);
const after = readScalarStrings(bytes, TABLE, schema, ValidFor.PoE2);

let fails = 0;
const assert = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); fails++; } };

assert(after.Text.length === before.Text.length, 'row count preserved');
assert(JSON.stringify(after.Id) === JSON.stringify(before.Id), 'Id column byte-identical (untouched)');

let translated = 0, skipped = 0, lenChanged = 0;
for (let i = 0; i < before.Text.length; i++) {
  const s = before.Text[i];
  if (!s || s.startsWith('[DNT]')) {
    assert(after.Text[i] === s, `untranslated preserved @${i}`);
    skipped++;
  } else {
    const expect = 'PL[' + s + ']ąłżźćńęóś';
    assert(after.Text[i] === expect, `translated @${i}: got ${JSON.stringify(after.Text[i])}`);
    if (expect.length !== s.length) lenChanged++;
    translated++;
  }
}

// Spot-check a placeholder string survived intact inside the translation.
const ph = before.Text.findIndex((s) => s && s.includes('{0}') && !s.startsWith('[DNT]'));
if (ph >= 0) assert(after.Text[ph].includes('{0}'), 'placeholder {0} preserved');

console.log(`rows=${stats.rows} translated=${translated} skipped(DNT/empty)=${skipped} lenChanged=${lenChanged} changedFields=${stats.changed}`);
console.log(fails ? `\n❌ ${fails} assertion failure(s)` : '\n✅ ROUND-TRIP PASS — writer produces valid .datc64');
process.exit(fails ? 1 : 0);
