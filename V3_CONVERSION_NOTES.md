# V3 Conversion Pass — First-screen price + Book

Date: 2026-08-14 · Built from the Clarity UX plan (first-screen conversion).

The live site (`site/` + `_build/`) is **untouched**. All of this lives in `site-v3/` + `_build-v3/`. Images and fonts in `site-v3/` are symlinks back to `site/` so we did not duplicate media.

## Compare the two sites

```
python3 compare_sites.py
```

Opens http://localhost:8079 — live `site/` on the left, v3 on the right. Quick-jumps: home, chairs, tables, Langley city, Chiavari SKU, 100-guest wedding package, contact, planner, /rentals.

You can also browse v3 alone at http://localhost:8081/

## What changed in v3

**First screen.** Green heroes on city, product-city, SKU, package, and the hand-authored category pages now show a starting price, a 5.0 / 190+ reviews line, and Book + Call buttons before the photo. On a phone the copy column still stacks above the image, so the 15–24% scroll visitors see a dollar figure.

**Category cards.** Chairs and tables cards show `/ day` price and **Book …** instead of “See details”. Details stays as a text link.

**Homepage.** Price line under the hero paragraph. Secondary button is **Get a Quote** (`/contact`) instead of View Tent Rentals.

**SKU.** Compact hero includes “From $X / day”. Delivery line is “pickup free in Surrey · delivery added at checkout”. “View all rentals” is a text link so Adelie stays the primary action.

**Contact.** Message is optional. Address required-state is synced on first paint (not only after changing Delivery/Pickup). Date field has a stock-check hint.

**Planner.** Strip under the hero: Call / Book these items / Quote this layout. Quote posts a message into the embed and scrolls the quote form. The global mobile bar stays hidden so it does not cover the canvas.

## Verify (v3 only)

- `python3 _build-v3/verify.py` — 29/29 city pages valid
- `python3 _build-v3/check_links.py` — 303 pages, 0 broken internal links
- Cache-bust: `shared.css?v=27`, `shared.js?v=23` (v3 only)

## Ads (not in this folder)

Still yours in Google Ads: exclude United States, fix `{campaignname}` ValueTrack, do not send paid traffic to `/`.

## If v3 sucks

Do nothing. Keep deploying from `site/` as today. Delete `site-v3/` and `_build-v3/` whenever you want.

## If v3 wins

Copy the changed sources back, then regenerate and deploy via the normal checklist:

1. `_build-v3/partials/hero_actions.html.j2` → `_build/partials/`
2. `_build-v3/` template edits (`template.html`, `product_template.html`, `sku_template.html`, `package_template.html`) → `_build/`
3. `site-v3/shared.css` V3 layer + `site-v3/shared.js` address-sync → `site/`
4. Hand-authored pages: `index.html`, `chairs.html`, `tables.html`, `tents.html`, `dance-floor.html`, `starlink-rentals.html`, `contact.html`, `event-layout-planner.html`, `event-layout-planner-embed.html`, `planner/planner.js`
5. Point `_build/` generators back at `site/` (they already do — do **not** copy the SITE_DIR patch from `_build-v3/*.py`)
6. Regenerate city / product / SKU / package from `_build/`, bump cache versions, `verify.py` + `check_links.py`, deploy
