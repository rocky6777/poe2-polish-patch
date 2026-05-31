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
import { shouldTranslate, valueIsNonText } from './translatable.mjs';
import { collectCsdStrings, patchCsd } from './csd.mjs';
import { buildFilterDict } from './filter.mjs';
import { pullLatest } from './remote.mjs';
import { makeLoader, listDirFiles } from './loader.mjs';

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
// Stat-description files (the blue stat lines on skill gems / passive nodes).
// These live in NO .datc64 table — they're translated by src/csd.mjs and staged
// under Data/StatDescriptions so ApplyPolish writes them into the same index.
const CSD_DIR = 'Data/StatDescriptions';
// Fallback list if directory enumeration fails. The build prefers the live list
// from listDirFiles() so newly-added content files (atlas, expedition, sanctum,
// tablet, flasks, …) are picked up automatically instead of staying English.
const CSD_FILES_FALLBACK = [
  'stat_descriptions.csd', 'skill_stat_descriptions.csd',
  'active_skill_gem_stat_descriptions.csd', 'passive_skill_stat_descriptions.csd',
  'map_stat_descriptions.csd', 'monster_stat_descriptions.csd',
  'atlas_stat_descriptions.csd', 'atlas_variant_stat_descriptions.csd',
  'gem_stat_descriptions.csd', 'meta_gem_stat_descriptions.csd',
  'advanced_mod_stat_descriptions.csd', 'chest_stat_descriptions.csd',
  'endgame_map_stat_descriptions.csd', 'map_temple_room_stat_descriptions.csd',
  'expedition_relic_stat_descriptions.csd', 'expedition_relic_special_stat_descriptions.csd',
  'sanctum_relic_stat_descriptions.csd', 'leaguestone_stat_descriptions.csd',
  'sentinel_stat_descriptions.csd', 'heist_equipment_stat_descriptions.csd',
  'primordial_altar_stat_descriptions.csd', 'tablet_stat_descriptions.csd',
  'utility_flask_buff_stat_descriptions.csd', 'passive_skill_aura_stat_descriptions.csd',
  'passive_skill_variant_stat_descriptions.csd',
  'character_panel_stat_descriptions.csd', 'character_panel_gamepad_stat_descriptions.csd',
];
const STAGE_CSD = path.join(import.meta.dirname, '..', 'out', 'staging', CSD_DIR);
const SRCBAK_CSD = path.join(import.meta.dirname, '..', 'out', 'source-en', CSD_DIR);

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const RUN = has('--run');
const OFFLINE = has('--offline'); // end-user mode: apply shipped cache, no Google calls
const UPDATE = has('--update');   // pull latest translations from the GitHub repo first
const LIMIT = val('--limit') ? Number(val('--limit')) : Infinity;
const ONLY = val('--tables')?.split(',').map((s) => s.trim());

// Polish-specific letters never occur in PoE's English base text, so finding a
// run of them means this "pristine" file is actually one of our own patches.
// Snapshotting such a file as the source feeds Polish back in as "English" and
// permanently breaks link keys ([Strength|Strength] -> [Siła|Siła]), so we hard
// fail instead — the only clean recovery is restoring the originals.
//
// We require the Polish letter to sit INSIDE a Latin-letter run (a real word like
// "Siła"/"więcej"): the binary fixed-row section of a .datc64 (offsets, ints)
// decodes as UTF-16LE to stray code points that include isolated Polish-range
// chars, which would false-positive a naive per-character count.
function looksContaminated(buf) {
  const s = Buffer.from(buf).toString('utf16le');
  const re = /[A-Za-z]{2}[łąężźśćńŁĄĘŻŹŚĆŃ]|[łąężźśćńŁĄĘŻŹŚĆŃ][A-Za-z]{2}/g;
  return (s.match(re) || []).length > 30;
}
function contamination(file) {
  return new Error(
    `Source looks like an already-applied Polish patch, not pristine English:\n  ${file}\n` +
    `Restore the originals (Steam -> Path of Exile 2 -> Properties -> Installed Files ->\n` +
    `"Verify integrity of game files"), delete out/source-en, then re-run.`,
  );
}

