#!/usr/bin/env python3
"""
Forever Party Rentals — sitemap.xml generator.

Walks the parent site/ directory, enumerates every user-facing .html file
(skipping checkout.html + internal build artifacts), and writes sitemap.xml
with <loc>, <lastmod>, <changefreq>, and <priority> for each URL.

Priority heuristic:
  1.0  homepage (index.html)
  0.9  top-level category pages (tents/chairs/tables/dance-floor/rentals)
  0.9  tier-1 city pages (surrey/langley/vancouver/burnaby/richmond …)
  0.8  other city pages, product-per-city pages
  0.7  service-areas / faq / testimonials / contact / corporate
  0.4  checkout (excluded by default — transactional dead-end)

Usage:
    python3 generate_sitemap.py          # writes ../sitemap.xml
    python3 generate_sitemap.py --out /tmp/sm.xml
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent / "site"
CITY_DATA_FILE = HERE / "city_data.json"
PRODUCT_DATA_FILE = HERE / "products.json"

SITE_URL = "https://foreverpartyrentals.com"

# Files we don't want in the sitemap
EXCLUDED = {
    "checkout.html",          # transactional dead-end
    "404.html",               # error page — not a destination
    "testimonials.html",      # noindex — consolidated into reviews.html
}

# Top-level product/category + key commercial pages
TOP_CATEGORY_PAGES = {"tents.html", "chairs.html", "tables.html", "dance-floor.html", "rentals.html"}

# Informational / trust pages — indexable but lower priority
INFO_PAGES = {
    "service-areas.html", "faq.html", "reviews.html",
    "contact.html", "corporate.html",
}


def priority_and_freq(path: Path, tier_map: dict[str, int]) -> tuple[float, str]:
    """Return (priority, changefreq) for a given page path."""
    filename = path.name

    # Blog index and articles
    if path.parent == SITE_DIR / "blog":
        return (0.7, "weekly") if filename == "index.html" else (0.6, "monthly")

    if filename == "index.html":
        return 1.0, "weekly"
    if filename in TOP_CATEGORY_PAGES:
        return 0.9, "weekly"
    if filename in INFO_PAGES:
        return 0.7, "monthly"

    # Individual SKU product pages: product-<slug>.html
    if filename.startswith("product-") and filename.endswith(".html"):
        return 0.85, "weekly"

    # city pages: <slug>-party-rentals.html
    if filename.endswith("-party-rentals.html"):
        slug = filename[:-len("-party-rentals.html")]
        tier = tier_map.get(slug, 3)
        return (0.9 if tier == 1 else 0.8), "weekly"

    # product-per-city pages: tent-rental-<slug>.html etc.
    return 0.8, "weekly"


def collect_files() -> list[Path]:
    """Return sorted list of *.html in SITE_DIR and SITE_DIR/blog/, excluding EXCLUDED."""
    allowed_parents = {SITE_DIR, SITE_DIR / "blog"}
    files = [
        p for p in SITE_DIR.rglob("*.html")
        if p.parent in allowed_parents
        and p.name not in EXCLUDED
        and not p.name.startswith("_")
    ]
    # Root pages first, then blog pages, both sorted alphabetically
    return sorted(files, key=lambda p: (p.parent != SITE_DIR, p.name))


def load_tier_map() -> dict[str, int]:
    with open(CITY_DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)
    return {slug: city.get("tier", 3) for slug, city in data["cities"].items()}


def url_for(path: Path) -> str:
    """Map local filename to public URL. index.html → site root."""
    if path.parent == SITE_DIR / "blog":
        return (f"{SITE_URL}/blog/" if path.name == "index.html"
                else f"{SITE_URL}/blog/{path.name}")
    if path.name == "index.html":
        return f"{SITE_URL}/"
    return f"{SITE_URL}/{path.name}"


def lastmod_for(path: Path) -> str:
    """Prefer the `<!-- lastmod: ... -->` marker emitted by the generators;
    fall back to filesystem mtime."""
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
        marker = "<!-- lastmod: "
        i = text.rfind(marker)
        if i >= 0:
            end = text.find(" -->", i)
            if end > i:
                return text[i + len(marker):end].strip()
    except OSError:
        pass
    ts = dt.datetime.utcfromtimestamp(path.stat().st_mtime)
    return ts.strftime("%Y-%m-%dT%H:%M:%SZ")


def build_sitemap(tier_map: dict[str, int]) -> str:
    files = collect_files()
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for path in files:
        loc = escape(url_for(path))
        lastmod = lastmod_for(path)
        priority, changefreq = priority_and_freq(path, tier_map)
        lines.append("  <url>")
        lines.append(f"    <loc>{loc}</loc>")
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append(f"    <changefreq>{changefreq}</changefreq>")
        lines.append(f"    <priority>{priority:.1f}</priority>")
        lines.append("  </url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(SITE_DIR / "sitemap.xml"),
                    help="Output path (default: ../sitemap.xml)")
    args = ap.parse_args()

    tier_map = load_tier_map()
    xml = build_sitemap(tier_map)
    out = Path(args.out)
    out.write_text(xml, encoding="utf-8")

    url_count = xml.count("<url>")
    print(f"  wrote {out}  ({url_count} URLs, {len(xml):,} bytes)")


if __name__ == "__main__":
    main()
