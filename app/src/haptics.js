import * as Haptics from 'expo-haptics';

export const haptic = {
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  select: () => Haptics.selectionAsync().catch(() => {}),
  rigid: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {}),
};

// "Profundidad" haptica — multi-etapa fuerte, simula click mecánico profundo.
// Patrón típico: pre-impact + actuación + bottom-out, todo con Heavy/Rigid
// para máxima intensidad en el Taptic Engine.
export const depth = {
  // Face buttons (ABXY): triple thunk
  buttonIn: () => {
    haptic.heavy();
    setTimeout(haptic.rigid, 18);
    setTimeout(haptic.heavy, 42);
  },
  buttonOut: () => {
    haptic.medium();
    setTimeout(haptic.light, 30);
  },
  // Triggers (ZL/ZR): cuatro etapas + pulso continuo aparte
  triggerIn: () => {
    haptic.heavy();
    setTimeout(haptic.heavy, 25);
    setTimeout(haptic.rigid, 55);
    setTimeout(haptic.heavy, 90);
  },
  triggerOut: () => {
    haptic.heavy();
    setTimeout(haptic.medium, 35);
    setTimeout(haptic.light, 70);
  },
  // Shoulders (L/R): doble heavy
  shoulderIn: () => {
    haptic.medium();
    setTimeout(haptic.heavy, 20);
    setTimeout(haptic.rigid, 45);
  },
  shoulderOut: () => {
    haptic.medium();
    setTimeout(haptic.light, 28);
  },
  // D-pad: rigid doble crisp
  dpadIn: () => {
    haptic.heavy();
    setTimeout(haptic.rigid, 18);
  },
  dpadOut: () => haptic.light(),
  // Símbolos (+, −, capture, home): firme medium+heavy
  symbolIn: () => {
    haptic.medium();
    setTimeout(haptic.heavy, 25);
  },
  symbolOut: () => {
    haptic.light();
  },
  // Stick deadzone cross — click sutil (NO heavy)
  stickClick: () => haptic.select(),
  // Stick edge pulse — light, no constante
  stickEdge: () => haptic.light(),
  // Stick soft tick — DESACTIVADO (estaba muy ruidoso)
  stickSoft: () => {},
  // Stick grab — sin haptic
  stickGrab: () => {},
};
