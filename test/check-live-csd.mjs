import * as fs from 'fs/promises';
import * as path from 'path';
import { makeLoader } from '../src/loader.mjs';
import { collectCsdStrings } from '../src/csd.mjs';
import { valueIsNonText } from '../src/translatable.mjs';

const STEAM = process.env.POE2_DIR || 'D:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2';
const loader = await makeLoader(STEAM);
const cache = JSON.parse(await fs.readFile(new URL('../.cache/translations.pl.json', import.meta.url), 'utf8'));
const SRC = path.join(import.meta.dirname, '..', 'out', 'source-en', 'Data', 'StatDescriptions');

for (const f of ['chest_stat_descriptions.csd']) {
  const srcStrings = [...collectCsdStrings(await fs.readFile(path.join(SRC, f)))].filter((s) => s && !valueIsNonText(s));
  const live = Buffer.from(await loader.tryGetFileContents(`Data/StatDescriptions/${f}`)).toString('utf16le');
  // pick a few display strings that DO have a Polish translation and check the live file shows the Polish
  let checked = 0, polishPresent = 0;
  for (const s of srcStrings) {
    const pl = cache[s];
    if (!pl || pl === s) continue;
    checked++;
    if (live.includes(pl)) polishPresent++;
    if (checked <= 5) console.log(`  EN ${JSON.stringify(s.slice(0, 55))}\n  PL ${JSON.stringify(pl.slice(0, 55))}  liveHasPolish=${live.includes(pl)}`);
    if (checked >= 20) break;
  }
  console.log(`${f}: of ${checked} sampled translated lines, ${polishPresent} present in LIVE file`);
}
