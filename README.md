# CODING AGENTS: READ THIS FIRST

This is a **handoff bundle** from Claude Design (claude.ai/design).

A user mocked up designs in HTML/CSS/JS using an AI design tool, then exported this bundle so a coding agent can implement the designs for real.

## What you should do — IMPORTANT

**Read the chat transcripts first.** There are 1 chat transcript(s) in `chats/`. The transcripts show the full back-and-forth between the user and the design assistant — they tell you **what the user actually wants** and **where they landed** after iterating. Don't skip them. The final HTML files are the output, but the chat is where the intent lives.

**Read `project/site/index.html` in full.** The user had this file open when they triggered the handoff, so it's almost certainly the primary design they want built. Read it top to bottom — don't skim. Then **follow its imports**: open every file it pulls in (shared components, CSS, scripts) so you understand how the pieces fit together before you start implementing.

**If anything is ambiguous, ask the user to confirm before you start implementing.** It's much cheaper to clarify scope up front than to build the wrong thing.

## About the design files

The design medium is **HTML/CSS/JS** — these are prototypes, not production code. Your job is to **recreate them pixel-perfectly** in whatever technology makes sense for the target codebase (React, Vue, native, whatever fits). Match the visual output; don't copy the prototype's internal structure unless it happens to fit.

**Don't render these files in a browser or take screenshots unless the user asks you to.** Everything you need — dimensions, colors, layout rules — is spelled out in the source. Read the HTML and CSS directly; a screenshot won't tell you anything they don't.

## Bundle contents

- `README.md` — this file
- `chats/` — conversation transcripts (read these!)
- `project/` — the `Forever Party Rentals` project files (HTML prototypes, assets, components)

---

# Competitor-Analysis SEO Work — Resumption Notes

**This section is a handoff for picking up the in-progress SEO work in a fresh Claude Code window.** The live site generators are in `_build/` at the repo root, and the static site lives in `site/`.

## Current state

- **Branch**: `claude/competitor-analysis-plan-PDiMH` (pushed to origin)
- **Last commit**: `a4fa054` — "Sprint 1 + 2: close technical SEO + internal-linking gaps"
- **Plan doc**: `COMPETITOR_ANALYSIS.md` at repo root — 6 sprints, numbered items 1–19
- **Sprints done**: 1 (technical SEO hygiene) + 2 (internal-linking silo). Items 1–9.
- **Sprints pending**: 3 (SKU pages + pricing), 4 (blog), 5 (Review schema + /reviews.html), 6 (mega-menu refactor — out of scope for this pass).

All 140 generated pages (28 city + 112 product-city) pass `_build/verify.py` today. Sitemap currently lists 209 URLs across city, product-city, SKU, package, blog, Christmas-light, and top-level static pages.

## What Sprint 3 needs (items 10–11)

### 3.10 — 15 SKU product pages at `site/product-<slug>.html`

Create three new files:
- `_build/products_sku.json` — SKU catalog
- `_build/sku_template.html` — Jinja2 template with Product + Offer + LocalBusiness + BreadcrumbList JSON-LD
- `_build/generate_sku_pages.py` — renderer (mirror `generate_product_pages.py` structure)

**15 SKUs to create** — each with `key`, `name`, `category` (tent/chair/table/dance-floor, maps to `products.json`), `heroImage`, `heroAlt`, `metaDescription`, `shortDescription`, `longDescription`, `specs[{label,value}]`, `startingPriceCAD`, `priceRange`, `bullets`, `topCityLinks[]`:

| Slug | Category | $/day anchor |
|---|---|---|
| `white-chiavari-chair` | chair | 4.00 |
| `fanback-garden-chair` | chair | 3.50 |
| `resin-garden-chair` | chair | 3.00 |
| `round-table-5ft` | table | 10.00 |
| `banquet-table-6ft` | table | 10.00 |
| `cocktail-table` | table | 15.00 |
| `popup-tent-10x10` | tent | 120.00 |
| `marquee-tent-20x20` | tent | 400.00 |
| `marquee-tent-20x40` | tent | 700.00 |
| `marquee-tent-20x60` | tent | 1050.00 |
| `marquee-tent-40x80` | tent | 2400.00 |
| `black-white-dance-floor` | dance-floor | 800.00 (15×15) |
| `tent-heater` | tent | 65.00 |
| `bistro-string-lights` | tent | 55.00 |
| `tent-sidewall` | tent | 35.00 |

