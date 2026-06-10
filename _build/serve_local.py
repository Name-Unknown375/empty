"""
Static-site preview with pretty-URL fallback.

Replicates the extensionless URL behavior from netlify.toml's pretty_urls
without depending on Netlify (or any other host). Python 3.8+ stdlib only.

Usage:
  python3 _build/serve_local.py [PORT]
  Default port: 8000.

Resolution order for /foo:
  1. /foo               (if it exists as a file)
  2. /foo/index.html    (if /foo is a directory)
  3. /foo.html          (if no extension and no exact match)
  4. 404
"""
from __future__ import annotations

import http.server
import socketserver
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "site"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def translate_path(self, path: str) -> str:  # type: ignore[override]
        resolved = super().translate_path(path)
        fp = Path(resolved)
        if fp.is_dir():
            idx = fp / "index.html"
            if idx.is_file():
                return str(idx)
        if not fp.exists() and not fp.suffix:
            html_alt = Path(resolved + ".html")
            if html_alt.is_file():
                return str(html_alt)
        return resolved


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    with socketserver.TCPServer(("127.0.0.1", port), Handler) as s:
        print(f"Serving {ROOT} at http://127.0.0.1:{port}/  (Ctrl-C to stop)")
        try:
            s.serve_forever()
        except KeyboardInterrupt:
            print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
