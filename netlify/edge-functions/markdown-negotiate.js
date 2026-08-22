/**
 * Serve text/markdown when Accept prefers it (acceptmarkdown.com).
 * HTML browsers keep getting the static site unchanged.
 *
 * Runs on document GETs. Static assets, /api/*, and binary paths are skipped
 * so image/CSS caches are not fragmented by Vary: Accept.
 */
import {
  DEFAULT_TYPE,
  HTML_TYPE,
  MARKDOWN_CONTENT_TYPE,
  MARKDOWN_TYPE,
  TWIN_HEADER,
  fallback404Markdown,
  htmlToMarkdown,
  isHtmlContentType,
  isMarkdownLikeContentType,
  mergeVary,
  negotiate,
  notAcceptableBody,
  shouldSkipPath,
  siblingMdPath,
} from '../lib/accept.mjs';

export const config = {
  path: '/*',
  excludedPath: [
    '/images/*',
    '/fonts/*',
    '/api/*',
    '/planner/*',
    '/shared.css',
    '/shared.js',
    '/favicon.svg',
    '/favicon.ico',
  ],
};

function applyVary(headers) {
  headers.set('vary', mergeVary(headers.get('vary')));
}

function withVary(response) {
  const headers = new Headers(response.headers);
  applyVary(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function markdownResponse(body, status, method) {
  const text = body == null ? '' : String(body);
  const bytes = new TextEncoder().encode(text);
  const headers = new Headers();
  headers.set('content-type', MARKDOWN_CONTENT_TYPE);
  headers.set('content-length', String(bytes.length));
  headers.set('cache-control', status === 404 ? 'public, max-age=60' : 'public, max-age=300');
  applyVary(headers);
  if (method === 'HEAD') {
    return new Response(null, { status, headers });
  }
  return new Response(text, { status, headers });
}

function notAcceptableResponse(request) {
  const body = notAcceptableBody(request.headers.get('accept'));
  const headers = new Headers();
  headers.set('content-type', 'text/plain; charset=utf-8');
  headers.set('cache-control', 'no-store');
  applyVary(headers);
  if (request.method === 'HEAD') {
    return new Response(null, { status: 406, headers });
  }
  return new Response(body, { status: 406, headers });
}

async function fetchTwin(request, mdPath) {
  const url = new URL(mdPath, request.url);
  const headers = new Headers();
  headers.set(TWIN_HEADER, '1');
  headers.set('accept', MARKDOWN_TYPE);
  try {
    const res = await fetch(url, { method: 'GET', headers, redirect: 'manual' });
    return res;
  } catch {
    return null;
  }
}

export default async (request, context) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return;
  if (request.headers.get(TWIN_HEADER) === '1') return;

  const url = new URL(request.url);
  if (shouldSkipPath(url.pathname)) return;

  if (url.pathname.toLowerCase().endsWith('.md')) {
    const res = await context.next();
    if (!res.ok) return withVary(res);
    const body = await res.text();
    return markdownResponse(body, res.status, request.method);
  }

  const choice = negotiate(request.headers.get('accept'));

  if (choice == null) {
    return notAcceptableResponse(request);
  }

  if (choice === HTML_TYPE || choice === DEFAULT_TYPE) {
    const res = await context.next();
    return withVary(res);
  }

  if (choice !== MARKDOWN_TYPE) {
    const res = await context.next();
    return withVary(res);
  }

  const twin = await fetchTwin(request, siblingMdPath(url.pathname));
  if (twin && twin.ok) {
    const body = await twin.text();
    return markdownResponse(body, 200, request.method);
  }

  const origin = await context.next();
  const passthrough = origin.clone();

  if (origin.status === 404) {
    const twin404 = await fetchTwin(request, '/404.md');
    let body = fallback404Markdown();
    if (twin404 && twin404.ok) {
      body = await twin404.text();
    }
    return markdownResponse(body, 404, request.method);
  }

  const ct = origin.headers.get('content-type') || '';
  if (isMarkdownLikeContentType(ct)) {
    const body = await origin.text();
    return markdownResponse(body, origin.status, request.method);
  }
  if (!isHtmlContentType(ct)) {
    return withVary(passthrough);
  }

  try {
    const html = await origin.text();
    const md = htmlToMarkdown(html, url.origin);
    if (!md.trim()) {
      return withVary(passthrough);
    }
    return markdownResponse(md, origin.status, request.method);
  } catch {
    return withVary(passthrough);
  }
};
