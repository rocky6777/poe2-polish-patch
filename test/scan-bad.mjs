import * as fs from 'fs/promises';
const c = JSON.parse(await fs.readFile(new URL('../.cache/translations.pl.json', import.meta.url), 'utf8'));
const keys = Object.keys(c);

const hasPath = keys.filter((k) => /[/\\]/.test(k));
const camel = keys.filter((k) => !/\s/.test(k) && /[a-z]/.test(k) && /[A-Z]/.test(k) && /^[A-Za-z][A-Za-z0-9]*$/.test(k));
const capNoSpace = keys.filter((k) => !/\s/.test(k) && /^[A-Z][A-Za-z0-9]+$/.test(k) && !camel.includes(k));

console.log('keys with slash (paths):', hasPath.length, '\n  sample:', hasPath.slice(0, 6));
console.log('CamelCase single-token keys:', camel.length, '\n  sample:', camel.slice(0, 20));
console.log('Capitalized single-word keys (no space):', capNoSpace.length, '\n  sample:', capNoSpace.slice(0, 20));

for (const k of ['Targe', 'CrestShield', 'Metadata/Effects/Microtransactions/char_level_up/blood_howl/blood_howl_lvlup.ao']) {
  console.log('PROBE', JSON.stringify(k), '->', k in c ? JSON.stringify(c[k]) : '(not translated)');
}
