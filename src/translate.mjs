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
// Rare bracket chars survive Google MT far better than {curly} or [square].
const open = '❲', close = '❳'; // ❲ ❳

function protect(text) {
  const tokens = [];
  const masked = text.replace(PROTECT_RE, (m) => `${open}${tokens.push(m) - 1}${close}`);
  return { masked, tokens };
}
function restore(masked, tokens) {
  // Tolerate spaces the MT engine may inject around/inside the sentinel.
  return masked.replace(
    new RegExp(`${open}\\s*(\\d+)\\s*${close}`, 'g'),
    (_, i) => tokens[Number(i)] ?? '',
  );
}
// True if every protected token appears exactly as many times as in the source.
function markupIntact(src, out) {
  const a = src.match(PROTECT_RE) ?? [];
  const b = out.match(PROTECT_RE) ?? [];
  if (a.length !== b.length) return false;
  const count = (arr) => arr.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const ca = count(a), cb = count(b);
  for (const [k, v] of ca) if (cb.get(k) !== v) return false;
  return true;
}

async function loadCache() {
  try { return new Map(Object.entries(JSON.parse(await fs.readFile(CACHE_FILE, 'utf-8')))); }
  catch { return new Map(); }
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
      return markupIntact(text, out) && out.trim() ? out : text; // safety net (cache this)
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
    out.set(items[i], markupIntact(items[i], restored) && restored.trim() ? restored : null);
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

export const _internal = { protect, restore, markupIntact, translateOne, translateBatch, buildBatches };
