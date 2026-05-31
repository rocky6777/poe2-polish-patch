import { pathToFileURL } from 'url';
import * as path from 'path';
const P = (p) => pathToFileURL(path.join(import.meta.dirname, '..', 'node_modules', 'pathofexile-dat', 'dist', p)).href;
const { decompressSliceInBundle, decompressedBundleSize } = await import(P('bundles/bundle.js'));
const { readIndexBundle } = await import(P('bundles/index-bundle.js'));
const { SteamBundleLoader } = await import(P('cli/bundle-loaders.js'));

const STEAM = process.env.POE2_DIR || 'D:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2';
const bl = new SteamBundleLoader(STEAM);
const indexBin = await bl.fetchFile('_.index.bin');
const indexBundle = new Uint8Array(decompressedBundleSize(indexBin));
decompressSliceInBundle(indexBin, 0, indexBundle);
const idx = readIndexBundle(indexBundle);

// Parse bundlesInfo: int32 count, then [int32 nameLen, name bytes, int32 uncompressedSize].
const dv = new DataView(idx.bundlesInfo.buffer, idx.bundlesInfo.byteOffset, idx.bundlesInfo.byteLength);
const dec = new TextDecoder();
let off = 0; const refs = []; const all = [];
while (off + 4 <= idx.bundlesInfo.byteLength) {
  const nameLen = dv.getInt32(off, true); off += 4;
  const name = dec.decode(idx.bundlesInfo.subarray(off, off + nameLen)); off += nameLen + 4;
  all.push(name);
  if (/LibGGPK3/i.test(name)) refs.push(name);
}
console.log('total bundles in index:', all.length);
console.log('LibGGPK3 bundles REFERENCED by current index:', JSON.stringify(refs));
