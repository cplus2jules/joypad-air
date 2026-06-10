import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { C } from '../theme';
import { depth, getRepeatMs, repeatPulse } from '../haptics';
import usePressAnimation from './usePressAnimation';

// ── Recessed (deep) button — used for face / shoulders / dpad ─
// Dos modos:
//  · Autónomo (default): registra su propio Gesture.Manual, envía
//    {t:'btn'} y dispara haptics — comportamiento histórico.
//  · Presentacional: si se pasa la prop `pressed` (bool), NO registra
//    gestos ni envía nada; solo anima según la prop. El gesto, los
//    haptics y el send viven en el padre (DPad unificado, clusters).
// `slop`: hitSlop del gesto (px) — agranda el target táctil sin tocar
// el visual. Solo aplica en modo autónomo.
export default function RecessedBtn({ name, label, send, style, textStyle, h = 'medium', pressed, slop }) {
  const { scale, pressY, glowOpacity, animateIn, animateOut } = usePressAnimation();
  const repeatRef = useRef(null);
  const pressedRef = useRef(false);
  const controlled = pressed !== undefined;

  // Mapa h-prop → patrón de profundidad
  const depthIn  = { medium: depth.buttonIn,  heavy: depth.triggerIn,  light: depth.shoulderIn,  select: depth.dpadIn  }[h] || depth.buttonIn;
  const depthOut = { medium: depth.buttonOut, heavy: depth.triggerOut, light: depth.shoulderOut, select: depth.dpadOut }[h] || depth.buttonOut;

  const doPressIn = () => {
    if (pressedRef.current) return;
    pressedRef.current = true;
    depthIn();
    animateIn();
    send({ t: 'btn', k: name, d: true });
    if (h === 'heavy') {
      const ms = getRepeatMs(); // 140 normal/suave · 100 fuerte · 0 = off
      if (ms > 0) repeatRef.current = setInterval(repeatPulse, ms);
    }
  };
  const doPressOut = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    if (repeatRef.current) {
      clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
    depthOut();
    animateOut();
    send({ t: 'btn', k: name, d: false });
  };

  // Modo presentacional: animar solo cuando la prop cambia de verdad
  useEffect(() => {
    if (!controlled) return;
    if (pressed === pressedRef.current) return;
    pressedRef.current = pressed;
    if (pressed) animateIn();
    else animateOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, pressed]);

  const gesture = useMemo(() => {
    const g = Gesture.Manual()
      .runOnJS(true)
      .onTouchesDown((_e, manager) => {
        manager.activate();
        doPressIn();
      })
      .onTouchesUp((e, manager) => {
        if (e.numberOfTouches === 0) {
          doPressOut();
          manager.end();
        }
      })
      .onTouchesCancelled((_e, manager) => {
        doPressOut();
        manager.end();
      });
    if (slop != null) g.hitSlop(slop);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const body = (
    <View style={style}>
      <Animated.View
        pointerEvents="none"
        style={[s.btnGlow, { opacity: glowOpacity }]}
      />
      <Animated.View
        style={[
          s.btnAnimWrap,
          { transform: [{ scale }, { translateY: pressY }] },
        ]}
      >
        <View style={s.btnRim}>
          <LinearGradient
            colors={['#3a3d45', '#1a1c22', '#08090c']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={s.btnGradient}
          >
            <View style={s.btnHighlight} />
            <Text style={[s.btnText, textStyle]}>{label}</Text>
          </LinearGradient>
        </View>
      </Animated.View>
    </View>
  );

  // Presentacional: sin GestureDetector — los toques los captura el padre
  if (controlled) return body;
  return <GestureDetector gesture={gesture}>{body}</GestureDetector>;
}

const s = StyleSheet.create({
  // 3D recessed button — glow halo + animated wrap + gradient interior
  btnGlow: {
    position: 'absolute',
    top: -10, left: -10, right: -10, bottom: -10,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 18,
  },
  btnAnimWrap: {
    flex: 1,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 6,
    elevation: 6,
  },
  btnRim: {
    flex: 1,
    borderRadius: 999,
    padding: 2,
    backgroundColor: '#070709',
    borderWidth: 1,
    borderColor: '#000',
  },
  btnGradient: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  btnHighlight: {
    position: 'absolute',
    top: 2,
    left: '22%',
    right: '22%',
    height: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  btnText: { color: C.btnText, fontWeight: '700', fontSize: 16 },
});
