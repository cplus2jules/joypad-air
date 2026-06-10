import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { C, SHADOW } from './src/theme';
import { haptic, depth } from './src/haptics';
import RecessedBtn from './src/components/RecessedBtn';
import { SymbolBtn, CaptureBtn, HomeBtn } from './src/components/SymbolButtons';
import Stick from './src/components/Stick';
import DPad from './src/components/DPad';
import FaceButtons from './src/components/FaceButtons';

const SERVER_PORT = 3001;

// ── helpers ─────────────────────────────────────────────
function detectHost() {
  const hu =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.developer?.hostUri ||
    '';
  const ip = hu.split(':')[0];
  return ip || null;
}

// ── App root ────────────────────────────────────────────
export default function App() {
  useKeepAwake();
  const [player, setPlayer] = useState(null);
  const [layout, setLayout] = useState('full'); // 'full' | 'left' | 'right'
  const [compact, setCompact] = useState(false); // oculta dpad, stick derecho, capture, home

  useEffect(() => {
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE
    ).catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={s.root}>
      <StatusBar hidden />
      {player == null ? (
        <Picker layout={layout} onLayout={setLayout} onPick={setPlayer} />
      ) : (
        <Pad
          player={player}
          layout={layout}
          compact={compact}
          onToggleCompact={() => setCompact((c) => !c)}
          onBack={() => setPlayer(null)}
        />
      )}
    </GestureHandlerRootView>
  );
}

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
function Picker({ layout, onLayout, onPick }) {
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

// ── Pad ─────────────────────────────────────────────────
function Pad({ player, layout, compact, onToggleCompact, onBack }) {
  const wsRef = useRef(null);
  const [status, setStatus] = useState('conectando');
  const host = useMemo(() => detectHost(), []);

  useEffect(() => {
    let active = true;
    let reconnectTimer = null;

    const connect = () => {
      if (!active) return;
      if (!host) {
        setStatus('sin host');
        return;
      }
      const url = `ws://${host}:${SERVER_PORT}/?p=${player}`;
      let socket;
      try {
        socket = new WebSocket(url);
      } catch {
        if (active) reconnectTimer = setTimeout(connect, 1500);
        return;
      }
      wsRef.current = socket;
      socket.onopen = () => {
        if (active) {
          setStatus('conectado');
          haptic.light();
        }
      };
      socket.onclose = () => {
        if (!active) return;
        setStatus('reconectando');
        reconnectTimer = setTimeout(connect, 1500);
      };
      socket.onerror = () => active && setStatus('error');
    };

    connect();
    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { wsRef.current?.close(); } catch {}
    };
  }, [player, host]);

  const send = (obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify(obj)); } catch {}
    }
  };

  return (
    <View style={s.pad}>
      <View style={s.topBar}>
        <Pressable onPress={() => { haptic.light(); onBack(); }} style={s.backBtn}>
          <Text style={s.backText}>‹</Text>
        </Pressable>
        <View
          style={[
            s.playerPill,
            { backgroundColor: player === 1 ? C.red : C.blue },
          ]}
        >
          <Text style={s.playerPillText}>CHOCORRAMITO {player}</Text>
        </View>
        <Text
          style={[
            s.statusText,
            status === 'conectado' && { color: C.ok },
            (status === 'error' || status === 'sin host') && { color: C.err },
          ]}
        >
          {status}
        </Text>
        <Pressable
          onPress={() => { haptic.light(); onToggleCompact(); }}
          style={s.compactToggle}
        >
          <Text style={[s.compactToggleText, compact && { color: '#5ad07a' }]}>
            {compact ? '◧ MAX' : '⊞ MIN'}
          </Text>
        </Pressable>
      </View>

      <View style={s.body}>
        {layout === 'full' && (
          <>
            <LeftJoycon send={send} compact={compact} />
            <RightJoycon send={send} compact={compact} />
          </>
        )}
        {layout === 'left' && <SidewaysLeft send={send} />}
        {layout === 'right' && <SidewaysRight send={send} />}
      </View>
    </View>
  );
}

