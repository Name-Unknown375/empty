#!/usr/bin/env python3
"""
Forever Party Rentals — /pricing page generator.

Renders pricing_template.html into ../site/pricing.html from
products_sku.json (item prices — the declared single source of truth) and
packages.json (package starting totals, computed with the exact same
compute_tier() math used by generate_package_pages.py, so this page can
never drift from the product or package pages).

Usage:
    python3 generate_pricing_page.py
"""
from __future__ import annotations

import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from render_partials import render_nav, render_footer
from generate_package_pages import compute_tier

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent / "site-v3"
SKU_DATA_FILE = HERE / "products_sku.json"
PACKAGE_DATA_FILE = HERE / "packages.json"
SITE_CONSTANTS_FILE = HERE / "site_constants.json"
TEMPLATE_FILE = "pricing_template.html"
OUT_FILE = SITE_DIR / "pricing.html"

with open(SITE_CONSTANTS_FILE, encoding="utf-8") as _f:
    FPR = json.load(_f)

# Category grouping/order for the page. Keys match sku["category"].
GROUPS = [
    ("tent", "Tent Rentals", None),
    ("chair", "Chair Rentals", "Per-chair daily rate — mix styles on one order at no extra charge."),
    ("table", "Table Rentals", "Per-table daily rate."),
    ("dance-floor", "Dance Floor", "Includes subfloor levelling, professional install, and takedown."),
    ("battery-power-station", "Battery Power Stations", "Silent, indoor-safe portable power. 2-day weekend minimum."),
    ("starlink", "Starlink Internet", "Event wifi anywhere. 2-day weekend minimum."),
    ("projector", "Projector & Screen", None),
]

# Items that have real prices on hand-authored pages but no products_sku.json
# entry. Keep these in sync with their source page (noted per row).
STATIC_ROWS = {
    "table": [
        # source: site/product-banquet-table-8ft.html
        {"name": "8ft Banquet Table", "price_label": "from $14.95", "unit_label": "per day",
         "url": "/product-banquet-table-8ft"},
    ],
}

# source: site/carnival-games.html ($650 / 4hr per booth, staffed)
CARNIVAL_GROUP = {
    "title": "Carnival Games",
    "note": "Staffed game booths — trained attendant included.",
    "rows": [
        {"name": "Carnival Game Booth (staffed)", "price_label": "from $650",
         "unit_label": "per 4 hours", "url": "/carnival-games"},
    ],
}


def money(v: float) -> str:
    """$1,100 for whole dollars, $3.25 when cents matter."""
    if abs(v - round(v)) < 0.005:
        return f"${round(v):,}"
    return f"${v:,.2f}"


def sku_rows(skus: dict, category: str) -> list[dict]:
    rows = []
    for key, sku in skus.items():
        if key.startswith("_") or not isinstance(sku, dict):
            continue
        if sku.get("category") != category:
            continue
        url = f"/product-{key}"
        if "pricingTiers" in sku:
            t = sku["pricingTiers"][0]
            rows.append({
                "name": sku["name"].replace(" Rental", ""),
                "price_label": f"from {money(t['price'])}",
                "unit_label": f"per {t['label'].lower()}" if not t["label"].lower().startswith("2-day") else f"per {t['label']}",
                "url": url,
            })
        else:
            unit = sku.get("priceUnit", "day")
            rows.append({
                "name": sku["name"].replace(" Rental", ""),
                "price_label": f"from {money(sku['startingPriceCAD'])}",
                "unit_label": f"per {unit}",
                "url": url,
            })
    rows.sort(key=lambda r: float(r["price_label"].replace("from $", "").replace(",", "")))
    rows.extend(STATIC_ROWS.get(category, []))
    return rows


def package_rows(pkg: dict, skus: dict) -> list[dict]:
    out = []
    size = min(pkg["sizes"])
    tier = pkg["tiers"][0]
    for slug, event in pkg["eventTypes"].items():
        computed = compute_tier(event, size, tier, pkg, skus)
        out.append({
            "name": f"{event['label']} Package (50–150 guests, 3 tiers)",
            "from_total": computed["total"],
            "url": f"/{slug}-package-{size}-guests",
        })
    return out


def main() -> None:
    with open(SKU_DATA_FILE, encoding="utf-8") as f:
        sku_data = json.load(f)
    with open(PACKAGE_DATA_FILE, encoding="utf-8") as f:
        pkg = json.load(f)
    skus = sku_data["products"]

    groups = []
    for key, title, note in GROUPS:
        rows = sku_rows(skus, key)
        if rows:
            groups.append({"title": title, "note": note, "rows": rows})
    groups.append(CARNIVAL_GROUP)

    quick = {
        "chair": min(s["startingPriceCAD"] for s in skus.values()
                     if isinstance(s, dict) and s.get("category") == "chair"),
        "table": min(s["startingPriceCAD"] for s in skus.values()
                     if isinstance(s, dict) and s.get("category") == "table"),
        "popup": skus["popup-tent-10x10"]["startingPriceCAD"],
        "marquee": min(s["startingPriceCAD"] for s in skus.values()
                       if isinstance(s, dict) and s.get("category") == "tent"
                       and s.get("priceUnit") == "event"),
        "dance": skus["black-white-dance-floor"]["startingPriceCAD"],
    }

    env = Environment(
        loader=FileSystemLoader(HERE),
        undefined=StrictUndefined,
        autoescape=False,
    )
    env.globals["nav_html"] = render_nav()
    env.globals["footer_html"] = render_footer()

    class NS(dict):
        __getattr__ = dict.__getitem__

    html = env.get_template(TEMPLATE_FILE).render(
        fpr=FPR,
        page_title="Party Rental Prices — Metro Vancouver & Fraser Valley | Forever Party Rentals",
        page_description="Full party rental price list: chairs from $3.25/day, tables from $10.95/day, marquee tents from $550/event, dance floor from $750. Delivery from $175 or free Surrey pickup.",
        canonical_url=f"{FPR['siteUrl']}/pricing",
        groups=[NS(g) for g in groups],
        package_rows=[NS(p) for p in package_rows(pkg, skus)],
        quick=NS(quick),
    )
    OUT_FILE.write_text(html, encoding="utf-8")
    print(f"wrote {OUT_FILE.relative_to(HERE.parent)}")


if __name__ == "__main__":
    main()
