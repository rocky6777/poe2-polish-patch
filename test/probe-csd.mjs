// Inspect the stat-description file format so we can translate the descriptor text.
import { makeLoader } from '../src/loader.mjs';
const loader = await makeLoader(process.env.POE2_DIR);

for (const p of ['Data/StatDescriptions/stat_descriptions.csd',
                 'Data/StatDescriptions/skill_stat_descriptions.csd']) {
  let bytes;
  try { bytes = await loader.getFileContents(p); } catch (e) { console.log(p, 'MISSING', e.message); continue; }
  console.log(`\n===== ${p} (${bytes.length} bytes) =====`);
  console.log('first 16 bytes hex:', Buffer.from(bytes.subarray(0, 16)).toString('hex'));
  // Try UTF-16LE (PoE text files are usually UTF-16LE)
  const u16 = Buffer.from(bytes).toString('utf16le');
  console.log('--- as UTF-16LE (first 700 chars) ---');
  console.log(JSON.stringify(u16.slice(0, 700)));
}
