# Late September conversion plan (fill after 23 Sep 2026)

**Status:** waiting on the 3-day series. Do **not** implement site or ads changes from this file until every row in [series.md](series.md) through 23 Sep is `have`, then rewrite the recommendations below from the full set.

Chat prompt when the series is complete:

`Compare reports/clarity snapshots through 23 Sep and write the conversion plan in reports/clarity/late-september-plan.md. Do not implement yet.`

## Series so far

Numbers are 3-day UTC windows. Path metrics are query-stripped. Small-n city pages swing; require the same direction in **3+ windows** before acting.

| Metric | 11–14 Aug | 18–21 Aug | later windows |
| --- | --- | --- | --- |
| Sessions | 602 | 614 | |
| Quickback | 24.8% | 17.9% | |
| Avg scroll | 31% | 30.6% | |
| Active time | 80s | 86s | |
| `/thank-you` | 1 | 4 | |
| US share | 20% | 16% | |
| `{campaignname}` sessions | 59 | 35 | |
| `/` quickback / scroll | 20% / 15% | 14.8% / 15.2% | |
| `/chairs` quickback | 42% | 21.4% | |
| `/tables` quickback | 25% | 11.5% | |
| `/tents` quickback | 18% | 13.2% | |
| `/checkout` dead / active | — | 47.6% / 134s | |
| `/contact` quickback / thank-you | 21% / 1 | 0% / 4 | |
| Langley qb (paid) | 36% (6) | 38% (13) | |
| Surrey qb (paid) | 25% (7) | 38% (9) | |
| Abbotsford qb | — | 32% (13 paid) | |
| Maple Ridge qb (paid) | 9% (13) | 5% (14) | |
| Organic active / qb | 26s / 27.6% | 42s / 21.3% | |
| Paid scroll / qb | 23% / 20.9% | 18% / 19.8% | |
| Homepage paid sessions | 10 | 18 | |
| Wedding 100 pages/sess | ~1.0 | 1.00 | |
| Planner dead-click | 44% | 19% | |

After each pull, add a column. Do not delete earlier columns.

## Hypotheses (confirm or kill from the series)

1. Paid city landings (Langley / Surrey / Abbotsford) bounce because the hero only offers the full `/rentals` catalog. Maple Ridge on the same template stays low-quickback.
2. `/checkout` dead-clicks are the Adelie widget and cocktail xsell embed, not our chrome. People stay minutes — they want to pay.
3. Package “Book this package” → `/rentals` does not load a package; `?package=` is tracking-only. Wedding 100 stays at ~1 page/session.
4. Homepage 15% scroll is the tall mobile hero, not missing prices. V3 already put prices in the hero; scroll did not move.
5. `{campaignname}` still recording; US still a meaningful share; paid still hitting `/`.

## Plan (write this section only after 23 Sep)

Ranked by evidence across the series, not by the 21 Aug window alone.

1. …
2. …
3. …

## Out of scope until this file is filled

City hero chips, package `#tier-1` Book, homepage mobile compress, checkout wrapper, ads geo/campaign fixes. Those were parked on 21 Aug on purpose.
