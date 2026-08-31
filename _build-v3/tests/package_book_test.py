#!/usr/bin/env python3
"""Every event × size × tier cart has Adelie ids; Garden Premium uses the combo.

    python3 _build-v3/tests/package_book_test.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BUILD = HERE.parent
sys.path.insert(0, str(BUILD))

from generate_package_pages import (  # noqa: E402
    attach_cart,
    compute_tier,
    load_adelie_map,
    load_data,
)

COMBO_ID = "xzFDs0DrIYdzyG0PEP9F"
COMBO_KEY = "cocktail-table-spandex"
COCKTAIL_ID = "uFSpLEibsBA8wLmpcaol"

results: list[tuple[bool, str]] = []


def ok(name: str, cond: bool) -> None:
    results.append((bool(cond), name))


def main() -> int:
    pkg, skus = load_data()
    adelie_map = load_adelie_map()
    combo = pkg["cocktailSpandexCombo"]
    ok("couponCode is bundle10", pkg.get("couponCode") == "bundle10")
    ok("combo adelieId matches checkout product", combo["adelieId"] == COMBO_ID)
    ok("combo key is cocktail-table-spandex", combo["key"] == COMBO_KEY)
    ok("combo price is 30", combo["priceCAD"] == 30)
    ok("sku map has cocktail-table-spandex", adelie_map.get(COMBO_KEY) == COMBO_ID)

    for slug, event in pkg["eventTypes"].items():
        for size in pkg["sizes"]:
            for tier in pkg["tiers"]:
                card = compute_tier(event, size, tier, pkg, skus)
                attach_cart(card, adelie_map, event_slug=slug, size=size)
                keys = [r["key"] for r in card["rows"]]
                ids = [r["adelie_id"] for r in card["rows"]]
                label = f"{slug}/{size}/{tier['slug']}"
                ok(f"{label} every row has adelie_id", all(isinstance(i, str) and i for i in ids))
                ok(f"{label} cart non-empty", bool(card["cart"]))
                ok(
                    f"{label} no bare spandex cover",
                    "cocktail-spandex-cover" not in keys,
                )
                cart = json.loads(card["cart_json"])
                ok(f"{label} cart_json matches cart", cart == card["cart"])

                if tier["slug"] == "garden-premium":
                    n = pkg["premiumCocktailCountBySize"][str(size)]
                    ok(
                        f"{label} has combo line",
                        keys.count(COMBO_KEY) == 1,
                    )
                    combo_row = next(r for r in card["rows"] if r["key"] == COMBO_KEY)
                    ok(f"{label} combo qty {n}", combo_row["qty"] == n)
                    ok(f"{label} combo id", combo_row["adelie_id"] == COMBO_ID)
                    ok(f"{label} cart qty for combo", card["cart"].get(COMBO_ID) == n)
                    ok(
                        f"{label} no bare cocktail-table line",
                        "cocktail-table" not in keys,
                    )
                elif slug == "corporate" and tier["id"] in (1, 2):
                    ok(
                        f"{label} networking highboys are bare cocktail tables",
                        "cocktail-table" in keys and COMBO_KEY not in keys,
                    )
                    ok(
                        f"{label} cocktail id is not combo",
                        card["cart"].get(COCKTAIL_ID, 0) > 0 and COMBO_ID not in card["cart"],
                    )

    tpl = (BUILD / "package_template.html").read_text(encoding="utf-8")
    ok("template hero Book this package targets #pkg-book", "hero_book_href = '#pkg-book'" in tpl)
    ok("template keeps #pkg-book date target", 'id="pkg-book"' in tpl)

    site = BUILD.parent / "site-v3"
    pages = sorted(site.glob("*-package-*-guests.html"))
    ok("nine generated package pages exist", len(pages) == 9)
    for path in pages:
        html = path.read_text(encoding="utf-8")
        ok(
            f"{path.name} Book this package → #pkg-book",
            'href="#pkg-book" class="btn btn-gold">Book this package</a>' in html,
        )
        ok(f"{path.name} has #pkg-book target", 'id="pkg-book"' in html)
        ok(f"{path.name} loads package-book.js", "/package-book.js?v=3" in html)

    failed = [name for pass_, name in results if not pass_]
    for pass_, name in results:
        print(f"  {'ok  ' if pass_ else 'FAIL'} {name}")
    if failed:
        print(f"\nFAILED — {len(failed)}/{len(results)}")
        return 1
    print(f"\nSUCCESS — {len(results)} checks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
