// Translate the DEFAULT (English) display text inside PoE2 stat-description
// files (Data/StatDescriptions/*.csd). These render the blue stat lines on
// skill gems and passive tree nodes ("8% increased Attack Speed", "Converts
// 60% of Physical damage to Fire damage") — text that lives in NO .datc64
// table, so the .datc64 pipeline never reaches it.
//
// File grammar (UTF-16LE, CRLF, leading BOM):
//   description
//   \t<N> <stat_id_1> <stat_id_2> ...        stat ids the block matches (N of them)
//   \t<M>                                     M display lines follow (the DEFAULT block)
//   \t\t<range> "display text" <functions>    one display variant; <range> is a value
//                                             matcher (#, 1|#, #|-1, …), <functions> are
//                                             value transforms (negate, divide_by_one_hundred,
//                                             canonical_line, …) the engine matches VERBATIM
//   \tlang "German"                           start of a localized block (we IGNORE these)
//   \t<M2> … \t\t…                            that language's display lines
//
// We translate ONLY the quoted text on "\t\t" display lines that appear BEFORE
// the first `lang` of their block (the default = English, which is what the
// client uses when the game language is English). Everything else — stat ids,
// counts, range prefixes, trailing functions, `lang "X"` names, other languages,
// `include`/`no_description` lines — is left byte-for-byte untouched. Translating
// any of it corrupts parsing and crashes the client, which is why these files
// were avoided before.

const BOM = '﻿';

// Walk lines, invoking onDisplay(text) for each default-block display string and,
// if it returns a replacement, splicing it back in between the surrounding quotes.
function eachDefaultDisplay(text, onDisplay) {
  const hadBom = text.startsWith(BOM);
  const body = hadBom ? text.slice(1) : text;
  const lines = body.split('\r\n');
  let sawLang = false;     // are we past the default block within the current description?
  let changed = 0, total = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('description')) { sawLang = false; continue; }
    if (line.startsWith('\tlang ')) { sawLang = true; continue; }
    // Display lines are doubly-indented and carry a quoted string. Single-tab
    // lines (stat ids, counts) and top-level lines (include/no_description)
    // never start with two tabs, so this cleanly isolates display text.
    if (sawLang || !line.startsWith('\t\t')) continue;
    const a = line.indexOf('"');
    const b = line.lastIndexOf('"');
    if (a < 0 || b <= a) continue;            // no display string on this line
    const src = line.slice(a + 1, b);
    if (!src) continue;
    total++;
    const out = onDisplay(src);
    if (out != null && out !== src) {
      lines[i] = line.slice(0, a + 1) + out + line.slice(b);
      changed++;
    }
  }
  return { text: (hadBom ? BOM : '') + lines.join('\r\n'), changed, total };
}

/** Collect every default-block display string (for batch translation + caching). */
export function collectCsdStrings(buf) {
  const text = Buffer.from(buf).toString('utf16le');
  const out = new Set();
  eachDefaultDisplay(text, (s) => { out.add(s); return null; });
  return out;
}

/**
 * Patch one .csd buffer.
 * @param buf        original .csd bytes (UTF-16LE)
 * @param translate  (src) => polish | null   (null/eq => leave English)
 * @returns { bytes, stats:{changed,total} }
 */
export function patchCsd(buf, translate) {
  const text = Buffer.from(buf).toString('utf16le');
  const { text: outText, changed, total } = eachDefaultDisplay(text, translate);
  return { bytes: Buffer.from(outText, 'utf16le'), stats: { changed, total } };
}
