# How to pull / automate the 3-day window

## Manual

```bash
export CLARITY_TOKEN='…'   # or put it in reports/clarity/.env (gitignored)
python3 reports/clarity/pull.py --status
python3 reports/clarity/pull.py
```

## Automated (this Mac)

```bash
cp reports/clarity/.env.example reports/clarity/.env
# paste CLARITY_TOKEN=… into .env
./reports/clarity/install-launchd.sh
```

Fires at 10:00 local on 24 / 27 / 30 Aug and 2 / 5 / 8 / 11 / 14 / 17 / 20 / 23 Sep.

The job is a small app (`ClarityPull.app` in Application Support), not a bash script under Documents. macOS blocked the 24 Aug 10:00 run for that reason. The first time the app launches, click **Allow** if macOS asks for access to Documents — that is what copies snapshots into `reports/clarity/`.

Canonical files also live in `~/Library/Application Support/forever-party-rentals/snapshots/`. If a dated `.md` is still missing from the repo after a morning run:

```bash
./reports/clarity/sync-from-support.sh
```

Log: `~/Library/Application Support/forever-party-rentals/clarity-pull.log`. Uninstall: `./reports/clarity/install-launchd.sh --uninstall`.

The Mac must be on (or wake) around 10:00 on those days. Missed runs do not backfill — run `pull.py` once that day if you were away.

## Automated (GitHub Actions)

Workflow: `.github/workflows/clarity-pull.yml`. After this repo is on GitHub:

1. Settings → Secrets → Actions → New secret named `CLARITY_TOKEN`
2. Push the workflow
3. Same calendar in UTC (17:00 = 10:00 PDT)

`workflow_dispatch` can run it by hand. After 23 Sep 2026 the script exits 0 and writes nothing.

Chat fallback: `Pull the latest 3-day Clarity snapshot into reports/clarity. Do not implement site changes.`
