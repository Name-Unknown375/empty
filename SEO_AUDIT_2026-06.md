# Forever Party Rentals — Full SEO Audit & City-by-City Battle Plan
**Date:** June 10, 2026 · **Site:** www.foreverpartyrentals.com (285 sitemap URLs, 265 pages)

**Data sources:** local repo + live site crawl checks, GSC baseline export (May 3, 2026), live Google SERP checks (June 10, 2026), competitor site fetches, prior research in `_build/competitor_research.md`.

**Two caveats on the data:**
1. SERP checks ran from a US datacenter. Organic order is broadly indicative but a searcher *in* Richmond or Burnaby sees proximity-weighted results plus the Map Pack, which these checks can't see. Your GSC averages are the ground truth for organic; the Map Pack needs a local grid tool (see §8).
2. The GSC baseline is from **May 3** — before your Sprint 1–2 fixes fully took effect. Current SERPs look materially better than that baseline. Export a fresh 28-day GSC report now as the new baseline.

---

## 0. UPDATE — June 10: fresh GSC export (May 12 – June 8, archived at `_build/seo_baseline/2026-06-08_*`)

This supersedes the May 3 numbers below where they conflict. 28-day totals: **1,058 clicks / 56,405 impressions** (up from ~840 clicks in the April window). Canada: 915 clicks at avg pos 20.3; the US's 22.4k impressions are almost all the table-capacity posts and don't matter. Mobile pos **7.6** vs desktop 22.9 — your buyers are on phones, and on phones you're strong.

**Real query positions (Canadian searchers, actual GSC — better ground truth than any SERP check):**

| Query | Pos | Query | Pos |
|---|---|---|---|
| forever party rentals | 1.1 (44% CTR) | party rentals maple ridge | 2.5 |
| chair rentals surrey | 2.0 | party rentals tsawwassen | 2.6 |
| tent rentals langley | 2.4 | party rentals richmond | 3.6 |
| party rentals burnaby | 3.6 | party rentals surrey | 4.0 |
| party rentals langley | 5.2 | tent rental surrey | 6.0 |
| party rentals abbotsford | 9.2 | party rentals near me | 9.2 |
| party rentals coquitlam | 11.3 | surrey party rentals (reversed) | 15.1 |
| **party rentals vancouver** | **20.3** | **tent rentals vancouver** | **41.5** |

Head terms are top-5 almost everywhere — **except Vancouver, which is confirmed as the real weak market** (pos 20–41 from actual searchers; the US-SERP "#1" below was geography flattering us). Vancouver gets the most impressions (1,992 on city queries) of any city, so it's also the biggest open opportunity.

**Three new findings that change priorities:**

1. **Review snippets collapsed: 396 clicks → 4** (impressions 14,882 → 111). *(Corrected June 10 after fact-check.)* The stars came from `LocalBusiness + AggregateRating` markup — "self-serving" stars that Google declared ineligible (Sept 2019 policy, explicitly restated December 2025). Decisive detail: the stars collapsed during May 12–Jun 8 **while the markup was still live** (it was only removed June 9), so this was Google enforcement catching up, not a build mistake — and restoring the markup will not bring them back. The June 9 removal was actually correct. **The eligible replacement is Product schema**: product-level `AggregateRating`/reviews on the 15+ SKU pages still qualify for stars, and your Product snippets are already growing (5 → 25 clicks). Plan: collect item-level reviews ("how were the chairs?") and surface them on SKU pages with Product `aggregateRating` — plus complete Yelp/WeddingWire profiles, since third-party sites remain star-eligible for the business itself.
2. **The `.html` duplicate leak is bigger than estimated: 139 `.html` URL variants** collected impressions this window — e.g. `/burnaby-party-rentals.html` alone got 1,628 impressions/18 clicks *next to* the canonical's 1,886/38. Several pages are splitting equity 3–4 ways (www, www+.html, apex, apex+.html). The apex→www 301 verified working live, so apex rows are stale-index decay; the `.html` 200s are the active leak. The page-level "average position drops" vs May 3 (Surrey 18→31, Maple Ridge 7→25) are mostly this split + lost stars + broader impression mix — the *query-level* positions above show the truth: rankings are fine, presentation is leaking.
3. **Starlink rentals is a quiet winner**: 29 clicks, "starlink rental vancouver" pos 5.5 at 18% CTR — near-zero competition. Worth one supporting blog post ("event WiFi for outdoor weddings/festivals") and a SKU-page interlink; cheap incremental win.

