// Validate remote auto-update against a local HTTP server serving translations-repo/.
import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import { pullLatest } from '../src/remote.mjs';

const REPO = path.join(import.meta.dirname, '..', 'translations-repo');
const CACHEMAN = path.join(import.meta.dirname, '..', '.cache', 'manifest.json');
await fs.rm(CACHEMAN, { force: true }); // simulate a fresh user with no manifest yet

const server = http.createServer(async (req, res) => {
  try { res.writeHead(200); res.end(await fs.readFile(path.join(REPO, req.url.replace(/^\//, '')))); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}`;

console.log('1st run (no local manifest):', await pullLatest(url));
console.log('2nd run (already current):  ', await pullLatest(url));
console.log('disabled (placeholder URL): ', await pullLatest('https://raw.githubusercontent.com/USER/poe2-polish-translations/main'));
console.log('offline (dead URL):         ', await pullLatest('http://127.0.0.1:1'));

const c = JSON.parse(await fs.readFile(path.join(import.meta.dirname, '..', '.cache', 'translations.pl.json'), 'utf-8'));
console.log('cache after update:', Object.keys(c).length, 'entries | Error =>', JSON.stringify(c['Error']));
server.close();
