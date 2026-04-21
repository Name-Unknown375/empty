#!/usr/bin/env python3
"""
Generate sitemap.xml for Forever Party Rentals.

Walks the parent site/ directory, classifies each .html page into a tier, and
writes `../sitemap.xml` with per-URL priority / changefreq / lastmod values.

Usage:
    python3 generate_sitemap.py
"""

import datetime as dt
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent
SITE_URL = "https://foreverpartyrentals.com"

# Pages that should not appear in the sitemap (thin utility pages that offer no
# search-intent value). We still leave them crawlable — just not surfaced.
EXCLUDE = {"checkout.html"}

# Explicit priority overrides by filename → (priority, changefreq)
STATIC_PRIORITIES = {
    "index.html":         (1.0, "weekly"),
    "rentals.html":       (0.9, "weekly"),
    "tents.html":         (0.8, "monthly"),
    "chairs.html":        (0.8, "monthly"),
    "tables.html":        (0.8, "monthly"),
    "dance-floor.html":   (0.8, "monthly"),
    "service-areas.html": (0.7, "monthly"),
    "contact.html":       (0.5, "yearly"),
    "faq.html":           (0.5, "yearly"),
    "corporate.html":     (0.6, "yearly"),
    "testimonials.html":  (0.5, "yearly"),
}


def classify(fname: str):
    """Return (priority, changefreq) for a given html filename."""
    if fname in STATIC_PRIORITIES:
        return STATIC_PRIORITIES[fname]
    if fname.endswith("-party-rentals.html"):
        return (0.9, "weekly")  # city pages — highest value
    if (
        fname.startswith("chair-rentals-")
        or fname.startswith("tent-rental-")
        or fname.startswith("tent-rentals-")
        or fname.startswith("table-rentals-")
        or fname.startswith("dance-floor-rental-")
    ):
        return (0.7, "monthly")  # product + city combos
    return (0.5, "monthly")


def file_lastmod(path: Path) -> str:
    """ISO-8601 UTC timestamp for a file's mtime."""
    ts = dt.datetime.fromtimestamp(path.stat().st_mtime, tz=dt.timezone.utc)
    return ts.strftime("%Y-%m-%dT%H:%M:%S+00:00")


def main():
    pages = sorted(
        p for p in SITE_DIR.glob("*.html")
        if p.name not in EXCLUDE
    )

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ]

    for p in pages:
        priority, changefreq = classify(p.name)
        loc = f"{SITE_URL}/{p.name}"
        lastmod = file_lastmod(p)
        lines.extend([
            "  <url>",
            f"    <loc>{escape(loc)}</loc>",
            f"    <lastmod>{lastmod}</lastmod>",
            f"    <changefreq>{changefreq}</changefreq>",
            f"    <priority>{priority:.1f}</priority>",
            '    <xhtml:link rel="alternate" hreflang="en-CA" '
            f'href="{escape(loc)}" />',
            '    <xhtml:link rel="alternate" hreflang="x-default" '
            f'href="{escape(loc)}" />',
            "  </url>",
        ])

    lines.append("</urlset>")

    out = SITE_DIR / "sitemap.xml"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {out} with {len(pages)} URLs.")


if __name__ == "__main__":
    main()
