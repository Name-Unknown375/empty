#!/bin/bash
# Install a macOS LaunchAgent that runs the Clarity pull on the collection dates.
# The job is a signed .app in Application Support (not /bin/bash under Documents).
# First launch may prompt to allow Documents access — click Allow.
#   ./reports/clarity/install-launchd.sh
#   ./reports/clarity/install-launchd.sh --uninstall
set -euo pipefail
LABEL="com.foreverpartyrentals.clarity-pull"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SUPPORT="$HOME/Library/Application Support/forever-party-rentals"
APP="$SUPPORT/ClarityPull.app"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
UID_NUM="$(id -u)"
DOMAIN="gui/${UID_NUM}"
REPO_CLARITY="$ROOT/reports/clarity"

uninstall() {
  launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
  rm -f "$PLIST"
  rm -rf "$APP"
  echo "removed ${LABEL}"
}

if [[ "${1:-}" == "--uninstall" ]]; then
  uninstall
  exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents" "$SUPPORT/snapshots/raw" \
  "$APP/Contents/MacOS" "$APP/Contents/Resources"
chmod +x "$ROOT/reports/clarity/pull.py"

cp "$ROOT/reports/clarity/pull.py" "$SUPPORT/pull.py"
chmod 755 "$SUPPORT/pull.py"

shopt -s nullglob
for f in "$ROOT/reports/clarity"/20*-*-*.md "$ROOT/reports/clarity/series.md"; do
  [[ -f "$f" ]] && cp -f "$f" "$SUPPORT/snapshots/"
done
if [[ -d "$ROOT/reports/clarity/raw" ]]; then
  cp -R "$ROOT/reports/clarity/raw/." "$SUPPORT/snapshots/raw/"
fi
shopt -u nullglob

if [[ -f "$ROOT/reports/clarity/.env" ]]; then
  cp "$ROOT/reports/clarity/.env" "$SUPPORT/clarity.env"
  chmod 600 "$SUPPORT/clarity.env"
fi

cat >"$SUPPORT/paths.h" <<EOF
#define FPR_SUPPORT "$SUPPORT"
#define FPR_REPO "$REPO_CLARITY"
#define FPR_HOME "$HOME"
EOF

cc -O2 -I "$SUPPORT" -o "$APP/Contents/MacOS/ClarityPull" \
  "$ROOT/reports/clarity/launch.c"
chmod 755 "$APP/Contents/MacOS/ClarityPull"

cat >"$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>ClarityPull</string>
  <key>CFBundleIdentifier</key>
  <string>${LABEL}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>FPR Clarity Pull</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSDocumentsFolderUsageDescription</key>
  <string>Save Microsoft Clarity snapshots into the Forever Party Rentals project.</string>
</dict>
</plist>
EOF

codesign --force --sign - --identifier "$LABEL" "$APP" >/dev/null

cal_entry() {
  local month="$1" day="$2"
  cat <<EOF
    <dict>
      <key>Month</key><integer>${month}</integer>
      <key>Day</key><integer>${day}</integer>
      <key>Hour</key><integer>10</integer>
      <key>Minute</key><integer>0</integer>
    </dict>
EOF
}

{
  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>AssociatedBundleIdentifiers</key>
  <array>
    <string>${LABEL}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${SUPPORT}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${APP}/Contents/MacOS/ClarityPull</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
EOF
  cal_entry 8 24
  cal_entry 8 27
  cal_entry 8 30
  cal_entry 9 2
  cal_entry 9 5
  cal_entry 9 8
  cal_entry 9 11
  cal_entry 9 14
  cal_entry 9 17
  cal_entry 9 20
  cal_entry 9 23
  cat <<EOF
  </array>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${SUPPORT}/clarity-pull.log</string>
  <key>StandardErrorPath</key>
  <string>${SUPPORT}/clarity-pull.log</string>
</dict>
</plist>
EOF
} >"$PLIST"

launchctl bootout "${DOMAIN}/${LABEL}" 2>/dev/null || true
launchctl bootstrap "${DOMAIN}" "$PLIST"
echo "installed ${PLIST}"
echo "app: ${APP}"
echo "snapshots: ${SUPPORT}/snapshots"
echo "fires 10:00 local on 24/27/30 Aug and 2/5/8/11/14/17/20/23 Sep"
if [[ ! -f "$SUPPORT/clarity.env" ]]; then
  echo "WARNING: ${SUPPORT}/clarity.env is missing. Copy reports/clarity/.env there."
fi
echo "Opening the app once so macOS can ask for Documents access…"
open "$APP"
