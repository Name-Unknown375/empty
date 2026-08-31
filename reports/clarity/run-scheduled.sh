#!/bin/bash
# Prefer the signed app (Documents-safe). Falls back only if not installed.
set -euo pipefail
APP="$HOME/Library/Application Support/forever-party-rentals/ClarityPull.app/Contents/MacOS/ClarityPull"
if [[ -x "$APP" ]]; then
  exec "$APP"
fi
echo "Clarity pull app missing. Run ./reports/clarity/install-launchd.sh" >&2
exit 1
