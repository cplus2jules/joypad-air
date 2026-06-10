import { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, SHADOW } from '../theme';
import { haptic, depth } from '../haptics';
import { detectHost, SERVER_PORT } from '../net/connection';

// ── Background blobs (slow drift) ───────────────────────
function FloatingBlobs() {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 9000, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 9000, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(b, { toValue: 1, duration: 12000, useNativeDriver: true }),
        Animated.timing(b, { toValue: 0, duration: 12000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const t1x = a.interpolate({ inputRange: [0, 1], outputRange: [-30, 60] });
  const t1y = a.interpolate({ inputRange: [0, 1], outputRange: [-20, 30] });
  const t2x = b.interpolate({ inputRange: [0, 1], outputRange: [40, -50] });
  const t2y = b.interpolate({ inputRange: [0, 1], outputRange: [20, -30] });

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[s.blob, {
          backgroundColor: C.red,
          top: -120,
          left: -100,
          transform: [{ translateX: t1x }, { translateY: t1y }],
        }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[s.blob, {
          backgroundColor: C.blue,
          bottom: -120,
          right: -100,
          transform: [{ translateX: t2x }, { translateY: t2y }],
        }]}
      />
    </>
  );
}

// ── Mode card (with mini joycon preview) ────────────────
function ModeCard({ id, label, sublabel, active, onPress }) {
  const scale = useRef(new Animated.Value(active ? 1.04 : 1)).current;
  const elev = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: active ? 1.04 : 1, useNativeDriver: true, tension: 200, friction: 8 }),
      Animated.timing(elev, { toValue: active ? 1 : 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [active]);

  const renderPreview = () => {
    if (id === 'full') {
      return (
        <View style={s.previewRow}>
          <View style={[s.miniJoy, s.miniJoyL, { backgroundColor: C.red }]} />
          <View style={[s.miniJoy, s.miniJoyR, { backgroundColor: C.blue }]} />
        </View>
      );
    }
    if (id === 'left') {
      return (
        <View style={s.previewRow}>
          <View style={[s.miniJoy, s.miniJoyWide, { backgroundColor: C.red }]} />
        </View>
      );
    }
    return (
      <View style={s.previewRow}>
        <View style={[s.miniJoy, s.miniJoyWide, { backgroundColor: C.blue }]} />
      </View>
    );
  };

  return (
    <Pressable
      onPress={() => { haptic.select(); onPress(); }}
      style={s.modeCardWrap}
    >
      <Animated.View
        style={[
          s.modeCard,
          active && s.modeCardActive,
          { transform: [{ scale }] },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[s.modeCardGlow, { opacity: elev }]}
        />
        {renderPreview()}
        <Text style={[s.modeCardLabel, active && { color: '#fff' }]}>{label}</Text>
        <Text style={s.modeCardSub}>{sublabel}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ── Player card (huge gradient with joycon visual) ──────
function PlayerCard({ player, onPick }) {
  const isP1 = player === 1;
  const colors = isP1 ? [C.redLight, C.red, C.redDark] : [C.blueLight, C.blue, C.blueDark];
  const scale = useRef(new Animated.Value(1)).current;
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const glowOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] });

  return (
    <Pressable
      onPressIn={() => {
        Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, tension: 220, friction: 8 }).start();
      }}
      onPressOut={() => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 280, friction: 10 }).start();
      }}
      onPress={() => {
        depth.buttonIn();
        onPick(player);
      }}
      style={s.playerCardWrap}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          s.playerCardGlow,
          { backgroundColor: isP1 ? C.red : C.blue, opacity: glowOpacity },
        ]}
      />
      <Animated.View style={{ transform: [{ scale }] }}>
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.playerCard}
        >
          <Text
            style={s.playerCardNumberBg}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {player}
          </Text>
          <View style={s.playerCardFg}>
            <Text style={s.playerCardKicker} numberOfLines={1}>CHOCORRAMITO</Text>
            <Text style={s.playerCardCTA}>Empezar ›</Text>
          </View>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

