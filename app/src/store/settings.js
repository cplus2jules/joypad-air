import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeLanguage } from '../../../public/i18n/messages';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Settings store (AsyncStorage) ───────────────────────
// Persistencia de perfiles por jugador. UI en screens/Settings.js;
// consumido por Pad/Picker (tema, nombre, swap, escala, háptica)
// y por net/connection.js (engage/release/name/theme en el config).

const STORAGE_KEY = '@cspm/settings/v2';
const SAVE_DEBOUNCE_MS = 300;
let deviceLanguage = 'en';
try { deviceLanguage = normalizeLanguage(Intl.DateTimeFormat().resolvedOptions().locale); } catch {}

const DEFAULT_PROFILE = {
  themeId: 'neon',
  stickCurve: 0.85,
  stickDeadzone: 0.18,
  stickFloating: true,
  hapticLevel: 'normal',
  buttonScale: 1.0,
  swapAB: false,
  clickSound: false,
  // Umbrales del stick-engine del server (histéresis de dirección)
  engage: 0.55,
  release: 0.40,
};

export const DEFAULT_SETTINGS = {
  schema: 2,
  language: deviceLanguage,
  lastSlot: 1,
  lastLayout: 'full',
  onboarded: false,
  // IP del Mac escrita a mano (Picker) — null ⇒ autodetección por hostUri.
  // Necesario fuera de Expo Go, donde Constants no trae hostUri.
  host: null,
  profiles: {
    1: { name: '', ...DEFAULT_PROFILE },
    2: { name: '', ...DEFAULT_PROFILE },
  },
};

// Mezcla lo guardado con los defaults (claves nuevas caen al default)
function mergeWithDefaults(stored) {
  if (!stored || typeof stored !== 'object') return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    language: normalizeLanguage(stored.language || deviceLanguage),
    profiles: {
      1: { name: '', ...DEFAULT_PROFILE, ...(stored.profiles?.[1] || {}) },
      2: { name: '', ...DEFAULT_PROFILE, ...(stored.profiles?.[2] || {}) },
    },
  };
}

const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  ready: false,
  updateProfile: () => {},
  update: () => {},
});

// Aplica un patch pendiente (raíz o de perfil) sobre un settings dado
function applyPatch(base, p) {
  if (p.slot != null) {
    return {
      ...base,
      profiles: {
        ...base.profiles,
        [p.slot]: { ...base.profiles[p.slot], ...p.patch },
      },
    };
  }
  return { ...base, ...p.patch };
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const saveTimerRef = useRef(null);
  // Antes de que resuelva el getItem, persistir escribiría DEFAULTS+patch
  // (borrando nombres/temas guardados). Los patches pre-carga se aplican
  // en memoria Y se acumulan aquí para re-aplicarlos sobre lo cargado.
  const readyRef = useRef(false);
  const pendingRef = useRef([]);

  // Carga única al montar
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .catch(() => null)
      .then((raw) => {
        if (!alive) return;
        let merged = DEFAULT_SETTINGS;
        if (raw) {
          try {
            merged = mergeWithDefaults(JSON.parse(raw));
          } catch {}
        }
        // Re-aplicar en orden los patches hechos antes de la carga
        const pending = pendingRef.current;
        pendingRef.current = [];
        let next = merged;
        for (const p of pending) next = applyPatch(next, p);
        readyRef.current = true;
        setSettings(next);
        setReady(true);
        if (pending.length) persist(next);
      });
    return () => {
      alive = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escritura debounced — nunca antes de que la carga resuelva
  const persist = (next) => {
    if (!readyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
  };

  const update = (patch) => {
    if (!readyRef.current) pendingRef.current.push({ patch });
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      persist(next);
      return next;
    });
  };

  const updateProfile = (slot, patch) => {
    if (!readyRef.current) pendingRef.current.push({ slot, patch });
    setSettings((prev) => {
      const next = {
        ...prev,
        profiles: {
          ...prev.profiles,
          [slot]: { ...prev.profiles[slot], ...patch },
        },
      };
      persist(next);
      return next;
    });
  };

  const value = useMemo(
    () => ({ settings, ready, update, updateProfile }),
    [settings, ready]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
