// Temas de Joy-Con — TABLA COMPARTIDA con la app nativa (app/src/theme.js).
// No inventar valores nuevos aquí: si cambia un tema, cambia en ambos lados.

export const THEMES = {
  neon:     { label: "Neón",            L: ["#ff5366", "#ff3d54", "#c01a30"], R: ["#2dd4ff", "#00c3e2", "#0080a3"], accentL: "#ff3d54", accentR: "#00c3e2", light: false },
  splatoon: { label: "Splatoon",        L: ["#c52dff", "#b400e6", "#7a00a0"], R: ["#ffb22d", "#faa005", "#c27700"], accentL: "#b400e6", accentR: "#faa005", light: false },
  pinkGreen:{ label: "Rosa/Verde",      L: ["#ff64a0", "#ff3278", "#c01458"], R: ["#46f02d", "#1edc00", "#14a000"], accentL: "#ff3278", accentR: "#1edc00", light: false },
  arms:     { label: "ARMS",            L: ["#ffe93c", "#ffd400", "#c2a800"], R: ["#ffe93c", "#ffd400", "#c2a800"], accentL: "#ffd400", accentR: "#ffd400", light: false },
  animal:   { label: "Animal Crossing", L: ["#a8efc6", "#7ee6a2", "#4fbf7a"], R: ["#aee2ff", "#82d2ff", "#4fa8d8"], accentL: "#7ee6a2", accentR: "#82d2ff", light: true },
  zelda:    { label: "Zelda Gold",      L: ["#e8d294", "#cdb87b", "#9a8550"], R: ["#e8d294", "#cdb87b", "#9a8550"], accentL: "#cdb87b", accentR: "#cdb87b", light: false },
  oled:     { label: "Blanco OLED",     L: ["#ffffff", "#e9eaee", "#c4c6cd"], R: ["#ffffff", "#e9eaee", "#c4c6cd"], accentL: "#c4c6cd", accentR: "#c4c6cd", light: true },
  retro:    { label: "Gris Retro",      L: ["#9a9da6", "#828282", "#5c5e64"], R: ["#9a9da6", "#828282", "#5c5e64"], accentL: "#828282", accentR: "#828282", light: false },
};

export const DEFAULT_THEME = "neon";

// Aplica el tema como CSS custom properties en <html>.
// `light: true` ⇒ textos/símbolos dibujados SOBRE el joycon van en oscuro.
export function applyTheme(id) {
  const t = THEMES[id] || THEMES[DEFAULT_THEME];
  const s = document.documentElement.style;
  s.setProperty("--l0", t.L[0]);
  s.setProperty("--l1", t.L[1]);
  s.setProperty("--l2", t.L[2]);
  s.setProperty("--r0", t.R[0]);
  s.setProperty("--r1", t.R[1]);
  s.setProperty("--r2", t.R[2]);
  s.setProperty("--accent-l", t.accentL);
  s.setProperty("--accent-r", t.accentR);
  s.setProperty("--on-joy", t.light ? "#3a3d45" : "#f5f6f8");
  s.setProperty("--on-joy-soft", t.light ? "rgba(30, 33, 42, 0.55)" : "rgba(255, 255, 255, 0.7)");
  document.documentElement.dataset.lightTheme = t.light ? "1" : "0";
  return t;
}
