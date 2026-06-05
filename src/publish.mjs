// Maintainer tool: prepare the translations repo contents from the local cache.
// Writes translations.pl.json.gz + manifest.json (+ README) into translations-repo/,
// bumping the manifest version each time. Then you git push that repo.
//
//   node src/publish.mjs
import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { cacheEntryHealthy, preserveEdges } from './translate.mjs';

const gzip = promisify(zlib.gzip);
const ROOT = path.join(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache', 'translations.pl.json');
const REPO = path.join(ROOT, 'translations-repo');

// Never ship link-breaking / contaminated entries to players, even if publish is
// run without a rebuild first. Same rule translate.mjs self-heals with; we also
// rewrite the on-disk cache so it stays clean.
const raw = JSON.parse(await fs.readFile(CACHE, 'utf-8'));
// Drop link-breaking/contaminated entries AND restore MT-trimmed edge whitespace
// (structural for rare-name fragments / UI prefixes) so neither ships to players.
const cleaned = {};
let repaired = 0;
for (const [s, v] of Object.entries(raw)) {
  if (!cacheEntryHealthy(s, v)) continue;
  const e = preserveEdges(s, v);
  if (e !== v) repaired++;
  cleaned[s] = e;
}
const dropped = Object.keys(raw).length - Object.keys(cleaned).length;
if (dropped || repaired) {
  if (dropped) console.warn(`Purged ${dropped.toLocaleString()} broken/contaminated cache entries before publishing.`);
  if (repaired) console.warn(`Restored edge whitespace on ${repaired.toLocaleString()} cache entries before publishing.`);
  await fs.writeFile(CACHE, JSON.stringify(cleaned));
}
const json = JSON.stringify(cleaned);
const count = Object.keys(cleaned).length;
await fs.mkdir(REPO, { recursive: true });

const gz = await gzip(Buffer.from(json, 'utf-8'), { level: 9 });
const gzPath = path.join(REPO, 'translations.pl.json.gz');
const manifestPath = path.join(REPO, 'manifest.json');

// Read the currently-published version (if any).
let prevVersion = 0, prevManifestOk = false;
try {
  prevVersion = Number(JSON.parse(await fs.readFile(manifestPath, 'utf-8')).version) || 0;
  prevManifestOk = true;
} catch {}

// gzip is deterministic, so a byte-identical gz means the translations did not
// change since the last publish. Bumping the version anyway would force every
// up-to-date client to re-download the identical ~5 MB blob (remote.mjs gates
// purely on version), so an unchanged publish must be a true no-op: no version
// bump, no rewrite — nothing for git to commit.
let prevGz = null;
try { prevGz = await fs.readFile(gzPath); } catch {}
if (prevManifestOk && prevGz && prevGz.equals(gz)) {
  console.log(`No change: translations identical to published v${prevVersion} ` +
    `(${count.toLocaleString()} strings). Nothing to publish.`);
  process.exit(0);
}

// bump version (only reached when the gz actually changed)
const version = prevVersion + 1;
await fs.writeFile(gzPath, gz);
const manifest = { version, updated: new Date().toISOString().slice(0, 10), count };
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
await fs.writeFile(path.join(REPO, 'README.md'),
  `# PoE2 Polish translations (data)\n\n` +
  `Machine-translated English→Polish strings for the PoE2 Polish patcher.\n` +
  `The patcher auto-downloads these on each run.\n\n` +
  `- \`manifest.json\` — version/date/count\n` +
  `- \`translations.pl.json.gz\` — gzipped { english: polish } map\n\n` +
  `Current: **v${version}**, ${count.toLocaleString()} strings, ${manifest.updated}.\n`);

console.log(`translations-repo ready: v${version}, ${count.toLocaleString()} strings, ` +
  `${(gz.length / 1048576).toFixed(2)} MB gz`);
