import * as fs from 'fs/promises';
import { looksLikeReference, looksLikeIdentifier } from '../src/translatable.mjs';
const f = new URL('../.cache/translations.pl.json', import.meta.url);
const c = JSON.parse(await fs.readFile(f, 'utf8'));
const keys = Object.keys(c);

const refs = keys.filter(looksLikeReference);
const ids = keys.filter((k) => !looksLikeReference(k) && looksLikeIdentifier(k));
console.log('reference-flagged:', refs.length, '| identifier-flagged:', ids.length);

// False-positive check: flagged keys containing a SPACE (display text usually has spaces).
const spaceyRefs = refs.filter((k) => /\s/.test(k.trim()));
console.log('\nreference-flagged keys WITH internal spaces (verify these are real paths, not text):', spaceyRefs.length);
for (const k of spaceyRefs.slice(0, 30)) console.log('  ', JSON.stringify(k));
