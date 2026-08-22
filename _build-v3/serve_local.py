#!/usr/bin/env python3
"""
Static-site preview with pretty-URL fallback and Accept negotiation.

Replicates Netlify pretty_urls plus acceptmarkdown.com behaviour
(text/html vs text/markdown, Vary: Accept, 406, markdown 404).

Usage:
  python3 _build-v3/serve_local.py [PORT]
  Default port: 8000.
"""
from __future__ import annotations

import html as htmlmod
import mimetypes
import re
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent / "site-v3"
SITE_ORIGIN = "https://www.foreverpartyrentals.com"

HTML_TYPE = "text/html"
MARKDOWN_TYPE = "text/markdown"
DEFAULT_TYPE = HTML_TYPE
VARY_VALUE = "Accept, Accept-Encoding"
MARKDOWN_CT = "text/markdown; charset=utf-8"
HTML_CT = "text/html; charset=utf-8"

SKIP_PREFIXES = ("/api/", "/images/", "/fonts/", "/planner/")
SKIP_EXTS = {
    ".css", ".js", ".mjs", ".map",
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico",
    ".woff", ".woff2", ".ttf", ".eot",
    ".mp4", ".webm", ".pdf",
    ".json", ".xml", ".zip",
}

FALLBACK_404_MD = """# Page not found

This URL does not exist on Forever Party Rentals.

## Where to go next

- [Site index for agents (llms.txt)](https://www.foreverpartyrentals.com/llms.txt)
- [XML sitemap](https://www.foreverpartyrentals.com/sitemap.xml)
- [Agent skills](https://www.foreverpartyrentals.com/.well-known/agent-skills/index.json)
- [Book rentals](https://www.foreverpartyrentals.com/rentals)
- [Contact](https://www.foreverpartyrentals.com/contact)
- [Home](https://www.foreverpartyrentals.com/)
"""


def extension_of(pathname: str) -> str:
    base = pathname.rsplit("/", 1)[-1]
    i = base.rfind(".")
    if i <= 0:
        return ""
    return base[i:].lower()


def should_skip_path(pathname: str) -> bool:
    p = (pathname or "/").lower()
    for prefix in SKIP_PREFIXES:
        if p == prefix.rstrip("/") or p.startswith(prefix):
            return True
    return extension_of(p) in SKIP_EXTS


def sibling_md_path(pathname: str) -> str:
    p = pathname or "/"
    if not p.startswith("/"):
        p = "/" + p
    if p.endswith(".md"):
        return p
    if p == "/":
        return "/index.md"
    if p.endswith("/"):
        return p + "index.md"
    if p.lower().endswith(".html"):
        return p[:-5] + ".md"
    return p + ".md"


def parse_accept(header: str | None):
    if header is None:
        return None
    raw = header.strip()
    if not raw:
        return []
    out = []
    for part in raw.split(","):
        segs = [s.strip() for s in part.strip().split(";") if s.strip()]
        if not segs:
            continue
        media = segs[0].lower()
        if "/" not in media:
            continue
        typ, subtype = media.split("/", 1)
        typ, subtype = typ.strip(), subtype.strip()
        if not typ or not subtype:
            continue
        q = 1.0
        for extra in segs[1:]:
            if "=" not in extra:
                continue
            k, v = extra.split("=", 1)
            if k.strip().lower() == "q":
                try:
                    n = float(v.strip())
                except ValueError:
                    continue
                if 0 <= n <= 1:
                    q = n
        spec = 3
        if typ == "*" and subtype == "*":
            spec = 1
        elif subtype == "*":
            spec = 2
        out.append((typ, subtype, q, spec))
    return out


def _match_score(produced: str, entries) -> float:
    p_type, p_sub = produced.lower().split("/", 1)
    best_spec = 0
    best_q = 0.0
    for typ, subtype, q, spec in entries:
        this = 0
        if typ == p_type and subtype == p_sub:
            this = 3
        elif typ == p_type and subtype == "*":
            this = 2
        elif typ == "*" and subtype == "*":
            this = 1
        if this and this > best_spec:
            best_spec = this
            best_q = q
    if not best_spec or best_q == 0:
        return 0.0
    return best_q


