import { useEffect, useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, JOYCON_DARK_INK, SHADOW, resolveTheme } from '../theme';
import { haptic, setIntensity } from '../haptics';
import { useConnection } from '../net/connection';
import { useSettings } from '../store/settings';
import RecessedBtn from '../components/RecessedBtn';
import { SymbolBtn, CaptureBtn, HomeBtn } from '../components/SymbolButtons';
import Stick from '../components/Stick';
import DPad from '../components/DPad';
import FaceButtons, { mapFaceName } from '../components/FaceButtons';

// ── Pad ─────────────────────────────────────────────────
export default function Pad({ player, layout, compact, onToggleCompact, onBack, onOpenSettings }) {
  const { settings } = useSettings();
  const profile = settings.profiles[player] ?? settings.profiles[1];
  const theme = useMemo(() => resolveTheme(profile.themeId), [profile.themeId]);
  const { status, send } = useConnection(player, profile);

  // Nivel de háptica del perfil → módulo global (al montar y al cambiar)
  useEffect(() => {
    setIntensity(profile.hapticLevel);
  }, [profile.hapticLevel]);

  // Acento del lado correspondiente al slot: P1 = L, P2 = R
  const accent = player === 1 ? theme.accentL : theme.accentR;
  const pillInk = theme.light ? JOYCON_DARK_INK : '#fff';

  return (
    <View style={s.pad}>
      <View style={s.topBar}>
        <Pressable onPress={() => { haptic.light(); onBack(); }} style={s.backBtn}>
          <Text style={s.backText}>‹</Text>
        </Pressable>
        <Pressable
          onLongPress={() => { haptic.medium(); onOpenSettings?.(); }}
          delayLongPress={400}
          style={[s.playerPill, { backgroundColor: accent }]}
        >
          <Text style={[s.playerPillText, { color: pillInk }]}>
            {profile.name.toUpperCase()}
          </Text>
        </Pressable>
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
            <LeftJoycon send={send} compact={compact} theme={theme} profile={profile} />
            <RightJoycon send={send} compact={compact} theme={theme} profile={profile} />
          </>
        )}
        {layout === 'left' && <SidewaysLeft send={send} theme={theme} profile={profile} />}
        {layout === 'right' && <SidewaysRight send={send} theme={theme} profile={profile} />}
      </View>
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
      <View style={s.swShoulders}>
        <RecessedBtn name="sl" label="SL" send={send} h="light" style={s.swShoulder} textStyle={s.shoulderText} />
        <RecessedBtn name="sr" label="SR" send={send} h="light" style={s.swShoulder} textStyle={s.shoulderText} />
      </View>

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
      <View style={s.swShoulders}>
        <RecessedBtn name="sl" label="SL" send={send} h="light" style={s.swShoulder} textStyle={s.shoulderText} />
        <RecessedBtn name="sr" label="SR" send={send} h="light" style={s.swShoulder} textStyle={s.shoulderText} />
      </View>

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
      <View style={s.shoulderBarLeft}>
        <RecessedBtn name="zl" label="ZL" send={send} h="heavy" style={s.shoulder} textStyle={s.shoulderText} />
        <RecessedBtn name="l"  label="L"  send={send} h="light"  style={s.shoulder} textStyle={s.shoulderText} />
      </View>

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
      <View style={s.shoulderBarRight}>
        <RecessedBtn name="r"  label="R"  send={send} h="light"  style={s.shoulder} textStyle={s.shoulderText} />
        <RecessedBtn name="zr" label="ZR" send={send} h="heavy" style={s.shoulder} textStyle={s.shoulderText} />
      </View>

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