// ── Sideways Left Joy-Con (Mario Kart style — full screen) ─
function SidewaysLeft({ send }) {
  return (
    <View style={[s.sideways, { backgroundColor: C.red }]}>
      <LinearGradient
        colors={[C.redLight, C.red, C.redDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* shoulders on top */}
      <View style={s.swShoulders}>
        <RecessedBtn name="sl" label="SL" send={send} h="light" style={s.swShoulder} textStyle={s.shoulderText} />
        <RecessedBtn name="sr" label="SR" send={send} h="light" style={s.swShoulder} textStyle={s.shoulderText} />
      </View>

      {/* face buttons (dpad acting as faces) on left */}
      <View style={s.swFaceLeft}>
        <View style={s.swFace}>
          <View style={[s.swFaceSlot, s.swFaceTop]}>
            <RecessedBtn name="dpad_left" label="◀" send={send} h="medium" style={s.swFaceBtn} textStyle={s.swFaceText} />
          </View>
          <View style={[s.swFaceSlot, s.swFaceLeftPos]}>
            <RecessedBtn name="dpad_down" label="▼" send={send} h="medium" style={s.swFaceBtn} textStyle={s.swFaceText} />
          </View>
          <View style={[s.swFaceSlot, s.swFaceRightPos]}>
            <RecessedBtn name="dpad_up" label="▲" send={send} h="medium" style={s.swFaceBtn} textStyle={s.swFaceText} />
          </View>
          <View style={[s.swFaceSlot, s.swFaceBottom]}>
            <RecessedBtn name="dpad_right" label="▶" send={send} h="medium" style={s.swFaceBtn} textStyle={s.swFaceText} />
          </View>
        </View>
      </View>

      {/* stick on right */}
      <View style={s.swStickRight}>
        <Stick stickId="L" send={send} />
      </View>

      {/* bottom: minus + capture */}
      <View style={s.swBottomRow}>
        <SymbolBtn name="minus" symbol="−" send={send} />
        <View style={{ width: 14 }} />
        <CaptureBtn send={send} />
      </View>
    </View>
  );
}

// ── Sideways Right Joy-Con (Mario Kart style — full screen) ─
function SidewaysRight({ send }) {
  return (
    <View style={[s.sideways, { backgroundColor: C.blue }]}>
      <LinearGradient
        colors={[C.blueLight, C.blue, C.blueDark]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.swShoulders}>
        <RecessedBtn name="sl" label="SL" send={send} h="light" style={s.swShoulder} textStyle={s.shoulderText} />
        <RecessedBtn name="sr" label="SR" send={send} h="light" style={s.swShoulder} textStyle={s.shoulderText} />
      </View>

      {/* stick on left */}
      <View style={s.swStickLeft}>
        <Stick stickId="R" send={send} />
      </View>

      {/* ABXY on right (rotated so it sits like sideways) */}
      <View style={s.swFaceRight}>
        <View style={s.swFace}>
          <View style={[s.swFaceSlot, s.swFaceTop]}>
            <RecessedBtn name="y" label="Y" send={send} h="medium" style={s.swFaceBtn} textStyle={s.swFaceText} />
          </View>
          <View style={[s.swFaceSlot, s.swFaceLeftPos]}>
            <RecessedBtn name="b" label="B" send={send} h="medium" style={s.swFaceBtn} textStyle={s.swFaceText} />
          </View>
          <View style={[s.swFaceSlot, s.swFaceRightPos]}>
            <RecessedBtn name="x" label="X" send={send} h="medium" style={s.swFaceBtn} textStyle={s.swFaceText} />
          </View>
          <View style={[s.swFaceSlot, s.swFaceBottom]}>
            <RecessedBtn name="a" label="A" send={send} h="medium" style={s.swFaceBtn} textStyle={s.swFaceText} />
          </View>
        </View>
      </View>

      <View style={s.swBottomRow}>
        <SymbolBtn name="plus" symbol="+" send={send} />
        <View style={{ width: 14 }} />
        <HomeBtn send={send} />
      </View>
    </View>
  );
}

// ── Left Joy-Con ────────────────────────────────────────
function LeftJoycon({ send, compact }) {
  return (
    <View style={[s.joycon, s.joyconLeft]}>
      <LinearGradient
        colors={[C.redLight, C.red, C.redDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.shoulderBarLeft}>
        <RecessedBtn name="zl" label="ZL" send={send} h="heavy" style={s.shoulder} textStyle={s.shoulderText} />
        <RecessedBtn name="l"  label="L"  send={send} h="light"  style={s.shoulder} textStyle={s.shoulderText} />
      </View>

      <View style={s.joyconInner}>
        <View style={s.cornerTopRight}>
          <SymbolBtn name="minus" send={send} symbol="−" />
        </View>

        <View style={compact ? s.stickWrapCenter : s.stickWrap}>
          <Stick stickId="L" send={send} big={compact} />
        </View>

        {!compact && (
          <View style={s.dpadWrap}>
            <DPad send={send} />
          </View>
        )}

        {!compact && (
          <View style={s.cornerBottomRight}>
            <CaptureBtn send={send} />
          </View>
        )}
      </View>
    </View>
  );
}

// ── Right Joy-Con ───────────────────────────────────────
function RightJoycon({ send, compact }) {
  return (
    <View style={[s.joycon, s.joyconRight]}>
      <LinearGradient
        colors={[C.blueLight, C.blue, C.blueDark]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.shoulderBarRight}>
        <RecessedBtn name="r"  label="R"  send={send} h="light"  style={s.shoulder} textStyle={s.shoulderText} />
        <RecessedBtn name="zr" label="ZR" send={send} h="heavy" style={s.shoulder} textStyle={s.shoulderText} />
      </View>

      <View style={s.joyconInner}>
        <View style={s.cornerTopLeft}>
          <SymbolBtn name="plus" send={send} symbol="+" />
        </View>

        <View style={compact ? s.faceWrapCenter : s.faceWrap}>
          <FaceButtons send={send} big={compact} />
        </View>

        {!compact && (
          <View style={s.stickWrapRight}>
            <Stick stickId="R" send={send} />
          </View>
        )}

        {!compact && (
          <View style={s.cornerBottomLeft}>
            <HomeBtn send={send} />
          </View>
        )}
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

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

  // Pad
  pad: { flex: 1, backgroundColor: C.bg },
  topBar: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  backBtn: { position: 'absolute', left: 12, paddingVertical: 4, paddingHorizontal: 10 },
  backText: { color: C.inkDim, fontSize: 22, fontWeight: '700' },
  playerPill: { paddingHorizontal: 12, paddingVertical: 3, borderRadius: 10 },
  playerPillText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  statusText: { color: C.inkDim, fontSize: 10 },
  compactToggle: {
    position: 'absolute',
    right: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  compactToggleText: {
    color: C.inkDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
  spacer: { flex: 1 },

  // Joy-Con panels
  joycon: {
    flex: 1,
    overflow: 'hidden',
    ...SHADOW,
  },
  joyconLeft: {},
  joyconRight: {},
  joyconInner: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 8,
    position: 'relative',
  },

  // Shoulder bar
  shoulderBarLeft: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 6,
    paddingHorizontal: 22,
    paddingRight: 50,
    justifyContent: 'flex-start',
  },
  shoulderBarRight: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 6,
    paddingHorizontal: 22,
    paddingLeft: 50,
    justifyContent: 'flex-end',
  },
  shoulder: { width: 80, height: 30, borderRadius: 15 },
  shoulderText: { fontSize: 13, fontWeight: '800', letterSpacing: 1 },

  // Corner positions for + / − / capture / home
  cornerTopRight: { position: 'absolute', top: 4, right: 18, zIndex: 5 },
  cornerTopLeft:  { position: 'absolute', top: 4, left: 18, zIndex: 5 },
  cornerBottomRight: { position: 'absolute', bottom: 8, right: 18, zIndex: 5 },
  cornerBottomLeft:  { position: 'absolute', bottom: 8, left: 18, zIndex: 5 },

  // Stick wrap positions inside joycon
  stickWrap: {
    position: 'absolute', top: 20, left: 0, right: 0,
    alignItems: 'center',
  },
  stickWrapRight: {
    position: 'absolute', bottom: 30, left: 0, right: 0,
    alignItems: 'center',
  },
  // wrappers centrados verticalmente (modo compact — stick/face ocupa todo el espacio)
  stickWrapCenter: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  faceWrapCenter: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  dpadWrap: {
    position: 'absolute', bottom: 16, left: 0, right: 0,
    alignItems: 'center',
  },
  faceWrap: {
    position: 'absolute', top: 16, left: 0, right: 0,
    alignItems: 'center',
  },

  // ── Sideways (single Joy-Con full screen) ───────────
  sideways: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  swShoulders: {
    position: 'absolute',
    top: 10,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  swShoulder: {
    width: 110,
    height: 42,
    borderRadius: 21,
  },
  swFaceLeft: {
    position: 'absolute',
    left: 40,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  swFaceRight: {
    position: 'absolute',
    right: 40,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  swStickLeft: {
    position: 'absolute',
    left: 60,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  swStickRight: {
    position: 'absolute',
    right: 60,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  swFace: { width: 240, height: 240 },
  swFaceSlot: { position: 'absolute', width: 78, height: 78 },
  swFaceBtn: { width: 78, height: 78, borderRadius: 39 },
  swFaceText: { fontSize: 26, color: '#fff', fontWeight: '700' },
  swFaceTop:    { top: 0,    left: 81 },
  swFaceBottom: { bottom: 0, left: 81 },
  swFaceLeftPos:  { left: 0,   top: 81 },
  swFaceRightPos: { right: 0,  top: 81 },
  swBottomRow: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
