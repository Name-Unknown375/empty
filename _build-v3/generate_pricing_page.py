#!/usr/bin/env python3
"""
Forever Party Rentals — /pricing page generator.

Renders pricing_template.html into ../site-v3/pricing.html from
products_sku.json (item prices — the declared single source of truth) and
packages.json (every event × size × tier total, computed with the exact same
compute_tier() math used by generate_package_pages.py, so this page can
never drift from the product or package pages).

Usage:
    python3 generate_pricing_page.py
"""
from __future__ import annotations

import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from generate_package_pages import compute_tier
from render_partials import render_nav, render_footer
from urlpath import url_path

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent / "site-v3"
SKU_DATA_FILE = HERE / "products_sku.json"
PACKAGE_DATA_FILE = HERE / "packages.json"
SITE_CONSTANTS_FILE = HERE / "site_constants.json"
TEMPLATE_FILE = "pricing_template.html"
OUT_FILE = SITE_DIR / "pricing.html"

with open(SITE_CONSTANTS_FILE, encoding="utf-8") as _f:
    FPR = json.load(_f)

SITE_URL = FPR["siteUrl"]

# Tent accessories live under category "tent" in products_sku.json; they get
# their own section on this page so the marquee list stays a size ladder.
TENT_ACCESSORY_KEYS = frozenset({
    "tent-heater",
    "bistro-string-lights",
    "tent-sidewall",
})

# Category grouping/order. Keys match sku["category"].
GROUPS = [
    {
        "id": "tents",
        "title": "Tent Rentals",
        "note": "Marquee tents are priced per event and include professional install and takedown in the rental window. Popup tents are a per-day pickup or delivery item.",
        "hub": "/tents",
        "hub_label": "All tent rentals",
        "category": "tent",
        "exclude_keys": TENT_ACCESSORY_KEYS,
    },
    {
        "id": "tent-addons",
        "title": "Tent Heaters, Lights & Sidewalls",
        "note": "Add to any tent booking — same truck, same crew.",
        "hub": "/tents",
        "hub_label": "All tent rentals",
        "category": "tent",
        "include_keys": TENT_ACCESSORY_KEYS,
    },
    {
        "id": "chairs",
        "title": "Chair Rentals",
        "note": "Per-chair daily rate — mix styles on one order at no extra charge.",
        "hub": "/chairs",
        "hub_label": "All chair rentals",
        "category": "chair",
    },
    {
        "id": "tables",
        "title": "Table Rentals",
        "note": "Per-table daily rate. Linens are stocked in-house and sized to the table you book.",
        "hub": "/tables",
        "hub_label": "All table rentals",
        "category": "table",
    },
    {
        "id": "dance-floor",
        "title": "Dance Floor",
        "note": "Includes subfloor levelling, professional install, and takedown. Sizes 8×8 (~20 dancers), 12×12 (~40), and 16×16 (~60). The 8×8 also comes in all-black or all-white.",
        "hub": "/dance-floor",
        "hub_label": "Dance floor rentals",
        "category": "dance-floor",
    },
    {
        "id": "power",
        "title": "Battery Power Stations",
        "note": "Silent, indoor-safe portable power. 2-day weekend minimum.",
        "hub": "/battery-power-stations",
        "hub_label": "All power stations",
        "category": "battery-power-station",
    },
    {
        "id": "starlink",
        "title": "Starlink Internet",
        "note": "Event wifi anywhere. 2-day weekend minimum. Roam subscription included.",
        "hub": "/starlink-rentals",
        "hub_label": "Starlink rentals",
        "category": "starlink",
    },
    {
        "id": "projector",
        "title": "Projector & Screen",
        "note": None,
        "hub": "/projector-rentals",
        "hub_label": "Projector rentals",
        "category": "projector",
    },
]

# Items that have real prices on hand-authored pages but no products_sku.json
# entry. Keep these in sync with their source page (noted per row).
STATIC_ROWS = {
    "table": [
        # source: site-v3/product-banquet-table-8ft.html
        {
            "name": "8ft Banquet Table",
            "price_label": "$14.95",
            "unit_label": "per day",
            "url": "/product-banquet-table-8ft",
            "sort_price": 14.95,
            "schema_price": 14.95,
        },
    ],
    "projector": [
        # source: products_sku.json projector-screen-rental bullets
        {
            "name": "100″ Projector Screen with Stand (add-on)",
            "price_label": "$70",
            "unit_label": "per day",
            "url": "/product-projector-screen-rental",
            "sort_price": 176.0,
            "schema_price": 70.0,
        },
    ],
}

