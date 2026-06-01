// Maintainer STEP 1 — scan the translation cache for entries that break in-game
// glossary links (a translated/Polish [Key|…] the engine can't resolve, so the
// client prints raw "[…]" markup), and purge them so the next rebuild
// re-translates them correctly with the key kept English.
//
// rebuild.ps1 runs this first, and translate.mjs/publish.mjs self-heal with the
// same rule — this script just makes the fix visible and fast (no network).
//
//   node src/clean-cache.mjs            # report + purge (rewrites the cache)
//   node src/clean-cache.mjs --dry-run  # report only, don't modify the cache
import * as fs from 'fs/promises';
import * as path from 'path';
import { cacheEntryHealthy } from './translate.mjs';

const CACHE = path.join(import.meta.dirname, '..', '.cache', 'translations.pl.json');
const dry = process.argv.includes('--dry-run');

let obj;
try { obj = JSON.parse(await fs.readFile(CACHE, 'utf-8')); }
catch (e) { console.error(`No cache to scan (${e.message}).`); process.exit(0); }

const entries = Object.entries(obj);
const good = {};
const bad = [];
for (const [s, v] of entries) {
  if (cacheEntryHealthy(s, v)) good[s] = v;
  else bad.push([s, v]);
}

console.log(`Cache entries:    ${entries.length.toLocaleString()}`);
console.log(`Healthy (kept):   ${Object.keys(good).length.toLocaleString()}`);
console.log(`Broken (purge):   ${bad.length.toLocaleString()}`);
for (const [s, v] of bad.slice(0, 20)) console.log(`  - ${JSON.stringify(s)} => ${JSON.stringify(v)}`);
if (bad.length > 20) console.log(`  … and ${(bad.length - 20).toLocaleString()} more`);

if (!bad.length) { console.log('\nCache is clean — nothing to purge.'); process.exit(0); }
if (dry) { console.log('\n(dry run — cache not modified)'); process.exit(0); }

await fs.writeFile(CACHE, JSON.stringify(good));
console.log(`\nPurged ${bad.length.toLocaleString()} entries. They'll be re-translated on the next rebuild (keys stay English).`);
