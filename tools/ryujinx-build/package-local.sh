#!/bin/bash
# Package an existing Apple Silicon publish output. Destination must be new.
set -euo pipefail
SOURCE_DIR="$1"
PUBLISH_DIR="$2"
DEST="$3"
[ ! -e "$DEST" ] || { echo "Destination already exists: $DEST"; exit 1; }
[ -f "$PUBLISH_DIR/Ryujinx" ] || { echo 'Publish output is missing.'; exit 1; }
mkdir -p "$(dirname "$DEST")"
STAGE="$(mktemp -d)"
(
  cd "$SOURCE_DIR/distribution/macos"
  bash create_app_bundle.sh "$PUBLISH_DIR" "$STAGE" "$SOURCE_DIR/distribution/macos/entitlements.xml"
)
python3 - "$STAGE/Ryujinx.app/Contents/Info.plist" <<'PY'
import plistlib,sys
p=sys.argv[1]
with open(p,'rb') as f: v=plistlib.load(f)
v.update(CFBundleIdentifier='local.joypadair.RyujinxMotion',CFBundleName='Ryujinx Motion',CFBundleDisplayName='Ryujinx Motion',CFBundleShortVersionString='1.3.3',CFBundleVersion='1.3.3-e2143d4-joypad-motion')
with open(p,'wb') as f: plistlib.dump(v,f)
PY
codesign --entitlements "$SOURCE_DIR/distribution/macos/entitlements.xml" --force --sign - "$STAGE/Ryujinx.app"
codesign --verify --deep --strict "$STAGE/Ryujinx.app"
mv "$STAGE/Ryujinx.app" "$DEST"
rmdir "$STAGE"
