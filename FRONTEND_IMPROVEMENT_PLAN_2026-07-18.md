# Frontend Improvement Plan: foreverpartyrentals.com
**Date:** 2026-07-18 · **Mode:** Redesign, preserve (targeted evolution, not overhaul)

Design read: local-service booking site for consumers planning events, with an established forest-green + gold identity, Playfair Display + Jost, and a large generated page set. The brand system is good. The plan sharpens execution rather than replacing the identity.

**Hard guardrails (nothing below touches these):** URL structure, page slugs, nav labels/IA, form field names, copy voice, JSON-LD, analytics events, the Adelie widget integration. All template-level changes go through `_build/` (partials + Jinja templates) and regenerate; `verify.py`, `check_links.py`, and `check_schema.py` run before every deploy. Lighthouse before/after on 3 representative pages (home, a city page, a SKU page); CLS budget stays under 0.1.

---

## What is already working (keep)

One shared stylesheet with real design tokens; consistent green/gold/serif identity; real photography in the homepage hero with a review badge; accessibility basics done right (skip link, focus-visible, reduced-motion media query); mobile sticky call/book bar; responsive srcset images with preloaded hero; CLS space reserved for the booking widget. The homepage is the strongest page on the site.

---

## Phase 1: Quick wins (shared.css + partials, low risk, 1-2 days)

**1. Replace emoji glyphs with one inline SVG icon set.**
The topbar (✆ ✉), trust bar (📅 🚚 ✅), booking section (📞), promos (🎪 🎄), and footer (⭐ 📸) use raw emoji. They render differently on every platform and as empty boxes on some. Inline a small set of Phosphor SVGs (phone, envelope, calendar, truck, check, star, camera) directly into the nav/footer partials and templates at a consistent 1.5 stroke weight, colored `currentColor`. No JS library needed on a static site.

**2. Shrink the header chrome.**
Topbar (40px) + nav (96px, 72px logo) eats ~136px of every viewport, and the hamburger currently kicks in at 1400px, so most laptops (1280-1366px) never see the full menu. Target: nav 72px with a ~48px logo, and condensed desktop labels ("Tents / Chairs / Tables / Dance Floor" instead of "Tent Rentals / Chair Rentals / ...") so the full nav fits at 1024px+. Dropdown contents stay unchanged, so IA and SEO labels inside menus are untouched.

**3. Self-host the fonts.**
Variable-font WOFF2s for both Jost and Playfair Display already exist in `chrome-extension/extension/fonts/`. Serve them from `/fonts/` with `font-display: swap` and drop the Google Fonts round-trips (two preconnects + a render-blocking CSS fetch on every page). Faster LCP, one less third party.

**4. Define and enforce a radius scale.**
Current mix: 2px token, 4px pills and dropdowns, 6px mega-dropdown, 8px planner card, 999px chips. Document one rule in shared.css (suggest: near-sharp 2px for cards/buttons/inputs, full-pill only for filter chips) and sweep the exceptions.

**5. Clean up the button layer.**
`.btn` rules are stacked with `!important` (legacy Bootstrap fight). Confirm nothing still ships Bootstrap, then drop the `!important`s and consolidate variants. Also give `.btn-gold` a quick contrast check: white 13px text on `#C9A44A` is below WCAG AA for its size. Darken the gold slightly on buttons (e.g. `#A6863A` hover token already exists in the blog gradients) or bump text to 600/14px and test.

**6. Reduce eyebrow density.**
Nearly every section on every page opens with the same gold uppercase eyebrow + centered serif H2 + centered paragraph. That uniform rhythm is what makes the site feel templated. Keep eyebrows on roughly one section in three (hero + one or two key sections per page); elsewhere the headline stands alone. Cheap change, big de-templating effect.

---

## Phase 2: Template-level composition (the visible redesign, ~1 week)

