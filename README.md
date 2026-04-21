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

**This section is a handoff for picking up the in-progress SEO work in a fresh Claude Code window.** The live site generators are in `site/_build/`, not `project/`.

## Current state

- **Branch**: `claude/competitor-analysis-plan-PDiMH` (pushed to origin)
- **Last commit**: `a4fa054` — "Sprint 1 + 2: close technical SEO + internal-linking gaps"
- **Plan doc**: `COMPETITOR_ANALYSIS.md` at repo root — 6 sprints, numbered items 1–19
- **Sprints done**: 1 (technical SEO hygiene) + 2 (internal-linking silo). Items 1–9.
- **Sprints pending**: 3 (SKU pages + pricing), 4 (blog), 5 (Review schema + /reviews.html), 6 (mega-menu refactor — out of scope for this pass).

All 140 generated pages (28 city + 112 product-city) pass `site/_build/verify.py` today.

## What Sprint 3 needs (items 10–11)

### 3.10 — 15 SKU product pages at `site/product-<slug>.html`

Create three new files:
- `site/_build/products_sku.json` — SKU catalog
- `site/_build/sku_template.html` — Jinja2 template with Product + Offer + LocalBusiness + BreadcrumbList JSON-LD
- `site/_build/generate_sku_pages.py` — renderer (mirror `generate_product_pages.py` structure)

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

- On city pages (`site/_build/template.html`): each of the 4 product cards gets a small price chip reading "from $X/day" — pulled from the cheapest SKU in that category.
- On product-city pages (`site/_build/product_template.html`): each of the 3 sibling cards gets the same chip.
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

- **5.14**: Add Review JSON-LD block to `site/_build/template.html` (this becomes a 5th JSON-LD block on city pages). **Update `site/_build/verify.py`** — it currently asserts exactly 4 blocks with types `{LocalBusiness, Service, FAQPage, BreadcrumbList}`; change to `>= 4` or accept the Review type.
- **5.15**: Create `site/reviews.html` with all 10 testimonials from `testimonialPool` + Review schema each, linked to the LocalBusiness `@id` (`https://foreverpartyrentals.com/#localbusiness`). **Do not fabricate testimonials** — the pool has exactly 10 entries (Chelsea Thompson, Marissa K., Jenna & Michael, Raymond D., Priya S., Daniel L., Alexandra M., Omar H., Kelsey V., Graham R.). Add an editable-pool comment.

## Key data sources (read before editing)

- `site/_build/city_data.json` — 28 cities. Tier 1: burnaby, langley, surrey, vancouver. Tier 2: abbotsford, coquitlam, maple-ridge, north-vancouver, richmond. `testimonialPool` has exactly 10 entries.
- `site/_build/products.json` — 4 product categories (tent, chair, table, dance-floor). **Surrey uses `tent-rentals-surrey.html` (plural)** via `urlPrefixOverrides.tent.surrey = "tent-rentals"`. Handle with the existing `page_slug()` helper.
- 9 Squarespace CDN image URLs are already catalogued in `products.json` — reuse them; don't fabricate new paths. Key ones: `white-chiavari-chair-rentals-*.jpg`, `white-fanback-folding-chairs.jpg`, `Garden+Chair+Rentals.jpg`, `5ft+round+tables.jpg`, `6ftrectangulartables.jpg`, `Marquee+Tents+Lowermainlad+for+Rent.jpg`, `Tent+Rentals+Langley.png`, `BLACK-AND-WHITE-DANCE-FLOOR-JERRY-HAYES.webp`, `Gala-corporate-dinner-setting.jpg`.

## Conventions already established (don't re-invent)

- **Logo URL**: module-level `LOGO_URL` constant in both generators — points at the Squarespace-CDN-hosted `Forever+Party+Rentals+Logo.png` (do not use `/logo.png` — file doesn't exist).
- **Site URL**: `SITE_URL = "https://foreverpartyrentals.com"` (no trailing slash).
- **LocalBusiness schema**: phone `+1-778-990-7983`, address `9317 188 St, Surrey BC V4N 3V1`, geo `49.1648/-122.7066`, hours 09:30–18:00 all 7 days, `aggregateRating` 5.0/200. See `site/index.html` `#localbusiness` @id.
- **lastmod markers**: every generated page ends with `<!-- lastmod: {ISO8601} -->`. `generate_sitemap.py` reads these for `<lastmod>`.
- **Jinja2 env**: `StrictUndefined`, `trim_blocks=True`, `lstrip_blocks=True`, `autoescape=False`.

## Gotchas

- `verify.py` currently expects **exactly 4 JSON-LD blocks** with types `{LocalBusiness, Service, FAQPage, BreadcrumbList}`. Adding a 5th (Review) **will break verify** — update the assertion in Sprint 5.14.
- The city count is **28, not 22** (plan doc said 22; the data is 28).
- The testimonial pool has **10, not 20–30** entries. Don't fabricate.
- Surrey's tent URL override is a landmine — always route through `page_slug(product, city_slug)`.

## Suggested resumption order (for the fresh window)

```
1. git checkout claude/competitor-analysis-plan-PDiMH && git pull
2. Read COMPETITOR_ANALYSIS.md (plan)  +  this section (state)
3. Sprint 3.10 → 3.11 → Sprint 4 → Sprint 5
4. After each sprint:
   - python3 site/_build/generate_sitemap.py
   - python3 site/_build/verify.py --all
   - commit + push to claude/competitor-analysis-plan-PDiMH
5. Final sitemap will grow from 151 → ~173 URLs (+15 SKU + 7 blog pages).
```