def negotiate(accept_header: str | None) -> str | None:
    entries = parse_accept(accept_header)
    if entries is None:
        return DEFAULT_TYPE
    supported = [HTML_TYPE, MARKDOWN_TYPE]
    scores = [(t, _match_score(t, entries)) for t in supported]
    best = None
    for t, score in scores:
        if score <= 0:
            continue
        if best is None or score > best[1] or (score == best[1] and t == DEFAULT_TYPE):
            best = (t, score)
    if best:
        return best[0]
    any_positive = any(q > 0 for _a, _b, q, _s in entries)
    if any_positive:
        return None
    default_rejected = any(
        q == 0 and (
            (typ == "text" and subtype == "html")
            or (typ == "text" and subtype == "*")
            or (typ == "*" and subtype == "*")
        )
        for typ, subtype, q, _s in entries
    )
    if default_rejected:
        return None
    return DEFAULT_TYPE


def extract_main(html: str) -> str:
    m = re.search(r"<main\b[^>]*>([\s\S]*?)</main>", html, re.I)
    if m:
        return m.group(1)
    nav = re.search(r"<!--\s*NAV:END\s*-->", html, re.I)
    foot = re.search(r"<!--\s*FOOTER:START\s*-->", html, re.I)
    if nav and foot and foot.start() > nav.start():
        return html[nav.end():foot.start()]
    s = re.sub(r"<nav\b[\s\S]*?</nav>", "", html, flags=re.I)
    s = re.sub(r"<footer\b[\s\S]*?</footer>", "", s, flags=re.I)
    return re.sub(r"<header\b[\s\S]*?</header>", "", s, flags=re.I)


def _strip_tags(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s)
    s = htmlmod.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def _resolve_href(href: str) -> str:
    h = (href or "").strip()
    if not h or h.startswith("#") or h.lower().startswith("javascript:"):
        return ""
    if re.match(r"^[a-z][a-z0-9+.-]*:", h, re.I):
        return h
    if h.startswith("//"):
        return "https:" + h
    if h.startswith("/"):
        return SITE_ORIGIN + h
    return SITE_ORIGIN + "/" + h


def _convert_inline(html: str) -> str:
    s = html
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)

    def _a(m):
        text = _strip_tags(m.group(2)) or m.group(1)
        url = _resolve_href(m.group(1))
        return f"[{text}]({url})" if url else text

    s = re.sub(
        r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>([\s\S]*?)</a>',
        _a, s, flags=re.I,
    )
    s = re.sub(
        r"<(strong|b)\b[^>]*>([\s\S]*?)</\1>",
        lambda m: f"**{_strip_tags(m.group(2))}**",
        s, flags=re.I,
    )
    s = re.sub(
        r"<(em|i)\b[^>]*>([\s\S]*?)</\1>",
        lambda m: f"*{_strip_tags(m.group(2))}*",
        s, flags=re.I,
    )
    return _strip_tags(re.sub(r"<[^>]+>", " ", s))


def html_to_markdown(html: str) -> str:
    s = extract_main(html)
    s = re.sub(r"<script\b[\s\S]*?</script>", "", s, flags=re.I)
    s = re.sub(r"<style\b[\s\S]*?</style>", "", s, flags=re.I)
    s = re.sub(r"<svg\b[\s\S]*?</svg>", "", s, flags=re.I)
    s = re.sub(r"<noscript\b[\s\S]*?</noscript>", "", s, flags=re.I)

    def _h(m):
        return f"\n\n{'#' * int(m.group(1))} {_convert_inline(m.group(2))}\n\n"

    s = re.sub(r"<h([1-6])\b[^>]*>([\s\S]*?)</h\1>", _h, s, flags=re.I)

    def _ul(m, ordered=False):
        items = re.findall(r"<li\b[^>]*>([\s\S]*?)</li>", m.group(1), flags=re.I)
        lines = []
        for i, item in enumerate(items, 1):
            text = _convert_inline(item)
            if text:
                lines.append(f"{i}. {text}" if ordered else f"- {text}")
        return ("\n\n" + "\n".join(lines) + "\n\n") if lines else ""

    s = re.sub(r"<ul\b[^>]*>([\s\S]*?)</ul>", lambda m: _ul(m, False), s, flags=re.I)
    s = re.sub(r"<ol\b[^>]*>([\s\S]*?)</ol>", lambda m: _ul(m, True), s, flags=re.I)
    s = re.sub(
        r"<p\b[^>]*>([\s\S]*?)</p>",
        lambda m: (f"\n\n{_convert_inline(m.group(1))}\n\n" if _convert_inline(m.group(1)) else ""),
        s, flags=re.I,
    )
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"</(div|section|article|header|footer|figure)>", "\n\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = htmlmod.unescape(s)
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s).strip()
    return (s + "\n") if s else ""


def not_acceptable_body(requested: str | None) -> str:
    asked = "(none)" if not (requested and requested.strip()) else requested.strip()
    return (
        "This resource is available in:\n"
        "- text/html\n"
        "- text/markdown\n"
        f"\nYou requested: {asked}\n"
    )


