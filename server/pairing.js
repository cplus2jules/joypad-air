import { createServer as createHTTPServer } from 'node:http';
import { createServer as createHTTPSServer } from 'node:https';
import { randomUUID, randomInt, randomBytes, createHash, timingSafeEqual, X509Certificate, createPrivateKey } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { hostname, networkInterfaces } from 'node:os';
import { WebSocket, WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { pairingPage } from './pairing-page.js';
import { isPrivateAddress } from './validate.js';

const hash = text => createHash('sha256').update(text).digest();
const CODE_TTL = 5 * 60_000;
const MAX_BUFFER = 64 * 1024;
const cleanName = value => String(value || 'iPhone').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 64);
const loopback = ip => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);

function writePrivate(path, value) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}

export function loadPairingIdentity(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const statePath = join(directory, 'identity.json');
  const keyPath = join(directory, 'key.pem');
  const certPath = join(directory, 'cert.pem');
  let state;
  if (existsSync(statePath)) {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
    if (state.v !== 1 || typeof state.id !== 'string' || !Array.isArray(state.paired)) throw new Error('Pairing identity is invalid. Restore its backup or explicitly create a new identity.');
    if (state.paired.length > 16 || state.paired.some(p => typeof p.id !== 'string' || typeof p.name !== 'string' || typeof p.tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(p.tokenHash))) throw new Error('Saved phone credentials are invalid. Restore the pairing identity before starting.');
    if (!existsSync(keyPath) || !existsSync(certPath)) throw new Error('Pairing certificate is missing. Restore the identity; do not silently replace a trusted Mac.');
  } else {
    if (existsSync(keyPath) || existsSync(certPath)) throw new Error('An incomplete pairing identity exists. Inspect it before creating a replacement.');
    state = { v: 1, id: randomUUID(), name: cleanName(hostname().replace(/\.local$/, '')), paired: [] };
    execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '365',
      '-keyout', keyPath, '-out', certPath, '-subj', `/CN=Joypad-Air-${state.id}`], { stdio: 'ignore' });
    writePrivate(statePath, state);
  }
  chmodSync(keyPath, 0o600); chmodSync(certPath, 0o600);
  const cert = readFileSync(certPath);
  const certificate = new X509Certificate(cert);
  const key = readFileSync(keyPath);
  if (!certificate.checkPrivateKey(createPrivateKey(key))) throw new Error('Pairing key and certificate do not match. Restore the identity before starting.');
  if (Date.parse(certificate.validTo) < Date.now()) throw new Error('The pairing certificate expired. Renew the identity and pair phones again explicitly.');
  const fingerprint = createHash('sha256').update(certificate.raw).digest('hex');
  return { state, key, cert, fingerprint, save: () => writePrivate(statePath, state) };
}

export function localPairingHosts() {
  const addresses = Object.values(networkInterfaces()).flat().filter(Boolean)
    .filter(info => info.family === 'IPv4' && !info.internal && isPrivateAddress(info.address))
    .map(info => info.address);
  const localName = hostname().toLowerCase().replace(/\.local\.?$/, '');
  if (/^[a-z0-9-]+$/.test(localName)) addresses.push(`${localName}.local`);
  return [...new Set(addresses)].slice(0, 8);
}

