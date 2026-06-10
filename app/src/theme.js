import { Platform } from 'react-native';

// Switch official Neon palette
export const C = {
  bg: '#0b0d12',
  redLight: '#ff5366',
  red: '#ff3d54',
  redDark: '#c01a30',
  blueLight: '#2dd4ff',
  blue: '#00c3e2',
  blueDark: '#0080a3',
  ink: '#f5f6f8',
  inkDim: '#9aa0ad',
  btnBgTop: '#26272d',
  btnBg: '#15171b',
  btnBgInner: '#0a0a0d',
  btnRing: '#3a3d45',
  btnText: '#f5f6f8',
  chip: '#1c1f27',
  chipActive: '#3a4055',
  ok: '#5ad07a',
  err: '#ff6f7a',
};

// ── Temas de joycon (compartidos con la PWA — NO cambiar valores) ──
// L/R: gradiente [claro, medio, oscuro] de cada joycon.
// accentL/accentR: color de acento de cada lado (pills, anillos, LEDs).
// light: true ⇒ símbolos/textos sobre el joycon van en oscuro (#3a3d45).
export const JOYCON_THEMES = {
  neon:     { label: "Neón",            L: ["#ff5366","#ff3d54","#c01a30"], R: ["#2dd4ff","#00c3e2","#0080a3"], accentL: "#ff3d54", accentR: "#00c3e2", light: false },
  splatoon: { label: "Splatoon",        L: ["#c52dff","#b400e6","#7a00a0"], R: ["#ffb22d","#faa005","#c27700"], accentL: "#b400e6", accentR: "#faa005", light: false },
  pinkGreen:{ label: "Rosa/Verde",      L: ["#ff64a0","#ff3278","#c01458"], R: ["#46f02d","#1edc00","#14a000"], accentL: "#ff3278", accentR: "#1edc00", light: false },
  arms:     { label: "ARMS",            L: ["#ffe93c","#ffd400","#c2a800"], R: ["#ffe93c","#ffd400","#c2a800"], accentL: "#ffd400", accentR: "#ffd400", light: false },
  animal:   { label: "Animal Crossing", L: ["#a8efc6","#7ee6a2","#4fbf7a"], R: ["#aee2ff","#82d2ff","#4fa8d8"], accentL: "#7ee6a2", accentR: "#82d2ff", light: true },
  zelda:    { label: "Zelda Gold",      L: ["#e8d294","#cdb87b","#9a8550"], R: ["#e8d294","#cdb87b","#9a8550"], accentL: "#cdb87b", accentR: "#cdb87b", light: false },
  oled:     { label: "Blanco OLED",     L: ["#ffffff","#e9eaee","#c4c6cd"], R: ["#ffffff","#e9eaee","#c4c6cd"], accentL: "#c4c6cd", accentR: "#c4c6cd", light: true },
  retro:    { label: "Gris Retro",      L: ["#9a9da6","#828282","#5c5e64"], R: ["#9a9da6","#828282","#5c5e64"], accentL: "#828282", accentR: "#828282", light: false },
};

export function resolveTheme(themeId) {
  return JOYCON_THEMES[themeId] ?? JOYCON_THEMES.neon;
}

// Color de tinta oscura para temas light (símbolos sobre joycon claro)
export const JOYCON_DARK_INK = '#3a3d45';

export const SHADOW = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  android: { elevation: 4 },
});
