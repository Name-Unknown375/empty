#!/usr/bin/env python3
"""Canonical page taxonomy — the one place a page's *class* is decided.

    python3 _build/page_class.py        # → {"<url path>": "<class>", …} as JSON

Every page on this site belongs to exactly one of ten classes, derived from
the filename conventions the generators use. Two consumers depend on this
agreeing with itself:

  * `_build/check_schema.py` — required JSON-LD @types per class.
  * `site/shared.js` — `classifyPage()` sets the Clarity `page_class` tag, so
    300 programmatic pages collapse into filterable buckets in session replay.

The second one is a PORT, in a different language, derived from the URL rather
than the filename. That is a drift risk, so `_build/tests/clarity_tagging_test.mjs`
runs both over every page and fails on any disagreement. The `dump()` below is
what it compares against. **If you add a page family, change it here and in
shared.js in the same commit.**

RULE ORDER IS LOAD-BEARING. Three cases depend on it:
  * `-party-rentals.html` is tested before HUB_PAGES, so
    `birthday-party-rentals.html` is a `city` page despite being listed as a hub.
  * `product-` beats the product-city prefixes, so
    `product-marquee-tent-20x30.html` is `sku`, not `product-city`.
  * `christmas-lights-<city>.html` is `christmas`, while bare
    `christmas-lights.html` (no trailing hyphen) falls through to `hub`.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from urlpath import url_path

# ---------------------------------------------------------------------------
# Page classification (filename conventions used by the generators)
# ---------------------------------------------------------------------------

PRODUCT_CITY_PREFIXES = (
    "tent-rental-", "tent-rentals-", "chair-rentals-", "table-rentals-",
    "dance-floor-rental-", "projector-rental-", "battery-power-station-rental-",
    "starlink-rental-",
)

HUB_PAGES = {
    "tents.html", "chairs.html", "tables.html", "dance-floor.html", "rentals.html",
    "wedding-rentals.html", "event-rentals.html", "birthday-party-rentals.html",
    "corporate.html", "projector-rentals.html", "starlink-rentals.html",
    "battery-power-stations.html", "carnival-games.html", "christmas-lights.html",
    "packages.html", "christmas-light-installation-lower-mainland.html",
    "marquee-tent-rental-lowermainland-surrey-langley-vancouver.html",
}

# Every value classify() can return. The parity test asserts all ten appear in
# dump(), so a classifier that collapsed to "other" cannot pass silently.
CLASSES = (
    "homepage", "city", "product-city", "sku", "package", "hub", "christmas",
    "blog-post", "blog-hub", "other",
)


def classify(p: Path) -> str:
    n = p.name
    if p.parent.name == "blog":
        return "blog-hub" if n == "index.html" else "blog-post"
    if n == "index.html":
        return "homepage"
    if n.endswith("-party-rentals.html"):
        return "city"
    if n.startswith("product-"):
        return "sku"
    if n.startswith("carnival-games-bundle"):
        return "sku"
    if n.startswith(PRODUCT_CITY_PREFIXES):
        return "product-city"
    if n.startswith("christmas-lights-"):
        return "christmas"
    if re.match(r"(wedding|backyard|corporate)-package-", n):
        return "package"
    if n in HUB_PAGES:
        return "hub"
    return "other"


def dump(site: Path) -> dict[str, str]:
    """{public URL path: class} for every page in the taxonomy.

    Keys are the URLs a browser actually sees, since the JS side classifies
    `location.pathname`. URL mapping reuses urlpath.url_path() rather than
    reimplementing pretty-URL rules — that would just be a third place to drift.
    """
    out: dict[str, str] = {}
    for p in sorted(site.glob("*.html")):
        out[url_path(p.name)] = classify(p)
    for p in sorted((site / "blog").glob("*.html")):
        # url_path() maps index.html → "/", so the blog prefix is applied here
        # (the same split the generators use).
        out["/blog/" if p.name == "index.html" else f"/blog/{p.stem}"] = classify(p)
    return out


if __name__ == "__main__":
    site = Path(__file__).resolve().parent.parent / "site"
    json.dump(dump(site), sys.stdout)
