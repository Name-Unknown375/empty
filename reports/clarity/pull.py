#!/usr/bin/env python3
"""Pull a 3-day Microsoft Clarity snapshot into reports/clarity/.

  export CLARITY_TOKEN='…'   # Settings → Data Export. Never commit.
  python3 reports/clarity/pull.py           # fetch last 72h (6 API calls)
  python3 reports/clarity/pull.py --status  # last snapshot / due? (no network)

Do not implement site changes from a pull. Collection runs through 23 Sep 2026.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

SCRIPT_DIR = Path(__file__).resolve().parent
# Launchd cannot read ~/Documents (TCC). Scheduled runs set CLARITY_OUT to
# ~/Library/Application Support/forever-party-rentals/snapshots.
ROOT = (
    Path(os.environ["CLARITY_OUT"]).expanduser().resolve()
    if os.environ.get("CLARITY_OUT")
    else SCRIPT_DIR
)
API = "https://www.clarity.ms/export-data/api/v1/project-live-insights"
SLICES = [
    ("overall", {}),
    ("url", {"dimension1": "URL"}),
    ("device", {"dimension1": "Device"}),
    ("channel", {"dimension1": "Channel"}),
    ("source", {"dimension1": "Source"}),
    ("campaign", {"dimension1": "Campaign"}),
]
# Baseline 14 Aug, then every 3 days from 21 Aug through 23 Sep.
EXPECTED = [
    date(2026, 8, 14),
    date(2026, 8, 21),
    date(2026, 8, 24),
    date(2026, 8, 27),
    date(2026, 8, 30),
    date(2026, 9, 2),
    date(2026, 9, 5),
    date(2026, 9, 8),
    date(2026, 9, 11),
    date(2026, 9, 14),
    date(2026, 9, 17),
    date(2026, 9, 20),
    date(2026, 9, 23),
]
COLLECTION_END = date(2026, 9, 23)
WATCH = [
    "/", "/rentals", "/checkout", "/contact", "/thank-you",
    "/event-layout-planner", "/chairs", "/tables", "/tents",
    "/dance-floor", "/starlink-rentals", "/pricing",
    "/wedding-package-100-guests", "/langley-party-rentals",
    "/surrey-party-rentals", "/abbotsford-party-rentals",
    "/maple-ridge-party-rentals", "/vancouver-party-rentals",
]


def fetch(token: str, extra: dict) -> list:
    params = {"numOfDays": "3", **extra}
    req = urllib.request.Request(
        API + "?" + urllib.parse.urlencode(params),
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "fpr-clarity-pull/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read())


def by_metric(payload: list) -> dict:
    return {m["metricName"]: m.get("information") or [] for m in payload}


def parse_url(u):
    if not u or u in ("None", "https://Electron"):
        return None, {}
    p = urlparse(u)
    path = p.path or "/"
    if path.endswith("/") and path != "/":
        path = path[:-1]
    qs = parse_qs(p.query)
    paid = any(k in qs for k in ("gclid", "gad_source", "gbraid", "wbraid"))
    med = (qs.get("utm_medium") or [""])[0].lower()
    if med in ("cpc", "ppc", "paidsearch", "paid"):
        paid = True
    return path, {
        "paid": paid,
        "term": (qs.get("utm_term") or qs.get("q") or [None])[0],
        "camp": (qs.get("utm_campaign") or [None])[0],
    }


def pct(n, d):
    return round(100.0 * n / d, 1) if d else 0.0


def rollup_urls(url_metrics: dict) -> list[dict]:
    qb = {r.get("Url"): r for r in url_metrics.get("QuickbackClick", [])}
    dead = {r.get("Url"): r for r in url_metrics.get("DeadClickCount", [])}
    scroll = {r.get("Url"): r for r in url_metrics.get("ScrollDepth", [])}
    eng = {r.get("Url"): r for r in url_metrics.get("EngagementTime", [])}
    agg = defaultdict(lambda: {
        "sessions": 0, "bots": 0, "paid": 0, "pps": 0.0, "pps_w": 0,
        "qb_sess": 0, "qb_with": 0.0, "dead_sess": 0, "dead_with": 0.0,
        "scroll_w": 0.0, "scroll_n": 0, "active": 0.0, "eng_n": 0,
    })
    for r in url_metrics.get("Traffic", []):
        path, meta = parse_url(r.get("Url"))
        if path is None:
            path = "(none)"
        a = agg[path]
        s = int(r.get("totalSessionCount") or 0)
        a["sessions"] += s
        a["bots"] += int(r.get("totalBotSessionCount") or 0)
        a["pps"] += float(r.get("pagesPerSessionPercentage") or 0) * s
        a["pps_w"] += s
        if meta.get("paid"):
            a["paid"] += s
        uurl = r.get("Url")
        q, d, sc, e = qb.get(uurl), dead.get(uurl), scroll.get(uurl), eng.get(uurl)
        if q:
            qs = int(q.get("sessionsCount") or 0)
            a["qb_sess"] += qs
            a["qb_with"] += qs * float(q.get("sessionsWithMetricPercentage") or 0) / 100.0
        if d:
            ds = int(d.get("sessionsCount") or 0)
            a["dead_sess"] += ds
            a["dead_with"] += ds * float(d.get("sessionsWithMetricPercentage") or 0) / 100.0
        if sc:
            a["scroll_w"] += float(sc.get("averageScrollDepth") or 0) * max(s, 1)
            a["scroll_n"] += max(s, 1)
        if e:
            a["active"] += float(e.get("activeTime") or 0) * max(s, 1)
            a["eng_n"] += max(s, 1)
    rows = []
    for path, a in agg.items():
        rows.append({
            "path": path,
            "sess": a["sessions"],
            "bots": a["bots"],
            "paid": a["paid"],
            "pps": round(a["pps"] / a["pps_w"], 2) if a["pps_w"] else 0,
            "qb": pct(a["qb_with"], a["qb_sess"]),
            "dead": pct(a["dead_with"], a["dead_sess"]),
            "scroll": round(a["scroll_w"] / a["scroll_n"], 1) if a["scroll_n"] else 0,
            "active": round(a["active"] / a["eng_n"]) if a["eng_n"] else 0,
        })
    rows.sort(key=lambda x: -x["sess"])
    return rows


def fmt_row(r: dict) -> str:
    return (
        f"| `{r['path']}` | {r['sess']} | {r['paid']} | {r['qb']}% | "
        f"{r['dead']}% | {r['scroll']}% | {r['active']}s | {r['pps']} |"
    )


def snapshot_dates() -> list[date]:
    found = []
    for p in ROOT.glob("20*-*-*.md"):
        m = re.fullmatch(r"(\d{4}-\d{2}-\d{2})\.md", p.name)
        if m:
            found.append(date.fromisoformat(m.group(1)))
    return sorted(found)


def write_series() -> None:
    have = set(snapshot_dates())
    today = datetime.now(timezone.utc).date()
    lines = [
        "# Clarity series tracker",
        "",
        "Updated by `pull.py`. Do not ship conversion work from these windows.",
        "After **23 Sep 2026**, fill [late-september-plan.md](late-september-plan.md).",
        "",
        "| Date | Status | File |",
        "| --- | --- | --- |",
    ]
    for d in EXPECTED:
        iso = d.isoformat()
        path = ROOT / f"{iso}.md"
        if d in have:
            lines.append(f"| {iso} | have | [{iso}.md]({iso}.md) |")
        elif today < d:
            lines.append(f"| {iso} | upcoming | — |")
        else:
            lines.append(f"| {iso} | **due** | `{path.name}` missing |")
    extras = [d for d in have if d not in EXPECTED]
    for d in extras:
        iso = d.isoformat()
        lines.append(f"| {iso} | extra | [{iso}.md]({iso}.md) |")
    (ROOT / "series.md").write_text("\n".join(lines) + "\n")


def status_text() -> str:
    have = snapshot_dates()
    today = datetime.now(timezone.utc).date()
    lines = [f"today (UTC): {today.isoformat()}"]
    if have:
        last = have[-1]
        age = (today - last).days
        lines.append(f"last snapshot: {last.isoformat()} ({age} day(s) ago)")
    else:
        last = None
        age = 999
        lines.append("last snapshot: none")
    if today > COLLECTION_END:
        lines.append("collection window closed — write late-september-plan.md, do not pull")
    elif last is None or age >= 3:
        nxt = next((d for d in EXPECTED if d not in have and d <= today), None)
        if nxt is None:
            nxt = next((d for d in EXPECTED if d > today), None)
        lines.append(f"pull due. next expected: {nxt.isoformat() if nxt else 'none'}")
    else:
        nxt = last + timedelta(days=3)
        lines.append(f"not due yet. next pull on or after {nxt.isoformat()}")
    missing = [d.isoformat() for d in EXPECTED if d <= today and d not in have]
    if missing:
        lines.append("missing expected: " + ", ".join(missing))
    return "\n".join(lines) + "\n"


def write_summary(day: str, slices: dict) -> str:
    overall = slices["overall"]
    lines = [
        f"# Clarity snapshot — {day}",
        "",
        f"- **Window:** last 3 days ending ~{day} UTC",
        "- **Source:** Microsoft Clarity Data Export API (`reports/clarity/pull.py`)",
        "- **Do not implement site changes from this file.** Append only.",
        "",
        "## Sitewide",
        "",
    ]
    for name in (
        "Traffic", "QuickbackClick", "DeadClickCount", "RageClickCount",
        "ScrollDepth", "EngagementTime", "ScriptErrorCount",
    ):
        lines.append(f"**{name}:** `{json.dumps((overall.get(name) or [])[:3])}`")
        lines.append("")

    lines += [
        "## Device traffic", "", "```json",
        json.dumps(slices["device"].get("Traffic"), indent=2), "```", "",
        "## Channel traffic", "", "```json",
        json.dumps(slices["channel"].get("Traffic"), indent=2), "```", "",
        "### Channel quality", "",
        "| Channel | Quickback | Scroll | Active |",
        "| --- | --- | --- | --- |",
    ]
    qb = {r.get("Channel"): r for r in slices["channel"].get("QuickbackClick", [])}
    sc = {r.get("Channel"): r for r in slices["channel"].get("ScrollDepth", [])}
    en = {r.get("Channel"): r for r in slices["channel"].get("EngagementTime", [])}
    for r in slices["channel"].get("Traffic", []):
        ch = r.get("Channel")
        q, s, e = qb.get(ch) or {}, sc.get(ch) or {}, en.get(ch) or {}
        lines.append(
            f"| {ch} | {q.get('sessionsWithMetricPercentage')}% | "
            f"{s.get('averageScrollDepth')}% | {e.get('activeTime')}s |"
        )

    lines += [
        "", "## Campaign traffic", "", "```json",
        json.dumps(slices["campaign"].get("Traffic"), indent=2), "```", "",
    ]

    rows = rollup_urls(slices["url"])
    lookup = {r["path"]: r for r in rows}
    lines += [
        "## Watch list (query-stripped paths)",
        "",
        "| Path | Sess | Paid | Quickback | Dead | Scroll | Active | Pages/sess |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for p in WATCH:
        r = lookup.get(p)
        lines.append(fmt_row(r) if r else f"| `{p}` | 0 | — | — | — | — | — | — |")

    lines += [
        "",
        "## Top paths (min 8 sessions)",
        "",
        "| Path | Sess | Paid | Quickback | Dead | Scroll | Active | Pages/sess |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in rows:
        if r["sess"] >= 8:
            lines.append(fmt_row(r))

    lines.append("")
    lines.append("## Highest quickback (min 8 sessions)")
    lines.append("")
    for r in sorted([x for x in rows if x["sess"] >= 8], key=lambda x: -x["qb"])[:15]:
        lines.append(
            f"- `{r['path']}` sess={r['sess']} qb={r['qb']}% "
            f"scroll={r['scroll']}% paid={r['paid']}"
        )
    lines.append("")
    return "\n".join(lines)


def days_since_last(today: date, have: list[date]) -> int:
    if not have:
        return 999
    return (today - max(have)).days


def skip_reason(today: date, have: list[date], *, force: bool = False) -> str | None:
    """Return a skip message, or None if this run should hit the API."""
    if today.year != 2026 or today > COLLECTION_END:
        return (
            "Collection ended 23 Sep 2026. Compare the series in "
            "late-september-plan.md instead of pulling."
        )
    if (ROOT / f"{today.isoformat()}.md").exists():
        return f"already have {today.isoformat()}.md — skip"
    if force:
        return None
    if days_since_last(today, have) < 3:
        return "not due yet (last snapshot less than 3 days ago) — skip"
    return None


def load_dotenv() -> None:
    """Load .env next to the output dir or the script. Does not override existing env."""
    seen: set[Path] = set()
    for path in (ROOT / ".env", SCRIPT_DIR / ".env"):
        try:
            path = path.resolve()
        except OSError:
            continue
        if path in seen or not path.is_file():
            continue
        seen.add(path)
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = val


def pull(*, force: bool = False) -> int:
    load_dotenv()
    token = (os.environ.get("CLARITY_TOKEN") or "").strip()
    if not token:
        print(
            "Set CLARITY_TOKEN or put it in reports/clarity/.env "
            "(gitignored). Clarity → Settings → Data Export.",
            file=sys.stderr,
        )
        return 1
    today = datetime.now(timezone.utc).date()
    reason = skip_reason(today, snapshot_dates(), force=force)
    if reason:
        print(reason)
        write_series()
        return 0
    day = today.isoformat()
    md_path = ROOT / f"{day}.md"
    raw_dir = ROOT / "raw" / day
    raw_dir.mkdir(parents=True, exist_ok=True)
    slices = {}
    for name, extra in SLICES:
        print(f"fetching {name}…", flush=True)
        try:
            payload = fetch(token, extra)
        except urllib.error.HTTPError as e:
            print(f"{name} failed HTTP {e.code}: {e.read()[:300]!r}", file=sys.stderr)
            return 2
        (raw_dir / f"{name}.json").write_text(json.dumps(payload, indent=2))
        slices[name] = by_metric(payload)
        time.sleep(0.4)
    md_path.write_text(write_summary(day, slices))
    write_series()
    print(f"wrote {md_path}")
    print(f"raw {raw_dir}")
    print(f"series {ROOT / 'series.md'}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--status",
        action="store_true",
        help="Print last snapshot and whether a pull is due (no API call).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Fetch even when the last snapshot is under 3 days old.",
    )
    args = parser.parse_args()
    write_series()
    if args.status:
        sys.stdout.write(status_text())
        return 0
    return pull(force=args.force)


if __name__ == "__main__":
    sys.exit(main())
