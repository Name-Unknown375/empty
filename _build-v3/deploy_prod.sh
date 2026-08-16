#!/usr/bin/env bash
# Deploy site-v3 with images/fonts dereferenced.
#
# site-v3/images and site-v3/fonts are symlinks into ../site/. Netlify's
# publish directory is site-v3, so a raw `netlify deploy --prod` uploads the
# dangling symlink and every photo/font 404s. This copies the real files into
# a staging dir, then deploys that.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$ROOT/.netlify-publish"
cd "$ROOT"

rm -rf "$STAGE"
mkdir -p "$STAGE"
rsync -a --copy-links --exclude '.DS_Store' "$ROOT/site-v3/" "$STAGE/"

if [[ ! -f "$STAGE/images/logo.webp" ]]; then
  echo "error: staged publish is missing images/logo.webp" >&2
  exit 1
fi
if [[ ! -f "$STAGE/fonts/playfair-display-variable.woff2" ]]; then
  echo "error: staged publish is missing fonts" >&2
  exit 1
fi

echo "Staged $(du -sh "$STAGE" | awk '{print $1}') with $(find "$STAGE/images" -type f | wc -l | tr -d ' ') images — deploying"
exec netlify deploy --prod --dir="$STAGE" "$@"
