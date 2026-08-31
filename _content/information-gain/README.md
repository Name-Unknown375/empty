# Information-gain capture kit

Nothing in this folder ships until Devon confirms it is real and permitted.
Job photos, extra Google reviews, RentKit stats, survey tables, venue quotes,
and YouTube embeds all wait here first.

A page ships when it has **at least one** of: a GBP-matched HTML review unique
to that URL, a job photo with named location, a first-party number/table, an
attributed expert line, a team video embed, or a planner diagram from FPR packing
rules.

## GBP reviews

Done against the 2026-08-22 Apify scrape (215 reviews, 184 with text). Raw scrape is not in git.

1. [gbp-verified.json](gbp-verified.json) — quotes currently in HTML. Exact scrape text, one `primaryUrl` plus `/reviews`.
2. [gbp-pending.json](gbp-pending.json) — empty. The invented names listed in `absentFromScrape` were not on GBP.
3. [gbp-harvest.json](gbp-harvest.json) — 42 real reviews for future page-specific use. Do not spray them onto every URL.
4. Generators must **not** rotate a pool onto every city page. Override `testimonials:` only when the quote names that city or job.

## Job photos

Folder: [job-photos/](job-photos/). Required metadata per file (put it in [job-photos/log.md](job-photos/log.md)):

- Date
- City (Langley, Surrey, Abbotsford, Maple Ridge, Vancouver, North Vancouver, Burnaby, Coquitlam are the first targets)
- Venue or neighborhood
- Equipment in frame
- Client permission (yes/no)

Do not recaption `/images/lifestyle/tent-golden-hour-2` (or any shared lifestyle file) as a local install.

## RentKit season stats

Export one dated block into [season-stats.md](season-stats.md): most-booked tent size last 12 months, backyard vs venue share, typical 100-guest package. Publish on `/tents` and the 2026 price-list post only after the numbers are real.

## Survey

Five questions to past bookers. First topic: tent size regret / what they’d rent differently. Publish n, date, and the table — not a vibe. Draft questions in [survey.md](survey.md).

## Venue quotes

Two attributed quotes from people we already coordinate with (Krause, Township 7, Park Board, etc.). Permission required. [venue-quotes.md](venue-quotes.md).

## YouTube

Three short clips (tent stake, dance-floor install, Chiavari unload). Embed with transcripts on `/tents`, `/dance-floor`, `/chairs` only. [youtube.md](youtube.md).

## Money-city pages (after capture)

One true photo + one city-named review + local-knowledge tighten:

- Langley, Surrey, Vancouver, Abbotsford, Maple Ridge, Burnaby, North Vancouver, Coquitlam each have unique GBP quotes (city-named where they exist; otherwise a harvest quote used only on that URL).
- Maple Ridge override is still testimonials-only until a real job photo exists.
- Drop original crew photos in [job-photos/](job-photos/) and fill a row in the log.
