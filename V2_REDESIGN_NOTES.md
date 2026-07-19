# V2 Redesign — What Changed & How to Compare

Date: 2026-07-18 · Built from FRONTEND_IMPROVEMENT_PLAN_2026-07-18.md (all 15 items + opt-in headline pass)

## Compare the two sites

```
python3 compare_sites.py
```

Opens http://localhost:8079 — side-by-side iframes (current `site/` vs redesign `site-v2/`) with quick-jump links to home, a city page, a SKU page, a category page, /rentals, packages, service areas, and pricing.

The redesign lives entirely in `site-v2/` + `_build-v2/`. The live site (`site/` + `_build/`) is untouched.

## What was applied

**Phase 1 — quick wins.** All emoji glyphs replaced with one inline SVG set (Phosphor-style, 1.5 stroke, currentColor) across nav, footer, trust bars, promos, and body content. Header chrome shrunk: nav 96px→72px, logo 72px→48px, hamburger breakpoint 1400px→1024px with condensed top-level labels ("Tents / Chairs / Tables"; dropdown contents and aria-labels keep the full SEO names). Fonts self-hosted from `/fonts/` (variable WOFF2s, `font-display: swap`) — Google Fonts round-trips removed from all 309 pages. Radius scale enforced (2px surfaces, pill chips only). Button layer consolidated: Bootstrap (confirmed unused) stripped from 34 pages, all `!important`s dropped, and `.btn-gold` now uses dark-green text on gold (5.2:1, passes WCAG AA; was 2.4:1). Eyebrow density cut to roughly one section in three site-wide.

**Phase 2 — composition.** Inner-page hero converted to split layout (text left, contextual image right) across ~207 pages using each page's existing heroImage data; texture-panel fallback where no image exists; SKU pages keep the compact hero so the availability widget stays above the fold. Homepage recomposed: carnival promo as full-bleed band, Christmas promo as compact card, testimonials as featured quote + supporting stack, alternating left-aligned section headers. The 29-pill service-area wall is now three regional columns (all 28 links and anchor text preserved verbatim — verified). Trust marquee trimmed 32→15 strongest entries, one consistent tier, no fabricated logos. City trust bar merged to three distinct items. `/rentals` got category quick-jump chips above the Adelie widget (no CSS overrides on Adelie's injected styles).

**Phase 3 — motion + polish.** IntersectionObserver scroll-reveal in shared.js (transform+opacity only, 35ms stagger, skips the initial viewport, fully gated on `prefers-reduced-motion`). Shadows tinted toward the brand green, hover lifts unified at -4px, `:active` press state on buttons. Repeated inline styles promoted to shared.css classes (package cards, promos, planner card).

**Headline pass (opt-in).** Long em-dash display headlines shortened to declaratives (~40 across the site). Titles, metas, JSON-LD, FAQ questions, and body copy untouched.

## Guardrails — verified intact

URL structure, slugs, nav IA and dropdown labels, form field names, JSON-LD, analytics (GTM/Meta Pixel), and the Adelie integration are unchanged. Verification on the regenerated site-v2:

- `verify.py` — 29/29 city pages valid
- `check_links.py` — 303 pages, 0 broken internal links
- `check_schema.py` — 296 indexable pages, schema clean
- Homepage + service-areas href sets byte-identical to v1 (link equity preserved)
- Zero emoji glyphs remain; zero Google Fonts requests; zero Bootstrap
- Cache-bust bumped: `shared.css?v=25`, `shared.js?v=20` (v2 only)

## Motion + UX layer (2026-07-18, second pass)

Built from V2_MOTION_UX_ACTION_PLAN_2026-07-18.md using the transitions-dev snippets; all of it lives in `site-v2/shared.css` (motion tokens + `t-*` components), `site-v2/shared.js`, and three hand-authored pages. Re-verified after: 29/29 city pages, 303 pages / 0 broken links, 296 pages schema-clean.

**Motion foundation.** transitions.dev token scale (`--duration-*`, `--ease-*`, `--distance-*`, `--scale-*`, `--blur-*`) installed in `:root`; every previously hardcoded duration in shared.css now reads from it. Duplicate `.card/.blog-card` transition rule deduped.

**Chrome (all ~300 pages).** Desktop dropdowns, the mega-dropdown, and the nested flyout now grow from their trigger (scale+fade, 250ms open / 150ms close) instead of snapping — implemented with a visibility-delay so closing animates with no JS timers and closed menus stay out of the tab order. FAQ accordion animates via grid-rows 0fr↔1fr (initFAQ wraps answers in `.faq-a-inner` at hydrate; no template regen; no-JS keeps the old hidden behavior). Mobile menu slides down with cross-blur; hamburger morphs to an X; the panel now anchors to the nav's real bottom edge (fixes the 40px topbar overlap at scroll-top). Hover-less devices get first-tap-opens on the nested flyout.

