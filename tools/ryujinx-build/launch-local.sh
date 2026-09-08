#!/bin/bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="${RYUJINX_MOTION_APP:-$PROJECT_DIR/.local/Ryujinx Motion.app}"
if [ -z "${RYUJINX_MOTION_APP:-}" ] && [ -f "$PROJECT_DIR/.local/emulator-build.json" ]; then
  APP="$(node -e 'const fs=require("node:fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1])).appPath)' "$PROJECT_DIR/.local/emulator-build.json")"
fi
DATA="${RYUJINX_CONFIG_DIR:-$PROJECT_DIR/.local/ryujinx-motion-data}"
[ -f "$DATA/Config.json" ] || { echo 'Run npm run ryujinx:prepare first.'; exit 1; }
[ -x "$APP/Contents/MacOS/Ryujinx" ] || { echo "Local motion build missing: $APP"; exit 1; }
if [ "${1:-}" = '--check' ]; then
  printf '%s\n' "$APP"
  exit 0
fi
# Local app bundles also discover this directory when opened from Finder or
# the Dock. Without it, a direct launch silently uses the stock input profile.
# Keep this alias inside the project; never replace another portable setup.
PORTABLE="$PROJECT_DIR/.local/portable"
if [ ! -e "$PORTABLE" ] && [ ! -L "$PORTABLE" ]; then
  ln -s "$DATA" "$PORTABLE"
elif [ ! "$PORTABLE" -ef "$DATA" ]; then
  echo "Existing portable data preserved: $PORTABLE. Use this launcher for the dance profile." >&2
fi
if [ "${1:-}" = '--open' ]; then
  shift
  # LaunchServices reuses this app if it is already open. It runs independently
  # of the bridge so closing Terminal cannot terminate an unsaved game.
  exec /usr/bin/open -a "$APP" --args --root-data-dir "$DATA" "$@"
fi
exec "$APP/Contents/MacOS/Ryujinx" --root-data-dir "$DATA" "$@"
