// Local static site and the real, read-only firmware endpoint. Never deploys.
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import firmware from '../api/firmware.js';

const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const port = Number(process.env.PORT || 9847);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json' };

createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return;
    }
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === '/api/firmware') {
      const response = await firmware(new Request(url));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
      return;
    }
    const pathname = decodeURIComponent(url.pathname === '/' ? '/download.html' : url.pathname);
    if (pathname.split('/').some(part => part.startsWith('.')) || pathname.startsWith('/api/')) {
      res.writeHead(404).end(); return;
    }
    const path = await realpath(resolve(root, '.' + pathname));
    if (!path.startsWith(root + sep) || !types[extname(path)]) {
      res.writeHead(404).end(); return;
    }
    const bytes = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)], 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 500).end();
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Local preview: http://127.0.0.1:${port}/download.html`);
});