**Conversion moments.** Contact form: status line and button label swap text in place; invalid fields shake with a red border + inline message (on blur / on submit, cleared as you type; native browser bubbles retained). Thank-you page: stroke-drawn animated success check (path length measured at runtime). Blog "Copy Link → Copied!" swaps in place. `.card-link` trailing "→" upgraded at hydrate to the chevron-spreads-into-arrow hover. Homepage hero copy rises in with 40ms stagger (inline `html.js` gate — no-JS visitors never see hidden text; load-event fallback if shared.js dies) and the hero stat digits pop in (planner's dynamic `pl-stat-num` counters deliberately excluded). Adelie reserved boxes shimmer until the widget injects (`/rentals` loading note pulses and cross-fades out).

**UX fixes (ui-ux-pro-max audit).** Form inputs 16px on mobile (kills iOS focus auto-zoom); `.card-tag` white-on-gold 2.4:1 fail → dark-green-on-gold; 44px touch targets on mobile for area links, blog chips, share pills, topbar and footer links; `touch-action: manipulation` on all interactive elements.

Everything is transform/opacity/grid-rows only (CLS-neutral), and every new component ships its own `prefers-reduced-motion` guard on top of the global kill-switch. `thank-you.html` added to apply_partials' HAND_AUTHORED list.

## Feedback round (2026-07-18, third pass) — cache now `?v=26` / `?v=21`

Devon's browser-review feedback, all applied and re-verified (29/29 / 303 pages 0 broken links / 296 schema-clean):

1. **Gold readability**: new `--gold-text: #826929` (5.25:1 on white) for all small gold text on light backgrounds — eyebrows, kickers, mega-menu column titles; bright `--gold` retained on dark green. Hero's gold em uses `--gold-deep` (3.45:1, passes AA large-text).
2. **Icons**: the triangle-stack Christmas-tree SVG (read as a warning sign) swapped for a string-lights icon in all 301 footers + homepage promo + partials/templates.
3. **Christmas promo** now carries a real photo (`images/christmas/hero-600w.webp`) via `.promo-img`.
4. **Reviews restored to v1 style**: eyebrow REVIEWS + "— 190+ 5-Star Reviews" heading + equal 4-card grid; featured-quote layout retired. Lead review is now Stacey Sarris's real Google review (Local Guide); shared.js TESTIMONIALS synced.
5. **"in 2D" removed** from the homepage planner heading and /rentals banner copy (meta descriptions untouched — title freeze).
6. **FAQ headings**: all 211 "… Questions" H2s → "… FAQ"; city main pages are "{City} FAQ"; homepage is "Party Rental FAQ". Jinja templates updated to match so regens stay consistent. JSON-LD untouched.
7. **Mobile menu** regrouped into labeled groups (Home + Book Now / Rentals / Packages & Pricing / Company) with per-item separators — partial updated + one-time migration across all 300 pages (apply_partials confirms parity: 0 changed).
8. **Blog section** header matches the reviews anatomy again (eyebrow "Planning Resources" restored).
9. **City deep-dive content** (#local-knowledge) no longer reads as a word document: H2s get section dividers, each H3+paragraph renders as a gold-edged card (pure CSS, no override edits).
10. **Packages hub**: "Start Here" + per-group eyebrows restored (v1 look); fourth picker option "200+ Guests — Contact Us" → /contact; picker/tier-explainer section split from the package groups (all three groups share one light section; Why-Bundle flipped to white to keep alternation). Anchors #wedding/#corporate/#backyard intact.
11. **/rentals**: category quick-jump chip row removed.
12. **Category delivery areas** (tents/chairs/tables/dance-floor/power/starlink/projector/marquee/event-rentals/christmas-lights) converted from 29-pill walls to the homepage's three regional columns — every href + label preserved verbatim, grouping mirrors the homepage map.

## Open items / decisions still yours

- **Logo**: left as-is per your call (blush lotus everywhere).
- **Adelie theme variables**: couldn't be confirmed offline — the widget was left alone per the plan's fallback. Worth one email to Adelie support asking if the embed accepts accent-color config.
- **Playfair italic**: the self-hosted variable font has no italic file; browsers synthesize the slant for the few italic blockquotes. If real italics matter, add `playfair-display-italic-variable.woff2` later.
- **Lighthouse before/after**: run on home, a city page, and a SKU page once you're serving both versions (compare_sites.py works for local runs; CLS budget target < 0.1). The v2 changes are CLS-neutral by design (reveal layer is transform/opacity only; hero images carry width/height).
- `thank-you.html` and `checkout.html` weren't in apply_partials' HAND_AUTHORED list, so their navs had drifted; v2 refreshed them. Consider adding both to the list in `_build/` too.

## If v2 wins

Copy the changed sources back: `_build-v2/` template/partial changes → `_build/`, `site-v2/shared.css|shared.js|fonts/` → `site/`, hand-authored page edits → `site/`, then regenerate and deploy via the normal checklist.
