import { getStore } from '@netlify/blobs';

// Sitemap for Outrank auto-published articles served by blog-article.mjs.
// ---------------------------------------------------------------------------
// The curated, hand-built pages live in the static site/sitemap.xml (generated
// by _build/generate_sitemap.py). That generator walks the static site/ folder
// and CANNOT see these dynamically-served articles, so they get their own
// sitemap here. It is advertised via a second `Sitemap:` line in robots.txt.
//
// Articles are listed unless flagged _status === 'unpublished' — same gate as
// the page renderer, so the sitemap never points at a URL that would 404.

const SITE = 'https://www.foreverpartyrentals.com';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export default async function handler() {
  const store = getStore('outrank-articles');
  const index = (await store.get('index', { type: 'json' })) || [];

  // The index entry is a summary; confirm publish status from the full record
  // so an unpublished/removed article never leaks into the sitemap.
  const rows = [];
  for (const entry of index) {
    const slug = String(entry.slug || '').replace(/[^a-zA-Z0-9-_]/g, '');
    if (!slug) continue;
    const article = await store.get(`articles/${slug}`, { type: 'json' });
    if (!article || article._status === 'unpublished') continue;
    const lastmod = entry.receivedAt || article._receivedAt || entry.created_at || '';
    rows.push({ slug, lastmod });
  }

  const urls = rows
    .map(({ slug, lastmod }) => {
      const lm = lastmod ? `\n    <lastmod>${esc(lastmod)}</lastmod>` : '';
      return `  <url>\n    <loc>${esc(`${SITE}/blog/${slug}`)}</loc>${lm}\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=300',
    },
  });
}

export const config = { path: '/sitemap-blog-auto.xml' };
