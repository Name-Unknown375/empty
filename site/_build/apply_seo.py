#!/usr/bin/env python3
"""
Idempotently inject SEO best-practice head elements into every static HTML
page in site/ that doesn't already have JSON-LD schema.

What gets injected:
  - <link rel="canonical">
  - robots + theme-color meta
  - hreflang alternates (en-CA + x-default)
  - Open Graph + Twitter Card meta
  - Page-appropriate JSON-LD @graph with:
      Organization, LocalBusiness (w/ AggregateRating, areaServed),
      WebPage, BreadcrumbList, and — when relevant — Service.

Pages that already have <script type="application/ld+json"> are skipped; this
includes the 22 flagship city pages and the homepage (which have their own
hand-tuned schema).

Usage:
    python3 apply_seo.py              # modify files in place
    python3 apply_seo.py --dry-run    # report only
"""

import argparse
import html
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent
SITE_URL = "https://foreverpartyrentals.com"

# Canonical NAP / business constants — must match the flagship city pages.
BUSINESS = {
    "name": "Forever Party Rentals",
    "telephone": "+1-778-990-7983",
    "email": "welcome@foreverpartyrentals.com",
    "street": "9317 188 St",
    "locality": "Surrey",
    "region": "BC",
    "postal": "V4N 3V1",
    "country": "CA",
    "lat": 49.1913,
    "lng": -122.849,
    "logo": f"{SITE_URL}/logo.png",
    "default_image": (
        "https://images.squarespace-cdn.com/content/v1/6377fe3c61a4ae0a3c0e29fc/"
        "397f8c6b-521c-4be9-9ca1-cfe6a6706e65/Marquee+Tents+Lowermainlad+for+Rent.jpg"
    ),
    "review_count": 200,
    "rating": 5.0,
    "price_range": "$$",
    "open": "09:30",
    "close": "18:00",
    "sameAs": [
        "https://www.google.com/maps/place/Forever+Party+Rentals",
        "https://www.instagram.com/foreverpartyrentals",
    ],
}

# Per-product defaults: (display name, hero image, og alt prefix)
PRODUCT_DEFAULTS = {
    "chair": (
        "Chair Rentals",
        "https://images.squarespace-cdn.com/content/v1/6377fe3c61a4ae0a3c0e29fc/"
        "50e58759-c6e7-49e1-a736-547ff66283b8/white-chiavari-chair-rentals-surrey-langley-abbotsford.jpg",
        "White Chiavari chair rentals",
    ),
    "tent": (
        "Tent Rentals",
        "https://images.squarespace-cdn.com/content/v1/6377fe3c61a4ae0a3c0e29fc/"
        "397f8c6b-521c-4be9-9ca1-cfe6a6706e65/Marquee+Tents+Lowermainlad+for+Rent.jpg",
        "Marquee tent rentals",
    ),
    "table": (
        "Table Rentals",
        "https://images.squarespace-cdn.com/content/v1/6377fe3c61a4ae0a3c0e29fc/"
        "7019daee-1743-44b3-afd8-fb5fd311925d/5ft+round+tables.jpg",
        "Round table rentals",
    ),
    "dance-floor": (
        "Dance Floor Rentals",
        "https://images.squarespace-cdn.com/content/v1/6377fe3c61a4ae0a3c0e29fc/"
        "4ea40662-954d-44de-98db-a524d3b842e4/BLACK-AND-WHITE-DANCE-FLOOR-JERRY-HAYES.webp",
        "Black and white dance floor rentals",
    ),
}

STATIC_SCHEMA_TYPE = {
    "rentals.html":       ("CollectionPage", "Browse All Rentals"),
    "tents.html":         ("CollectionPage", "Tent Rentals"),
    "chairs.html":        ("CollectionPage", "Chair Rentals"),
    "tables.html":        ("CollectionPage", "Table Rentals"),
    "dance-floor.html":   ("CollectionPage", "Dance Floor Rentals"),
    "service-areas.html": ("CollectionPage", "Service Areas"),
    "contact.html":       ("ContactPage",    "Contact"),
    "faq.html":           ("FAQPage",        "Frequently Asked Questions"),
    "corporate.html":     ("WebPage",        "Corporate Events"),
    "testimonials.html":  ("WebPage",        "Testimonials"),
}