export function createPairingAuthority(identity, clock = Date.now) {
  let invitation;
  const attempts = new Map();
  let globalAttempt = { started: clock(), count: 0 };
  function renew() {
    invitation = { code: String(randomInt(0, 1_000_000)).padStart(6, '0'), expiresAt: clock() + CODE_TTL };
    return invitation;
  }
  function current() {
    if (!invitation || invitation.expiresAt <= clock()) renew();
    return invitation;
  }
  function authorize(token) {
    if (typeof token !== 'string' || token.length > 128) return null;
    const digest = hash(token);
    return identity.state.paired.find(record => {
      const expected = Buffer.from(record.tokenHash, 'hex');
      return expected.length === digest.length && timingSafeEqual(expected, digest);
    }) ?? null;
  }
  function claim(code, name, address) {
    const now = clock();
    if (now - globalAttempt.started >= CODE_TTL) globalAttempt = { started: now, count: 0 };
    if (++globalAttempt.count > 30) return { status: 429, error: 'Too many attempts. Wait five minutes before trying again.' };
    for (const [key, attempt] of attempts) if (now - attempt.started > CODE_TTL) attempts.delete(key);
    if (!attempts.has(address) && attempts.size >= 128) return { status: 429, error: 'Too many pairing attempts.' };
    const attempt = attempts.get(address) ?? { started: now, count: 0 };
    attempt.count++;
    attempts.set(address, attempt);
    if (attempt.count > 5) {
      return { status: 429, error: 'Too many attempts. Wait five minutes before trying again.' };
    }
    if (!invitation || invitation.expiresAt <= now || !/^\d{6}$/.test(String(code)) || !timingSafeEqual(hash(String(code)), hash(invitation.code))) {
      return { status: 403, error: 'This code expired, was used, or does not match. Scan the current Mac QR code.' };
    }
    if (identity.state.paired.length >= 16) return { status: 409, error: 'Remove an unused paired phone on this Mac first.' };
    invitation = null; // A successful code is consumed once, before any asynchronous operation.
    const token = randomBytes(32).toString('base64url');
    const record = { id: randomUUID(), name: cleanName(name), tokenHash: hash(token).toString('hex'), createdAt: new Date(now).toISOString() };
    identity.state.paired.push(record);
    identity.save();
    return { status: 200, body: { token, id: identity.state.id, name: identity.state.name, clientID: record.id } };
  }
  function revoke(id) {
    const before = identity.state.paired.length;
    identity.state.paired = identity.state.paired.filter(record => record.id !== id);
    identity.save();
    return before !== identity.state.paired.length;
  }
  return { current, renew, claim, authorize, revoke };
}

function sendJSON(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(value));
}

async function readJSON(request) {
  let data = '';
  for await (const chunk of request) {
    data += chunk;
    if (Buffer.byteLength(data) > 4096) throw new Error('Request too large.');
  }
  return JSON.parse(data);
}

