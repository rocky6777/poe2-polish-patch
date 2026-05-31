import * as path from 'path';
import * as fs from 'fs/promises';
// Replicate translate.mjs CACHE_FILE resolution from a file IN src/ vs test/.
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
console.log('test/ dirname:', here);

// translate.mjs lives in src/, so its import.meta.dirname is <root>/src
const srcDir = path.join(here, '..', 'src');
const CACHE_FILE = path.join(srcDir, '..', '.cache', 'translations.pl.json');
console.log('resolved CACHE_FILE:', CACHE_FILE);
try {
  const txt = await fs.readFile(CACHE_FILE, 'utf-8');
  const obj = JSON.parse(txt);
  console.log('readable, entries:', Object.keys(obj).length, '| Error =>', obj['Error']);
} catch (e) {
  console.log('READ FAILED:', e.message);
}