CITY_NAME_OVERRIDES = {
    "harrison-hot-springs": "Harrison Hot Springs",
    "north-vancouver": "North Vancouver",
    "new-westminster": "New Westminster",
    "maple-ridge": "Maple Ridge",
    "pitt-meadows": "Pitt Meadows",
    "port-moody": "Port Moody",
    "port-kells": "Port Kells",
    "fort-langley": "Fort Langley",
    "white-rock": "White Rock",
    "east-clayton": "East Clayton",
    "east-newton-north": "East Newton North",
    "walnut-grove": "Walnut Grove",
    "langley-township": "Langley Township",
}


def nice_city(slug: str) -> str:
    if slug in CITY_NAME_OVERRIDES:
        return CITY_NAME_OVERRIDES[slug]
    return " ".join(w.capitalize() for w in slug.split("-"))


def classify(fname: str):
    """Return a dict describing the page type."""
    if fname == "index.html":
        return {"kind": "homepage"}

    for prefix, product in [
        ("chair-rentals-", "chair"),
        ("tent-rentals-", "tent"),
        ("tent-rental-", "tent"),
        ("table-rentals-", "table"),
        ("dance-floor-rental-", "dance-floor"),
    ]:
        if fname.startswith(prefix) and fname.endswith(".html"):
            slug = fname[len(prefix): -len(".html")]
            return {"kind": "product_city", "product": product, "slug": slug}

    if fname.endswith("-party-rentals.html"):
        slug = fname[: -len("-party-rentals.html")]
        return {"kind": "small_city", "slug": slug}

    if fname in STATIC_SCHEMA_TYPE:
        return {"kind": "static", "fname": fname}

    return {"kind": "unknown", "fname": fname}


# ---- Title / description extraction ---------------------------------------

_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_DESC_RE = re.compile(
    r'<meta\s+name=["\']description["\']\s+content=["\'](.*?)["\']\s*/?>',
    re.IGNORECASE | re.DOTALL,
)
_HAS_JSONLD = re.compile(
    r'<script\s+type=["\']application/ld\+json["\']',
    re.IGNORECASE,
)
_INSERT_ANCHOR = re.compile(
    r'(<link\s+rel="preconnect"\s+href="https://fonts\.googleapis\.com"\s*/?>)',
    re.IGNORECASE,
)


def extract(tag_re, body, default=""):
    m = tag_re.search(body)
    return html.unescape(m.group(1).strip()) if m else default


# ---- Schema block builders ------------------------------------------------

def business_node(page_url: str, image: str) -> dict:
    return {
        "@type": "LocalBusiness",
        "@id": f"{SITE_URL}/#localbusiness",
        "name": BUSINESS["name"],
        "image": image,
        "logo": BUSINESS["logo"],
        "url": page_url,
        "telephone": BUSINESS["telephone"],
        "email": BUSINESS["email"],
        "priceRange": BUSINESS["price_range"],
        "address": {
            "@type": "PostalAddress",
            "streetAddress": BUSINESS["street"],
            "addressLocality": BUSINESS["locality"],
            "addressRegion": BUSINESS["region"],
            "postalCode": BUSINESS["postal"],
            "addressCountry": BUSINESS["country"],
        },
        "geo": {
            "@type": "GeoCoordinates",
            "latitude": BUSINESS["lat"],
            "longitude": BUSINESS["lng"],
        },
        "openingHoursSpecification": [{
            "@type": "OpeningHoursSpecification",
            "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday",
                          "Friday", "Saturday", "Sunday"],
            "opens": BUSINESS["open"],
            "closes": BUSINESS["close"],
        }],
        "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": f"{BUSINESS['rating']:.1f}",
            "reviewCount": str(BUSINESS["review_count"]),
            "bestRating": "5",
            "worstRating": "1",
        },
        "sameAs": list(BUSINESS["sameAs"]),
    }


