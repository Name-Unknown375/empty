#!/usr/bin/env python3
"""One-off: flip city-led leading phrasing → product-led in product overrides.

Reads each _build/overrides/products/*.md, finds leading "{City} {product words} rentals"
in title, meta_description, hero_subtitle frontmatter fields and rewrites to
"{Product words} rentals in {City}" — capitalising the first letter so the line
still starts with a capital.

Skips lines that don't start with the city name (e.g. tent-rentals-surrey's
hero_subtitle starts with "From ...", left alone).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OVR = HERE / "overrides" / "products"

CITY_NAMES = {
    "abbotsford": "Abbotsford", "burnaby": "Burnaby", "coquitlam": "Coquitlam",
    "delta": "Delta", "langley": "Langley", "maple-ridge": "Maple Ridge",
    "new-westminster": "New Westminster", "north-vancouver": "North Vancouver",
    "port-moody": "Port Moody", "richmond": "Richmond", "surrey": "Surrey",
    "vancouver": "Vancouver", "white-rock": "White Rock",
}

FIELDS = ("title", "meta_description", "hero_subtitle")


def city_from_filename(stem: str) -> str | None:
    for slug in sorted(CITY_NAMES, key=len, reverse=True):
        if stem.endswith("-" + slug):
            return CITY_NAMES[slug]
    return None


def flip_value(value: str, city: str) -> tuple[str, bool]:
    """If value starts with '{city} ... rentals' rewrite to 'Rentals ... in {city}'."""
    if not value.startswith(city + " "):
        return value, False
    rest = value[len(city) + 1:]
    # Match the leading product phrase ending in 'rentals' (case-insensitive).
    m = re.match(r"^([^.,—]*?\brentals\b)", rest, flags=re.IGNORECASE)
    if not m:
        return value, False
    product_words = m.group(1)
    remainder = rest[len(product_words):]
    flipped_product = product_words[0].upper() + product_words[1:]
    return f"{flipped_product} in {city}{remainder}", True


def process_file(path: Path) -> tuple[int, list[str]]:
    city = city_from_filename(path.stem)
    if not city:
        return 0, [f"skip (no city match): {path.name}"]
    text = path.read_text(encoding="utf-8")
    msgs = []
    changes = 0
    for field in FIELDS:
        pattern = re.compile(rf'^({field}): "(.*?)"$', re.MULTILINE)
        def repl(match):
            nonlocal changes
            prefix, val = match.group(1), match.group(2)
            new_val, changed = flip_value(val, city)
            if changed:
                changes += 1
                msgs.append(f"  {field}: {val[:60]}... → {new_val[:60]}...")
            return f'{prefix}: "{new_val}"'
        text = pattern.sub(repl, text)
    if changes:
        path.write_text(text, encoding="utf-8")
    return changes, msgs


def main():
    total = 0
    for f in sorted(OVR.glob("*.md")):
        n, msgs = process_file(f)
        if n:
            print(f"::: {f.name} — {n} change(s) :::")
            for m in msgs:
                print(m)
            total += n
    print(f"\nDone — {total} field(s) flipped across overrides.")


if __name__ == "__main__":
    main()
