#!/usr/bin/env python3
"""Monthly local-band SEO scoreboard from GSC exports.

Automates the §1–§3 tables of BC_FOCUS_REVIEW_2026-07-01.md with the SAME
classification definitions, so month-over-month comparisons stay
apples-to-apples. Workflow (1st of each month):

  1. GSC Performance → filter Country = Canada, Search type = Web, Last 28 days
     → Export → download the zip.
  2. Save the CSVs into _build/seo_baseline/ prefixed with the WINDOW-END date:
         2026-07-29_Queries.csv, 2026-07-29_Pages.csv, 2026-07-29_Chart.csv,
         2026-07-29_Filters.csv, 2026-07-29_Countries.csv, ...
     (rename "Search appearance.csv" → ..._Search_appearance.csv)
  3. python3 _build/local_band_report.py            # newest two snapshots
     python3 _build/local_band_report.py --windows 3
     python3 _build/local_band_report.py --dates 2026-06-28,2026-07-29
     python3 _build/local_band_report.py --out /tmp/report.md

Judging rules baked in (from the July gameplan):
  - Judge query-level positions and local-band clicks — NEVER aggregate
    CTR/position (impression floods at deep positions poison averages).
  - Aug-1 pass bands are evaluated automatically (§ PASS BANDS).
  - Sep-1 title-rollback rule: a retitled page with clicks down ≥30% at
    stable position for 4+ weeks reverts. The report FLAGS candidates; the
    4-week/Sep-1 judgment stays human.

Known data limits (see BC_FOCUS_REVIEW §7): exports truncate at 1,000 query
rows and hide anonymized queries (the report prints the visible share);
GSC cannot filter below country — the export MUST be Canada-filtered, and the
report warns if a snapshot isn't (the Jun-8 all-geo baseline trap).
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASELINE = HERE / "seo_baseline"

# ---------------------------------------------------------------------------
# Bucket regexes — canonical definitions from BC_FOCUS_REVIEW_2026-07-01 §2.
# Do not "improve" casually: changing them breaks month-over-month comparisons.
# ---------------------------------------------------------------------------

LOCAL_GEO = r"(surrey|langley|vancouver(?! wa)|burnaby|richmond(?! hill| va| ca\b)|abbotsford|abby|coquitlam|maple ridge|pitt meadows|\bdelta\b|white rock|new west|westminster|tsawwassen|ladner|\bmission\b|chilliwack|aldergrove|fort langley|walnut grove|willoughby|carvolth|port kells|port moody|anmore|harrison|north shore|fraser valley|lower ?mainland|lonsdale|clayton|newton|whytecliff|stanley park|queen elizabeth park|steveston|bc\b|british columbia)"
OUT_BAND = r"(fernie|mactaquac|fredericton|oromocto|st andrews|st-george|new brunswick|northwest territ|\balberta\b|edmonton|grande? prairie|north bay|prince george|kamloops|vernon(?! bc)|nanaimo|vancouver island|comox|courtenay|duncan|parksville|campbell river|owen sound|port elgin|penticton|toronto|richmond hill|richmond va|richmond ca\b|vancouver wa|yardley|ontario|georgetown|london|milton|iroquois|brampton|naperville|san clemente|halton|huntsville|huron perth|simcoe|ormond beach|sedalia|kenya|za\b)"
BRAND = r"(forever ?part|forever ?rental|foreverevents|now and forver)"
COMPETITOR = r"(surdel|save on tent|on time (party|rental)|a ?& ?b party|a&b|ab party|allevents|pedersen|pederson|element rental|vancan|lonsdale event|lonsdale party|north shore party rentals|crown tent|nexgen|langley party rentals inc|petes|pete's|brar|surrey tent and party|confetti party|rowe|4 season|four season|classic party|celebration party|avalon|phoenix tent|elevation tent|premium party rentals|good ?time party|partyrentalshub|special event rentals|higgins|fermco|burke|lauzon|marshall tent|springfield tent|paradise tent|maple tent)"
INFORMATIONAL = r"(how many|seats how many|what size|dimensions?|fit at|fit around|fit in|fit on|fit under|sit at|sit around|sit on|seats?\b.*table|table.*seats?\b|tablecloth|table cloth for|square feet per person|seating capacity|capacity calculator|in inches|in cm|personnes|personen|persoons|tafel|eettafel|mesa de|sillas|combien|afmeting|layout planner|layout tool|layout software|layout generator|layout maker|floor plan|floorplan|seating software|diagram|planner free|planning software|table planner|round table seating|banquet table (size|height|dimensions|length)|martian|venusian|earthling|black.*white.*sitting|tent size|size tent|tent for \d+|guests|marquee size|tent.*capacity|capacity.*tent|how big|how long is|how wide|how much space|20x40 tent how many|tent on (a )?deck|tent on concrete|secure tent|starlink.*(setup|connect|activate)|how to set up)"

BUCKET_ORDER = [
    ("branded", "Branded (forever…)"),
    ("local-geo", "BC local-geo (city-modified)"),
    ("generic", "Generic rental intent (no geo — served locally)"),
    ("informational", "Informational (sizes, layouts — AI-citation engine)"),
    ("out-of-band", "Out-of-band geo (impressions-only noise)"),
    ("competitor", "Competitor brands"),
]


def bucket(q: str) -> str:
    ql = q.lower()
    if re.search(BRAND, ql):
        return "branded"
    if re.search(OUT_BAND, ql):
        return "out-of-band"
    if re.search(INFORMATIONAL, ql):
        return "informational"
    if re.search(COMPETITOR, ql):
        return "competitor"
    if re.search(LOCAL_GEO, ql):
        return "local-geo"
    return "generic"


# ---------------------------------------------------------------------------
# Scoreboard: the ~40 queries that matter (BC_FOCUS_REVIEW §3 list).
# ---------------------------------------------------------------------------

MONEY_QUERIES = [
    "forever party rentals",
    "party rentals surrey", "surrey party rentals", "party rentals surrey bc",
    "party rentals langley", "langley party rentals",
    "party rentals vancouver", "vancouver party rentals",
    "party rentals burnaby", "party rentals richmond", "richmond party rentals",
    "party rentals abbotsford", "abbotsford party rentals",
    "party rentals coquitlam", "party rentals port coquitlam",
    "party rentals maple ridge", "party rentals tsawwassen",
    "party rentals north vancouver", "north vancouver party rentals",
    "westminster party rentals", "north shore party rentals",
    "party rentals near me", "delta party rentals",
    "event rentals surrey", "event rentals vancouver",
    "tent rental surrey", "tent rentals surrey", "tent rentals surrey prices",
    "tent rentals langley", "tent rental langley",
    "tent rentals vancouver", "tent rental vancouver", "tent rentals abbotsford",
    "table rentals surrey",
    "chair rentals surrey", "chair rentals langley", "chair rentals vancouver",
    "chair rentals north vancouver",
    "starlink rental", "starlink rental vancouver",
    "dance floor rental vancouver",
]

KEY_PAGES = [
    "/", "/surrey-party-rentals", "/langley-party-rentals",
    "/vancouver-party-rentals", "/north-vancouver-party-rentals",
    "/west-vancouver-party-rentals", "/new-westminster-party-rentals",
    "/burnaby-party-rentals", "/richmond-party-rentals",
    "/abbotsford-party-rentals", "/coquitlam-party-rentals",
    "/maple-ridge-party-rentals",
    "/starlink-rentals", "/projector-rentals", "/battery-power-stations",
    "/tent-rentals-surrey", "/table-rentals-surrey", "/dance-floor",
    "/rentals", "/event-rentals",
]

PAGE_GROUPS = {
    "Vancouver-side city pages": [
        "/vancouver-party-rentals", "/north-vancouver-party-rentals",
        "/west-vancouver-party-rentals", "/new-westminster-party-rentals",
        "/burnaby-party-rentals", "/richmond-party-rentals",
    ],
    "South-Fraser / Valley city pages": [
        "/surrey-party-rentals", "/langley-party-rentals",
        "/abbotsford-party-rentals", "/maple-ridge-party-rentals",
        "/coquitlam-party-rentals", "/white-rock-party-rentals",
        "/delta-party-rentals", "/pitt-meadows-party-rentals",
        "/port-moody-party-rentals", "/fort-langley-party-rentals",
        "/langley-township-party-rentals", "/chilliwack-party-rentals",
    ],
}

# July title batch (TITLE_BATCH_2026-07.md) — Sep-1 rollback watch list.
RETITLED_PAGES = [
    "/vancouver-party-rentals", "/north-vancouver-party-rentals",
    "/new-westminster-party-rentals", "/west-vancouver-party-rentals",
    "/tent-rentals-surrey", "/table-rentals-surrey", "/projector-rentals",
]

# June–July content whose indexing we're waiting on.
NEW_PAGES = [
    "/blog/burnaby-wedding-venues-rental-guide",
    "/blog/richmond-wedding-venues-rental-guide",
    "/blog/new-westminster-wedding-venues-rental-guide",
    "/blog/event-wifi-starlink-rental",
]


# ---------------------------------------------------------------------------
# Aug-1 pass bands (gameplan "Verification & the Aug 1 read").
# Each: (label, kind, key, test(prev_row, cur_row) -> (ok, detail)).
# ---------------------------------------------------------------------------

def _pos(r):
    # Bands were written from GSC's 1-decimal display; compare at that
    # precision so pos 5.01 doesn't "fail" a ≤5 band.
    return round(num(r["Position"]), 1) if r else None


def _clicks(r):
    return int(num(r["Clicks"])) if r else 0


def _impr(r):
    return int(num(r["Impressions"])) if r else 0


PASS_BANDS = [
    ("party rentals vancouver ≤ pos 25 (regression stopped)", "query",
     "party rentals vancouver",
     lambda p, c: (c is not None and _pos(c) <= 25,
                   f"pos {_pos(c)}" if c else "not in export")),
    ("party rentals north vancouver ≤ pos 8 with first clicks", "query",
     "party rentals north vancouver",
     lambda p, c: (c is not None and _pos(c) <= 8 and _clicks(c) >= 1,
                   f"pos {_pos(c)}, {_clicks(c)}c" if c else "not in export")),
    ("westminster party rentals ≤ pos 8", "query",
     "westminster party rentals",
     lambda p, c: (c is not None and _pos(c) <= 8,
                   f"pos {_pos(c)}" if c else "not in export")),
    ("north shore party rentals: first click", "query",
     "north shore party rentals",
     lambda p, c: (c is not None and _clicks(c) >= 1,
                   f"{_clicks(c)}c / {_impr(c)}i" if c else "not in export")),
    ("tent rentals surrey prices ≥ 2 clicks", "query",
     "tent rentals surrey prices",
     lambda p, c: (c is not None and _clicks(c) >= 2,
                   f"{_clicks(c)}c" if c else "not in export")),
    ("table rentals surrey ≥ 2 clicks", "query",
     "table rentals surrey",
     lambda p, c: (c is not None and _clicks(c) >= 2,
                   f"{_clicks(c)}c" if c else "not in export")),
    ("HOLD party rentals burnaby pos 2.4 ± 0.5", "query",
     "party rentals burnaby",
     lambda p, c: (c is not None and 1.9 <= _pos(c) <= 2.9,
                   f"pos {_pos(c)}" if c else "not in export")),
    ("HOLD party rentals maple ridge clicks ≥ 4", "query",
     "party rentals maple ridge",
     lambda p, c: (c is not None and _clicks(c) >= 4,
                   f"{_clicks(c)}c" if c else "not in export")),
    ("HOLD party rentals abbotsford ≤ pos 5", "query",
     "party rentals abbotsford",
     lambda p, c: (c is not None and _pos(c) <= 5,
                   f"pos {_pos(c)}" if c else "not in export")),
    ("HOLD party rentals langley ≥ 8 clicks", "query",
     "party rentals langley",
     lambda p, c: (c is not None and _clicks(c) >= 8,
                   f"{_clicks(c)}c" if c else "not in export")),
    ("brand impressions ≥ 250 (forever party rentals)", "query",
     "forever party rentals",
     lambda p, c: (c is not None and _impr(c) >= 250,
                   f"{_impr(c)}i" if c else "not in export")),
    ("New West page CTR ≥ 1.0% (was 0.42%)", "page",
     "/new-westminster-party-rentals",
     lambda p, c: (c is not None and _impr(c) > 0
                   and _clicks(c) / _impr(c) >= 0.01,
                   (f"{_clicks(c)}c / {_impr(c)}i = "
                    f"{_clicks(c) / max(_impr(c), 1) * 100:.2f}%")
                   if c else "not in export")),
]


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def num(s) -> float:
    if s is None:
        return 0.0
    s = str(s).replace("%", "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


def load_csv(path: Path):
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def key0(rows):
    return list(rows[0].keys())[0]


def norm_url(u: str) -> str:
    u = u.replace("https://www.foreverpartyrentals.com", "")
    u = u.replace("https://foreverpartyrentals.com", "")
    return u or "/"


class Snapshot:
    def __init__(self, date: str):
        self.date = date
        pre = BASELINE / f"{date}_"

        self.queries = load_csv(Path(f"{pre}Queries.csv"))
        qk = key0(self.queries)
        self.qmap = {r[qk].lower(): r for r in self.queries}

        self.pages_raw = load_csv(Path(f"{pre}Pages.csv"))
        pk = key0(self.pages_raw)
        self.pmap = {norm_url(r[pk]): r for r in self.pages_raw}
        # apex/.html duplicates kept separately for the leak metric
        self.leak_clicks = sum(
            int(num(r["Clicks"])) for r in self.pages_raw
            if r[pk].endswith(".html")
            or r[pk].startswith("https://foreverpartyrentals.com"))
        self.leak_impr = sum(
            int(num(r["Impressions"])) for r in self.pages_raw
            if r[pk].endswith(".html")
            or r[pk].startswith("https://foreverpartyrentals.com"))

        self.chart = []
        chart_p = Path(f"{pre}Chart.csv")
        if chart_p.exists():
            self.chart = sorted(load_csv(chart_p), key=lambda r: r["Date"])

        # Country filter check (the all-geo-baseline trap: correction #2 of
        # the July review — never compare all-geo page rows to Canada rows).
        self.country = None
        filt_p = Path(f"{pre}Filters.csv")
        if filt_p.exists():
            for r in load_csv(filt_p):
                if r.get("Filter", "").strip().lower() == "country":
                    self.country = r.get("Value", "").strip()

        # Aggregate totals: prefer the Countries.csv row (GSC's own numbers).
        self.tot_clicks = self.tot_impr = 0
        self.tot_pos = None
        co_p = Path(f"{pre}Countries.csv")
        if co_p.exists():
            rows = load_csv(co_p)
            self.tot_clicks = sum(int(num(r["Clicks"])) for r in rows)
            self.tot_impr = sum(int(num(r["Impressions"])) for r in rows)
            wi = sum(num(r["Impressions"]) for r in rows)
            if wi:
                self.tot_pos = round(sum(
                    num(r["Position"]) * num(r["Impressions"])
                    for r in rows) / wi, 1)
        elif self.chart:
            self.tot_clicks = sum(int(num(r["Clicks"])) for r in self.chart)
            self.tot_impr = sum(int(num(r["Impressions"])) for r in self.chart)

        self.window = (
            f"{self.chart[0]['Date']} → {self.chart[-1]['Date']}"
            if self.chart else "(no Chart.csv)")

    @property
    def visible_clicks(self):
        return sum(int(num(r["Clicks"])) for r in self.queries)

    @property
    def visible_impr(self):
        return sum(int(num(r["Impressions"])) for r in self.queries)

    def buckets(self):
        agg = defaultdict(lambda: [0, 0])
        qk = key0(self.queries)
        for r in self.queries:
            b = bucket(r[qk])
            agg[b][0] += int(num(r["Clicks"]))
            agg[b][1] += int(num(r["Impressions"]))
        return agg


def discover_dates() -> list[str]:
    dates = sorted({
        m.group(1) for p in BASELINE.glob("*_Queries.csv")
        if (m := re.match(r"(\d{4}-\d{2}-\d{2})_", p.name))})
    return dates


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def fmt_cell(r) -> str:
    if r is None:
        return "—"
    return f"{num(r['Position']):.1f} · {int(num(r['Clicks']))}c · {int(num(r['Impressions']))}i"


def verdict(prev, cur) -> str:
    if cur is None:
        return "gone from export"
    if prev is None:
        return "new"
    dp = num(cur["Position"]) - num(prev["Position"])
    dc = int(num(cur["Clicks"])) - int(num(prev["Clicks"]))
    if dp <= -1.0:
        return f"✅ improved ({dp:+.1f} pos)"
    if dp >= 1.5:
        return f"❌ slipping ({dp:+.1f} pos)"
    if dc <= -3:
        return f"⚠️ rank held, clicks {dc:+d}"
    return "held"


def build_report(snaps: list["Snapshot"]) -> str:
    cur = snaps[-1]
    prev = snaps[-2] if len(snaps) > 1 else None
    L: list[str] = []
    add = L.append

    add(f"# Local-band scoreboard — window ending {cur.date}")
    add("")
    add("Generated by `_build/local_band_report.py` (definitions frozen to "
        "BC_FOCUS_REVIEW_2026-07-01). Judge query-level rows and local-band "
        "clicks — never aggregate CTR/position.")
    add("")

    # --- data quality -------------------------------------------------------
    add("## Data quality")
    add("")
    for s in snaps:
        flag = (f"Country = {s.country}" if s.country
                else "⚠️ **NO COUNTRY FILTER (all-geo)** — page-level rows "
                     "are NOT comparable to Canada-filtered windows")
        vis_c = f"{s.visible_clicks / max(s.tot_clicks, 1) * 100:.0f}%"
        vis_i = f"{s.visible_impr / max(s.tot_impr, 1) * 100:.0f}%"
        add(f"- **{s.date}** ({s.window}): {flag}. Visible in export: "
            f"{s.visible_clicks}/{s.tot_clicks} clicks ({vis_c}), "
            f"{s.visible_impr}/{s.tot_impr} impressions ({vis_i}) — "
            f"the rest is truncated/anonymized long tail.")
    geos = {s.country for s in snaps}
    if len(geos) > 1:
        add("")
        add("> ⚠️ **Mixed geo filters between windows.** Query-level trends on "
            "local queries survive; page-level comparisons do not.")
    add("")

    # --- headline -----------------------------------------------------------
    add("## 1. Headline (Canada, 28 days)")
    add("")
    hdr = "| Metric | " + " | ".join(s.date for s in snaps) + " |"
    add(hdr)
    add("|---" * (len(snaps) + 1) + "|")
    add("| Clicks | " + " | ".join(str(s.tot_clicks) for s in snaps) + " |")
    add("| Impressions | " + " | ".join(f"{s.tot_impr:,}" for s in snaps) + " |")
    add("| CTR | " + " | ".join(
        f"{s.tot_clicks / max(s.tot_impr, 1) * 100:.2f}%" for s in snaps) + " |")
    add("| Avg position (context only) | " + " | ".join(
        str(s.tot_pos) if s.tot_pos else "—" for s in snaps) + " |")
    add("| .html/apex leak (clicks / impr) | " + " | ".join(
        f"{s.leak_clicks} / {s.leak_impr:,}" for s in snaps) + " |")
    add("")
    if cur.chart:
        weeks = [cur.chart[i:i + 7] for i in range(0, len(cur.chart), 7)]
        wk = " → ".join(str(sum(int(num(r["Clicks"])) for r in w))
                        for w in weeks if len(w) == 7)
        add(f"Weekly clicks inside the window: **{wk}**")
        spikes = [(r["Date"], int(num(r["Impressions"])), r["Position"])
                  for r in cur.chart if num(r["Impressions"]) > 1600]
        if spikes:
            add(f"Impression-spike days (broad-query floods at deep positions "
                f"— don't react): {spikes}")
        add("")

    # --- buckets ------------------------------------------------------------
    add("## 2. BC lens — bucket split of visible queries")
    add("")
    cur_b, prev_b = cur.buckets(), (prev.buckets() if prev else {})
    tot_c = sum(v[0] for v in cur_b.values())
    tot_i = sum(v[1] for v in cur_b.values())
    add("| Bucket | Clicks | % clicks | Impressions | % impr |"
        + (" Δ clicks |" if prev else ""))
    add("|---|---|---|---|---|" + ("---|" if prev else ""))
    for key, label in BUCKET_ORDER:
        c, i = cur_b.get(key, [0, 0])
        row = (f"| {label} | {c} | {c / max(tot_c, 1) * 100:.1f}% "
               f"| {i:,} | {i / max(tot_i, 1) * 100:.1f}% |")
        if prev:
            pc = prev_b.get(key, [0, 0])[0]
            row += f" {c - pc:+d} |"
        add(row)
    in_band = sum(cur_b.get(k, [0, 0])[0]
                  for k in ("branded", "local-geo", "generic"))
    add("")
    add(f"In-band share of **visible** clicks (branded + local + "
        f"locally-served generic): **{in_band / max(tot_c, 1) * 100:.0f}%**. "
        f"Out-of-band remains impressions-only noise unless its clicks move "
        f"off ~0.")
    add("")

    # --- scoreboard ---------------------------------------------------------
    add("## 3. Money-query scoreboard (pos · clicks · impressions)")
    add("")
    add("| Query | " + " | ".join(s.date for s in snaps) + " | Verdict |")
    add("|---" * (len(snaps) + 2) + "|")
    for q in MONEY_QUERIES:
        cells = " | ".join(fmt_cell(s.qmap.get(q)) for s in snaps)
        v = verdict(prev.qmap.get(q) if prev else None, cur.qmap.get(q))
        add(f"| {q} | {cells} | {v} |")
    add("")

    # --- page groups --------------------------------------------------------
    add("## 4. Page groups — the Vancouver-side gap")
    add("")
    add("| Group | " + " | ".join(
        f"{s.date} (c / i / CTR)" for s in snaps) + " |")
    add("|---" * (len(snaps) + 1) + "|")
    for g, urls in PAGE_GROUPS.items():
        cells = []
        for s in snaps:
            c = sum(int(num(s.pmap[u]["Clicks"])) for u in urls if u in s.pmap)
            i = sum(int(num(s.pmap[u]["Impressions"])) for u in urls if u in s.pmap)
            cells.append(f"{c} / {i:,} / {c / max(i, 1) * 100:.2f}%")
        add(f"| {g} | " + " | ".join(cells) + " |")
    add("")

    # --- key pages ----------------------------------------------------------
    add("## 5. Key pages (clicks · impressions · CTR · pos)")
    add("")
    add("| Page | " + " | ".join(s.date for s in snaps) + " |")
    add("|---" * (len(snaps) + 1) + "|")

    def pfmt(r):
        if r is None:
            return "—"
        return (f"{int(num(r['Clicks']))}c · {int(num(r['Impressions']))}i · "
                f"{r['CTR']} · p{num(r['Position']):.1f}")

    for u in KEY_PAGES:
        add(f"| {u} | " + " | ".join(pfmt(s.pmap.get(u)) for s in snaps) + " |")
    add("")
    add("New content — first impressions watch:")
    for u in NEW_PAGES:
        r = cur.pmap.get(u)
        add(f"- `{u}`: " + (pfmt(r) if r else "no impressions yet"))
    add("")

    # --- pass bands ---------------------------------------------------------
    add("## 6. Aug-1 pass bands (gameplan targets)")
    add("")
    add("| Band | Result | Detail |")
    add("|---|---|---|")
    n_pass = n_fail = 0
    for label, kind, key, test in PASS_BANDS:
        prow = (prev.qmap.get(key) if kind == "query" else
                prev.pmap.get(key)) if prev else None
        crow = cur.qmap.get(key) if kind == "query" else cur.pmap.get(key)
        if crow is None:
            add(f"| {label} | ⬜ no data | query/page not in visible export |")
            continue
        ok, detail = test(prow, crow)
        n_pass += ok
        n_fail += not ok
        add(f"| {label} | {'✅ PASS' if ok else '❌ FAIL'} | {detail} |")
    add("")
    add(f"**{n_pass} pass / {n_fail} fail** (bands with no visible data "
        f"excluded). Off-site effects lag 6–10 weeks — Sep 1 judges the "
        f"authority sprint, not Aug 1.")
    add("")

    # --- rollback watch -----------------------------------------------------
    if prev:
        add("## 7. Title-batch rollback watch (rule fires Sep 1, not before)")
        add("")
        add("Flag = clicks down ≥30% at stable position (±1.5) vs the prior "
            "window. The rollback rule needs 4+ consecutive weeks — a single "
            "flagged read is a watch item, not a revert.")
        add("")
        flagged = False
        for u in RETITLED_PAGES:
            pr, cr = prev.pmap.get(u), cur.pmap.get(u)
            if not pr or not cr:
                continue
            pc, cc = int(num(pr["Clicks"])), int(num(cr["Clicks"]))
            dpos = num(cr["Position"]) - num(pr["Position"])
            if pc >= 3 and cc <= pc * 0.7 and abs(dpos) <= 1.5:
                flagged = True
                add(f"- 🚩 `{u}` clicks {pc} → {cc} ({(cc - pc) / pc * 100:.0f}%) "
                    f"at stable position ({dpos:+.1f}) — rollback candidate "
                    f"if this persists to Sep 1 (see TITLE_BATCH_2026-07.md).")
        if not flagged:
            add("- No rollback candidates: every retitled page is inside the "
                "click band or moved on position (which exempts it).")
        add("")

    return "\n".join(L)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dates", help="comma-separated snapshot dates "
                    "(default: newest two)")
    ap.add_argument("--windows", type=int, default=2,
                    help="number of newest snapshots to compare (default 2)")
    ap.add_argument("--out", help="also write the markdown to this file")
    args = ap.parse_args()

    avail = discover_dates()
    if not avail:
        print(f"No snapshots found in {BASELINE} (expect YYYY-MM-DD_Queries.csv "
              f"etc. — see the docstring for the export workflow).")
        return 1

    if args.dates:
        dates = [d.strip() for d in args.dates.split(",")]
        missing = [d for d in dates if d not in avail]
        if missing:
            print(f"Snapshot(s) not found: {missing}. Available: {avail}")
            return 1
    else:
        dates = avail[-args.windows:]

    snaps = [Snapshot(d) for d in dates]
    report = build_report(snaps)
    print(report)
    if args.out:
        Path(args.out).write_text(report + "\n")
        print(f"\n[written to {args.out}]", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
