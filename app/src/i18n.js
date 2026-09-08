import { useCallback } from 'react';
import { normalizeLanguage, translate } from '../../public/i18n/messages';
import { useSettings } from './store/settings';

export function useI18n() {
  const { settings, update } = useSettings();
  const language = normalizeLanguage(settings.language);
  const t = useCallback((key, values) => translate(language, key, values), [language]);
  return { language, t, setLanguage: (value) => update({ language: normalizeLanguage(value) }) };
}

// Connection states are protocol/UI state identifiers, never translated in place.
export const connectionLabel = {
  conectando: 'connecting', conectado: 'connected', reconectando: 'reconnecting',
  error: 'connectionError', 'sin host': 'noHost', reemplazado: 'replaced',
};
