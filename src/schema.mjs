// Schema loading + per-column byte-offset computation.
// Mirrors pathofexile-dat's internal importHeaders() so our writer lays out
// fields at exactly the offsets the reader/game expect.
import { getHeaderLength } from './poedat.mjs';
import { SCHEMA_URL, SCHEMA_VERSION, ValidFor } from 'pathofexile-dat-schema';
import * as fs from 'fs/promises';
import * as path from 'path';

const CACHE = path.join(import.meta.dirname, '..', '.cache', 'schema.min.json');

export { ValidFor };

// Fetch the community schema once, cache to disk. Pass {refresh:true} to re-pull.
export async function loadSchema({ refresh = false } = {}) {
  if (!refresh) {
    try {
      const cached = JSON.parse(await fs.readFile(CACHE, 'utf-8'));
      if (cached.version === SCHEMA_VERSION) return cached;
    } catch { /* fall through to fetch */ }
  }
  const schema = await (await fetch(SCHEMA_URL)).json();
  if (schema.version !== SCHEMA_VERSION) {
    throw new Error(`Schema format ${schema.version} != expected ${SCHEMA_VERSION}; update pathofexile-dat.`);
  }
  await fs.mkdir(path.dirname(CACHE), { recursive: true });
  await fs.writeFile(CACHE, JSON.stringify(schema));
  return schema;
}

// Build typed headers with cumulative byte offsets for one table.
// Returns null if no schema row exists for the table.
// Throws if a column type is unknown (incomplete schema) — caller decides to skip.
export function importHeaders(tableName, datFile, schema, validFor) {
  const byName = schema.tables.filter((s) => s.name === tableName);
  const sch = byName.find((s) => s.validFor & validFor) ?? byName.at(0);
  if (!sch) return null;

  const headers = [];
  let offset = 0;
  for (const column of sch.columns) {
    const header = {
      name: column.name || '',
      offset,
      type: {
        array: column.array,
        interval: column.interval,
        integer:
          column.type === 'u16' ? { unsigned: true, size: 2 }
          : column.type === 'u32' ? { unsigned: true, size: 4 }
          : column.type === 'i16' ? { unsigned: false, size: 2 }
          : column.type === 'i32' ? { unsigned: false, size: 4 }
          : column.type === 'enumrow' ? { unsigned: false, size: 4 }
          : undefined,
        decimal: column.type === 'f32' ? { size: 4 } : undefined,
        string: column.type === 'string' ? {} : undefined,
        boolean: column.type === 'bool' ? {} : undefined,
        key: (column.type === 'row' || column.type === 'foreignrow')
          ? { foreign: column.type === 'foreignrow' }
          : undefined,
      },
    };
    headers.push(header);
    offset += getHeaderLength(header, datFile); // throws on unknown type
  }
  return headers;
}

// PoE2 localized-table paths (from pathofexile-dat).
export const POE2_LANG_PATH = {
  English: 'Data/Balance',
  French: 'Data/Balance/French',
  German: 'Data/Balance/German',
  Japanese: 'Data/Balance/Japanese',
  Korean: 'Data/Balance/Korean',
  Portuguese: 'Data/Balance/Portuguese',
  Russian: 'Data/Balance/Russian',
  Spanish: 'Data/Balance/Spanish',
  Thai: 'Data/Balance/Thai',
  'Traditional Chinese': 'Data/Balance/Traditional Chinese',
};
