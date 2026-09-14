// Minimal static server. The app loads ES modules from ./core/, which browsers
// refuse to do over file:// — so it needs to be served over http.
//
//   node serve.js        → http://localhost:5173
//   node serve.js 8080   → a different port
//
// Binds 0.0.0.0 so you can open it on your phone over the same wifi.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';

const ROOT = import.meta.dirname;
const PORT = Number(process.argv[2]) || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // Match GitHub Pages: a directory serves its index.html.
    if (path.endsWith('/')) path += 'index.html';

    // Keep requests inside the project directory.
    const full = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    if (!full.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(full);
    if (!info.isFile()) throw new Error('not a file');

    const body = await readFile(full);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    }).end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((n) => n && n.family === 'IPv4' && !n.internal)?.address;

  console.log(`\n  Rep Public`);
  console.log(`  →  http://localhost:${PORT}`);
  if (lan) console.log(`  →  http://${lan}:${PORT}   (open this one on your phone)`);
  console.log(`\n  Ctrl+C to stop.\n`);
});
