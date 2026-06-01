// German->Polish via the free (unofficial) Google endpoint, with an on-disk
// cache keyed by source string and hard placeholder protection.
//
// Reliability notes:
//  - This endpoint is rate-limited per IP and unofficial; we throttle + back off.
//  - The cache means each patch only sends NEW/changed strings.
//  - SAFETY NET: if game markup ({0}, <tags>, %1%, newlines) doesn't survive a
//    translation 1:1, we discard it and keep the source string. A German string
//    in-game is far better than a Polish string with a broken placeholder.
import * as fs from 'fs/promises';
import * as path from 'path';

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const CACHE_FILE = path.join(import.meta.dirname, '..', '.cache', 'translations.pl.json');

// Markup we must never let the MT engine alter.
const PROTECT_RE = /(\{[^}]*\}|<[^>]+>|%[0-9a-zA-Z_]*%|\r\n|\n|\r|\t)/g;
// Game glossary links: [Key] or [Key|Display]. The Key (before the optional |)
// is an internal token the engine matches VERBATIM to resolve the in-game
// hyperlink/tooltip — translating it silently breaks the link (e.g.
// [Dexterity|Dexterity] -> [Zręczność|Zręczność] no longer resolves). We keep
// the "[Key|" prefix and the "]" suffix as protected tokens and expose only the
// Display half — defaulting to the Key for a bare [Key] — to the MT engine, so
// the visible term is translated while the link still resolves.
const LINK_RE = /\[([^\]|]+)(?:\|([^\]]*))?\]/g;
// Rare bracket chars survive Google MT far better than {curly} or [square].
const open = '❲', close = '❳'; // ❲ ❳

