import * as fs from 'fs/promises';
import * as path from 'path';
import { collectCsdStrings } from '../src/csd.mjs';
import { valueIsNonText } from '../src/translatable.mjs';

const SRCBAK_CSD = path.join(import.meta.dirname, '..', 'out', 'source-en', 'Data', 'StatDescriptions');
const needles = process.argv.slice(2);
const files = (await fs.readdir(SRCBAK_CSD)).filter((f) => f.endsWith('.csd'));
const cache = JSON.parse(await fs.readFile(new URL('../.cache/translations.pl.json', import.meta.url), 'utf8'));

for (const f of files) {
  const strings = collectCsdStrings(await fs.readFile(path.join(SRCBAK_CSD, f)));
  for (const s of strings) {
    if (needles.some((n) => s.includes(n))) {
      const skip = valueIsNonText(s);
      const pl = cache[s];
      console.log(`[${f}] ${JSON.stringify(s)}`);
      console.log(`    nonText=${skip}  cache=${pl ? JSON.stringify(pl) : 'MISSING'}`);
    }
  }
}
