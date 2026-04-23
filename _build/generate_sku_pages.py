#!/usr/bin/env python3
"""
Forever Party Rentals — SKU page generator (Sprint 3.10).

Reads products_sku.json + city_data.json + products.json, renders
sku_template.html for each SKU, writes to ../product-<slug>.html.

Usage:
    python3 generate_sku_pages.py --all
    python3 generate_sku_pages.py --skus white-chiavari-chair,marquee-tent-20x40
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent / "site"
CITY_DATA_FILE = HERE / "city_data.json"
PRODUCT_DATA_FILE = HERE / "products.json"
SKU_DATA_FILE = HERE / "products_sku.json"
TEMPLATE_FILE = "sku_template.html"

SITE_URL = "https://foreverpartyrentals.com"
LOGO_URL = (
    "https://images.squarespace-cdn.com/content/v1/6377fe3c61a4ae0a3c0e29fc/"
    "993255ee-d7bd-41ba-a9dc-659d794941af/Forever+Party+Rentals+Logo.png?format=1500w"
)


def load_data():
    with open(CITY_DATA_FILE, encoding="utf-8") as f:
        city_data = json.load(f)
    with open(PRODUCT_DATA_FILE, encoding="utf-8") as f:
        product_data = json.load(f)
    with open(SKU_DATA_FILE, encoding="utf-8") as f:
        sku_data = json.load(f)
    return city_data, product_data, sku_data


def product_city_filename(product: dict, city_slug: str) -> str:
    """Match the filename logic in generate_product_pages.py to keep URLs consistent."""
    overrides = product.get("urlPrefixOverrides", {}) or {}
    prefix = overrides.get(city_slug, product["urlPrefix"])
    return f"{prefix}-{city_slug}.html"


def build_city_links(sku: dict, sku_data: dict, city_data: dict, product_data: dict) -> list[dict]:
    """Resolve the top-9 city slugs to real product-per-city URLs."""
    slugs = sku.get("topCityLinks") or sku_data.get("topCityLinksDefault", [])
    category_key = sku["category"]
    product = product_data["products"][category_key]
    links = []
    for slug in slugs:
        if slug not in city_data["cities"]:
            continue
        city = city_data["cities"][slug]
        links.append({
            "slug": slug,
            "name": city["name"],
            "url": product_city_filename(product, slug),
        })
    return links


def build_siblings(sku: dict, sku_data: dict, product_data: dict) -> list[dict]:
    """Cross-link to the *category* landing pages for the 3 OTHER product categories,
    so a chair-SKU page links to tents, tables, dance-floor — funneling users to
    related parts of the catalog without requiring city context."""
    current_cat = sku["category"]
    out = []
    for key, p in product_data["products"].items():
        if key == current_cat:
            continue
        out.append({
            "key": key,
            "name": p["productName"],
            "url": p["categoryPage"],
            "image": p["heroImage"],
            "description": f"{p['serviceType']} across Metro Vancouver — delivered and set up by our crew.",
        })
    return out


def build_context(sku_key: str, sku: dict, sku_data: dict, city_data: dict, product_data: dict) -> dict:
    category = product_data["products"][sku["category"]]
    canonical = f"{SITE_URL}/product-{sku_key}.html"

    title = f"{sku['name']} | Metro Vancouver | Forever Party Rentals"
    description = sku["metaDescription"]

    city_links = build_city_links(sku, sku_data, city_data, product_data)
    siblings = build_siblings(sku, sku_data, product_data)

    return {
        "sku": sku,
        "category": category,
        "city_links": city_links,
        "all_cities_count": len(city_data["cities"]),
        "siblings": siblings,
        "page_title": title,
        "page_description": description,
        "canonical_url": canonical,
        "site_url": SITE_URL,
        "logo_url": LOGO_URL,
        "lastmod": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true")
    g.add_argument("--skus", type=str, help="comma-separated SKU keys")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    city_data, product_data, sku_data = load_data()
    all_keys = list(sku_data["products"].keys())
    if args.all:
        keys = all_keys
    else:
        keys = [k.strip() for k in args.skus.split(",") if k.strip()]
        bad = [k for k in keys if k not in all_keys]
        if bad:
            raise SystemExit(f"Unknown SKU key(s): {bad}")

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
    for key in keys:
        sku = sku_data["products"][key]
        ctx = build_context(key, sku, sku_data, city_data, product_data)
        html = template.render(**ctx)
        path = out_dir / f"product-{key}.html"
        path.write_text(html, encoding="utf-8")
        written.append((key, path, len(html)))
        print(f"  wrote {path.name}  ({len(html):,} bytes)")

    print(f"\nDone — {len(written)} SKU page(s) generated.")


if __name__ == "__main__":
    main()
