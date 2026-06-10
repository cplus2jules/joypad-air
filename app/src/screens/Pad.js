import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useBatteryLevel } from 'expo-battery';
import { C, JOYCON_DARK_INK, SHADOW, resolveTheme } from '../theme';
import { haptic, setIntensity } from '../haptics';
import { setClickEnabled } from '../sound';
import { detectHost, SERVER_PORT, useConnection } from '../net/connection';
import { useSettings } from '../store/settings';
import ConnectOverlay from '../components/ConnectOverlay';
import StatusBanner from '../components/StatusBanner';
import PlayerLeds from '../components/PlayerLeds';
import RecessedBtn from '../components/RecessedBtn';
import ShoulderCluster from '../components/ShoulderCluster';
import { SymbolBtn, CaptureBtn, HomeBtn } from '../components/SymbolButtons';
import Stick from '../components/Stick';
import DPad from '../components/DPad';
import FaceButtons, { mapFaceName } from '../components/FaceButtons';

const TOPBAR_H = 40;
const AMBER = '#faa005';

// ── Punto de latencia (junto al status) ─────────────────
// 6px: verde <25ms / ámbar <60 / rojo ≥60 / gris sin dato.
// Al tocarlo muestra "NN ms" durante 2s.
function LatencyDot({ rtt }) {
  const [showMs, setShowMs] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const color =
    rtt == null ? 'rgba(255,255,255,0.25)'
    : rtt < 25 ? C.ok
    : rtt < 60 ? AMBER
    : C.err;

  return (
    <Pressable
      onPress={() => {
        if (rtt == null) return;
        setShowMs(true);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setShowMs(false), 2000);
      }}
      hitSlop={10}
      style={s.latencyWrap}
    >
      <View style={[s.latencyDot, { backgroundColor: color }]} />
      {showMs && <Text style={s.latencyText}>{rtt} ms</Text>}
    </Pressable>
  );
}

