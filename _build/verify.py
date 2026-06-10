#!/usr/bin/env python3
"""
Forever Party Rentals — verify generated pages.

Covers both Phase 2 (party-rentals city pages) and Phase 3 (product-per-city
pages: tent / chair / table / dance-floor).

Per-page checks (run on every target HTML file):
  1. Zero unfilled Jinja2 `{{ }}` tokens
  2. All JSON-LD blocks parse as valid JSON, with expected @types
  3. Canonical, Open Graph, and Twitter tags are present
  4. Minimum structural markers (H1, FAQ items, testimonials)
  5. <title> length ≤ 60 chars; meta description length 140-160 chars
  6. JSON-LD FAQPage entries are all present in the body FAQ section
  7. (Override pages only) ≥2 blog-post links and ≥2 sibling-city links

Cross-page checks (run after the per-page pass):
  8. Override-coverage report — which priority slugs have / lack an override
  9. Pairwise Jaccard uniqueness — override pages must differ ≥15% from same-kind
     siblings (Jaccard ≤ 0.85 on body word-set)

Exits 0 on all green, 1 on any failure. Output is human-readable.

Usage:
    python3 verify.py                           # all city pages (party-rentals)
    python3 verify.py --all                     # Phase 2 + Phase 3 (all pages)
    python3 verify.py --products                # Phase 3 product pages only
    python3 verify.py --products tent,chair     # restricted product subset
    python3 verify.py --slugs surrey,langley    # spot-check cities
    python3 verify.py --no-uniqueness           # skip the pairwise Jaccard pass
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent / "site"
CITY_DATA_FILE = HERE / "city_data.json"
PRODUCT_DATA_FILE = HERE / "products.json"
OVERRIDES_DIR = HERE / "overrides"

# Length budgets (style_guide.md). Hard-fail outside these bounds.
TITLE_MAX_CHARS = 60
META_MIN_CHARS = 140
META_MAX_CHARS = 160

# Pairwise Jaccard similarity ceiling for override pages vs same-kind siblings.
# Plan target: < 0.85 (i.e. override bodies must share less than 85% of word
# tokens with any sibling — generous enough to allow shared boilerplate, strict
# enough to catch near-duplicate drafts).
JACCARD_FAIL_THRESHOLD = 0.85

LD_JSON_RE = re.compile(
    r'<script\s+type="application/ld\+json"\s*>\s*(.*?)\s*</script>',
    re.DOTALL,
)

# City and product-per-city pages reference the canonical LocalBusiness entity
# by @id; the full LocalBusiness declaration lives only on the homepage.
EXPECTED_LD_TYPES = {"Service", "FAQPage", "BreadcrumbList"}
# SKU (product-<slug>.html) pages ship Product + Offer (with seller @id),
# plus BreadcrumbList. LocalBusiness is referenced, not re-declared.
EXPECTED_LD_TYPES_SKU = {"Product", "BreadcrumbList"}


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
    # SKU pages: exactly 2 (Product, BreadcrumbList).
    # City & product-city pages: >=3 base (Service, FAQPage, BreadcrumbList)
    # + optional ItemList (Review list, Sprint 5.14).
    if is_sku:
        if len(blocks) != 2:
            problems.append(f"expected 2 JSON-LD blocks, found {len(blocks)}")
    else:
        if len(blocks) < 3:
            problems.append(f"expected >=3 JSON-LD blocks, found {len(blocks)}")

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

    # 5. Title and meta length budgets (style_guide.md). Strict on override
    #    pages where Devon explicitly set the values; templated defaults run
    #    pre-budget and are exempt — they would have to be rewritten one-off
    #    in the generator if we wanted to enforce site-wide.
    is_override = 'id="local-knowledge"' in html
    if is_override:
        m = re.search(r"<title>([^<]+)</title>", html)
        if m:
            title_len = len(m.group(1))
            if title_len > TITLE_MAX_CHARS:
                problems.append(f"<title> {title_len} chars (max {TITLE_MAX_CHARS})")
        m = re.search(r'<meta name="description" content="([^"]+)"', html)
        if m:
            desc_len = len(m.group(1))
            if desc_len < META_MIN_CHARS or desc_len > META_MAX_CHARS:
                problems.append(
                    f"meta description {desc_len} chars "
                    f"(target {META_MIN_CHARS}-{META_MAX_CHARS})"
                )

    # 6. JSON-LD FAQPage entries are all present in the body FAQ section
    #    (the body has 3 hardcoded FAQ extras; we only require the JSON-LD
    #    questions to be a subset, not equality).
    if not is_sku:
        jsonld_faqs: list[str] = []
        for raw in blocks:
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if parsed.get("@type") == "FAQPage":
                for q in parsed.get("mainEntity", []):
                    name = q.get("name", "").strip()
                    if name:
                        jsonld_faqs.append(name)
        body_faqs = re.findall(r'<div class="faq-q">([^<]+)</div>', html)
        body_faqs_normalized = [_normalize_text(q) for q in body_faqs]
        missing_in_body = [
            q for q in jsonld_faqs
            if _normalize_text(q) not in body_faqs_normalized
        ]
        if missing_in_body:
            problems.append(
                f"JSON-LD FAQPage has {len(missing_in_body)} question(s) "
                f"not in body: {missing_in_body[0][:60]!r}..."
            )

    # 7. Override-page minimum internal-link counts
    if 'id="local-knowledge"' in html:
        # Count blog-post links and sibling-city links across the whole page
        # (frontmatter's related_blog_posts + nearby_cities asides count too).
        # URLs are clean (no .html) since Netlify pretty_urls=true is on.
        blog_links = len(set(re.findall(r'href="(/blog/[^"#]+)"', html)))
        # Sibling-city links: /<slug>-party-rentals (excluding the page's own slug)
        all_city_pr_links = set(re.findall(r'href="(/[a-z0-9-]+-party-rentals)"', html))
        own_slug = path.stem  # e.g. "vancouver-party-rentals" or "tent-rental-vancouver"
        all_city_pr_links.discard(f"/{own_slug}")
        sibling_links = len(all_city_pr_links)
        if blog_links < 2:
            problems.append(
                f"override page has only {blog_links} blog-post link(s); "
                "style guide requires ≥2"
            )
        if sibling_links < 2:
            problems.append(
                f"override page has only {sibling_links} sibling-city link(s); "
                "style guide requires ≥2"
            )

    return problems


def _normalize_text(s: str) -> str:
    """Lowercase + collapse whitespace + strip — for FAQ question equality
    comparison across JSON-LD-encoded vs HTML-encoded forms (e.g. \\u2014 vs —)."""
    return re.sub(r"\s+", " ", s).strip().lower()


def _extract_local_knowledge_text(html: str) -> str | None:
    """Return the plain text of the `<section id="local-knowledge">` block,
    or None if no override section is present."""
    m = re.search(
        r'<section[^>]*id="local-knowledge"[^>]*>(.*?)</section>',
        html, re.DOTALL,
    )
    if not m:
        return None
    text = re.sub(r"<[^>]+>", " ", m.group(1))
    return re.sub(r"\s+", " ", text).strip()


def _word_set(text: str) -> set[str]:
    """Tokenize to lowercase word set, dropping common stop words and short
    tokens. Used for Jaccard similarity."""
    stop = {
        "the", "and", "for", "our", "with", "are", "you", "your", "from",
        "that", "this", "into", "have", "has", "but", "one", "all", "any",
        "out", "not", "we", "is", "to", "of", "in", "at", "a", "an", "or",
        "on", "by", "if", "as", "be", "it", "do", "so",
    }
    tokens = re.findall(r"[a-z][a-z0-9'-]+", text.lower())
    return {t for t in tokens if len(t) >= 3 and t not in stop}


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


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
        whitelist = product.get("cityWhitelist")
        for slug in city_slugs:
            # Respect cityWhitelist — products like starlink and battery
            # only generate for a subset of cities, so verify.py skips the
            # rest rather than reporting them as MISSING.
            if whitelist and slug not in whitelist:
                continue
            fn = product_filename(product, slug)
            label = fn[:-5]  # strip .html
            targets.append((label, SITE_DIR / fn))

    return targets


def check_uniqueness(targets: list[tuple[str, Path]]) -> list[str]:
    """Pairwise Jaccard check for override pages. Bucket targets by 'kind'
    (city-hub vs each product line) so we only compare like-with-like; flag
    any pair whose Local-Knowledge body word-sets overlap above the
    JACCARD_FAIL_THRESHOLD."""
    problems: list[str] = []
    # Bucket: kind -> [(label, word_set), ...] for pages that have an override
    buckets: dict[str, list[tuple[str, set[str]]]] = {}
    for label, path in targets:
        if not path.exists():
            continue
        text = _extract_local_knowledge_text(path.read_text(encoding="utf-8"))
        if text is None:
            continue  # no override section → skip
        words = _word_set(text)
        if len(words) < 50:
            continue  # too thin to evaluate meaningfully
        # Group by URL prefix kind (e.g. "tent-rental", "chair-rentals",
        # "party-rentals", "tent-rentals" for the Surrey override pattern)
        if label.endswith("-party-rentals"):
            kind = "party-rentals"
        else:
            # e.g. tent-rental-vancouver -> kind="tent-rental"
            kind = label.rsplit("-", 1)[0]
        buckets.setdefault(kind, []).append((label, words))

    for kind, entries in buckets.items():
        if len(entries) < 2:
            continue
        for i in range(len(entries)):
            for j in range(i + 1, len(entries)):
                la, wa = entries[i]
                lb, wb = entries[j]
                sim = _jaccard(wa, wb)
                if sim > JACCARD_FAIL_THRESHOLD:
                    problems.append(
                        f"[uniqueness] {la} vs {lb}: Jaccard={sim:.3f} "
                        f"(threshold {JACCARD_FAIL_THRESHOLD})"
                    )
    return problems


def report_override_coverage(targets: list[tuple[str, Path]]) -> None:
    """Soft-warn report: which targets have an override .md vs which don't.
    Informational only — does not contribute to exit status."""
    have: list[str] = []
    miss: list[str] = []
    for label, path in targets:
        # City-hub vs product override file lookup
        if label.endswith("-party-rentals"):
            override = OVERRIDES_DIR / "cities" / f"{label}.md"
        else:
            override = OVERRIDES_DIR / "products" / f"{label}.md"
        if override.exists():
            have.append(label)
        else:
            miss.append(label)
    print(f"\n[coverage] {len(have)}/{len(targets)} target(s) have an override .md")
    if miss and len(miss) <= 30:
        print(f"  Missing override (informational, not a failure):")
        for label in miss:
            print(f"    - {label}")
    elif miss:
        print(f"  {len(miss)} pages without overrides (run with fewer slugs to list)")


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
    ap.add_argument(
        "--no-uniqueness",
        action="store_true",
        help="skip the pairwise Jaccard uniqueness pass",
    )
    ap.add_argument(
        "--price-drift",
        action="store_true",
        help="also diff catalog/SKU prices against live RentKit rates via "
             "sync_planner_catalog.py --check (soft warning only — never "
             "fails the run; also enabled via FPR_CHECK_PRICE_DRIFT=1)",
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

    # Cross-page checks
    report_override_coverage(targets)

    if not args.no_uniqueness:
        uniq_problems = check_uniqueness(targets)
        if uniq_problems:
            print(f"\n[uniqueness] {len(uniq_problems)} similarity violation(s):")
            for p in uniq_problems:
                print(f"  - {p}")
            total_problems += len(uniq_problems)
        else:
            print("\n[uniqueness] all override pages within Jaccard threshold ✓")

    # Optional price-drift check — informational only, like the coverage
    # report: drift (or being offline) never contributes to exit status.
    # sync_planner_catalog.py itself soft-fails on network errors.
    if args.price_drift or os.environ.get("FPR_CHECK_PRICE_DRIFT") == "1":
        print("\n[price-drift] checking live RentKit rates "
              "(sync_planner_catalog.py --check)...")
        proc = subprocess.run(
            [sys.executable, str(HERE / "sync_planner_catalog.py"), "--check"],
            capture_output=True, text=True,
        )
        for line in (proc.stdout + proc.stderr).strip().splitlines():
            print(f"  {line}")
        if proc.returncode != 0:
            print("  [price-drift] WARNING: local prices drift from live "
                  "RentKit rates (informational, not a failure) — review "
                  "with: python3 _build/sync_planner_catalog.py --check")
        else:
            print("  [price-drift] no drift detected ✓")

    print()
    if total_problems == 0:
        print(f"SUCCESS — {len(targets)}/{len(targets)} pages valid.")
        return 0
    print(f"FAILED — {total_problems} issue(s) across pages.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