CTR pages update: 6ft-table post now 13.6k impressions, pos 7.1, CTR 0.42% (was 0.23) — still the cheapest clicks on the site; the §5 rewrite stands. And the GBP-related note: "party rentals near me" (pos 9.2, 303 impressions) shows organic-page proximity queries you *can* win from the website side.

---

## 1. Executive summary

The on-page work is done — and done well. City pages are 2,000–2,500 words of genuinely unique, locally-specific content with FAQPage, LocalBusiness, Review, Offer, and BreadcrumbList schema; the blog cluster, SKU pages, llms.txt, robots.txt, sitemap, and www-canonicalization are all in place. You out-build every competitor on-page in every city. **Stop investing in more on-page; the remaining upside is (a) three technical leaks, (b) click-through-rate harvesting, (c) Google Business Profile / Map Pack, and (d) off-site authority.**

Where you stand right now (US-datacenter organic, June 10):

| City | Query checked (June 10, 2026) | Your organic position | GSC avg pos (May 3) | Verdict |
|---|---|---|---|---|
| Surrey | "party rentals Surrey BC tents chairs tables" | **#1** (+ #10 dup .html) | 18.2 | Defend |
| Langley | "party rentals Langley BC" | **#1** | 22.9 | Defend |
| Vancouver | "party rentals Vancouver BC tent chair table rental" | **#1–#3** | 27.9 | Defend |
| Vancouver (category) | "tent rental Vancouver wedding marquee" | **#1, #3, #6** (marquee page, city page, tent-city page) | — | Defend |
| Burnaby | "party rentals Burnaby BC" | **#1** (+ your microsite #2) | 37.5 | Close organic gap |
| Richmond | "party rentals Richmond BC" | **#1** (+ tent page #9) | 38.4 | Close organic gap |
| Coquitlam | "party rentals Coquitlam BC" | **#2** (behind Peerspace directory) | 17.2 | Push to #1 |
| North Vancouver | "party rentals North Vancouver BC" | **#1 + #2** | 26.2 | Defend |
| Maple Ridge | "party rentals Maple Ridge BC tent chair rental" | **#1 + #2 + Chamber listing** | 7.3 | Dominant — leave alone |
| Abbotsford | "party rentals Abbotsford BC" | **#2** (On Time Party Rental #1) | 24.6 | Only city where a local beats you |
| New West / Delta / White Rock | "party rentals New Westminster Delta White Rock BC tent rentals" (combined) | **#1** in each | 38.9 / 11.9 / 23.2 | Fix New West |

Note: "Your organic position" = position for that one query from a US datacenter. "GSC avg pos" = Google's average across *every* query that page appeared for (hundreds of long-tails), which is why the numbers differ so much — both are real, they measure different things.

The May GSC positions look worse than the live SERPs because (a) they average hundreds of long-tail queries and (b) they predate your fixes. Both things are improving.

**The three biggest wins available, in order:**
1. **Google Business Profile + reviews** — for "party rentals \<city\>" the Map Pack sits above all organic results. (Noted that Map Pack isn't the current focus since it's proximity-based — but keep the review engine running regardless: review count/velocity feeds your AggregateRating schema, your CTR, and AI-assistant recommendations, all pure search-performance levers.)
2. **CTR harvesting** — `/how-many-people-fit-at-a-6ft-rectangular-table` got **16,056 impressions at position 6 with 0.23% CTR**. Fixing titles/snippets on the two table-capacity pages alone could add more clicks than an entire new city page.
3. **Fix the `.html` duplicate-URL leak** — `pretty_urls` is *not* issuing the 301s your `netlify.toml` comment says it does (verified live: `/surrey-party-rentals.html` returns 200). Google is indexing `.html` variants with stale titles.

