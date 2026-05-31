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
