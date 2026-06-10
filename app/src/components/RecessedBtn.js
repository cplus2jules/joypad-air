import { useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { C } from '../theme';
import { haptic, depth } from '../haptics';

// ── Recessed (deep) button — used for face / shoulders / dpad ─
export default function RecessedBtn({ name, label, send, style, textStyle, h = 'medium', releaseHaptic = 'select' }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressY = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const repeatRef = useRef(null);
  const pressedRef = useRef(false);

  const animateIn = () => {
    Animated.parallel([
      // press más profundo + snappier (más tensión)
      Animated.spring(scale, { toValue: 0.84, useNativeDriver: true, tension: 380, friction: 9 }),
      Animated.spring(pressY, { toValue: 5, useNativeDriver: true, tension: 380, friction: 9 }),
      // flash de glow rápido
      Animated.timing(glow, { toValue: 1, duration: 50, useNativeDriver: true }),
    ]).start();
  };
  const animateOut = () => {
    Animated.parallel([
      // release con rebote (bounciness alta)
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 240, friction: 6, restSpeedThreshold: 0.001 }),
      Animated.spring(pressY, { toValue: 0, useNativeDriver: true, tension: 240, friction: 6 }),
      Animated.timing(glow, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  };

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
      repeatRef.current = setInterval(() => haptic.rigid(), 140);
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

  const gesture = useMemo(
    () =>
      Gesture.Manual()
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
        }),
    []
  );

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] });

  return (
    <GestureDetector gesture={gesture}>
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
    </GestureDetector>
  );
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