**7. Fix the inner-page hero (highest-impact single change).**
`.page-hero` is a full-width dark green band with text capped at 560px, so the right half is empty on 200+ pages (city, SKU, category, package). Convert it to a split hero: text left, contextual image right. Every generated page already has a hero image in its data (`products_sku.json` heroImage, city/product templates have lifestyle shots), so this is a template + CSS change, not a content project. Fallback for pages with no image: a subtle darker-green texture panel, not an empty field. Keep the SKU-page compact variant so the availability widget stays above the fold.

**8. Vary the homepage section layouts.**
Current run of sections is almost all "centered header + equal-column grid," plus two identical side-by-side promo banners in a row (carnival, Christmas). Changes: give the two promos two different layout treatments (one full-bleed color band, one compact card); recompose testimonials as one featured quote + smaller supporting pair instead of four equal cards; left-align the section headers on alternating sections. No copy changes, purely composition.

**9. Tame the 29-pill service-area wall.**
A 29-item pill grid is a data dump. Group into 3 short regional columns (Surrey & Fraser Valley / Vancouver & North Shore / Tri-Cities & Ridge Meadows) with plain links, or show the top 8 cities as pills + "All 28 communities →". All links preserved for internal-linking SEO, just organized.

**10. Real logos in the trust marquee.**
The "Trusted By" strip is mostly styled text words with a few images mixed in. Where clients are recognizable brands (lululemon, KPMG, Scotiabank, PwC, BC Hydro), use monochrome SVG marks at uniform height; keep text-only for orgs without usable marks, but style them as one consistent tier. Cut the list to the strongest ~15; 32 entries dilutes it.

**11. Upgrade the city-page trust bar.**
The four trust items repeat the same fact twice ("25% Deposit to Secure" and "Your date is locked once the deposit is paid"). Merge to three distinct items with the new SVG icons.

**12. Booking widget page framing.**
`/rentals` drops straight from the green hero into the third-party Adelie UI, which has its own look. Add a thin framing layer: category quick-jump chips above the widget (styled like the blog topic chips) and confirm whether Adelie exposes theme variables to align its accent color with the green/gold palette. If it doesn't, leave the widget alone. No fragile CSS overrides on their injected styles beyond the existing containment fix.

---

## Phase 3: Motion + polish (after items 1-2 ship, a few days)

**13. Light scroll-reveal layer.**
The site is fully static today except hover states and the logo marquee. Add a small IntersectionObserver in shared.js that fades/rises cards, steps, and stats on first view (200-400ms, transform+opacity only), gated behind the existing `prefers-reduced-motion` handling. One marquee per page stays the cap.

**14. Card and interaction refinement.**
Tint card shadows toward the green hue instead of neutral black; add the `:active` press state (scale .98) to buttons; unify hover lift distances (cards currently mix -3px and -4px).

**15. Inline-style cleanup.**
index.html and several templates carry heavy `style=""` attributes (the package cards, promo banners, planner card). Promote the repeated patterns into shared.css classes so future edits happen in one place. Zero visual change; pays down maintenance debt.

---

## Decisions needed from you

**Logo color.** The blush-pink lotus is the only pink on an otherwise green/gold site. Options: (a) leave it, it's the brand mark; (b) commission a one-color cream/gold variant for use on dark surfaces; (c) introduce blush as a deliberate small tertiary accent (e.g. blog category chips). Not changing anything without your call.

**Copy pass (optional).** Headlines and body lean on long em-dash constructions ("Booking Made Simple — Discounts & Deposit, In Plain Words"). A light pass toward shorter declarative headlines would modernize tone, but voice is preserved by default under the guardrails, so this is opt-in.

---

## Suggested order of execution

Phase 1 items 1-6 in one batch (single shared.css + partials PR, regenerate, verify, deploy). Then item 7 alone (biggest visual diff, deserves its own review). Then 8-12, then Phase 3. Screenshots from today's audit are attached alongside this plan for before/after comparison.
