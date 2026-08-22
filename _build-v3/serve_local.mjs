// Static-site preview with pretty-URL fallback and Accept negotiation.
// Node twin of serve_local.py. Serves site-v3 (the live publish dir).
// Usage: node _build-v3/serve_local.mjs [PORT]   (default 8000)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HTML_CONTENT_TYPE,
  MARKDOWN_CONTENT_TYPE,
  MARKDOWN_TYPE,
  VARY_VALUE,
  htmlToMarkdown,
  negotiate,
  notAcceptableBody,
  shouldSkipPath,
  siblingMdPath,
} from '../netlify/lib/accept.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'site-v3');
const PORT = parseInt(process.argv[2] || '8000', 10);

const MIME = {
  '.html': HTML_CONTENT_TYPE, '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8', '.md': MARKDOWN_CONTENT_TYPE,
  '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function resolvePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let p = join(ROOT, clean);
  if (!p.startsWith(ROOT)) return null;
  if (existsSync(p) && statSync(p).isFile()) return p;
  if (existsSync(p) && statSync(p).isDirectory() && existsSync(join(p, 'index.html'))) {
    return join(p, 'index.html');
  }
  if (!extname(clean) && existsSync(p + '.html')) return p + '.html';
  return null;
}

function send(res, status, body, contentType, extra = {}, method = 'GET') {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body ?? '');
  const headers = {
    'Content-Type': contentType,
    'Content-Length': buf.length,
    Vary: VARY_VALUE,
    ...extra,
  };
  res.writeHead(status, headers);
  res.end(method === 'HEAD' ? undefined : buf);
}

async function markdown404() {
  const nf = join(ROOT, '404.md');
  if (existsSync(nf)) return readFile(nf);
  const { fallback404Markdown } = await import('../netlify/lib/accept.mjs');
  return fallback404Markdown();
}

createServer(async (req, res) => {
  try {
    const urlPath = (req.url || '/').split('?')[0];
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }

    const accept = req.headers.accept;

    if (shouldSkipPath(urlPath)) {
      const p = resolvePath(urlPath);
      if (!p) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const body = await readFile(p);
      res.writeHead(200, {
        'Content-Type': MIME[extname(p).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length,
      });
      res.end(method === 'HEAD' ? undefined : body);
      return;
    }

    if (urlPath.toLowerCase().endsWith('.md')) {
      const p = resolvePath(urlPath);
      if (!p) {
        send(res, 404, await markdown404(), MARKDOWN_CONTENT_TYPE, {}, method);
        return;
      }
      send(res, 200, await readFile(p), MARKDOWN_CONTENT_TYPE, {}, method);
      return;
    }

    const choice = negotiate(accept);
    if (choice == null) {
      send(res, 406, notAcceptableBody(accept), 'text/plain; charset=utf-8', {
        'Cache-Control': 'no-store',
      }, method);
      return;
    }

    if (choice === MARKDOWN_TYPE) {
      const twinRel = siblingMdPath(urlPath);
      const twin = resolvePath(twinRel);
      if (twin && extname(twin).toLowerCase() === '.md') {
        send(res, 200, await readFile(twin), MARKDOWN_CONTENT_TYPE, {}, method);
        return;
      }
      const p = resolvePath(urlPath);
      if (!p) {
        send(res, 404, await markdown404(), MARKDOWN_CONTENT_TYPE, {}, method);
        return;
      }
      const name = p.split('/').pop().toLowerCase();
      const ext = extname(p).toLowerCase();
      if (name === 'llms.txt' || ext === '.md' || ext === '.txt') {
        send(res, 200, await readFile(p), MARKDOWN_CONTENT_TYPE, {}, method);
        return;
      }
      if (ext === '.html' || !ext) {
        const html = await readFile(p, 'utf8');
        const md = htmlToMarkdown(html);
        if (md.trim()) {
          send(res, 200, md, MARKDOWN_CONTENT_TYPE, {}, method);
          return;
        }
      }
      const body = await readFile(p);
      send(res, 200, body, MIME[ext] || HTML_CONTENT_TYPE, {}, method);
      return;
    }

    const p = resolvePath(urlPath);
    if (!p) {
      const nf = join(ROOT, '404.html');
      send(res, 404, existsSync(nf) ? await readFile(nf) : 'Not found', HTML_CONTENT_TYPE, {}, method);
      return;
    }
    const ext = extname(p).toLowerCase();
    let ct = MIME[ext] || 'application/octet-stream';
    if (p.split('/').pop().toLowerCase() === 'llms.txt') ct = MARKDOWN_CONTENT_TYPE;
    send(res, 200, await readFile(p), ct, {}, method);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(err && err.stack ? err.stack : err));
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Serving ${ROOT} at http://127.0.0.1:${PORT}/ (pretty URLs + Accept negotiation)`);
});
