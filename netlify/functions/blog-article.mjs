import { getStore } from '@netlify/blobs';
import sanitizeHtml from 'sanitize-html';

// Dynamic renderer for Outrank auto-published blog articles.
// ---------------------------------------------------------------------------
// Outrank POSTs articles to /api/outrank-webhook, which stores them in the
// "outrank-articles" Netlify Blobs store. This function serves those articles
// as live, indexable pages at /blog/<slug> WITHOUT a site rebuild (the static
// site/ bundle is immutable between deploys, so a function is the only way to
// publish on receipt).
//
// ROUTING SAFETY: `preferStatic: true` means Netlify serves an existing static
// file first and only invokes this function when NO static asset matches. So
// the 28 hand-built /blog/*.html pages are served as-is; only the missing
// Outrank slugs reach this handler. Do not remove preferStatic — without it a
// function at /blog/* intercepts EVERY blog URL (functions run before static).
//
// "Hidden from view": these slugs are never added to site/blog/posts.json, so
// the blog hub (/blog/) never lists them. They are reachable only by direct URL
// and the sitemap (/sitemap-blog-auto.xml) — orphan, but live and verifiable,
// which is what Outrank's verification needs.
//
// INDEXING: ROBOTS below is the single switch. 'index,follow' = Google indexes
// these AI pages (coherent with listing them in a sitemap). Flip to
// 'noindex,follow' to serve + verify with Outrank but keep them out of Google
// (if you do, also drop them from the sitemap to avoid a GSC "noindex in
// sitemap" warning).
const ROBOTS = 'index,follow,max-image-preview:large';

const SITE = 'https://www.foreverpartyrentals.com';
const DEFAULT_OG = `${SITE}/images/og/social-card.webp`;

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// JSON-LD-safe serializer: JSON.stringify does NOT escape "</script>", so
// attacker-controlled strings (e.g. an article title) could close the JSON-LD
// block early and inject markup. Unicode-escape the HTML-significant chars —
// still valid JSON, parsed identically by Google.
const jsonLd = (obj) =>
  JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

// Outrank's content_html is third-party input stored verbatim in Blobs; it
// MUST be sanitized at render time (stored-XSS sink — 2026-06-18 audit HIGH #1).
// Allowlist covers normal article markup only: no script/style/iframe/form,
// no event handlers, no javascript:/data: URLs. Sanitizing on render (not
// ingest) means previously stored records are cleaned too.
const SANITIZE_OPTS = {
  allowedTags: [
    'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'blockquote',
    'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 's', 'sup', 'sub',
    'a', 'img', 'figure', 'figcaption', 'code', 'pre', 'span', 'div',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
    '*': ['id'], // heading anchors for in-page links
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    // External links opened by article content shouldn't leak an opener handle.
    a: (tagName, attribs) =>
      attribs.target === '_blank'
        ? { tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } }
        : { tagName, attribs },
  },
};

function htmlResponse(status, body) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Short edge cache so a freshly published article appears quickly but
      // repeat hits are cheap. Adjust if you want longer caching.
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  });
}

