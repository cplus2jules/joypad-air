import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const emulatorLauncher = fileURLToPath(new URL('./ryujinx-build/launch-local.sh', import.meta.url));

export async function checkDesktopLaunch(run = execute) {
  if (process.platform !== 'darwin') throw new Error('The double-click launcher requires macOS.');
  try { await run('/bin/bash', [emulatorLauncher, '--check'], { timeout: 5000 }); }
  catch (error) { throw new Error(error.stdout?.trim() || error.stderr?.trim() || error.message); }
}

// Read the existing setup API so a bridge started before this launcher was
// installed can be reused too. Invitation contents stay in memory, never logs.
export async function runningPairing({ setupPort, upstreamPort, httpsPort, dsuPort }, fetchJSON = readJSON) {
  const [pairing, bridge] = await Promise.all([
    fetchJSON(`http://127.0.0.1:${setupPort}/api/state`),
    fetchJSON(`http://127.0.0.1:${upstreamPort}/status`),
  ]);
  if (!pairing || !bridge) return false;
  try {
    const invitationURL = new URL(pairing.invitation);
    if (invitationURL.protocol !== 'joypadair:' || invitationURL.hostname !== 'pair') return false;
    const invitation = JSON.parse(Buffer.from(invitationURL.searchParams.get('data'), 'base64url').toString());
    return invitation.v === 1 && invitation.port === httpsPort && Array.isArray(pairing.paired) &&
      bridge.app === 'joypad-air' && bridge.port === upstreamPort &&
      bridge.dsu?.listening === true && bridge.dsu.host === '127.0.0.1' && bridge.dsu.port === dsuPort;
  } catch { return false; }
}

async function readJSON(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500), redirect: 'error' });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

export async function openDesktop(setupURL, { run = execute, warn = console.warn } = {}) {
  // Open the page first; the emulator is brought forward last for menu input.
  try { await run('/usr/bin/open', [setupURL], { timeout: 5000 }); }
  catch { warn(`Open the pairing page in your browser: ${setupURL}`); }
  try { await run('/bin/bash', [emulatorLauncher, '--open'], { timeout: 10000 }); }
  catch (error) { throw new Error(error.stdout?.trim() || error.stderr?.trim() || error.message); }
}