def organization_node() -> dict:
    return {
        "@type": "Organization",
        "@id": f"{SITE_URL}/#organization",
        "name": BUSINESS["name"],
        "url": f"{SITE_URL}/",
        "logo": BUSINESS["logo"],
        "sameAs": list(BUSINESS["sameAs"]),
    }


def breadcrumb_node(items) -> dict:
    return {
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": i + 1,
                "name": name,
                "item": url,
            }
            for i, (name, url) in enumerate(items)
        ],
    }


def webpage_node(page_url: str, title: str, description: str,
                 page_type: str = "WebPage") -> dict:
    return {
        "@type": page_type,
        "@id": f"{page_url}#webpage",
        "url": page_url,
        "name": title,
        "description": description,
        "isPartOf": {"@id": f"{SITE_URL}/#website"},
        "about": {"@id": f"{SITE_URL}/#localbusiness"},
        "inLanguage": "en-CA",
    }


def service_node(name: str, description: str, city_name: str = None) -> dict:
    node = {
        "@type": "Service",
        "serviceType": "Party & Event Rental",
        "name": name,
        "description": description,
        "provider": {"@id": f"{SITE_URL}/#localbusiness"},
    }
    if city_name:
        node["areaServed"] = {
            "@type": "City",
            "name": city_name,
            "address": {
                "@type": "PostalAddress",
                "addressLocality": city_name,
                "addressRegion": "BC",
                "addressCountry": "CA",
            },
        }
    return node


# ---- Head block builder ---------------------------------------------------

def esc(s: str) -> str:
    return html.escape(s, quote=True)


def build_head_block(page_url: str, title: str, description: str,
                     image: str, image_alt: str, graph: list) -> str:
    lines = [
        f'<link rel="canonical" href="{esc(page_url)}"/>',
        '<meta name="robots" content="index,follow,max-image-preview:large"/>',
        '<meta name="theme-color" content="#1e4037"/>',
        f'<link rel="alternate" hreflang="en-CA" href="{esc(page_url)}"/>',
        f'<link rel="alternate" hreflang="x-default" href="{esc(page_url)}"/>',
        '',
        '<meta property="og:type" content="website"/>',
        '<meta property="og:locale" content="en_CA"/>',
        '<meta property="og:site_name" content="Forever Party Rentals"/>',
        f'<meta property="og:title" content="{esc(title)}"/>',
        f'<meta property="og:description" content="{esc(description)}"/>',
        f'<meta property="og:url" content="{esc(page_url)}"/>',
        f'<meta property="og:image" content="{esc(image)}"/>',
        f'<meta property="og:image:alt" content="{esc(image_alt)}"/>',
        '',
        '<meta name="twitter:card" content="summary_large_image"/>',
        f'<meta name="twitter:title" content="{esc(title)}"/>',
        f'<meta name="twitter:description" content="{esc(description)}"/>',
        f'<meta name="twitter:image" content="{esc(image)}"/>',
        '',
        '<script type="application/ld+json">',
        json.dumps({"@context": "https://schema.org", "@graph": graph}, indent=2),
        '</script>',
        '',
    ]
    return "\n".join(lines)


# ---- Per-page graph builders ----------------------------------------------

def graph_for_product_city(page_url: str, product: str, city_name: str,
                           title: str, description: str, image: str) -> list:
    product_display = PRODUCT_DEFAULTS[product][0]
    product_hub_slug = {
        "chair": "chairs.html",
        "tent": "tents.html",
        "table": "tables.html",
        "dance-floor": "dance-floor.html",
    }[product]
    return [
        organization_node(),
        business_node(page_url, image),
        webpage_node(page_url, title, description),
        service_node(
            name=f"{product_display} in {city_name}",
            description=description,
            city_name=city_name,
        ),
        breadcrumb_node([
            ("Home", f"{SITE_URL}/"),
            (product_display, f"{SITE_URL}/{product_hub_slug}"),
            (f"{city_name} {product_display}", page_url),
        ]),
    ]


