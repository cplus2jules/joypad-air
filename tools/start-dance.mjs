#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { inspectRyujinx } from '../server/ryujinx.js';
const configDir = fileURLToPath(new URL('../.local/ryujinx-motion-data', import.meta.url));
const dsuPort = Number(process.env.DSU_PORT || 26760);
if (!inspectRyujinx(configDir, { preset: 'just-dance', dsuPort }).synced) {
  throw new Error('The isolated Just Dance preset is missing or changed. Run npm run ryujinx:prepare for first setup; see docs/motion-implementation-status.md for recovery.');
}
process.env.RYUJINX_CONFIG_DIR = configDir;
process.env.JOYPAD_STRICT_PORTS = '1';
process.env.DSU_OFF = '0';
await import('../server/index.js');
