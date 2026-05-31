// End-to-end builder: extract German -> translate (cached) -> write patched
// .datc64 into out/staging/Data/Balance/German/<table>.datc64.
//
// Modes:
//   node src/build.mjs            # SCOPE only: measure tables/strings/chars, no network, no writes
//   node src/build.mjs --run      # full: translate (free Google, cached) + write staging files
//   node src/build.mjs --run --tables ClientStrings,Quest   # subset (good for first real test)
//   node src/build.mjs --run --limit 20                     # first N candidate tables
//
// The staging output is applied to the game by the separate C# tool (needs oo2core).
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadSchema, ValidFor, POE2_LANG_PATH } from './schema.mjs';
import { patchTable, readScalarStrings } from './datWriter.mjs';
import { translateMany } from './translate.mjs';
import { shouldTranslate } from './translatable.mjs';
import { pullLatest } from './remote.mjs';
import { makeLoader } from './loader.mjs';

const STEAM = process.env.POE2_DIR || 'D:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2';
// Source = English base locale (Data/Balance/*.datc64). We overwrite these, so
// the player selects "English" in-game and sees Polish. en->pl is higher quality
// than de->pl, and the English base files are never marker-contaminated.
const SRC_PATH = POE2_LANG_PATH.English; // 'Data/Balance'
const SRC_LANG = 'en';
const STAGE = path.join(import.meta.dirname, '..', 'out', 'staging', 'Data', 'Balance');
// Pristine snapshot of the original English files. We translate FROM this, never
// from the live game (which we overwrite). Keeps re-runs idempotent: reading the
// source from the locale we patch would otherwise feed our own Polish back in.
const SRCBAK = path.join(import.meta.dirname, '..', 'out', 'source-en', 'Data', 'Balance');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const RUN = has('--run');
const OFFLINE = has('--offline'); // end-user mode: apply shipped cache, no Google calls
const UPDATE = has('--update');   // pull latest translations from the GitHub repo first
const LIMIT = val('--limit') ? Number(val('--limit')) : Infinity;
const ONLY = val('--tables')?.split(',').map((s) => s.trim());

// Resolve the PRISTINE English source for a table, immune to our own patching.
// If the live file equals our last staged output, the game currently holds our
// patch -> use the saved backup as source. Otherwise the live file is pristine
// (first run, or freshly overwritten by a Steam update) -> refresh the backup.
async function pristineSource(loader, name) {
  const live = await loader.tryGetFileContents(`${SRC_PATH}/${name}.datc64`);
  if (!live) return null;
  const liveBuf = Buffer.from(live);
  const bakPath = path.join(SRCBAK, `${name}.datc64`);
  let prevStage = null;
  try { prevStage = await fs.readFile(path.join(STAGE, `${name}.datc64`)); } catch {}
  if (prevStage && prevStage.equals(liveBuf)) {
    // Live is our own patch -> the pristine English is in the backup.
    try { return { source: await fs.readFile(bakPath), live: liveBuf }; } catch { /* no backup */ }
  }
  // Live is pristine (first run / freshly Steam-updated) -> (re)snapshot it.
  await fs.mkdir(SRCBAK, { recursive: true });
  await fs.writeFile(bakPath, liveBuf);
  return { source: liveBuf, live: liveBuf };
}

async function main() {
  if (UPDATE) {
    const r = await pullLatest();
    const msg = {
      updated: `Updated translations from GitHub -> v${r.version} (${r.count?.toLocaleString?.() ?? r.count} strings)`,
      current: `Translations up to date (v${r.version}).`,
      offline: 'Could not reach update server; using bundled translations.',
      disabled: 'Auto-update not configured (edit patcher.config.json); using bundled translations.',
    }[r.status];
    console.log(msg);
  }

  const schema = await loadSchema();
  const loader = await makeLoader(STEAM);

  // Candidate tables: PoE2 schema rows with >=1 string column, deduped by name.
  const seen = new Set();
  let candidates = [];
  for (const t of schema.tables) {
    if (!(t.validFor & ValidFor.PoE2)) continue;
    if (seen.has(t.name)) continue;
    if (!t.columns.some((c) => c.type === 'string')) continue;
    seen.add(t.name);
    candidates.push(t.name);
  }
  if (ONLY) candidates = candidates.filter((n) => ONLY.includes(n));
  candidates = candidates.slice(0, LIMIT);
  candidates.sort();

  // PASS 1 — read every table's pristine source, collect unique strings globally.
  // Keep ALL readable tables (with their live bytes) so PASS 2 can also RESTORE
  // any table whose live copy drifted from the desired output (e.g. a value we
  // stopped translating after a fix).
  const sources = new Set();
  const present = []; // {name, source, live}
  let chars = 0;
  for (const name of candidates) {
    const ps = await pristineSource(loader, name);
    if (!ps) continue; // table has no English base file -> nothing to do
    let cols;
    try { cols = readScalarStrings(ps.source, name, schema, ValidFor.PoE2); }
    catch { continue; } // unreadable/incomplete schema -> skip safely
    for (const [col, values] of Object.entries(cols)) {
      for (const s of values) {
        if (!shouldTranslate(col, s)) continue;
        if (!sources.has(s)) { sources.add(s); chars += s.length; }
      }
    }
    present.push({ name, source: ps.source, live: ps.live });
  }

  console.log(`Candidate string tables:           ${candidates.length}`);
  console.log(`Readable tables:                    ${present.length}`);
  console.log(`Unique source strings (deduped):    ${sources.size.toLocaleString()}`);
  console.log(`Total characters to translate:      ${chars.toLocaleString()}`);

  if (!RUN) {
    console.log('\n(scope only) re-run with --run to translate + write staging files.');
    return;
  }

  // PASS 2 — translate the global set (cache makes re-runs cheap), then patch.
  console.log(`\nTranslating ${sources.size.toLocaleString()} unique strings (${SRC_LANG}->pl)…`);
  const t0 = Date.now();
  const map = await translateMany(sources, {
    concurrency: 5,
    sourceLang: SRC_LANG,
    offline: OFFLINE,
    onProgress: (d, total) => {
      if (d % 250 === 0 || d === total) {
        const rate = d / ((Date.now() - t0) / 1000 || 1);
        process.stdout.write(`\r  ${d}/${total} (${rate.toFixed(0)}/s)   `);
      }
    },
  });
  process.stdout.write('\n');

  await fs.mkdir(STAGE, { recursive: true });
  const translate = (s, ctx) => (shouldTranslate(ctx.column, s) ? map.get(s) ?? null : null);
  let written = 0, restored = 0, fields = 0;
  for (const { name, source, live } of present) {
    const res = patchTable(source, name, schema, ValidFor.PoE2, translate);
    if (!res) continue;
    // Stage whenever the desired bytes differ from what's live: covers new
    // translations AND restoring a table whose live copy is stale/corrupted.
    if (res.bytes.equals(live)) continue;
    await fs.writeFile(path.join(STAGE, `${name}.datc64`), res.bytes);
    written++; fields += res.stats.changed;
    if (res.stats.changed === 0) restored++; // differed only because live was stale
  }
  console.log(`\nStaged ${written} .datc64 files (${fields.toLocaleString()} translated fields; ${restored} pure restores) to:\n  ${STAGE}`);
  console.log('\nNext: apply with the C# tool (needs oo2core_9_win64.dll):');
  console.log('  ApplyPolish "<...>/Bundles2/_.index.bin"  out/staging');
}

main().catch((e) => { console.error(e); process.exit(1); });
