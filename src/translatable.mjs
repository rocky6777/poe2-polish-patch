// Decides which string values are actually user-facing TEXT vs. internal data.
// Translating keys or asset references would corrupt the game, so we exclude:
//   - the "Id" column (unique lookup key in every table)
//   - values that look like file/metadata paths or asset references
//   - [DNT]-marked and empty strings
const SKIP_COLUMNS = new Set(['Id']);

// Columns whose string is an ENGINE OBJECT-CLASS IDENTIFIER, not display text.
// The Characters table's Name/BaseClass double as the class registered for player
// characters AND for rogue-exile monsters: Metadata/Monsters/RogueExiles/StrDex/
// ExileMercenary1 declares its class as "Mercenary" (= Characters.Name). Translating
// it ("Mercenary" -> "Najemnik") deregisters the class, so the monster crashes the
// client on spawn ("Invalid class: Mercenary"). Keyed by "Table.Column" because the
// same words are legitimate DISPLAY text in other tables (AchievementItems.Name,
// NPCPortraits.Name) which we still want translated.
const SKIP_TABLE_COLUMNS = new Set([
  'Characters.Name', 'Characters.BaseClass',
]);

// Columns we intentionally keep in the ENGLISH SOURCE for a DISPLAY reason (not a
// crash guard like the set above). These are the columns the engine composes item
// TITLES from — keeping them English gives fully English item names, which:
//   (1) FIT the fixed-width tooltip header banner art. Polish names run ~65% wider
//       than English (2,668 of 4,609 base names land in the overflow zone) and spill
//       past the banner, dropping the decorated frame to a plain box — a long rare
//       like "Zwłoki Chwyt Nitowane Rękawiczki" loses its frame; a short one keeps it.
//   (2) MATCH the trade/market site + wiki, which only search English names.
// Sources, located via test/find-text.mjs against the pristine English tables:
//   BaseItemTypes.Name   base type             ("Riveted Mitts")
//   Mods.Name            magic/rare affix word  ("Cobalt", "of the Wind")
//   Words.Text/.Text2    rare-name fragments + UNIQUE names ("Goldrim", "Tabula Rasa")
// Note: Words + Mods are shared with monster naming, so rare/magic MONSTER names go
// English too. Everything else — stat lines, skills, UI, quests, dialogue, and class
// names (ItemClasses.Name) — stays Polish. The loot-filter localizer needs no change:
// with these columns untranslated, in-game names stay English, so English
// `BaseType "..."` / `HasExplicitMod "..."` filter values already match as-is.
const KEEP_SOURCE_TABLE_COLUMNS = new Set([
  'BaseItemTypes.Name',
  'Mods.Name',
  'Words.Text', 'Words.Text2',
]);

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
// `script(?!ion)` skips genuine script columns (Script, Script1, ScriptArgs,
// AiScript, …) while still translating *Description columns — "deScRiPTion"
// contains the substring "script", and a bare `script` term silently skipped
// every Description/ShortDescription/StatDescription column (all the skill,
// buff and passive bonus text), leaving it untranslated in-game.
const SKIP_COLUMN_RE = /script(?!ion)|^id$|path|filename|directory|reference|expression|command/i;

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

export function shouldTranslate(column, value, table) {
  if (!value) return false;
  if (value.startsWith('[DNT]')) return false;
  if (table && SKIP_TABLE_COLUMNS.has(`${table}.${column}`)) return false;
  if (table && KEEP_SOURCE_TABLE_COLUMNS.has(`${table}.${column}`)) return false;
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
