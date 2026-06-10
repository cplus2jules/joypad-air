import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Settings store (AsyncStorage) ───────────────────────
// Persistencia de perfiles por jugador. AÚN SIN UI — nadie lo consume todavía.

const STORAGE_KEY = '@cspm/settings/v2';
const SAVE_DEBOUNCE_MS = 300;

const DEFAULT_PROFILE = {
  themeId: 'neon',
  stickCurve: 0.85,
  stickDeadzone: 0.18,
  stickFloating: true,
  hapticLevel: 'normal',
  buttonScale: 1.0,
  swapAB: false,
  clickSound: false,
};

export const DEFAULT_SETTINGS = {
  schema: 2,
  lastSlot: 1,
  lastLayout: 'full',
  onboarded: false,
  profiles: {
    1: { name: 'Chocorramito 1', ...DEFAULT_PROFILE },
    2: { name: 'Chocorramito 2', ...DEFAULT_PROFILE },
  },
};

// Mezcla lo guardado con los defaults (claves nuevas caen al default)
function mergeWithDefaults(stored) {
  if (!stored || typeof stored !== 'object') return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    profiles: {
      1: { name: 'Chocorramito 1', ...DEFAULT_PROFILE, ...(stored.profiles?.[1] || {}) },
      2: { name: 'Chocorramito 2', ...DEFAULT_PROFILE, ...(stored.profiles?.[2] || {}) },
    },
  };
}

const SettingsContext = createContext({
  settings: DEFAULT_SETTINGS,
  ready: false,
  updateProfile: () => {},
  update: () => {},
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const saveTimerRef = useRef(null);

  // Carga única al montar
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        try {
          setSettings(mergeWithDefaults(JSON.parse(raw)));
        } catch {}
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Escritura debounced
  const persist = (next) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    }, SAVE_DEBOUNCE_MS);
  };

  const update = (patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      persist(next);
      return next;
    });
  };

  const updateProfile = (slot, patch) => {
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
