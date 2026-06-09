import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler';

const SERVER_PORT = 3001;

// Switch official Neon palette
const C = {
  bg: '#0b0d12',
  redLight: '#ff5366',
  red: '#ff3d54',
  redDark: '#c01a30',
  blueLight: '#2dd4ff',
  blue: '#00c3e2',
  blueDark: '#0080a3',
  ink: '#f5f6f8',
  inkDim: '#9aa0ad',
  btnBgTop: '#26272d',
  btnBg: '#15171b',
  btnBgInner: '#0a0a0d',
  btnRing: '#3a3d45',
  btnText: '#f5f6f8',
  chip: '#1c1f27',
  chipActive: '#3a4055',
  ok: '#5ad07a',
  err: '#ff6f7a',
};

// ── helpers ─────────────────────────────────────────────
function detectHost() {
  const hu =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.developer?.hostUri ||
    '';
  const ip = hu.split(':')[0];
  return ip || null;
}

const haptic = {
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  select: () => Haptics.selectionAsync().catch(() => {}),
  rigid: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {}),
};

// "Profundidad" haptica — multi-etapa fuerte, simula click mecánico profundo.
// Patrón típico: pre-impact + actuación + bottom-out, todo con Heavy/Rigid
// para máxima intensidad en el Taptic Engine.
const depth = {
  // Face buttons (ABXY): triple thunk
  buttonIn: () => {
    haptic.heavy();
    setTimeout(haptic.rigid, 18);
    setTimeout(haptic.heavy, 42);
  },
  buttonOut: () => {
    haptic.medium();
    setTimeout(haptic.light, 30);
  },
  // Triggers (ZL/ZR): cuatro etapas + pulso continuo aparte
  triggerIn: () => {
    haptic.heavy();
    setTimeout(haptic.heavy, 25);
    setTimeout(haptic.rigid, 55);
    setTimeout(haptic.heavy, 90);
  },
  triggerOut: () => {
    haptic.heavy();
    setTimeout(haptic.medium, 35);
    setTimeout(haptic.light, 70);
  },
  // Shoulders (L/R): doble heavy
  shoulderIn: () => {
    haptic.medium();
    setTimeout(haptic.heavy, 20);
    setTimeout(haptic.rigid, 45);
  },
  shoulderOut: () => {
    haptic.medium();
    setTimeout(haptic.light, 28);
  },
  // D-pad: rigid doble crisp
  dpadIn: () => {
    haptic.heavy();
    setTimeout(haptic.rigid, 18);
  },
  dpadOut: () => haptic.light(),
  // Símbolos (+, −, capture, home): firme medium+heavy
  symbolIn: () => {
    haptic.medium();
    setTimeout(haptic.heavy, 25);
  },
  symbolOut: () => {
    haptic.light();
  },
  // Stick deadzone cross — click sutil (NO heavy)
  stickClick: () => haptic.select(),
  // Stick edge pulse — light, no constante
  stickEdge: () => haptic.light(),
  // Stick soft tick — DESACTIVADO (estaba muy ruidoso)
  stickSoft: () => {},
  // Stick grab — sin haptic
  stickGrab: () => {},
};

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

// ── Recessed (deep) button — used for face / shoulders / dpad ─
function RecessedBtn({ name, label, send, style, textStyle, h = 'medium', releaseHaptic = 'select' }) {
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

// ── Symbol button (+, −) ────────────────────────────────
function SymbolBtn({ name, symbol, send }) {
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
        .onTouchesDown((_e, m) => { m.activate(); grant(); })
        .onTouchesUp((e, m) => { if (e.numberOfTouches === 0) { release(); m.end(); } })
        .onTouchesCancelled((_e, m) => { release(); m.end(); }),
    []
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={s.symbolBtn}>
        <Animated.Text
          style={[s.symbolText, { opacity, color: '#fff', transform: [{ scale }] }]}
        >
          {symbol}
        </Animated.Text>
      </View>
    </GestureDetector>
  );
}

