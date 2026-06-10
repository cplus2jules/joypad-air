import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

// ── Banner de aviso bajo el topbar ──────────────────────
// Barra de 26px que se desliza (translateY) bajo el topbar cuando el
// server reporta un problema accionable (falta foco de Ryujinx, falta
// permiso de Accesibilidad). `message` null ⇒ se repliega y desmonta.
// pointerEvents none — nunca roba toques al pad.

export const BANNER_H = 26;
const SLIDE_MS = 180;

export default function StatusBanner({ message, top = 40 }) {
  const [rendered, setRendered] = useState(message ?? null);
  const y = useRef(new Animated.Value(message ? 0 : -BANNER_H)).current;

  useEffect(() => {
    if (message) {
      setRendered(message); // si cambia el texto con el banner visible, se actualiza en sitio
      Animated.timing(y, { toValue: 0, duration: SLIDE_MS, useNativeDriver: true }).start();
    } else {
      Animated.timing(y, { toValue: -BANNER_H, duration: SLIDE_MS, useNativeDriver: true }).start(
        ({ finished }) => finished && setRendered(null)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  if (!rendered) return null;

  return (
    <View pointerEvents="none" style={[s.clip, { top }]}>
      <Animated.View style={[s.bar, { transform: [{ translateY: y }] }]}>
        <Text style={s.text} numberOfLines={1}>
          {rendered}
        </Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  // Ventana de recorte: el banner se desliza dentro, nunca tapa el topbar
  clip: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: BANNER_H,
    overflow: 'hidden',
    zIndex: 40,
  },
  bar: {
    height: BANNER_H,
    backgroundColor: 'rgba(250,160,5,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  text: {
    color: '#231505',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
