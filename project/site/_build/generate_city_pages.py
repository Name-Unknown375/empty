#!/usr/bin/env python3
"""
Generate Forever Party Rentals city pages from `city_data.json` + `template.html`.

Plan file: /root/.claude/plans/we-continuous-run-into-precious-garden.md

Usage:
    python3 generate_city_pages.py --all
    python3 generate_city_pages.py --tier 1
    python3 generate_city_pages.py --slugs surrey,langley
    python3 generate_city_pages.py --slugs surrey --out _pilot   # pilot mode

Writes to ../<slug>-party-rentals.html in the parent `project/site/` directory
(or to ./_pilot/<slug>-party-rentals.html if --out is set to "_pilot").
"""

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent            # .../project/site
DATA_FILE = HERE / "city_data.json"
TEMPLATE_FILE = "template.html"

# --- Configurable site constants -------------------------------------------
SITE_URL = "https://foreverpartyrentals.com"


def load_data():
    with open(DATA_FILE, encoding="utf-8") as f:
        return json.load(f)


def neighborhood_list_short(neighborhoods, limit=4):
    """Human-readable short list for hero subtitle: 'A, B, C'."""
    trimmed = neighborhoods[:limit]
    if len(trimmed) <= 1:
        return trimmed[0] if trimmed else ""
    if len(trimmed) == 2:
        return " and ".join(trimmed)
    return ", ".join(trimmed[:-1]) + ", " + trimmed[-1]


def build_context(slug, city, data):
    """Assemble the Jinja2 render context for one city."""
    canonical = f"{SITE_URL}/{slug}-party-rentals.html"

    pool = data["testimonialPool"]
    testimonials = [pool[i] for i in city["testimonialIndices"]]

    # Hero short list: first 4 neighborhoods
    nhb_short = neighborhood_list_short(city["neighborhoods"], limit=4)

    title = f"Party Rentals {city['name']} | Tents, Chairs & Tables | Forever Party Rentals"
    description = (
        f"Premium party rentals in {city['name']}, BC — tent, chair & table rentals "
        f"delivered and set up. Serving {nhb_short}. Book online 24/7."
    )

    return {
        "city": city,
        "testimonials": testimonials,
        "neighborhood_list_short": nhb_short,
        "page_title": title,
        "page_description": description,
        "canonical_url": canonical,
        "site_url": SITE_URL,
        "lastmod": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def select_slugs(data, *, all_, tier, slugs):
    cities = data["cities"]
    if all_:
        return list(cities.keys())
    if tier is not None:
        return [s for s, c in cities.items() if c["tier"] == tier]
    if slugs:
        out = []
        for s in slugs:
            if s not in cities:
                raise SystemExit(f"Unknown slug: {s}")
            out.append(s)
        return out
    raise SystemExit("Must pass one of --all, --tier N, --slugs a,b,c")


def main():
    ap = argparse.ArgumentParser()
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--all", action="store_true")
    group.add_argument("--tier", type=int, choices=[1, 2, 3, 4])
    group.add_argument("--slugs", type=str, help="comma-separated slugs")
    ap.add_argument(
        "--out",
        default="",
        help="Optional subfolder under _build/ to write into (e.g. '_pilot'). "
             "If empty, writes directly to ../ (project/site/).",
    )
    args = ap.parse_args()

    data = load_data()

    slugs = select_slugs(
        data,
        all_=args.all,
        tier=args.tier,
        slugs=[s.strip() for s in args.slugs.split(",")] if args.slugs else None,
    )

    env = Environment(
        loader=FileSystemLoader(str(HERE)),
        undefined=StrictUndefined,
        autoescape=False,           # template handles its own escaping
        trim_blocks=True,
        lstrip_blocks=True,
    )
    template = env.get_template(TEMPLATE_FILE)

    if args.out:
        out_dir = HERE / args.out
    else:
        out_dir = SITE_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    written = []
    for slug in slugs:
        city = data["cities"][slug]
        ctx = build_context(slug, city, data)
        html = template.render(**ctx)
        path = out_dir / f"{slug}-party-rentals.html"
        path.write_text(html, encoding="utf-8")
        written.append((slug, path, len(html)))
        print(f"  wrote {path}  ({len(html):,} bytes)")

    print(f"\nDone — {len(written)} page(s) generated.")


if __name__ == "__main__":
    main()
