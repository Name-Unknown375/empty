import { getStore } from '@netlify/blobs';
import { randomBytes } from 'node:crypto';

// Short share links for the event-layout planner (Phase 2.1).
//
//   POST /api/share        body = the planner's URL-hash payload (the exact
//                          string the planner puts after '#s=', i.e. the
//                          encodeURIComponent'd v2 state string — printable
//                          ASCII starting with the '2*' discriminator).
//                          → 200 {"id":"Ab3xY9Qk","url":"https://www.foreverpartyrentals.com/p/Ab3xY9Qk"}
//   GET  /api/share/<id>   → the stored payload as text/plain, cached
//                          immutably (payloads are write-once, never edited).
//
// Payloads land in the "planner-shares" Netlify Blobs store keyed by an
// 8-char base62 id, with a {created} metadata stamp for later housekeeping.
// The /p/<id> page (a _redirects rewrite of event-layout-planner.html)
// resolves the id client-side and hands the payload to the planner via the
// existing #s= hash mechanism — so the embed needs no changes to load them.
//
// Short links are a best-effort enhancement: the planner always has the
// plain hash-link path to fall back on, so failures here return honest
// error statuses and let the client degrade gracefully.

const MAX_PAYLOAD_BYTES = 32 * 1024;
const RATE_LIMIT_PER_HOUR = 30;
const ID_RE = /^[A-Za-z0-9]{8}$/;
const SHARE_ORIGIN = 'https://www.foreverpartyrentals.com';

// Pure validation, exported for unit tests. Returns null when the payload
// is acceptable, or a short reason string when it isn't.
//
// The payload is validated as-stored (URL-encoded form): the planner's
// encodeStateForUrl() returns encodeURIComponent(raw) where raw starts with
// '2*' — and since encodeURIComponent leaves '2' and '*' untouched, the
// encoded form keeps the v2 prefix and is printable ASCII by construction.
export function validatePayload(text) {
  if (typeof text !== 'string' || text.length === 0) return 'empty';
  if (text.length > MAX_PAYLOAD_BYTES) return 'too-large';
  if (!text.startsWith('2*')) return 'bad-prefix';
  // Printable ASCII only (no control chars, no raw unicode — the planner
  // URL-encodes anything exotic before it ever reaches us).
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) return 'bad-chars';
  }
  return null;
}

// 8 chars of base62 ≈ 47 bits — collision-free in practice at our volume
// (we still double-check before writing). Rejection sampling keeps the
// distribution uniform: bytes ≥ 248 (= 62 × 4) are discarded.
export function generateId() {
  let id = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  while (id.length < 8) {
    for (const b of randomBytes(16)) {
      if (b < 248) {
        id += chars[b % 62];
        if (id.length === 8) break;
      }
    }
  }
  return id;
}

// Per-IP hourly counter, stored in the same blob store under a "rate/"
// prefix (ids are exactly 8 alphanumerics, so the namespaces can't clash).
// Read-then-write isn't atomic, but an off-by-a-few race on a courtesy
// limit is fine — this exists to stop runaway scripts, not adversaries.
async function underRateLimit(store, ip) {
  const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const key = `rate/${ip}/${hour}`;
  const count = parseInt((await store.get(key)) || '0', 10) || 0;
  if (count >= RATE_LIMIT_PER_HOUR) return false;
  await store.set(key, String(count + 1));
  return true;
}

export default async (req, context) => {
  const pathname = new URL(req.url).pathname.replace(/\/+$/, '');

  if (req.method === 'GET') {
    const id = (context && context.params && context.params.id) ||
               pathname.split('/').pop();
    if (!ID_RE.test(id || '')) return new Response('Not found', { status: 404 });
    let payload;
    try {
      payload = await getStore('planner-shares').get(id);
    } catch (err) {
      console.log('share blob read failed:', err.message);
      return new Response('Share service unavailable', { status: 503 });
    }
    if (payload == null) return new Response('Not found', { status: 404 });
    return new Response(payload, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        // Payloads are immutable once written, so let browsers and the CDN
        // cache resolved links for a year.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  if (req.method === 'POST') {
    // Creation only lives at the bare collection path.
    if (pathname !== '/api/share') return new Response('Not found', { status: 404 });

    let text;
    try {
      text = await req.text();
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    const reason = validatePayload(text);
    if (reason) return new Response(`Bad request: ${reason}`, { status: 400 });

    try {
      const store = getStore('planner-shares');

      const ip = (context && context.ip) ||
                 req.headers.get('x-nf-client-connection-ip') || 'unknown';
      if (!(await underRateLimit(store, ip))) {
        return new Response('Too many share links — try again in an hour', {
          status: 429,
          headers: { 'Retry-After': '3600' },
        });
      }

      let id = generateId();
      for (let i = 0; i < 3 && (await store.getMetadata(id)) !== null; i++) {
        id = generateId(); // astronomically unlikely, but cheap to be sure
      }
      await store.set(id, text, {
        metadata: { created: new Date().toISOString() },
      });

      return Response.json({ id, url: `${SHARE_ORIGIN}/p/${id}` });
    } catch (err) {
      console.log('share blob write failed:', err.message);
      return new Response('Share service unavailable', { status: 503 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = { path: ['/api/share', '/api/share/:id'] };
