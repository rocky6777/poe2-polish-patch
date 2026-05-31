// Thin wrapper over pathofexile-dat's internal Steam loader.
// The package only exports ./bundles.js and ./dat.js, so we reach the CLI
// loader by direct file path (bypasses the package "exports" map).
import * as path from 'path';
import { pathToFileURL } from 'url';

const LOADERS = path.join(
  import.meta.dirname, '..', 'node_modules', 'pathofexile-dat', 'dist', 'cli', 'bundle-loaders.js',
);
const loaders = await import(pathToFileURL(LOADERS).href);

export async function makeLoader(steamPath) {
  return loaders.FileLoader.create(new loaders.SteamBundleLoader(steamPath));
}

// List the file basenames in a bundle directory (dirPath MUST be lower-case — the
// index hashes it verbatim, unlike file lookups which normalise case). Used to
// auto-discover every Data/StatDescriptions/*.csd instead of hardcoding a list
// that silently goes stale when GGG adds content (atlas, expedition, sanctum, …).
const DIST = path.join(import.meta.dirname, '..', 'node_modules', 'pathofexile-dat', 'dist');
const distUrl = (p) => pathToFileURL(path.join(DIST, p)).href;
export async function listDirFiles(steamPath, dirPath, ext) {
  const { decompressSliceInBundle, decompressedBundleSize } = await import(distUrl('bundles/bundle.js'));
  const { readIndexBundle } = await import(distUrl('bundles/index-bundle.js'));
  const { getDirContent } = await import(distUrl('bundles/index-paths.js'));
  const bl = new loaders.SteamBundleLoader(steamPath);
  const indexBin = await bl.fetchFile('_.index.bin');
  const indexBundle = new Uint8Array(decompressedBundleSize(indexBin));
  decompressSliceInBundle(indexBin, 0, indexBundle);
  const idx = readIndexBundle(indexBundle);
  const pathReps = new Uint8Array(decompressedBundleSize(idx.pathRepsBundle));
  decompressSliceInBundle(idx.pathRepsBundle, 0, pathReps);
  const { files } = getDirContent(dirPath.toLowerCase(), pathReps, idx.dirsInfo);
  let names = files.map((f) => f.split('/').pop());
  if (ext) names = names.filter((f) => f.toLowerCase().endsWith(ext.toLowerCase()));
  return names.sort();
}
