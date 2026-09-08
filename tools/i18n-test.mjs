import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { messages, normalizeLanguage, translate } from '../public/i18n/messages.js';
import { setupErrorKey } from '../public/i18n/setup-errors.js';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTerminalTranslator, terminalMessages } from '../server/i18n.js';

test('terminal catalogs cover both languages and preserve diagnostic values', () => {
  assert.deepEqual(Object.keys(terminalMessages.en).sort(), Object.keys(terminalMessages.es).sort());
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const key of Object.keys(terminalMessages.en)) {
    assert.ok(terminalMessages.en[key].trim() && terminalMessages.es[key].trim(), key);
    assert.deepEqual(placeholders(terminalMessages.en[key]), placeholders(terminalMessages.es[key]), key);
  }
  assert.equal(createTerminalTranslator()('server.ready'), 'Joypad Air — server running');
  assert.equal(createTerminalTranslator('es-MX')('server.ready'), 'Joypad Air — servidor en marcha');
  assert.equal(createTerminalTranslator('fr')('server.ready'), 'Joypad Air — server running');
  assert.equal(createTerminalTranslator()('ws.named', { n: 1, name: '$& {n}' }), '[ws] Player 1 is now named "$& {n}"');
});

test('real permission help defaults to English and honors explicit Spanish', () => {
  const cwd = new URL('../', import.meta.url);
  for (const language of ['', 'en', 'es']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e',
      'import { printAccessibilityHelp } from "./server/accessibility.js"; printAccessibilityHelp();'], {
      cwd, encoding: 'utf8', env: { ...process.env, JOYPAD_LANG: language, LANG: 'es_ES.UTF-8' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, language === 'es'
      ? /Ajustes del Sistema → Privacidad y seguridad → Accesibilidad/
      : /System Settings → Privacy & Security → Accessibility/);
    assert.doesNotMatch(result.stdout, language === 'es' ? /Accessibility permission required/ : /permiso de Accesibilidad/);
  }
});

test('Ryujinx CLI localizes readable output while keeping JSON stable', () => {
  const configDir = mkdtempSync(join(tmpdir(), 'joypad-i18n-'));
  try {
    const run = (language, flags = []) => spawnSync(process.execPath,
      ['tools/ryujinx-setup.mjs', '--check', '--config-dir', configDir, ...flags], {
        cwd: new URL('../', import.meta.url), encoding: 'utf8',
        env: { ...process.env, JOYPAD_LANG: language },
      });
    const en = run('en');
    const es = run('es');
    assert.equal(en.status, 1);
    assert.equal(es.status, 1);
    assert.match(en.stdout, /Open Ryujinx once/);
    assert.match(es.stdout, /Abre Ryujinx una vez/);
    assert.deepEqual(JSON.parse(run('en', ['--json']).stdout), JSON.parse(run('es', ['--json']).stdout));
  } finally { rmSync(configDir, { recursive: true, force: true }); }
});

test('English and Spanish cover the same keys and interpolation values', () => {
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.es).sort());
  for (const key of Object.keys(messages.en)) {
    const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assert.ok(messages.en[key].trim() && messages.es[key].trim(), key);
    assert.deepEqual(placeholders(messages.en[key]), placeholders(messages.es[key]), key);
  }
});

test('regional Spanish locales, unsupported locales, and literal player names', () => {
  assert.equal(normalizeLanguage('es-MX'), 'es');
  assert.equal(normalizeLanguage('ES_es'), 'es');
  assert.equal(normalizeLanguage('fr-FR'), 'en');
  assert.equal(normalizeLanguage(null), 'en');
  assert.equal(translate('es', 'player', { n: 2 }), 'Jugador 2');
  assert.equal(translate('en', 'occupiedBy', { name: '<Jules> $& {n}' }), 'In use · <Jules> $& {n}');
  assert.equal(translate('en', 'unknown-key'), 'unknown-key');
});

