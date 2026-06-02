// One-time bootstrap for out/applied-hashes.json — the per-file sha256 map that
// isOurPolish() uses as a positive override (see src/build.mjs). The map is empty
// until the first successful apply, so the FIRST rebuild after adopting the
// hash-override fix would still re-snapshot diacritic-free Polish (HideoutRarity:
// "Rzadki"/"Mityczne") into the "English" backup before the map can protect it.
// Seeding from the CURRENT live game closes that one-time gap.
//
// Rule: for every file we have a clean English backup for (out/source-en), if the
// LIVE bytes differ from that backup we applied Polish there -> record sha256(live).
// live == backup means we left it English (kept-English columns, or no change) and
// it correctly stays unrecorded.
//
// ASSUMPTION: your backups are CURRENT English (you rebuild after each patch) and
// live is your applied Polish, so live != backup reliably means "our Polish". If you
// skipped patches and a backup is stale, that table's English may have drifted —
// verify-integrity + delete out/source-en to refresh the backups first.
//
//   node src/seed-applied-hashes.mjs
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { makeLoader } from './loader.mjs';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex'); // matches build.mjs
const STEAM = process.env.POE2_DIR || 'D:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2';
const ROOT = path.join(import.meta.dirname, '..');
const APPLIED = path.join(ROOT, 'out', 'applied-hashes.json');

const loader = await makeLoader(STEAM);
const map = {};
let checked = 0, recorded = 0, missing = 0;

// gamePrefix mirrors the keys build.mjs writes (datGamePath / csdGamePath).
async function seedDir(bakDir, gamePrefix, ext) {
  let files;
  try { files = (await fs.readdir(bakDir)).filter((f) => f.endsWith(ext)); }
  catch { return; } // no such backup dir -> nothing to seed here
  for (const f of files) {
    const gamePath = `${gamePrefix}/${f}`;
    const bak = await fs.readFile(path.join(bakDir, f));
    const live = await loader.tryGetFileContents(gamePath);
    checked++;
    if (!live) { missing++; continue; } // backed-up table no longer in the live game
    const liveBuf = Buffer.from(live);
    if (!liveBuf.equals(bak)) { map[gamePath] = sha256(liveBuf); recorded++; } // live != English => our Polish
  }
}

await seedDir(path.join(ROOT, 'out', 'source-en', 'Data', 'Balance'), 'Data/Balance', '.datc64');
await seedDir(path.join(ROOT, 'out', 'source-en', 'Data', 'StatDescriptions'), 'Data/StatDescriptions', '.csd');

await fs.mkdir(path.dirname(APPLIED), { recursive: true });
await fs.writeFile(APPLIED, JSON.stringify(map));
console.log(`Seeded ${APPLIED}`);
console.log(`  checked ${checked} backed-up files; recorded ${recorded} as our Polish (live != clean backup); ${missing} not in live game.`);
console.log(`  HideoutRarity (the diacritic-free case) recorded: ${'Data/Balance/HideoutRarity.datc64' in map}`);
