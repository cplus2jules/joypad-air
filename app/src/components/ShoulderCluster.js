import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { depth, getRepeatMs, repeatPulse } from '../haptics';
import RecessedBtn from './RecessedBtn';

// ── Cluster de shoulders con hair triggers ──────────────
// UN solo Gesture.Manual sobre TODA la barra (ZL/L, R/ZR o SL/SR) con
// hitSlop superior: un dedo que entra DESLIZANDO desde el borde activa
// el botón al primer contacto, y se puede rodar L↔ZL sin levantar.
// Cada touch de e.allTouches se hit-testea contra los frames medidos
// (onLayout) → set de botones "tocados"; el diff contra el set anterior
// dispara send/haptics/animación. Multi-touch real: dos dedos pueden
// mantener L y ZL a la vez.
//
// `buttons`: [{ name, label, kind: 'shoulder' | 'trigger' }] — estable
// por montaje (el gesto la captura en useMemo []).

const SLOP_TOP = 12;   // hitSlop del gesto hacia arriba
const MARGIN = 10;     // margen de tolerancia alrededor de cada frame
const MARGIN_TOP = 14; // cubre el hitSlop superior (y negativa al deslizar)

export default function ShoulderCluster({ buttons, send, style, btnStyle, textStyle }) {
  const framesRef = useRef({});           // name → { x, y, w, h }
  const touchedRef = useRef(new Set());   // estado lógico (gesto)
  const repeatsRef = useRef({});          // name → interval id (solo triggers)
  const [touched, setTouched] = useState(() => new Set());

  // kind por name — recalculado por render, leído fresco desde el gesto
  const kindsRef = useRef({});
  kindsRef.current = Object.fromEntries(buttons.map((b) => [b.name, b.kind]));

  useEffect(
    () => () => {
      for (const id of Object.values(repeatsRef.current)) clearInterval(id);
      repeatsRef.current = {};
    },
    []
  );

  // Touch → botón: gana el frame expandido que contiene el punto y cuyo
  // centro queda más cerca (en el hueco entre botones los márgenes de
  // ambos solapan — sin esto el resultado sería por orden de render).
  const hitTest = (x, y) => {
    let best = null;
    let bestDist = Infinity;
    for (const [name, f] of Object.entries(framesRef.current)) {
      if (
        x >= f.x - MARGIN && x <= f.x + f.w + MARGIN &&
        y >= f.y - MARGIN_TOP && y <= f.y + f.h + MARGIN
      ) {
        const d = Math.hypot(x - (f.x + f.w / 2), y - (f.y + f.h / 2));
        if (d < bestDist) {
          bestDist = d;
          best = name;
        }
      }
    }
    return best;
  };

  const apply = (touches) => {
    const next = new Set();
    for (const t of touches) {
      const name = hitTest(t.x, t.y);
      if (name) next.add(name);
    }
    const prev = touchedRef.current;
    let changed = false;
    const kinds = kindsRef.current;
    for (const name of next) {
      if (prev.has(name)) continue;
      changed = true;
      send({ t: 'btn', k: name, d: true });
      (kinds[name] === 'trigger' ? depth.triggerIn : depth.shoulderIn)();
      if (kinds[name] === 'trigger') {
        // pulso háptico continuo de ZL/ZR mientras se mantiene
        const ms = getRepeatMs(); // 140 normal/suave · 100 fuerte · 0 = off
        if (ms > 0) repeatsRef.current[name] = setInterval(repeatPulse, ms);
      }
    }
    for (const name of prev) {
      if (next.has(name)) continue;
      changed = true;
      send({ t: 'btn', k: name, d: false });
      (kinds[name] === 'trigger' ? depth.triggerOut : depth.shoulderOut)();
      if (repeatsRef.current[name]) {
        clearInterval(repeatsRef.current[name]);
        delete repeatsRef.current[name];
      }
    }
    if (!changed) return;
    touchedRef.current = next;
    setTouched(new Set(next));
  };

  const gesture = useMemo(
    () =>
      Gesture.Manual()
        .runOnJS(true)
        .hitSlop({ top: SLOP_TOP })
        .onTouchesDown((e, manager) => {
          manager.activate();
          apply(e.allTouches);
        })
        .onTouchesMove((e) => {
          // reprocesar TODOS los touches → rolling y hair-trigger
          apply(e.allTouches);
        })
        .onTouchesUp((e, manager) => {
          // recalcular con los dedos restantes (allTouches puede incluir
          // aún el que se levantó — filtrar por id de changedTouches)
          const lifted = new Set(e.changedTouches.map((t) => t.id));
          apply(e.allTouches.filter((t) => !lifted.has(t.id)));
          if (e.numberOfTouches === 0) {
            apply([]);
            manager.end();
          }
        })
        .onTouchesCancelled((_e, manager) => {
          apply([]);
          manager.end();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={style}>
        {buttons.map((b) => (
          <View
            key={b.name}
            pointerEvents="none"
            onLayout={(e) => {
              const { x, y, width, height } = e.nativeEvent.layout;
              framesRef.current[b.name] = { x, y, w: width, h: height };
            }}
          >
            <RecessedBtn
              name={b.name}
              label={b.label}
              pressed={touched.has(b.name)}
              style={btnStyle}
              textStyle={textStyle}
            />
          </View>
        ))}
      </View>
    </GestureDetector>
  );
}
