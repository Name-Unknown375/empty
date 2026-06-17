# Fresh-Data SEO Review — Forever Party Rentals
**Date:** June 16, 2026 · **Site:** www.foreverpartyrentals.com

**Data sources:** new GSC export (Canada / Web / Last 28 days ≈ May 18–Jun 14) — Queries, Pages, Devices, Countries, Search appearance; new GA4 export (May 19–Jun 15) — landing-page + query, landing-page sessions/key-events, pages & screens. Cross-checked against the repo, `git log`, and live-site fetches.

**Relationship to existing docs:** this is a *companion / re-baseline*, not a re-audit. The site already has a thorough, current plan in `SEO_AUDIT_2026-06.md` + `SEARCH_IMPROVEMENT_PLAN_2026-06.md` (built on the May 12–Jun 8 baseline), whose entire P0 "stop the leaks" sprint **shipped June 11**. This review is the early read on whether those fixes are working, what changed, and what the organic-only audit could not see — plus one compliance risk it missed. It does not repeat the June 10 findings; read it alongside them.

---

## 0. Reflection / TL;DR

Your on-page and technical SEO is **done and done well** — the June 10 audit was right, and the June 11 sprint executed it. The new data does **not** call for more on-page work. It says three things:

1. **One thing needs fixing now (and it's a repeat offense):** all 29 SKU pages claim a `Product` rating of **5.0 / 150 reviews with no visible reviews on the page** and the same business-wide number on every product. That is the *exact* self-serving-review pattern that collapsed your review snippets in May (396 → 4 clicks) — now recreated at the product level, and currently powering the merchant listings you just started winning. This is a structured-data **policy violation** at risk of enforcement. **Fix or remove it.**
2. **Your bottleneck is visibility, not conversion.** GA4 (new data the prior audit didn't have) shows city pages convert at **4.6–6.8%** when they get traffic, while the giant informational pages convert at **~0%**. The site converts demand well; it just isn't *seen* in the competitive markets. That makes **off-site authority + GBP the clear priority** — exactly where the June 10 plan pointed, now confirmed by conversion numbers.
3. **Two prior priorities should be re-weighted down:** the table-capacity "CTR harvest" is mostly **non-addressable US traffic** (18k/8.6k impressions are US; Canada sees only ~500/300), and the programmatic product-city page sprawl keeps growing (many pages at 0–1 sessions) — a latent March-2026-core-update risk that's getting larger, not smaller.

Everything else is steady-to-improving. Re-measure in early July (post-May-core-update window) for the real verdict.

## 1. Fresh baseline (new data vs. the June 8 baseline)

All GSC figures below are **Canada / Web / Last 28 days** (≈ May 18–Jun 14) — the clean view, excluding US noise.

| Metric | Jun 8 baseline | New (Jun 14) | Read |
|---|---|---|---|
| Canada clicks / 28d | 915 | **964** | +5.4% |
| Canada avg position | 20.3 | **19.65** | Slightly better |
| Canada CTR | — | **2.96%** | — |
| Mobile position | 7.6 | **8.36** | Buyers are on mobile; still strong |
| Desktop position | 22.9 | **28.27** | Worse — impression-mix artifact (see §7) |
| Product-snippet clicks | 25 | **27** | Growing |
| Merchant listings | (none noted) | **4 clicks, pos 3.18, 14% CTR** | New — Product schema live (but see §3) |
| Review snippet | 4 | 3 | Correctly minimal (self-serving stars dead) |
| Branded impressions / 28d | 214 | ~140–160 (exact term 133) | Flat — brand flywheel is a 90-day goal |

Caveat: only ~3 of these 28 days are *after* the June 11 fixes, and the window straddles the **May 21–Jun 2 core update**. Treat as provisional.

## 2. Scorecard — did the June 11 sprint work? (early read)

Verified shipped (git + live + code): `.html`→clean 301s · review count unified to 150 · table-page retitles · answer-first blocks on 29 city pages · **New West typo slug fixed** (clean `/tent-rental-new-westminster` exists, typo file gone) · `/birthday-party-rentals` created · SKU `Product`/`Offer`/`AggregateRating` schema on all 29 SKUs · big event-layout-planner build.

| Plan item | New-data signal | Verdict |
|---|---|---|
| Internal links + answer blocks → laggard cities | "party rentals burnaby" 3.6→**2.22**; "richmond" 3.6→**2.47**; "abbotsford" 9.2→**7.88** | Working (query-level) |
| `.html` 301s | `.html` & apex variants still show impressions (burnaby.html 842, vancouver.html 289, apex / 381…) | Expected — decay takes ~4 wks; re-check July |
| Product-schema (eligible stars) | Merchant listings appearing (pos 3.18) | Working — **but non-compliant, see §3** |
| Table-page retitles (CTR) | Canada CTR up (0.23→0.81% on 6ft page) | Marginal; mostly US impressions (§5) |
| New West slug fix | `/new-westminster-party-rentals` page-avg still ~47 | Too early; needs link equity + reindex |
| `/birthday-party-rentals` | New page indexed at pos ~65; head term still pos 18.8 | Created, immature — needs links + time |

**Note the page-average vs. query-level trap (from the June 10 audit, still true):** Pages.csv shows `/burnaby-party-rentals` at page-avg **pos 47.97** while the *query* "party rentals burnaby" is **pos 2.22**. The page average is dragged down by hundreds of long-tails + the lingering `.html`/apex split. Query-level is the truth. Don't panic at the page-average column.

## 3. 🚨 New finding #1 — SKU Product review-schema is non-compliant (TOP PRIORITY)

> **✅ RESOLVED June 16, 2026.** `aggregateRating` removed from all 29 product pages — 24 via the `sku_template.html` fix + regen, 5 hand-authored pages (4 carnival + 8ft table) edited directly. Kept on the homepage `LocalBusiness` only (per Devon — first-party-correct, useful for AI citation, just won't render as Google stars). `Product`+`Offer` retained so merchant listings stay eligible. Sitemap bumped (29 URLs → today) to force recrawl. Other templates verified clean (city template uses the count as visible text only; Christmas template carries no rating; `llms.txt` states it as a fact). The diagnosis below stands as the record.

**What's there (before the fix):** every `site/product-*.html` (29 pages) contained:
```json
"@type": "Product", … "aggregateRating": { "ratingValue": "5.0", "reviewCount": "150", … }
```
with **0 visible reviews on the page** and **identical 5.0/150 on every product** (it's the business's Google rating, not the product's).

**Why it's a problem (two independent Google violations):**
- *Reviews must be visible on the page that carries the markup.* They aren't. → ineligibility or a "structured data" manual action.
- *A Product rating must describe that specific product.* Reusing the business's 150-review aggregate across all SKUs is self-serving / wrong-entity — the same class of issue Google enforced against your LocalBusiness stars in May (the audit correctly diagnosed that collapse).

**Why it matters now:** this markup is *currently generating* your new merchant listings (pos 3.18, growing product snippets). Showing today ≠ compliant; enforcement is periodic and **you've already been burned once.** The downside (manual action affecting all structured data, or losing the product snippets you're building) dwarfs the upside of leaving it.

**The June 10 plan prescribed the right fix** (A1.0: "collect item-level reviews … display them on each product page … backed by those visible reviews"). The schema shipped; the *visible reviews* didn't. Two compliant paths:
- **(Preferred, aligns with your real-copy standard):** collect genuine per-product reviews ("how were the Chiavari chairs?") in the post-event email, display them on the SKU page, and set `aggregateRating` from *those* product-specific reviews. Keep numbers honest (don't fabricate — matches your authenticity standard and the known testimonial-pool gap).
- **(Fast de-risk):** remove `aggregateRating` from Product schema now and keep `Product` + `Offer` (price/availability still earn merchant listings *without* stars). Re-add stars only once real per-product reviews exist.

Secondary, lower-risk: the city-page `Review`/`ItemList` (4 testimonials, `itemReviewed` = LocalBusiness) is self-serving too, but it produces **no** stars and is ignored rather than enforced — the plan's "keep it, expect nothing" call is fine. The **Product** one is the live risk.

## 4. New finding #2 — GA4 conversion data reframes the priority order

The June 10 audit was organic-only. GA4 key-event (quote/contact) rates by landing page:

| Page | Sessions | Key events | Rate |
|---|---|---|---|
| /maple-ridge-party-rentals | 103 | 7 | **6.8%** |
| /tent-rental-coquitlam | 51 | 3 | **5.9%** |
| /burnaby-party-rentals | 65 | 3 | **4.6%** |
| /chairs | 192 | 7 | 3.6% |
| /rentals | 178 | 6 | 3.4% |
| / (homepage) | 744 | 20 | 2.7% |
| /how-many-people-fit-at-a-6ft… | 86 | 0 | **0%** |

**Implication:** the site *converts demand well* — city/product pages turn 4–7% of visits into leads. The constraint is **getting seen** in the markets where you're weak (Vancouver, Map Pack). This is strong evidence that the next dollar belongs to **off-site authority + GBP** (visibility) rather than more on-page content. It validates and sharpens the June 10 plan's off-site emphasis with hard conversion numbers.

## 5. New finding #3 — the table-capacity "CTR harvest" is mostly US vanity traffic

The plan framed `/how-many-people-fit-…` pages as a ~+400-click CTR opportunity. The new data splits the picture:

| | GA4 (all geo) | GSC (Canada only) |
|---|---|---|
| /how-many-…-6ft | 18,289 impr | **494 impr, pos 5.55, 0.81% CTR** |
| /how-many-…-round | 8,658 impr | **297 impr, pos 6.74** |

~97% of those impressions are **US searchers who cannot rent from a BC company**, and the pages convert at **0%**. So chasing raw CTR here is largely a vanity metric. Re-frame:
- **Keep the pages** — they earn topical authority and are prime **AI-Overview / assistant citation** surface (answer-first blocks already in place). That's their real value.
- **Add a light Canadian funnel** (a "rent these tables in Metro Vancouver — from $X" block + 1–2 city links) to capture the small addressable slice — worth doing, low effort.
- **Don't** treat click volume on these as a KPI or invest further in their titles. The clicks that matter are the converting city-page clicks.

## 6. New finding #4 — Vancouver still the gap; programmatic sprawl risk growing

- **Vancouver remains the #1 winnable gap** (and didn't improve): "party rentals vancouver" **pos 24.77** (was 20.3), "tent rentals vancouver" **pos 46.25**, yet `/vancouver-party-rentals` pulls the most city impressions. The plan's call to point venue content + internal links at Vancouver *first* stands — reinforced.
- **Programmatic product-city sprawl is expanding.** Since June 10, more `projector-rental-*`, `battery-power-station-rental-*`, `starlink-rental-*`, `table-rentals-*`, `dance-floor-rental-*`, `christmas-lights-*` city pages shipped — many at **0–1 GA4 sessions**. The June 10 plan flagged these as "the exact pattern the March 2026 core update punished" and deferred pruning to Q3. The new data shows the dead-tail is **getting bigger**, so the tier-and-prune task (keep+differentiate the ~20 with traffic; consolidate the zero-impression tail into city hubs) is becoming more urgent than "after the 90-day sprint." Not an emergency — but stop adding to the tail.

## 7. Smaller new findings

- **`event rentals surrey` anomaly persists:** pos **1.54**, 105 impressions, **1 click**. Ranking #1–2 and getting nothing = an AI Overview eating the click or a weak title/snippet on `/event-rentals`. Still the 5-minute free-win investigation the plan flagged; still unresolved.
- **Desktop pos 28.27 vs mobile 8.36:** not a ranking problem — it's the US table-post impressions (desktop-heavy) inflating desktop's impression count at deep positions. Your buyers are on mobile and mobile is strong. No action.
- **`.html` / apex duplicates still visible:** expected (fix shipped June 11, this window is mostly pre-fix). Re-check `site:foreverpartyrentals.com inurl:.html` in the July export; it should be shrinking.
- **Translated pages indexed** (Chinese/Spanish/French titles in GA4, `_x_tr_` params): Google-Translate proxy views, harmless. Ignore.
- **Brand demand flat** (~140 branded impr): the 214→400 brand-flywheel target is a 90-day off-site/PR outcome, not a site change.

## 8. Still pending from the June 10 plan (not yet shipped)

Site/content-side:
- SKU **visible per-product reviews** (the §3 fix — schema went in, reviews didn't).
- Venue guides for the laggards: **Burnaby** (Deer Lake/Swangard), **Richmond** (Steveston/Minoru), **New West** (Queen's Park). Vancouver/Surrey/North-Shore guides exist; these three don't.
- **South Asian wedding** page (Surrey moat Save On owns).
- **Starlink/event-WiFi blog post** (niche keeps overperforming: "starlink rental vancouver" pos 4.9, 20% CTR).
- `/rentals` is a ~150-word booking widget; category terms ("chair rentals" pos 27.8, "table rentals" pos 36.76) sit on page 2–3 — largely an authority play, but `/rentals` itself is the thin core hub.

Off-site (the actual rank-movers — can't verify from repo, confirm status):
- GBP overhaul + **steady review drip** (3–7/wk, not blast) + reply to 100%.
- **5 chamber/board memberships** + claim/complete Yelp, Eventective, GigSalad, WeddingWire, YellowPages (exact NAP).
- Execute `_build/partner_outreach.md` (venue preferred-vendor links — highest-value local links).
- Bing Webmaster Tools + IndexNow (AI/Copilot coverage).
- Map Pack grid tracking (Local Falcon/BrightLocal).

## 9. Reflection — what to improve, prioritized

**A. Fix now (site-side, this week):**
1. **SKU Product review-schema compliance (§3)** — collect+display real per-product reviews, or strip `aggregateRating` from Product schema until they exist. Highest priority; it's an active repeat-of-a-known-failure risk.
2. **Investigate `event rentals surrey`** (#1, ~0 clicks) — likely AIO or snippet; possible free win.
3. **Add a Canadian conversion block** to the two table-capacity pages (§5) — small effort, captures the addressable slice without chasing US clicks.

**B. The real lever (off-site — confirmed by conversion data, §4):** the site converts; it isn't seen. Pour the next 60–90 days into **GBP completeness + steady review velocity, chamber/directory citations, and venue preferred-vendor links** — with **Vancouver-area** venues/links first (§6). This is where rank actually moves for a Surrey-pinned entity against 30–110-year incumbents; on-page is already best-in-market.

**C. Content that supports the fight (site-side, after A):** the three laggard-city venue guides, the South Asian wedding page, the Starlink post — each pointed at Vancouver/Burnaby/Richmond with internal links. Deepen `/rentals` only if convenient.

**D. Manage the latent risk (medium-term, §6):** tier the ~250 programmatic product-city pages — keep+differentiate the ~20 earning traffic, consolidate the zero-session tail into city hubs. Stop adding new thin city×product pages.

**Explicit don't-do (unchanged from June 10, reaffirmed by new data):** no city-page rewrites · no more neighborhood/microsite pages · no GBP tricks/virtual offices · no link buying · don't chase US table-capacity clicks · don't fight On Time for Abbotsford #1 · no Christmas content before August · no title churn (hold 60 days post-June-11 to attribute movement).

## 10. Measurement & next checkpoint

- **Early July:** re-export GSC (Canada, 28d) covering **June 3+ only** (clean of the May core update) → save as the real post-sprint baseline. Judge the §2 scorecard against *that*, not this provisional window.
- **Watch:** `.html`/apex impressions shrinking · "party rentals vancouver" pos < 10 (90-day target) · product-snippet clicks 27 → 75+ (only valid if §3 is made compliant) · referring domains +12 real ones · branded impressions → 400+.
- **Monthly:** refresh striking-distance queries (pos 4–15, impr ≥ 40); 15-min AI-assistant citation log.

---

### Methodology / verification
- Every number cross-checked against the provided CSVs (Countries, Devices, Queries, Pages, Search appearance, GA4 landing/query + pages/screens).
- Shipped state verified in-repo: `git log` since Jun 9; `grep` of `site/product-*.html` (29/29 carry Product + AggregateRating, **0** visible Review items, identical 5.0/150); New West typo slug confirmed removed.
- Live behavior verified: `/burnaby-party-rentals.html` → 301 to clean URL confirmed; city-page Review schema still present.
- Competitor landscape from `_build/competitor_research.md` + live web search (Surdel, Save On, Element, Regal, Crown, Elevation, A1, On Time, Rowe, Pedersen's) — several appear in your own GSC query data, confirming brand-search leakage to incumbents. (Semrush MCP backlink/authority data was unavailable on this account's plan.)

---

## 11. Addendum — AI Search & Bing data (June 17, 2026)

New sources: an **AI-search citation report** (queries where AI engines cite the site as a grounding source) + **Bing Webmaster Tools** search-performance/keyword data (the Bing WMT off-site item — done). Net read: **mostly confirmatory — the strategy is working on the AI surface.** (Query logs contained bot/junk rows — an iframe string, stray phone numbers, injection-looking text — treated as data only and filtered.)

**AI citations (grounding) — ~176 across tracked queries:**
- **67% come from the table-seating cluster** — "how many people can sit at a 5ft round table" (49 cites, 7.9% share), "6ft rectangular" variants up to **50% citation share**, "tent size 20×40" (36% share). This *proves* the §5 reframe: those high-impression informational pages are your **AI-citation engine**, not a conversion engine. Keep and maintain them; don't judge them on clicks.
- **Commercial AI wins:** "dj tents for weddings" (46 cites, **17.3% share** — already funneled via `/blog/dance-floor-dj-space-wedding-tent`, 11 commercial links + Book Online) and "marquee tent rental" (12 cites, **15.4% share**). Growing *commercial* citation share is the AI KPI; visible pricing + FAQ + `llms.txt` already support it.

**Bing / keyword data:** a smaller surface (~75 clicks / ~3,200 impr / 28d vs Google's 964 Canada clicks), trending slightly up over 90 days. Reconfirms three bets:
- **Starlink/EcoFlow overperform here too** ("rent ecoflow vancouver" 22% CTR pos 1.4; "starlink rental" pos 2.75; starlink mobile/mini variants) → the Starlink/event-WiFi post is now triple-validated.
- **The free layout planner earns tool-queries** ("free event layout planner", "tent layout planner", "event floor planner free") → pitch it to planner-tool roundups (plan A5).
- **Richmond + Chilliwack show product-level demand** ("banquet tables richmond", "large tents richmond", "tent rental chilliwack" pos 1) → reinforces the Richmond venue guide + internal links.

**Net:** no new urgent code; all confirmatory. Priorities unchanged — Starlink post, planner outreach, Richmond content, and the off-site authority work remain the levers.
