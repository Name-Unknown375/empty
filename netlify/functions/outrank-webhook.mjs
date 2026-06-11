import { getStore } from '@netlify/blobs';

// Outrank.so webhook receiver — https://www.outrank.so/docs/webhook
//
// Outrank POSTs { event_type: "publish_articles", timestamp, data: { articles: [...] } }
// with each article carrying: id, title, content_markdown, content_html,
// meta_description, created_at, image_url, slug, tags.
//
// DESIGN: articles are stored as DRAFTS in the "outrank-articles" Netlify
// Blobs store — they are NOT auto-published to the live blog. The blog is
// hand-curated (see _build/style_guide.md); the March 2026 core update
// explicitly filters templated/weak AI content, so every Outrank draft gets
// a human pass before it ships. Review drafts via GET (same bearer token):
//   GET /api/outrank-webhook            → JSON index of stored drafts
//   GET /api/outrank-webhook?slug=<s>   → full article JSON (markdown + html)
//
// Auth: Outrank sends "Authorization: Bearer <token>". The token must match
// the OUTRANK_WEBHOOK_TOKEN environment variable (set in Netlify UI →
// Site configuration → Environment variables; paste the same value into
// the Outrank dashboard when creating the webhook integration).

function authorized(req) {
  const token = process.env.OUTRANK_WEBHOOK_TOKEN;
  if (!token) return false; // unset = integration disabled
  const header = req.headers.get('authorization') || '';
  return header === `Bearer ${token}`;
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

  if (payload?.event_type !== 'publish_articles' || !Array.isArray(payload?.data?.articles)) {
    return json(400, { error: 'unexpected payload shape' });
  }

  const index = (await store.get('index', { type: 'json' })) || [];
  const received = [];

  for (const article of payload.data.articles) {
    const slug = String(article.slug || article.id || '').replace(/[^a-zA-Z0-9-_]/g, '');
    if (!slug) continue;
    await store.set(
      `articles/${slug}`,
      JSON.stringify({ ...article, _receivedAt: new Date().toISOString(), _status: 'draft' }),
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