# source: site-v3/carnival-games.html + bundle pages + product-*.html
CARNIVAL_GROUP = {
    "id": "carnival",
    "title": "Carnival Games",
    "note": "Staffed booths — a trained attendant is included in every 4-hour base rate. Extra hours billed per booth (or at the bundle extra-hour rate).",
    "hub": "/carnival-games",
    "hub_label": "All carnival games",
    "rows": [
        {
            "name": "Bottle Knockdown",
            "price_label": "$650",
            "unit_label": "per 4 hours (staff included) · +$150/hr extra",
            "url": "/product-bottle-knockdown",
            "sort_price": 650.0,
            "schema_price": 650.0,
        },
        {
            "name": "Balloon Darts",
            "price_label": "$650",
            "unit_label": "per 4 hours (staff included) · +$150/hr extra",
            "url": "/product-balloon-darts",
            "sort_price": 650.0,
            "schema_price": 650.0,
        },
        {
            "name": "Ring Toss",
            "price_label": "$650",
            "unit_label": "per 4 hours (staff included) · +$150/hr extra",
            "url": "/product-ring-toss",
            "sort_price": 650.0,
            "schema_price": 650.0,
        },
        {
            "name": "Cup Toss",
            "price_label": "$650",
            "unit_label": "per 4 hours (staff included) · +$150/hr extra",
            "url": "/product-cup-toss",
            "sort_price": 650.0,
            "schema_price": 650.0,
        },
        {
            "name": "2-Game Bundle",
            "price_label": "$1,170",
            "unit_label": "per 4 hours (10% off) · +$270/hr extra",
            "url": "/carnival-games-bundle-2",
            "sort_price": 1170.0,
            "schema_price": 1170.0,
        },
        {
            "name": "4-Game Bundle",
            "price_label": "$2,210",
            "unit_label": "per 4 hours (15% off) · +$510/hr extra",
            "url": "/carnival-games-bundle-4",
            "sort_price": 2210.0,
            "schema_price": 2210.0,
        },
    ],
}

LINENS_GROUP = {
    "id": "linens",
    "title": "Tablecloths & Linens",
    "note": "Stocked in-house at the Surrey warehouse and loaded on the same truck as your tables. We size the cloth to the table you booked — colour and floor-length vs mid-drape.",
    "hub": "/tablecloth-rentals",
    "hub_label": "Tablecloth rentals",
    "rows": [
        {
            "name": "Tablecloths, napkins & runners",
            "price_label": "Quoted with tables",
            "unit_label": "sized to the tables on your order",
            "url": "/tablecloth-rentals",
            "sort_price": 0,
        },
        {
            # source: Adelie cocktail-table-spandex combo is $30; covers à la carte stay $15
            "name": "Cocktail table spandex cover",
            "price_label": "$15",
            "unit_label": "per day",
            "url": "/tablecloth-rentals",
            "sort_price": 15.0,
            "schema_price": 15.0,
        },
    ],
}

CHRISTMAS_GROUP = {
    "id": "christmas",
    "title": "Christmas Light Installation",
    "note": "Fixed-price packages — Starter, Classic, and Premium. Install, season-long maintenance, January takedown, and free storage included. Priced by linear foot, not by city.",
    "hub": "/christmas-lights",
    "hub_label": "Christmas light installation",
    "rows": [
        {
            "name": "Christmas light installation",
            "price_label": "from $8.50/ft",
            "unit_label": "Starter / Classic / Premium packages",
            "url": "/christmas-lights",
            "sort_price": 8.50,
            "schema_price": 8.50,
            "schema_unit": "per linear foot",
        },
    ],
}

