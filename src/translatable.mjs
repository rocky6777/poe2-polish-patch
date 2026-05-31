// Decides which string values are actually user-facing TEXT vs. internal data.
// Translating keys or asset references would corrupt the game, so we exclude:
//   - the "Id" column (unique lookup key in every table)
//   - values that look like file/metadata paths or asset references
//   - [DNT]-marked and empty strings
const SKIP_COLUMNS = new Set(['Id']);

// Asset/extension references that appear as string fields but are not text.
// Trailing \s* tolerates a stray trailing space (some video URLs have one).
const ASSET_EXT = /\.(dds|ao|aoc|aco|epk|otc|tgt|amd|fmt|mat|sm|smd|tsi|tdt|dgr|ddt|gft|env|ecf|atlas|json|txt|csd|mtd|arm|cht|red|clt|otr|tmd|fxgraph|pet|mtp|srt|bk2|ogg|wav|mp3|avi|act|trl|psg|hlsl)\s*$/i;
// Engine asset markers appearing ANYWHERE (after start or a delimiter): real
// display text never contains "Metadata/", "event:/", ".epk", etc. This also
// catches values with a leading newline ("\r\nMetadata/..") or embedded refs.
const ASSET_MARKER = /(^|[\s"'([{>])(Art|Metadata|Audio|Sound|SoundEffects|Shaders|Models|Textures|Movies|Terrain)[\/\\]/i;
const FMOD_OR_URL = /\b(event:[\/\\])|https?:\/\//i;

export function looksLikeReference(s) {
  if (FMOD_OR_URL.test(s)) return true;                // URLs, FMOD "event:/" audio
  if (ASSET_MARKER.test(s)) return true;               // Art/.. , Metadata/.. anywhere
  if (ASSET_EXT.test(s.trim())) return true;           // ends in an asset extension
  if (/[\/\\]/.test(s.trim()) && !/\s/.test(s.trim())) return true; // bare slash token
  return false;
}

// Columns that hold code/data, never display text (matched case-insensitively).
const SKIP_COLUMN_RE = /script|^id$|path|filename|directory|reference|expression|command/i;

// Executable game scripts (e.g. MonsterSpawners.Script1): method calls, statement
// separators, blocks, and PoE script builtins. Translating these mangles object
// paths, decimal points (0.05 -> 0,05), quotes, and keywords -> crashes.
const SCRIPT_BUILTINS = /\b(DoAction|FindClosestObject|SetStateTo|MakeVariableSerialised|AddEffectPack|IfVariety|SetMonsterBehaviour|FindRandomLocationNearLocation|GetLocation|RotateLocation|MakeVariable|SetVariable|GetVariable|SpawnMonster|CreateObject)\b/;
export function looksLikeScript(s) {
  if (/[A-Za-z_]\w*\.[A-Za-z_]\w*\s*\(/.test(s)) return true; // obj.method(
  if (/[A-Za-z_]\w*\([^)]*\)\s*[;{]/.test(s)) return true;     // call(...) ; or {
  if (SCRIPT_BUILTINS.test(s)) return true;
  return false;
}

// Internal identifiers / value-transform function names that the engine matches
// VERBATIM: stat-description functions (negate, divide_by_one_hundred, ...), stat
// and buff keys (fire_exposure, anger, soul_link_source, ...). Translating any of
// these corrupts stat_descriptions parsing and crashes the client. They are always
// snake_case or a single all-lowercase token, never user-facing display text.
const IDENTIFIER_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
export function looksLikeIdentifier(s) {
  return IDENTIFIER_RE.test(s);
}

export function shouldTranslate(column, value) {
  if (!value) return false;
  if (value.startsWith('[DNT]')) return false;
  if (SKIP_COLUMNS.has(column)) return false;
  if (SKIP_COLUMN_RE.test(column)) return false;
  if (looksLikeReference(value)) return false;
  if (looksLikeIdentifier(value)) return false;
  if (looksLikeScript(value)) return false;
  return true;
}

// Value-only predicate (no column) for purging a cache built before these rules.
export function valueIsNonText(value) {
  return !value || value.startsWith('[DNT]')
    || looksLikeReference(value) || looksLikeIdentifier(value) || looksLikeScript(value);
}
