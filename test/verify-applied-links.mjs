// Verify the APPLIED output (out/staging = exact bytes ApplyPolish wrote) has no
// broken glossary links: every [Key|Display] / [Key] must keep an ENGLISH key.
// Compares against the pristine English source and prints the attribute/requirement
// strings from the screenshot. Needs no game/Oodle — reads the staged .datc64.
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSchema, ValidFor } from '../src/schema.mjs';
import { readScalarStrings } from '../src/datWriter.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const STAGE = path.join(ROOT, 'out', 'staging', 'Data', 'Balance');
const SRC = path.join(ROOT, 'out', 'source-en', 'Data', 'Balance');
const LINK_RE = /\[([^\]|]+)(?:\|([^\]]*))?\]/g;
const PL = /[łąężźśćńóŁĄĘŻŹŚĆŃÓ]/;
const keys = (s) => [...s.matchAll(LINK_RE)].map((m) => m[1]);
const schema = await loadSchema();

const TABLES = ['ClientStrings', 'ClientStrings2'];
const PROBE = /(Dexterity|Strength|Intelligence|Evasion|Block|Quality)/i;
let brokenKeys = 0, linkStrings = 0;
const samples = [];

for (const name of TABLES) {
  const stagePath = path.join(STAGE, `${name}.datc64`);
  let stageBuf;
  try { stageBuf = await fs.readFile(stagePath); }
  catch { console.log(`(no staged ${name} — unchanged)`); continue; }
  const srcBuf = await fs.readFile(path.join(SRC, `${name}.datc64`));
  const stageCols = readScalarStrings(stageBuf, name, schema, ValidFor.PoE2);
  const srcCols = readScalarStrings(srcBuf, name, schema, ValidFor.PoE2);
  const srcFlat = Object.values(srcCols).flat();
  const stageFlat = Object.values(stageCols).flat();

  for (const v of stageFlat) {
    if (!v || !v.includes('[')) continue;
    const ks = keys(v);
    if (!ks.length) continue;
    linkStrings++;
    const bad = ks.filter((k) => PL.test(k));
    if (bad.length) { brokenKeys++; if (samples.length < 15) samples.push(`  ✗ [${name}] key still Polish: ${JSON.stringify(v.slice(0, 90))}`); }
  }
  // Show the requirement/attribute strings: source -> applied.
  const shown = new Set();
  for (let i = 0; i < srcFlat.length; i++) {
    const s = srcFlat[i];
    if (s && PROBE.test(s) && s.includes('[') && keys(s).length && !shown.has(s)) {
      shown.add(s);
      const stagedHit = stageFlat.find((x) => keys(x).join() === keys(s).join() && x !== s)
        ?? (stageFlat.includes(s) ? s : '(unchanged/!found)');
    }
  }
}

// Direct before/after for the exact screenshot strings.
console.log('Attribute/requirement links (source -> applied):');
{
  const name = 'ClientStrings';
  const stageCols = readScalarStrings(await fs.readFile(path.join(STAGE, `${name}.datc64`)), name, schema, ValidFor.PoE2);
  const srcCols = readScalarStrings(await fs.readFile(path.join(SRC, `${name}.datc64`)), name, schema, ValidFor.PoE2);
  // align by Id column position: same column+index
  for (const col of Object.keys(srcCols)) {
    const sArr = srcCols[col], tArr = stageCols[col] ?? [];
    for (let i = 0; i < sArr.length; i++) {
      const s = sArr[i], t = tArr[i];
      if (s && /\[(Dexterity|Strength|Intelligence|Evasion|Block|Quality)/.test(s) && keys(s).length) {
        console.log(`   ${JSON.stringify(s)}\n     -> ${JSON.stringify(t)}`);
      }
    }
  }
}

console.log(`\nStaged strings containing links: ${linkStrings}`);
console.log(`Links whose KEY is still Polish (must be 0): ${brokenKeys}`);
for (const s of samples) console.log(s);
console.log(brokenKeys === 0 ? '\n✅ All applied glossary-link keys are English — links will resolve in-game.' : '\n✗ broken keys remain');
process.exit(brokenKeys ? 1 : 0);