FAQS = [
    {
        "q": "Are these the prices I'll pay at checkout?",
        "a": "Yes. Every number on this page is the same published rate you'll see in the cart. Delivery and applicable taxes are added as their own lines before you pay — no surprise fees at the truck.",
    },
    {
        "q": "Is delivery included in the rental price?",
        "a": "No. Item prices cover the rental. Delivery and professional setup start at $175 depending on distance from our Surrey warehouse, and the exact amount shows at checkout before you pay. Warehouse pickup is free for most items.",
    },
    {
        "q": "What deposit do I pay to lock a date?",
        "a": "A 25% deposit secures your booking. Your date is locked once the deposit is paid. Deposits aren't refundable if you cancel. The balance is due before delivery.",
    },
    {
        "q": "Do packages cost less than booking items separately?",
        "a": "Yes. Bundle a tent, tables and chairs into one package and save 10% versus the à-la-carte total. The discount is already built into every package price on this page. Pay in full within 24 hours of your quote and save another 10%.",
    },
    {
        "q": "Do you deliver across Metro Vancouver?",
        "a": "Yes. We deliver and set up from our Surrey warehouse across Metro Vancouver and the Fraser Valley — including Vancouver, Burnaby, Richmond, Langley, Abbotsford, Coquitlam, and the North Shore. Pickup from 9317 188 St, Surrey is free.",
    },
]


def money(v: float) -> str:
    """$1,100 for whole dollars, $3.25 when cents matter."""
    if abs(v - round(v)) < 0.005:
        return f"${round(v):,}"
    return f"${v:,.2f}"


def _tier_short(label: str) -> str:
    lower = label.lower()
    if lower.startswith("weekly"):
        return "week"
    return label


def display_name(sku: dict) -> str:
    return sku["name"].replace(" Rental", "").strip()


def sku_row(key: str, sku: dict) -> dict:
    url = f"/product-{key}"
    name = display_name(sku)

    if key == "black-white-dance-floor":
        # Published range on /dance-floor — do not invent per-size prices.
        low = sku["startingPriceCAD"]
        return {
            "name": name,
            "price_label": f"{money(low)}–$1,100",
            "unit_label": "per event (8×8 to 16×16)",
            "url": url,
            "sort_price": low,
            "schema_price": low,
            "schema_high": 1100.0,
        }

    if "pricingTiers" in sku:
        tiers = sku["pricingTiers"]
        primary = tiers[0]
        if len(tiers) == 1:
            label = primary["label"]
            unit = (
                f"per {label.lower()}"
                if not label.lower().startswith("2-day")
                else f"per {label}"
            )
            return {
                "name": name,
                "price_label": money(primary["price"]),
                "unit_label": unit,
                "url": url,
                "sort_price": primary["price"],
                "schema_price": primary["price"],
            }
        price_label = " · ".join(
            f"{money(t['price'])} / {_tier_short(t['label'])}" for t in tiers
        )
        return {
            "name": name,
            "price_label": price_label,
            "unit_label": "",
            "url": url,
            "sort_price": primary["price"],
            "schema_price": primary["price"],
        }

    unit = sku.get("priceUnit", "day")
    price = sku["startingPriceCAD"]
    return {
        "name": name,
        "price_label": money(price),
        "unit_label": f"per {unit}",
        "url": url,
        "sort_price": price,
        "schema_price": price,
    }


def sku_rows(skus: dict, spec: dict) -> list[dict]:
    category = spec["category"]
    include = spec.get("include_keys")
    exclude = spec.get("exclude_keys", frozenset())
    rows = []
    for key, sku in skus.items():
        if key.startswith("_") or not isinstance(sku, dict):
            continue
        if sku.get("category") != category:
            continue
        if include is not None and key not in include:
            continue
        if key in exclude:
            continue
        rows.append(sku_row(key, sku))
    rows.extend(STATIC_ROWS.get(category, []))
    rows.sort(key=lambda r: r["sort_price"])
    return rows


