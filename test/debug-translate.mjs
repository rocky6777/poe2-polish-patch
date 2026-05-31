import { translateMany } from '../src/translate.mjs';
const src = new Set(['Error', 'Exception', 'Fatal Error', 'totally-uncached-zzz-123']);
const map = await translateMany(src, { offline: true, sourceLang: 'en' });
for (const s of src) console.log(JSON.stringify(s), '=>', JSON.stringify(map.get(s)));