export function render(article, slug) {
  const url = `${SITE}/blog/${slug}`;
  const title = article.title || 'Forever Party Rentals';
  const desc = article.meta_description || '';
  const ogImage = article.image_url || DEFAULT_OG;
  const topic = Array.isArray(article.tags) && article.tags[0] ? article.tags[0] : 'Guides';
  const createdIso = article.created_at || article._receivedAt || '';
  let dateHuman = '';
  if (createdIso) {
    // No Date.now()/new Date() needed — parse the supplied ISO timestamp only.
    const d = new Date(createdIso);
    if (!Number.isNaN(d.getTime())) {
      dateHuman = d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
    }
  }

  // Article body: prefer Outrank's HTML (sanitized — see SANITIZE_OPTS);
  // fall back to escaped markdown.
  let body = '';
  if (article.content_html) {
    // Drop a leading <h1> BEFORE sanitizing (h1 isn't in the allowlist, so
    // after sanitization it would survive as bare text) — the hero already
    // renders the title.
    const raw = String(article.content_html).replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>/i, '');
    body = sanitizeHtml(raw, SANITIZE_OPTS);
  } else if (article.content_markdown) {
    body = article.content_markdown
      .split(/\n{2,}/)
      .map((p) => `<p>${esc(p.trim())}</p>`)
      .join('\n');
  }

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: desc,
    image: ogImage,
    datePublished: createdIso || undefined,
    author: { '@type': 'Organization', name: 'Forever Party Rentals' },
    publisher: {
      '@type': 'Organization',
      name: 'Forever Party Rentals',
      logo: { '@type': 'ImageObject', url: `${SITE}/images/logo.webp` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog/` },
      { '@type': 'ListItem', position: 3, name: title, item: url },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<!-- Google Tag Manager — defer gtm.js load until idle to protect LCP -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var loadGTM=function(){var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);};
if('requestIdleCallback' in w){w.requestIdleCallback(loadGTM,{timeout:3000});}
else{w.addEventListener('load',function(){setTimeout(loadGTM,1500);});}
})(window,document,'script','dataLayer','GTM-KC35GGRQ');</script>
<!-- End Google Tag Manager -->
<!-- Meta Pixel — fbq stub queues events immediately; fbevents.js deferred until idle to protect LCP (same pattern as GTM above) -->
<script>!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];var loadPixel=function(){t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s);};
if('requestIdleCallback' in f){f.requestIdleCallback(loadPixel,{timeout:3000});}
else{f.addEventListener('load',function(){setTimeout(loadPixel,1500);});}}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '1497259508391912');
fbq('track', 'PageView');</script>
<!-- End Meta Pixel -->
<!-- Microsoft Clarity — clarity stub queues calls immediately; clarity.js deferred until idle to protect LCP (same pattern as GTM above) -->
<script>(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
var loadClarity=function(){t=l.createElement(r);t.async=1;
t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);};
if('requestIdleCallback' in c){c.requestIdleCallback(loadClarity,{timeout:3000});}
else{c.addEventListener('load',function(){setTimeout(loadClarity,1500);});}
})(window,document,"clarity","script","qu3zf92dem");</script>
<!-- Clarity page tags. These articles are rendered by this function and have no
     static file, so site/shared.js (which tags every other page) never runs
     here — and loading it would be pointless: none of its inits have a target
     on this page, and it would plant a second cache-bust literal in a file the
     documented sed pass does not cover. The class is statically known anyway.
     article_source separates auto-published Outrank articles from the
     hand-written posts in site/blog/. No guard needed: the stub above assigns
     window.clarity synchronously. -->
<script>clarity('set','page_class','blog-post');clarity('set','article_source','outrank');</script>
<!-- End Microsoft Clarity -->
<meta charset="UTF-8"/>
<link rel="icon" type="image/svg+xml" href="/favicon.svg"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(title)} | Forever Party Rentals</title>
<meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${url}"/>
<meta name="robots" content="${ROBOTS}"/>
<link rel="alternate" hreflang="en-CA" href="${url}"/>
<link rel="alternate" hreflang="x-default" href="${url}"/>
<meta property="og:type" content="article"/>
<meta property="og:locale" content="en_CA"/>
<meta property="og:site_name" content="Forever Party Rentals"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:image" content="${esc(ogImage)}"/>
<meta name="twitter:card" content="summary_large_image"/>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/shared.css?v=26"/>
<script type="application/ld+json">${jsonLd(articleLd)}</script>
<script type="application/ld+json">${jsonLd(breadcrumbLd)}</script>
</head>
<body>
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KC35GGRQ"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
<!-- Meta Pixel (noscript) -->
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=1497259508391912&amp;ev=PageView&amp;noscript=1"
/></noscript>
<!-- End Meta Pixel (noscript) -->
<a href="#main" class="skip-link">Skip to main content</a>
<header id="header">
  <nav class="nav" aria-label="Primary">
    <a class="nav-logo" href="/" aria-label="Forever Party Rentals — home"><img src="/images/logo.webp" alt="Forever Party Rentals" width="125" height="125"/></a>
    <div class="nav-links"><div class="nav-link"><a href="/blog/">Blog</a></div><div class="nav-link"><a href="/rentals">Browse Rentals</a></div></div>
  </nav>
</header>
<main id="main">
<section class="post-hero hero-ink">
  <div class="post-hero-inner">
    <div class="breadcrumb"><a href="/">Home</a> › <a href="/blog/">Blog</a> › <span>${esc(title)}</span></div>
    <span class="post-topic">${esc(topic)}</span>
    <h1>${esc(title)}</h1>
    ${desc ? `<p class="post-deck">${esc(desc)}</p>` : ''}
    ${dateHuman ? `<div class="post-meta"><time datetime="${esc(createdIso)}">${esc(dateHuman)}</time></div>` : ''}
  </div>
</section>
<div class="post-layout">
  <article class="post-body">
${body}
  </article>
</div>
</main>
<footer id="footer">
  <div class="footer-inner">
    <p>© Forever Party Rentals — tent, chair, table &amp; event rentals across the Lower Mainland.
    <a href="/rentals">Browse rentals</a> · <a href="/blog/">More guides</a> · <a href="/contact">Contact</a></p>
  </div>
</footer>
</body>
</html>`;
}

const NOT_FOUND = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Not found</title><meta name="robots" content="noindex"/><link rel="stylesheet" href="/shared.css?v=26"/></head><body><main id="main" style="max-width:640px;margin:8rem auto;padding:0 1.5rem;text-align:center"><h1>Page not found</h1><p>This article isn't available. <a href="/blog/">Back to the blog</a>.</p></main></body></html>`;

export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  const raw = path.replace(/^\/blog\//, '');
  const slug = raw.replace(/[^a-zA-Z0-9-_]/g, '');
  if (!slug) return htmlResponse(404, NOT_FOUND);

  const store = getStore('outrank-articles');
  const article = await store.get(`articles/${slug}`, { type: 'json' });

  // Render any received article. Setting `_status: 'unpublished'` on the blob
  // is the kill-switch that pulls a slug back out of public view (matches the
  // gate in blog-auto-sitemap.mjs). Legacy records stored as 'draft' by the
  // old webhook therefore render too — exactly the behavior we want now that
  // articles auto-publish.
  if (!article || article._status === 'unpublished') {
    return htmlResponse(404, NOT_FOUND);
  }

  return htmlResponse(200, render(article, slug));
}

export const config = { path: '/blog/*', preferStatic: true };
