# Clarity collection (through late September 2026)

Do **not** ship conversion changes from these notes. Pull a 3-day snapshot on the
cadence below, then fill [late-september-plan.md](late-september-plan.md) after
**23 Sep 2026**.

The Data Export API only returns the last 1–3 days of **aggregates** (max 10
calls/project/day). It cannot pull session recordings or custom events
(`quote_form_submit`, `page_class`). `/thank-you` pageviews are the quote-submit
proxy. Adelie checkouts are not in Clarity except as `/checkout` pageviews.

## Cadence

Every 3 days, last 72 hours, UTC. Tracker: [series.md](series.md).

- Have: 14 Aug (baseline), 21 Aug (first post-V3), 24 Aug (manual after 10:00 LaunchAgent failed)
- Remaining: 27 Aug, 30 Aug, 2 Sep, 5 Sep, 8 Sep, 11 Sep, 14 Sep, 17 Sep, 20 Sep, 23 Sep
- **After 23 Sep:** stop collecting, fill the late-September plan

In chat: `Pull the latest 3-day Clarity snapshot into reports/clarity. Do not implement site changes.`

## How to pull

```bash
# one-shot
python3 reports/clarity/pull.py --status
python3 reports/clarity/pull.py

# every 3 days on this Mac (10:00 local on the dates in series.md)
cp reports/clarity/.env.example reports/clarity/.env   # then paste the token
./reports/clarity/install-launchd.sh   # click Allow if macOS asks for Documents
```

Details: [how-to-pull.md](how-to-pull.md). Script: [pull.py](pull.py). GitHub Action: `.github/workflows/clarity-pull.yml` (needs secret `CLARITY_TOKEN` on a real GitHub remote).

Uses 6 of the 10 daily API calls (overall, URL, Device, Channel, Source, Campaign).
Writes `raw/YYYY-MM-DD/*.json` plus `YYYY-MM-DD.md`. Idempotent if that day’s file already exists.

Project tag on the site: `qu3zf92dem`. Live publish dir is `site-v3`.

## Snapshots

| File | Window (UTC, ~3 days ending) | Notes |
| --- | --- | --- |
| [2026-08-14.md](2026-08-14.md) | 11–14 Aug | Pre/at V3 ship. First-screen price + Book not yet in the numbers (V3 went live 14 Aug 12:54 PDT). |
| [2026-08-21.md](2026-08-21.md) | 18–21 Aug | First post-V3 window. Quickback 25% → 18%. City paid + checkout still leak. |
| [2026-08-24.md](2026-08-24.md) | ~21–24 Aug | 531 sessions, quickback 19.8%, scroll 34%. Pulled ~15:01 PDT (10:00 job was TCC-blocked). |

Aug 14 source: prior Clarity canvas and the 14 Aug UX chat. Later windows come from `pull.py`.

## Hypotheses to re-check in September (do not build yet)

1. Paid city landings (Langley / Surrey / Abbotsford) bounce because the hero only offers the full `/rentals` catalog.
2. `/checkout` dead-clicks are the Adelie widget (and the cocktail xsell embed), not our chrome.
3. Package “Book this package” → `/rentals` does not load a package; `?package=` is tracking-only.
4. Homepage 15% scroll is the tall mobile hero, not missing prices.
5. `{campaignname}` and US paid traffic are still wasting spend.

## Token

Only project admins can mint a token. Rotate if it was pasted into a chat.
Store it in the shell env, not in this repo.
