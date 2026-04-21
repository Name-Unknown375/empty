#!/usr/bin/env python3
"""
Forever Party Rentals — verify generated city pages.

Plan file: /root/.claude/plans/we-continuous-run-into-precious-garden.md

Checks every `project/site/<slug>-party-rentals.html` file for:
  1. Zero unfilled Jinja2 `{{ }}` tokens
  2. All four JSON-LD blocks parse as valid JSON
  3. Canonical, Open Graph, and Twitter tags are present
  4. Minimum structural markers (H1, FAQ items, testimonials, section count)

Exits 0 on all green, 1 on any failure. Output is human-readable.

Usage:
    python3 verify.py                # check all cities in city_data.json
    python3 verify.py --slugs a,b    # spot-check only a and b
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent
DATA_FILE = HERE / "city_data.json"

LD_JSON_RE = re.compile(
    r'<script\s+type="application/ld\+json"\s*>\s*(.*?)\s*</script>',
    re.DOTALL,
)

EXPECTED_LD_TYPES = {"LocalBusiness", "Service", "FAQPage", "BreadcrumbList"}


def check_page(path: Path) -> list[str]:
    """Return a list of problems found in the page (empty = all good)."""
    problems: list[str] = []
    html = path.read_text(encoding="utf-8")

    # 1. No unfilled Jinja2 tokens
    unfilled = re.findall(r"\{\{.*?\}\}", html)
    if unfilled:
        problems.append(f"unfilled tokens: {unfilled[:3]}")

    # 2. Parse every JSON-LD block
    blocks = LD_JSON_RE.findall(html)
    if len(blocks) != 4:
        problems.append(f"expected 4 JSON-LD blocks, found {len(blocks)}")

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

    missing_types = EXPECTED_LD_TYPES - types_found
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", type=str, help="comma-separated slugs to check")
    args = ap.parse_args()

    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)

    all_slugs = list(data["cities"].keys())
    if args.slugs:
        slugs = [s.strip() for s in args.slugs.split(",")]
        bad = [s for s in slugs if s not in all_slugs]
        if bad:
            sys.exit(f"Unknown slug(s): {bad}")
    else:
        slugs = all_slugs

    total_problems = 0
    print(f"Verifying {len(slugs)} page(s)...\n")
    for slug in slugs:
        path = SITE_DIR / f"{slug}-party-rentals.html"
        if not path.exists():
            print(f"  [MISSING] {path}")
            total_problems += 1
            continue
        problems = check_page(path)
        if problems:
            total_problems += len(problems)
            print(f"  [FAIL] {slug}")
            for p in problems:
                print(f"         - {p}")
        else:
            print(f"  [OK]   {slug}")

    print()
    if total_problems == 0:
        print(f"SUCCESS — {len(slugs)}/{len(slugs)} pages valid.")
        return 0
    print(f"FAILED — {total_problems} issue(s) across pages.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