---

## 2. Technical SEO — issues found (and what's already clean)

### Fix now (P0)

**T1. `.html` URLs serve 200 instead of 301.**
Verified June 10: `https://www.foreverpartyrentals.com/surrey-party-rentals.html` returns 200 with full content. Google currently shows `.../surrey-party-rentals.html` (with a stale title "Surrey Tent & Chair Rentals — Local Crew, Same-Week") and `.../tent-rental-vancouver.html` in live SERPs. Canonical tags are correct, so this isn't an emergency, but you're splitting clicks and showing stale titles.
**Fix:** add explicit 301s to `site/_redirects` — one generated line per page (`/foo.html /foo 301!` — careful: don't catch sitemap.xml-adjacent static files; your existing `200!` rewrites at the top will keep checkout.html working). Regenerate via a small addition to the build, verify with `verify.py`.

**T2. Review-count inconsistency.**
Meta descriptions say "160+ reviews", page body says "150+ five-star Google reviews", footer says "150+". Pick one number, drive it from `site_constants.json`, and make sure the `AggregateRating` `reviewCount` in schema matches your *actual* GBP count — a mismatch between schema and visible/verifiable count is exactly what gets review snippets revoked, and review snippets earned you **396 of your clicks** (your single biggest search-appearance source).

**T3. Typo/redundant slug ranking in SERPs:** `/tent-rental-new-westminter-tent-rentals` ("westminter", doubled phrase). It ranks, so don't just delete it: create `/tent-rental-new-westminster`, 301 the old slug to it, update sitemap + internal links.

### Worth doing (P1)

**T4. Title churn caution.** Google is already rewriting some of your titles (SERP shows "Surrey Party Rentals — Tents, Chairs, Tables **+ Same-Week Delivery**" while the page ships without the suffix). Leave titles stable for 60+ days between changes so you can attribute movement.

**T5. Fresh GSC baseline + monthly export.** The `_build/seo_baseline/` CSVs are from May 3. Re-export now (post-Sprint-2) and monthly thereafter, same three reports.

### Already clean — do NOT spend time here

- Schema: comprehensive and correct (LocalBusiness, FAQPage, Review, Offer, OfferCatalog, BreadcrumbList, GeoCoordinates). Don't add more types.
- www/apex consolidation: forced 301s in place. Done.
- robots.txt, sitemap.xml, llms.txt, OG/Twitter cards, canonicals, en_CA locale: all correct.
- Content depth: 2,000+ unique words per city page with neighborhoods, venues, FAQs. Better than every competitor checked. Don't rewrite.
- Checkout exclusion, crawl-budget hygiene: sensible.

---

## 3. The microsite network — eyes-open risk assessment

Confirmed you operate exact-match-domain microsites that funnel to the main site:
- **burnabypartyrentals.com** — "A Forever Party Rentals Company", ranking **#2 for "party rentals Burnaby"**
- **richmondpartyrentals.ca** — same template, ranking for Richmond
- **coquitlampartyrentals.com** — same phone (778-990-7983), ranking for Coquitlam

They're working *today* (you occupy two of the top results in those cities). But understand the trade:

- These are textbook **doorway pages** under Google's spam policy: near-duplicate template content, city name swapped, funneling to one site. The realistic risk isn't a penalty to the main site — it's the microsites being algorithmically deindexed (Google's March 2024 spam updates targeted exactly this pattern), or in a worse case a manual action.
- **Rules to limit blast radius:** (1) never create GBP listings for the microsite brands — duplicate GBP listings for one business is the violation that actually gets enforced locally and could take down your *real* GBP; (2) don't link from foreverpartyrentals.com back to them; (3) don't build more of them; (4) treat their traffic as a bonus, never load-bearing.
- **Don't 301 them into the main site yet** — they currently add a second SERP slot. Revisit if they get deindexed.

