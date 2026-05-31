// Fast, no-network mechanics test: stage German ClientStrings with a visible
// Polish-diacritic marker on every (non-DNT) UI string. Lets us validate the
// Oodle repack, bundle acceptance, AND glyph rendering in one in-game check.
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSchema, ValidFor, POE2_LANG_PATH } from '../src/schema.mjs';
import { patchTable } from '../src/datWriter.mjs';
import { shouldTranslate } from '../src/translatable.mjs';
import { makeLoader } from '../src/loader.mjs';

const STEAM = process.env.POE2_DIR || 'D:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2';
const STAGE = path.join(import.meta.dirname, '..', 'out', 'staging', 'Data', 'Balance', 'German');
const TABLE = 'ClientStrings';

const schema = await loadSchema();
const loader = await makeLoader(STEAM);
const bytes = await loader.getFileContents(`${POE2_LANG_PATH.German}/${TABLE}.datc64`);

// Prefix marker uses every Polish-only glyph so a glance reveals missing ones.
// Same filter as the real pipeline -> never touches Id/reference columns.
const marker = (s, ctx) => (shouldTranslate(ctx.column, s) ? `ŻŁĄ▸${s}` : null);

const res = patchTable(bytes, TABLE, schema, ValidFor.PoE2, marker);
await fs.mkdir(STAGE, { recursive: true });
await fs.writeFile(path.join(STAGE, `${TABLE}.datc64`), res.bytes);
console.log(`Staged ${TABLE}: ${res.stats.changed}/${res.stats.rows} rows marked -> ${path.join(STAGE, TABLE + '.datc64')}`);
