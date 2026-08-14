#!/usr/bin/env python3
"""
Forever Party Rentals — side-by-side comparison server (live vs v3).

Serves:
  http://localhost:8080/          → current live site   (site/)
  http://localhost:8081/          → v3 conversion pass  (site-v3/)
  http://localhost:8079/          → split-screen comparison UI

Run:  python3 compare_sites.py     (Ctrl-C to stop)

The comparison UI shows both versions in synced iframes with quick-jump
links. No dependencies — Python 3 stdlib only.
"""
import http.server
import threading
import functools
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORTS = {8080: ROOT / "site", 8081: ROOT / "site-v3"}

COMPARE_HTML = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>FPR — live vs v3 comparison</title>
<style>
  :root { --green:#1E3A2F; --gold:#C9A44A; }
  * { box-sizing:border-box; margin:0; }
  body { font:14px/1.5 system-ui, sans-serif; background:#f2f4f3; height:100vh; display:flex; flex-direction:column; }
  header { background:var(--green); color:#fff; padding:10px 18px; display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  header strong { font-size:15px; }
  header a { color:#fff; opacity:.85; text-decoration:none; font-size:13px; padding:5px 12px; border:1px solid rgba(255,255,255,.3); border-radius:999px; }
  header a:hover, header a.active { opacity:1; border-color:var(--gold); color:var(--gold); }
  .panes { flex:1; display:grid; grid-template-columns:1fr 1fr; gap:2px; background:#ccc; }
  .pane { display:flex; flex-direction:column; background:#fff; }
  .pane-label { font-size:11px; letter-spacing:2px; text-transform:uppercase; padding:6px 12px; background:#fff; color:#555; border-bottom:1px solid #e5e5e5; }
  .pane-label b { color:var(--green); }
  iframe { flex:1; border:0; width:100%; }
</style></head>
<body>
<header>
  <strong>Forever Party Rentals — live vs v3</strong>
  <a href="#" data-p="/index.html" class="active">Home</a>
  <a href="#" data-p="/chairs.html">Chairs</a>
  <a href="#" data-p="/tables.html">Tables</a>
  <a href="#" data-p="/langley-party-rentals.html">City (Langley)</a>
  <a href="#" data-p="/product-white-chiavari-chair.html">SKU (Chiavari)</a>
  <a href="#" data-p="/wedding-package-100-guests.html">Package (100)</a>
  <a href="#" data-p="/contact.html">Contact</a>
  <a href="#" data-p="/event-layout-planner.html">Planner</a>
  <a href="#" data-p="/rentals.html">Booking</a>
</header>
<div class="panes">
  <div class="pane"><div class="pane-label">Live — <b>site/</b> :8080</div><iframe id="f1" src="http://localhost:8080/index.html"></iframe></div>
  <div class="pane"><div class="pane-label">V3 — <b>site-v3/</b> :8081</div><iframe id="f2" src="http://localhost:8081/index.html"></iframe></div>
</div>
<script>
  document.querySelectorAll('header a').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('header a').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
    const p = a.dataset.p;
    document.getElementById('f1').src = 'http://localhost:8080' + p;
    document.getElementById('f2').src = 'http://localhost:8081' + p;
  }));
</script>
</body></html>"""


class CompareHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = COMPARE_HTML.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

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


def serve(port, directory=None):
    if directory:
        handler = functools.partial(QuietHandler, directory=str(directory))
    else:
        handler = CompareHandler
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


if __name__ == "__main__":
    for port, d in PORTS.items():
        serve(port, d)
        print(f"  http://localhost:{port}/  →  {d.name}/")
    serve(8079)
    print("  http://localhost:8079/  →  side-by-side comparison UI")
    try:
        webbrowser.open("http://localhost:8079/")
    except Exception:
        pass
    print("\nCtrl-C to stop.")
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        print("\nStopped.")
