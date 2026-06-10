#!/usr/bin/env python3
"""Draft a per-page override .md file using the Claude API.

Output goes to `_build/overrides/<kind>/<slug>.md.draft`. Devon reviews,
edits, and renames `.md.draft` → `.md` to publish. The generators only
read `.md` files; `.md.draft` is ignored.

Setup:
    pip3 install --user anthropic markdown pyyaml
    export ANTHROPIC_API_KEY=sk-ant-...   # from https://console.anthropic.com

Usage:
    python3 draft_override.py --kind city --slug vancouver
    python3 draft_override.py --kind product --slug tent-rental-vancouver
    python3 draft_override.py --kind city --slug burnaby --force   # overwrite existing draft

The script caches the style guide and reference blog posts on the API side,
so drafting subsequent pages is significantly cheaper than the first.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent / "site"
OVERRIDES_DIR = HERE / "overrides"
STYLE_GUIDE = HERE / "style_guide.md"
CITY_DATA = HERE / "city_data.json"
PRODUCT_DATA = HERE / "products.json"
PRODUCT_SKU_DATA = HERE / "products_sku.json"
SITE_CONSTANTS = HERE / "site_constants.json"
BLOG_POSTS_INDEX = SITE_DIR / "blog" / "posts.json"

# Reference blog posts the model uses to anchor on Devon's voice.
REFERENCE_BLOG_POSTS = [
    SITE_DIR / "blog" / "harrison-hot-springs-destination-wedding.html",
    SITE_DIR / "blog" / "surrey-parks-event-rental-guide.html",
]

MODEL = "claude-opus-4-7"
MAX_TOKENS = 4096


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _strip_html_to_text(html: str, limit: int = 12_000) -> str:
    """Cheap HTML → text reduction for the reference posts. We don't need
    perfect fidelity — the model uses these for voice/structure, not to
    quote verbatim. Truncates to `limit` chars to keep prompt size sane."""
    import re
    # Remove script/style blocks
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    # Strip tags
    text = re.sub(r"<[^>]+>", " ", html)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        text = text[:limit] + " […truncated…]"
    return text


def _load_blog_index() -> list[dict]:
    """Return the list of {slug, title, ...} entries for valid blog post links."""
    if not BLOG_POSTS_INDEX.exists():
        return []
    raw = json.loads(_read(BLOG_POSTS_INDEX))
    if isinstance(raw, dict) and "posts" in raw:
        return raw["posts"]
    if isinstance(raw, list):
        return raw
    return []


def _build_city_bundle(city_slug: str) -> dict:
    city_data = json.loads(_read(CITY_DATA))
    if city_slug not in city_data["cities"]:
        sys.exit(f"Unknown city slug: {city_slug}. Run with a slug from city_data.json.")
    city = city_data["cities"][city_slug]
    products = json.loads(_read(PRODUCT_DATA))["products"]
    skus = json.loads(_read(PRODUCT_SKU_DATA))
    constants = json.loads(_read(SITE_CONSTANTS))

    # Sibling cities for nearby_cities suggestions
    sibling_cities = {
        slug: {"name": c["name"], "tier": c.get("tier"), "neighborhoods": c.get("neighborhoods", [])[:3]}
        for slug, c in city_data["cities"].items()
        if slug != city_slug
    }

    return {
        "target_kind": "city",
        "target_slug": f"{city_slug}-party-rentals",
        "city_record": city,
        "all_products_summary": {k: {"name": v["productName"], "tagline": v.get("tagline", ""), "fromPrice": v.get("fromPriceCAD")} for k, v in products.items()},
        "skus_summary": [{"key": k, "name": v["name"], "category": v["category"], "priceRange": v.get("priceRange"), "url": f"/product-{k}.html"} for k, v in skus.get("products", {}).items()],
        "sibling_cities": sibling_cities,
        "blog_posts": _load_blog_index(),
        "site_constants": constants,
    }


def _build_product_bundle(product_slug: str) -> dict:
    """product_slug is the full filename minus .html, e.g. 'tent-rental-vancouver'."""
    city_data = json.loads(_read(CITY_DATA))
    products = json.loads(_read(PRODUCT_DATA))["products"]
    skus = json.loads(_read(PRODUCT_SKU_DATA))
    constants = json.loads(_read(SITE_CONSTANTS))

    # Reverse-lookup the product key + city slug from the URL pattern.
    # Each product has urlPrefix (e.g. "tent-rental") and urlPrefixOverrides ({slug: prefix}).
    matched = None
    for product_key, p in products.items():
        prefix = p["urlPrefix"]
        overrides = p.get("urlPrefixOverrides") or {}
        for city_slug in city_data["cities"]:
            actual_prefix = overrides.get(city_slug, prefix)
            if f"{actual_prefix}-{city_slug}" == product_slug:
                matched = (product_key, city_slug)
                break
        if matched:
            break
    if not matched:
        sys.exit(f"Could not resolve product slug {product_slug!r}. Format: <urlPrefix>-<city_slug>")

    product_key, city_slug = matched
    product = products[product_key]
    city = city_data["cities"][city_slug]

    sibling_cities = {
        slug: {"name": c["name"], "tier": c.get("tier")}
        for slug, c in city_data["cities"].items()
        if slug != city_slug
    }
    relevant_skus = [
        {"key": k, "name": v["name"], "priceRange": v.get("priceRange"), "url": f"/product-{k}.html"}
        for k, v in skus.get("products", {}).items()
        if v.get("category") == product_key
    ]

    return {
        "target_kind": "product",
        "target_slug": product_slug,
        "product_record": product,
        "city_record": city,
        "relevant_skus": relevant_skus,
        "sibling_cities": sibling_cities,
        "blog_posts": _load_blog_index(),
        "site_constants": constants,
    }


def _build_messages(bundle: dict, style_guide: str, reference_posts: list[str]) -> tuple[list[dict], str]:
    """Build the (messages, system) tuple for the API call.

    Cacheable content (style guide, reference posts) is placed in a single
    user message at the start with `cache_control` markers so subsequent
    drafts hit the prompt cache."""
    system = (
        "You are a content drafter for Forever Party Rentals, a 22-year-old "
        "Lower Mainland event rental business. Your job is to draft per-page "
        "override .md files that ship with handcrafted local content for the "
        "static site. Follow the style guide exactly. Output only the .md file "
        "contents — no commentary, no fences."
    )

    cacheable_content = (
        "# Style Guide (read first, follow exactly)\n\n"
        + style_guide
        + "\n\n# Reference: existing handcrafted blog posts (match this voice)\n\n"
        + "\n\n---\n\n".join(reference_posts)
    )

    target_summary = json.dumps(bundle, indent=2, ensure_ascii=False)

    user_blocks = [
        {
            "type": "text",
            "text": cacheable_content,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": (
                "## Drafting task\n\n"
                f"Target: a {bundle['target_kind']} override for slug "
                f"`{bundle['target_slug']}`.\n\n"
                "## Research bundle (use ONLY these facts)\n\n"
                "```json\n" + target_summary + "\n```\n\n"
                "## Output\n\n"
                "Produce the complete override .md file per the schema in the "
                "style guide. Start with `---`, end with the body markdown. "
                "No commentary."
            ),
        },
    ]

    return [{"role": "user", "content": user_blocks}], system


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=("city", "product"), required=True)
    ap.add_argument(
        "--slug",
        required=True,
        help="city slug (e.g. 'vancouver') OR full product page slug (e.g. 'tent-rental-vancouver')",
    )
    ap.add_argument("--force", action="store_true", help="overwrite an existing .md.draft")
    ap.add_argument(
        "--out",
        default=None,
        help="optional output path (defaults to overrides/<kind>/<slug>.md.draft)",
    )
    args = ap.parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit(
            "ANTHROPIC_API_KEY is not set.\n"
            "  1. Get a key at https://console.anthropic.com/settings/keys\n"
            "  2. export ANTHROPIC_API_KEY=sk-ant-...\n"
            "  3. (Optional) add the export to ~/.zshrc to persist it."
        )

    try:
        from anthropic import Anthropic
    except ImportError:
        sys.exit("Missing anthropic SDK. Run: pip3 install --user anthropic")

    # Build research bundle
    if args.kind == "city":
        bundle = _build_city_bundle(args.slug)
        out_dir = OVERRIDES_DIR / "cities"
        out_filename = f"{args.slug}-party-rentals.md.draft"
    else:
        bundle = _build_product_bundle(args.slug)
        out_dir = OVERRIDES_DIR / "products"
        out_filename = f"{args.slug}.md.draft"

    out_path = Path(args.out) if args.out else (out_dir / out_filename)
    if out_path.exists() and not args.force:
        sys.exit(f"{out_path} already exists. Pass --force to overwrite.")

    # Load style guide + reference posts (cached portion)
    style_guide = _read(STYLE_GUIDE)
    reference_posts = [
        f"## {p.name}\n\n" + _strip_html_to_text(_read(p))
        for p in REFERENCE_BLOG_POSTS
        if p.exists()
    ]
    if not reference_posts:
        sys.exit(f"No reference blog posts found at {REFERENCE_BLOG_POSTS}")

    messages, system = _build_messages(bundle, style_guide, reference_posts)

    print(f"Drafting {args.kind} override for `{args.slug}`...")
    print(f"  Model: {MODEL}")
    print(f"  Output: {out_path}")

    client = Anthropic()
    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=system,
        messages=messages,
    )

    # Extract text from response
    if not response.content or response.content[0].type != "text":
        sys.exit(f"Unexpected response: {response}")
    draft = response.content[0].text

    # Strip accidental code-fence wrapping if the model added one
    if draft.startswith("```"):
        lines = draft.split("\n")
        # Drop the opening fence (and any language tag) and the closing fence
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        draft = "\n".join(lines)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(draft.strip() + "\n", encoding="utf-8")

    usage = response.usage
    print(f"\n  Wrote {out_path} ({len(draft)} chars)")
    print(f"  Tokens: input={usage.input_tokens} output={usage.output_tokens}")
    if hasattr(usage, "cache_creation_input_tokens"):
        print(f"  Cache: created={usage.cache_creation_input_tokens} read={usage.cache_read_input_tokens}")
    print("\n  Next: review the draft, edit anything fabricated, then:")
    print(f"    mv {out_path} {str(out_path).replace('.md.draft', '.md')}")
    print("    python3 generate_city_pages.py --slugs <slug> --out _pilot   # preview")


if __name__ == "__main__":
    main()
