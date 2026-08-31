#!/bin/bash
# Copy LaunchAgent snapshots from Application Support into this repo.
# Use after a scheduled pull if the files did not land in reports/clarity/
# (macOS TCC often blocks background writes to Documents).
set -euo pipefail
SUPPORT="$HOME/Library/Application Support/forever-party-rentals/snapshots"
DEST="$(cd "$(dirname "$0")" && pwd)"
if [[ ! -d "$SUPPORT" ]]; then
  echo "no snapshots at ${SUPPORT}"
  exit 1
fi
shopt -s nullglob
copied=0
for f in "$SUPPORT"/20*-*-*.md; do
  cp -f "$f" "$DEST/"
  copied=1
done
if [[ -f "$SUPPORT/series.md" ]]; then
  cp -f "$SUPPORT/series.md" "$DEST/"
  copied=1
fi
if [[ -d "$SUPPORT/raw" ]]; then
  mkdir -p "$DEST/raw"
  cp -R "$SUPPORT/raw/." "$DEST/raw/"
  copied=1
fi
shopt -u nullglob
if [[ "$copied" -eq 0 ]]; then
  echo "nothing to copy from ${SUPPORT}"
  exit 1
fi
echo "synced into ${DEST}"
