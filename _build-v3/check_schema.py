#!/usr/bin/env python3
"""Sitewide JSON-LD schema guard.

Run after any build step (same spirit as check_links.py):

    python3 _build/check_schema.py

Enforces, for every page in site/ (and site/blog/):

  1. Every <script type="application/ld+json"> block parses as JSON.
  2. Every INDEXABLE page carries at least one JSON-LD block — new pages
     cannot ship without schema. (Pages whose robots meta contains
     "noindex" are exempt: 404, thank-you, checkout, widget-test,
     planner-embed, blog/_template, …)
  3. Per-page-class required types (see RULES below).
  4. Policy invariants (Google self-serving review policy — the thing that
     collapsed our stars in May 2026 and got re-fixed in June):
       - NO `Review` type anywhere on the site.
       - `aggregateRating` ONLY inside the homepage LocalBusiness.
  5. Any full LocalBusiness block must match site_constants.json for
     telephone and geo (catches copy-paste drift like the marquee page's
     5.9 km geo offset found in the 2026-06-18 audit).

Exit code 0 = clean, 1 = violations (print one line each).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE = HERE.parent / "site-v3"

BLOCK_RE = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S | re.I)
ROBOTS_RE = re.compile(r'<meta name="robots" content="([^"]*)"', re.I)

# Page classification lives in page_class.py — shared with the Clarity
# `page_class` tag in site/shared.js, which ports the same taxonomy to JS.
# _build/tests/clarity_tagging_test.mjs pins the two together.
from page_class import classify  # noqa: E402

# Required @types per class. Tuples = alternatives (any one satisfies).
RULES: dict[str, list] = {
    "homepage":     ["LocalBusiness", "Organization", "WebSite", "BreadcrumbList"],
    "city":         ["BreadcrumbList", "FAQPage", "Service"],
    "product-city": ["BreadcrumbList", "FAQPage", "Service"],
    "christmas":    ["BreadcrumbList", "FAQPage", "Service"],
    "sku":          ["BreadcrumbList", "Product"],
    "package":      ["BreadcrumbList", "FAQPage", ("Product", "ItemList")],
    "hub":          ["BreadcrumbList", ("Service", "ItemList")],
    "blog-post":    ["BreadcrumbList", ("Article", "BlogPosting")],
    "blog-hub":     ["BreadcrumbList", ("Blog", "CollectionPage")],
    "other":        ["BreadcrumbList"],
}


def top_types(obj) -> set[str]:
    """Top-level @type(s) of a block, including @graph members."""
    out: set[str] = set()

    def add(o):
        if isinstance(o, dict):
            t = o.get("@type")
            if isinstance(t, str):
                out.add(t)
            elif isinstance(t, list):
                out.update(x for x in t if isinstance(x, str))

    add(obj)
    if isinstance(obj, dict):
        for g in obj.get("@graph", []) or []:
            add(g)
    return out


def deep_find(obj, pred, path="$"):
    """Yield paths where pred(dict) is true, anywhere in the structure."""
    if isinstance(obj, dict):
        if pred(obj):
            yield path
        for k, v in obj.items():
            yield from deep_find(v, pred, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from deep_find(v, pred, f"{path}[{i}]")


def main() -> int:
    constants = json.loads((HERE / "site_constants.json").read_text())
    want_geo = constants.get("geo", {})
    want_lat, want_lng = want_geo.get("lat"), want_geo.get("lng")
    want_phone_digits = re.sub(r"\D", "", constants.get("phone", ""))

    failures: list[str] = []
    pages = sorted(SITE.glob("*.html")) + sorted((SITE / "blog").glob("*.html"))
    n_indexable = 0

    for p in pages:
        rel = p.relative_to(SITE)
        html = p.read_text(errors="ignore")

        robots = ROBOTS_RE.search(html)
        noindex = bool(robots and "noindex" in robots.group(1).lower())
        if noindex:
            continue  # exempt from schema requirements
        n_indexable += 1

        cls = classify(p)
        types: set[str] = set()
        blocks = BLOCK_RE.findall(html)

        for i, b in enumerate(blocks):
            try:
                obj = json.loads(b)
            except json.JSONDecodeError as e:
                failures.append(f"{rel}: JSON-LD block {i+1} does not parse ({e.msg})")
                continue

            types |= top_types(obj)

            # Policy: no Review type anywhere.
            for path in deep_find(obj, lambda o: o.get("@type") == "Review"):
                failures.append(f"{rel}: forbidden Review schema at {path} "
                                f"(self-serving reviews — see 2026-06 policy fixes)")

            # Policy: aggregateRating only inside homepage LocalBusiness.
            for path in deep_find(obj, lambda o: "aggregateRating" in o):
                if not (cls == "homepage" and obj.get("@type") == "LocalBusiness"):
                    failures.append(f"{rel}: forbidden aggregateRating at {path} "
                                    f"(allowed only on homepage LocalBusiness)")

            # Consistency: full LocalBusiness blocks must match site constants.
            for _ in deep_find(obj, lambda o: o.get("@type") == "LocalBusiness"
                               and ("geo" in o or "telephone" in o)):
                geo = obj.get("geo") if obj.get("@type") == "LocalBusiness" else None
                if isinstance(geo, dict) and want_lat is not None:
                    lat, lng = geo.get("latitude"), geo.get("longitude")
                    if (lat, lng) != (want_lat, want_lng):
                        failures.append(
                            f"{rel}: LocalBusiness geo {lat},{lng} != site_constants "
                            f"{want_lat},{want_lng}")
                tel = obj.get("telephone") if obj.get("@type") == "LocalBusiness" else None
                if tel and re.sub(r"\D", "", tel)[-10:] != want_phone_digits[-10:]:
                    failures.append(f"{rel}: LocalBusiness telephone {tel} != site_constants")
                break  # evaluate once per block

        if not blocks:
            failures.append(f"{rel}: indexable page has NO JSON-LD (class: {cls}) — "
                            f"add schema or mark noindex")
            continue

        for req in RULES.get(cls, ["BreadcrumbList"]):
            alts = req if isinstance(req, tuple) else (req,)
            if not any(a in types for a in alts):
                failures.append(f"{rel}: missing required schema type "
                                f"{' or '.join(alts)} (class: {cls}; has: {sorted(types)})")

    if failures:
        for f in failures:
            print(f"  FAIL  {f}")
        print(f"\nFAILED — {len(failures)} schema violation(s) across "
              f"{n_indexable} indexable page(s).")
        return 1

    print(f"SUCCESS — {n_indexable} indexable page(s) checked, schema clean "
          f"(parse + per-class types + review-policy + NAP/geo consistency).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