def graph_for_small_city(page_url: str, city_name: str,
                         title: str, description: str, image: str) -> list:
    return [
        organization_node(),
        business_node(page_url, image),
        webpage_node(page_url, title, description),
        service_node(
            name=f"Party Rentals in {city_name}",
            description=description,
            city_name=city_name,
        ),
        breadcrumb_node([
            ("Home", f"{SITE_URL}/"),
            ("Service Areas", f"{SITE_URL}/service-areas.html"),
            (f"{city_name} Party Rentals", page_url),
        ]),
    ]


def graph_for_static(page_url: str, fname: str,
                     title: str, description: str, image: str) -> list:
    page_type, display = STATIC_SCHEMA_TYPE[fname]
    graph = [
        organization_node(),
        business_node(page_url, image),
        webpage_node(page_url, title, description, page_type=page_type),
        breadcrumb_node([
            ("Home", f"{SITE_URL}/"),
            (display, page_url),
        ]),
    ]
    # Category product hubs also advertise a Service
    if fname in ("tents.html", "chairs.html", "tables.html", "dance-floor.html"):
        product = {
            "tents.html": "tent",
            "chairs.html": "chair",
            "tables.html": "table",
            "dance-floor.html": "dance-floor",
        }[fname]
        graph.append(service_node(
            name=PRODUCT_DEFAULTS[product][0],
            description=description,
        ))
    return graph


# ---- Main apply -----------------------------------------------------------

def apply_to_file(path: Path) -> str:
    body = path.read_text(encoding="utf-8")

    if _HAS_JSONLD.search(body):
        return "skip (already has JSON-LD)"

    cls = classify(path.name)
    if cls["kind"] == "unknown":
        return f"skip (unknown page type: {path.name})"

    title = extract(_TITLE_RE, body, default=BUSINESS["name"])
    description = extract(_DESC_RE, body, default="")
    page_url = f"{SITE_URL}/{path.name}"

    if cls["kind"] == "product_city":
        product = cls["product"]
        city_name = nice_city(cls["slug"])
        _, image, alt_prefix = PRODUCT_DEFAULTS[product]
        image_alt = f"{alt_prefix} in {city_name}, BC"
        graph = graph_for_product_city(
            page_url, product, city_name, title, description, image,
        )
    elif cls["kind"] == "small_city":
        city_name = nice_city(cls["slug"])
        image = BUSINESS["default_image"]
        image_alt = f"Party rentals in {city_name}, BC"
        graph = graph_for_small_city(
            page_url, city_name, title, description, image,
        )
    elif cls["kind"] == "static":
        fname = cls["fname"]
        image = BUSINESS["default_image"]
        image_alt = f"Forever Party Rentals — {STATIC_SCHEMA_TYPE[fname][1]}"
        graph = graph_for_static(
            page_url, fname, title, description, image,
        )
    else:
        return f"skip (classify returned {cls['kind']})"

    block = build_head_block(page_url, title, description,
                             image, image_alt, graph)

    m = _INSERT_ANCHOR.search(body)
    if not m:
        return f"skip (no insertion anchor in {path.name})"

    # Use string slicing instead of re.sub to avoid backslash-escape issues
    # when the injected block contains JSON (\uXXXX sequences etc.).
    new_body = body[: m.start()] + block + body[m.start():]
    return new_body


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    changed, skipped = 0, 0
    for p in sorted(SITE_DIR.glob("*.html")):
        result = apply_to_file(p)
        if isinstance(result, str) and result.startswith("skip"):
            print(f"  {p.name:50s}  {result}")
            skipped += 1
        else:
            changed += 1
            if args.dry_run:
                print(f"  {p.name:50s}  WOULD REWRITE")
            else:
                p.write_text(result, encoding="utf-8")
                print(f"  {p.name:50s}  rewrote")

    print(f"\nDone: rewrote {changed}, skipped {skipped}.")


if __name__ == "__main__":
    main()
