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

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from render_partials import render_nav, render_footer

from urlpath import url_path
from overrides_loader import load_overrides

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent / "site-v3"
CITY_DATA_FILE = HERE / "city_data.json"
PRODUCT_DATA_FILE = HERE / "products.json"
SITE_CONSTANTS_FILE = HERE / "site_constants.json"
TEMPLATE_FILE = "product_template.html"

# Brand identity centralised in site_constants.json — see generate_city_pages.py.
with open(SITE_CONSTANTS_FILE, encoding="utf-8") as _f:
    FPR = json.load(_f)
SITE_URL = FPR["siteUrl"]
LOGO_URL = FPR["logoUrl"]


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
    "projector": {
        "verb_at_landmark": "run big-screen presentations and outdoor screenings near {landmark}",
        "verb_at_neighborhood": "set up backyard movie nights for families in {neighborhood}",
        "logistics": (
            "Because {city} events range from lit conference rooms to dusk backyard "
            "screenings, we bring a 5000-lumen laser projector that holds its image "
            "where dimmer home-theatre units wash out — and we set the 100″ screen "
            "and stand, frame the picture, and confirm the source before we leave."
        ),
        "close": (
            "Most {city} projector bookings ship alongside a marquee tent or an "
            "EcoFlow power station, so an off-grid movie night arrives on a single "
            "truck in one delivery window."
        ),
    },
    "starlink": {
        # Newer, lower-volume line — frame around venue/geography fit rather
        # than specific past-job claims (style_guide: no fabricated history).
        "experience_override": (
            "{city} has no shortage of venues where grid internet doesn't reach — "
            "from {landmark} to events around {neighborhood} — and a Starlink kit "
            "drops a Zoom-grade connection into any of them."
        ),
        "verb_at_landmark": "delivered plug-and-play Starlink kits for off-grid events near {landmark}",
        "verb_at_neighborhood": "set up Zoom-grade connectivity for remote gatherings around {neighborhood}",
        "logistics": (
            "Whether it's a park shelter, an acreage property, or a shoulder-season "
            "pop-up, every kit ships with the self-aligning dish, WiFi router, all "
            "cabling, and a pre-activated Roam subscription. We confirm a clear view "
            "of the sky and a live 100–200 Mbps connection before we leave the site."
        ),
        "close": (
            "Most {city} Starlink bookings pair with an EcoFlow power station so the "
            "dish and router run fully off-grid — both arrive on one truck in a single "
            "delivery window."
        ),
    },
    "battery-power-station": {
        # Newer, lower-volume line — keep claims to capability + product facts.
        "experience_override": (
            "From {landmark} to backyard receptions around {neighborhood}, plenty of "
            "{city} events run where shore power doesn't reach — and a silent EcoFlow "
            "station covers the DJ booth, the lighting, and the catering load without a generator."
        ),
        "verb_at_landmark": "delivered silent EcoFlow power stations for events near {landmark}",
        "verb_at_neighborhood": "powered DJ booths, bistro lighting, and food vendors at gatherings in {neighborhood}",
        "logistics": (
            "{city} events run the full power range — a DJ booth and string lights at a "
            "backyard wedding, an espresso bar or food-truck POS at a corporate pop-up, a "
            "shoulder-season heater after dark — so we stock the full EcoFlow Delta lineup "
            "from the 1024 Wh Delta 2 to the 11 kWh-expandable Delta 3 Ultra. Every unit "
            "arrives charged, with a walkthrough of your power budget so nothing trips mid-event."
        ),
        "close": (
            "Most {city} power-station bookings ship alongside a marquee tent, a Starlink "
            "kit, or a projector — clean, silent, generator-grade power on a single truck "
            "with no diesel fumes and no generator hum."
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

    # Experience sentence. Products with real, high-volume history (tent, chair,
    # …) use a "We've …" past-work sentence. Newer / lower-volume lines set
    # `experience_override` so we frame the city's need + product fit instead of
    # claiming a job history we can't stand behind (style_guide: no fabrication).
    override_tpl = lang.get("experience_override")
    if override_tpl and (landmark or nb1):
        parts.append(
            override_tpl.format(
                city=city_name,
                landmark=landmark or nb1,
                neighborhood=nb1 or landmark,
            )
        )

    # Experience sentence: two specific local references. Rotate among a few
    # skeletons (deterministic by slug) so sibling pages in the same product
    # family don't all open with the identical sentence structure.
    exp_landmark = lang["verb_at_landmark"].format(landmark=landmark) if landmark and not override_tpl else ""
    exp_nb = lang["verb_at_neighborhood"].format(neighborhood=nb1) if nb1 and not override_tpl else ""
    if exp_landmark and exp_nb:
        both_templates = (
            f"We've {exp_landmark} and {exp_nb} — and we know the access "
            f"quirks of {city_name}'s popular event sites.",
            f"We've {exp_nb} and {exp_landmark}, so {city_name}'s venues — and "
            f"their access quirks — are familiar ground for our crew.",
            f"From {exp_landmark} to {exp_nb}, we've worked the range of "
            f"{city_name} event sites and know how each one loads in.",
        )
        parts.append(both_templates[seed % len(both_templates)])
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
    Each entry exposes enough fields for the sibling-cards UI in the template.
    Sibling links honour cityWhitelist: if a sibling product restricts itself to
    a subset of cities, fall back to its category landing page for cities outside
    the whitelist (so we never emit a dead link to a never-generated city page)."""
    out = []
    for key, p in products.items():
        if key == current_key:
            continue
        whitelist = p.get("cityWhitelist")
        if whitelist and city_slug not in whitelist:
            url = url_path(p["categoryPage"])
        else:
            url = url_path(f"{page_slug(p, city_slug)}.html")
        out.append({
            "key": key,
            "name": p["productName"],
            "url": url,
            "image": p["heroImage"],
            "serviceType": p.get("serviceType", p["productName"]),
        })
    return out


def build_context(city_slug: str, city: dict, product: dict, all_products: dict) -> dict:
    slug = page_slug(product, city_slug)
    canonical = f"{SITE_URL}{url_path(f'{slug}.html')}"
    city_page = url_path(f"{city_slug}-party-rentals.html")

    title = f"{product['productName']} in {city['name']}, BC — Delivery & Setup Available"
    _product_desc_templates = {
        "tent": (
            "Marquee tent rentals in {city}, BC — 20×20, 20×40 & 20×60 frames "
            "delivered and set up by our crew. Book online 24/7."
        ),
        "chair": (
            "Chiavari, Fanback & Resin Garden chair rentals in {city}, BC — "
            "delivered and set up to your floor plan. Book online 24/7."
        ),
        "table": (
            "Banquet, round & cocktail table rentals in {city}, BC — "
            "positioned to your layout by our crew. Book online 24/7."
        ),
        "dance-floor": (
            "Black & white dance floor rentals in {city}, BC — "
            "levelled and staged by our crew. Book online 24/7."
        ),
        "projector": (
            "HD projector & 100″ screen rentals in {city}, BC — 5000-lumen laser "
            "projector for movie nights, weddings & presentations. Book online 24/7."
        ),
    }
    _desc_tpl = _product_desc_templates.get(product["key"])
    if _desc_tpl:
        description = _desc_tpl.format(city=city["name"])
    else:
        description = (
            f"{product['productName']} in {city['name']}, BC — "
            f"delivered, set up, and collected by our crew. Book online 24/7."
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

    # Cross-category upsell: link the battery pages to the matching Starlink
    # per-city page when one exists, otherwise fall back to the universal SKU
    # page. Same pattern can serve future category-to-category cross-sells.
    starlink = all_products.get("starlink")
    if starlink and city_slug in (starlink.get("cityWhitelist") or []):
        starlink_city_url = url_path(f"{page_slug(starlink, city_slug)}.html")
    else:
        starlink_city_url = url_path("product-starlink-standard-actuated.html")

    overrides = load_overrides(slug, "products")

    return {
        "city": city,
        "city_slug": city_slug,
        "product": product,
        "siblings": siblings,
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
        "starlink_city_url": starlink_city_url,
        "site_url": SITE_URL,
        "logo_url": LOGO_URL,
        "fpr": FPR,
        "overrides": overrides,
        "lastmod": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
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
    env.globals["nav_html"] = render_nav()
    env.globals["footer_html"] = render_footer()
    template = env.get_template(TEMPLATE_FILE)

    out_dir = (HERE / args.out) if args.out else SITE_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    written = []
    for city_slug in cities:
        city = city_data["cities"][city_slug]
        for product_key in products:
            product = product_data["products"][product_key]
            whitelist = product.get("cityWhitelist")
            if whitelist and city_slug not in whitelist:
                continue
            ctx = build_context(city_slug, city, product, product_data["products"])
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
