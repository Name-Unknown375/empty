#!/usr/bin/env python3
"""
Generate Forever Party Rentals Christmas light installation per-city pages.

Parallel pipeline to generate_product_pages.py. Reads city_data.json (cities
with christmasServiceLevel == "full") and christmas_light_data.json (service
content), and writes christmas-lights-{slug}.html pages.

Usage:
    python3 generate_christmas_light_pages.py --all
    python3 generate_christmas_light_pages.py --slugs surrey,langley
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from urlpath import url_path
from render_partials import render_nav, render_footer
from overrides_loader import load_overrides

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent / "site"
CITY_DATA_FILE = HERE / "city_data.json"
SERVICE_DATA_FILE = HERE / "christmas_light_data.json"
SITE_CONSTANTS_FILE = HERE / "site_constants.json"
TEMPLATE_FILE = "christmas_light_template.html"

# Brand identity centralised in site_constants.json — see generate_city_pages.py.
with open(SITE_CONSTANTS_FILE, encoding="utf-8") as _f:
    FPR = json.load(_f)
SITE_URL = FPR["siteUrl"]
LOGO_URL = FPR["logoUrl"]


def load_data():
    with open(CITY_DATA_FILE, encoding="utf-8") as f:
        city_data = json.load(f)
    with open(SERVICE_DATA_FILE, encoding="utf-8") as f:
        service_data = json.load(f)
    return city_data, service_data


def sub(text: str, city_name: str) -> str:
    return text.replace("{city}", city_name)


def _build_local_intro(service: dict, city: dict) -> str:
    """City-specific second intro paragraph referencing real landmarks and
    neighborhoods. Deterministic per city slug so output is stable between
    builds. Mirrors the _build_local_intro() in generate_product_pages.py so
    Christmas pages benefit from the same dedup-resistance logic."""
    lang = service.get("localLang", {})
    if not lang:
        return ""

    city_name = city["name"]
    landmarks = city.get("landmarks") or []
    neighborhoods = city.get("neighborhoods") or []
    drive_time = city.get("driveTimeFromSurrey", "")

    seed = sum(ord(c) for c in city["slug"])
    landmark = landmarks[seed % len(landmarks)] if landmarks else ""
    nb1 = neighborhoods[seed % len(neighborhoods)] if neighborhoods else ""
    if nb1 == landmark and len(neighborhoods) > 1:
        nb1 = neighborhoods[(seed + 1) % len(neighborhoods)]
    nb2 = (
        neighborhoods[(seed + 1) % len(neighborhoods)]
        if len(neighborhoods) > 1
        else nb1
    )
    for offset in range(2, len(neighborhoods) + 2):
        if nb2 not in (landmark, nb1):
            break
        nb2 = neighborhoods[(seed + offset) % len(neighborhoods)]

    parts = []

    exp_landmark = lang["verb_at_landmark"].format(landmark=landmark) if landmark else ""
    exp_nb = lang["verb_at_neighborhood"].format(neighborhood=nb1) if nb1 else ""
    if exp_landmark and exp_nb:
        parts.append(
            f"We've {exp_landmark} and {exp_nb} — and we know the access "
            f"quirks of {city_name}'s rooflines, driveways, and street-power hookups."
        )
    elif exp_landmark:
        parts.append(f"We've {exp_landmark} and we know {city_name}'s property access quirks.")
    elif exp_nb:
        parts.append(f"We've {exp_nb} and we know the streets well.")

    parts.append(lang["logistics"].format(city=city_name))

    if drive_time:
        coverage_nb = nb2 if nb2 and nb2 != nb1 else nb1
        coverage_tail = f" — including {coverage_nb}" if coverage_nb else ""
        parts.append(
            f"{drive_time}, so we book realistic install and maintenance windows for "
            f"every {city_name} property{coverage_tail}."
        )

    parts.append(lang["close"].format(city=city_name))

    return " ".join(p.strip() for p in parts if p.strip())


def page_slug(service: dict, city_slug: str) -> str:
    return f"{service['urlPrefix']}-{city_slug}"


def build_faqs(service: dict, city: dict, city_faqs_pool: dict) -> list[dict]:
    """Pick 5 service-level FAQs + 1 city-level FAQ deterministically by slug.
    Produces inter-page variation (different cities show different FAQ mixes)."""
    product_faqs = service["productFaqs"]
    seed = sum(ord(c) for c in city["slug"])

    # Deterministically pick 5 of 10 service FAQs for this city
    chosen_indices = [(seed + i * 3) % len(product_faqs) for i in range(5)]
    # De-dupe while preserving order
    seen = set()
    ordered = []
    for i in chosen_indices:
        if i not in seen:
            seen.add(i)
            ordered.append(i)
    # Pad with unseen ones if de-duping dropped any
    for i in range(len(product_faqs)):
        if len(ordered) >= 5:
            break
        if i not in seen:
            ordered.append(i)
            seen.add(i)

    picked = [
        {"q": sub(product_faqs[i]["q"], city["name"]), "a": sub(product_faqs[i]["a"], city["name"])}
        for i in ordered[:5]
    ]

    # Always end with the city-level service-confirmation FAQ for strong local signal
    conf = city_faqs_pool["service_confirmation"]
    picked.append({"q": sub(conf["q"], city["name"]), "a": sub(conf["a"], city["name"])})

    return picked


def christmas_title(city_name: str) -> str:
    """Query phrase + price. Stay ≤60 characters (Wave 1/3 title formula)."""
    full = f"{city_name} Christmas Light Installation — From $8.50/ft"
    if len(full) <= 60:
        return full
    return f"{city_name} Christmas Lights — From $8.50/ft"


def christmas_description(city_name: str) -> str:
    return (
        f"{city_name} Christmas light installation from $8.50/ft — design, "
        f"commercial LED install, takedown and free storage. Now booking for fall 2026."
    )


def build_context(city_slug: str, city: dict, service: dict, city_faqs_pool: dict) -> dict:
    slug = page_slug(service, city_slug)
    canonical = f"{SITE_URL}{url_path(f'{slug}.html')}"
    city_page = url_path(f"{city_slug}-party-rentals.html")

    title = christmas_title(city["name"])
    description = christmas_description(city["name"])

    tagline = sub(service["tagline"], city["name"])
    intro_summary = sub(service["introSummary"], city["name"])
    local_intro = _build_local_intro(service, city)
    bullets = [sub(b, city["name"]) for b in service["bullets"]]
    subcategory_cards = [
        {**sc, "description": sub(sc["description"], city["name"])}
        for sc in service["subcategoryCards"]
    ]
    hero_alt = sub(service["heroAlt"], city["name"])
    faqs = build_faqs(service, city, city_faqs_pool)

    return {
        "city": city,
        "service": service,
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
        "fpr": FPR,
        "lastmod": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "overrides": load_overrides(slug, "christmas"),
    }


def select_cities(city_data: dict, slugs_arg: str | None) -> list[str]:
    """Return slugs of cities flagged christmasServiceLevel == 'full'.
    If --slugs is passed, intersect with that list (only full-service cities
    are eligible; unknown or tier-3/4 slugs raise an error)."""
    eligible = [
        s for s, c in city_data["cities"].items()
        if c.get("christmasServiceLevel") == "full"
    ]
    if not slugs_arg:
        return eligible
    requested = [s.strip() for s in slugs_arg.split(",") if s.strip()]
    unknown = [s for s in requested if s not in city_data["cities"]]
    if unknown:
        raise SystemExit(f"Unknown city slug(s): {unknown}")
    ineligible = [s for s in requested if s not in eligible]
    if ineligible:
        raise SystemExit(
            f"City slug(s) are not christmasServiceLevel='full': {ineligible}. "
            f"Update city_data.json first if you intend to serve them."
        )
    return requested


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="generate pages for every full-service city")
    ap.add_argument("--slugs", type=str, help="comma-separated city slugs (must be christmasServiceLevel='full')")
    args = ap.parse_args()

    if not (args.all or args.slugs):
        ap.error("Pass --all or --slugs")

    city_data, service_data = load_data()
    service = service_data["service"]
    city_faqs_pool = service_data["cityFaqs"]

    cities = select_cities(city_data, None if args.all else args.slugs)

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

    SITE_DIR.mkdir(parents=True, exist_ok=True)

    written = []
    for city_slug in cities:
        city = city_data["cities"][city_slug]
        ctx = build_context(city_slug, city, service, city_faqs_pool)
        html = template.render(**ctx)
        slug = page_slug(service, city_slug)
        path = SITE_DIR / f"{slug}.html"
        path.write_text(html, encoding="utf-8")
        written.append((slug, path, len(html)))

    for slug, path, size in written:
        print(f"  wrote {path.name}  ({size:,} bytes)")
    print(f"\nDone — {len(written)} Christmas light page(s) generated.")


if __name__ == "__main__":
    main()