---

## 4. City-by-city battle plan

### Surrey (home base) — defend
- **You:** #1 organic; GSC avg 18.2 (long-tail weighted, improving).
- **Competitors:** Surdel (30+ yrs, Wix, no city pages, strong brand + showroom), Save On Tents (blog/topical authority, Indian-wedding niche), Crown Tents, A-1 Tent & Decorations, Regal, Confetti, City View.
- **Do:** Win the Map Pack — Surdel almost certainly outranks you there on review count + tenure. Push review velocity hard (every Surrey delivery → review ask same evening with direct link). Get listed on Surrey Board of Trade. Consider one Punjabi/South Asian wedding-focused page or blog post — Save On explicitly courts that large Surrey market and you don't.
- **Don't:** Touch the page content; it's your best. Don't add more Surrey micro-neighborhood pages (East Newton North, Port Kells etc. already exist — that vein is mined).

### Langley (+ Township, Fort Langley, Willoughby, Aldergrove, Carvolth, Walnut Grove) — defend
- **You:** #1 organic. GSC 22.9 and climbing.
- **Competitors:** langleypartyrentals.com (EMD, ultra-thin, 2 pages indexed — coasting on the domain name), Modern Party Rental (single page, decor), **Nexgen Tents** (`/locations/party-rentals-langley-bc/` — the only competitor copying your city-page architecture; watch them), One Stop, Regal.
- **Do:** Join Greater Langley Chamber of Commerce (citation + DR link). Pitch Fort Langley wedding venues (you already have the venue guide post) for preferred-vendor listings — those venue pages rank and refer.
- **Don't:** Worry about langleypartyrentals.com — they can't out-content you and their only asset is the domain. You already beat them.

