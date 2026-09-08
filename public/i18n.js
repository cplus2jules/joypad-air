import { normalizeLanguage, translate } from './i18n/messages.js';

const STORAGE_KEY = 'joypad-air-language';
let saved;
try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* Storage can be disabled. */ }
let language = normalizeLanguage(saved || navigator.language);
const listeners = new Set();

export const t = (key, values) => translate(language, key, values);
export const getLanguage = () => language;

export function applyTranslations(root = document) {
  document.documentElement.lang = language;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  for (const attribute of ['aria-label', 'placeholder', 'alt', 'title']) {
    root.querySelectorAll(`[data-i18n-${attribute}]`).forEach((el) => {
      el.setAttribute(attribute, t(el.getAttribute(`data-i18n-${attribute}`)));
    });
  }
  root.querySelectorAll('[data-language-select]').forEach((el) => { el.value = language; });
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) manifest.href = language === 'es' ? 'manifest.es.json' : 'manifest.json';
}

export function setLanguage(value) {
  const next = normalizeLanguage(value);
  if (next === language) return;
  language = next;
  try { localStorage.setItem(STORAGE_KEY, language); } catch { /* Keep working in memory. */ }
  applyTranslations();
  listeners.forEach((listener) => listener(language));
}

export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function initLanguage() {
  applyTranslations();
  document.querySelectorAll('[data-language-select]').forEach((el) => {
    el.addEventListener('change', () => setLanguage(el.value));
  });
}

window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY || event.key === null) {
    setLanguage(event.newValue || navigator.language);
  }
});
