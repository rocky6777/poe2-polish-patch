// Append-only .datc64 string patcher.
//
// To change a string we append `UTF16LE(text) + 4 zero bytes` to the variable
// data section and rewrite ONLY that field's 8-byte offset in the fixed row.
// The fixed-row layout, every other field, and all untouched strings are left
// byte-for-byte identical — minimal blast radius, no global reserialization.
import { readDatFile, readColumn, getHeaderLength } from './poedat.mjs';
import { importHeaders } from './schema.mjs';

const TERMINATOR = Buffer.from([0, 0, 0, 0]); // 4 zero bytes (matches reader)

// Returns the scalar (non-array, non-interval) string columns of a table.
function scalarStringHeaders(headers) {
  return headers.filter((h) => h.type.string && !h.type.array && !h.type.interval);
}

/**
 * Patch scalar string columns of one German .datc64 file.
 *
 * @param origBytes  Uint8Array/Buffer of the original .datc64
 * @param tableName  e.g. "ClientStrings"
 * @param schema     loaded community schema
 * @param validFor   ValidFor.PoE2
 * @param translate  (sourceStr, ctx) => translatedStr | null   (null/eq => leave as-is)
 * @returns { bytes, stats } or null if the table can't be safely handled
 */
export function patchTable(origBytes, tableName, schema, validFor, translate) {
  let headers;
  try {
    headers = importHeaders(tableName, datFileOf(origBytes), schema, validFor);
  } catch {
    return null; // unknown column type => incomplete schema => skip for safety
  }
  if (!headers) return null;

  const datFile = datFileOf(origBytes);
  const { rowCount, rowLength } = datFile;

  // Safety: the schema must describe the row's full width. If the community
  // schema is incomplete/outdated the cumulative offsets would be wrong, so we
  // refuse to touch the table rather than corrupt it.
  const last = headers[headers.length - 1];
  const schemaRowLength = headers.length ? last.offset + getHeaderLength(last, datFile) : 0;
  if (schemaRowLength !== rowLength) return null;

  const strHeaders = scalarStringHeaders(headers);
  if (!strHeaders.length) return { bytes: Buffer.from(origBytes), stats: { rows: rowCount, columns: 0, changed: 0 } };

  // Pre-read each string column's values (uses the reference reader => correct).
  const columnValues = strHeaders.map((h) => readColumn(h, datFile));

  const newFixed = Buffer.from(datFile.dataFixed); // mutable copy
  const varChunks = [Buffer.from(datFile.dataVariable)]; // [0] keeps the 0xBB magic
  let varLen = datFile.dataVariable.length;
  let changed = 0;

  for (let c = 0; c < strHeaders.length; ++c) {
    const header = strHeaders[c];
    const values = columnValues[c];
    for (let row = 0; row < rowCount; ++row) {
      const src = values[row];
      const out = translate(src, { table: tableName, column: header.name, row });
      if (out == null || out === src) continue;

      const strBuf = Buffer.concat([Buffer.from(out, 'utf16le'), TERMINATOR]);
      const newOffset = varLen;
      varChunks.push(strBuf);
      varLen += strBuf.length;

      const fieldPos = row * rowLength + header.offset;
      newFixed.writeBigUInt64LE(BigInt(newOffset), fieldPos); // low4=offset, high4=0
      changed++;
    }
  }

  const head = Buffer.alloc(4);
  head.writeUInt32LE(rowCount, 0);
  const bytes = Buffer.concat([head, newFixed, ...varChunks]);
  return { bytes, stats: { rows: rowCount, columns: strHeaders.length, changed } };
}

function datFileOf(bytes) {
  return readDatFile('.datc64', bytes instanceof Buffer ? bytes : Buffer.from(bytes));
}

// Re-read a patched file and return scalar string columns as {name: values[]}.
// Used by the round-trip test to prove the writer produced a valid file.
export function readScalarStrings(bytes, tableName, schema, validFor) {
  const datFile = datFileOf(bytes);
  const headers = importHeaders(tableName, datFile, schema, validFor);
  const out = {};
  for (const h of scalarStringHeaders(headers)) out[h.name] = readColumn(h, datFile);
  return out;
}
