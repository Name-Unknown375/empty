# BC-Focus Search Review — Forever Party Rentals
**Date:** July 1, 2026 · **Site:** www.foreverpartyrentals.com

**What this is:** a full redo of the June analysis, recomputed programmatically from the raw exports (not eyeballed), narrowed to the market we actually serve — the Lower Mainland / Fraser Valley band. Every number below was produced by scripts over the CSVs; corrections to the earlier read are called out explicitly in §7.

**Data sources & windows:**

| Window | Source | Dates | Geo filter |
|---|---|---|---|
| **Baseline** | `_build/seo_baseline/2026-06-08_*` | May 12 – Jun 8 | ⚠️ **ALL GEO** (Canada row: 915 clicks / 31,330 impr / pos 20.27) |
| **Mid** | `~/Downloads/foreverpartyrentals/` (exported Jun 16) | May 18 – Jun 14 | Canada |
| **Current** | `~/Downloads/foreverpartyrentals-2/` (exported Jun 30) | **Jun 1 – 28** | Canada |
| GA4 | Acquisition overview + landing-page/query exports | Jun 2 – 29 | all geo |

**Two caveats that bound every claim in this doc:**
1. **The Jun-8 baseline export has no country filter.** Its *query-level* rows are still usable for geo-modified local queries (those are ~all-Canada anyway), but its *page-level* rows include US traffic — never compare baseline page rows to current Canada page rows directly. (The homepage did **not** drop 324→175 clicks; all-geo it's 324→325, i.e. flat.)
2. **GSC exports truncate to 1,000 query rows and exclude anonymized queries.** The current export's visible queries cover **450 of 1,050 clicks (43%)** and **17,251 of 35,792 impressions (48%)**. All "share of clicks/impressions" statements below describe the *visible* half; the hidden half is long-tail and privacy-masked, which skews local (long-tail geo terms) if anything.

---

## 1. Headline — Canada, 28 days, month over month

| Metric | Baseline (May 12–Jun 8) | Mid (May 18–Jun 14) | **Current (Jun 1–28)** | Trend |
|---|---|---|---|---|
| Clicks | 915 | 964 | **1,050** | **+14.8% MoM** ✅ |
| Impressions | 31,330 | 32,545 | **35,792** | +14.2% |
| CTR | 2.92% | 2.96% | **2.93%** | flat |
| Avg position | 20.27 | 19.65 | **19.6** | flat-good |
| Mobile clicks / pos | — (all-geo: 642 / 7.62) | 579 / 8.36 | **611 / 8.29** | strong, stable |
| Desktop pos | — | 28.27 | 28.7 | impression-mix artifact; ignore |
| Product-snippet clicks | 25 | 27 | **31** | growing ✅ |
| Merchant listings | 4 clicks / pos 3.74 | 4 / pos 3.18 | **4 / pos 3.0, 12.1% CTR** | flat but held through schema fix ✅ |
| Review snippet | 4 | 3 | 4 | dead as expected (stars removed May) |
| Branded impressions ("forever party rentals") | 214 | 133 | **188** | flat — brand flywheel not turning ❌ |

**Weekly clicks inside June: 229 → 271 → 263 → 287** (impressions 8,037 → 8,875 → 10,053 → 8,827). The month ended ~25% stronger than it started. Impression-spike days at deep positions (Jun 7/14/15/16/21, 1,697–2,171 impr at pos 23–35) are broad-query floods, not ranking changes — don't react to single-day "position drops."

GA4 (Jun 2–29): Organic Search is the **#1 channel** (1,589 sessions vs Paid 1,037, Direct 671). **41 organic key events** total. **AI Assistant is now a real channel: 49 sessions / 38 new users** (chatgpt.com 58 source sessions — more than Yahoo, DuckDuckGo, or Facebook; plus Gemini 3, Copilot 2). Microsites referred ~67 sessions (Burnaby 30, Maple Ridge 14, Langley 7, Port Moody 6, Pitt Meadows 5, Richmond 5).

---

## 2. The BC lens — how local are we actually?

Bucketing all 1,000 visible queries in the current window (regex classification, spot-checked):

| Bucket | Clicks | % of visible clicks | Impressions | % of visible impr |
|---|---|---|---|---|
| Branded (forever…) | 89 | 19.8% | 196 | 1.1% |
| **BC local-geo** (city-modified) | 102 | 22.7% | 4,591 | 26.6% |
| **Generic rental intent** (no geo — Google serves these locally) | 251 | 55.8% | 10,829 | 62.8% |
| Informational (table sizes, tent sizing, layout tools) | 8 | 1.8% | 623 | 3.6% |
| **Out-of-band geo** (Fernie, NB, NWT, Vancouver WA…) | **0** | 0.0% | 452 | 2.6% |
| Competitor brands (allevents, on time, surdel…) | 0 | 0.0% | 560 | 3.2% |

**Read:** ~98% of *visible* clicks are already in-band (branded + local + locally-served generic). The out-of-band noise — "party tents for rent fernie bc" (30), "event rentals northwest territories" (46), the Mactaquac/St-Andrews/Oromocto New Brunswick cluster (~130), "…vancouver wa" (~250 across variants) — is **impressions-only, produces zero clicks, and costs nothing**. It pollutes averages, not the business.

**The important nuance:** the Canada country filter (already applied to these exports) did the heavy lifting. All-geo, the 6ft-table page shows 20,564 impressions (GA4); Canada sees just 525. The US informational flood is already out of every number in this doc.

**What "narrowing to our band" actually means (GSC cannot filter below country):**
1. **GA4 is the true local lens** — add a report filter `Region = British Columbia` (or a Metro Van/Fraser Valley city list) and read sessions/key events through it. This is available today; GSC will never provide it.
2. **GSC regex saved view** — Performance → Query → Custom (regex):
   `surrey|langley|vancouver|burnaby|richmond|abbotsford|coquitlam|maple ridge|pitt meadows|delta|white rock|new west|westminster|tsawwassen|ladner|mission|chilliwack|aldergrove|fort langley|port moody|port kells|harrison|north shore|fraser valley|near me|forever`
   Judge months on that view + the §3 scoreboard, **not** on aggregate CTR/position.
3. **KPI discipline** — the informational pages stay (they're the AI-citation engine: 67% of ~176 AI citations, and ChatGPT referrals are growing) but they are excluded from success metrics.
4. **Google Ads geo hygiene** — Paid is the #2 channel (1,037 sessions across city-named tent campaigns). Confirm campaigns use *"Presence: people in or regularly in"* over the delivery radius — organic noise is free; paid noise isn't. *(Not verifiable from this data — needs an Ads-account check.)*

---

## 3. Local-band scoreboard (the ~30 queries that matter)

Position / clicks / impressions per window. Baseline is all-geo but these queries are ~all-Canada, so the trend is valid.

| Query | Baseline | Mid | **Current** | Verdict |
|---|---|---|---|---|
| forever party rentals | 1.1 · 95c | 1.0 · 75c | **1.0 · 85c · 45% CTR** | owned |
| party rentals burnaby | 3.6 · 6c | 2.2 | **2.4 · 5c** | ✅ improved, held |
| party rentals maple ridge | 2.5 · 4c | 2.4 | **2.4 · 2c** | rank held; clicks soft (§5) |
| party rentals tsawwassen | 2.6 · 5c | 2.7 | **2.9 · 2c** | held |
| chair rentals surrey | 2.0 · 6c | 2.1 | **2.6 · 6c · 15% CTR** | held |
| tent rentals langley | 2.4 · 4c | 2.3 | **2.4 · 2c** | held |
| party rentals richmond | 3.5 · 1c | 2.5 | **3.6 · 1c** | flat |
| chair rentals langley | 3.8 | 3.8 | **3.1 · 2c** | ✅ |
| tent rentals abbotsford | 6.6 · 2c | 5.8 | **3.9 · 4c** | ✅ improved |
| north vancouver party rentals | 7.7 · 0c | 5.3 | **4.8 · 1c** | ✅ improving |
| party rentals abbotsford | 9.2 · 4c | 7.9 | **5.0 · 4c** | ✅ big improvement |
| tent rental surrey | 6.0 · 4c | 5.4 | **5.7 · 6c** | held |
| langley party rentals | 3.9 · 3c | 5.8 | **5.9 · 1c** | ⚠️ slipping (EMD competitor query) |
| party rentals langley | 5.2 · 3c | 4.7 | **6.6 · 11c · 9.5% CTR** | clicks ↑ big despite pos wobble |
| party rentals near me | 9.2 · 5c | 9.3 | **7.1 · 3c** | ✅ improved |
| party rentals coquitlam | 11.3 · 1c | 10.9 | **7.9 · 1c** | ✅ improved |
| party rentals port coquitlam | 15.0 · 0c | 13.0 | **8.0 · 0c** | ✅ improving, still 0 clicks |
| starlink rental vancouver | 5.5 · 9c | 4.9 · 10c | **3.5 · 13c · 27% CTR** | ✅✅ best mover on the site |
| starlink rental | 10.9 · 8c | 9.4 · 13c | **8.9 · 12c** (impr 71→195) | ✅ demand tripling |
| event rentals surrey | 1.4 · 0c | 1.5 · 1c | **1.9 · 1c / 94 impr** | ❌ anomaly persists (3rd report) |
| surrey party rentals | 15.1 · 3c | 15.1 | **17.0 · 2c** | flat-soft (reversed-order variant) |
| tent rentals surrey | 13.3 · 2c | 12.2 | **11.5 · 3c** | slow climb |
| party rentals vancouver | 20.3 · 0c | 24.8 | **35.5 · 3c** | ❌ position regressing 3 reads straight |
| vancouver party rentals | 14.2 · 0c | 15.0 | **18.8 · 0c** | ❌ drifting |
| tent rental vancouver | 28.8 · 0c | 37.1 | **20.1 · 0c** | mixed (this variant improved) |
| tent rentals vancouver | 41.5 · 0c | 46.2 | **46.9 · 0c** | ❌ page 5 |
| chair rentals vancouver | 38.9 · 0c | 40.4 | **42.8 · 0c / 90 impr** | ❌ page 4–5 |
| event rentals vancouver | 33.4 · 1c | 34.0 | **32.6 · 0c / 130 impr** | ❌ stuck |
| westminster party rentals | 8.6 · 0c | 7.9 | **10.4 · 0c** | ⚠️ soft |
| north shore party rentals | 7.8 · 0c | 7.3 | **6.7 · 0c / 42 impr** | ranks, no clicks |

**Pattern (verified, not vibes):** south-of-Fraser and eastern suburbs improved or held almost across the board; **everything Vancouver-proper regressed or is stuck on pages 2–5**. Page-group totals make it stark:

| Page group (current, Canada) | Clicks | Impressions | CTR |
|---|---|---|---|
| Vancouver-side city pages (Van, N Van, W Van, New West, Burnaby, Richmond) | 52 | 7,489 | **0.69%** |
| South-Fraser / Valley city pages (Surrey→Chilliwack, 12 pages) | 114 | 6,808 | **1.67%** |

Same impression volume, **2.4× the CTR** where we're strong. Vancouver-side is the entire gap.

---

## 4. What's working (verified)

1. **Starlink is the biggest verified winner.** Cluster clicks **20 → 25 → 35** across the three windows (+75% vs baseline). "starlink rental vancouver" pos 3.5 / **27% CTR**; "starlink rental" impressions tripled 71→195. `/starlink-rentals` is now the **#3 page on the site** (32 clicks, 5.91% CTR) and converts (3 key events, 82% engagement). The June blog post + FAQ interlink landed. Queued demand with **zero clicks yet**: "starlink rental canada" (39 impr, pos 7.6), "starlink rental kit" (32, pos 8.3), "starlink rentals" (16, pos 6.8), "starlink vancouver" (15, pos 9.3), "rent starlink for a week" (19, pos 7.3) — ~120 impressions of kit/duration-intent sitting at positions 6–10.
2. **The laggard-city push worked** — Abbotsford 9.2→5.0, Coquitlam 11.3→7.9, PoCo 15.0→8.0, near-me 9.2→7.1, N-Van (reversed form) 7.7→4.8, tent-rentals-abbotsford 6.6→3.9. Burnaby holding at 2.4.
3. **The `.html`/apex duplicate leak is nearly drained.** Leak URLs in the export: baseline **264 clicks / 18,162 impr** (all-geo) → mid **50 / 5,260** (CA) → current **5 / 1,024** (CA). Mid→current alone (same filter): −80% impressions in two weeks. The June 11 301s did exactly what they were supposed to.
4. **Product snippets growing (25→27→31 clicks) and merchant listings held** (pos 3, 12.1% CTR) after both rounds of review-schema removal — compliance cost nothing.
5. **Conversion where it matters:** GA4 organic key events: homepage 10, Burnaby 4, Starlink 3, Projector 3, Abbotsford 2, /rentals 2, chair-rentals-Vancouver 2, chair-rentals-Richmond 2 (41 total). City/product pages keep converting when they get seen — visibility remains the constraint, not the site.
6. **AI channel materialized:** 49 GA4 sessions via AI assistants; the informational cluster (0.0% of conversions, 67% of AI citations) is doing the job we reassigned it to.

## 5. What's not working (verified)

1. **Vancouver-proper decay is real and consistent** — the only cluster moving the wrong way three windows straight (§3 table). This was already diagnosed as an *off-site* problem (proximity + authority); the on-page work is done. Nothing in the repo fixes this — venue preferred-vendor links, citations, and Vancouver-delivery reviews do.
2. **Projector cluster: 499 query impressions, 0 clicks** — but note the page's impressions went **91 → 589 between the two Canada windows (6.5×)**. Google *just started* serving `/projector-rentals` for the "projector rental vancouver" family (~20 queries, pos 13–30). It converts when reached (3 key events / 11 users, 83% engagement). This is an emerging page — catch it: internal links from high-traffic pages + a price-anchored title/snippet while it's re-ranking.
3. **"event rentals surrey" — pos 1.9, 94 impressions, 1 click. Third report in a row.** `/event-rentals` itself shows only 4 impressions, so a *different* URL is ranking for it. 5-minute check in GSC UI (query filter → Pages tab) to see which page and what its snippet looks like; likely an AI-Overview-absorbed query or a mismatched snippet.
4. **Maple Ridge clicks softened at stable rank:** query pos steady (2.4–2.5) but page clicks 11→10 (CA windows) vs 31 in the all-geo baseline window, and query clicks 4→2. Position is fine, so this is presentation or demand seasonality, not ranking. **Watch item** — don't touch the page; re-read in the August export.
5. **"langley party rentals" (EMD order) slipped 3.9→5.9** while "party rentals langley" clicks jumped to 11. Net Langley is fine, but langleypartyrentals.ca's exact-match domain is holding the reversed form. Low priority; monitor.
6. **Brand demand flat** (188 impressions vs 214 baseline). Rankings/CTR on brand are perfect; volume isn't growing. Off-site/reviews/PR flywheel — same lever as #1.
7. **GA4 key events carry no value** (120-day cohort LTV = $0 across the board). 41 key events/month and no dollar attached — can't compute what a click or a city is worth. Wire a value (even a flat estimate per quote request) into the key event.
8. **Programmatic tail unchanged** — dozens of product-city pages at 0–13 impressions. Same June recommendation stands: tier & prune in Q3; stop adding to the tail.

---

## 6. Zero-click, near-page-one, in-band — the free-CTR list

Everything below ranks ≤12 in our band with ≥15 impressions and ≤1 click this window (competitor-brand and informational rows excluded). This is the cheapest work on the board:

| Query | Impr | Pos | Owner page (likely) |
|---|---|---|---|
| party rentals north vancouver | 116 | 12.0 | /north-vancouver-party-rentals |
| event rentals surrey | 94 | 1.9 | **unknown — investigate first (§5.3)** |
| party rentals port coquitlam | 44 | 8.0 | /coquitlam-party-rentals (no PoCo page) |
| north shore party rentals | 42 | 6.7 | /north-vancouver-party-rentals |
| starlink rental canada | 39 | 7.6 | /starlink-rentals |
| westminster party rentals | 36 | 10.4 | /new-westminster-party-rentals |
| tent rental service | 36 | 11.8 | /rentals or /tents |
| starlink rental kit | 32 | 8.3 | /product-starlink-standard-actuated |
| 10x10 tent rental | 31 | 8.7 | /product-popup-tent-10x10 |
| dance floor rental vancouver | 45 | 10.7 | /dance-floor-rental-vancouver |
| marquee tent | 58 | 10.8 | /marquee-tent-rental-… |
| winter party tent rentals | 20 | 9.5 | (heated-tent blog post) |
| tent rentals surrey prices | 19 | 5.3 | /tent-rentals-surrey — pricing snippet |
| table rentals surrey | 21 | 3.1 | /table-rentals-surrey |
| party rental surrey | 19 | 3.5 | /surrey-party-rentals |
| vancouver chiavari chairs | 15 | 10.1 | /product-white-chiavari-chair |

~600 in-band impressions at striking distance with essentially zero clicks. Titles/snippets with a price anchor + city ("Tent Rentals Surrey — from $X, Same-Week Delivery") is the play, one batch, then freeze titles 60 days.

---

## 7. Corrections vs. the earlier (June 30 chat) analysis — the redo verdict

The redo confirmed the big conclusions (+15% clicks, Starlink win, Vancouver regression, .html drain) but corrected these:

1. **"~98% of clicks are local" was overstated as a site-wide claim.** It's true only of the *visible* 43% of clicks (the export truncates at 1,000 rows and hides anonymized queries). Correct statement: *of visible queries, 98% of clicks are in-band; the hidden long tail is likely similar but unverifiable.*
2. **The Jun-8 baseline was an all-geo export** — earlier comparisons silently treated it as Canada-only. Query-level trends survive (local queries are ~all-Canada); any page-level baseline comparison in the earlier analysis (e.g., homepage, Maple Ridge "31 clicks") mixed US traffic in and overstated declines. Homepage is **flat** all-geo (324→325), not down.
3. **Merchant listings aren't "new"** — the baseline export already had 4 merchant-listing clicks (pos 3.74). The June audit's "(none noted)" was wrong. Trend is flat 4→4→4, not up.
4. **Projector was mischaracterized as a stagnant failure.** Its impressions exploded 91→589 in two weeks — it's an *emerging* ranking to be reinforced, which raises its priority.
5. **Vancouver is regressing but not uniformly:** "tent rental vancouver" (singular) actually *improved* 28.8→20.1, and "party rentals vancouver" earned its first 3 clicks even as position slid. Net still negative; the page-group CTR gap (0.69% vs 1.67%) is the honest summary.
6. **Maple Ridge softness was missed entirely** in the first pass (§5.4).
7. Earlier "projector cluster ~350 impressions" undercounted: it's **499**. And "noise ~2%" was approximately right: out-of-band = 2.6% of visible impressions, 0 clicks.

---

## 8. Action list — what to work on, in order

### This week (site-side, hours not days)
| # | Action | Why / target | Effort |
|---|---|---|---|
| 1 | **Reinforce /projector-rentals while it re-ranks:** internal links from homepage + 2–3 high-traffic pages, price-anchored title ("Projector & Screen Rental Vancouver — from $X, Delivered") | 589 impr → 0 clicks; page converts (3 key events); impressions grew 6.5× in 2 wks | S |
| 2 | **Starlink long-tail block** on /starlink-rentals + SKU page: kit contents, weekly pricing, "rentals across Canada?" FAQ line | ~120 queued impressions at pos 6–10, zero clicks ("…canada", "…kit", "…rentals", "…for a week") | S |
| 3 | **Investigate "event rentals surrey"** in GSC UI (which URL ranks; snippet; AIO present?) | pos 1.9, 94 impr, 1 click — 3rd straight window | 5 min |
| 4 | **Batch CTR pass over the §6 list** (title/snippet with price + city), then freeze titles 60 days | ~600 in-band impressions at striking distance | M |
| 5 | **GA4: attach a value to the quote/contact key event**; add a `Region = British Columbia` saved comparison | 41 key events/mo currently worth "$0"; BC lens for all future reads | S |

### This month (the actual rank-movers — off-site)
| # | Action | Why / target |
|---|---|---|
| 6 | **Vancouver-side authority push:** venue preferred-vendor outreach (`_build/partner_outreach.md`), Vancouver/Burnaby/New West chamber + directory citations, review asks specifically from Vancouver/N-Van/New-West deliveries | The only cluster regressing; CTR 0.69% vs 1.67% south of Fraser; on-page is done — this moves or nothing does |
| 7 | **Review velocity** (3–7/week drip, reply to all) | Brand impressions flat at ~190; feeds CTR, Map Pack, AI recommendations |
| 8 | **Google Ads geo check:** confirm "Presence" targeting on all city campaigns | 1,037 paid sessions; organic noise is free, paid noise isn't |

### Q3 (housekeeping)
| # | Action | Why |
|---|---|---|
| 9 | **Tier & prune the programmatic tail** (product-city pages at 0–1 sessions → consolidate into city hubs; keep the ~20 earners) | Latent core-update risk; unchanged since June 10 plan |
| 10 | **`_build/local_band_report.py`** — script that ingests each month's GSC export and emits this doc's §1–§3 tables automatically | Makes this review a 10-minute monthly check with consistent definitions |

### Explicit don't-do (unchanged, reaffirmed by this data)
No city-page rewrites · no new thin product-city pages · don't chase US table-capacity clicks (Canada sees 525 of its 20.5k impressions; 0 conversions; keep as AI-citation asset) · no title churn outside the one §6 batch · no GBP tricks / virtual Vancouver office · don't panic at page-average positions (Burnaby page-avg 50 while its money query sits at 2.4).

---

## 9. Measurement going forward

- **Monthly (1st of month):** export GSC (Canada / Web / 28d) → run the local-band scoreboard (§3) + bucket split (§2). Judge on: local-band clicks, the ~30-query scoreboard, key events — **never** aggregate CTR/position.
- **Watch list for the Aug 1 read:** Vancouver-proper positions (did off-site work start moving them?) · projector cluster first clicks · Starlink long-tail CTR · Maple Ridge click recovery · "event rentals surrey" resolution · brand impressions >250 · leak URLs → ~0.
- **Known blind spots:** GSC hides 57% of clicks behind truncation/anonymization (directional only below the top queries); GSC has no sub-country geo (use GA4 BC filter); baseline exports must always be saved **with the Canada filter applied** so future comparisons stay apples-to-apples.
