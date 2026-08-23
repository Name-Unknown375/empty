#!/usr/bin/env python3
"""
Forever Party Rentals — Event package page generator.

Reads packages.json + products_sku.json, renders package_template.html
once per (event type × guest size), writes to site/{event}-package-{N}-guests.html.

Usage:
    python3 generate_package_pages.py --all
    python3 generate_package_pages.py --events wedding
    python3 generate_package_pages.py --events wedding,corporate --sizes 100,150
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from urlpath import url_path
from render_partials import render_nav, render_footer

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent / "site-v3"
PACKAGES_DATA_FILE = HERE / "packages.json"
SKU_DATA_FILE = HERE / "products_sku.json"
SITE_CONSTANTS_FILE = HERE / "site_constants.json"
ADELIE_MAP_FILE = HERE / "sku_to_adelie_id.json"
TEMPLATE_FILE = "package_template.html"

# Brand identity centralised in site_constants.json — see generate_city_pages.py.
with open(SITE_CONSTANTS_FILE, encoding="utf-8") as _f:
    FPR = json.load(_f)
SITE_URL = FPR["siteUrl"]


def load_data():
    with open(PACKAGES_DATA_FILE, encoding="utf-8") as f:
        pkg = json.load(f)
    with open(SKU_DATA_FILE, encoding="utf-8") as f:
        sku = json.load(f)
    return pkg, sku["products"]


def load_adelie_map(path: Path | None = None) -> dict[str, str]:
    """Bare-string SKU → Adelie inventory id. Array-valued SKUs are skipped."""
    with open(path or ADELIE_MAP_FILE, encoding="utf-8") as f:
        raw = json.load(f)
    out: dict[str, str] = {}
    for key, val in raw.items():
        if str(key).startswith("_"):
            continue
        if isinstance(val, str) and val:
            out[key] = val
    return out


def adelie_id_for_row(row: dict, adelie_map: dict[str, str]) -> str | None:
    existing = row.get("adelie_id")
    if isinstance(existing, str) and existing:
        return existing
    mapped = adelie_map.get(row["key"])
    if isinstance(mapped, str) and mapped:
        return mapped
    return None


def attach_cart(
    tier_result: dict,
    adelie_map: dict[str, str],
    *,
    event_slug: str = "",
    size: int | None = None,
) -> dict:
    """Resolve Adelie ids on every row and bake a {id: qty} cart.

    Raises SystemExit if any row is unmapped — package instant book cannot
    silently drop a billed line.
    """
    cart: dict[str, int] = {}
    missing: list[str] = []
    for row in tier_result["rows"]:
        aid = adelie_id_for_row(row, adelie_map)
        if not aid:
            missing.append(row["key"])
            continue
        row["adelie_id"] = aid
        cart[aid] = cart.get(aid, 0) + int(row["qty"])
    where = f"{event_slug}/{size}g/{tier_result['tier']['slug']}"
    if missing:
        raise SystemExit(
            f"FAIL: no Adelie id for {missing} in {where} — "
            "add the SKU to sku_to_adelie_id.json or packages.json cocktailSpandexCombo."
        )
    if not cart:
        raise SystemExit(f"FAIL: empty Adelie cart for {where}")
    tier_result["cart"] = cart
    tier_result["cart_json"] = json.dumps(cart, separators=(",", ":"))
    return tier_result


def _display_label(skus: dict, key: str, internal_labels: dict) -> str:
    """Human-readable label for the itemized breakdown.
    Falls back to the SKU's `name` with ' Rental' stripped.
    """
    if key in internal_labels:
        return internal_labels[key]
    name = skus[key]["name"]
    return name.replace(" Rental", "").strip()


def compute_tier(event: dict, size: int, tier: dict, pkg: dict, skus: dict):
    """Return ({rows: [...], subtotal, total, savings, display_lines: [...]}) for one tier."""
    rows = []

    # 1. Main tables (seating)
    n_tables = math.ceil(size / event["tableSeats"])
    table_key = event["tableKey"]
    rows.append({
        "key": table_key,
        "qty": n_tables,
        "unit_price": skus[table_key]["startingPriceCAD"],
        "label": event["tableLabel"],
    })

    # 2. Chairs (with 10% spare rule). Round to 6 decimals before ceil to
    # avoid float-precision bugs: 50 * 1.1 == 55.000000000000007 in Python.
    n_chairs = math.ceil(round(size * (1 + pkg["chairSpareRate"]), 6))
    rows.append({
        "key": tier["chairKey"],
        "qty": n_chairs,
        "unit_price": skus[tier["chairKey"]]["startingPriceCAD"],
        "label": tier["chairLabel"],
    })

    # 3. Event-type extra tables (e.g. corporate cocktails for T1/T2 only)
    for extra_key, rule in event.get("extraTables", {}).items():
        if tier["id"] in rule.get("tiers", [1, 2, 3]):
            qty = math.ceil(size / rule["per"])
            rows.append({
                "key": extra_key,
                "qty": qty,
                "unit_price": skus[extra_key]["startingPriceCAD"],
                "label": rule.get("label") or _display_label(skus, extra_key, {}),
            })

    # 4. Tent (T2+ only)
    if tier["tent"]:
        tent_key = pkg["tentBySize"][str(size)]
        rows.append({
            "key": tent_key,
            "qty": 1,
            "unit_price": skus[tent_key]["startingPriceCAD"],
            "label": skus[tent_key]["name"].replace(" Rental", ""),
        })

    # 5. Tier 3 extras: bistro lights + premium cocktails with spandex
    if "bistro-lights" in tier.get("extras", []):
        rows.append({
            "key": "bistro-string-lights",
            "qty": 1,
            "unit_price": skus["bistro-string-lights"]["startingPriceCAD"],
            "label": "Bistro String Lights (ambient)",
        })
    if "cocktails-with-spandex" in tier.get("extras", []):
        n_cocktail = pkg["premiumCocktailCountBySize"][str(size)]
        combo = pkg["cocktailSpandexCombo"]
        rows.append({
            "key": combo["key"],
            "qty": n_cocktail,
            "unit_price": combo["priceCAD"],
            "label": combo["label"],
            "adelie_id": combo["adelieId"],
        })

    # Compute line totals + summary
    for r in rows:
        r["line_total"] = round(r["qty"] * r["unit_price"], 2)

    subtotal = round(sum(r["line_total"] for r in rows), 2)
    total = round(subtotal * (1 - pkg["discountRate"]), 2)
    savings = round(subtotal - total, 2)

    # Human-friendly bullet list for the "what's included" section
    display_lines = [
        f"{r['qty']} × {r['label']}" for r in rows
    ]

    return {
        "tier": tier,
        "rows": rows,
        "subtotal": subtotal,
        "total": total,
        "savings": savings,
        "display_lines": display_lines,
    }


def build_context(
    event_slug: str,
    event: dict,
    size: int,
    pkg: dict,
    skus: dict,
    adelie_map: dict[str, str] | None = None,
) -> dict:
    if adelie_map is None:
        adelie_map = load_adelie_map()
    tier_cards = []
    for t in pkg["tiers"]:
        card = compute_tier(event, size, t, pkg, skus)
        attach_cart(card, adelie_map, event_slug=event_slug, size=size)
        tier_cards.append(card)

    # Ladder invariant: T3 > T2 > T1. If violated, abort — the data config is wrong.
    totals = [tc["total"] for tc in tier_cards]
    if not (totals[0] < totals[1] < totals[2]):
        raise SystemExit(
            f"FAIL: tier price ladder not ascending for {event_slug}/{size}g: "
            f"{totals} — check packages.json / SKU prices."
        )

    canonical = f"{SITE_URL}{url_path(f'{event_slug}-package-{size}-guests.html')}"
    product_name = f"{size}-Guest {event['labelPossessive']} Package"

    description = (
        f"Fixed-price {event['label'].lower()} rental package for {size} guests — "
        f"tables, chairs, optional tent. 10% off when you bundle. 3 tiers from "
        f"${tier_cards[0]['total']:,.0f} to ${tier_cards[2]['total']:,.0f}."
    )

    # Cross-link rows — sizes within the same event type, and event types at same size
    size_links = [
        {
            "size": s,
            "url": url_path(f"{event_slug}-package-{s}-guests.html"),
            "is_current": s == size,
        }
        for s in pkg["sizes"]
    ]
    event_links = [
        {
            "slug": slug,
            "label": pkg["eventTypes"][slug]["labelPossessive"],
            "url": url_path(f"{slug}-package-{size}-guests.html"),
            "is_current": slug == event_slug,
        }
        for slug in pkg["eventTypes"]
    ]

    # Page title, meta description kept concise
    page_title = f"{product_name} — 10% Off | Forever Party Rentals"
    page_description = (
        f"{size}-guest {event['label'].lower()} rental package: tables, chairs "
        f"& tent bundled at 10% off. Serving the Lower Mainland."
    )

    table_kind = "round" if event_slug == "wedding" else "banquet"
    if size == 50 and event_slug == "backyard":
        layout_file = "spacious-50-banquet.svg"
        layout_caption = (
            f"{size}-guest backyard · banquet tables · spacious packing · "
            "20×40 marquee. Generated by our Event Layout Planner."
        )
    else:
        layout_file = f"spacious-{size}-{table_kind}-dance.svg"
        layout_caption = (
            f"{size}-guest {event['label'].lower()} · {table_kind} tables · "
            "dance floor · spacious packing. Generated by our Event Layout Planner."
        )

    return {
        "event": event,
        "event_slug": event_slug,
        "size": size,
        "tier_cards": tier_cards,
        "lowest_total": min(t["total"] for t in tier_cards),
        "highest_total": max(t["total"] for t in tier_cards),
        "size_links": size_links,
        "event_links": event_links,
        "product_name": product_name,
        "product_description": description,
        "page_title": page_title,
        "page_description": page_description,
        "canonical_url": canonical,
        "site_url": SITE_URL,
        "fpr": FPR,
        "layout_src": f"/images/layout-previews/{layout_file}",
        "layout_caption": layout_caption,
        "coupon_code": pkg.get("couponCode") or "bundle10",
        "lastmod": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def parse_csv(s: str | None) -> list[str]:
    return [x.strip() for x in (s or "").split(",") if x.strip()]


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true")
    g.add_argument("--events", type=str, help="comma-separated event slugs")
    ap.add_argument("--sizes", type=str, default="", help="comma-separated sizes (50,100,150)")
    ap.add_argument("--out", default="", help="optional subfolder under _build/ for pilot output")
    args = ap.parse_args()

    pkg, skus = load_data()
    adelie_map = load_adelie_map()

    all_events = list(pkg["eventTypes"].keys())
    events = all_events if args.all else parse_csv(args.events)
    unknown = [e for e in events if e not in all_events]
    if unknown:
        raise SystemExit(f"Unknown event type(s): {unknown}. Valid: {all_events}")

    all_sizes = pkg["sizes"]
    sizes = [int(s) for s in parse_csv(args.sizes)] if args.sizes else all_sizes
    unknown_sizes = [s for s in sizes if s not in all_sizes]
    if unknown_sizes:
        raise SystemExit(f"Unknown size(s): {unknown_sizes}. Valid: {all_sizes}")

    env = Environment(
        loader=FileSystemLoader(str(HERE)),
        undefined=StrictUndefined,
        autoescape=False,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.globals["nav_html"] = render_nav()
    env.globals["footer_html"] = render_footer()
    template = env.get_template(TEMPLATE_FILE)

    out_dir = (HERE / args.out) if args.out else SITE_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    written = 0
    for event_slug in events:
        event = pkg["eventTypes"][event_slug]
        for size in sizes:
            ctx = build_context(event_slug, event, size, pkg, skus, adelie_map)
            html = template.render(**ctx)
            out = out_dir / f"{event_slug}-package-{size}-guests.html"
            out.write_text(html, encoding="utf-8")
            totals_str = " / ".join(f"${t['total']:,.2f}" for t in ctx["tier_cards"])
            print(f"  wrote {out.name}  ({len(html):,} bytes)  [{totals_str}]")
            written += 1

    print(f"\nDone — {written} package page(s) generated.")


if __name__ == "__main__":
    main()
