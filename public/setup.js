import { setupErrorKey } from './i18n/setup-errors.js';
import { t, initLanguage, onLanguageChange } from './i18n.js';

const $ = id => document.getElementById(id);
let phoneUrl = null;
let refreshing = false;
let lastStatus = null;
let offline = false;
let configureNotice = null;
let copyNotice = null;
const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
$('configure').disabled = !local;
if (!local) configureNotice = { key: 'setup.localOnly' };

for (const n of [1, 2]) {
  const row = document.createElement('div'); row.className = 'live-player';
  const number = document.createElement('span'); number.className = 'player-number'; number.textContent = n;
  const info = document.createElement('div');
  const name = document.createElement('strong'); name.id = `player-${n}-name`;
  const status = document.createElement('small'); status.id = `player-${n}-status`;
  info.append(name, status); row.append(number, info); $('players').append(row);
}

function check(id, ok, text) {
  $(id + '-icon').className = `check-icon ${ok === true ? 'ok' : ok === false ? 'warn' : ''}`;
  $(id + '-icon').textContent = ok === true ? '✓' : ok === false ? '!' : '·';
  $(id + '-status').textContent = text;
}

function renderNotices() {
  for (const [id, notice] of [['configure-result', configureNotice], ['copy-result', copyNotice]]) {
    $(id).textContent = notice ? t(notice.key, notice.values) : '';
  }
}

function controllerType(type) {
  return t(({ ProController: 'full', JoyconLeft: 'left', JoyconRight: 'right' })[type] || 'setup.unconfigured');
}


function renderStatus() {
  const s = lastStatus;
  renderNotices();
  $('offline').hidden = !offline;
  if (s) {
    phoneUrl = s.urls?.[0] ?? null;
    $('phone-url').textContent = phoneUrl ?? t('setup.connectWifi');
    $('phone-url').href = phoneUrl ?? '/'; $('copy').disabled = !phoneUrl;
    $('qr').hidden = !phoneUrl; $('qr-error').hidden = !!phoneUrl;
    check('backend', s.native, t(s.native ? 'setup.keyboardReady' : 'setup.keyboardMissing'));
    check('access', s.accessibility === true, t(s.accessibility === true ? 'setup.accessReady' : 'setup.accessMissing'));
    const types = (s.ryujinx?.players ?? []).map(p => t('setup.profileType', { n: p.player, type: controllerType(p.type) })).join(' · ');
    const issueKey = s.ryujinx?.found === false ? 'ryujinxMissing'
      : s.ryujinx?.issue?.includes('could not be read') ? 'setup.readError' : 'ryujinxHelp';
    check('ryu', s.ryujinx?.synced, s.ryujinx?.synced ? t('setup.profilesReady', { types }).trim() : t(issueKey));
    check('focus', s.ryujinxFocused, t(s.ryujinxFocused ? 'setup.focusReady' : s.ryujinxFocused === false ? 'setup.focusResume' : 'setup.focusWaiting'));
    const count = [s.native, s.accessibility === true, s.ryujinx?.synced, s.ryujinxFocused].filter(Boolean).length;
    $('ready-count').textContent = t('setup.readyCount', { count });
    $('server-version').textContent = `JOYPAD AIR / ${s.version}`;
  }
  let connected = 0;
  for (const n of [1, 2]) {
    const p = s?.players?.[n]; connected += p?.connected ? 1 : 0;
    $(`player-${n}-name`).textContent = p?.connected ? p.name || t('player', { n }) : t('player', { n });
    const held = [
      ...(p?.heldButtons ?? []).map(button => button.startsWith('dpad_') ? t(`direction.${button.slice(5)}`) : button.toUpperCase()),
      ...(p?.stickDirs?.L ?? []).map(d => `L ${t(`direction.${d}`)}`),
      ...(p?.stickDirs?.R ?? []).map(d => `R ${t(`direction.${d}`)}`),
    ];
    $(`player-${n}-status`).textContent = p?.connected
      ? held.length ? held.join(' · ') : `${t('connected')}${p.rttMs != null ? ` · ${p.rttMs} ms` : ''}`
      : t('setup.waitingPhone');
    $(`player-${n}-status`).className = p?.connected ? 'online' : '';
  }
  $('player-count').textContent = `${connected} / 2`;
  if (offline) {
    $('ready-count').textContent = t('setup.serverOffline');
    ['backend', 'access', 'ryu', 'focus'].forEach(id => check(id, null, t('setup.serverRecheck')));
    for (const n of [1, 2]) { $(`player-${n}-status`).textContent = t('setup.unknownConnection'); $(`player-${n}-status`).className = ''; }
  }
}

async function refresh(force = false) {
  if (refreshing) return;
  refreshing = true;
  if (force) $('refresh').disabled = true;
  try {
    const res = await fetch(`/status${force ? '?refresh=1' : ''}`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error('offline');
    lastStatus = await res.json(); offline = false;
    if (force && lastStatus.urls?.[0]) $('qr').src = `/qr.png?refresh=${Date.now()}`;
  } catch { offline = true; }
  finally { refreshing = false; $('refresh').disabled = false; renderStatus(); }
}

$('refresh').addEventListener('click', () => refresh(true));
$('qr').addEventListener('error', () => { $('qr').hidden = true; $('qr-error').hidden = false; });
$('copy').addEventListener('click', async () => {
  if (!phoneUrl) return;
  try { await navigator.clipboard.writeText(phoneUrl); copyNotice = { key: 'setup.copied' }; }
  catch { copyNotice = { key: 'setup.copyHelp' }; }
  renderNotices();
});
$('configure').addEventListener('click', async () => {
  $('configure').disabled = true; configureNotice = { key: 'setup.saving' }; renderNotices();
  try {
    const res = await fetch('/api/ryujinx/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Joypad-Setup': '1' }, body: JSON.stringify({ layout: $('layout').value }), signal: AbortSignal.timeout(10000) });
    const result = await res.json();
    if (!res.ok) { const error = new Error(result.error); error.code = result.code; throw error; }
    configureNotice = { key: 'setup.saved', values: { backup: result.backup } };
    await refresh(true);
  } catch (error) { configureNotice = { key: setupErrorKey(error) }; }
  finally { $('configure').disabled = !local; renderNotices(); }
});

initLanguage();
onLanguageChange(renderStatus);
renderStatus();
refresh(true); setInterval(() => { if (!document.hidden) refresh(); }, 2000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(true); });
