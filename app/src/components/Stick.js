import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { SHADOW } from '../theme';
import { depth } from '../haptics';

// ── Analog Stick (with depressed bowl + raised thumb) ───
export default function Stick({ stickId, send, big }) {
  const RADIUS = big ? 95 : 55;
  // OJO: el valor ENVIADO al server es crudo [-1,1] (solo clamp al radio).
  // La deadzone/curva del stick viven en el server (stick-engine, mensaje config).
  // SENSITIVITY y DEADZONE se conservan SOLO para los thresholds de háptica.
  const SENSITIVITY = 0.85;
  const DEADZONE = 0.18;
  const SOFT_THRESHOLD = 0.32;  // feedback ligero
  const HARD_THRESHOLD = 0.60;  // click fuerte de compromiso de dirección
  const SEND_THROTTLE_MS = 16;  // antes 10ms — el {0,0} de release va aparte, sin throttle
  const EDGE_PULSE_MS = 250;    // pulso al borde poco frecuente

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const lastSentTs = useRef(0);
  const lastDirRef = useRef({ x: 0, y: 0 });
  const softActiveRef = useRef(false);
  const edgePulseRef = useRef(null);
  const atEdgeRef = useRef(false);

  const startEdgePulse = () => {
    if (edgePulseRef.current) return;
    edgePulseRef.current = setInterval(depth.stickEdge, EDGE_PULSE_MS);
  };
  const stopEdgePulse = () => {
    if (edgePulseRef.current) {
      clearInterval(edgePulseRef.current);
      edgePulseRef.current = null;
    }
  };

  useEffect(() => () => stopEdgePulse(), []);

  const onMove = (dxRaw, dyRaw) => {
    let dx = dxRaw;
    let dy = dyRaw;
    const rawDist = Math.hypot(dx, dy);
    if (rawDist > RADIUS) {
      dx = (dx / rawDist) * RADIUS;
      dy = (dy / rawDist) * RADIUS;
    }
    pan.setValue({ x: dx, y: dy });

    // Normalizar — valor CRUDO que se envía (sin deadzone ni curva)
    const nx = dx / RADIUS;
    const ny = dy / RADIUS;

    // Valores con deadzone+curva SOLO para los thresholds de háptica
    // (idéntico al comportamiento previo del feedback)
    let hx = nx;
    let hy = ny;
    const mag = Math.hypot(hx, hy);
    if (mag < DEADZONE) {
      hx = 0;
      hy = 0;
    } else {
      // re-mapear [DEADZONE, 1] → [0, 1] con curva de sensibilidad
      const scaled = (mag - DEADZONE) / (1 - DEADZONE);
      const curved = Math.pow(scaled, SENSITIVITY);
      const factor = curved / mag;
      hx *= factor;
      hy *= factor;
    }

    // Soft tick: sutil al primer movimiento fuera de zona muerta
    const softNow = Math.abs(hx) > SOFT_THRESHOLD || Math.abs(hy) > SOFT_THRESHOLD;
    if (softNow !== softActiveRef.current) {
      softActiveRef.current = softNow;
      if (softNow) depth.stickSoft();
    }

    // Hard click: compromiso de dirección
    const dirX = hx > HARD_THRESHOLD ? 1 : hx < -HARD_THRESHOLD ? -1 : 0;
    const dirY = hy > HARD_THRESHOLD ? 1 : hy < -HARD_THRESHOLD ? -1 : 0;
    if (dirX !== lastDirRef.current.x || dirY !== lastDirRef.current.y) {
      depth.stickClick();
      lastDirRef.current = { x: dirX, y: dirY };
    }

    // Edge pulse: vibración continua al tope
    const atEdge = rawDist > RADIUS - 2;
    if (atEdge && !atEdgeRef.current) {
      atEdgeRef.current = true;
      startEdgePulse();
    } else if (!atEdge && atEdgeRef.current) {
      atEdgeRef.current = false;
      stopEdgePulse();
    }

    const now = Date.now();
    if (now - lastSentTs.current > SEND_THROTTLE_MS) {
      lastSentTs.current = now;
      send({ t: 'stick', s: stickId, x: nx, y: ny });
    }
  };

  const onGrab = () => {
    // sin haptic en grab — usuario lo sentía excesivo
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, tension: 220, friction: 8 }),
      Animated.timing(glow, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  };

  const onRelease = () => {
    // sin haptic en release tampoco
    stopEdgePulse();
    atEdgeRef.current = false;
    softActiveRef.current = false;
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      friction: 6,
      tension: 80,
    }).start();
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 280, friction: 9 }),
      Animated.timing(glow, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
    send({ t: 'stick', s: stickId, x: 0, y: 0 });
    lastDirRef.current = { x: 0, y: 0 };
  };

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .hitSlop(25)
        .onBegin(onGrab)
        .onUpdate((e) => onMove(e.translationX, e.translationY))
        .onEnd(onRelease)
        .onFinalize(() => {}),
    []
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={big ? s.stickContainerBig : s.stickContainer}>
        <View style={big ? s.stickBowlOuterBig : s.stickBowlOuter} pointerEvents="none" />
        <View style={big ? s.stickBowlInnerBig : s.stickBowlInner} pointerEvents="none" />
        <Animated.View
          pointerEvents="none"
          style={[big ? s.stickGlowBig : s.stickGlow, { opacity: glow }]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            big ? s.stickThumbBig : s.stickThumb,
            {
              transform: [
                { translateX: pan.x },
                { translateY: pan.y },
                { scale },
              ],
            },
          ]}
        >
          <View style={s.stickThumbHighlight} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  // Stick (depressed bowl + raised thumb cap) — tamaño que calza con dpad
  stickContainer: {
    width: 130, height: 130,
    alignItems: 'center', justifyContent: 'center',
  },
  stickBowlOuter: {
    position: 'absolute',
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: '#1c1d22',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.6)',
  },
  stickBowlInner: {
    position: 'absolute',
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: '#0a0a0c',
    top: 10, left: 10,
    borderTopWidth: 2,
    borderTopColor: 'rgba(0,0,0,0.8)',
  },
  stickGlow: {
    position: 'absolute',
    width: 115, height: 115, borderRadius: 58,
    backgroundColor: '#ffffff',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
  },
  stickThumb: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#1a1b20',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#000',
    borderBottomWidth: 3,
    borderBottomColor: '#000',
    ...SHADOW,
  },
  // ── Stick BIG (modo compacto) ─────────────────────
  stickContainerBig: { width: 230, height: 230, alignItems: 'center', justifyContent: 'center' },
  stickBowlOuterBig: {
    position: 'absolute', width: 230, height: 230, borderRadius: 115,
    backgroundColor: '#1c1d22',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.6)',
  },
  stickBowlInnerBig: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: '#0a0a0c',
    top: 15, left: 15,
    borderTopWidth: 2, borderTopColor: 'rgba(0,0,0,0.8)',
  },
  stickGlowBig: {
    position: 'absolute', width: 210, height: 210, borderRadius: 105,
    backgroundColor: '#ffffff',
    shadowColor: '#fff', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 28,
  },
  stickThumbBig: {
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: '#1a1b20',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#000',
    borderBottomWidth: 4, borderBottomColor: '#000',
    ...SHADOW,
  },
  stickThumbHighlight: {
    width: 44, height: 22,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    position: 'absolute', top: 4,
  },
});
