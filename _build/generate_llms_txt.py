#!/usr/bin/env python3
"""
Forever Party Rentals — llms.txt generator.

Renders /llms.txt per the llmstxt.org spec (https://llmstxt.org/) so LLM
crawlers and AI agents have a clean machine-readable index of the site.

Inputs:
  _build/site_constants.json        — brand constants (siteUrl, phone, hours, address)
  _build/city_data.json             — city slugs + tiers for service-area list
  _build/products.json              — product categories + price labels
  _build/partials/llms.txt.j2       — Jinja2 template

Output:
  site/llms.txt

Lighthouse's Agentic Browsing audit checks for this file under "discoverability";
Charles Floate's retrieval-layer analysis recommends keeping one even though
Google's public guide claims it isn't needed. Costs us ~5 KB and one build step.

Usage:
    python3 _build/generate_llms_txt.py
    python3 _build/generate_llms_txt.py --out /tmp/llms.txt
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

HERE = Path(__file__).resolve().parent
PARTIALS_DIR = HERE / "partials"
SITE_DIR = HERE.parent / "site"
SITE_CONSTANTS_FILE = HERE / "site_constants.json"
CITY_DATA_FILE = HERE / "city_data.json"
PRODUCTS_FILE = HERE / "products.json"

# One-line summaries for each product category, indexed by products.json key.
# Hand-curated so the llms.txt reads as primary-source copy instead of
# template-stamped marketing fluff.
PRODUCT_SUMMARIES = {
    "tent":                  "Marquee + popup tents, 10×10 to 30×60. From $75/day, marquees from $550/event.",
    "chair":                 "Chiavari, Fanback folding, and Resin Garden chairs. From $3.25/day.",
    "table":                 "5ft round (seats 8), 6ft banquet (seats 6-8), 8ft banquet (seats 8-10), cocktail highboys. From $10.95/day.",
    "dance-floor":           "12×12 to 20×20 black-and-white portable dance floors. From $800/event.",
    "battery-power-station": "EcoFlow Delta 2/3 Max/3 Ultra battery rentals for off-grid power. From $55/2-day weekend.",
    "starlink":              "Starlink Standard Actuated satellite internet kits for venues without WiFi. From $145/2-day weekend.",
    "projector":             "ViewSonic LS740HD 5000-lumen HD laser projector with optional 100″ screen + stand. For movie nights, weddings & presentations. From $175/day.",
}

# Capacity-guide pages — the W1 informational landers + selected blog posts
# that answer extractable factoid questions. Surfaced explicitly so LLM
# crawlers route to them when answering capacity questions.
CAPACITY_REFS = [
    {
        "title": "How many people fit at a 6 ft rectangular table?",
        "url": "/how-many-people-fit-at-a-6ft-rectangular-table.html",
        "summary": "6 plated, 8 family-style. Dimensions: 72\" × 30\".",
    },
    {
        "title": "How many people fit at a round table?",
        "url": "/how-many-people-fit-at-round-tables.html",
        "summary": "5 ft round seats 8 (10 tight); 6 ft round seats 10 (12 tight).",
    },
    {
        "title": "Tent size guide for Lower Mainland weddings",
        "url": "/blog/tent-size-guide-lower-mainland-wedding.html",
        "summary": "Capacity by tent size and event style (ceremony, dinner, dinner + dance).",
    },
    {
        "title": "Tent size chart — 20×20, 20×40, 20×60, 40×80",
        "url": "/blog/tent-size-chart-20x20-20x40-20x60-40x80.html",
        "summary": "Square footage and guest-count matrix for our marquee fleet.",
    },
    {
        "title": "Party rental checklist for 50, 100, 150 & 200 guests",
        "url": "/blog/party-rental-checklist-50-100-150-200-guests.html",
        "summary": "Tables, chairs, tents, dance floors — what to order by guest count.",
    },
    {
        "title": "How much space per guest under a wedding tent?",
        "url": "/blog/how-much-space-per-guest-wedding-tent.html",
        "summary": "Square-foot-per-guest rules of thumb by event format.",
    },
    {
        "title": "Party rental prices in Metro Vancouver — complete 2026 price list",
        "url": "/blog/party-rental-price-list-metro-vancouver-2026.html",
        "summary": "Every rental price on one page: chairs from $3.25, 5 ft rounds $13.50, marquees $550–$1,890, dance floor $800.",
    },
    {
        "title": "The 12 questions Metro Vancouver renters ask us every week",
        "url": "/blog/party-rental-questions-answered.html",
        "summary": "Booking lead times, rain policy, no-stake setups, permits, discounts, cancellation terms — answered with real numbers.",
    },
    {
        "title": "10 best outdoor wedding venues in Metro Vancouver, ranked",
        "url": "/blog/best-outdoor-wedding-venues-metro-vancouver.html",
        "summary": "Ranked by permit friction, tent rules, and backdrop — by the rental crew that delivers to all ten.",
    },
]


def load_data() -> tuple[dict, dict, dict]:
    with open(SITE_CONSTANTS_FILE, encoding="utf-8") as f:
        fpr = json.load(f)
    with open(CITY_DATA_FILE, encoding="utf-8") as f:
        city_data = json.load(f)
    with open(PRODUCTS_FILE, encoding="utf-8") as f:
        products = json.load(f)
    return fpr, city_data, products


def build_context(fpr: dict, city_data: dict, products: dict) -> dict:
    cities = city_data["cities"]
    nav_order = city_data["navOrder"]

    # Tier-1 first, then tier-2, in navOrder sequence — preserves the brand-led
    # ordering (Surrey, Langley, Abbotsford, …) instead of an alpha sort.
    tier1 = [
        {"slug": s, "name": cities[s]["name"]}
        for s in nav_order
        if cities[s].get("tier") == 1
    ]
    tier2 = [
        {"slug": s, "name": cities[s]["name"]}
        for s in nav_order
        if cities[s].get("tier") == 2
    ]

    # Product categories. We pull from products.json so adding a new product
    # category (e.g. lighting) just requires a JSON edit + a PRODUCT_SUMMARIES
    # entry above.
    product_categories = []
    for key, p in products["products"].items():
        if key not in PRODUCT_SUMMARIES:
            # Fail loud so a new product category can't silently drop out of
            # the AI-discoverability surface.
            raise SystemExit(
                f"products.json has '{key}' but PRODUCT_SUMMARIES has no entry; "
                f"add a one-line summary to generate_llms_txt.py."
            )
        product_categories.append({
            "name": p["productName"],
            "url": f"/{p['categoryPage']}",
            "summary": PRODUCT_SUMMARIES[key],
        })

    return {
        "fpr": fpr,
        "site_url": fpr["siteUrl"],
        "product_categories": product_categories,
        "tier1_cities": tier1,
        "tier2_cities": tier2,
        "city_count": len(cities),
        "capacity_refs": CAPACITY_REFS,
        # Pulled from the trust-bar copy on homepage / city pages.
        "events_served": "500+",
    }


def render(ctx: dict) -> str:
    env = Environment(
        loader=FileSystemLoader(str(PARTIALS_DIR)),
        undefined=StrictUndefined,
        autoescape=False,
        trim_blocks=False,
        lstrip_blocks=False,
        keep_trailing_newline=True,
    )
    return env.get_template("llms.txt.j2").render(**ctx)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--out",
        default=str(SITE_DIR / "llms.txt"),
        help="Output path (default: ../site/llms.txt)",
    )
    args = ap.parse_args()

    fpr, city_data, products = load_data()
    ctx = build_context(fpr, city_data, products)
    text = render(ctx)

    out = Path(args.out)
    out.write_text(text, encoding="utf-8")
    line_count = text.count("\n")
    print(f"  wrote {out}  ({line_count} lines, {len(text):,} bytes)")


if __name__ == "__main__":
    main()