def package_tables(pkg: dict, skus: dict) -> list[dict]:
    out = []
    for slug, event in pkg["eventTypes"].items():
        rows = []
        for size in pkg["sizes"]:
            prices = []
            for tier in pkg["tiers"]:
                computed = compute_tier(event, size, tier, pkg, skus)
                prices.append({
                    "name": tier["name"],
                    "total": computed["total"],
                    "url": f"/{slug}-package-{size}-guests#tier-{tier['id']}",
                })
            rows.append({
                "size": size,
                "url": f"/{slug}-package-{size}-guests",
                "prices": prices,
            })
        out.append({
            "id": f"{slug}-packages",
            "slug": slug,
            "title": f"{event['label']} Packages",
            "hub": f"/packages#{slug}",
            "note": (
                "Tables, chairs, and tent (Covered and Garden Premium) bundled at "
                "10% off. Prices below already include the bundle discount, applied "
                "at checkout with code BUNDLE10. Delivery is quoted separately."
            ),
            "tier_names": [t["name"] for t in pkg["tiers"]],
            "rows": rows,
        })
    return out


def abs_url(path: str) -> str:
    return f"{SITE_URL}{path.split('#', 1)[0]}"


def offer_for_row(row: dict) -> dict | None:
    price = row.get("schema_price")
    if price is None:
        return None
    url = abs_url(row["url"])
    offer: dict = {
        "@type": "Offer",
        "name": row["name"],
        "url": url,
        "priceCurrency": "CAD",
        "price": f"{price:.2f}",
        "availability": "https://schema.org/InStock",
        "areaServed": "Metro Vancouver, BC",
        "seller": {"@id": f"{SITE_URL}/#localbusiness"},
        "itemOffered": {
            "@type": "Product",
            "name": row["name"],
            "url": url,
        },
    }
    high = row.get("schema_high")
    if high is not None:
        offer["@type"] = "AggregateOffer"
        offer["lowPrice"] = f"{price:.2f}"
        offer["highPrice"] = f"{high:.2f}"
        offer["offerCount"] = 3
        del offer["price"]
        return offer
    unit = row.get("schema_unit") or (row.get("unit_label") or "").strip()
    if unit:
        offer["priceSpecification"] = {
            "@type": "UnitPriceSpecification",
            "price": f"{price:.2f}",
            "priceCurrency": "CAD",
            "unitText": unit,
        }
    return offer


def build_schema(canonical: str, page_title: str, page_description: str,
                 groups: list[dict], pkg_tables: list[dict]) -> dict:
    offers: list[dict] = []
    for group in groups:
        for row in group["rows"]:
            offer = offer_for_row(row)
            if offer:
                offers.append(offer)
    for table in pkg_tables:
        for row in table["rows"]:
            for cell in row["prices"]:
                url = abs_url(cell["url"])
                offers.append({
                    "@type": "Offer",
                    "name": f"{table['title'].replace(' Packages', '')} Package — {row['size']} guests, {cell['name']}",
                    "url": url,
                    "priceCurrency": "CAD",
                    "price": f"{cell['total']:.2f}",
                    "availability": "https://schema.org/InStock",
                    "areaServed": "Metro Vancouver, BC",
                    "seller": {"@id": f"{SITE_URL}/#localbusiness"},
                    "itemOffered": {
                        "@type": "Product",
                        "name": f"{row['size']}-Guest {table['title'].replace(' Packages', '')} Package — {cell['name']}",
                        "url": url,
                    },
                })

    webpage = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": f"{canonical}#webpage",
        "url": canonical,
        "name": page_title,
        "description": page_description,
        "inLanguage": "en-CA",
        "isPartOf": {"@id": f"{SITE_URL}/#website"},
        "about": {"@id": f"{SITE_URL}/#localbusiness"},
        "mainEntity": {"@id": f"{canonical}#pricelist"},
    }
    catalog = {
        "@context": "https://schema.org",
        "@type": "OfferCatalog",
        "@id": f"{canonical}#pricelist",
        "name": "Forever Party Rentals Price List",
        "url": canonical,
        "numberOfItems": len(offers),
        "itemListElement": offers,
    }
    breadcrumbs = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE_URL}/"},
            {"@type": "ListItem", "position": 2, "name": "Pricing", "item": canonical},
        ],
    }
    faq = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": f["q"],
                "acceptedAnswer": {"@type": "Answer", "text": f["a"]},
            }
            for f in FAQS
        ],
    }
    return {
        "webpage": webpage,
        "catalog": catalog,
        "breadcrumbs": breadcrumbs,
        "faq": faq,
    }


