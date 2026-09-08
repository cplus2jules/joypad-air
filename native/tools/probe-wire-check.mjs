#!/usr/bin/env node
// Swift's actual encoder -> isolated Node bridge -> decoded DSU packet.
// No real keyboard input or writes to emulator settings.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import dgram from 'node:dgram';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { encodeDataRequest, decodeResponse, MSG } from '../../server/dsu/packets.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = process.argv[2];
assert.ok(fixture, 'Pass the compiled ProbeWireFixture executable path.');
const frames = execFileSync(fixture, { encoding: 'utf8' }).trim().split('\n');
assert.equal(frames.length, 5);
const probe = createServer().listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const portProbe = dgram.createSocket('udp4');
portProbe.bind(0, '127.0.0.1');
await once(portProbe, 'listening');
const dsuPort = portProbe.address().port;
portProbe.close();
let output = '';
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, FORCE_LOG: '1', PORT: String(port), DSU_PORT: String(dsuPort), DSU_HOST: '127.0.0.1', ACCESSIBILITY_PROMPT: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', data => { output += data; });
server.stderr.on('data', data => { output += data; });
const udp = dgram.createSocket('udp4');
let ws;
const responses = [];
const messages = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await delay(20);
  }
  throw new Error(`Timed out: ${label}`);
}
async function status() {
  return (await fetch(`http://127.0.0.1:${port}/status`, { signal: AbortSignal.timeout(1000) })).json();
}
try {
  await until(async () => { try { return (await status()).dsu?.listening; } catch { return false; } }, 'isolated bridge startup');
  udp.on('message', data => { const packet = decodeResponse(data); if (packet) responses.push(packet); });
  udp.connect(dsuPort, '127.0.0.1');
  await once(udp, 'connect');
  udp.send(encodeDataRequest(0, 0));
  await until(async () => (await status()).dsu.subscribers === 1, 'DSU subscription');
  ws = new WebSocket(`ws://127.0.0.1:${port}/?p=1`);
  ws.on('message', raw => messages.push(JSON.parse(raw)));
  await once(ws, 'open');
  await until(() => messages.some(m => m.t === 'hello' && m.motionProfiles?.includes('just-dance')), 'capability handshake');
  ws.send(frames[0]);
  const ack = await until(() => messages.find(m => m.t === 'config-ack' && m.motion), 'dance acknowledgment');
  assert.equal(ack.motionProfile, 'just-dance');
  assert.equal(ack.orientation, 'portrait');
  ws.send(frames[1]);
  ws.send(frames[2]);
  ws.send(frames[3]);
  const packet = await until(() => responses.find(p => p.type === MSG.DATA && p.pitch > 0), 'Swift motion at DSU');
  assert.equal(packet.crcOk, true);
  assert.equal(packet.size, 100);
  for (const [key, expected] of Object.entries({ ax: 0.2, ay: -0.8, az: 0.4, pitch: 180, yaw: 540, roll: -360 })) {
    assert.ok(Math.abs(packet[key] - expected) < 0.0001, `${key}: ${packet[key]} vs ${expected}`);
  }
  ws.send(frames[3]); // duplicate sequence must not reach DSU
  await until(async () => (await status()).players[1].motionDropped >= 1, 'duplicate sequence rejection');
  await until(() => /DOWN/.test(output) && /UP\s+/.test(output), 'ordered button tap');
  assert.ok(output.indexOf('DOWN') < output.indexOf('UP  '));
  await until(async () => (await status()).dsu.slots[0] == null, '250 ms motion freshness watchdog');
  const neutral = responses.find(p => p.type === MSG.DATA && p.pitch === 0 && p.yaw === 0 && p.roll === 0);
  assert.ok(neutral, 'Watchdog emits zero angular velocity before disconnecting motion');
  const bridge = await status();
  assert.deepEqual(bridge.players[1].heldButtons, []);
  assert.equal(bridge.invalidMsgs, 0);
  ws.send(frames[4]);
  await until(() => messages.some(m => m.t === 'config-ack' && m.motion === false), 'motion disable acknowledgment');
  console.log('PASS: Swift wire encoder → Node handshake/config → FIFO A tap → DSU units/axes/CRC → duplicate rejection → stale-motion neutralization.');
} finally {
  ws?.terminate();
  try { udp.close(); } catch {}
  server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), delay(2000)]);
  if (server.exitCode == null) server.kill('SIGKILL');
}