export async function startPairingServer({ directory, httpsPort = 3443, setupPort = 3444, upstreamPort = 3001, advertise = true, hosts, heartbeatMs = 1000 } = {}) {
  const identity = loadPairingIdentity(directory);
  const authority = createPairingAuthority(identity);
  const sessions = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const advertisedHosts = () => hosts ?? localPairingHosts();
  const invitation = () => ({ v: 1, id: identity.state.id, name: identity.state.name,
    hosts: advertisedHosts(), port: secure.address()?.port ?? httpsPort, fingerprint: identity.fingerprint, ...authority.current() });

  const secure = createHTTPSServer({ key: identity.key, cert: identity.cert, minVersion: 'TLSv1.2', handshakeTimeout: 10_000 }, async (req, res) => {
    if (!isPrivateAddress(req.socket.remoteAddress) || req.headers.origin) return sendJSON(res, 403, { error: 'Native local connections only.' });
    if (req.method !== 'POST' || req.url !== '/api/pairing/claim') return sendJSON(res, 404, { error: 'Not found.' });
    try {
      const body = await readJSON(req);
      const result = authority.claim(body.code, body.name, req.socket.remoteAddress);
      sendJSON(res, result.status, result.body ?? { error: result.error });
    } catch { sendJSON(res, 400, { error: 'Invalid pairing request.' }); }
  });
  secure.requestTimeout = 10_000;
  secure.headersTimeout = 10_000;
  secure.maxConnections = 64;
  secure.on('upgrade', (req, socket, head) => {
    const authorization = req.headers.authorization;
    const paired = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authority.authorize(authorization.slice(7)) : null;
    if (!isPrivateAddress(req.socket.remoteAddress) || req.headers.origin || req.url !== '/controller' || !paired) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return;
    }
    if (sessions.size >= 16) { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, client => {
      const upstream = new WebSocket(`ws://127.0.0.1:${upstreamPort}/?p=1`, { maxPayload: 64 * 1024, handshakeTimeout: 5000 });
      sessions.set(client, { upstream, clientID: paired.id, alive: true });
      client.on('pong', () => { const session = sessions.get(client); if (session) session.alive = true; });
      const close = (code = 1011, message = 'Connection closed') => {
        if (client.readyState < WebSocket.CLOSING) client.close(code, message);
        upstream.terminate();
        sessions.delete(client);
      };
      upstream.on('message', (data, binary) => {
        if (client.readyState !== WebSocket.OPEN) return;
        if (client.bufferedAmount > MAX_BUFFER) return close(1013, 'Phone is not receiving current input status');
        client.send(data, { binary });
      });
      client.on('message', (data, binary) => {
        if (upstream.readyState !== WebSocket.OPEN || binary || upstream.bufferedAmount > MAX_BUFFER) return close(1013, 'Controller relay stalled');
        upstream.send(data, { binary: false });
      });
      upstream.on('close', code => close(code === 4000 ? 4000 : 1011, code === 4000 ? 'Replaced by another controller' : 'Bridge connection closed'));
      upstream.on('error', () => close());
      client.on('error', () => close());
      client.on('close', () => close());
      // The upstream answers the bridge's pings itself; independently probe
      // the phone so a Wi-Fi loss cannot leave upstream buttons held.
    });
  });

  const setup = createHTTPServer(async (req, res) => {
    const actualPort = setup.address()?.port ?? setupPort;
    const expectedHost = `127.0.0.1:${actualPort}`;
    if (!loopback(req.socket.remoteAddress) || req.headers.host !== expectedHost) return sendJSON(res, 403, { error: 'Open pairing on this Mac using 127.0.0.1.' });
    const url = new URL(req.url, `http://${expectedHost}`);
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" });
      res.end(pairingPage);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const payload = invitation();
      const text = `joypadair://pair?data=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
      return sendJSON(res, 200, { name: identity.state.name, invitation: text, expiresAt: payload.expiresAt,
        qr: await QRCode.toDataURL(text, { width: 420, margin: 2, errorCorrectionLevel: 'M' }),
        paired: identity.state.paired.map(({ id, name, createdAt }) => ({ id, name, createdAt, connected: [...sessions.values()].some(session => session.clientID === id) })) });
    }
    if (req.method === 'POST') {
      if (req.headers.origin !== `http://${expectedHost}` || req.headers['x-joypad-pairing'] !== '1') return sendJSON(res, 403, { error: 'Use the local pairing page.' });
      try {
        if (url.pathname === '/api/renew') { authority.renew(); return sendJSON(res, 200, { ok: true }); }
        if (url.pathname === '/api/revoke') {
          const body = await readJSON(req);
          authority.revoke(body.id);
          for (const [client, session] of sessions) if (session.clientID === body.id) { client.close(4001, 'Pairing removed on Mac'); session.upstream.terminate(); sessions.delete(client); }
          return sendJSON(res, 200, { ok: true });
        }
      } catch { return sendJSON(res, 400, { error: 'Invalid request.' }); }
    }
    sendJSON(res, 404, { error: 'Not found.' });
  });
  setup.requestTimeout = 10_000;
  setup.headersTimeout = 10_000;
  await new Promise((resolve, reject) => { secure.once('error', reject); secure.listen(httpsPort, '0.0.0.0', resolve); });
  try { await new Promise((resolve, reject) => { setup.once('error', reject); setup.listen(setupPort, '127.0.0.1', resolve); }); }
  catch (error) { secure.close(); throw error; }
  const heartbeat = setInterval(() => {
    for (const [client, session] of sessions) {
      if (!session.alive) {
        client.terminate(); session.upstream.terminate(); sessions.delete(client);
      } else {
        session.alive = false;
        client.ping();
      }
    }
  }, heartbeatMs);
  heartbeat.unref();
  let advertisement;
  if (advertise && process.platform === 'darwin') {
    advertisement = spawn('/usr/bin/dns-sd', ['-R', `${identity.state.name} · Joypad Air`, '_joypadair._tcp', 'local', String(secure.address().port), `id=${identity.state.id}`, 'v=1', 'tls=1'], { stdio: 'ignore' });
    advertisement.on('error', () => { console.warn('[pairing] Bonjour unavailable. QR and pairing text still work.'); });
  }
  return {
    identity, authority, httpsPort: secure.address().port, setupPort: setup.address().port,
    setupURL: `http://127.0.0.1:${setup.address().port}/`,
    close: async () => {
      clearInterval(heartbeat);
      advertisement?.kill('SIGTERM');
      for (const [client, session] of sessions) { client.terminate(); session.upstream.terminate(); }
      sessions.clear(); wss.close();
      await Promise.all([new Promise(resolve => secure.close(resolve)), new Promise(resolve => setup.close(resolve))]);
    },
  };
}

