// Direct imports of pathofexile-dat's .datc64 reader internals, bypassing the
// package "exports" barrel (dat.js) which pulls in dat-analysis/wasm.js and
// does an import-time file:// fetch we neither need nor can run.
import * as path from 'path';
import { pathToFileURL } from 'url';

const DAT = path.join(import.meta.dirname, '..', 'node_modules', 'pathofexile-dat', 'dist', 'dat');
const imp = (f) => import(pathToFileURL(path.join(DAT, f)).href);

const [datFile, reader, header] = await Promise.all([
  imp('dat-file.js'), imp('reader.js'), imp('header.js'),
]);

export const { readDatFile } = datFile;
export const { readColumn, getFieldReader } = reader;
export const { getHeaderLength } = header;
