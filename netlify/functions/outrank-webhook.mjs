import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual } from 'node:crypto';

// Outrank.so webhook receiver — https://www.outrank.so/docs/webhook
//
// Outrank POSTs { event_type: "publish_articles", timestamp, data: { articles: [...] } }
// with each article carrying: id, title, content_markdown, content_html,
// meta_description, created_at, image_url, slug, tags.
//
// DESIGN: received articles are stored in the "outrank-articles" Netlify Blobs
// store and flagged `_status: 'published'`. The companion blog-article.mjs
// function serves them live at /blog/<slug> (preferStatic, so the hand-built
// static blog pages are untouched), and blog-auto-sitemap.mjs lists them at
// /sitemap-blog-auto.xml. They are NOT added to site/blog/posts.json, so the
// blog hub never lists them — "hidden from view" but live + verifiable, which
// is what Outrank's verification needs.
//
// To pull a slug back out of public view, set its `_status` to 'unpublished'
// (both the renderer and the sitemap hide it). Review the stored records via
// GET (same bearer token):
//   GET /api/outrank-webhook            → JSON index of stored articles
//   GET /api/outrank-webhook?slug=<s>   → full article JSON (markdown + html)
//
// Auth: Outrank sends "Authorization: Bearer <token>". The token must match
// the OUTRANK_WEBHOOK_TOKEN environment variable (set in Netlify UI →
// Site configuration → Environment variables; paste the same value into
// the Outrank dashboard when creating the webhook integration).
// Hardened 2026-07 (audit findings): constant-time token comparison +
// timestamp replay window on POSTs. Rendering-side XSS sanitization lives in
// blog-article.mjs (content_html is sanitized at render, never trusted).

function authorized(req) {
  const token = process.env.OUTRANK_WEBHOOK_TOKEN;
  if (!token) return false; // unset = integration disabled
  const header = req.headers.get('authorization') || '';
  // Constant-time comparison (2026-06-18 audit): hash both sides to equal
  // length first — timingSafeEqual throws on length mismatch, and comparing
  // digests leaks neither content nor length of the expected token.
  const a = createHash('sha256').update(header).digest();
  const b = createHash('sha256').update(`Bearer ${token}`).digest();
  return timingSafeEqual(a, b);
}

// Replay guard (2026-06-18 audit): Outrank sends `timestamp` in the payload.
// Reject stale timestamps when one is present and parseable (ISO 8601 or
// epoch seconds/millis); tolerate a missing/unparseable field rather than
// break ingestion on an undocumented format change.
const REPLAY_WINDOW_MS = 10 * 60 * 1000;
function isStale(timestamp) {
  if (timestamp == null || timestamp === '') return false;
  let t;
  if (typeof timestamp === 'number' || /^\d+$/.test(String(timestamp))) {
    const n = Number(timestamp);
    t = n < 1e12 ? n * 1000 : n; // epoch seconds vs milliseconds
  } else {
    t = Date.parse(String(timestamp));
  }
  if (!Number.isFinite(t)) return false;
  return Math.abs(Date.now() - t) > REPLAY_WINDOW_MS;
}

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export default async function handler(req) {
  if (!authorized(req)) return json(401, { error: 'unauthorized' });

  const store = getStore('outrank-articles');

  if (req.method === 'GET') {
    const slug = new URL(req.url).searchParams.get('slug');
    if (slug) {
      const article = await store.get(`articles/${slug}`, { type: 'json' });
      return article ? json(200, article) : json(404, { error: 'not found' });
    }
    const index = (await store.get('index', { type: 'json' })) || [];
    return json(200, { count: index.length, drafts: index });
  }

  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'invalid JSON' });
  }

  if (isStale(payload?.timestamp)) {
    return json(401, { error: 'stale timestamp (possible replay)' });
  }

  const KNOWN_EVENTS = ['publish_articles', 'update_article', 'update_articles'];
  // publish_articles → data.articles (array); update_article → data.article
  // (single object). Normalize both to one array. (Outrank docs: the singular
  // `update_article` payload nests the record under data.article, not
  // data.articles — the old array-only check rejected every update event.)
  const articles = Array.isArray(payload?.data?.articles)
    ? payload.data.articles
    : payload?.data?.article && typeof payload.data.article === 'object'
      ? [payload.data.article]
      : null;
  if (!KNOWN_EVENTS.includes(payload?.event_type) || !articles) {
    return json(400, { error: 'unexpected payload shape' });
  }

  const index = (await store.get('index', { type: 'json' })) || [];
  const received = [];

  for (const article of articles) {
    const slug = String(article.slug || article.id || '').replace(/[^a-zA-Z0-9-_]/g, '');
    if (!slug) continue;
    await store.set(
      `articles/${slug}`,
      JSON.stringify({
        ...article,
        _receivedAt: new Date().toISOString(),
        _status: 'published', // 200 for Outrank verification; renderer noindexes
        _event: payload.event_type,
      }),
    );
    const entry = {
      slug,
      title: article.title || '',
      created_at: article.created_at || '',
      receivedAt: new Date().toISOString(),
    };
    const i = index.findIndex((e) => e.slug === slug);
    if (i >= 0) index[i] = entry;
    else index.push(entry);
    received.push(slug);
  }

  await store.set('index', JSON.stringify(index));
  return json(200, { ok: true, stored: received.length, slugs: received });
}

export const config = { path: '/api/outrank-webhook' };