def assert_urls_exist(groups: list[dict], pkg_tables: list[dict]) -> None:
    missing = []
    seen = set()
    paths = [row["url"] for g in groups for row in g["rows"]]
    paths += [row["url"] for t in pkg_tables for row in t["rows"]]
    for raw in paths:
        path = raw.split("#", 1)[0]
        if path in seen:
            continue
        seen.add(path)
        html = SITE_DIR / f"{path.lstrip('/')}.html"
        if not html.exists():
            missing.append(path)
    if missing:
        raise SystemExit(f"pricing page links to missing files: {missing}")


def main() -> None:
    with open(SKU_DATA_FILE, encoding="utf-8") as f:
        sku_data = json.load(f)
    with open(PACKAGE_DATA_FILE, encoding="utf-8") as f:
        pkg = json.load(f)
    skus = sku_data["products"]

    groups = []
    for spec in GROUPS:
        rows = sku_rows(skus, spec)
        if rows:
            groups.append({**spec, "rows": rows})
        if spec["id"] == "tables":
            groups.append(LINENS_GROUP)
    groups.append(CARNIVAL_GROUP)
    groups.append(CHRISTMAS_GROUP)

    pkg_tables = package_tables(pkg, skus)
    assert_urls_exist(groups, pkg_tables)

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
        "package": min(
            cell["total"]
            for table in pkg_tables
            for row in table["rows"]
            for cell in row["prices"]
        ),
    }

    page_title = "Party Rental Price List — Metro Vancouver & Fraser Valley | Forever Party Rentals"
    page_description = (
        "Full published price list: chairs from $3.25/day, tables from $10.95/day, "
        "marquee tents from $550/event, dance floor from $500, packages from "
        f"${quick['package']:,.0f}. Delivery from $175 or free Surrey pickup."
    )
    canonical_url = f"{SITE_URL}{url_path('pricing.html')}"

    schema = build_schema(canonical_url, page_title, page_description, groups, pkg_tables)

    jump = (
        [{"id": "packages", "label": "Packages"}]
        + [{"id": g["id"], "label": g["title"].split("&")[0].split(",")[0].strip()} for g in groups]
        + [{"id": "fees", "label": "Delivery & fees"}]
    )
    # Shorter jump labels for the chip row
    jump_labels = {
        "tents": "Tents",
        "tent-addons": "Heaters & lights",
        "chairs": "Chairs",
        "tables": "Tables",
        "linens": "Linens",
        "dance-floor": "Dance floor",
        "power": "Power",
        "starlink": "Starlink",
        "projector": "Projector",
        "carnival": "Carnival",
        "christmas": "Christmas lights",
        "packages": "Packages",
        "fees": "Delivery & fees",
    }
    for item in jump:
        item["label"] = jump_labels.get(item["id"], item["label"])

    env = Environment(
        loader=FileSystemLoader(HERE),
        undefined=StrictUndefined,
        autoescape=False,
    )
    env.globals["nav_html"] = render_nav()
    env.globals["footer_html"] = render_footer()
    env.filters["money"] = money

    html = env.get_template(TEMPLATE_FILE).render(
        fpr=FPR,
        page_title=page_title,
        page_description=page_description,
        canonical_url=canonical_url,
        groups=groups,
        package_tables=pkg_tables,
        quick=quick,
        jump=jump,
        faqs=FAQS,
        schema_webpage=json.dumps(schema["webpage"], ensure_ascii=False, indent=2),
        schema_catalog=json.dumps(schema["catalog"], ensure_ascii=False, indent=2),
        schema_breadcrumbs=json.dumps(schema["breadcrumbs"], ensure_ascii=False, indent=2),
        schema_faq=json.dumps(schema["faq"], ensure_ascii=False, indent=2),
    )
    OUT_FILE.write_text(html, encoding="utf-8")
    n_items = sum(len(g["rows"]) for g in groups)
    n_pkg = sum(len(t["rows"]) * len(t["tier_names"]) for t in pkg_tables)
    print(f"wrote {OUT_FILE.relative_to(HERE.parent)} ({n_items} items, {n_pkg} package prices)")


if __name__ == "__main__":
    main()
