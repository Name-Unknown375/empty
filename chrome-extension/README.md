# Chrome extension — Event Layout Planner

Chrome Web Store package of the site's layout planner (`site/planner/`),
bundled to run entirely inside the extension (works offline).

```
chrome-extension/
├── extension/                  ← the unpacked extension (what gets zipped)
│   ├── manifest.json           MV3; host_permissions for share/quote/availability
│   ├── background.js           toolbar click → opens planner.html in a tab
│   ├── planner.html            adapted copy of site/event-layout-planner-embed.html
│   ├── favicon.svg             copy of site/favicon.svg
│   ├── icons/                  16/32/48/128 PNG renders of the favicon
│   ├── fonts/                  self-hosted Jost + Playfair Display (variable woff2)
│   └── planner/                copy of site/planner/ (planner.js patched, see below)
├── store-assets/               listing copy, icon, promo tile, real screenshots
├── event-layout-planner-1.0.0.zip   ← upload this to the dashboard
└── README.md
```

## Divergence from the site copy (keep in sync!)

`extension/planner/planner.js` differs from `site/planner/planner.js` in
exactly four spots — root-absolute URLs don't resolve on a
`chrome-extension://` origin, so they're pinned to the production site
(`SITE_URL` / `PLANNER_HUB_URL` consts already in the file):

1. share-link `fetch('/api/share')` → `fetch(SITE_URL + '/api/share')`
2. share fallback `baseUrl = location.origin + '/event-layout-planner'` → `PLANNER_HUB_URL`
3. analytics `sendBeacon('/api/planner-beacon')` → `SITE_URL + '/api/planner-beacon'`
4. quote submit `fetch('/', {method:'POST'...})` → `fetch(SITE_URL + '/', ...)`

`extension/planner.html` differs from `site/event-layout-planner-embed.html`:
SEO/canonical meta removed, favicon path made relative, Google Fonts `<link>`
replaced by local `fonts/fonts.css`, quote form `action` made absolute.

**When the site planner gets features**: re-copy `site/planner/` over
`extension/planner/`, re-apply the four planner.js patches, bump `version`
in manifest.json, re-zip. (Grep check after re-copying:
`grep -n "fetch('/\|sendBeacon(\s*'/" extension/planner/planner.js` must
return nothing.)

## Attribution

background.js opens `planner.html?partner=chrome-extension`, so every
analytics event the planner sends carries `partner: "chrome-extension"`
(and `mode: "direct"`) — extension usage is separable from site + partner
embeds in GA4/the beacon log. The slug is not in `partners.json`, so no
co-brand UI triggers.

## Test locally

1. `chrome://extensions` → enable Developer mode → **Load unpacked** →
   pick the `extension/` folder.
2. Click the toolbar icon — the planner opens in a tab.
3. Smoke test: load a template, drop a table (chairs auto-place), export PDF,
   click Share (link should be a `foreverpartyrentals.com/p/…` or
   `…/event-layout-planner#s=…` URL — never `chrome-extension://`),
   pick a date to see availability badges, submit a test quote.
4. Offline test: DevTools → Network → Offline → reload. Everything except
   share-shortlink/availability/quote-POST should still work (share falls
   back to the long hash link; quote falls back to mailto).

## Rebuild the zip

```sh
cd chrome-extension/extension
zip -r ../event-layout-planner-<version>.zip . -x '.*' -x '*/.*'
```
(manifest.json must sit at the zip root — zip the folder's *contents*,
not the folder.)

## Submit

1. https://chrome.google.com/webstore/devconsole — one-time $5 developer
   registration if the account isn't registered yet.
2. New item → upload the zip.
3. Fill the Store listing / Privacy / Distribution tabs — everything to
   paste is in `store-assets/listing.md`; graphics are in `store-assets/`.
4. Submit for review. First review typically takes a few days; the
   host_permissions are narrow and justified, remote code is "none", so
   it should be routine.