function protect(text) {
  const tokens = [];
  const mask = (m) => `${open}${tokens.push(m) - 1}${close}`;
  // Links first: protect "[Key|" and "]", leaving the display text in the
  // stream so it gets translated alongside the surrounding sentence.
  let masked = text.replace(LINK_RE, (_, key, display) =>
    `${mask(`[${key}|`)}${display ?? key}${mask(']')}`);
  // Then the inline markup that must survive byte-for-byte.
  masked = masked.replace(PROTECT_RE, mask);
  return { masked, tokens };
}
function restore(masked, tokens) {
  // Tolerate spaces the MT engine may inject around/inside the sentinel.
  return masked.replace(
    new RegExp(`${open}\\s*(\\d+)\\s*${close}`, 'g'),
    (_, i) => tokens[Number(i)] ?? '',
  );
}
// Sorted multiset of link KEYS (the lookup half), which must never change.
function linkKeys(s) {
  return [...s.matchAll(LINK_RE)].map((m) => m[1]).sort();
}
// True if every protected token AND every link key survives 1:1 from src->out.
function markupIntact(src, out) {
  const a = src.match(PROTECT_RE) ?? [];
  const b = out.match(PROTECT_RE) ?? [];
  if (a.length !== b.length) return false;
  const count = (arr) => arr.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const ca = count(a), cb = count(b);
  for (const [k, v] of ca) if (cb.get(k) !== v) return false;
  const la = linkKeys(src), lb = linkKeys(out);
  if (la.length !== lb.length) return false;
  for (let i = 0; i < la.length; i++) if (la[i] !== lb[i]) return false;
  return true;
}
// Polish-specific letters never occur in PoE's pristine English base text, so a
// link KEY that contains one means a Polish-patched string was once re-ingested
// as a "source" (contamination). Same letter set as build.mjs looksContaminated().
const PL_IN_KEY = /[łąężźśćńŁĄĘŻŹŚĆŃ]/;
function sourceContaminated(src) {
  return [...src.matchAll(LINK_RE)].some((m) => PL_IN_KEY.test(m[1]));
}
// A cached translation is HEALTHY iff it preserved every placeholder + link key
// (markupIntact) AND its source is genuine English. Unhealthy entries break
// in-game glossary links — a legacy [Evasion|Evasion Rating] -> [Unik|Ocena uniku]
// has a "Unik" key that resolves to nothing, so the client prints the raw
// "[Unik|Ocena uniku]" markup. These predate the markupIntact link-key check, so
// loadCache() drops them on every load: the next run re-translates them correctly
// (keys stay English) and never re-serves or re-ships the poison. Exported so the
// standalone scan (src/clean-cache.mjs) and publish.mjs apply the identical rule.
export function cacheEntryHealthy(src, val) {
  return typeof val === 'string' && markupIntact(src, val) && !sourceContaminated(src);
}

// The MT engine strips leading/trailing whitespace, but that whitespace is often
// STRUCTURAL. PoE composes rare item names by concatenating Words fragments where
// the suffix carries a leading space ("Armageddon" + " Gaze" = "Armageddon Gaze"),
// and many UI strings are prefixes the engine appends a value onto ("Spectre: {0} ",
// "Build Loaded: "). Dropping the edge space mashes them together in-game
// ("ArmagedonSpojrzenie"). So we force the output's leading/trailing whitespace to
// equal the source's exactly. Edge whitespace sits outside every protected
// token/link, so this can never disturb markup; pure-whitespace sources are kept
// verbatim. Exported so loadCache/clean-cache/publish repair legacy entries too.
export function preserveEdges(src, out) {
  if (typeof out !== 'string') return out;
  if (!src.trim()) return src;
  return src.match(/^\s*/)[0] + out.trim() + src.match(/\s*$/)[0];
}

async function loadCache() {
  try {
    const all = Object.entries(JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8')));
    const good = all.filter(([s, v]) => cacheEntryHealthy(s, v));
    const dropped = all.length - good.length;
    if (dropped) console.warn(`  cache: dropped ${dropped.toLocaleString()} broken/contaminated entr${dropped === 1 ? 'y' : 'ies'} (will re-translate)`);
    // Repair MT-trimmed edge whitespace on legacy entries (lossless, no network).
    let repaired = 0;
    const fixed = good.map(([s, v]) => { const e = preserveEdges(s, v); if (e !== v) repaired++; return [s, e]; });
    if (repaired) console.warn(`  cache: restored edge whitespace on ${repaired.toLocaleString()} entr${repaired === 1 ? 'y' : 'ies'}`);
    return new Map(fixed);
  } catch { return new Map(); }
}
async function saveCache(cache) {
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(Object.fromEntries(cache)));
}

async function translateOne(text, { sl = 'en', tl = 'pl', retries = 4 } = {}) {
  const { masked, tokens } = protect(text);
  const url = `${ENDPOINT}?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(masked)}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const out = restore((data?.[0] ?? []).map((seg) => seg?.[0] ?? '').join(''), tokens);
      return markupIntact(text, out) && out.trim() ? preserveEdges(text, out) : text; // safety net (cache this)
    } catch (err) {
      if (attempt >= retries) return null; // hard failure -> signal "do not cache, retry later"
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt + Math.random() * 250));
    }
  }
}

// --- Batched translation -------------------------------------------------
// Many strings per request via a sentinel delimiter ❮i❯ that the MT engine
// preserves. ~30x fewer requests. Any misalignment or markup loss falls back
// to reliable per-string translation, so output can never be corrupted.
const D_OPEN = '❮', D_CLOSE = '❯';            // distinct from protect()'s ❲ ❳
const SPLIT_RE = /❮\s*\d+\s*❯/;
const MAX_ITEMS = 32;                          // strings per request
const MAX_CHARS = 2000;                        // joined (pre-encode) length cap

function buildBatches(items) {
  const batches = [];
  let cur = [], len = 0;
  for (const s of items) {
    const add = s.length + 8;
    if (cur.length && (cur.length >= MAX_ITEMS || len + add > MAX_CHARS)) { batches.push(cur); cur = []; len = 0; }
    cur.push(s); len += add;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

// Translate one batch. Returns Map<src, pl|null>, or null if the whole batch
// must be retried per-string (request failed or response misaligned).
async function translateBatch(items, sl) {
  const masked = items.map(protect);
  const joined = masked.map((m, i) => (i ? `${D_OPEN}${i}${D_CLOSE} ` : '') + m.masked).join(' ');
  const url = `${ENDPOINT}?client=gtx&sl=${sl}&tl=pl&dt=t&q=${encodeURIComponent(joined)}`;
  let full;
  try {
    const res = await fetch(url);
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    full = (data?.[0] ?? []).map((seg) => seg?.[0] ?? '').join('');
  } catch { return null; }
  const parts = full.split(SPLIT_RE);
  if (parts.length !== items.length) return null; // misaligned -> caller retries per-string
  const out = new Map();
  for (let i = 0; i < items.length; i++) {
    const restored = restore(parts[i].trim(), masked[i].tokens);
    out.set(items[i], markupIntact(items[i], restored) && restored.trim() ? preserveEdges(items[i], restored) : null);
  }
  return out;
}

/**
 * Translate a set of unique source strings, using + updating the disk cache.
 * @param sources  iterable of source strings (caller pre-filters empty/[DNT])
 * @param opts.concurrency  parallel in-flight batches
 * @param opts.onProgress   (done, total) => void
 * @returns Map<source, polish>
 */
export async function translateMany(sources, { concurrency = 6, onProgress, sourceLang = 'en', offline = false } = {}) {
  const cache = await loadCache();
  // offline (end-user) mode: never hit the network. Uncached strings fall back
  // to their source (English) in the result map below.
  const todo = offline ? [] : [...new Set(sources)].filter((s) => s && !cache.has(s));
  const batches = buildBatches(todo);
  const total = todo.length;
  let done = 0, sinceSave = 0, bi = 0;

  async function worker() {
    while (bi < batches.length) {
      const batch = batches[bi++];
      let res = await translateBatch(batch, sourceLang);
      if (res === null) {                       // batch failed -> per-string
        res = new Map();
        for (const s of batch) res.set(s, await translateOne(s, { sl: sourceLang }));
      } else {                                  // repair individual markup misses
        for (const [s, v] of res) if (v == null) res.set(s, await translateOne(s, { sl: sourceLang }));
      }
      for (const [s, v] of res) { if (v != null) cache.set(s, v); done++; sinceSave++; }
      if (onProgress) onProgress(Math.min(done, total), total);
      if (sinceSave >= 400) { sinceSave = 0; await saveCache(cache); } // checkpoint
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length || 1) }, worker));
  await saveCache(cache);

  const result = new Map();
  for (const s of new Set(sources)) if (s) result.set(s, cache.get(s) ?? s);
  return result;
}

export const _internal = { protect, restore, markupIntact, preserveEdges, translateOne, translateBatch, buildBatches };
