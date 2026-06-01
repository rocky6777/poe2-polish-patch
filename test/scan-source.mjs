// Verify the pristine English backup (out/source-en) isn't contaminated with
// our own Polish output. Mirrors build.mjs looksContaminated(), and specifically
// checks the requirement/attribute link strings the screenshot showed broken.
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'fs/promises';

const SRC = path.join(import.meta.dirname, '..', 'out', 'source-en');
const RE = /[A-Za-z]{2}[łąężźśćńŁĄĘŻŹŚĆŃ]|[łąężźśćńŁĄĘŻŹŚĆŃ][A-Za-z]{2}/g;
const PROBE = /\[(Dexterity|Strength|Intelligence|Evasion|Block|Quality)\b[^\]]*\]|\[(Zręczność|Siła|Inteligencja|Unik|Zablokuj|Jakość)\b[^\]]*\]/g;

let files = 0, contaminated = 0;
const hits = new Map(); // file -> sample contaminated runs
for await (const f of glob('**/*.{datc64,csd}', { cwd: SRC })) {
  const buf = await fs.readFile(path.join(SRC, f));
  const s = Buffer.from(buf).toString('utf16le');
  const m = s.match(RE) || [];
  files++;
  if (m.length > 30) { contaminated++; hits.set(f, m.slice(0, 8)); }
}
console.log(`Scanned ${files} source-en files; contaminated (>30 PL runs): ${contaminated}`);
for (const [f, samples] of hits) console.log(`  !! ${f}\n     ${samples.join('  ')}`);

// Probe ClientStrings specifically for the attribute/requirement link format.
const cs = path.join(SRC, 'Data', 'Balance', 'ClientStrings.datc64');
try {
  const s = Buffer.from(await fs.readFile(cs)).toString('utf16le');
  const found = [...s.matchAll(PROBE)].map((m) => m[0]);
  const uniq = [...new Set(found)].slice(0, 30);
  console.log(`\nClientStrings link probes (${found.length} hits, ${uniq.length} unique shown):`);
  for (const u of uniq) console.log(`   ${JSON.stringify(u)}`);
} catch (e) { console.log(`(could not probe ClientStrings: ${e.message})`); }
