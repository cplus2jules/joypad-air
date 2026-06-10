import { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { haptic } from '../haptics';
import RecessedBtn from './RecessedBtn';

// ── D-Pad unificado con rolling ─────────────────────────
// UNA superficie táctil (mismo footprint que los 4 botones de antes)
// con un solo Gesture.Manual. El touch se resuelve por vector desde el
// centro → 8 sectores de 45° centrados en los cardinales (cardinal puro
// o diagonal). onTouchesMove REPROCESA, así que se puede rodar entre
// direcciones sin levantar el pulgar, y las diagonales (up+right) son
// estructuralmente posibles. SOCD imposible por construcción: el set
// activo sale de UN punto → nunca contiene left+right ni up+down.
//
// `variant`:
//  · 'vertical' (default): d-pad clásico del Joy-Con L en pareja.
//  · 'sideways': el d-pad hace de botones frontales rotados 90°
//    (Mario Kart) — misma superficie, mismos names dpad_*, pero la
//    dirección de PANTALLA arriba corresponde a dpad_left, etc.

const MAPS = {
  vertical: { up: 'dpad_up', right: 'dpad_right', down: 'dpad_down', left: 'dpad_left' },
  // misma colocación que tenían los 4 botones sueltos del sideways:
  // top=◀(dpad_left) · left=▼(dpad_down) · right=▲(dpad_up) · bottom=▶(dpad_right)
  sideways: { up: 'dpad_left', right: 'dpad_up', down: 'dpad_right', left: 'dpad_down' },
};
const LABELS = { dpad_up: '▲', dpad_down: '▼', dpad_left: '◀', dpad_right: '▶' };

// Sectores de 45° centrados en cardinales. atan2 con y hacia abajo:
// 0°=derecha · 90°=abajo · 180°=izquierda · 270°=arriba.
// idx = round(deg/45) % 8 → pares = cardinal puro, impares = diagonal.
const SECTORS = [
  ['right'],
  ['down', 'right'],
  ['down'],
  ['down', 'left'],
  ['left'],
  ['up', 'left'],
  ['up'],
  ['up', 'right'],
];

export default function DPad({ send, variant = 'vertical' }) {
  const SIZE = variant === 'sideways' ? 240 : 150;
  const BTN = variant === 'sideways' ? 78 : 50;
  const CENTER = SIZE / 2;
  // < 14px del centro (en footprint 150) → neutral; escala con el tamaño
  const NEUTRAL_R = 14 * (SIZE / 150);
  const map = MAPS[variant] || MAPS.vertical;

  const activeRef = useRef(new Set());
  const [active, setActive] = useState(() => new Set());

  // dirs: array de direcciones de PANTALLA ([], ['up'] o ['up','right'])
  const apply = (dirs) => {
    const next = new Set(dirs.map((d) => map[d]));
    const prev = activeRef.current;
    let changed = false;
    // diff → un btn down/up por cada dirección que cambia
    for (const k of next) {
      if (!prev.has(k)) {
        send({ t: 'btn', k, d: true });
        changed = true;
      }
    }
    for (const k of prev) {
      if (!next.has(k)) {
        send({ t: 'btn', k, d: false });
        changed = true;
      }
    }
    if (!changed) return;
    activeRef.current = next;
    setActive(new Set(next));
    // Haptic por transición de estado: cardinal seco, diagonal sutil,
    // y un light al volver a neutral (soltó sin levantar del todo).
    if (next.size === 1) haptic.rigid();
    else if (next.size === 2) haptic.select();
    else haptic.light();
  };

  const resolveTouch = (touch) => {
    // Vector desde el centro. Si el touch sale del componente (gesto ya
    // activo) las coords pueden ser negativas o > SIZE — el ángulo sigue
    // siendo válido, así que el rolling no se pierde al salirse.
    const dx = touch.x - CENTER;
    const dy = touch.y - CENTER;
    if (Math.hypot(dx, dy) < NEUTRAL_R) return [];
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return SECTORS[Math.round(deg / 45) % 8];
  };

  const gesture = useMemo(
    () =>
      Gesture.Manual()
        .runOnJS(true)
        .onTouchesDown((e, manager) => {
          manager.activate();
          if (e.allTouches.length > 0) apply(resolveTouch(e.allTouches[0]));
        })
        .onTouchesMove((e) => {
          // REPROCESAR en cada move → rolling sin levantar el pulgar
          if (e.allTouches.length > 0) apply(resolveTouch(e.allTouches[0]));
        })
        .onTouchesUp((e, manager) => {
          // levantar cualquier dedo suelta todo (el d-pad es de un pulgar)
          apply([]);
          if (e.numberOfTouches === 0) manager.end();
        })
        .onTouchesCancelled((_e, manager) => {
          apply([]);
          manager.end();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variant]
  );

  const half = (SIZE - BTN) / 2;
  const slotPos = {
    up: { top: 0, left: half },
    down: { bottom: 0, left: half },
    left: { left: 0, top: half },
    right: { right: 0, top: half },
  };
  const btnStyle = { width: BTN, height: BTN, borderRadius: BTN / 2 };
  const textStyle = variant === 'sideways' ? s.textSideways : s.text;

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width: SIZE, height: SIZE }}>
        {['up', 'left', 'right', 'down'].map((dir) => {
          const name = map[dir];
          return (
            // Botones presentacionales: la superficie captura el gesto,
            // ellos solo se hunden cuando su dirección está activa.
            <View key={name} pointerEvents="none" style={[s.slot, btnStyle, slotPos[dir]]}>
              <RecessedBtn
                name={name}
                label={LABELS[name]}
                pressed={active.has(name)}
                style={btnStyle}
                textStyle={textStyle}
              />
            </View>
          );
        })}
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  slot: { position: 'absolute' },
  text: { fontSize: 15, color: '#cfd2da' },
  textSideways: { fontSize: 26, color: '#fff', fontWeight: '700' },
});
