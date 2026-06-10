import * as Haptics from 'expo-haptics';

export const haptic = {
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  select: () => Haptics.selectionAsync().catch(() => {}),
  rigid: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {}),
};

// ── Intensidad global ───────────────────────────────────
// iOS no permite escalar la fuerza del Taptic Engine, así que la
// intensidad modula los PATRONES:
//   off    → todas las funciones de depth son no-op
//   soft   → degrada cada etapa (Heavy→Medium, Rigid→Light) y quita la última
//   normal → patrones tal cual
//   strong → etapa Heavy extra (+30ms) al final de cada patrón "In"
//            y el repeat de ZL/ZR baja de 140→100ms
const LEVELS = ['off', 'soft', 'normal', 'strong'];
let intensity = 'normal';

export function setIntensity(level) {
  intensity = LEVELS.includes(level) ? level : 'normal';
}

export function getIntensity() {
  return intensity;
}

// Intervalo del pulso continuo de ZL/ZR (RecessedBtn). 0 ⇒ sin repeat.
export function getRepeatMs() {
  if (intensity === 'off') return 0;
  return intensity === 'strong' ? 100 : 140;
}

// Tick del repeat de ZL/ZR — degradado según nivel
export function repeatPulse() {
  if (intensity === 'off') return;
  if (intensity === 'soft') haptic.light();
  else haptic.rigid();
}

// ── Patrones base (nivel "normal") ──────────────────────
// "Profundidad" háptica — multi-etapa fuerte, simula click mecánico profundo.
// Cada etapa es [estilo, delay ms]. Los "In" llevan flag para strong.
const PATTERNS = {
  // Face buttons (ABXY): triple thunk
  buttonIn:    { isIn: true,  steps: [['heavy', 0], ['rigid', 18], ['heavy', 42]] },
  buttonOut:   { steps: [['medium', 0], ['light', 30]] },
  // Triggers (ZL/ZR): cuatro etapas + pulso continuo aparte
  triggerIn:   { isIn: true,  steps: [['heavy', 0], ['heavy', 25], ['rigid', 55], ['heavy', 90]] },
  triggerOut:  { steps: [['heavy', 0], ['medium', 35], ['light', 70]] },
  // Shoulders (L/R): doble heavy
  shoulderIn:  { isIn: true,  steps: [['medium', 0], ['heavy', 20], ['rigid', 45]] },
  shoulderOut: { steps: [['medium', 0], ['light', 28]] },
  // D-pad: rigid doble crisp
  dpadIn:      { isIn: true,  steps: [['heavy', 0], ['rigid', 18]] },
  dpadOut:     { steps: [['light', 0]] },
  // Símbolos (+, −, capture, home): firme medium+heavy
  symbolIn:    { isIn: true,  steps: [['medium', 0], ['heavy', 25]] },
  symbolOut:   { steps: [['light', 0]] },
};

const SOFT_DOWNGRADE = { heavy: 'medium', rigid: 'light' };

function play(patternId) {
  if (intensity === 'off') return;
  const { steps, isIn } = PATTERNS[patternId];
  let seq = steps;
  if (intensity === 'soft') {
    seq = steps.map(([k, at]) => [SOFT_DOWNGRADE[k] || k, at]);
    if (seq.length > 1) seq = seq.slice(0, -1);
  } else if (intensity === 'strong' && isIn) {
    const lastAt = steps[steps.length - 1][1];
    seq = [...steps, ['heavy', lastAt + 30]];
  }
  for (const [k, at] of seq) {
    if (at === 0) haptic[k]();
    else setTimeout(haptic[k], at);
  }
}

export const depth = {
  buttonIn: () => play('buttonIn'),
  buttonOut: () => play('buttonOut'),
  triggerIn: () => play('triggerIn'),
  triggerOut: () => play('triggerOut'),
  shoulderIn: () => play('shoulderIn'),
  shoulderOut: () => play('shoulderOut'),
  dpadIn: () => play('dpadIn'),
  dpadOut: () => play('dpadOut'),
  symbolIn: () => play('symbolIn'),
  symbolOut: () => play('symbolOut'),
  // Stick deadzone cross — click sutil (NO heavy)
  stickClick: () => { if (intensity !== 'off') haptic.select(); },
  // Stick edge pulse — light, no constante
  stickEdge: () => { if (intensity !== 'off') haptic.light(); },
  // Stick soft tick — DESACTIVADO (estaba muy ruidoso)
  stickSoft: () => {},
  // Stick grab — sin haptic
  stickGrab: () => {},
};
