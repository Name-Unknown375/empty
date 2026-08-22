/**
 * Accept negotiation helpers shared by the Netlify Edge Function, local
 * preview server, and unit tests. Web-API-only (no Node, no Deno).
 *
 * Specs: RFC 9110, RFC 7763, acceptmarkdown.com (q-values, Vary, 406).
 */

export const HTML_TYPE = 'text/html';
export const MARKDOWN_TYPE = 'text/markdown';
export const SUPPORTED_TYPES = [HTML_TYPE, MARKDOWN_TYPE];
export const DEFAULT_TYPE = HTML_TYPE;

export const MARKDOWN_CONTENT_TYPE = 'text/markdown; charset=utf-8';
export const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
export const VARY_VALUE = 'Accept, Accept-Encoding';

export const SITE_ORIGIN = 'https://www.foreverpartyrentals.com';

export const SKIP_PREFIXES = ['/api/', '/images/', '/fonts/', '/planner/'];
export const SKIP_EXTS = new Set([
  '.css', '.js', '.mjs', '.map',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico',
  '.woff', '.woff2', '.ttf', '.eot',
  '.mp4', '.webm', '.pdf',
  '.json', '.xml', '.zip',
]);

export const TWIN_HEADER = 'x-markdown-twin';

const FALLBACK_404_MD = `# Page not found

This URL does not exist on Forever Party Rentals.

## Where to go next

- [Site index for agents (llms.txt)](${SITE_ORIGIN}/llms.txt)
- [XML sitemap](${SITE_ORIGIN}/sitemap.xml)
- [Agent skills](${SITE_ORIGIN}/.well-known/agent-skills/index.json)
- [Book rentals](${SITE_ORIGIN}/rentals)
- [Contact](${SITE_ORIGIN}/contact)
- [Home](${SITE_ORIGIN}/)
`;

export function fallback404Markdown() {
  return FALLBACK_404_MD;
}

export function extensionOf(pathname) {
  const base = pathname.split('/').pop() || '';
  const i = base.lastIndexOf('.');
  if (i <= 0) return '';
  return base.slice(i).toLowerCase();
}

export function shouldSkipPath(pathname) {
  const p = (pathname || '/').toLowerCase();
  for (const prefix of SKIP_PREFIXES) {
    if (p === prefix.slice(0, -1) || p.startsWith(prefix)) return true;
  }
  return SKIP_EXTS.has(extensionOf(p));
}

/**
 * Canonical sibling markdown path for a document URL.
 * / → /index.md, /tents → /tents.md, /tents.html → /tents.md,
 * /blog/foo/ → /blog/foo/index.md
 */
export function siblingMdPath(pathname) {
  let p = pathname || '/';
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.endsWith('.md')) return p;
  if (p === '/') return '/index.md';
  if (p.endsWith('/')) return `${p}index.md`;
  if (p.toLowerCase().endsWith('.html')) return `${p.slice(0, -5)}.md`;
  return `${p}.md`;
}

/**
 * Parse one Accept header into { type, subtype, q, specificity } entries.
 * specificity: 3 = type/subtype, 2 = type/*, 1 = * / *
 */
export function parseAccept(header) {
  if (header == null) return null;
  const raw = String(header).trim();
  if (!raw) return [];
  const out = [];
  for (const part of raw.split(',')) {
    const segs = part.trim().split(';').map((s) => s.trim()).filter(Boolean);
    if (!segs.length) continue;
    const media = segs[0].toLowerCase();
    const slash = media.indexOf('/');
    if (slash < 1) continue;
    const type = media.slice(0, slash).trim();
    const subtype = media.slice(slash + 1).trim();
    if (!type || !subtype) continue;
    let q = 1;
    for (let i = 1; i < segs.length; i++) {
      const [k, v] = segs[i].split('=').map((s) => s.trim());
      if (k && k.toLowerCase() === 'q' && v != null) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0 && n <= 1) q = n;
      }
    }
    let specificity = 3;
    if (type === '*' && subtype === '*') specificity = 1;
    else if (subtype === '*') specificity = 2;
    out.push({ type, subtype, q, specificity });
  }
  return out;
}

function matchScore(produced, entries) {
  const [pType, pSub] = produced.toLowerCase().split('/');
  let best = null;
  for (const e of entries) {
    let spec = 0;
    if (e.type === pType && e.subtype === pSub) spec = 3;
    else if (e.type === pType && e.subtype === '*') spec = 2;
    else if (e.type === '*' && e.subtype === '*') spec = 1;
    if (!spec) continue;
    if (!best || spec > best.specificity) best = { specificity: spec, q: e.q };
  }
  if (!best) return 0;
  if (best.q === 0) return 0;
  return best.q;
}

/**
 * Pick the representation to serve.
 * Returns 'text/html' | 'text/markdown' | null (→ 406).
 *
 * Missing Accept → default HTML.
 * Tie on q → default HTML (browsers sending * / *).
 */
export function negotiate(acceptHeader, supported = SUPPORTED_TYPES, defaultType = DEFAULT_TYPE) {
  const entries = parseAccept(acceptHeader);
  if (entries == null) return defaultType;

  const scores = supported.map((type) => ({ type, score: matchScore(type, entries) }));
  let best = null;
  for (const s of scores) {
    if (s.score <= 0) continue;
    if (!best || s.score > best.score) best = s;
    else if (s.score === best.score && s.type === defaultType) best = s;
  }
  if (best) return best.type;

  const anyPositive = entries.some((e) => e.q > 0);
  const defaultRejected = matchScore(defaultType, entries) === 0
    && entries.some((e) => {
      const produced = defaultType.toLowerCase().split('/');
      return e.q === 0 && (
        (e.type === produced[0] && e.subtype === produced[1])
        || (e.type === produced[0] && e.subtype === '*')
        || (e.type === '*' && e.subtype === '*')
      );
    });

  if (anyPositive) return null;
  if (defaultRejected) return null;
  return defaultType;
}

