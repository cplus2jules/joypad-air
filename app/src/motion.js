import { useEffect, useState } from 'react';

// ── Pub/sub de la muestra de movimiento (debug) ─────────
// El Pad publica {ax, ay, az} (en g) mientras GIRO está activo —
// throttled a ~10Hz — y null al apagarlo. Settings la consume con
// useMotionSample() para la fila de calibración física
// ("plano boca arriba ⇒ az ≈ -1.00") sin acoplarse al Pad.

let lastSample = null; // {ax, ay, az} | null
const listeners = new Set();

export function publishMotionSample(sample) {
  lastSample = sample;
  for (const fn of listeners) fn(sample);
}

export function getMotionSample() {
  return lastSample;
}

export function useMotionSample() {
  const [sample, setSample] = useState(getMotionSample());
  useEffect(() => {
    listeners.add(setSample);
    return () => listeners.delete(setSample);
  }, []);
  return sample;
}
