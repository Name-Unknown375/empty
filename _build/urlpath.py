"""
Forever Party Rentals — URL helper shared across all page generators.

Converts a site HTML filename into its public URL path. Returns the clean
(extensionless) form — Netlify `pretty_urls = true` serves `foo.html` at
`/foo` and 301-redirects `/foo.html` → `/foo`, so internal links, canonical
tags, og:url, hreflang, and the sitemap all reference the clean form.

The homepage (`index.html`) maps to `/`. `blog/index.html` is handled by
callers (they prepend `/blog`).
"""


def url_path(filename: str) -> str:
    """Return the root-relative public URL for a given site HTML filename.

    >>> url_path("packages.html")
    '/packages'
    >>> url_path("wedding-package-50-guests.html")
    '/wedding-package-50-guests'
    >>> url_path("rentals.html")
    '/rentals'
    >>> url_path("index.html")
    '/'
    >>> url_path("llms.txt")
    '/llms.txt'
    """
    if filename == "index.html":
        return "/"
    if filename.endswith(".html"):
        return f"/{filename[:-5]}"
    return f"/{filename}"


def strip_html(path_or_url: str) -> str:
    """Strip a trailing `.html` from a URL path, leaving non-html paths intact.
    Used when migrating legacy `.html` strings in JSON data or override files
    to the clean-URL canonical form."""
    if path_or_url.endswith(".html"):
        return path_or_url[:-5]
    return path_or_url
