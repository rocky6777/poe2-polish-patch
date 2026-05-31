// Prove the fix: patch Characters from pristine English with the real cache map
// + production guard. Name/BaseClass must stay English; Description must be Polish.
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSchema, ValidFor } from '../src/schema.mjs';
import { patchTable, readScalarStrings } from '../src/datWriter.mjs';
import { shouldTranslate } from '../src/translatable.mjs';

const SRCBAK = path.join(import.meta.dirname, '..', 'out', 'source-en', 'Data', 'Balance');
const schema = await loadSchema();
const cache = JSON.parse(await fs.readFile(new URL('../.cache/translations.pl.json', import.meta.url), 'utf8'));

const src = await fs.readFile(path.join(SRCBAK, 'Characters.datc64'));
const translate = (s, ctx) => (shouldTranslate(ctx.column, s, ctx.table) ? cache[s] ?? null : null);
const res = patchTable(src, 'Characters', schema, ValidFor.PoE2, translate);
const out = readScalarStrings(res.bytes, 'Characters', schema, ValidFor.PoE2);

const names = out.Name;
const baseClass = out.BaseClass;
console.log('changed fields:', res.stats.changed);
console.log('Name[9]      =', JSON.stringify(names[9]), names[9] === 'Mercenary' ? 'OK (English)' : 'FAIL');
console.log('BaseClass[9] =', JSON.stringify(baseClass[9]), baseClass[9] === 'Duelist' ? 'OK (English)' : 'FAIL');
console.log('all Names    =', JSON.stringify(names));
console.log('Description[9] starts:', JSON.stringify(out.Description[9].slice(0, 40)));
const allEnglishNames = names.every((n, i) => n === readScalarStrings(src, 'Characters', schema, ValidFor.PoE2).Name[i]);
console.log('\nall class Names unchanged from source:', allEnglishNames ? 'OK' : 'FAIL');
