#!/usr/bin/env node
// Read-only, finite capture of the motion packets exposed to an emulator.
// Does not take a controller slot, inject keys, or retain pairing credentials.
import dgram from 'node:dgram';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { once } from 'node:events';
import { encodeDataRequest, decodeResponse, MSG } from '../server/dsu/packets.js';

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const seconds = Number(option('--seconds', 30));
const port = Number(option('--port', 26760));
const statusPort = Number(option('--status-port', 3001));
const slot = Number(option('--slot', 0));
if (!Number.isFinite(seconds) || seconds < 1 || seconds > 300 ||
    ![port, statusPort].every(n => Number.isInteger(n) && n > 0 && n <= 65535) ||
    !Number.isInteger(slot) || slot < 0 || slot > 3) {
  throw new Error('Use --seconds 1–300, valid --port/--status-port, and --slot 0–3.');
}
const startedAt = new Date().toISOString();
const directory = resolve(option('--output', `.local/diagnostics/motion-${startedAt.replace(/[:.]/g, '-')}`));
await mkdir(directory, { recursive: true });
const records = [];
const samples = [];
const statusSamples = [];
const start = performance.now();
let invalidPackets = 0;
let stopped = false;
const stop = () => { stopped = true; };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
const socket = dgram.createSocket('udp4');
let socketError;
socket.on('error', error => { socketError = error.message; stop(); });
const elapsed = () => performance.now() - start;
const status = async () => {
  try {
    const data = await fetch(`http://127.0.0.1:${statusPort}/status`, { signal: AbortSignal.timeout(1000) }).then(r => r.json());
    const player = data.players?.[slot + 1];
    const row = { type: 'status', elapsedMs: elapsed(), connected: player?.connected,
      motion: player?.motion, profile: player?.motionProfile, motionSeq: player?.motionSeq,
      rejectedSequences: player?.motionDropped, messagesPerSecond: player?.msgsPerSec,
      heldButtons: player?.heldButtons, stickDirections: player?.stickDirs,
      reportedHz: data.dsu?.slots?.[slot]?.hz, latestSampleAgeMs: data.dsu?.slots?.[slot]?.ageMs,
      subscribersIncludingRecorder: data.dsu?.subscribers, ryujinxFocused: data.ryujinxFocused,
      invalidMessages: data.invalidMsgs, queueDepth: data.queueDepth };
    statusSamples.push(row); records.push(row);
  } catch (error) { records.push({ type: 'status-error', elapsedMs: elapsed(), error: error.message }); }
};
socket.on('message', bytes => {
  const p = decodeResponse(bytes);
  if (!p || !p.crcOk || (p.type === MSG.DATA && p.size !== 100)) { invalidPackets++; return; }
  if (p.type !== MSG.DATA || p.slot !== slot) return;
  const row = { type: 'sample', elapsedMs: elapsed(), packetId: p.packetId,
    sensorTimestampUs: p.tsUs.toString(), ax: p.ax, ay: p.ay, az: p.az,
    pitch: p.pitch, yaw: p.yaw, roll: p.roll };
  samples.push(row); records.push(row);
});
const metadata = { type: 'metadata', startedAt, secondsRequested: seconds, slot,
  boundary: 'Bridge DSU output; acceleration in g, angular velocity in degrees/second.',
  timestamp: 'Rebased sensor time; receive time uses the Mac monotonic clock. Not one-way latency.',
  limitation: 'This recorder is a DSU subscriber. Recording is not proof that a game consumed or scored the data.' };
records.push(metadata);
let tick;
try {
  await status(); // Subscriber count before this recorder subscribes.
  socket.connect(port, '127.0.0.1');
  await once(socket, 'connect');
  socket.send(encodeDataRequest(0x4a415452, slot));
  tick = setInterval(() => socket.send(encodeDataRequest(0x4a415452, slot)), 250);
  console.log(`Recording up to ${seconds}s to ${directory}`);
  while (!stopped && elapsed() < seconds * 1000) { await sleep(500); await status(); }
} finally {
  clearInterval(tick);
  try { socket.close(); } catch {}
  process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
  const sensorIntervals = [], receiveIntervals = [], acceleration = [], gyro = [];
  let missingPackets = 0, nonMonotonicPackets = 0, nonMonotonicTimestamps = 0;
  for (let i = 0; i < samples.length; i++) {
    const current = samples[i];
    acceleration.push(Math.hypot(current.ax, current.ay, current.az));
    gyro.push(Math.hypot(current.pitch, current.yaw, current.roll));
    if (!i) continue;
    const previous = samples[i - 1];
    const delta = (current.packetId - previous.packetId) >>> 0;
    if (delta === 0 || delta > 0x7fffffff) nonMonotonicPackets++;
    else missingPackets += delta - 1;
    const timeDelta = Number(BigInt(current.sensorTimestampUs) - BigInt(previous.sensorTimestampUs)) / 1000;
    if (timeDelta <= 0) nonMonotonicTimestamps++;
    else sensorIntervals.push(timeDelta);
    receiveIntervals.push(current.elapsedMs - previous.elapsedMs);
  }
  const stats = values => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = q => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
    return { min: sorted[0], median: percentile(.5), p95: percentile(.95), max: sorted.at(-1) };
  };
  const summary = { startedAt, durationSeconds: elapsed() / 1000, samples: samples.length,
    receivedHzDuringSamples: samples.length > 1 ? (samples.length - 1) * 1000 / (samples.at(-1).elapsedMs - samples[0].elapsedMs) : null,
    sensorIntervalsMs: stats(sensorIntervals), receiveIntervalsMs: stats(receiveIntervals),
    receiveGapsOver100ms: receiveIntervals.filter(n => n > 100).length,
    accelerationMagnitudeG: stats(acceleration), gyroMagnitudeDegreesPerSecond: stats(gyro),
    invalidPackets, missingPackets, nonMonotonicPackets, nonMonotonicTimestamps,
    subscribersBeforeRecording: statusSamples[0]?.subscribersIncludingRecorder ?? null,
    keyboardWasFocusedOnRyujinx: statusSamples.some(s => s.ryujinxFocused), socketError,
    caveat: 'Poses and choreography were not labeled. These measurements do not establish calibration or game scoring.' };
  records.sort((a, b) => (a.elapsedMs ?? -1) - (b.elapsedMs ?? -1));
  await writeFile(resolve(directory, 'trace.jsonl'), records.map(row => JSON.stringify(row)).join('\n') + '\n');
  await writeFile(resolve(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
  if (socketError) process.exitCode = 1;
}