Prices are conservative anchors derived from competitor research (Rowe 10×10 popups $105–155; Rowe marquee baseline $275–450; Pedersen's bundled chair $15.90 → our rental-only rate is lower). Document the source in a `_priceNote` comment in the JSON.

**Top-city links (9 per SKU, priority order)**: surrey, vancouver, langley, burnaby (tier 1), then richmond, abbotsford, coquitlam, north-vancouver, maple-ridge (tier 2).

### 3.11 — "Starting from $X/day" pricing labels

- On city pages (`_build/template.html`): each of the 4 product cards gets a small price chip reading "from $X/day" — pulled from the cheapest SKU in that category.
- On product-city pages (`_build/product_template.html`): each of the 3 sibling cards gets the same chip.
- Tighten `priceRange` from `"$"` to actual dollar bands in LocalBusiness schema (e.g. `"$3–$2400"`).

## What Sprint 4 needs (items 12–13)

Create `site/blog/index.html` hub + 6 pillar guides (~1500 words each, Article JSON-LD). Use `../shared.css` for relative paths.

1. `tent-size-guide-lower-mainland-wedding.html`
2. `party-rental-checklist-50-100-150-200-guests.html`
3. `outdoor-event-planning-vancouver.html`
4. `chiavari-vs-fanback-vs-resin-garden-chair.html`
5. `5ft-round-vs-6ft-banquet-table-seating.html`
6. `corporate-event-rentals-metro-vancouver.html`

## What Sprint 5 needs (items 14–15)

- **5.14**: ✅ Done. `_build/template.html` emits an `ItemList` of Review entries layered under `aggregateRating`. `_build/verify.py` was updated: city/product-city pages assert `>= 3` JSON-LD blocks with types `{Service, FAQPage, BreadcrumbList}` (LocalBusiness lives only on the homepage; the Review ItemList is optional and not type-asserted).
- **5.15**: ✅ Done. `site/reviews.html` lists all real testimonials with Review schema, linked to LocalBusiness `@id` (`https://foreverpartyrentals.com/#localbusiness`). The current testimonial pool was rewritten in Apr 2026 to 4 verified Google reviews (Chelsea Thompson, Marissa K., Rutendo Chitungo, Amber Schmidt) — see `_build/city_data.json`'s `testimonialPool` and the duplicated `TESTIMONIALS` array in `site/shared.js`. **Do not fabricate testimonials** — only add ones that exist on the public Google Business Profile.

## Key data sources (read before editing)

- `_build/city_data.json` — 28 cities. Tier 1: burnaby, langley, surrey, vancouver. Tier 2: abbotsford, coquitlam, maple-ridge, north-vancouver, richmond. `testimonialPool` currently has 4 entries (rewritten Apr 2026 to verified Google reviews).
- `_build/products.json` — 4 product categories (tent, chair, table, dance-floor). **Surrey uses `tent-rentals-surrey.html` (plural)** via `urlPrefixOverrides.tent.surrey = "tent-rentals"`. Handle with the existing `page_slug()` helper.
- `_build/site_constants.json` — single source of truth for phone, email, address, hours, logo URL, booking URL, checkout URL, Adelie orgId, site URL, geo, and the AggregateRating shown in LocalBusiness schema. Generators read from here; static hand-authored pages still inline these (refactor pending).
- 9 Squarespace CDN image URLs are already catalogued in `products.json` — reuse them; don't fabricate new paths. Key ones: `white-chiavari-chair-rentals-*.jpg`, `white-fanback-folding-chairs.jpg`, `Garden+Chair+Rentals.jpg`, `5ft+round+tables.jpg`, `6ftrectangulartables.jpg`, `Marquee+Tents+Lowermainlad+for+Rent.jpg`, `Tent+Rentals+Langley.png`, `BLACK-AND-WHITE-DANCE-FLOOR-JERRY-HAYES.webp`, `Gala-corporate-dinner-setting.jpg`.

## Conventions already established (don't re-invent)

- **Logo URL**: module-level `LOGO_URL` constant in both generators — points at the Squarespace-CDN-hosted `Forever+Party+Rentals+Logo.png` (do not use `/logo.png` — file doesn't exist).
- **Site URL**: `SITE_URL = "https://foreverpartyrentals.com"` (no trailing slash).
- **LocalBusiness schema**: phone `+1-778-990-7983`, address `9317 188 St, Surrey BC V4N 3V1`, geo `49.1648/-122.7066`, hours 09:30–18:00 all 7 days, `aggregateRating` 5.0 / 150 reviews. See `site/index.html` `#localbusiness` @id and `_build/site_constants.json`.
- **lastmod markers**: every generated page ends with `<!-- lastmod: {ISO8601} -->`. `generate_sitemap.py` reads these for `<lastmod>`.
- **Jinja2 env**: `StrictUndefined`, `trim_blocks=True`, `lstrip_blocks=True`, `autoescape=False`.

## Gotchas

- `verify.py` asserts **>= 3 JSON-LD blocks** on city / product-city pages with types `{Service, FAQPage, BreadcrumbList}` (LocalBusiness lives only on the homepage and is referenced by `@id` everywhere else; the Review `ItemList` is optional).
- SKU pages (`product-*.html`) assert exactly 2 blocks with types `{Product, BreadcrumbList}`.
- The city count is **28, not 22** (plan doc said 22; the data is 28).
- The testimonial pool currently has **4 verified Google reviews** (rewritten Apr 2026). Don't fabricate.
- Surrey's tent URL override is a landmine — always route through `page_slug(product, city_slug)`.

## Pre-deploy checks (run all four before every `netlify deploy --prod`)

```
python3 _build/verify.py --all        # generated-page content/override verification
python3 _build/check_links.py        # 0 broken internal links
python3 _build/verify_partials.py    # nav/footer structural sanity
python3 _build/check_schema.py       # JSON-LD: parse + per-class required types +
                                     # review-policy (no Review anywhere; aggregateRating
                                     # only on homepage) + NAP/geo consistency +
                                     # every indexable page must carry schema
```

`check_schema.py` is the guard that keeps schema coverage permanent: any new
indexable page without JSON-LD, any reintroduced Review/aggregateRating markup,
or any LocalBusiness NAP/geo drifting from `site_constants.json` fails the check.
Note deploys are Netlify-CLI (`netlify deploy --prod` ships the working tree);
git pushes alone deploy nothing.

## Suggested resumption order (for the fresh window)

```
1. git checkout claude/competitor-analysis-plan-PDiMH && git pull
2. Read COMPETITOR_ANALYSIS.md (plan)  +  this section (state)
3. Sprint 3.10 → 3.11 → Sprint 4 → Sprint 5
4. After each sprint:
   - python3 _build/generate_sitemap.py
   - python3 _build/verify.py --all
   - commit + push to claude/competitor-analysis-plan-PDiMH
5. Sitemap as of Apr 2026: 209 URLs (28 city + 84 product-city + 17 SKU + 9 package + 13 blog + 13 Christmas + ~45 static).
```

