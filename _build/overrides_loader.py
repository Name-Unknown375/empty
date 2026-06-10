"""Per-page handmade-content overrides for generated pages.

Pages with no override file render exactly as they did before this module
existed. When `_build/overrides/<kind>/<slug>.md` is present, the templates
swap the boilerplate sections for the override's structured frontmatter +
rendered markdown body.

Format (Markdown with YAML frontmatter):

    ---
    slug: vancouver-party-rentals
    title: ...                    # optional <title> override (≤60 chars)
    meta_description: ...         # optional <meta description> (140-160 chars)
    h1: ...                       # optional H1 override
    hero_subtitle: ...            # optional hero paragraph
    intro_paragraphs:             # optional, replaces single city.intro
      - "First paragraph..."
      - "Second paragraph..."
    faqs:                         # optional, replaces city.faqs (body + JSON-LD)
      - q: "..."
        a: "..."
    testimonials:                 # optional, replaces pool-derived picks
      - quote: "..."
        name: "..."
        event: "..."
    related_blog_posts: [slug-a, slug-b]   # rendered into footer aside
    nearby_cities: [burnaby, richmond]
    ---

    ## Hand-authored Local Knowledge section
    Body markdown gets converted to HTML and rendered as a new <section>
    only when an override exists.

`load_overrides(slug, kind)` returns None when no override file exists, so
template guards `{% if overrides %}...{% endif %}` cleanly fall through to
the existing boilerplate.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import markdown
import yaml

HERE = Path(__file__).resolve().parent
OVERRIDES_DIR = HERE / "overrides"

# All keys the templates may reference — guaranteed present (as None) so
# StrictUndefined doesn't trip on `{% if ov.foo %}` for missing keys.
_OVERRIDE_KEYS = (
    "title", "meta_description", "h1", "hero_subtitle",
    "intro_paragraphs", "faqs", "testimonials",
    "related_blog_posts", "nearby_cities", "body_html",
    "chair_anchor", "tent_anchor", "table_anchor", "dancefloor_anchor",
)


def _empty() -> dict:
    return {k: None for k in _OVERRIDE_KEYS}


def _split_frontmatter(raw: str) -> tuple[dict, str]:
    """Split a markdown file with YAML frontmatter into (metadata, body).

    Frontmatter is delimited by lines containing exactly `---`. If the
    file doesn't start with `---`, treat the whole content as body with
    empty frontmatter.
    """
    if not raw.startswith("---"):
        return {}, raw

    lines = raw.split("\n")
    end_idx = None
    for i, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end_idx = i
            break

    if end_idx is None:
        return {}, raw

    fm_text = "\n".join(lines[1:end_idx])
    body = "\n".join(lines[end_idx + 1:])
    metadata = yaml.safe_load(fm_text) or {}
    if not isinstance(metadata, dict):
        raise ValueError(f"Frontmatter must be a YAML mapping, got {type(metadata).__name__}")
    return metadata, body


def load_overrides(slug: str, kind: str) -> dict:
    """Return the override dict for `slug` under `overrides/<kind>/`.

    Always returns a dict with every key in `_OVERRIDE_KEYS` present (None
    when no value). When no file exists, every key is None — so template
    guards like `{% if ov.intro_paragraphs %}` cleanly evaluate to false.
    When a file exists, frontmatter values overlay the None defaults, and
    `body_html` is the rendered markdown body.

    `kind` must be one of: "cities", "products", "christmas".
    """
    if kind not in ("cities", "products", "christmas"):
        raise ValueError(f"kind must be 'cities', 'products', or 'christmas', got {kind!r}")
    path = OVERRIDES_DIR / kind / f"{slug}.md"
    result = _empty()
    if not path.exists():
        return result
    raw = path.read_text(encoding="utf-8")
    metadata, body_md = _split_frontmatter(raw)
    result.update(metadata)
    if body_md.strip():
        result["body_html"] = markdown.markdown(body_md.strip(), extensions=["extra", "smarty"])
    return result
