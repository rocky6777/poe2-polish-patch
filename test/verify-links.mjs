// Prove that re-translating the purged strings keeps glossary-link KEYS English.
// (1) OFFLINE: protect() must mask "[Key|" + "]" and expose only the display, and
//     markupIntact() must reject any output that changed a link key.
// (2) LIVE (best-effort): translateOne() on the real strings must come back with
//     the same link keys as the source. Network flakiness doesn't fail the test.
import { _internal, cacheEntryHealthy } from '../src/translate.mjs';
const { protect, restore, markupIntact, translateOne } = _internal;

const LINK_RE = /\[([^\]|]+)(?:\|([^\]]*))?\]/g;
const keys = (s) => [...s.matchAll(LINK_RE)].map((m) => m[1]);
let fail = 0;
const ok = (c, m) => { console.log(`${c ? '  ok ' : '  XX '} ${m}`); if (!c) fail++; };

const samples = [
  '[Evasion|Evasion Rating]',
  '[Block] chance',
  '[Dexterity|Dexterity]',
  '{0} more [Strength|Strength] required',
  '[Quality]',
];

console.log('OFFLINE — protect() masks keys, exposes display; markupIntact() guards:');
for (const src of samples) {
  const { masked, tokens } = protect(src);
  // The literal "[Key|" prefix must be tokenized out (not left in the MT stream).
  const keyLeak = keys(src).some((k) => masked.includes(`[${k}|`) || masked.includes(`[${k}]`));
  ok(!keyLeak, `key not exposed to MT:           ${JSON.stringify(src)} -> masked ${JSON.stringify(masked)}`);
  // Simulate a translator that only changes the visible text (uppercase it):
  const simulated = restore(masked.toUpperCase().replace(/❲\s*(\d+)\s*❳/gi, (_, i) => `❲${i}❳`), tokens);
  ok(keys(simulated).join() === keys(src).join(), `keys survive a display-only edit: ${JSON.stringify(simulated)}`);
  // The known-bad fully-translated form must be REJECTED by the guard:
  const bad = src.replace(/[A-Za-z][A-Za-z ]+/g, 'POLSKI');
  ok(!markupIntact(src, bad) || keys(bad).join() === keys(src).join(),
     `guard rejects key-translated form: ${JSON.stringify(bad)} -> healthy=${cacheEntryHealthy(src, bad)}`);
}

console.log('\nLIVE — translateOne() (best-effort; needs the Google endpoint):');
let liveTried = 0, liveOk = 0;
for (const src of samples) {
  let out;
  try { out = await translateOne(src, { sl: 'en', tl: 'pl' }); } catch { out = null; }
  if (out == null) { console.log(`  -- skipped (network): ${JSON.stringify(src)}`); continue; }
  liveTried++;
  const same = keys(out).join() === keys(src).join();
  if (same) liveOk++;
  ok(same, `${JSON.stringify(src)} -> ${JSON.stringify(out)}  keys=[${keys(out).join(', ')}]`);
}
console.log(`\nLive: ${liveOk}/${liveTried} preserved keys` + (liveTried === 0 ? ' (no network — offline proof still holds)' : ''));
console.log(fail ? `\n✗ ${fail} offline assertion(s) failed` : '\n✅ All offline assertions passed');
process.exit(fail ? 1 : 0);
