#!/usr/bin/env python3
"""
Forever Party Rentals — verify generated pages.

Covers both Phase 2 (party-rentals city pages) and Phase 3 (product-per-city
pages: tent / chair / table / dance-floor).

Checks every target HTML file for:
  1. Zero unfilled Jinja2 `{{ }}` tokens
  2. All four JSON-LD blocks parse as valid JSON
  3. Canonical, Open Graph, and Twitter tags are present
  4. Minimum structural markers (H1, FAQ items, testimonials)

Exits 0 on all green, 1 on any failure. Output is human-readable.

Usage:
    python3 verify.py                           # all city pages (party-rentals)
    python3 verify.py --all                     # Phase 2 + Phase 3 (all pages)
    python3 verify.py --products                # Phase 3 product pages only
    python3 verify.py --products tent,chair     # restricted product subset
    python3 verify.py --slugs surrey,langley    # spot-check cities
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent / "site"
CITY_DATA_FILE = HERE / "city_data.json"
PRODUCT_DATA_FILE = HERE / "products.json"

LD_JSON_RE = re.compile(
    r'<script\s+type="application/ld\+json"\s*>\s*(.*?)\s*</script>',
    re.DOTALL,
)

EXPECTED_LD_TYPES = {"LocalBusiness", "Service", "FAQPage", "BreadcrumbList"}
# SKU (product-<slug>.html) pages ship a different JSON-LD stack:
# Product + Offer, LocalBusiness, BreadcrumbList. No Service or FAQPage.
EXPECTED_LD_TYPES_SKU = {"Product", "LocalBusiness", "BreadcrumbList"}


def check_page(path: Path) -> list[str]:
    """Return a list of problems found in the page (empty = all good)."""
    problems: list[str] = []
    html = path.read_text(encoding="utf-8")
    is_sku = path.name.startswith("product-") and path.name != "product-pages.html"

    # 1. No unfilled Jinja2 tokens
    unfilled = re.findall(r"\{\{.*?\}\}", html)
    if unfilled:
        problems.append(f"unfilled tokens: {unfilled[:3]}")

    # 2. Parse every JSON-LD block
    blocks = LD_JSON_RE.findall(html)
    # SKU pages: exactly 3 (Product, LocalBusiness, BreadcrumbList).
    # City & product-city pages: >=4 base + optional ItemList (Review list, Sprint 5.14).
    if is_sku:
        if len(blocks) != 3:
            problems.append(f"expected 3 JSON-LD blocks, found {len(blocks)}")
    else:
        if len(blocks) < 4:
            problems.append(f"expected >=4 JSON-LD blocks, found {len(blocks)}")

    types_found: set[str] = set()
    for i, raw in enumerate(blocks, 1):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as e:
            problems.append(f"JSON-LD #{i} parse error: {e.msg} at line {e.lineno}")
            continue
        t = parsed.get("@type")
        if t:
            types_found.add(t)

    expected_types = EXPECTED_LD_TYPES_SKU if is_sku else EXPECTED_LD_TYPES
    missing_types = expected_types - types_found
    if missing_types:
        problems.append(f"missing @type: {sorted(missing_types)}")

    # 3. Required meta tags
    required_patterns = {
        "canonical": r'<link rel="canonical"',
        "og:title": r'property="og:title"',
        "og:description": r'property="og:description"',
        "og:image": r'property="og:image"',
        "twitter:card": r'name="twitter:card"',
        "hreflang": r'hreflang="en-CA"',
    }
    for label, pat in required_patterns.items():
        if not re.search(pat, html):
            problems.append(f"missing {label}")

    # 4. Structural markers
    h1_count = html.count("<h1>")
    if h1_count != 1:
        problems.append(f"expected 1 <h1>, found {h1_count}")
    faq_count = html.count('class="faq-item"')
    if faq_count < 4:
        problems.append(f"fewer than 4 FAQ items ({faq_count})")
    tc_count = html.count("testimonial-card")
    if tc_count != 4:
        problems.append(f"expected 4 testimonial-cards, found {tc_count}")

    return problems


def product_filename(product: dict, city_slug: str) -> str:
    overrides = product.get("urlPrefixOverrides", {}) or {}
    prefix = overrides.get(city_slug, product["urlPrefix"])
    return f"{prefix}-{city_slug}.html"


def build_targets(
    city_slugs: list[str],
    product_keys: list[str],
    city_data: dict,
    product_data: dict,
    include_party: bool,
) -> list[tuple[str, Path]]:
    """Return [(label, path), ...] tuples in a stable order."""
    targets: list[tuple[str, Path]] = []

    if include_party:
        for slug in city_slugs:
            label = f"{slug}-party-rentals"
            targets.append((label, SITE_DIR / f"{slug}-party-rentals.html"))

    for product_key in product_keys:
        product = product_data["products"][product_key]
        for slug in city_slugs:
            fn = product_filename(product, slug)
            label = fn[:-5]  # strip .html
            targets.append((label, SITE_DIR / fn))

    return targets


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", type=str, help="comma-separated city slugs to check")
    ap.add_argument(
        "--products",
        nargs="?",
        const="__all__",
        default=None,
        help="verify product pages (optional comma-separated product keys)",
    )
    ap.add_argument(
        "--all",
        action="store_true",
        help="verify both Phase 2 party-rentals pages AND all Phase 3 product pages",
    )
    args = ap.parse_args()

    with open(CITY_DATA_FILE, encoding="utf-8") as f:
        city_data = json.load(f)
    with open(PRODUCT_DATA_FILE, encoding="utf-8") as f:
        product_data = json.load(f)

    all_city_slugs = list(city_data["cities"].keys())
    all_product_keys = list(product_data["products"].keys())

    # Cities
    if args.slugs:
        slugs = [s.strip() for s in args.slugs.split(",")]
        bad = [s for s in slugs if s not in all_city_slugs]
        if bad:
            sys.exit(f"Unknown city slug(s): {bad}")
    else:
        slugs = all_city_slugs

    # Products
    if args.products == "__all__":
        product_keys = all_product_keys
    elif args.products:
        product_keys = [p.strip() for p in args.products.split(",")]
        bad = [p for p in product_keys if p not in all_product_keys]
        if bad:
            sys.exit(f"Unknown product key(s): {bad}")
    else:
        product_keys = []

    # What to include
    if args.all:
        include_party = True
        product_keys = all_product_keys
    elif args.products is not None:
        # --products given → verify products only (party-rentals skipped)
        include_party = False
    else:
        include_party = True

    targets = build_targets(slugs, product_keys, city_data, product_data, include_party)

    total_problems = 0
    print(f"Verifying {len(targets)} page(s)...\n")
    for label, path in targets:
        if not path.exists():
            print(f"  [MISSING] {path.name}")
            total_problems += 1
            continue
        problems = check_page(path)
        if problems:
            total_problems += len(problems)
            print(f"  [FAIL] {label}")
            for p in problems:
                print(f"         - {p}")
        else:
            print(f"  [OK]   {label}")

    print()
    if total_problems == 0:
        print(f"SUCCESS — {len(targets)}/{len(targets)} pages valid.")
        return 0
    print(f"FAILED — {total_problems} issue(s) across pages.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
