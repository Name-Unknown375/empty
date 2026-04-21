#!/usr/bin/env python3
"""
Generate Forever Party Rentals product-per-city pages.

Phase 3 of the SEO expansion: tent / chair / table / dance-floor pages for
every city in city_data.json. Pairs city_data.json (location-level content)
with products.json (product-level content) via product_template.html.

Usage:
    python3 generate_product_pages.py --all
    python3 generate_product_pages.py --products tent,chair
    python3 generate_product_pages.py --cities surrey,langley
    python3 generate_product_pages.py --products tent --cities surrey --out _pilot
"""

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent
CITY_DATA_FILE = HERE / "city_data.json"
PRODUCT_DATA_FILE = HERE / "products.json"
TEMPLATE_FILE = "product_template.html"

SITE_URL = "https://foreverpartyrentals.com"


def load_data():
    with open(CITY_DATA_FILE, encoding="utf-8") as f:
        city_data = json.load(f)
    with open(PRODUCT_DATA_FILE, encoding="utf-8") as f:
        product_data = json.load(f)
    return city_data, product_data


def sub(text: str, city_name: str) -> str:
    """Simple placeholder substitution. Supports {city}."""
    return text.replace("{city}", city_name)


def page_slug(product: dict, city_slug: str) -> str:
    """Return the filename (without .html) for a given product+city combo."""
    overrides = product.get("urlPrefixOverrides", {}) or {}
    prefix = overrides.get(city_slug, product["urlPrefix"])
    return f"{prefix}-{city_slug}"


def build_faqs(product: dict, city: dict) -> list[dict]:
    """Blend 3 product-specific FAQs with 2 city-level (delivery + booking lead-time)
    so every product page reinforces local signals and passes schema.FAQPage."""
    product_faqs = [
        {"q": sub(f["q"], city["name"]), "a": sub(f["a"], city["name"])}
        for f in product["productFaqs"]
    ]

    city_faqs = city.get("faqs", [])
    # First city FAQ is always "Do you deliver party rentals to {city}?"; the third
    # is always the booking-lead-time FAQ. Those reinforce local + business signals.
    passthrough_idx = [0, 2]
    blended = list(product_faqs)
    for i in passthrough_idx:
        if i < len(city_faqs):
            blended.append(city_faqs[i])
    return blended


def build_context(city_slug: str, city: dict, product: dict, data: dict) -> dict:
    slug = page_slug(product, city_slug)
    canonical = f"{SITE_URL}/{slug}.html"
    city_page = f"{city_slug}-party-rentals.html"

    pool = data["testimonialPool"]
    testimonials = [pool[i] for i in city["testimonialIndices"]]

    title = (
        f"{product['productName']} {city['name']} BC | "
        f"{product['subcategoryCards'][0]['name']} &amp; More | Forever Party Rentals"
    )
    description = (
        f"{product['productName']} in {city['name']}, BC — delivered, set up, and collected by "
        f"our crew. Serving {', '.join(city['neighborhoods'][:3])}. Book online 24/7."
    )

    tagline = sub(product["tagline"], city["name"])
    intro_summary = sub(product["introSummary"], city["name"])
    bullets = [sub(b, city["name"]) for b in product["bullets"]]
    subcategory_cards = [
        {**sc, "description": sub(sc["description"], city["name"])}
        for sc in product["subcategoryCards"]
    ]
    hero_alt = sub(product["heroAlt"], city["name"])

    faqs = build_faqs(product, city)

    return {
        "city": city,
        "product": product,
        "testimonials": testimonials,
        "tagline": tagline,
        "intro_summary": intro_summary,
        "bullets": bullets,
        "subcategory_cards": subcategory_cards,
        "hero_alt": hero_alt,
        "faqs": faqs,
        "page_title": title,
        "page_description": description,
        "canonical_url": canonical,
        "city_page": city_page,
        "site_url": SITE_URL,
        "lastmod": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def select_cities(city_data: dict, city_arg: str | None) -> list[str]:
    all_cities = list(city_data["cities"].keys())
    if not city_arg:
        return all_cities
    slugs = [s.strip() for s in city_arg.split(",") if s.strip()]
    bad = [s for s in slugs if s not in all_cities]
    if bad:
        raise SystemExit(f"Unknown city slug(s): {bad}")
    return slugs


def select_products(product_data: dict, product_arg: str | None) -> list[str]:
    all_products = list(product_data["products"].keys())
    if not product_arg:
        return all_products
    keys = [s.strip() for s in product_arg.split(",") if s.strip()]
    bad = [k for k in keys if k not in all_products]
    if bad:
        raise SystemExit(f"Unknown product key(s): {bad}")
    return keys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="generate every product for every city")
    ap.add_argument("--products", type=str, help="comma-separated product keys (tent,chair,table,dance-floor)")
    ap.add_argument("--cities", type=str, help="comma-separated city slugs")
    ap.add_argument(
        "--out",
        default="",
        help="Optional subfolder under _build/ to write into (e.g. '_pilot'). "
             "If empty, writes directly to ../ (project/site/).",
    )
    args = ap.parse_args()

    if not (args.all or args.products or args.cities):
        ap.error("Pass --all, or --products, or --cities (any or all may be combined)")

    city_data, product_data = load_data()

    cities = select_cities(city_data, args.cities if not args.all else None)
    products = select_products(product_data, args.products if not args.all else None)

    env = Environment(
        loader=FileSystemLoader(str(HERE)),
        undefined=StrictUndefined,
        autoescape=False,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    template = env.get_template(TEMPLATE_FILE)

    out_dir = (HERE / args.out) if args.out else SITE_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    written = []
    for city_slug in cities:
        city = city_data["cities"][city_slug]
        for product_key in products:
            product = product_data["products"][product_key]
            ctx = build_context(city_slug, city, product, city_data)
            html = template.render(**ctx)
            slug = page_slug(product, city_slug)
            path = out_dir / f"{slug}.html"
            path.write_text(html, encoding="utf-8")
            written.append((slug, path, len(html)))

    for slug, path, size in written:
        print(f"  wrote {path.name}  ({size:,} bytes)")
    print(f"\nDone — {len(written)} page(s) generated ({len(cities)} cities × {len(products)} products).")


if __name__ == "__main__":
    main()
