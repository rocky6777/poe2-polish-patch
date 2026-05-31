// Catalogue every line shape in the stat-description files so we know exactly
// which strings are translatable display text vs. engine identifiers/functions.
import { makeLoader } from '../src/loader.mjs';
const loader = await makeLoader(process.env.POE2_DIR);

const FILES = [
  'Data/StatDescriptions/stat_descriptions.csd',
  'Data/StatDescriptions/skill_stat_descriptions.csd',
  'Data/StatDescriptions/active_skill_gem_stat_descriptions.csd',
];

for (const p of FILES) {
  let bytes;
  try { bytes = await loader.getFileContents(p); } catch (e) { console.log(p, 'MISSING', e.message); continue; }
  const text = Buffer.from(bytes).toString('utf16le').replace(/^﻿/, '');
  const lines = text.split('\r\n');

  let descBlocks = 0, langLines = 0, textLines = 0, noDesc = 0, includes = 0;
  const langs = new Map();          // language name -> count
  const trailing = new Map();       // trailing token after closing quote -> count
  const rangePrefix = new Map();    // text before the opening quote on a text line
  const linkTags = new Set();       // distinct [..] tags in DEFAULT (English) text
  let defaultTextSample = [];

  let inLangBlock = false;          // are we currently under a `lang "X"` header?

  for (const raw of lines) {
    if (/^\s*$/.test(raw)) continue;
    if (raw.startsWith('include ')) { includes++; continue; }
    if (raw.startsWith('description')) { descBlocks++; inLangBlock = false; continue; }
    if (raw.startsWith('no_description')) { noDesc++; continue; }

    const lang = raw.match(/^\tlang "([^"]*)"\s*$/);
    if (lang) { langLines++; langs.set(lang[1], (langs.get(lang[1]) || 0) + 1); inLangBlock = true; continue; }

    // text/format line:  <indent><range> "<display text>" <trailing funcs>
    const m = raw.match(/^(\t\t)(\S*?)\s*"(.*)"\s*(.*)$/);
    if (m) {
      textLines++;
      const [, , range, disp, trail] = m;
      rangePrefix.set(range || '(none)', (rangePrefix.get(range || '(none)') || 0) + 1);
      for (const t of trail.split(/\s+/).filter(Boolean)) trailing.set(t, (trailing.get(t) || 0) + 1);
      if (!inLangBlock) {
        for (const tag of disp.match(/\[[^\]]*\]/g) || []) linkTags.add(tag);
        if (defaultTextSample.length < 5) defaultTextSample.push(disp);
      }
    }
  }

  console.log(`\n===== ${p} =====`);
  console.log({ descBlocks, noDesc, includes, langLines, textLines });
  console.log('languages present:', [...langs.keys()].sort());
  console.log('has Polish block? ', langs.has('Polish'));
  console.log('range prefixes (top):', [...rangePrefix.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15));
  console.log('trailing tokens (top):', [...trailing.entries()].sort((a,b)=>b[1]-a[1]).slice(0,25));
  console.log(`distinct [..] link tags in DEFAULT text: ${linkTags.size}`);
  console.log('  sample tags:', [...linkTags].slice(0, 20));
  console.log('  sample default text:', defaultTextSample);
}
