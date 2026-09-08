#!/bin/bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_DIR="${1:?Pass the source directory used to build the emulator.}"
DOTNET_BIN="${DOTNET_BIN:-dotnet}"
FIXTURES="$(mktemp -d)"
cd "$PROJECT_DIR"
node --input-type=module - "$FIXTURES" <<'JS'
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildProfile } from './server/ryujinx.js';
import { encodeDataResponse } from './server/dsu/packets.js';
const dir = process.argv[2];
writeFileSync(join(dir,'profile.json'),JSON.stringify(buildProfile(1,'JoyconRight',true,{deadzone:0})));
for(let i=0;i<2;i++)writeFileSync(join(dir,`motion-${i}.bin`),encodeDataResponse(1,0,i+1,{ax:0.25,ay:-0.5,az:0.75,pitch:90,yaw:-60,roll:-30,tsUs:1000000+16666*i}));
JS
"$DOTNET_BIN" run --project tools/ryujinx-build/tests/MotionContract.csproj -p:RyujinxSource="$SOURCE_DIR" -- "$FIXTURES/profile.json" "$FIXTURES/motion-0.bin" "$FIXTURES/motion-1.bin"
