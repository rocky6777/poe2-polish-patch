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

// Is this file OUR applied Polish (as opposed to pristine English)?
//
// A Steam game *patch* (the small delta download) only rewrites the bundles GGG
// actually changed; every table it didn't touch keeps the Polish we applied. So
// after a patch the live game is normally a MIX of fresh English (patched tables)
// and our stale Polish (everything else) — that's why a plain patch is NOT a
// "Verify integrity" and re-snapshotting live blindly would feed Polish back in.
//
// We decide from the actual decoded string VALUES, not raw bytes: any Polish-only
// letter inside a real string column means we wrote it. That's exact (no count
// threshold) and immune to the fixed-row binary section decoding to stray
// Polish-range code points. Files we can't parse with the schema (.csd, or schema
// drift) fall back to the byte-level heuristic, reliable on those large text blobs.
const POLISH_LETTER = /[łąężźśćńŁĄĘŻŹŚĆŃ]/;
function isOurPolish(buf, name, schema) {
  if (name && schema) {
    try {
      const cols = readScalarStrings(buf, name, schema, ValidFor.PoE2);
      for (const values of Object.values(cols))
        for (const s of values) if (POLISH_LETTER.test(s)) return true;
      return false;
    } catch { /* schema can't read it -> fall through to byte heuristic */ }
  }
  return looksContaminated(buf);
}

// Resolve the PRISTINE English source for a bundled file, immune to our own
// patching AND to partial game patches. If the live file is our Polish, translate
// from the saved English backup; if it's clean English (first run, or a table the
// latest patch just rewrote), (re)snapshot it so its new/changed text is picked up.
// This lets a re-run after a normal patch self-heal WITHOUT "Verify integrity" —
// only a missing/poisoned backup forces that.
async function pristineFile(loader, gamePath, bakPath, name = null, schema = null) {
  const live = await loader.tryGetFileContents(gamePath);
  if (!live) return null;
  const liveBuf = Buffer.from(live);
  if (isOurPolish(liveBuf, name, schema)) {
    // Live holds our Polish -> the pristine English is in the backup.
    let bak;
    try { bak = await fs.readFile(bakPath); } catch { bak = null; }
    if (bak) {
      if (isOurPolish(bak, name, schema)) throw contamination(bakPath); // backup itself poisoned
      return { source: bak, live: liveBuf };
    }
    // Polish live with no backup is genuinely unrecoverable -> need verify-integrity.
    throw contamination(gamePath);
  }
  // Live is clean English (first run / freshly Steam-patched) -> (re)snapshot it.
  await fs.mkdir(path.dirname(bakPath), { recursive: true });
  await fs.writeFile(bakPath, liveBuf);
  return { source: liveBuf, live: liveBuf };
}
const pristineSource = (loader, name, schema) => pristineFile(
  loader, `${SRC_PATH}/${name}.datc64`, path.join(SRCBAK, `${name}.datc64`), name, schema,
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
    const ps = await pristineSource(loader, name, schema);
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
    const ps = await pristineFile(loader, `${CSD_DIR}/${f}`, path.join(SRCBAK_CSD, f));
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

  // Font workaround: the game font has no glyph for U+0141 (capital "Ł"), so it
  // renders as nothing (an invisible character). Lowercase U+0142 ("ł") DOES
  // render, so we fold "Ł"->"ł" across all translated values. This keeps the
  // Polish stroke-L readable (vs. dropping to a plain "L"). Protected tokens
  // (link keys, {0}, <tags>, %1%) are ASCII English, so this can't break markup.
  for (const [k, v] of map) if (v.includes('Ł')) map.set(k, v.replaceAll('Ł', 'ł'));

  await fs.mkdir(STAGE, { recursive: true });
  const translate = (s, ctx) => (shouldTranslate(ctx.column, s, ctx.table) ? map.get(s) ?? null : null);
  let written = 0, restored = 0, fields = 0;
  for (const { name, source, live } of present) {
    const res = patchTable(source, name, schema, ValidFor.PoE2, translate);
    if (!res) continue;
    const outPath = path.join(STAGE, `${name}.datc64`);
    // Stage whenever the desired bytes differ from what's live: covers new
    // translations AND restoring a table whose live copy is stale/corrupted.
    // If they MATCH, the table needs no patch — but DELETE any stale staging file so
    // ApplyPolish can't re-apply an outdated translation. Without this, a table whose
    // only translatable column became kept-English (BaseItemTypes/Mods/Words) keeps
    // its old Polish staging — desired == pristine == live, so the write is skipped —
    // and that stale file gets applied, putting Polish names back in-game.
    if (res.bytes.equals(live)) { await fs.rm(outPath, { force: true }); continue; }
    await fs.writeFile(outPath, res.bytes);
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
    const outPath = path.join(STAGE_CSD, file);
    if (res.bytes.equals(live)) { await fs.rm(outPath, { force: true }); continue; } // drop stale (see datc64 loop)
    await fs.mkdir(STAGE_CSD, { recursive: true });
    await fs.writeFile(outPath, res.bytes);
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
    itemFrag: [...fdict.itemFrag.entries()], itemAll: [...fdict.itemAll.entries()],
    baseNames: [...fdict.baseNames], classNames: [...fdict.classNames], modNames: fdict.modNames,
  }));
  console.log(`Wrote loot-filter dictionary (${fdict.item.size.toLocaleString()} item + ${fdict.mod.size.toLocaleString()} mod + ${fdict.itemFrag.size.toLocaleString()} fragment entries; ${fdict.baseNames.size.toLocaleString()} base + ${fdict.classNames.size.toLocaleString()} class + ${fdict.modNames.length.toLocaleString()} mod names) to:\n  ${fdictPath}`);

  console.log('\nNext: apply with the C# tool (needs oo2core_9_win64.dll):');
  console.log('  ApplyPolish "<...>/Bundles2/_.index.bin"  out/staging');
}

main().catch((e) => { console.error(e); process.exit(1); });
