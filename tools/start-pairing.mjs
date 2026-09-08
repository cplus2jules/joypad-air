#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { startPairingServer } from '../server/pairing.js';
import { inspectRyujinx } from '../server/ryujinx.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const configDir = process.env.RYUJINX_CONFIG_DIR || fileURLToPath(new URL('../.local/ryujinx-motion-data', import.meta.url));
const spanish = /^es(?:[-_]|$)/i.test(process.env.JOYPAD_LANG || '');
const say = (en, es) => console.log(spanish ? es : en);
function port(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error(`${name}: expected port 1024–65535`);
  return value;
}
let child, pairing, stopped = false;
async function stop(code = 0) {
  if (stopped) return;
  stopped = true;
  await pairing?.close();
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(2000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  process.exitCode = code;
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());

try {
  const upstreamPort = port('PAIRING_BRIDGE_PORT', 3001);
  const dsuPort = port('PAIRING_DSU_PORT', 26760);
  const httpsPort = port('PAIRING_HTTPS_PORT', 3443);
  const setupPort = port('PAIRING_SETUP_PORT', 3444);
  if (new Set([upstreamPort, httpsPort, setupPort]).size !== 3) throw new Error('HTTP, setup and internal bridge ports must differ.');
  if (process.env.FORCE_LOG !== '1' && !inspectRyujinx(configDir, { preset:'just-dance', dsuPort }).synced) {
    throw new Error(spanish ? 'Falta el perfil local de Just Dance. Consulta docs/motion-implementation-status.md.' : 'The isolated Just Dance profile is missing or changed. See docs/motion-implementation-status.md.');
  }
  let ready = false, startupTail = '';
  child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT:String(upstreamPort), DSU_PORT:String(dsuPort), DSU_HOST:'127.0.0.1', DSU_OFF:'0',
      JOYPAD_BIND_HOST:'127.0.0.1', JOYPAD_QUIET_STARTUP:'1', JOYPAD_STRICT_PORTS:'1', RYUJINX_CONFIG_DIR:configDir },
    stdio: ['ignore','pipe','pipe'],
  });
  child.on('error', error => { console.error(error.message); void stop(1); });
  child.stdout.on('data', bytes => {
    const message = bytes.toString();
    startupTail = (startupTail + message).slice(-4096);
    if (startupTail.includes(`Internal bridge listening on 127.0.0.1:${upstreamPort}`)) ready = true;
    process.stdout.write(bytes);
  });
  child.stderr.pipe(process.stderr);
  child.on('exit', code => { if (!stopped) { console.error(`[pairing] Internal bridge stopped (${code}).`); void stop(1); } });
  for (let i=0; i<100 && !ready && !stopped; i++) await sleep(100);
  if (!ready || stopped) throw new Error('Internal bridge could not start. Stop the previous Joypad Air server before starting paired mode.');
  // Check the exact child-selected port; never relay to an unrelated old server.
  const status = await (await fetch(`http://127.0.0.1:${upstreamPort}/status`, {signal:AbortSignal.timeout(3000)})).json();
  if (status.app !== 'joypad-air' || !status.dsu?.listening) throw new Error('Internal motion bridge is not ready.');
  pairing = await startPairingServer({
    directory: process.env.JOYPAD_PAIRING_DIR || fileURLToPath(new URL('../.local/pairing', import.meta.url)),
    httpsPort, setupPort, upstreamPort, advertise: process.env.JOYPAD_BONJOUR !== '0',
  });
  if (stopped) { await pairing.close(); throw new Error('Pairing startup was interrupted.'); }
  say(`Open pairing on this Mac: ${pairing.setupURL}`, `Abre el enlace de emparejamiento en este Mac: ${pairing.setupURL}`);
  say('Scan its QR in Joypad Air on your iPhone. Saved phones reconnect securely. Leave Terminal open.',
    'Escanea el QR desde Joypad Air en el iPhone. Los teléfonos guardados se reconectan de forma segura. Deja Terminal abierto.');
} catch (error) {
  console.error(`[pairing] ${error.message}`);
  await stop(1);
}
