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
import hashlib
import json
import sys
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from urlpath import url_path
from render_partials import render_nav, render_footer
from overrides_loader import load_overrides

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent / "site"            # .../project/site
DATA_FILE = HERE / "city_data.json"
PRODUCT_DATA_FILE = HERE / "products.json"
SITE_CONSTANTS_FILE = HERE / "site_constants.json"
TEMPLATE_FILE = "template.html"

# Brand identity (siteUrl, logo, address, phone, orgId, rating, …) is the
# single source of truth in site_constants.json — load once, pass into
# the template as `fpr`. Backward-compat aliases site_url/logo_url stay
# until the templates are migrated.
with open(SITE_CONSTANTS_FILE, encoding="utf-8") as _f:
    FPR = json.load(_f)
SITE_URL = FPR["siteUrl"]
LOGO_URL = FPR["logoUrl"]


# Anchor-text pools for the equipment-card grid on city pages.
# Deterministic per-(slug, category) selection from these pools breaks the
# uniform "View {city} X Rentals →" anchor pattern that was repeating verbatim
# across all 28 city pages — a footprint Google's quality systems associate
# with engineered local-landing networks. Each city's anchor stays stable
# build-to-build because selection is by md5(slug+category), not random.
ANCHOR_POOLS = {
    "tent": [
        "View {city} tent rentals →",
        "Browse {city} marquee tents →",
        "See tent options for {city} →",
        "Tent rentals in {city} →",
        "Marquee &amp; popup tent setup →",
    ],
    "chair": [
        "View {city} chair rentals →",
        "Browse {city} chair options →",
        "See chair lineup for {city} →",
        "Chair rentals in {city} →",
        "Chiavari, Fanback &amp; Garden chairs →",
    ],
    "table": [
        "View {city} table rentals →",
        "Browse {city} table options →",
        "See table lineup for {city} →",
        "Table rentals in {city} →",
        "Banquet, round &amp; cocktail tables →",
    ],
    "dance-floor": [
        "View {city} dance floors →",
        "Browse {city} dance floor options →",
        "See dance floor styles for {city} →",
        "Dance floor rentals in {city} →",
        "Black &amp; white dance floor setups →",
    ],
}


def select_anchor(slug: str, category: str, city_name: str) -> str:
    """Pick a deterministic anchor phrase for (slug, category) and substitute city.
    Uses md5 hash so selection is stable across Python invocations
    (built-in hash() is randomized when PYTHONHASHSEED is unset)."""
    pool = ANCHOR_POOLS[category]
    digest = hashlib.md5(f"{slug}|{category}".encode("utf-8")).digest()
    idx = digest[0] % len(pool)
    return pool[idx].format(city=city_name)


def load_data():
    with open(DATA_FILE, encoding="utf-8") as f:
        return json.load(f)


def load_products():
    with open(PRODUCT_DATA_FILE, encoding="utf-8") as f:
        return json.load(f)


def product_city_url(product: dict, city_slug: str) -> str:
    """Root-relative URL of the product-per-city page for this product + city.
    Leading '/' keeps the href working from any page depth (root or /blog/*)."""
    overrides = product.get("urlPrefixOverrides", {}) or {}
    prefix = overrides.get(city_slug, product["urlPrefix"])
    return url_path(f"{prefix}-{city_slug}.html")


def neighborhood_list_short(neighborhoods, limit=4):
    """Human-readable short list for hero subtitle: 'A, B, C'."""
    trimmed = neighborhoods[:limit]
    if len(trimmed) <= 1:
        return trimmed[0] if trimmed else ""
    if len(trimmed) == 2:
        return " and ".join(trimmed)
    return ", ".join(trimmed[:-1]) + ", " + trimmed[-1]


def build_context(slug, city, data, products):
    """Assemble the Jinja2 render context for one city."""
    canonical = f"{SITE_URL}{url_path(f'{slug}-party-rentals.html')}"

    pool = data["testimonialPool"]
    testimonials = [pool[i] for i in city["testimonialIndices"]]

    # Hero short list: first 4 neighborhoods
    nhb_short = neighborhood_list_short(city["neighborhoods"], limit=4)

    title = f"{city['name']} Party Rentals BC — Tents, Chairs & Tables"
    description = (
        f"Party rentals in {city['name']}, BC — marquee tents, chairs & tables "
        f"delivered and set up. 125% cancellation guarantee. Book online 24/7."
    )

    # Link each product card directly to its product-per-city page so PageRank
    # flows from the city page into the deeper geo-silo (instead of to the
    # generic /tents.html catalog page).
    product_links = {
        key: product_city_url(product, slug)
        for key, product in products.items()
    }

    overrides = load_overrides(f"{slug}-party-rentals", "cities")

    return {
        "city": city,
        "testimonials": testimonials,
        "neighborhood_list_short": nhb_short,
        "page_title": title,
        "page_description": description,
        "canonical_url": canonical,
        "site_url": SITE_URL,
        "logo_url": LOGO_URL,
        "fpr": FPR,
        "product_links": product_links,
        "overrides": overrides,
        "anchor_tent": select_anchor(slug, "tent", city["name"]),
        "anchor_chair": select_anchor(slug, "chair", city["name"]),
        "anchor_table": select_anchor(slug, "table", city["name"]),
        "anchor_dancefloor": select_anchor(slug, "dance-floor", city["name"]),
        "lastmod": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
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
    product_data = load_products()
    products = product_data["products"]

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
    # Static-nav refactor: render the nav/footer partials once and pass them in
    # as Jinja globals so {{ nav_html|safe }} / {{ footer_html|safe }} works
    # without per-page context plumbing.
    env.globals["nav_html"] = render_nav()
    env.globals["footer_html"] = render_footer()
    template = env.get_template(TEMPLATE_FILE)

    if args.out:
        out_dir = HERE / args.out
    else:
        out_dir = SITE_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    written = []
    for slug in slugs:
        city = data["cities"][slug]
        ctx = build_context(slug, city, data, products)
        html = template.render(**ctx)
        path = out_dir / f"{slug}-party-rentals.html"
        path.write_text(html, encoding="utf-8")
        written.append((slug, path, len(html)))
        print(f"  wrote {path}  ({len(html):,} bytes)")

    print(f"\nDone — {len(written)} page(s) generated.")


if __name__ == "__main__":
    main()
