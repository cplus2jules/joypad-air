import { useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { JOYCON_DARK_INK, SHADOW } from '../theme';
import { depth } from '../haptics';

// ── Symbol button (+, −) ────────────────────────────────
// `dark`: símbolo en tinta oscura (temas light — joycon claro)
export function SymbolBtn({ name, symbol, send, dark }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.55)).current;
  const pressedRef = useRef(false);

  const grant = () => {
    if (pressedRef.current) return;
    pressedRef.current = true;
    depth.symbolIn();
    send({ t: 'btn', k: name, d: true });
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.85, useNativeDriver: true, tension: 240, friction: 8 }),
      Animated.timing(opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
  };
  const release = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    depth.symbolOut();
    send({ t: 'btn', k: name, d: false });
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 300, friction: 10 }),
      Animated.timing(opacity, { toValue: 0.55, duration: 180, useNativeDriver: true }),
    ]).start();
  };

  const gesture = useMemo(
    () =>
      Gesture.Manual()
        .runOnJS(true)
        .hitSlop(10)
        .onTouchesDown((_e, m) => { m.activate(); grant(); })
        .onTouchesUp((e, m) => { if (e.numberOfTouches === 0) { release(); m.end(); } })
        .onTouchesCancelled((_e, m) => { release(); m.end(); }),
    []
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={s.symbolBtn}>
        <Animated.Text
          style={[s.symbolText, { opacity, color: dark ? JOYCON_DARK_INK : '#fff', transform: [{ scale }] }]}
        >
          {symbol}
        </Animated.Text>
      </View>
    </GestureDetector>
  );
}

// ── Capture (square) ────────────────────────────────────
export function CaptureBtn({ send }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressedRef = useRef(false);
  const grant = () => {
    if (pressedRef.current) return;
    pressedRef.current = true;
    depth.symbolIn();
    send({ t: 'btn', k: 'capture', d: true });
    Animated.spring(scale, { toValue: 0.85, useNativeDriver: true, tension: 240, friction: 8 }).start();
  };
  const release = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    depth.symbolOut();
    send({ t: 'btn', k: 'capture', d: false });
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 300, friction: 10 }).start();
  };
  const gesture = useMemo(
    () =>
      Gesture.Manual()
        .runOnJS(true)
        .hitSlop(12)
        .onTouchesDown((_e, m) => { m.activate(); grant(); })
        .onTouchesUp((e, m) => { if (e.numberOfTouches === 0) { release(); m.end(); } })
        .onTouchesCancelled((_e, m) => { release(); m.end(); }),
    []
  );
  return (
    <GestureDetector gesture={gesture}>
      <View style={s.captureBtn}>
        <Animated.View style={[s.captureIcon, { transform: [{ scale }] }]} />
      </View>
    </GestureDetector>
  );
}

// ── Home (circle with house) ────────────────────────────
export function HomeBtn({ send }) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const pressedRef = useRef(false);
  const grant = () => {
    if (pressedRef.current) return;
    pressedRef.current = true;
    depth.symbolIn();
    send({ t: 'btn', k: 'home', d: true });
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.85, useNativeDriver: true, tension: 240, friction: 8 }),
      Animated.timing(glow, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };
  const release = () => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    depth.symbolOut();
    send({ t: 'btn', k: 'home', d: false });
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 300, friction: 10 }),
      Animated.timing(glow, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };
  const gesture = useMemo(
    () =>
      Gesture.Manual()
        .runOnJS(true)
        .hitSlop(10)
        .onTouchesDown((_e, m) => { m.activate(); grant(); })
        .onTouchesUp((e, m) => { if (e.numberOfTouches === 0) { release(); m.end(); } })
        .onTouchesCancelled((_e, m) => { release(); m.end(); }),
    []
  );
  return (
    <GestureDetector gesture={gesture}>
      <View style={s.homeBtn}>
        <Animated.View pointerEvents="none" style={[s.homeGlow, { opacity: glow }]} />
        <Animated.Text style={[s.homeIcon, { transform: [{ scale }] }]}>⌂</Animated.Text>
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  symbolBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  symbolText: { color: 'rgba(0,0,0,0.55)', fontSize: 20, fontWeight: '800' },

  captureBtn: {
    width: 24, height: 24, borderRadius: 6,
    backgroundColor: '#0a0a0d',
    alignItems: 'center', justifyContent: 'center',
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.5)',
    ...SHADOW,
  },
  captureIcon: {
    width: 10, height: 10,
    borderWidth: 1.5,
    borderColor: '#cfd2da',
    borderRadius: 1,
  },

  homeBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#0a0a0d',
    alignItems: 'center', justifyContent: 'center',
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.5)',
    ...SHADOW,
  },
  homeGlow: {
    position: 'absolute',
    top: -4, left: -4, right: -4, bottom: -4,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 10,
  },
  homeIcon: { color: '#cfd2da', fontSize: 16, lineHeight: 18 },
});
