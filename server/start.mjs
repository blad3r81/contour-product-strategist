import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { route } from './routes.js';
import { startMonitor } from './monitor.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (process.env.CONTOUR_CREDENTIALS_FILE) process.loadEnvFile(process.env.CONTOUR_CREDENTIALS_FILE);
const dist = await realpath(resolve(root, 'dist'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  try {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(`http://${req.headers.host}`).hostname) ||
      req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) { res.writeHead(403).end(); return; }
  } catch { res.writeHead(403).end(); return; }
  if (req.url.startsWith('/api/')) return route(req.url.split('?')[0].slice(5), req, res, true);
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.split('/').some(part => part.startsWith('.')) || /[\\\0]/.test(pathname)) { res.writeHead(403).end(); return; }
    let file = resolve(dist, `.${pathname}`);
    if (file !== dist && !file.startsWith(dist + sep)) { res.writeHead(403).end(); return; }
    let info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
      if (extname(pathname)) { res.writeHead(404).end(); return; }
      file = resolve(dist, 'index.html'); info = await stat(file);
    }
    if (!(await realpath(file)).startsWith(dist + sep)) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600');
    res.setHeader('Accept-Ranges', 'bytes');
    let start = 0, end = info.size - 1;
    if (req.headers.range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if (!match || (start = Number(match[1])) >= info.size || (end = match[2] ? Number(match[2]) : end) < start || end >= info.size) {
        res.setHeader('Content-Range', `bytes */${info.size}`); res.writeHead(416).end(); return;
      }
      res.statusCode = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
    }
    res.setHeader('Content-Length', Math.max(0, end - start + 1));
    if (req.method === 'HEAD' || info.size === 0) res.end();
    else createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
  } catch { if (!res.headersSent) res.writeHead(400); res.end(); }
});
// Local installation only; public multi-user operation needs authentication and shared storage.
server.listen(Number(process.env.PORT || 5176), '127.0.0.1', () => console.log(`Contour: http://127.0.0.1:${server.address().port}`));
server.requestTimeout = 420000;
const stop = startMonitor();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stop(); server.close(); });
