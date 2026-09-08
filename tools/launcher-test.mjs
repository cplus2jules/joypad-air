import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import dgram from 'node:dgram';
import { setTimeout as sleep } from 'node:timers/promises';
import { runningPairing, openDesktop } from './paired-desktop.mjs';

const ports = { setupPort: 3444, upstreamPort: 3001, httpsPort: 3443, dsuPort: 26760 };
function endpoints(overrides = {}) {
  const invitation = { v: 1, port: 3443, ...overrides.invitation };
  return {
    pairing: { invitation: `joypadair://pair?data=${Buffer.from(JSON.stringify(invitation)).toString('base64url')}`, paired: [] },
    bridge: { app: 'joypad-air', port: 3001, dsu: { listening: true, host: '127.0.0.1', port: 26760 }, ...overrides.bridge },
  };
}
const reader = ({ pairing, bridge }) => async url => url.endsWith('/api/state') ? pairing : bridge;

test('reuses an already running paired bridge, including the pre-launcher API', async () => {
  assert.equal(await runningPairing(ports, reader(endpoints())), true);
  assert.equal(await runningPairing(ports, reader({ pairing: null, bridge: null })), false);
  assert.equal(await runningPairing(ports, reader({ ...endpoints(), pairing: {} })), false);
  assert.equal(await runningPairing(ports, reader(endpoints({ invitation: { port: 9999 } }))), false);
  assert.equal(await runningPairing(ports, reader(endpoints({ bridge: { app: 'unrelated' } }))), false);
  assert.equal(await runningPairing(ports, reader(endpoints({ bridge: { dsu: { listening: false } } }))), false);
  assert.equal(await runningPairing(ports, reader(endpoints({ bridge: { dsu: { listening: true, host: '127.0.0.1', port: 9999 } } }))), false);
});

test('opens pairing before the exact emulator launcher, without requesting a duplicate app', async () => {
  const calls = [];
  await openDesktop('http://127.0.0.1:3444/', { run: async (...args) => calls.push(args) });
  assert.deepEqual(calls[0].slice(0, 2), ['/usr/bin/open', ['http://127.0.0.1:3444/']]);
  assert.equal(calls[1][0], '/bin/bash');
  assert.ok(calls[1][1][0].endsWith('/tools/ryujinx-build/launch-local.sh'));
  assert.equal(calls[1][1][1], '--open');
});

test('browser failure leaves a usable URL and still opens the emulator; emulator failure is reported', async () => {
  let calls = 0;
  const warnings = [];
  await openDesktop('http://127.0.0.1:3444/', {
    run: async () => { if (++calls === 1) throw new Error('No browser'); },
    warn: message => warnings.push(message),
  });
  assert.equal(calls, 2);
  assert.match(warnings[0], /http:\/\/127.0.0.1:3444\//);
  await assert.rejects(openDesktop('http://127.0.0.1:3444/', {
    run: async command => { if (command === '/bin/bash') throw new Error('Missing emulator'); },
  }), /Missing emulator/);
});

async function freePort(udp = false) {
  const socket = udp ? dgram.createSocket('udp4') : net.createServer();
  if (udp) socket.bind(0, '127.0.0.1'); else socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}
async function until(check, label) {
  for (let i = 0; i < 160; i++) { if (await check()) return; await sleep(50); }
  throw new Error(`Timed out: ${label}`);
}

test('paired startup becomes reusable, then closing Terminal releases its own TCP and UDP ports', { timeout: 20000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'joypad-launcher-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const selected = { upstreamPort: await freePort(), setupPort: await freePort(), httpsPort: await freePort(), dsuPort: await freePort(true) };
  let log = '';
  const child = spawn(process.execPath, ['tools/start-pairing.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, FORCE_LOG: '1', JOYPAD_BONJOUR: '0', JOYPAD_LANG: 'en', JOYPAD_PAIRING_DIR: directory,
      PAIRING_BRIDGE_PORT: String(selected.upstreamPort), PAIRING_SETUP_PORT: String(selected.setupPort),
      PAIRING_HTTPS_PORT: String(selected.httpsPort), PAIRING_DSU_PORT: String(selected.dsuPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  child.stdout.on('data', bytes => { log += bytes; });
  child.stderr.on('data', bytes => { log += bytes; });
  await until(() => {
    if (child.exitCode !== null) throw new Error(`Startup failed: ${log}`);
    return log.includes('Open pairing on this Mac:');
  }, 'paired startup');
  assert.equal(await runningPairing(selected), true);
  const exited = once(child, 'exit');
  child.kill('SIGHUP');
  const [code] = await exited;
  assert.equal(code, 0);
  for (const [name, port] of Object.entries(selected)) {
    const socket = name === 'dsuPort' ? dgram.createSocket('udp4') : net.createServer();
    if (name === 'dsuPort') socket.bind(port, '127.0.0.1'); else socket.listen(port, '127.0.0.1');
    await once(socket, 'listening');
    await new Promise(resolve => socket.close(resolve));
  }
});
