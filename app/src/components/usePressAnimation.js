import { useRef } from 'react';
import { Animated } from 'react-native';

// ── Animación de "pressed" compartida ───────────────────
// Extraída de RecessedBtn: hundimiento (scale 0.84 + translateY 5)
// con spring snappy + flash de glow. La usan el modo autónomo de
// RecessedBtn y los modos presentacionales (DPad unificado,
// ShoulderCluster) sin duplicar los springs.
export default function usePressAnimation() {
  const scale = useRef(new Animated.Value(1)).current;
  const pressY = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

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

  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] });

  return { scale, pressY, glowOpacity, animateIn, animateOut };
}