// ── Picker ──────────────────────────────────────────────
export default function Picker({ layout, onLayout, onPick }) {
  const host = detectHost();
  const fade1 = useRef(new Animated.Value(0)).current;
  const fade2 = useRef(new Animated.Value(0)).current;
  const fade3 = useRef(new Animated.Value(0)).current;
  const fade4 = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.stagger(120, [
        Animated.timing(fade1, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(fade2, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(fade3, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(fade4, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
      Animated.spring(slide, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }),
    ]).start();
  }, []);

  const layouts = [
    { id: 'full',  label: 'Pareja',     sublabel: 'Dos joycons' },
    { id: 'left',  label: 'Joy-Con L',  sublabel: 'Sólo izquierdo' },
    { id: 'right', label: 'Joy-Con R',  sublabel: 'Sólo derecho' },
  ];

  return (
    <View style={s.picker}>
      <FloatingBlobs />

      <View style={s.pickerContent}>
        {/* ─── Left column: brand ─── */}
        <Animated.View
          style={[s.pickerLeft, { opacity: fade1, transform: [{ translateY: slide }] }]}
        >
          <Text style={s.brandKicker}>EL CONTROL</Text>
          <Text style={s.brandTitle}>Super{'\n'}Pro Max</Text>
          <View style={s.brandMeta}>
            <View style={[s.brandDot, { backgroundColor: host ? C.ok : C.err }]} />
            <Text style={s.brandHost}>
              {host ? `${host}:${SERVER_PORT}` : 'sin Mac'}
            </Text>
          </View>
          <Animated.Text style={[s.footerLeft, { opacity: fade4 }]}>
            Conecta el segundo iPhone para co-op local
          </Animated.Text>
        </Animated.View>

        {/* ─── Right column: mode + players ─── */}
        <View style={s.pickerRight}>
          <Animated.View style={[s.modeBlock, { opacity: fade2 }]}>
            <Text style={s.proSectionLabel}>Modo</Text>
            <View style={s.modeGrid}>
              {layouts.map((l) => (
                <ModeCard
                  key={l.id}
                  id={l.id}
                  label={l.label}
                  sublabel={l.sublabel}
                  active={layout === l.id}
                  onPress={() => onLayout(l.id)}
                />
              ))}
            </View>
          </Animated.View>

          <Animated.View style={[s.playerBlock, { opacity: fade3 }]}>
            <Text style={s.proSectionLabel}>Jugador</Text>
            <View style={s.playerGrid}>
              <PlayerCard player={1} onPick={onPick} />
              <PlayerCard player={2} onPick={onPick} />
            </View>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // Picker
  picker: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  title: { color: C.ink, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: C.inkDim, fontSize: 12, marginTop: 6, marginBottom: 18 },
  sectionLabel: {
    color: C.inkDim,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 14,
    marginBottom: 10,
  },
  chipRow: { flexDirection: 'row', gap: 10 },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: C.chip,
    borderWidth: 1,
    borderColor: '#2a2f3d',
  },
  chipActive: { backgroundColor: C.chipActive, borderColor: '#5a6178' },
  chipText: { color: C.inkDim, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: C.ink },
  pickerRow: { flexDirection: 'row', gap: 18, marginTop: 4 },
  pickWrap: { ...SHADOW, borderRadius: 20 },
  pickBtn: {
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderRadius: 20,
    minWidth: 170,
    alignItems: 'center',
  },
  pickBtnText: { color: '#fff', fontSize: 19, fontWeight: '800', letterSpacing: 0.3 },

  // ── Picker pro ──────────────────────────────────────
  blob: {
    position: 'absolute',
    width: 360, height: 360, borderRadius: 180,
    opacity: 0.22,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 80,
  },
  pickerContent: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 32,
    paddingVertical: 20,
    gap: 28,
  },
  pickerLeft: {
    width: 230,
    justifyContent: 'space-between',
  },
  pickerRight: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
  },
  brandKicker: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  brandTitle: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1.4,
    marginTop: 4,
    lineHeight: 38,
  },
  brandMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  brandDot: {
    width: 7, height: 7, borderRadius: 4,
    shadowColor: '#5ad07a',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  brandHost: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modeBlock: {},
  proSectionLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  modeGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  modeCardWrap: {
    flex: 1,
  },
  modeCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    overflow: 'hidden',
    height: 70,
    justifyContent: 'center',
  },
  modeCardActive: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.30)',
  },
  modeCardGlow: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  modeCardLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
    marginTop: 4,
  },
  modeCardSub: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
    marginTop: 1,
    letterSpacing: 0.2,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 4,
    height: 28,
    alignItems: 'center',
  },
  miniJoy: {
    height: 24,
    width: 12,
  },
  miniJoyL: {
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  miniJoyR: {
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    borderTopLeftRadius: 2,
    borderBottomLeftRadius: 2,
  },
  miniJoyWide: {
    width: 28,
    borderRadius: 10,
  },

  playerBlock: {},
  playerGrid: {
    flexDirection: 'row',
    gap: 14,
  },
  playerCardWrap: {
    flex: 1,
    position: 'relative',
  },
  playerCardGlow: {
    position: 'absolute',
    top: -10, left: -10, right: -10, bottom: -10,
    borderRadius: 28,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 20,
  },
  playerCard: {
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 18,
    height: 110,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
  },
  playerCardNumberBg: {
    position: 'absolute',
    right: -8,
    top: -22,
    color: 'rgba(255,255,255,0.95)',
    fontSize: 150,
    fontWeight: '900',
    letterSpacing: -10,
    lineHeight: 150,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
  },
  playerCardFg: {
    flex: 1,
    justifyContent: 'space-between',
    zIndex: 2,
  },
  playerCardKicker: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.2,
  },
  playerCardCTA: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  footerLeft: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    letterSpacing: 0.5,
    lineHeight: 14,
  },
});
