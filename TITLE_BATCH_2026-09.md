# Title/Meta Batch — September 1, 2026 (FREEZE ARTIFACT)

**One deliberate batch, then a sitewide title freeze until 29 Sep 2026.** No title edits anywhere before then, regardless of mid-September wobble. Judge at the 29 Sep GSC read (Canada / Web / last 28 days — not a 3-month zip).

**Rollback rule (29 Sep):** any page below that lost >30% of clicks over 4+ weeks *at stable position* → revert that one title from this table.

**Rationale:** GSC Canada Web 30 May–29 Aug. Clicks plateaued after the July lift (1,348 → 1,323 in August). The leftover money is snippets already on page 1 (seating guides, `event rentals surrey`, inverted Langley/Abbotsford) and category hubs Google is not using (`/tents` 16 impressions, `/tables` 12). Vancouver is still a rank gap — off-site, not this batch. Numbers and SERP read: [gsc-ctr-visibility canvas](/Users/devon/.cursor/projects/Users-devon-Documents-Forever-Party-Rentals/canvases/gsc-ctr-visibility.canvas.tsx).

## Changes

| Page | Old title | New title |
|---|---|---|
| /how-many-people-fit-at-a-6ft-rectangular-table | 6ft Table Seats 6–8 — Rent Banquet Tables in BC | **How Many People Fit at a 6 Foot Table? 6–8** (answer-first; query language; rental CTA stays in the description) |
| /how-many-people-fit-at-round-tables | 5ft Round Table Seats 8 — Rent Round Tables in BC | **How Many People Fit at a 5ft Round Table? 8** |
| /surrey-party-rentals | Surrey Party Rentals — Local Warehouse, Setup Included | **Surrey Event & Party Rentals — Local Warehouse** (`event rentals surrey` ranks this URL at pos 2.3 with 0.93% CTR; `/event-rentals` is not the ranking URL) |
| /langley-party-rentals | Langley Party Rentals — Delivery & Setup Included | **Langley Party Rentals — Forever Crew, From $550** (differentiate from Langley Party Rentals Inc. on the inverted query) |
| /abbotsford-party-rentals | Abbotsford Party Rentals — Tents, Chairs & Tables | **Abbotsford Party Rentals — Acreage Setup from $550** |
| /dance-floor-rental-vancouver | Dance Floor Rentals in Vancouver — Crew + Setup | **Dance Floor Rentals in Vancouver — from $800** (fixed 12×12/12×12 typo to 8×8, 12×12, 16×16; $800 is the city-template floor rate) |
| / | Forever Party Rentals \| Party Rentals Near You — Surrey & Metro Vancouver | **Party Rentals Near You — Surrey Warehouse \| Forever** |
| /tents | Tent Rentals — Marquee Tents from $550 | **Tent Rentals — Marquees from $550, Lower Mainland** |
| /tables | Table & Chair Rentals — Surrey & Lower Mainland | **Table Rentals — Rounds & Banquet from $10.95** |
| /birthday-party-rentals | Birthday Party Rentals — Metro Vancouver Tents | **Birthday Party Rentals — Tents, Tables & Games** |
| /wedding-rentals | *(title held — already matches `wedding party rentals`)* | H1 + intro links only: H1 is now **Wedding Party Rentals**; body links `/tents` `/chairs` `/tables` `/dance-floor` |

## Shipped alongside (same deploy, not extra title changes)

- City template: catalogue strip on every city hub linking `/tents` `/chairs` `/tables` `/dance-floor` `/wedding-rentals` `/birthday-party-rentals`. Product cards still point at city×product URLs.
- Footer: Birthday Party Rentals added next to Wedding Rentals.
- `/tents` and `/tables` intros now link the sibling hubs plus wedding/birthday.

## Explicit holds (documented decisions, zero title edits)

Burnaby · Maple Ridge · Coquitlam / Port Coquitlam (title already names Port Coquitlam) · Vancouver city page (rank gap; off-site) · North Vancouver (July title is the one that moved) · Starlink · projector hub (4,396 query impressions / 0.34% CTR — visibility without rental intent) · `/event-rentals` URL (do not try to rank it for `event rentals surrey`) · no new city pages · no Review / aggregateRating schema · Christmas-light titles wait for the October GBP pass in DEPLOY_CHECKLIST §6.

## 29 Sep scoreboard

| Query / page | Now (3-month Canada Web) | 29 Sep target (28-day window) |
|---|---|---|
| event rentals surrey CTR | 0.93% at pos 2.3 | ≥4% |
| langley party rentals CTR | 1.22% at pos 5.1 | ≥4% |
| abbotsford party rentals CTR | 1.32% at pos 4.8 | ≥4% |
| 6ft seating-guide page CTR | 0.45% at pos 6.0 | ≥3% |
| /tents impressions | 16 | triple+ |
| /tables impressions | 12 | triple+ |
| /wedding-rentals impressions | 42 | triple+ |
| /birthday-party-rentals impressions | 57 | triple+ |
| party rentals vancouver position | 22.5 | ≤15 (off-site, not this batch) |

Export **Last 28 days** Canada Web on 29 Sep into `_build-v3/seo_baseline/2026-09-29_*.csv` and run `python3 _build-v3/local_band_report.py`. The May–August 3-month zip is the wrong grain for that script.
