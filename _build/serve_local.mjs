// Static-site preview with pretty-URL fallback — node twin of serve_local.py.
// Exists because the Claude preview sandbox can launch node but not the
// CommandLineTools python against ~/Documents. Same resolution order:
//   /foo → foo (file) → foo/index.html → foo.html → 404
// Usage: node _build/serve_local.mjs [PORT]   (default 8000)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'site');
const PORT = parseInt(process.argv[2] || '8000', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml',
  '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function resolvePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let p = join(ROOT, clean);
  if (!p.startsWith(ROOT)) return null;
  if (existsSync(p) && statSync(p).isFile()) return p;
  if (existsSync(p) && statSync(p).isDirectory() && existsSync(join(p, 'index.html'))) return join(p, 'index.html');
  if (!extname(clean) && existsSync(p + '.html')) return p + '.html';
  return null;
}

createServer(async (req, res) => {
  const p = resolvePath(req.url || '/');
  if (!p) {
    const nf = join(ROOT, '404.html');
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(existsSync(nf) ? await readFile(nf) : 'Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(p).toLowerCase()] || 'application/octet-stream' });
  res.end(await readFile(p));
}).listen(PORT, () => console.log(`Serving ${ROOT} at http://localhost:${PORT}/ (pretty URLs on)`));