test('setup failures explain the same recovery in either language', () => {
  for (const code of ['ryujinx_running', 'process_check_failed', 'unsupported_config', 'config_unreadable', 'unsupported_layout', 'setup_failed']) {
    const key = setupErrorKey({ code });
    assert.ok(Object.hasOwn(messages.en, key), code);
    assert.ok(Object.hasOwn(messages.es, key), code);
  }
  assert.equal(setupErrorKey({ code: 'ryujinx_running', message: 'Anything' }), 'setup.quitFirst');
  assert.equal(setupErrorKey({ error: 'Unsupported Ryujinx config version 99.' }), 'setup.unsupported');
  assert.equal(setupErrorKey(new Error('Quit Ryujinx first, then try again.')), 'setup.quitFirst');
  assert.equal(setupErrorKey(new Error('Network request failed')), 'setup.failed');
});

test('static UI translation markers resolve in both languages', async () => {
  for (const file of ['index.html', 'setup.html']) {
    const html = await readFile(new URL(`../public/${file}`, import.meta.url), 'utf8');
    for (const [, key] of html.matchAll(/data-i18n(?:-(?:aria-label|placeholder|alt|title))?="([^"]+)"/g)) {
      assert.ok(Object.hasOwn(messages.en, key), `${file}: ${key}`);
      assert.ok(Object.hasOwn(messages.es, key), `${file}: ${key}`);
    }
  }
});

function browserStub({ stored = null, blocked = false, device = 'en-US' } = {}) {
  const storage = new Map(stored ? [['joypad-air-language', stored]] : []);
  const events = new Map();
  const text = { dataset: { i18n: 'settings' }, textContent: '' };
  const label = { getAttribute: () => 'back', setAttribute: (name, value) => { label[name] = value; } };
  const select = { value: '', addEventListener: (name, handler) => { select[name] = handler; } };
  const manifest = { href: '' };
  const document = {
    documentElement: { lang: '' },
    querySelector: () => manifest,
    querySelectorAll: (query) => ({ '[data-i18n]': [text], '[data-i18n-aria-label]': [label], '[data-language-select]': [select] })[query] || [],
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: device } });
  globalThis.document = document;
  globalThis.window = { addEventListener: (name, handler) => events.set(name, handler) };
  globalThis.localStorage = {
    getItem: (key) => { if (blocked) throw new Error('Storage blocked'); return storage.get(key) ?? null; },
    setItem: (key, value) => { if (blocked) throw new Error('Storage blocked'); storage.set(key, value); },
  };
  return { storage, events, text, label, select, manifest, document };
}

test('language changes update labels and persist across page loads', async () => {
  const dom = browserStub({ stored: 'es', device: 'en-US' });
  const locale = await import('../public/i18n.js?persist');
  locale.initLanguage();
  assert.equal(dom.document.documentElement.lang, 'es');
  assert.equal(dom.text.textContent, 'Ajustes');
  assert.equal(dom.label['aria-label'], 'Volver');
  assert.equal(dom.select.value, 'es');
  assert.equal(dom.manifest.href, 'manifest.es.json');
  let changes = 0;
  const unsubscribe = locale.onLanguageChange(() => changes++);
  dom.select.value = 'en';
  dom.select.change();
  assert.equal(changes, 1);
  assert.equal(dom.text.textContent, 'Settings');
  assert.equal(dom.storage.get('joypad-air-language'), 'en');
  const reloaded = await import('../public/i18n.js?reload');
  assert.equal(reloaded.getLanguage(), 'en');
  unsubscribe();
});

test('blocked storage still allows language switching in memory', async () => {
  const dom = browserStub({ blocked: true, device: 'es-ES' });
  const locale = await import('../public/i18n.js?blocked');
  locale.initLanguage();
  assert.equal(locale.getLanguage(), 'es');
  assert.doesNotThrow(() => locale.setLanguage('en'));
  assert.equal(dom.text.textContent, 'Settings');
});

test('another tab changing the language updates the current page', async () => {
  const dom = browserStub();
  const locale = await import('../public/i18n.js?tabs');
  locale.initLanguage();
  dom.events.get('storage')({ key: 'joypad-air-language', newValue: 'es' });
  assert.equal(dom.select.value, 'es');
  assert.equal(dom.text.textContent, 'Ajustes');
});