export function mergeVary(existing) {
  const tokens = [];
  const seen = new Set();
  const add = (name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tokens.push(name);
  };
  add('Accept');
  add('Accept-Encoding');
  if (existing) {
    for (const t of String(existing).split(',')) {
      const v = t.trim();
      if (v) add(v);
    }
  }
  return tokens.join(', ');
}

export function notAcceptableBody(requested) {
  const asked = requested == null || String(requested).trim() === ''
    ? '(none)'
    : String(requested).trim();
  return (
    'This resource is available in:\n'
    + '- text/html\n'
    + '- text/markdown\n'
    + `\nYou requested: ${asked}\n`
  );
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });
}

function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function extractMain(html) {
  const s = String(html);
  const main = s.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return main[1];
  const navEnd = s.search(/<!--\s*NAV:END\s*-->/i);
  const footStart = s.search(/<!--\s*FOOTER:START\s*-->/i);
  if (navEnd >= 0 && footStart > navEnd) {
    return s.slice(navEnd, footStart).replace(/<!--\s*NAV:END\s*-->/i, '');
  }
  return s
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, '')
    .replace(/<header\b[\s\S]*?<\/header>/gi, '');
}

function resolveHref(href, origin) {
  if (!href) return '';
  const h = href.trim();
  if (!h || h.startsWith('#') || h.startsWith('javascript:')) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return h;
  const base = origin || SITE_ORIGIN;
  if (h.startsWith('//')) return `https:${h}`;
  if (h.startsWith('/')) return `${base}${h}`;
  return `${base}/${h}`;
}

function convertInline(html, origin) {
  let s = String(html);
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, inner) => `**${stripTags(inner)}**`);
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, inner) => `*${stripTags(inner)}*`);
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, inner) => `\`${stripTags(inner)}\``);
  s = s.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const text = stripTags(inner) || href;
    const url = resolveHref(href, origin);
    return url ? `[${text}](${url})` : text;
  });
  s = s.replace(/<img\b[^>]*>/gi, (tag) => {
    const alt = (tag.match(/alt=["']([^"']*)["']/i) || [])[1] || '';
    const src = (tag.match(/src=["']([^"']+)["']/i) || [])[1] || '';
    const url = resolveHref(src, origin);
    if (!url && !alt) return '';
    return `![${alt}](${url})`;
  });
  return stripTags(s.replace(/<[^>]+>/g, ' '));
}

function convertList(html, ordered, origin) {
  const items = [];
  const re = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  let i = 1;
  while ((m = re.exec(html))) {
    const text = convertInline(m[1], origin);
    if (!text) continue;
    items.push(ordered ? `${i}. ${text}` : `- ${text}`);
    i += 1;
  }
  return items.length ? `\n\n${items.join('\n')}\n\n` : '';
}

function convertTable(html, origin) {
  const rows = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm;
  while ((rm = rowRe.exec(html))) {
    const cells = [];
    const cellRe = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let cm;
    while ((cm = cellRe.exec(rm[1]))) {
      cells.push(convertInline(cm[1], origin).replace(/\|/g, '\\|'));
    }
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r) => {
    const copy = r.slice();
    while (copy.length < width) copy.push('');
    return copy;
  };
  const header = pad(rows[0]);
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
  ];
  for (const r of rows.slice(1)) {
    lines.push(`| ${pad(r).join(' | ')} |`);
  }
  return `\n\n${lines.join('\n')}\n\n`;
}

/**
 * Convert an HTML document (or fragment) to Markdown, preferring <main>.
 */
export function htmlToMarkdown(html, origin = SITE_ORIGIN) {
  let s = extractMain(html);
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<svg\b[\s\S]*?<\/svg>/gi, '');
  s = s.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '');
  s = s.replace(/<template\b[\s\S]*?<\/template>/gi, '');

  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, inner) => (
    `\n\n${'#'.repeat(Number(n))} ${convertInline(inner, origin)}\n\n`
  ));
  s = s.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    const text = convertInline(inner, origin);
    return text ? `\n\n> ${text.replace(/\n/g, '\n> ')}\n\n` : '';
  });
  s = s.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, inner) => {
    const text = decodeEntities(inner.replace(/<[^>]+>/g, '')).trim();
    return text ? `\n\n\`\`\`\n${text}\n\`\`\`\n\n` : '';
  });
  s = s.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, inner) => convertTable(inner, origin));
  s = s.replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => convertList(inner, false, origin));
  s = s.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => convertList(inner, true, origin));
  s = s.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_, inner) => {
    const text = convertInline(inner, origin);
    return text ? `\n\n${text}\n\n` : '';
  });
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(div|section|article|header|footer|figure)>/gi, '\n\n');
  // Leftover inline tags only — do not run convertInline over the whole
  // document, which would collapse the newlines we just inserted.
  s = s.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const text = stripTags(inner) || href;
    const url = resolveHref(href, origin);
    return url ? `[${text}](${url})` : text;
  });
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s ? `${s}\n` : '';
}

export function isMarkdownLikeContentType(contentType) {
  const ct = (contentType || '').toLowerCase();
  return ct.includes('text/markdown') || ct.includes('text/plain');
}

export function isHtmlContentType(contentType) {
  const ct = (contentType || '').toLowerCase();
  return ct.includes('text/html');
}
