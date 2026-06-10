// ── Click mecánico opcional (expo-audio) ────────────────
// Carga PEREZOSA: expo-audio solo se importa (dinámicamente) la primera
// vez que el setting clickSound se activa — si está off no se paga el
// coste del módulo nativo ni del asset. Pool de 3 players round-robin
// para que los taps rápidos solapen sin cortarse.

const POOL_SIZE = 3;

let enabled = false;
let players = null;
let idx = 0;
let initPromise = null;

async function init() {
  const { createAudioPlayer, setAudioModeAsync } = await import('expo-audio');
  // que suene aunque el iPhone esté en silencio (es feedback de juego)
  await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  const source = require('../assets/click.m4a');
  players = Array.from({ length: POOL_SIZE }, () => createAudioPlayer(source));
}

export function setClickEnabled(on) {
  enabled = !!on;
  if (enabled && !players && !initPromise) {
    initPromise = init().catch(() => {
      initPromise = null; // permitir reintento si falló la carga
    });
  }
}

export function playClick() {
  if (!enabled || !players) return;
  const p = players[idx];
  idx = (idx + 1) % players.length;
  try {
    p.seekTo(0);
    p.play();
  } catch {}
}
