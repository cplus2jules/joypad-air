// Haptics progresivos para la PWA.
//
// - Android / navegadores con navigator.vibrate → pulsos cortos.
// - iOS Safari 17.4–26.x → hack del switch: un <input type="checkbox" switch>
//   oculto dentro de un <label>; label.click() programático dispara el Taptic
//   Engine. Si el motor no lo soporta, es un no-op silencioso (el click
//   solo togglea un checkbox invisible).
//
// Niveles: "light" | "medium" | "heavy".
// Modos (ajuste del usuario): "off" | "suave" | "normal" | "fuerte".

const MODES = ["off", "suave", "normal", "fuerte"];

const VIBE_MS = { light: 8, medium: 18, heavy: 32 };
const VIBE_MULT = { suave: 0.5, normal: 1, fuerte: 1.7 };

// Nº de "ticks" del switch por nivel según el modo (cada tick = 1 toggle).
const TICKS = {
  suave:  { light: 1, medium: 1, heavy: 2 },
  normal: { light: 1, medium: 2, heavy: 3 },
  fuerte: { light: 2, medium: 3, heavy: 4 },
};
const TICK_GAP_MS = 36;

let mode = "normal";
let labelEl = null;

function ensureSwitchHack() {
  if (labelEl || typeof document === "undefined" || !document.body) return;
  labelEl = document.createElement("label");
  labelEl.setAttribute("aria-hidden", "true");
  labelEl.style.cssText =
    "position:fixed;top:-100px;left:-100px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;";
  const input = document.createElement("input");
  input.type = "checkbox";
  try { input.setAttribute("switch", ""); } catch { /* atributo no estándar */ }
  input.tabIndex = -1;
  labelEl.appendChild(input);
  document.body.appendChild(labelEl);
}

function tick() {
  try { if (labelEl) labelEl.click(); } catch { /* no-op */ }
}

export function setHapticMode(m) {
  mode = MODES.includes(m) ? m : "normal";
}

export function getHapticMode() {
  return mode;
}

export function initHaptics(initialMode) {
  setHapticMode(initialMode);
  ensureSwitchHack();
}

export function haptic(level = "light") {
  if (mode === "off") return;
  const lvl = VIBE_MS[level] ? level : "light";

  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(Math.round(VIBE_MS[lvl] * (VIBE_MULT[mode] || 1))); } catch { /* no-op */ }
    return;
  }

  ensureSwitchHack();
  if (!labelEl) return;
  const n = (TICKS[mode] || TICKS.normal)[lvl] || 1;
  tick();
  for (let i = 1; i < n; i++) setTimeout(tick, i * TICK_GAP_MS);
}