def disk_path(url_path: str) -> Path | None:
    clean = unquote(url_path.split("?", 1)[0])
    if clean.startswith("/"):
        clean = clean[1:]
    # Prevent path escape. site-v3/images and site-v3/fonts are symlinks into
    # ../site/; resolve() must be allowed anywhere under the repo, not only
    # under site-v3, or local preview 404s every photo.
    candidate = (ROOT / clean).resolve()
    repo = ROOT.resolve().parent
    try:
        candidate.relative_to(repo)
    except ValueError:
        return None
    if candidate.is_file():
        return candidate
    if candidate.is_dir() and (candidate / "index.html").is_file():
        return candidate / "index.html"
    if not candidate.suffix and (ROOT / (clean + ".html")).is_file():
        return (ROOT / (clean + ".html")).resolve()
    return None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, fmt, *args):  # quieter local preview
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, status: int, body: bytes, content_type: str, extra: dict[str, str] | None = None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Vary", VARY_VALUE)
        if extra:
            for k, v in extra.items():
                self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _read(self, path: Path) -> bytes:
        return path.read_bytes()

    def do_HEAD(self):  # noqa: N802
        self._negotiate()

    def do_GET(self):  # noqa: N802
        self._negotiate()

    def _negotiate(self):
        parsed = urlparse(self.path)
        pathname = parsed.path or "/"
        accept = self.headers.get("Accept")

        if should_skip_path(pathname):
            return self._serve_static(pathname, vary=False)

        if pathname.lower().endswith(".md"):
            p = disk_path(pathname)
            if p and p.is_file():
                return self._send(200, self._read(p), MARKDOWN_CT)
            return self._markdown_404()

        choice = negotiate(accept)
        if choice is None:
            body = not_acceptable_body(accept).encode("utf-8")
            return self._send(406, body, "text/plain; charset=utf-8",
                              {"Cache-Control": "no-store"})

        if choice == MARKDOWN_TYPE:
            return self._serve_markdown(pathname)

        return self._serve_static(pathname, vary=True)

    def _markdown_404(self):
        md = ROOT / "404.md"
        body = md.read_bytes() if md.is_file() else FALLBACK_404_MD.encode("utf-8")
        return self._send(404, body, MARKDOWN_CT)

    def _serve_markdown(self, pathname: str):
        twin = disk_path(sibling_md_path(pathname))
        if twin and twin.is_file() and twin.suffix.lower() == ".md":
            return self._send(200, self._read(twin), MARKDOWN_CT)

        html_path = disk_path(pathname)
        if html_path is None:
            return self._markdown_404()

        ct = mimetypes.guess_type(str(html_path))[0] or ""
        name = html_path.name.lower()
        if name == "llms.txt" or html_path.suffix.lower() in {".md", ".txt"}:
            return self._send(200, self._read(html_path), MARKDOWN_CT)

        raw = html_path.read_text(encoding="utf-8", errors="ignore")
        if html_path.suffix.lower() != ".html" and "html" not in ct:
            return self._send(200, html_path.read_bytes(), ct or "application/octet-stream")

        md = html_to_markdown(raw)
        if not md.strip():
            return self._send(200, html_path.read_bytes(), HTML_CT)
        return self._send(200, md.encode("utf-8"), MARKDOWN_CT)

    def _serve_static(self, pathname: str, vary: bool):
        p = disk_path(pathname)
        if p is None:
            nf = ROOT / "404.html"
            if nf.is_file():
                extra = {"Vary": VARY_VALUE} if vary else None
                body = nf.read_bytes()
                # _send always sets Vary; for skip-path 404s that's ok-ish.
                # Asset 404s shouldn't hit this because skip uses this method
                # and missing images 404 as HTML — acceptable for local preview.
                return self._send(404, body, HTML_CT)
            self.send_error(404, "File not found")
            return
        data = p.read_bytes()
        if p.suffix.lower() == ".md" or p.name.lower() == "llms.txt":
            ct = MARKDOWN_CT
        else:
            ct = mimetypes.guess_type(str(p))[0] or "application/octet-stream"
            if p.suffix.lower() in {".html", ""} or p.name.endswith(".html"):
                ct = HTML_CT
        if vary:
            return self._send(200, data, ct)
        self.send_response(200)
        self.send_header("Content-Type", ct)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    with ThreadingHTTPServer(("127.0.0.1", port), Handler) as s:
        print(f"Serving {ROOT} at http://127.0.0.1:{port}/  (Ctrl-C to stop; Accept negotiation on)")
        try:
            s.serve_forever()
        except KeyboardInterrupt:
            print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
