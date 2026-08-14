#!/usr/bin/env python3
"""Generate responsive WebP variants for images used in markdown overrides.

The hand-authored Local-Knowledge sections (`_build/overrides/**/*.md`) embed
content images via `![alt](/images/...)`. Historically those rendered as bare
`<img>` with no width/height and no next-gen format — a CLS + payload problem.

`overrides_loader._enhance_images()` now emits `width`/`height`, lazy-loading,
and a WebP `srcset` *when* `-<w>w.webp` variants exist on disk. This script
produces those variants, matching the site's existing `-600w/-900w/-1200w.webp`
hero-image naming scheme.

Idempotent: skips a variant that already exists and is newer than its source.
Never upscales (a width larger than the source's intrinsic width is skipped).

Usage:
    python3 _build/generate_override_image_variants.py          # all override images
    python3 _build/generate_override_image_variants.py --force   # rebuild all
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except Exception:  # pragma: no cover
    sys.exit("Pillow is required: pip install Pillow")

HERE = Path(__file__).resolve().parent
SITE = HERE.parent / "site-v3"
OVERRIDES = HERE / "overrides"
WIDTHS = (600, 900, 1200)
WEBP_QUALITY = 80

# Markdown image: ![alt](/images/path.ext) — capture the URL up to ) or whitespace.
_IMG_RE = re.compile(r"!\[[^\]]*\]\((/images/[^)\s]+)")


def collect_sources() -> list[str]:
    """All distinct /images/... URLs referenced by markdown override bodies."""
    srcs: set[str] = set()
    for md in OVERRIDES.rglob("*.md"):
        text = md.read_text(encoding="utf-8")
        srcs.update(m.group(1) for m in _IMG_RE.finditer(text))
    return sorted(srcs)


def variant_path(src: str, w: int) -> Path:
    """/images/foo.jpg -> site/images/foo-<w>w.webp"""
    p = SITE / src.lstrip("/")
    return p.with_suffix("").with_name(f"{p.stem}-{w}w.webp")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="rebuild even if up to date")
    args = ap.parse_args()

    made = skipped = missing = 0
    for src in collect_sources():
        source = SITE / src.lstrip("/")
        if not source.exists():
            print(f"  MISSING source: {src}")
            missing += 1
            continue
        with Image.open(source) as im:
            if im.mode == "P":
                im = im.convert("RGBA")
            iw, ih = im.size
            for w in WIDTHS:
                if w > iw:  # never upscale
                    continue
                out = variant_path(src, w)
                if (
                    not args.force
                    and out.exists()
                    and out.stat().st_mtime >= source.stat().st_mtime
                ):
                    skipped += 1
                    continue
                h = round(w * ih / iw)
                im.resize((w, h), Image.LANCZOS).save(
                    out, "WEBP", quality=WEBP_QUALITY, method=6
                )
                made += 1
                print(f"  {out.relative_to(SITE)}  ({w}x{h})")

    print(f"Done: {made} created, {skipped} up-to-date, {missing} missing sources.")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