### Vancouver — defend organic, manage expectations on local
- **You:** #1–#3 organic for both "party rentals" and "marquee tent" queries. GSC 27.9 — the long-tail Vancouver query space is huge and competitive.
- **Competitors:** Vancan Events (strongest: dedicated wedding-tent + tent-rental city pages, product pages), Pedersen's (65+ yrs, biggest brand), Pacific Coast Tents, Simplicity (thin), Element, Lions Events, Elite Tents, Mike's.
- **Reality check:** your warehouse is in Surrey. Map Pack for searches made *in* Vancouver will favor Vancouver-addressed businesses, and no website work changes that. Your winnable game is organic (already winning) + "delivery to Vancouver" intent.
- **Do:** Keep the Vancouver venue-guide series going (Stanley Park, QE Park exist — add Jericho/Spanish Banks, downtown hotel/rooftop venues). Collect reviews specifically from Vancouver-delivery customers and have them mention the city naturally. Target "wedding tent rentals vancouver" with the existing blog post + marquee page interlink (Vancan is beatable here).
- **Don't:** Open a Vancouver GBP with a virtual office — guideline violation, and the thing most likely to get your real listing suspended. Don't chase "event rentals vancouver" (Element/Pedersen's turf, different keyword pool, weaker intent for you).

### Burnaby — close the local gap
- **You:** #1 organic + your microsite at #2. But GSC avg was 37.5 in May — weakest big-city page after Richmond/New West.
- **Competitors:** Element Event Solutions (your architecture twin — city pages, 110-yr heritage, but closed Sundays, no online booking, "event rentals" keyword pool), Bespoke Decor (decor only), Celebration Party Rentals (PoCo), Pedersen's.
- **Do:** Internal-link boost: link to `/burnaby-party-rentals` from the two table-capacity blog posts (your highest-traffic pages) and from 2–3 relevant blog posts. One Burnaby venue guide (Deer Lake Park, Swangard, Burnaby Mountain Centre, Riverway) mirroring the Surrey parks guide. Burnaby Board of Trade membership.
- **Don't:** Copy Element's tone or chase their "event rentals" terms. Your "party rentals" pool converts better and you own it.

### Richmond — close the local gap
- **You:** #1 organic + microsite ranking. GSC avg 38.4 = your weakest major page in May.
- **Competitors:** Rowe Events (the real local: Richmond address, packages, games), directories (Giggster, Eventective) filling the SERP — which means **weak true competition**.
- **Do:** Same playbook as Burnaby: internal links from high-traffic blog posts, one Richmond venue guide (Steveston, Terra Nova, Olympic Oval corporate, Minoru), Richmond Chamber membership, reviews from Richmond customers. The SERP is soft — directories ranking = opportunity.
- **Don't:** Build more Richmond product-city pages; the four you have are enough.

### Coquitlam (+ Port Moody, Port Coquitlam, Pitt Meadows) — push to #1
- **You:** #2 organic behind a Peerspace directory page. GSC 17.2 — healthy.
- **Competitors:** Element (city page), Celebration Party Rentals (PoCo local, dated site), One Stop (PoCo showroom).
- **Do:** Beating a directory is a links game, not a content game — a Tri-Cities Chamber membership + 2–3 local citations (Tri-City News sponsorship?) should flip it. Port Moody page already performs (pos 12, 6% CTR) — leave it.
- **Don't:** Anything on-page; the page is fine.

### North Vancouver (+ West Van) — defend
- **You:** #1 and #2 (city page + tent page). GSC 26.2, and `/chair-rentals-north-vancouver` already pulls clicks at 5.1% CTR.
- **Competitors:** North Shore Party Rentals (tableware/dishes focus — not a tent threat, but owns the local brand + address), Element, Lonsdale Events, Pedersen's.
- **Do:** Reviews from North Shore customers; one "North Shore outdoor venues" guide could cement it (you have Whytecliff already — half done).
- **Don't:** Compete on dishware/flatware inventory you don't carry.

### Maple Ridge (+ Pitt Meadows, Mission) — dominant, leave it alone
- **You:** #1 + #2 + a Ridge Meadows Chamber listing on page 1 (that membership is paying for itself). GSC pos **7.3, 6.77% CTR** — your best city.
- **Competitors:** Danco, Luke's/Bob's A to Z (tableware), One Stop. Thin.
- **Do:** Nothing new. Keep the Chamber listing current.

### Abbotsford (+ Chilliwack, Harrison) — the one city you're losing, decide deliberately
- **You:** #2. **On Time Party Rentals** (locally-owned, Abbotsford-based) is #1, plus 4 Seasons, A1 Party Rentals, Discount Party, Nexgen — the Fraser Valley has real local incumbents with real addresses.
- **Reality:** you're fighting proximity. An Abbotsford searcher gets Abbotsford businesses in the Map Pack and a local #1 organic. Dethroning On Time would take disproportionate effort for your longest delivery route.
- **Do (cheap moves only):** Abbotsford Chamber membership, a couple of Fraser Valley wedding-venue mentions in existing blog posts, reviews from Abbotsford jobs. Harrison Hot Springs destination-wedding post already targets the valuable end of this market — good.
- **Don't:** Don't pour content/links into beating On Time head-on. #2 organic + marquee-specialty long-tail is a fine position for a delivery-radius edge city. This is the clearest "stone you can leave unturned."

### New Westminster, Delta, White Rock, Tsawwassen, Ladner — quick wins
- **You:** #1 organic in each per June checks, but New West GSC was 38.9 (weak) while Delta sits at 11.9 and White Rock converts well (5.5% CTR).
- **Competitors:** A1 Party Rentals (covers everything, generalist), Confetti (White Rock/South Surrey area), Westminster Party Rentals (actually Okanagan-focused).
- **Do:** Fix the New West typo URL (T3) and add internal links to `/new-westminster-party-rentals` — its 38.9 likely reflects the duplicate/typo mess. Nothing needed for Delta/White Rock.

### Long-tail neighborhood pages (East Clayton, Port Kells, Carvolth, etc.)
They exist, they're indexed, they catch scraps. **Do not build more.** Each additional near-duplicate neighborhood page now adds thin-content risk faster than it adds clicks.

---

## 5. CTR harvesting — the cheapest traffic you'll ever get

From the May GSC export:

| Page | Impressions | Position | CTR |
|---|---|---|---|
| /how-many-people-fit-at-a-6ft-rectangular-table | 16,056 | 6.0 | **0.23%** |
| /how-many-people-fit-at-round-tables | 4,641 | 8.1 | **0.15%** |
| /table-rental-and-chair-rentals | 692 | 35.6 | 0.72% |
| /tent-rentals-surrey | 624 | 32.3 | 0.80% |

The two table-capacity pages have ~20,700 monthly-period impressions and almost no clicks — searchers get the answer from the snippet or click a richer result. Plan:
1. Rewrite both titles to answer-first + curiosity gap: "How Many People Fit at a 6ft Table? (8 — But Only If…)".
2. Add a 40–50-word direct-answer block under the H1 (featured-snippet bait) and a comparison table (6ft vs 8ft vs 5ft round) marked up simply.
3. Add a visible "rent this table — from $10.95/day" CTA so the clicks you do win convert.
4. These two pages should also be your top internal-link sources — they're your most-crawled, highest-authority pages. Link from them to Burnaby/Richmond/New West city pages (the three laggards).

---

## 6. Off-site plan (this is where the next 6 months should go)

**Google Business Profile (single biggest lever):**
- Audit your listing: primary category "Party equipment rental agency", secondary "Tent rental service", "Furniture rental service". Add all 28 service-area cities (GBP caps at 20 — prioritize tier 1+2). Products section with real prices. Weekly photo posts in season.
- Review engine: same-evening review request after every delivery, rotating ask ("mention your city / what you rented" — naturally seeds keywords). Your visible count (150/160+) needs to keep compounding; tenure giants like Surdel/Pedersen's are beatable on velocity.
- Q&A: seed 8–10 real questions (pickup? stake vs ballast? delivery fee?) and answer them.
- Track Map Pack positions with a grid tool (Local Falcon / BrightLocal, ~$30–50/mo) across Surrey, Langley, Burnaby, Richmond, Vancouver. This is the visibility your GSC can't show you.

**Citations & memberships (high-ROI, boring, works):** Ridge Meadows Chamber already ranks on page 1 for Maple Ridge — replicate: Surrey Board of Trade, Greater Langley Chamber, Burnaby Board of Trade, Tri-Cities Chamber, Richmond Chamber, (optionally Abbotsford). Plus the directories that *already rank* in your SERPs: Eventective, GigSalad, Yelp, YellowPages, WeddingWire — claim/complete each profile ("barnacle SEO": those pages ranking = your listing visible).

**Links that matter:** venue preferred-vendor lists (golf clubs, halls, wineries — `_build/partner_outreach.md` already exists; execute it), school PAC/sports-banquet sponsorships (matches your Surrey schools positioning), local news (Surrey Now-Leader, Tri-City News) via a seasonal story ("backyard wedding boom").

**Don't:** buy links, do guest-post networks, or chase "domain authority" services. Local SERPs this size are won with GBP + a dozen real local links.

---

## 7. Content plan — small, targeted

You have 23 blog posts and they're well-aimed. Remaining gaps, in priority order:
1. Venue guides for the three laggard cities: Burnaby (Deer Lake/Swangard), Richmond (Steveston/Minoru/Olympic Oval), New West (Queen's Park). Mirror the Surrey-parks template.
2. One South Asian wedding page or post (Surrey/Save On gap; large local market you don't address).
3. "Party rental prices in \<city\>" — you have the Surrey/BC cost posts; the FAQ pricing answers on city pages already target this. Don't duplicate — just make sure the cost posts internally link to each tier-1 city page.
4. Christmas lights: leave until August; refresh dates/pricing then. Don't touch in June.

**Don't:** add posts for generic national queries ("how to plan a wedding") — wrong intent, wrong geography.

---

## 7.5 AI search performance (ChatGPT, Perplexity, Gemini, AI Overviews)

You're already ahead of every competitor here: `llms.txt`, `Content-Signal: ai-input=yes` in robots.txt, dense schema, FAQ-formatted answers, and plain-text prices on every city page — exactly the content AI assistants lift and cite. None of the competitors checked have any of this. What's left:

1. **Bing Webmaster Tools.** ChatGPT and Copilot retrieval runs on Bing's index. Verify the site, submit the sitemap, confirm city pages are indexed. Ten minutes, real coverage gain.
2. **Factual consistency is an AI problem too.** T2 (150+ vs 160+) matters double — assistants quote whichever number they scrape. One number, everywhere.
3. **The §5 table-capacity rewrite doubles as AI bait.** Direct-answer blocks are what AI Overviews and assistants quote; those two pages are your most-cited content.
4. **Citations feed AI answers.** Assistants lean on Yelp, Eventective, GigSalad, chambers when recommending vendors — the §6 directory/membership work is also AI-visibility work.
5. **Monitor manually monthly:** ask ChatGPT, Perplexity, and Gemini "best party rentals in Surrey BC / tent rental Langley" etc., log whether you're mentioned and what facts/prices they state. There's no tool that tracks this reliably yet; a 15-minute monthly log beats guessing. (Today's checks: your pages were the top source AI search summaries drew from in Surrey, Langley, Vancouver, Burnaby, Richmond, and Maple Ridge.)
6. **Keep `generate_llms_txt.py` in the build** so llms.txt never goes stale against the catalog.

## 8. Measurement & cadence

- **Now:** fresh GSC export → `_build/seo_baseline/2026-06-10_*` (post-sprint baseline). Set up Map Pack grid tracking.
- **Monthly:** GSC pages + queries export, compare against baseline; check `.html` variants are dropping out of the index after T1 ships (`site:foreverpartyrentals.com inurl:.html`).
- **Quarterly:** re-run city SERP checks; watch Nexgen Tents' `/locations/` build-out and Element's city pages — they're the only two structurally capable threats.

## 9. Priority order (everything above, one list)

| # | Action | Effort | Impact |
|---|---|---|---|
| 1 | T1: explicit `.html → extensionless` 301s in `_redirects` | 1–2 hrs | High |
| 2 | T2: unify review count, sync schema with real GBP count | 1 hr | High (protects your #1 click source) |
| 3 | CTR rewrite of 2 table-capacity pages + internal links to Burnaby/Richmond/New West | 3–4 hrs | High |
| 4 | GBP overhaul + review-velocity engine + Q&A | ongoing | Highest |
| 5 | T3: fix New West typo slug with 301 | 1 hr | Medium |
| 6 | Chamber memberships ×5 + claim ranking directories | 1 day + fees | High |
| 7 | Map Pack grid tracking (Local Falcon/BrightLocal) | 1 hr setup | Visibility |
| 8 | 3 venue guides (Burnaby, Richmond, New West) | 1 day | Medium |
| 9 | Venue preferred-vendor outreach (execute partner_outreach.md) | ongoing | Medium-High |
| 10 | South Asian wedding content | half day | Medium (Surrey) |

**Explicit don't-do list:** more neighborhood pages · more microsites · GBPs for microsite brands · virtual-office GBPs · rewriting city pages · more schema types · buying links · fighting On Time for Abbotsford #1 · "event rentals" keyword pool · touching Christmas pages before August · title churn.
