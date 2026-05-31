// Auto-update the local translation cache from a dedicated GitHub repo.
// Every patcher run: read remote manifest, and if its version is newer than the
// local one, download translations.pl.json.gz, gunzip it into the cache.
// Fully offline-safe: any network error -> keep using the bundled local cache.
import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);
const ROOT = path.join(import.meta.dirname, '..');
const CACHE_DIR = path.join(ROOT, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'translations.pl.json');
const LOCAL_MANIFEST = path.join(CACHE_DIR, 'manifest.json');

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf-8')); } catch { return null; }
}

// Resolve the repo base URL: explicit arg > env > patcher.config.json.
export async function resolveBaseUrl(explicit) {
  if (explicit) return explicit;
  if (process.env.PL_TRANSLATIONS_URL) return process.env.PL_TRANSLATIONS_URL;
  const cfg = await readJson(path.join(ROOT, 'patcher.config.json'));
  return cfg?.translationsBaseUrl ?? null;
}

/**
 * Check the remote repo and update the local cache if a newer version exists.
 * @returns { status: 'updated'|'current'|'offline'|'disabled', version?, count? }
 */
export async function pullLatest(baseUrl) {
  baseUrl = (await resolveBaseUrl(baseUrl))?.replace(/\/+$/, '');
  if (!baseUrl || baseUrl.includes('USER/poe2-polish-translations')) {
    return { status: 'disabled' }; // not configured yet
  }
  let remote;
  try {
    const res = await fetch(`${baseUrl}/manifest.json`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    remote = await res.json();
  } catch {
    return { status: 'offline' }; // no network -> use whatever cache we have
  }

  const local = await readJson(LOCAL_MANIFEST);
  if (local && Number(local.version) >= Number(remote.version)) {
    return { status: 'current', version: local.version, count: local.count };
  }

  // Newer remote -> download + decompress.
  try {
    const res = await fetch(`${baseUrl}/translations.pl.json.gz`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const gz = Buffer.from(await res.arrayBuffer());
    const json = await gunzip(gz);
    JSON.parse(json.toString('utf-8')); // validate before overwriting
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, json);
    await fs.writeFile(LOCAL_MANIFEST, JSON.stringify(remote));
    return { status: 'updated', version: remote.version, count: remote.count };
  } catch {
    return { status: 'offline' };
  }
}
