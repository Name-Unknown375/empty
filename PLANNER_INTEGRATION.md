# Planner short share links — integration spec (Phase 2.1)

For the owner of `site/planner/planner.js` / `planner.css`. The backend, the
`/p/<id>` hub routing, and the vendored QR library are live in this repo; this
doc is the contract for wiring `shareLink()` to them. Nothing below requires
changes to the embed's load path — `/p/<id>` resolves into the existing
`#s=` hash before the iframe loads, so `getRestoreHash()` keeps working as-is.

## 1. Creating a short link

`POST /api/share` with the **encoded** state string — the exact thing
`encodeStateForUrl()` returns, i.e. what you already put after `#s=`.
Send it as the raw request body, not JSON:

```js
// inside shareLink(), after const encoded = encodeStateForUrl();
const ctrl = new AbortController();
const t = setTimeout(() => ctrl.abort(), 4000);   // don't make users wait on us
let shortUrl = null;
try {
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: encoded,
    signal: ctrl.signal,
  });
  if (res.ok) {
    const data = await res.json();               // { id, url }
    if (data && data.url) shortUrl = data.url;   // "https://www.foreverpartyrentals.com/p/Ab3xY9Qk"
  }
} catch (e) { /* fall through to hash link */ }
clearTimeout(t);
```

Note on origins: the embed is always served from www.foreverpartyrentals.com
(even inside partner iframes), so this fetch is same-origin — no CORS involved.
A relative `/api/share` is correct everywhere the planner runs.

### Responses

| Status | Body | Meaning |
|---|---|---|
| 200 | `{"id":"Ab3xY9Qk","url":"https://www.foreverpartyrentals.com/p/Ab3xY9Qk"}` | Created. `id` is always 8 base62 chars. |
| 400 | `Bad request: <reason>` (`empty` / `too-large` / `bad-prefix` / `bad-chars`) | Payload rejected. Max 32 KB; must start with `2*`; printable ASCII only. v1 (raw-JSON) payloads are intentionally not accepted. |
| 429 | text, with `Retry-After: 3600` | Per-IP limit of 30 links/hour hit. |
| 405 / 404 | text | Wrong method / wrong path. |
| 503 | text | Blobs hiccup. Transient. |

### The fallback rule (load-bearing)

**On ANY failure — network error, timeout, non-200, unparseable JSON — use the
existing hash-link URL exactly as today.** The short link is a best-effort
enhancement layered on top of a path that must keep working when the API is
slow, rate-limited, or down. Concretely:

- Build the long `baseUrl + query + '#s=' + encoded` URL first, as now.
- If the POST succeeds, copy `data.url` instead (append `?view=readonly`
  **before** sharing readonly links: `data.url + '?view=readonly'` — the
  `/p/` boot script carries `location.search` through to the planner URL).
- Keep doing the local/parent `history.replaceState('#s=' + ...)` bookkeeping
  either way, so refresh-survival is independent of the API.
- **External partner embeds must keep working offline.** Don't gate the
  clipboard copy or the share toast on the fetch — worst case the user just
  gets the long URL, same as Phase 2.0.

Resolving is symmetric: `GET /api/share/<id>` returns the payload as
`text/plain` (cached immutably), 404 if unknown. You shouldn't need it — the
hub page's boot script calls it for you on `/p/<id>` visits.

## 2. QR code for the short URL

Vendored at `site/planner/vendor/qrcode.min.js` — qrcode-generator **v1.4.4**
(Kazuhiko Arase, MIT), the jsDelivr-minified UMD build, 21 KB. Load it from
the embed as `<script src="vendor/qrcode.min.js"></script>` (or lazy-inject on
first share). It defines one global:

```js
// global: qrcode  (a function — NOT a constructor)
const qr = qrcode(0, 'M');     // 0 = auto typeNumber, 'M' = error correction
qr.addData(shortUrl);          // QRs only stay scannable for SHORT urls —
qr.make();                     // never feed it a multi-KB hash link
someElement.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4 });
// alternatives: qr.createImgTag(4), qr.createDataURL(4)
```

Only render a QR when the short-link POST succeeded. A 40-char `/p/` URL makes
a clean low-density code; a 3 KB hash URL makes an unscannable smudge — that's
the whole reason the QR feature waits on the short link.

## 3. What's already handled for you

- `/p/<id>` → Netlify rewrite (`site/_redirects`) serves the hub page at the
  short URL; an inline boot script there fetches the payload, does
  `history.replaceState('/event-layout-planner' + search + '#s=' + payload)`,
  and only then gives the iframe its src. Your existing parent-hash restore
  picks it up with zero planner changes.
- Bad/expired ids show a friendly hub-page message linking to the blank planner.
- Stored payloads are immutable and never expire (today). If we ever add TTL
  cleanup, old `/p/` links degrade to that friendly message — long hash links
  remain the archival-grade option, which is another reason to keep them as
  the fallback.

Suggested analytics tweak while you're in there: `track('planner_share',
{ method: 'short' })` vs `'hash'` so we can see adoption.
