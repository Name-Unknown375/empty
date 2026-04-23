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
SITE_DIR = HERE.parent / "site"
CITY_DATA_FILE = HERE / "city_data.json"
PRODUCT_DATA_FILE = HERE / "products.json"
TEMPLATE_FILE = "product_template.html"

SITE_URL = "https://foreverpartyrentals.com"
# Hosted brand logo — see generate_city_pages.py for rationale.
LOGO_URL = (
    "https://images.squarespace-cdn.com/content/v1/6377fe3c61a4ae0a3c0e29fc/"
    "993255ee-d7bd-41ba-a9dc-659d794941af/Forever+Party+Rentals+Logo.png?format=1500w"
)


def load_data():
    with open(CITY_DATA_FILE, encoding="utf-8") as f:
        city_data = json.load(f)
    with open(PRODUCT_DATA_FILE, encoding="utf-8") as f:
        product_data = json.load(f)
    return city_data, product_data


def sub(text: str, city_name: str) -> str:
    """Simple placeholder substitution. Supports {city}."""
    return text.replace("{city}", city_name)


# Product-specific language used in the city-aware intro paragraph. Each entry
# picks TWO slots to fill with city landmarks / neighborhoods, plus a verb phrase
# that reads naturally for the product. Keeps the paragraph product-and-city-
# specific (not just a {city} token swap).
PRODUCT_LOCAL_LANG = {
    "tent": {
        "verb_at_landmark": "staked marquee tents for weddings at {landmark}",
        "verb_at_neighborhood": "installed frame tents in backyards across {neighborhood}",
        "logistics": (
            "Because of {city}'s mix of grass venues, pavement driveways, and "
            "stamped-concrete patios, we carry both engineered stakes and "
            "ballasted weight kits on every {city} delivery — your site conditions "
            "dictate the anchor, not the other way around."
        ),
        "close": (
            "Most {city} tent bookings add our Chiavari chairs, round tables, and "
            "bistro lighting; we bundle them on a single truck for one delivery window."
        ),
    },
    "chair": {
        "verb_at_landmark": "staged rows of white Chiavari chairs for ceremonies at {landmark}",
        "verb_at_neighborhood": "delivered Fanback folding chairs to backyard celebrations in {neighborhood}",
        "logistics": (
            "For {city} events, we lay chairs out to your floor plan — ceremony "
            "rows, round-table seating, or mixed indoor/outdoor configurations — "
            "at no extra setup charge. Chiavari, Fanback folding, and Resin Garden "
            "styles can ship on the same order without a mixing surcharge."
        ),
        "close": (
            "Most {city} ceremonies pair our chairs with round tables or a marquee tent; "
            "add them to the same quote and we'll stage everything in one window."
        ),
    },
    "table": {
        "verb_at_landmark": "set up banquet rows for corporate dinners near {landmark}",
        "verb_at_neighborhood": "delivered 6-foot rounds and highboys to receptions in {neighborhood}",
        "logistics": (
            "For {city} events our crew unfolds and positions every table to your "
            "floor plan — whether that's long family-style banquet rows, 5-foot or "
            "6-foot rounds for a seated dinner, or highboy cocktail tables for a "
            "networking reception. Wiped, inspected, and ready when we arrive."
        ),
        "close": (
            "Pair our {city} tables with Chiavari chairs or a dance floor on the same "
            "quote; one delivery, one pickup, one invoice."
        ),
    },
    "dance-floor": {
        "verb_at_landmark": "levelled dance floors for wedding receptions at {landmark}",
        "verb_at_neighborhood": "laid our signature checkered floor at milestone celebrations in {neighborhood}",
        "logistics": (
            "{city} venues run the full range — carpeted banquet rooms, tented lawns, "
            "uneven patios — so every dance floor rental includes our subfloor "
            "levelling system. We stage the floor first, then your florals, head "
            "tables, and staging build around it."
        ),
        "close": (
            "Most {city} reception bookings combine the dance floor with a marquee "
            "tent, round tables, and bistro lighting in one quote — stage-ready by "
            "the time guest service begins."
        ),
    },
}


