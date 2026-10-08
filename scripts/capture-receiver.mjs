// Dev tool: receives a key-art image rendered by the game in the browser (POST) and writes it to src/ui/art/.
// Local only (127.0.0.1), whitelisted file names, size-capped. Usage: node scripts/capture-receiver.mjs
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui', 'art'); // imported by styles.css (Vite hashes + base path)
const ALLOWED = /^menu-(4k|1080|720)\.(webp|jpg|png)$/;
const MAX = 25 * 1024 * 1024;
mkdirSync(OUT, { recursive: true });

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const name = url.searchParams.get('name') ?? '';
  if (req.method !== 'POST' || url.pathname !== '/save' || !ALLOWED.test(name)) { res.writeHead(400).end('bad request'); return; }
  const chunks = [];
  let size = 0;
  req.on('data', c => { size += c.length; if (size > MAX) { res.writeHead(413).end('too large'); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    if (size > MAX) return;
    writeFileSync(join(OUT, name), Buffer.concat(chunks));
    console.log(`saved ${name} (${(size / 1024).toFixed(0)} KB)`);
    res.writeHead(200).end('ok');
  });
}).listen(5199, '127.0.0.1', () => console.log('capture receiver on http://127.0.0.1:5199'));