// ── Capture (square) ────────────────────────────────────
function CaptureBtn({ send }) {
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
function HomeBtn({ send }) {
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

// ── D-Pad (4 separate round buttons like real Joy-Con) ─
function DPad({ send }) {
  return (
    <View style={s.dpad}>
      <View style={[s.dpadSlot, s.dpadUp]}>
        <RecessedBtn name="dpad_up"    label="▲" send={send} h="select" style={s.dpadBtn} textStyle={s.dpadText} />
      </View>
      <View style={[s.dpadSlot, s.dpadLeft]}>
        <RecessedBtn name="dpad_left"  label="◀" send={send} h="select" style={s.dpadBtn} textStyle={s.dpadText} />
      </View>
      <View style={[s.dpadSlot, s.dpadRight]}>
        <RecessedBtn name="dpad_right" label="▶" send={send} h="select" style={s.dpadBtn} textStyle={s.dpadText} />
      </View>
      <View style={[s.dpadSlot, s.dpadDown]}>
        <RecessedBtn name="dpad_down"  label="▼" send={send} h="select" style={s.dpadBtn} textStyle={s.dpadText} />
      </View>
    </View>
  );
}

// ── Face buttons (X up, Y left, A right, B down) ────────
function FaceButtons({ send, big }) {
  const wrap = big ? s.faceBig : s.face;
  const btnStyle = big ? s.faceBtnBig : s.faceBtn;
  const txtStyle = big ? s.faceTextBig : s.faceText;
  const slot = big ? s.faceSlotBig : s.faceSlot;
  const pos = big
    ? { X: s.faceXBig, Y: s.faceYBig, A: s.faceABig, B: s.faceBBig }
    : { X: s.faceX,   Y: s.faceY,   A: s.faceA,   B: s.faceB   };
  return (
    <View style={wrap}>
      <View style={[slot, pos.X]}>
        <RecessedBtn name="x" label="X" send={send} style={btnStyle} textStyle={txtStyle} />
      </View>
      <View style={[slot, pos.Y]}>
        <RecessedBtn name="y" label="Y" send={send} style={btnStyle} textStyle={txtStyle} />
      </View>
      <View style={[slot, pos.A]}>
        <RecessedBtn name="a" label="A" send={send} style={btnStyle} textStyle={txtStyle} />
      </View>
      <View style={[slot, pos.B]}>
        <RecessedBtn name="b" label="B" send={send} style={btnStyle} textStyle={txtStyle} />
      </View>
    </View>
  );
}

// ── Analog Stick (with depressed bowl + raised thumb) ───
function Stick({ stickId, send, big }) {
  const RADIUS = big ? 95 : 55;
  // Sensibilidad balanceada — curva casi lineal, deadzone amplio para evitar drift
  const SENSITIVITY = 0.85;     // antes 0.65 — menos amplificación de movimientos pequeños
  const DEADZONE = 0.18;        // zona muerta interna: ignorar primer ~18% del radio
  const SOFT_THRESHOLD = 0.32;  // antes 0.18 — feedback ligero más tarde
  const HARD_THRESHOLD = 0.60;  // antes 0.55 — click fuerte más definitivo
  const SEND_THROTTLE_MS = 10;
  const EDGE_PULSE_MS = 250;    // antes 55ms — pulso al borde mucho menos frecuente

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

    // Normalizar
    let nx = dx / RADIUS;
    let ny = dy / RADIUS;

    // Zona muerta interna radial — ignorar movimientos micro
    const mag = Math.hypot(nx, ny);
    if (mag < DEADZONE) {
      nx = 0;
      ny = 0;
    } else {
      // re-mapear [DEADZONE, 1] → [0, 1] con curva de sensibilidad
      const scaled = (mag - DEADZONE) / (1 - DEADZONE);
      const curved = Math.pow(scaled, SENSITIVITY);
      const factor = curved / mag;
      nx *= factor;
      ny *= factor;
    }

    // Soft tick: sutil al primer movimiento fuera de zona muerta
    const softNow = Math.abs(nx) > SOFT_THRESHOLD || Math.abs(ny) > SOFT_THRESHOLD;
    if (softNow !== softActiveRef.current) {
      softActiveRef.current = softNow;
      if (softNow) depth.stickSoft();
    }

    // Hard click: compromiso de dirección
    const dirX = nx > HARD_THRESHOLD ? 1 : nx < -HARD_THRESHOLD ? -1 : 0;
    const dirY = ny > HARD_THRESHOLD ? 1 : ny < -HARD_THRESHOLD ? -1 : 0;
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

// ── Styles ──────────────────────────────────────────────
const SHADOW = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  android: { elevation: 4 },
});

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

  // Corner positions for + / − / capture / home
  cornerTopRight: { position: 'absolute', top: 4, right: 18, zIndex: 5 },
  cornerTopLeft:  { position: 'absolute', top: 4, left: 18, zIndex: 5 },
  cornerBottomRight: { position: 'absolute', bottom: 8, right: 18, zIndex: 5 },
  cornerBottomLeft:  { position: 'absolute', bottom: 8, left: 18, zIndex: 5 },

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

  // D-Pad — tamaño que calza con stick en vertical
  dpad: { width: 150, height: 150 },
  dpadSlot: { position: 'absolute', width: 50, height: 50 },
  dpadBtn: { width: 50, height: 50, borderRadius: 25 },
  dpadText: { fontSize: 15, color: '#cfd2da' },
  dpadUp:    { top: 0,    left: 50 },
  dpadDown:  { bottom: 0, left: 50 },
  dpadLeft:  { left: 0,   top: 50 },
  dpadRight: { right: 0,  top: 50 },

  // ABXY — tamaño que calza con stick
  face: { width: 150, height: 150 },
  faceSlot: { position: 'absolute', width: 50, height: 50 },
  faceBtn:  { width: 50, height: 50, borderRadius: 25 },
  faceText: { fontSize: 18, color: '#fff', fontWeight: '700' },
  faceX: { top: 0,    left: 50 },
  faceY: { top: 50,   left: 0  },
  faceA: { top: 50,   right: 0 },
  faceB: { bottom: 0, left: 50 },
  // ABXY BIG — modo compact, gigantes
  faceBig: { width: 260, height: 260 },
  faceSlotBig: { position: 'absolute', width: 86, height: 86 },
  faceBtnBig:  { width: 86, height: 86, borderRadius: 43 },
  faceTextBig: { fontSize: 30, color: '#fff', fontWeight: '700' },
  faceXBig: { top: 0,    left: 87 },
  faceYBig: { top: 87,   left: 0  },
  faceABig: { top: 87,   right: 0 },
  faceBBig: { bottom: 0, left: 87 },

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
