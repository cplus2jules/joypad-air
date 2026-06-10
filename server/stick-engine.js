// Conversión analógico → 8 direcciones digitales con histéresis.
//
// El destino es un teclado (Ryujinx backend WindowKeyboard = digital puro),
// así que el "feel" del stick vive aquí: cuándo una inclinación se convierte
// en dirección y cuándo se suelta. Dos histéresis evitan el parpadeo:
//
// - Radial: la dirección se ENGANCHA al superar `engage` (0.55) y solo se
//   suelta al caer bajo `release` (0.40). Vibrar el pulgar alrededor de un
//   único umbral ya no tartamudea.
// - Angular: 8 sectores de 45° centrados en E/SE/S/SW/W/NW/N/NE. El sector
//   activo se mantiene hasta que el ángulo se aleja 22.5° + `angularHysteresis`
//   de su centro — cruzar la frontera cardinal↔diagonal exige intención.
//
// Convención de ejes: la de la app/PWA (pantalla): x+ derecha, y+ ABAJO.
// El cliente envía x/y CRUDOS normalizados [-1,1]; sin curvas ni deadzone
// previas (una sola fuente de verdad, configurable por mensaje {t:'config'}).

const SECTOR_DIRS = [
  ["right"],          // 0   →   0°
  ["right", "down"],  // 1   ↘  45°
  ["down"],           // 2   ↓  90°
  ["down", "left"],   // 3   ↙ 135°
  ["left"],           // 4   ← 180°
  ["left", "up"],     // 5   ↖ 225°
  ["up"],             // 6   ↑ 270°
  ["up", "right"],    // 7   ↗ 315°
];

export const STICK_DEFAULTS = {
  engage: 0.55,
  release: 0.4,
  angularHysteresis: 11.25,
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function nearestSector(angleDeg) {
  return ((Math.round(angleDeg / 45) % 8) + 8) % 8;
}

function angularDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function createStickEngine(initial = {}) {
  let engage = STICK_DEFAULTS.engage;
  let release = STICK_DEFAULTS.release;
  let angularHysteresis = STICK_DEFAULTS.angularHysteresis;

  let engaged = false;
  let sector = null; // 0..7

  function configure(cfg = {}) {
    if (Number.isFinite(cfg.engage)) engage = clamp(cfg.engage, 0.3, 0.9);
    if (Number.isFinite(cfg.release)) release = cfg.release;
    if (Number.isFinite(cfg.angularHysteresis)) {
      angularHysteresis = clamp(cfg.angularHysteresis, 0, 22.5);
    }
    // release siempre por debajo de engage (mínimo 0.05 de separación)
    release = clamp(release, 0.05, engage - 0.05);
  }

  configure(initial);

  // Devuelve el Set de direcciones que deben estar presionadas.
  function update(x, y) {
    const mag = Math.hypot(x, y);

    if (!engaged) {
      if (mag < engage) return new Set();
      engaged = true;
    } else if (mag < release) {
      engaged = false;
      sector = null;
      return new Set();
    }

    // atan2 con y+ hacia abajo: 0°=derecha, 90°=abajo, 180°=izquierda, 270°=arriba
    const angle = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;

    if (sector === null) {
      sector = nearestSector(angle);
    } else {
      const center = sector * 45;
      if (angularDistance(angle, center) > 22.5 + angularHysteresis) {
        sector = nearestSector(angle);
      }
    }

    return new Set(SECTOR_DIRS[sector]);
  }

  function reset() {
    engaged = false;
    sector = null;
  }

  return {
    update,
    reset,
    configure,
    get state() {
      return { engaged, sector, engage, release, angularHysteresis };
    },
  };
}