def _build_local_intro(product: dict, city: dict) -> str:
    """Compose a city-specific second intro paragraph that references real
    landmarks and neighborhoods. Ensures product×city pages are not just a
    {city} token swap on shared boilerplate.

    Returns an HTML string (no outer <p>, so the template can wrap it).
    """
    lang = PRODUCT_LOCAL_LANG.get(product["key"], {})
    if not lang:
        return ""

    city_name = city["name"]
    landmarks = city.get("landmarks") or []
    neighborhoods = city.get("neighborhoods") or []
    drive_time = city.get("driveTimeFromSurrey", "")

    # Deterministic picks based on slug hash so each city always gets the same
    # landmark/neighborhood (stable URLs, stable content between builds).
    seed = sum(ord(c) for c in city["slug"])
    landmark = landmarks[seed % len(landmarks)] if landmarks else ""
    # Use two different neighborhoods; offset by +1 to avoid picking the same as
    # the landmark index modulo landmarks-length.
    nb1 = neighborhoods[seed % len(neighborhoods)] if neighborhoods else ""
    # Some cities have a name that appears in BOTH arrays at the same index
    # (e.g. Harrison Hot Springs has "Harrison Beach" as landmark[1] AND
    # neighborhood[1]). Shift nb1 forward so the two sentences don't cite the
    # exact same place twice.
    if nb1 == landmark and len(neighborhoods) > 1:
        nb1 = neighborhoods[(seed + 1) % len(neighborhoods)]
    nb2 = (
        neighborhoods[(seed + 1) % len(neighborhoods)]
        if len(neighborhoods) > 1
        else nb1
    )
    # Avoid the edge case where nb2 lands on the same item as the landmark
    # or nb1 (small neighborhood lists + the collision fix above).
    for offset in range(2, len(neighborhoods) + 2):
        if nb2 not in (landmark, nb1):
            break
        nb2 = neighborhoods[(seed + offset) % len(neighborhoods)]

    # Build the sentences
    parts = []

    # Experience sentence: two specific past-work references
    exp_landmark = lang["verb_at_landmark"].format(landmark=landmark) if landmark else ""
    exp_nb = lang["verb_at_neighborhood"].format(neighborhood=nb1) if nb1 else ""
    if exp_landmark and exp_nb:
        parts.append(
            f"We've {exp_landmark} and {exp_nb} — and we know the access "
            f"quirks of {city_name}'s popular event sites."
        )
    elif exp_landmark:
        parts.append(f"We've {exp_landmark} and we know {city_name}'s venue access quirks.")
    elif exp_nb:
        parts.append(f"We've {exp_nb} and we know the streets well.")

    # Logistics sentence
    parts.append(lang["logistics"].format(city=city_name))

    # Drive-time / coverage sentence
    if drive_time:
        coverage_nb = nb2 if nb2 and nb2 != nb1 else nb1
        coverage_tail = f" — including {coverage_nb}" if coverage_nb else ""
        parts.append(
            f"{drive_time}, so we build realistic delivery windows into every "
            f"{city_name} quote{coverage_tail}."
        )

    # Close
    parts.append(lang["close"].format(city=city_name))

    return " ".join(p.strip() for p in parts if p.strip())


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


def build_siblings(city_slug: str, current_key: str, products: dict) -> list[dict]:
    """List the *other* product-per-city pages for this city, for cross-linking.
    Each entry exposes enough fields for the sibling-cards UI in the template."""
    out = []
    for key, p in products.items():
        if key == current_key:
            continue
        out.append({
            "key": key,
            "name": p["productName"],
            "url": f"{page_slug(p, city_slug)}.html",
            "image": p["heroImage"],
            "serviceType": p.get("serviceType", p["productName"]),
        })
    return out


def build_context(city_slug: str, city: dict, product: dict, data: dict, all_products: dict) -> dict:
    slug = page_slug(product, city_slug)
    canonical = f"{SITE_URL}/{slug}.html"
    city_page = f"{city_slug}-party-rentals.html"

    pool = data["testimonialPool"]
    testimonials = [pool[i] for i in city["testimonialIndices"]]

    title = (
        f"{product['productName']} {city['name']} BC | "
        f"{product['subcategoryCards'][0]['name']} &amp; More | Forever Party Rentals"
    )
    _product_desc_templates = {
        "tent": (
            "Marquee & frame tent rentals in {city}, BC — 20×20, 20×40 & 20×60 tents "
            "delivered, staked, and collected by our crew. Serving {nb}. Book online 24/7."
        ),
        "chair": (
            "Chiavari, Fanback & Resin Garden chair rentals in {city}, BC — delivered "
            "and set up to your floor plan. Serving {nb}. Book online 24/7."
        ),
        "table": (
            "Banquet, round & cocktail table rentals in {city}, BC — positioned to your "
            "layout by our crew. Serving {nb}. Book online 24/7."
        ),
        "dance-floor": (
            "Black & white dance floor rentals in {city}, BC — levelled and staged by "
            "our crew. Serving {nb}. Book online 24/7."
        ),
    }
    _desc_tpl = _product_desc_templates.get(product["key"])
    if _desc_tpl:
        description = _desc_tpl.format(
            city=city["name"],
            nb=", ".join(city["neighborhoods"][:3]),
        )
    else:
        description = (
            f"{product['productName']} in {city['name']}, BC — delivered, set up, and collected by "
            f"our crew. Serving {', '.join(city['neighborhoods'][:3])}. Book online 24/7."
        )

    tagline = sub(product["tagline"], city["name"])
    intro_summary = sub(product["introSummary"], city["name"])
    local_intro = _build_local_intro(product, city)
    bullets = [sub(b, city["name"]) for b in product["bullets"]]
    subcategory_cards = [
        {**sc, "description": sub(sc["description"], city["name"])}
        for sc in product["subcategoryCards"]
    ]
    hero_alt = sub(product["heroAlt"], city["name"])

    faqs = build_faqs(product, city)
    siblings = build_siblings(city_slug, product["key"], all_products)

    return {
        "city": city,
        "product": product,
        "siblings": siblings,
        "testimonials": testimonials,
        "tagline": tagline,
        "intro_summary": intro_summary,
        "local_intro": local_intro,
        "bullets": bullets,
        "subcategory_cards": subcategory_cards,
        "hero_alt": hero_alt,
        "faqs": faqs,
        "page_title": title,
        "page_description": description,
        "canonical_url": canonical,
        "city_page": city_page,
        "site_url": SITE_URL,
        "logo_url": LOGO_URL,
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
            ctx = build_context(city_slug, city, product, city_data, product_data["products"])
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
