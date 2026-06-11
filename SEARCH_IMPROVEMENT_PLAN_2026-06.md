# Search Improvement Plan — Forever Party Rentals
**June 10, 2026.** Companion to `SEO_AUDIT_2026-06.md` (findings live there; this is the doing-doc).
Part A = organic + AI search (the focus). Part B = Map Pack (the beast — what's actually movable, and an honest warning about review velocity).

---

# PART A — Organic & AI search

## A1. Technical fixes (this week, ~half a day total)

> **June 10 data update (GSC May 12–Jun 8):** priorities re-ordered. New item 0 added; everything else stands. Fresh baseline archived at `_build/seo_baseline/2026-06-08_*`.

**0. Rebuild star eligibility the policy-compliant way (CORRECTED June 10).**
Earlier draft said "restore LocalBusiness AggregateRating." Fact-check overturned that: the lost stars were *self-serving* LocalBusiness stars, which Google's policy (Sept 2019, restated Dec 2025) makes ineligible — and they collapsed **while the markup was still live**, proving enforcement caught up. Don't restore it; the June 9 removal stands. Instead:
- **SKU pages (eligible path):** collect item-level reviews ("how were the Chiavari chairs?") in the post-event email, display them on each `product-*.html` page, and add Product-schema `aggregateRating` backed by those visible reviews. Product snippets already grew 5 → 25 clicks this window — this is the lane Google is rewarding.
- **Third-party stars:** Yelp/WeddingWire/Eventective profiles remain star-eligible in SERPs for the business itself — another reason to complete them (A5).
- Keep the existing Review/ItemList markup on city pages (harmless, feeds AI assistants), just don't expect stars from it.

**1. Kill the `.html` duplicates with explicit 301s.**
`pretty_urls` is not redirecting (verified live June 10: `/surrey-party-rentals.html` → 200). The fresh GSC export shows **139 `.html` variants collecting impressions** — `/burnaby-party-rentals.html` alone took 1,628 impressions beside the canonical's 1,886, so several pages split equity 3–4 ways (apex→www 301 verified working; those rows will decay on their own). Add to the build a generator that appends one line per page to `site/_redirects`, *below* the existing `200!` static-file rewrites:

```
# --- generated: html → extensionless 301s (keep below the 200! rewrites) ---
/surrey-party-rentals.html   /surrey-party-rentals   301!
/vancouver-party-rentals.html /vancouver-party-rentals 301!
... (one per page; exclude checkout.html, 404.html)
```

Acceptance check after deploy: `curl -I https://www.foreverpartyrentals.com/surrey-party-rentals.html` returns `301` with extensionless `Location`. Then watch `site:foreverpartyrentals.com inurl:.html` shrink over ~4 weeks.

**2. One review count, everywhere, from one constant.**
`site_constants.json` says 150; the Surrey page alone has "160+" ×4 and "150+" ×2. Make every template read the constant (meta, body copy, footer, `reviewCount` schema). Update the constant only when the public GBP count actually passes the threshold. This protects the Review-snippet rich results that drove 396 clicks (your #1 search appearance) — and it's also what AI assistants quote.

**3. New Westminster typo slug.**
Create `/tent-rental-new-westminster`, 301 `/tent-rental-new-westminter-tent-rentals` to it, update sitemap + all internal links in the same deploy.

**4. Bing Webmaster Tools (AI coverage).**
Verify site → submit sitemap → confirm the 28 city pages index. ChatGPT/Copilot retrieval runs on Bing. Optional: enable IndexNow (Netlify plugin or a small post-deploy ping) so Bing picks up changes same-day.

## A2. CTR harvesting — exact rewrites

`/how-many-people-fit-at-a-6ft-rectangular-table` — 16,056 impressions, pos 6.0, **0.23% CTR**:
- Title: `How Many People Fit at a 6ft Rectangular Table? (8 — Here's the Catch)`
- Meta: `6ft banquet tables seat 6 comfortably, 8 max — here's the spacing math, when to bump to 8ft, and a free layout planner to test your floor plan.`
- Add directly under the H1: a 40–50 word plain answer + a 3-column table (6ft / 8ft / 5ft round → seats comfortable / max / table-cloth size). That block is featured-snippet and AI Overview bait.
- Add CTA: "Rent 6ft banquet tables — from $10.95/day" → `/product-banquet-table-6ft`.

`/how-many-people-fit-at-round-tables` — 4,641 impressions, pos 8.1, 0.15% CTR: same treatment (`5ft Round Table Seating: 8 People — or 10 If You Do This`).

Expected: even 2% CTR on those impressions ≈ +400 clicks/period, more than any city page earns. One rewrite, then hands off for 60 days — no title churn.

## A3. Internal-link map (30 minutes, real ranking impact)

The two table-capacity posts are your most-crawled pages; the three laggard city pages need equity. Add in-context links:

| From | Add link to | Anchor |
|---|---|---|
| 6ft-table post | /burnaby-party-rentals | "table rentals delivered in Burnaby" |
| 6ft-table post | /new-westminster-party-rentals | "New Westminster table rentals" |
| round-table post | /richmond-party-rentals | "round table rentals in Richmond" |
| wedding-tent-cost-vancouver post | /richmond-party-rentals + /burnaby-party-rentals | natural mentions |
| /blog/party-rental-checklist post | /new-westminster-party-rentals | natural mention |

Rule of thumb: every blog post links to ≥1 city page and ≥1 SKU page; today most link Surrey-only.

## A4. Content — four briefs, nothing more

1. **Burnaby venue guide** (`/blog/burnaby-event-venues-rental-guide`): Deer Lake Park, Swangard Stadium, Burnaby Mountain, Riverway, Shadbolt Centre. Permits, footprints, which tent fits. Link → /burnaby-party-rentals + marquee SKUs. Target: "deer lake park wedding", "burnaby outdoor event venues".
2. **Richmond venue guide**: Steveston (Garry Point, Britannia Shipyards), Terra Nova, Minoru, Olympic Oval corporate. Target: "garry point park wedding", "richmond outdoor wedding venues".
3. **New Westminster venue guide**: Queen's Park (rose garden + bandshell), Westminster Pier Park, Anvil Centre. Smallest city, weakest page — guide + links + slug fix should move it fastest.
4. **South Asian weddings page** (`/south-asian-wedding-rentals` or blog post): mehndi/sangeet tent setups, 300+ guest configurations, multi-day rental pricing, Surrey/Newton venue familiarity. Save On Tents owns this large Surrey market today; you have the inventory story (marquees, mass chair counts) and nothing pointed at it. Target: "indian wedding tent rental surrey", "mehndi tent rental".

Each: 1,200–1,800 words, same schema/template as existing guides, real venue specifics (permits, power, surfaces) — that's the part competitors can't fake.

**June 10 additions from the fresh query data:**
5. **Vancouver is the real fight** — actual Canadian searchers put you at pos 20 ("party rentals vancouver") and 41 ("tent rentals vancouver") despite the most impressions of any city (1,992). Promote the Vancouver venue-guide work above the Burnaby/Richmond guides, and point the A3 internal links at `/vancouver-party-rentals` and `/tent-rental-vancouver` first.
6. **Starlink post** (`/blog/event-wifi-starlink-rental`): "starlink rental vancouver" already pos 5.5 at 18% CTR with no competition — one supporting post + links from corporate/package pages locks up the niche.

## A5. Authority — the dozen links that matter

Memberships (citation + crawlable link + AI-cited sources): Surrey Board of Trade, Greater Langley Chamber, Burnaby Board of Trade, Richmond Chamber, Tri-Cities Chamber. (Ridge Meadows already pays for itself — its listing ranks page-1 for Maple Ridge.)
Claim/complete the directories that already rank in your SERPs: Eventective, GigSalad, Yelp, YellowPages.ca, WeddingWire.ca — exact NAP: `Forever Party Rentals · 9317 188 St, Surrey, BC V4N 3V1 · 778-990-7983`.
Execute `_build/partner_outreach.md`: venue preferred-vendor lists (golf clubs, halls, Fort Langley venues) — the highest-value local links available to you, and the pages AI assistants read when asked "who delivers tents to X venue".

## A6. AI search routine

- Monthly 15-minute log: ask ChatGPT, Perplexity, Gemini — "best party rentals Surrey BC", "tent rental Langley", "wedding tent cost Vancouver". Record: mentioned? cited? facts/prices correct? (As of June 10, your pages were the dominant source in AI search summaries for Surrey, Langley, Vancouver, Burnaby, Richmond, Maple Ridge.)
- Keep `generate_llms_txt.py` in every build; llms.txt must never disagree with the catalog or the review count.
- The A2 answer blocks + city-page FAQs are your AI surface area — factual, priced, specific. Maintain that style in all new content.

## A7. Cadence

| When | What |
|---|---|
| Now | A1 fixes, fresh GSC export → `_build/seo_baseline/2026-06-10_*` |
| Week 2 | A2 rewrites + A3 links shipped |
| Weeks 3–6 | A5 memberships/directories; first two venue guides |
| Monthly | GSC export compare; AI log; `inurl:.html` check |
| 60 days | Judge A2 CTR delta; only then touch titles again |

---

# PART B — Map Pack

## B1. First, the warning — review velocity is the one thing that can hurt you

You said you're "mass spamming reviews as much as possible." If these are all real customers being asked aggressively — good, keep going, but **pace the publishing**. Google's 2025–26 enforcement is automated and velocity-sensitive:

- Google blocked/removed ~292M reviews in 2025 (~22% of all submissions) and restricted 782k accounts for fake-engagement patterns.
- Sudden spikes trigger automatic actions: review removal, **pausing new reviews on the profile**, and a public "reviews temporarily paused" banner on your listing. Profiles gaining 100+/week have lost batches within days.
- Patterns that trip the filter even with real customers: many reviews from the same IP/device (e.g., a tablet at the warehouse counter — don't), many in one day then nothing for weeks, reviewers with zero history, copy-paste text, and **review gating** (only asking happy customers via a filter tool — explicitly banned, and incentivized reviews additionally violate Canada's Competition Act on deceptive marketing).

**The 2026 algorithm actually rewards steady velocity over count** — 80 reviews with a weekly drip outranks 200 stale ones. So the optimal play is also the safe play: queue your asks and release them as a steady drip (≈3–7/week, every week, year-round), from each customer's own phone, same-evening after delivery. Reply to every single review within 48h (owner responses are a ranking/engagement signal and AI assistants read them).

## B2. What actually moves the pack (in rough order of weight)

Map Pack = relevance × distance × prominence. Distance is fixed — but it's one of three terms, not the whole equation. What you control:

1. **Primary category** — the #1 controllable factor in the 2026 Local Search Ranking Factors survey. Yours should be **"Party equipment rental agency"**; secondaries: Tent rental service, Furniture rental service, Marquee hire service (if offered in CA), Christmas-season: add "Holiday lighting service" each October, remove in January.
2. **Keywords in the business title** — the dirty truth: it's the second-strongest factor, which is why competitors stuff names. You're "Forever Party Rentals" — the words "Party Rentals" in your legal name is already a meaningful boost. **Do not** stuff further ("Forever Party Rentals — Tents Surrey" = suspension bait). Instead, police competitors: suggest edits on keyword-stuffed competitor GBP names (Google accepts these; it's free rank gain).
3. **Profile completeness + services/products**: fill *every* field. Services: list each rental category with descriptions and from-prices; Products: add the 15+ SKUs with photos and prices (you already earned Merchant-listing impressions — feed that). 100%-complete profiles materially outrank partial ones.
4. **The landing page**: your GBP links to the homepage — good (it carries the LocalBusiness schema and the review wall). Make sure the homepage keeps "Surrey" visible in title/H1 region; the GBP landing page's organic strength feeds pack rank (this is where Part A directly helps Part B).
5. **Behavioral signals**: clicks, calls, direction requests, bookings from the listing. Use UTM tags (`?utm_source=gbp`) so GA4 shows what the listing drives. Weekly Posts with Book Now CTAs and fresh real photos (not stock; crew installs, before/after) keep engagement up — profiles posting weekly get measurably more actions.
6. **Q&A**: seed and answer the 8–10 real questions (pickup? stakes vs ballast? delivery fee? same-week?). Unanswered Q&A is wasted relevance text.
7. **Citations/NAP consistency**: the A5 work double-counts here.
8. **Review *content*, not just count**: reviews mentioning city + product ("tent rental in Langley") generate "justifications" shown in the pack and feed relevance. Vary the ask: "mind mentioning what you rented and your city?" Photo reviews weigh extra.

## B3. Structural facts you can't change (so don't buy services promising otherwise)

- **Proximity decay**: your pin is in Surrey (9317 188 St). You can realistically own the pack across Surrey/Cloverdale/Langley-border grid points; Vancouver/Richmond/Abbotsford pack slots will mostly go to businesses pinned there. No optimization changes this.
- **Service-area settings don't move rank** — they set eligibility/expectations only. List your 20 most valuable cities anyway (GBP cap).
- **Keep the address visible** (you offer warehouse pickup — customers visit, so showing it is compliant and anchors your Surrey pin). Don't switch to hidden-address SAB; you'd lose nothing-to-gain.
- **No second listings without a real staffed location.** A Vancouver virtual office / microsite-brand GBP is the #1 way to get the *real* listing suspended. If a second warehouse ever genuinely opens (e.g., Burnaby), that's the only legitimate way to buy a second proximity anchor — a business decision, not an SEO trick.

## B4. Map Pack 30-day checklist

| # | Action |
|---|---|
| 1 | Convert review blast → steady drip (3–7/wk), per-customer phones, no gating, no incentives |
| 2 | Reply to 100% of existing reviews (backfill oldest-first) |
| 3 | Verify primary category + add secondaries |
| 4 | Fill Services + Products (SKUs, prices, photos) to 100% completeness |
| 5 | Seed + answer 10 Q&As |
| 6 | Weekly photo Post with Book Now CTA (recurring task) |
| 7 | UTM-tag the website link; watch GBP-driven sessions in GA4 |
| 8 | Suggest edits on keyword-stuffed competitor names |
| 9 | Set up Local Falcon/BrightLocal grid for Surrey + Langley + Burnaby (~$30–50/mo) to measure any of this |
| 10 | October: add Holiday Lighting category + seasonal photos/posts |

Bottom line on the pack: you can't beat proximity in far cities, but Surrey + Langley + the eastern half of your delivery map is winnable, and items 1–2 are the difference between your review push compounding for years versus a paused-reviews banner in week 6.

---

# PART C — Why worse websites still outrank you, and the ideal plan (added June 10)

## C1. Accuracy review of recommendations to date

Fact-checked against Google documentation and current (2026) local-SEO consensus:

| Prior recommendation | Verdict |
|---|---|
| Restore LocalBusiness AggregateRating stars | **WRONG — corrected** (see A1.0). Self-serving LocalBusiness stars are policy-ineligible (Dec 2025 restatement); they died while the markup was live. Replacement: Product-schema stars on SKU pages + third-party profile stars. |
| `.html` → 301 fix (canonicals not enough) | **Confirmed.** 139 variants collecting impressions proves canonical tags alone aren't consolidating. |
| Review-velocity warning (drip > blast) | **Confirmed** by 2025–26 enforcement data and by the 2026 algorithm's preference for steady recency. |
| Microsites = doorway risk, don't expand | **Confirmed**; unchanged. |
| Chambers/citations/venue links emphasis | **Confirmed and strengthened** — 2026 consensus: one trusted local link/mention outweighs dozens of directory entries; *brand mentions* now matter alongside links. |
| CTR/title rewrites | Confirmed, unchanged. |

## C2. The honest diagnosis: why they outrank you

Your pages are better than theirs everywhere it's measurable. What they have isn't on their websites:

1. **Time-accumulated authority.** Pedersen's (65 yrs), Surdel (30+), Element (110-yr lineage), One Stop (30) have decades of citations, natural links, press, and — critically — **navigational brand demand**. People search "surdel rentals" by name; Google reads that as entity prominence and it bleeds into every query they rank for. Your brand got 214 branded impressions in 28 days. That's the gap. No on-page work closes it; only brand-building does.
2. **Entity location.** Organic local results are proximity-tinted too, not just the Map Pack. Your entity is pinned in Surrey — which is why your Canadian head-term positions are top-5 in the eastern metro and pos 20–41 in Vancouver, where Vancouver-pinned mediocrity (Simplicity, Vancan) floats. Expect to reach top-5 in Vancouver with links + content; expect *not* to reliably beat Vancouver-pinned businesses to #1 without a Vancouver presence.
3. **Domain-authority arbitrage by directories.** Peerspace, Eventective, Yelp outrank you in some cities with zero local relevance because DR-80 domains win ties. You don't beat them; you occupy them (A5 barnacle listings) so the slot converts to you anyway.
4. **Link profile.** Realistically you have a handful of referring domains; incumbents have hundreds accumulated passively. The 2026 emphasis: a Hazelmere Golf Club vendor-page link or a Surrey Now-Leader mention is worth more than 50 directory submissions.
5. **Engagement history.** Years of users clicking and returning to incumbent brands trains the system. Your counter: win the click (CTR work), win the visit (planner, instant quotes — already best-in-market), and keep the branded-search flywheel growing.

None of this is "their site is better." All of it is "their *entity* is older and better-known." The strategy that follows: **out-brand them locally while your superior site converts the demand.**

## C3. The ideal 90-day plan (sequenced, supersedes the A7 cadence)

**Days 1–7 — stop the leaks (engineering):**
`.html` 301 generator → deploy → verify · review-count constant everywhere · New West slug 301 · Bing WMT + IndexNow · CTR rewrites on both table-capacity posts · internal-link pass with **Vancouver first**, then Burnaby/Richmond/New West.

**Days 1–90 — the review engine (ops, continuous):**
Steady drip 3–7/week, customers' own phones, no gating · every review answered <48h · post-event email also asks one **product-level** question to harvest SKU-page reviews (feeds the new Product-star path) · ask happy customers to mention city + item.

**Days 8–30 — authority sprint (the actual rank-mover):**
Join 5 chambers/boards (Surrey, Langley, Burnaby, Tri-Cities, Richmond) · claim + complete Yelp, Eventective, GigSalad, WeddingWire, YellowPages (exact NAP) · execute `partner_outreach.md`: pitch 10 venues for preferred-vendor listings, leading with Vancouver-area venues (Stanley Park-adjacent caterers, golf clubs, halls) because Vancouver is the rank gap · pitch the **free layout planner** to 5 wedding blogs/planner tool roundups — it's your only true link-bait asset and nobody else in the market has one.

**Days 30–60 — content that supports the fight:**
Vancouver venue guide #2 (downtown/rooftop + Jericho/Spanish Banks) · SKU-page review display + Product `aggregateRating` rollout · Starlink/event-WiFi post · South Asian wedding page (Surrey moat).

**Days 60–90 — brand flywheel:**
One local-press pitch (backyard-wedding-boom angle, Surrey Now-Leader / Tri-City News) · sponsor 2 school PAC or sports-banquet events with linked mention · Instagram → site planner loop · branded-search check: target 214 → 400+ branded impressions/28d.

**90-day scorecard (re-export GSC and compare to `2026-06-08_*` baseline):**

| Metric | Now | Target |
|---|---|---|
| "party rentals vancouver" position | 20.3 | < 10 |
| `.html` variants with impressions | 139 | < 20 |
| Product-snippet clicks | 25 | 75+ |
| Referring domains (chambers/venues/directories) | ~handful | +12 real ones |
| Branded impressions / 28d | 214 | 400+ |
| Canada clicks / 28d | 915 | 1,200+ |

What you're *not* doing in these 90 days (unchanged): more neighborhood pages, more microsites, any GBP tricks, link buying, city-page rewrites, Abbotsford head-on, Christmas content before August.

---

# PART D — Plan review against 2026 Google releases & SEO chatter (June 10)

## D1. What Google shipped this year and what it means for you

**March 2026 core update (Mar 27–Apr 8) — the one aimed at you.** Local-service coverage singles out the biggest losers as "sites built on templated location pages that swap in city names but don't offer anything unique," with winners having complete digital presence: accurate listings, fresh reviews, active GBP, content grounded in real local expertise. Implications:
- Your 28 *city* pages survived it (real venue/permit/ops detail per city — the Steveston wind section, Surrey school logistics, etc.). That's why your Canadian head terms are top-5. Validates not rewriting them.
- Your **112 product-city pages and micro-neighborhood pages are the exact punished pattern** — same template, city name swapped. They haven't been hit yet (several earn clicks), but they're the most exposed asset on the site. New action (Q3, not urgent): tier them — keep and *differentiate* the ~20 with clicks/impressions (one unique paragraph: real delivery notes, venue names, surface/anchoring specifics per city); consolidate or fold the zero-impression tail into their city pages rather than leaving 90 near-duplicates indexed. Do this calmly after the 90-day sprint, not now.
- "No new neighborhood pages" upgrades from advice to policy.

**May 2026 core update (May 21–June 2) — ran inside your GSC window.** Your May 12–Jun 8 export straddles a core-update rollout, so some position wobble (and possibly part of the review-snippet drop-off timing) is update churn, not trend. Action: treat the `2026-06-08` baseline as provisional — re-export covering June 3+ only (post-rollout) in early July and judge the 90-day scorecard against *that*. 2026 has had near-weekly background volatility per tracker data; evaluate monthly, never react to a single week.

**X chatter on the May update** (practitioner consensus: intent > keywords, slow sites lose, weak AI content filtered, poor mobile UX punished): all four cut in your favor — static fast site, mobile avg position 7.6, human-written local content. Nothing to change; it confirms the moat.

## D2. AI Overviews escalation — bigger than expected

AI Overviews now appear on ~48% of queries (up from ~34% in Dec 2025); when one shows, the #1 organic result loses ~18% of clicks — but sources *cited inside* the AIO see ~35% more clicks than a standard #1. And for local AI answers, **GBP is the primary data source**. Plan adjustments:
1. "Rank #1" alone is no longer the full win condition — **being the cited source is**. Your answer-first blocks (A2), FAQ content, llms.txt, and visible pricing are the citation strategy; extend the 40–50-word direct-answer-block pattern to the top of every city page ("How much do party rentals cost in Surrey? Chairs from $3..." already exists in FAQs — surface one as the first content block).
2. GBP completeness moves up in priority *even ignoring the Map Pack*, because it feeds AI answers for "party rentals near me / in Surrey" conversational queries. The B4 checklist (services, products, Q&A) is now also an AI-visibility task.
3. Add to the monthly AI log: note whether a Google AI Overview appears for each tracked query and who it cites.

## D3. Net changes to the 90-day plan

| Change | Where |
|---|---|
| Re-baseline with post-May-update data (early July, June 3+ window) | scorecard §C3 |
| Q3 task added: tier + differentiate/consolidate the 112 product-city pages | after day 90 |
| Answer-first block at top of each city page (template-level, one change) | Days 8–30 |
| GBP completeness reframed as AI-citation work, runs regardless of Map Pack stance | B4 / immediately |
| Monthly check: AIO presence + citations per tracked query | A6 routine |

Everything else in Parts A–C stands as written.

---

# PART E — Query-level ranking playbook (added June 10)

Goal: own every winnable query, not just city heads. Working file: **`_build/seo_baseline/query_targets_2026-06.csv`** — 44 tracked queries with owner page + action. One rule above all: **one page owns one query intent** — never create a second page chasing a query an existing page already ranks for.

## E1. The five query buckets (from your actual 28-day GSC data)

**Bucket 1 — City head terms (the franchise).** "party rentals \<city\>" ×12 + tent/chair city combos. Top-5 nearly everywhere; Vancouver (20.3) is the fight. Action: defend via Parts A–C; nothing new.

**Bucket 2 — Striking distance (pos 4–15, the 30-day wins).** Queries one push from page-1-top: "party rentals near me" (303 impr, pos 9.2), "tent rentals surrey" (155, 13.3), "table and chair rentals" (128, 14.0), "marquee tent" (86, 13.1), "wedding party rentals" (182, 15.4), "party rentals north vancouver" (76, 11.3), "wedding chair rentals" (61, 18.7). Moves: exact-phrase title/H1 alignment on the owner page, 2–3 internal links with that anchor, answer block at top. These respond in weeks, not months.

**Bucket 3 — Generic category terms (the localized page-2 pool).** "party rentals" (532 impr, pos 18), "tent rental" (331, 23), "chair rentals" (229, 27), "table rentals" (189, 35), "dance floor rental" (81, 25). These look national but are *localized* for Canadian searchers — a Surrey user searching "tent rental" gets a local SERP, which is why you appear at all. They're won by category-page strength (`/tents`, `/chairs`, `/tables`, `/dance-floor`) + sitewide authority, not new pages. Action: give each category page the same treatment city pages got — 1,500+ words, FAQ, answer block, prices — they're currently the thinnest core pages. Combined, this bucket is ~1,500 impressions/28d sitting on page 2.

**Bucket 4 — Demand with no owner (build these).**
- **"birthday party rentals" — 196 impressions, pos 18.5, 0 clicks, NO page.** You have wedding/corporate/backyard pages but no birthday page despite proven demand. Create `/birthday-party-rentals`: kids vs adult sections, carnival-games tie-in, popup tents + tables/chairs packages, pricing. This is the single clearest content gap in the data.
- **"event rentals surrey" — pos 1.4, 114 impressions, 0 clicks.** You're #1 and getting nothing — inspect that SERP: likely an AI Overview or a bad title/snippet on `/event-rentals`. Five-minute investigation, possible free win.
- "corporate party event rental" (128, 27.6): add "event rental" phrasing to `/corporate` title.
- Skip: "event rentals" bare (263 impr, pos 51 — unlocalized national pool, unwinnable), "rent furniture vancouver" (different market).

**Bucket 5 — The informational cluster (the iceberg).** The table-capacity question has ~25 phrasing variants in your data totaling **~2,500 impressions at pos 6–10 with ~0 clicks** ("how many people can sit at a 6 foot table" 332, "5ft round table seats how many" 154, …). The A2 rewrite covers the whole cluster because they all resolve to the same two pages — make sure the new H2s literally use the top 3 phrasings. Also: "marquee capacity guide" (98 impr, pos 67) — retitle the existing tent-size-chart post to include "Marquee Capacity Guide"; the content already exists.

## E2. Process (so this stays current)

1. Monthly, with the GSC export: refresh the striking-distance list (pos 4–15, impr ≥ 40, non-brand) and re-rank the CSV. Promote anything that entered the window; act on the top 5 by impressions.
2. Before any new page: check the CSV + GSC for an existing owner. New pages only for proven-demand orphan queries (Bucket 4 pattern).
3. Title/H1 changes ship at most once per page per 60 days; log the date in the CSV so movement is attributable.
4. Scorecard additions (on top of §C3): "birthday party rentals" → top 5 with the new page; bucket-3 category terms avg pos 18–35 → 10–15; table-capacity cluster CTR 0% → 1.5%+.
