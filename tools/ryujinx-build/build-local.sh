#!/bin/bash
# Build the pinned local motion variant without replacing any installed app.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PIN=e2143d43bcb6762340d8a01f20e7b5fdf104f02f
PATCH_FILE="$SCRIPT_DIR/../ryubing-motion.patch"
DOTNET_BIN="${DOTNET_BIN:-dotnet}"
export DOTNET_CLI_TELEMETRY_OPTOUT=1
command -v "$DOTNET_BIN" >/dev/null || { echo 'Install .NET SDK 9 or set DOTNET_BIN to its executable.'; exit 1; }
mkdir -p "$PROJECT_DIR/.local/builds"
BUILD_DIR="$(mktemp -d "$PROJECT_DIR/.local/builds/ryujinx-motion.XXXXXX")"
SOURCE_DIR="$BUILD_DIR/source"
DEST="$BUILD_DIR/Ryujinx Motion.app"
printf 'Build directory: %s\n' "$BUILD_DIR"
git clone --depth 1 --branch 1.3.3 https://git.ryujinx.app/ryubing/ryujinx.git "$SOURCE_DIR"
[ "$(git -C "$SOURCE_DIR" rev-parse HEAD)" = "$PIN" ] || { echo 'Source revision mismatch; review before updating the pin.'; exit 1; }
git -C "$SOURCE_DIR" apply --check "$PATCH_FILE"
git -C "$SOURCE_DIR" apply "$PATCH_FILE"
(
  cd "$SOURCE_DIR"
  "$DOTNET_BIN" restore src/Ryujinx -r osx-arm64 --disable-parallel -m:1 -p:RestoreUseStaticGraphEvaluation=true
  "$DOTNET_BIN" publish src/Ryujinx -m:1 --no-restore -c Release -r osx-arm64 --self-contained true \
    -p:DebugType=embedded -p:Version=1.3.3 -p:SourceRevisionId=e2143d4-joypad-motion -o "$BUILD_DIR/publish"
)
DOTNET_BIN="$DOTNET_BIN" bash "$SCRIPT_DIR/test-local.sh" "$SOURCE_DIR"
bash "$SCRIPT_DIR/package-local.sh" "$SOURCE_DIR" "$BUILD_DIR/publish" "$DEST"
node --input-type=module - "$PROJECT_DIR" "$SOURCE_DIR" "$DEST" "$PIN" "$PATCH_FILE" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const [root, sourceDir, appPath, sourceRevision, patchPath] = process.argv.slice(2);
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
writeFileSync(join(root, '.local', 'emulator-build.json'), JSON.stringify({
  sourceRevision, sourceDir, appPath, patchSHA256: hash(patchPath),
  executableSHA256: hash(join(appPath, 'Contents/MacOS/Ryujinx')),
  builtAt: new Date().toISOString(), tests: 'Emulator contract passed; physical scoring requires a separate test.',
}, null, 2));
JS
printf '\nBuilt: %s\nStock Ryujinx is unchanged.\n' "$DEST"