// ── Overlay de reconexión ───────────────────────────────
// Velo sobre el body (no toca el topbar) + tarjeta con spinner cuando
// el socket está caído. Convive con ConnectOverlay: este es el estado
// persistente "sin Mac", aquel es el flash de éxito al volver.
function ReconnectOverlay({ status, host }) {
  const visible = status === 'reconectando' || status === 'error' || status === 'sin host';
  const [rendered, setRendered] = useState(visible);
  const op = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else {
      Animated.timing(op, { toValue: 0, duration: 200, useNativeDriver: true }).start(
        ({ finished }) => finished && setRendered(false)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!rendered) return null;

  return (
    <Animated.View pointerEvents="none" style={[s.reconnWrap, { opacity: op }]}>
      <View style={s.reconnCard}>
        <ActivityIndicator color="#fff" />
        <Text style={s.reconnText}>Reconectando con el Mac…</Text>
        {host ? (
          <Text style={s.reconnHost}>{host}:{SERVER_PORT}</Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

// ── Pad ─────────────────────────────────────────────────
export default function Pad({ player, layout, compact, onToggleCompact, onBack, onOpenSettings }) {
  const { settings } = useSettings();
  const profile = settings.profiles[player] ?? settings.profiles[1];
  const theme = useMemo(() => resolveTheme(profile.themeId), [profile.themeId]);
  const { status, send, rtt, serverInfo } = useConnection(player, profile);
  const host = useMemo(() => detectHost(), []);
  const battery = useBatteryLevel(); // 0..1, o -1 mientras no hay dato
  const batteryLow = battery >= 0 && battery < 0.2;

  // Aviso accionable del server (prioridad: accesibilidad > foco).
  // Solo con hello recibido y conectado — sin socket manda el overlay
  // de reconexión, y antes del handshake no hay datos fiables.
  const bannerMsg = useMemo(() => {
    if (status !== 'conectado' || !serverInfo.hello) return null;
    if (serverInfo.accessibility === false || !serverInfo.native) {
      return 'Falta el permiso de Accesibilidad en el Mac — mira la Terminal';
    }
    if (serverInfo.focus?.ok === false) {
      return 'Ryujinx no tiene el foco — toca su ventana en el Mac';
    }
    return null;
  }, [status, serverInfo]);

  // Nivel de háptica del perfil → módulo global (al montar y al cambiar)
  useEffect(() => {
    setIntensity(profile.hapticLevel);
  }, [profile.hapticLevel]);

  // Click sonoro del perfil — expo-audio se carga perezoso al activar
  useEffect(() => {
    setClickEnabled(profile.clickSound);
  }, [profile.clickSound]);

  // Acento del lado correspondiente al slot: P1 = L, P2 = R
  const accent = player === 1 ? theme.accentL : theme.accentR;
  const pillInk = theme.light ? JOYCON_DARK_INK : '#fff';

  return (
    <View style={s.pad}>
      <View style={s.topBar}>
        <Pressable onPress={() => { haptic.light(); onBack(); }} style={s.backBtn}>
          <Text style={s.backText}>‹</Text>
        </Pressable>
        <View style={s.pillCol}>
          <Pressable
            onLongPress={() => { haptic.medium(); onOpenSettings?.(); }}
            delayLongPress={400}
            style={[s.playerPill, { backgroundColor: accent }]}
          >
            <Text style={[s.playerPillText, { color: pillInk }]}>
              {profile.name.toUpperCase()}
            </Text>
          </Pressable>
          <PlayerLeds player={player} accent={accent} status={status} />
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
        <LatencyDot rtt={rtt} />
        {batteryLow && (
          <Text style={s.batteryLow}>🪫 {Math.round(battery * 100)}%</Text>
        )}
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
            <LeftJoycon send={send} compact={compact} theme={theme} profile={profile} />
            <RightJoycon send={send} compact={compact} theme={theme} profile={profile} />
          </>
        )}
        {layout === 'left' && <SidewaysLeft send={send} theme={theme} profile={profile} />}
        {layout === 'right' && <SidewaysRight send={send} theme={theme} profile={profile} />}
      </View>

      {/* Aviso accionable del server, bajo el topbar */}
      <StatusBanner message={bannerMsg} top={TOPBAR_H} />

      {/* Velo de reconexión sobre el body */}
      <ReconnectOverlay status={status} host={host} />

      {/* Animación de acople al conectar (encima de todo, no toca input) */}
      <ConnectOverlay status={status} theme={theme} name={profile.name} />
    </View>
  );
}

// ── Sideways Left Joy-Con (Mario Kart style — full screen) ─
function SidewaysLeft({ send, theme, profile }) {
  const btnScale = { transform: [{ scale: profile.buttonScale }] };
  return (
    <View style={[s.sideways, { backgroundColor: theme.L[1] }]}>
      <LinearGradient
        colors={theme.L}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* shoulders on top */}
      <ShoulderCluster
        style={s.swShoulders}
        send={send}
        buttons={[
          { name: 'sl', label: 'SL', kind: 'shoulder' },
          { name: 'sr', label: 'SR', kind: 'shoulder' },
        ]}
        btnStyle={s.swShoulder}
        textStyle={s.shoulderText}
      />

      {/* face buttons (dpad acting as faces) on left — superficie unificada
          con rolling, misma colocación que los 4 botones de antes */}
      <View style={s.swFaceLeft}>
        <View style={btnScale}>
          <DPad send={send} variant="sideways" />
        </View>
      </View>

      {/* stick on right */}
      <View style={s.swStickRight}>
        <Stick stickId="L" send={send} floating={profile.stickFloating} />
      </View>

      {/* bottom: minus + capture */}
      <View style={s.swBottomRow}>
        <SymbolBtn name="minus" symbol="−" send={send} dark={theme.light} />
        <View style={{ width: 14 }} />
        <CaptureBtn send={send} />
      </View>
    </View>
  );
}

// ── Sideways Right Joy-Con (Mario Kart style — full screen) ─
function SidewaysRight({ send, theme, profile }) {
  const btnScale = { transform: [{ scale: profile.buttonScale }] };
  // Mismo mapa de swap que FaceButtons (name enviado + etiqueta de posición)
  const fn = (orig) => mapFaceName(orig, profile.swapAB);
  const faceSlots = [
    [s.swFaceTop, 'y'],
    [s.swFaceLeftPos, 'b'],
    [s.swFaceRightPos, 'x'],
    [s.swFaceBottom, 'a'],
  ];
  return (
    <View style={[s.sideways, { backgroundColor: theme.R[1] }]}>
      <LinearGradient
        colors={theme.R}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ShoulderCluster
        style={s.swShoulders}
        send={send}
        buttons={[
          { name: 'sl', label: 'SL', kind: 'shoulder' },
          { name: 'sr', label: 'SR', kind: 'shoulder' },
        ]}
        btnStyle={s.swShoulder}
        textStyle={s.shoulderText}
      />

      {/* stick on left */}
      <View style={s.swStickLeft}>
        <Stick stickId="R" send={send} floating={profile.stickFloating} />
      </View>

      {/* ABXY on right (rotated so it sits like sideways) */}
      <View style={s.swFaceRight}>
        <View style={[s.swFace, btnScale]}>
          {faceSlots.map(([slotStyle, orig]) => {
            const name = fn(orig);
            return (
              <View key={name} style={[s.swFaceSlot, slotStyle]}>
                {/* slop ±8 — mismo criterio que FaceButtons (solape diagonal) */}
                <RecessedBtn name={name} label={name.toUpperCase()} send={send} h="medium" style={s.swFaceBtn} textStyle={s.swFaceText} slop={8} />
              </View>
            );
          })}
        </View>
      </View>

      <View style={s.swBottomRow}>
        <SymbolBtn name="plus" symbol="+" send={send} dark={theme.light} />
        <View style={{ width: 14 }} />
        <HomeBtn send={send} />
      </View>
    </View>
  );
}

// ── Left Joy-Con ────────────────────────────────────────
function LeftJoycon({ send, compact, theme, profile }) {
  // Un solo transform de escala en el contenedor del cluster
  const btnScale = { transform: [{ scale: profile.buttonScale }] };
  return (
    <View style={[s.joycon, s.joyconLeft]}>
      <LinearGradient
        colors={theme.L}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ShoulderCluster
        style={s.shoulderBarLeft}
        send={send}
        buttons={[
          { name: 'zl', label: 'ZL', kind: 'trigger' },
          { name: 'l', label: 'L', kind: 'shoulder' },
        ]}
        btnStyle={s.shoulder}
        textStyle={s.shoulderText}
      />

      <View style={s.joyconInner}>
        <View style={s.cornerTopRight}>
          <SymbolBtn name="minus" send={send} symbol="−" dark={theme.light} />
        </View>

        <View style={compact ? s.stickWrapCenter : s.stickWrap}>
          <Stick stickId="L" send={send} big={compact} floating={profile.stickFloating} />
        </View>

        {!compact && (
          <View style={s.dpadWrap}>
            <View style={btnScale}>
              <DPad send={send} />
            </View>
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
function RightJoycon({ send, compact, theme, profile }) {
  const btnScale = { transform: [{ scale: profile.buttonScale }] };
  return (
    <View style={[s.joycon, s.joyconRight]}>
      <LinearGradient
        colors={theme.R}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ShoulderCluster
        style={s.shoulderBarRight}
        send={send}
        buttons={[
          { name: 'r', label: 'R', kind: 'shoulder' },
          { name: 'zr', label: 'ZR', kind: 'trigger' },
        ]}
        btnStyle={s.shoulder}
        textStyle={s.shoulderText}
      />

      <View style={s.joyconInner}>
        <View style={s.cornerTopLeft}>
          <SymbolBtn name="plus" send={send} symbol="+" dark={theme.light} />
        </View>

        <View style={compact ? s.faceWrapCenter : s.faceWrap}>
          <View style={btnScale}>
            <FaceButtons send={send} big={compact} swap={profile.swapAB} />
          </View>
        </View>

        {!compact && (
          <View style={s.stickWrapRight}>
            <Stick stickId="R" send={send} floating={profile.stickFloating} />
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
  // Pad
  pad: { flex: 1, backgroundColor: C.bg },
  topBar: {
    height: TOPBAR_H, // 34 → 40: hueco para los LEDs bajo el pill
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  backBtn: { position: 'absolute', left: 12, paddingVertical: 4, paddingHorizontal: 10 },
  backText: { color: C.inkDim, fontSize: 22, fontWeight: '700' },
  pillCol: { alignItems: 'center' },
  playerPill: { paddingHorizontal: 12, paddingVertical: 3, borderRadius: 10 },
  playerPillText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  statusText: { color: C.inkDim, fontSize: 10 },
  latencyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  latencyDot: { width: 6, height: 6, borderRadius: 3 },
  latencyText: {
    color: C.inkDim,
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  batteryLow: {
    color: AMBER,
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // Overlay de reconexión (cubre el body, no el topbar)
  reconnWrap: {
    position: 'absolute',
    top: TOPBAR_H,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11,13,18,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 90,
  },
  reconnCard: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 26,
    borderRadius: 18,
    backgroundColor: 'rgba(11,13,18,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  reconnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  reconnHost: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
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
