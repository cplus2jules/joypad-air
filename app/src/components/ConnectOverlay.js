import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { haptic } from '../haptics';

// ── Overlay de acople al conectar ───────────────────────
// Al transicionar status → 'conectado': dos mini-joycons del tema
// activo entran desde los lados y se acoplan al centro; al contacto,
// flash blanco + nombre del player + el doble pulso háptico del
// acople real (rigid → heavy a los 90ms). Primera conexión = versión
// completa; reconexiones = versión corta (solo flash + doble pulso).
// pointerEvents none — nunca roba toques al pad.

const CONTACT_MS = 250; // los joycons "chocan" ≈ aquí (spring 70/9)
const TOTAL_MS = 900;   // inicio del fade-out total

export default function ConnectOverlay({ status, theme, name }) {
  const [mode, setMode] = useState(null); // null | 'full' | 'short'
  const prevStatus = useRef(status);
  const everConnected = useRef(false);
  const timersRef = useRef([]);

  const master = useRef(new Animated.Value(0)).current; // opacidad global
  const leftX = useRef(new Animated.Value(-160)).current;
  const rightX = useRef(new Animated.Value(160)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const nameOp = useRef(new Animated.Value(0)).current;

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;
    if (status !== 'conectado' || was === 'conectado') return;

    const full = !everConnected.current;
    everConnected.current = true;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    const at = (ms, fn) => timersRef.current.push(setTimeout(fn, ms));

    const doublePulse = () => {
      haptic.rigid();
      at(90, haptic.heavy); // el doble pulso del Joy-Con real
    };
    const flashIn = (fadeMs) =>
      Animated.sequence([
        Animated.timing(flash, { toValue: 0.8, duration: 60, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: fadeMs, useNativeDriver: true }),
      ]);

    if (full) {
      master.setValue(0);
      leftX.setValue(-160);
      rightX.setValue(160);
      flash.setValue(0);
      nameOp.setValue(0);
      setMode('full');
      Animated.timing(master, { toValue: 1, duration: 120, useNativeDriver: true }).start();
      Animated.spring(leftX, { toValue: 0, useNativeDriver: true, tension: 70, friction: 9 }).start();
      Animated.spring(rightX, { toValue: 0, useNativeDriver: true, tension: 70, friction: 9 }).start();
      at(CONTACT_MS, () => {
        doublePulse();
        flashIn(90).start();
        Animated.timing(nameOp, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      });
      at(TOTAL_MS, () => {
        Animated.timing(master, { toValue: 0, duration: 200, useNativeDriver: true }).start(
          () => setMode(null)
        );
      });
    } else {
      // reconexión: solo flash + doble pulso, sin teatro
      master.setValue(1);
      flash.setValue(0);
      setMode('short');
      doublePulse();
      flashIn(150).start(() => setMode(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (!mode) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        s.wrap,
        { opacity: master },
        mode === 'full' && s.backdrop,
      ]}
    >
      {mode === 'full' && (
        <>
          <View style={s.joyRow}>
            <Animated.View style={{ transform: [{ translateX: leftX }] }}>
              <LinearGradient
                colors={theme.L}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.joyL}
              />
            </Animated.View>
            <Animated.View style={{ transform: [{ translateX: rightX }] }}>
              <LinearGradient
                colors={theme.R}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={s.joyR}
              />
            </Animated.View>
          </View>
          <Animated.Text style={[s.name, { opacity: nameOp }]} numberOfLines={1}>
            {String(name || '').toUpperCase()}
          </Animated.Text>
        </>
      )}
      <Animated.View style={[StyleSheet.absoluteFill, s.flash, { opacity: flash }]} />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    zIndex: 100,
    elevation: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: { backgroundColor: 'rgba(11,13,18,0.85)' },
  joyRow: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  joyL: {
    width: 56,
    height: 120,
    borderTopLeftRadius: 26,
    borderBottomLeftRadius: 26,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  joyR: {
    width: 56,
    height: 120,
    borderTopRightRadius: 26,
    borderBottomRightRadius: 26,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  name: {
    marginTop: 16,
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  flash: { backgroundColor: '#ffffff' },
});