// Resolve the PRISTINE English source for a bundled file, immune to our own
// patching. If the live file equals our last staged output, the game currently
// holds our patch -> use the saved backup as source. Otherwise the live file is
// pristine (first run, or freshly overwritten by a Steam update) -> snapshot it.
async function pristineFile(loader, gamePath, stagePath, bakPath) {
  const live = await loader.tryGetFileContents(gamePath);
  if (!live) return null;
  const liveBuf = Buffer.from(live);
  let prevStage = null;
  try { prevStage = await fs.readFile(stagePath); } catch {}
  if (prevStage && prevStage.equals(liveBuf)) {
    // Live is our own patch -> the pristine English is in the backup.
    let bak;
    try { bak = await fs.readFile(bakPath); } catch { bak = null; }
    if (bak) {
      if (looksContaminated(bak)) throw contamination(bakPath);
      return { source: bak, live: liveBuf };
    }
  }
  // Live is pristine (first run / freshly Steam-updated) -> (re)snapshot it.
  if (looksContaminated(liveBuf)) throw contamination(gamePath);
  await fs.mkdir(path.dirname(bakPath), { recursive: true });
  await fs.writeFile(bakPath, liveBuf);
  return { source: liveBuf, live: liveBuf };
}
const pristineSource = (loader, name) => pristineFile(
  loader, `${SRC_PATH}/${name}.datc64`,
  path.join(STAGE, `${name}.datc64`), path.join(SRCBAK, `${name}.datc64`),
);

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

  // Discover every stat-description .csd from the bundle index (fall back to the
  // known list if enumeration fails) so new content files don't stay English.
  let CSD_FILES;
  try {
    CSD_FILES = await listDirFiles(STEAM, CSD_DIR, '.csd');
    if (!CSD_FILES.length) throw new Error('empty');
  } catch (e) {
    console.warn(`(.csd enumeration failed: ${e.message}; using fallback list)`);
    CSD_FILES = CSD_FILES_FALLBACK;
  }

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
        if (!shouldTranslate(col, s, name)) continue;
        if (!sources.has(s)) { sources.add(s); chars += s.length; }
      }
    }
    present.push({ name, source: ps.source, live: ps.live });
  }

  // PASS 1b — stat-description (.csd) files: the blue skill/passive stat lines.
  // Same pristine-source handling; default-block display strings join the global
  // set so they share the cache and the link/markup protection in translate.mjs.
  const csdPresent = []; // {file, source, live}
  for (const f of CSD_FILES) {
    const ps = await pristineFile(loader, `${CSD_DIR}/${f}`, path.join(STAGE_CSD, f), path.join(SRCBAK_CSD, f));
    if (!ps) continue;
    for (const s of collectCsdStrings(ps.source)) {
      if (!s || valueIsNonText(s)) continue;
      if (!sources.has(s)) { sources.add(s); chars += s.length; }
    }
    csdPresent.push({ file: f, source: ps.source, live: ps.live });
  }

  console.log(`Candidate string tables:           ${candidates.length}`);
  console.log(`Readable tables:                    ${present.length}`);
  console.log(`Stat-description (.csd) files:      ${csdPresent.length}`);
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
  const translate = (s, ctx) => (shouldTranslate(ctx.column, s, ctx.table) ? map.get(s) ?? null : null);
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

  // PASS 2b — patch + stage the .csd files. valueIsNonText mirrors PASS 1b so we
  // never feed a non-text display string to the (link/markup-aware) translator.
  const csdTranslate = (s) => (valueIsNonText(s) ? null : map.get(s) ?? null);
  let csdWritten = 0, csdLines = 0;
  for (const { file, source, live } of csdPresent) {
    const res = patchCsd(source, csdTranslate);
    if (res.bytes.equals(live)) continue;
    await fs.mkdir(STAGE_CSD, { recursive: true });
    await fs.writeFile(path.join(STAGE_CSD, file), res.bytes);
    csdWritten++; csdLines += res.stats.changed;
  }
  console.log(`Staged ${csdWritten} .csd files (${csdLines.toLocaleString()} stat lines) to:\n  ${STAGE_CSD}`);

  // PASS 2c — emit the loot-filter dictionary (en->pl for the BaseType/Class
  // columns the filter engine matches). Shipped alongside the patch so players
  // can localize their own .filter; see src/filter.mjs and enduser/Translate-Filter.ps1.
  const fdict = await buildFilterDict({ srcBalanceDir: SRCBAK, cache: Object.fromEntries(map), schema });
  const fdictPath = path.join(import.meta.dirname, '..', 'out', 'filter-dict.pl.json');
  await fs.writeFile(fdictPath, JSON.stringify({
    item: [...fdict.item.entries()], mod: [...fdict.mod.entries()],
    itemFrag: [...fdict.itemFrag.entries()],
    itemNames: [...fdict.itemNames], modNames: fdict.modNames,
  }));
  console.log(`Wrote loot-filter dictionary (${fdict.item.size.toLocaleString()} item + ${fdict.mod.size.toLocaleString()} mod + ${fdict.itemFrag.size.toLocaleString()} fragment entries; ${fdict.itemNames.size.toLocaleString()} base/class + ${fdict.modNames.length.toLocaleString()} mod names) to:\n  ${fdictPath}`);

  console.log('\nNext: apply with the C# tool (needs oo2core_9_win64.dll):');
  console.log('  ApplyPolish "<...>/Bundles2/_.index.bin"  out/staging');
}

main().catch((e) => { console.error(e); process.exit(1); });
