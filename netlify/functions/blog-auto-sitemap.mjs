// Sitemap for Outrank auto-published articles served by blog-article.mjs.
// ---------------------------------------------------------------------------
// Those articles are noindex (see blog-article.mjs). Listing them here caused
// Google to treat Forever Party Rentals as a national directory (Brampton,
// Fernie, Mactaquac) and duplicated real city URLs (/blog/vancouver-party-rentals).
// Return an empty urlset so GSC's existing sitemap submission stays 200
// without submitting noindexed URLs.

export default async function handler() {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    '</urlset>\n';

  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=60',
    },
  });
}

export const config = { path: '/sitemap-blog-auto.xml' };
