import { listDirFiles } from '../src/loader.mjs';
const STEAM = process.env.POE2_DIR || 'D:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2';
const list = await listDirFiles(STEAM, 'Data/StatDescriptions', '.csd');
console.log('enumerated', list.length, '.csd files:');
for (const f of list) console.log('  ', f);
