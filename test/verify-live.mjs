// Reads ClientStrings back out of the LIVE (now-patched) game bundles.
import { loadSchema, ValidFor, POE2_LANG_PATH } from '../src/schema.mjs';
import { readScalarStrings } from '../src/datWriter.mjs';
import { makeLoader } from '../src/loader.mjs';

const STEAM = process.env.POE2_DIR || 'D:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2';
const schema = await loadSchema();
const loader = await makeLoader(STEAM);
const bytes = await loader.getFileContents(`${POE2_LANG_PATH.English}/ClientStrings.datc64`);
const cols = readScalarStrings(bytes, 'ClientStrings', schema, ValidFor.PoE2);

const find = (id) => cols.Text[cols.Id.indexOf(id)];
console.log('Read back from LIVE game bundles (English base):');
console.log('  Id[0..3] (must stay clean keys):', JSON.stringify(cols.Id.slice(0, 4)));
console.log('  Error        ->', JSON.stringify(find('Error')));
console.log('  FatalError   ->', JSON.stringify(find('FatalError')));
console.log('  Exception    ->', JSON.stringify(find('Exception')));
