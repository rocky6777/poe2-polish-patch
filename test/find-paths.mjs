import * as fs from 'fs/promises';
const c = JSON.parse(await fs.readFile(new URL('../.cache/translations.pl.json', import.meta.url), 'utf8'));
const keys = Object.keys(c);

// Any source key that translated into a value containing a path-ish slash or a known Polish path word.
const badVals = keys.filter((k) => {
  const v = c[k];
  return /Metadane|Efekty|Mikrotransakcje/.test(v) || (/[/\\]/.test(v) && /[/\\]/.test(k));
});
console.log('entries whose translation looks like a mangled path:', badVals.length);
for (const k of badVals.slice(0, 20)) console.log('  ', JSON.stringify(k), '->', JSON.stringify(c[k]));

// Also: keys that contain a slash at all (should have been skipped as references).
const slashKeys = keys.filter((k) => /[/\\]/.test(k));
console.log('\nkeys containing a slash (should be 0 if reference filter worked):', slashKeys.length);
for (const k of slashKeys.slice(0, 20)) console.log('  ', JSON.stringify(k), '->', JSON.stringify(c[k]));
