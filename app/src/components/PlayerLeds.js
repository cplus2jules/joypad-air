import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

// ── LEDs de jugador (fila de 4, como el Joy-Con real) ───
// El slot activo va relleno con el accent del tema + glow; el resto son
// huecos con borde tenue. Mientras no esté 'conectado', el LED activo
// parpadea (0.3 ↔ 1 cada 600ms) — un Joy-Con buscando consola.
export default function PlayerLeds({ player, accent, status }) {
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status !== 'conectado') {
      blink.setValue(1);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(blink, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(blink, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    blink.setValue(1); // conectado: LED fijo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <View style={s.row}>
      {[1, 2, 3, 4].map((slot) =>
        slot === player ? (
          <Animated.View
            key={slot}
            style={[
              s.led,
              s.ledOn,
              { backgroundColor: accent, shadowColor: accent, opacity: blink },
            ]}
          />
        ) : (
          <View key={slot} style={[s.led, s.ledOff]} />
        )
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5, marginTop: 3 },
  led: { width: 6, height: 6, borderRadius: 2 },
  ledOn: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
    elevation: 3,
  },
  ledOff: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
});
