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

import re

import markdown
import yaml

try:
    from PIL import Image  # build-time only; enables CLS-safe sized <img> output
except Exception:  # Pillow absent → images render without dimensions (no crash)
    Image = None

HERE = Path(__file__).resolve().parent
OVERRIDES_DIR = HERE / "overrides"
SITE_DIR = HERE.parent / "site"

# Responsive WebP variant widths produced by generate_override_image_variants.py.
_VARIANT_WIDTHS = (600, 900, 1200)
_IMG_TAG_RE = re.compile(r"<img\b[^>]*?/?>", re.IGNORECASE)
_ATTR_RE = re.compile(r'([a-zA-Z_:][-\w:.]*)\s*=\s*"([^"]*)"')

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


def _img_disk_path(src: str) -> Optional[Path]:
    """Map a root-relative /images/... URL to its file under site/, if it exists."""
    if not src.startswith("/"):
        return None  # external or relative — leave the <img> untouched
    p = SITE_DIR / src.lstrip("/")
    return p if p.exists() else None


def _intrinsic_size(path: Path) -> Optional[tuple[int, int]]:
    if Image is None:
        return None
    try:
        with Image.open(path) as im:
            return im.size  # (width, height)
    except Exception:
        return None


def _webp_variant(src: str, w: int) -> str:
    """/images/foo.jpg -> /images/foo-<w>w.webp (matches the hero-image scheme)."""
    base = src.rsplit(".", 1)[0]
    return f"{base}-{w}w.webp"


def _enhance_images(html_str: str) -> str:
    """Post-process python-markdown <img> output for performance + a11y.

    For each local image, add intrinsic ``width``/``height`` (so the browser
    reserves space → fixes Cumulative Layout Shift), ``loading="lazy"`` and
    ``decoding="async"``, and — when pre-generated ``-<w>w.webp`` variants exist
    on disk — a WebP ``src``/``srcset``/``sizes`` set. Mirrors the responsive
    hero-image pattern already used in the templates. Existing alt/class/title
    are preserved; external or missing images are left exactly as-is.
    """
    def repl(m: "re.Match[str]") -> str:
        tag = m.group(0)
        attrs = dict(_ATTR_RE.findall(tag))
        src = attrs.get("src", "")
        disk = _img_disk_path(src)
        size = _intrinsic_size(disk) if disk else None
        if not size:
            return tag
        iw, ih = size
        if iw <= 0 or ih <= 0:
            return tag

        cls = attrs.get("class", "")
        if "float-right" in cls or "float-left" in cls:
            sizes = "340px"
        elif "small" in cls:
            sizes = "460px"
        else:
            sizes = "(max-width: 980px) 100vw, 980px"

        variants = [
            (w, _webp_variant(src, w))
            for w in _VARIANT_WIDTHS
            if w <= iw and (SITE_DIR / _webp_variant(src, w).lstrip("/")).exists()
        ]
        disp_w = min(iw, _VARIANT_WIDTHS[-1])
        disp_h = round(disp_w * ih / iw)
        new_src = variants[-1][1] if variants else src

        out = [f'src="{new_src}"']
        if variants:
            out.append('srcset="' + ", ".join(f"{u} {w}w" for w, u in variants) + '"')
            out.append(f'sizes="{sizes}"')
        out.append(f'alt="{attrs.get("alt", "")}"')
        if cls:
            out.append(f'class="{cls}"')
        if attrs.get("title"):
            out.append(f'title="{attrs["title"]}"')
        out.append(f'width="{disp_w}"')
        out.append(f'height="{disp_h}"')
        out.append('loading="lazy"')
        out.append('decoding="async"')
        return "<img " + " ".join(out) + "/>"

    return _IMG_TAG_RE.sub(repl, html_str)


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
        rendered = markdown.markdown(body_md.strip(), extensions=["extra", "smarty"])
        result["body_html"] = _enhance_images(rendered)
    return result
