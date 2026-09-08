import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useBatteryLevel } from 'expo-battery';
import { C, JOYCON_DARK_INK, SHADOW, resolveTheme } from '../theme';
import { haptic, depth } from '../haptics';
import { detectHost, SERVER_PORT } from '../net/connection';
import { useI18n } from '../i18n';
import LanguagePicker from '../components/LanguagePicker';
import { useSettings } from '../store/settings';

const AMBER = '#faa005';

// ── Estado del server vía GET /status (poll 3s) ─────────
// Devuelve el JSON de /status o null (sin host / server caído).
// Solo corre mientras el Picker está montado.
function useServerStatus(host) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!host) return undefined;
    let alive = true;

    const poll = async () => {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 2500);
      try {
        const res = await fetch(`http://${host}:${SERVER_PORT}/status`, {
          signal: ctrl.signal,
        });
        const json = await res.json();
        if (alive) setInfo(json);
      } catch {
        if (alive) setInfo(null);
      } finally {
        clearTimeout(timeout);
      }
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [host]);

  return info;
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
// Los mini-joycons se pintan con el tema del perfil habitual (lastSlot)
// vía colorL/colorR — con fallback a la paleta Neón.
function ModeCard({ id, label, sublabel, active, onPress, colorL = C.red, colorR = C.blue }) {
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
          <View style={[s.miniJoy, s.miniJoyL, { backgroundColor: colorL }]} />
          <View style={[s.miniJoy, s.miniJoyR, { backgroundColor: colorR }]} />
        </View>
      );
    }
    if (id === 'left') {
      return (
        <View style={s.previewRow}>
          <View style={[s.miniJoy, s.miniJoyWide, { backgroundColor: colorL }]} />
        </View>
      );
    }
    return (
      <View style={s.previewRow}>
        <View style={[s.miniJoy, s.miniJoyWide, { backgroundColor: colorR }]} />
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
// occupied: true | false | null (sin dato del server — no se pinta badge).
// habitual: lastSlot → anillo "tu mando habitual".
// Long-press → abre Ajustes con ese perfil preseleccionado.
function PlayerCard({ player, onPick, occupied = null, habitual = false, onLongPress }) {
  const { t } = useI18n();
  const isP1 = player === 1;
  // Tema y nombre del perfil del jugador (P1 = lado L, P2 = lado R)
  const { settings } = useSettings();
  const profile = settings.profiles[player] ?? settings.profiles[1];
  const theme = resolveTheme(profile.themeId);
  const colors = isP1 ? theme.L : theme.R;
  const accent = isP1 ? theme.accentL : theme.accentR;
  const darkInk = theme.light; // temas claros → texto oscuro sobre la card
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
    <View style={s.playerCardCol}>
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
        onLongPress={() => {
          haptic.medium();
          onLongPress?.(player);
        }}
        delayLongPress={400}
        style={s.playerCardWrap}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            s.playerCardGlow,
            { backgroundColor: accent, opacity: glowOpacity },
          ]}
        />
        <Animated.View
          style={[
            { transform: [{ scale }] },
            habitual && [s.playerCardRing, { borderColor: accent }],
          ]}
        >
          <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.playerCard}
          >
            <Text
              style={[s.playerCardNumberBg, darkInk && { color: 'rgba(0,0,0,0.22)' }]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {player}
            </Text>
            <View style={s.playerCardFg}>
              <Text
                style={[s.playerCardKicker, darkInk && { color: 'rgba(0,0,0,0.55)' }]}
                numberOfLines={1}
              >
                {(profile.name || t('player', { n: player })).toUpperCase()}
              </Text>
              <Text style={[s.playerCardCTA, darkInk && { color: JOYCON_DARK_INK }]}>
                {t('start')}
              </Text>
            </View>
            {occupied != null && (
              <View
                style={[
                  s.slotBadge,
                  { backgroundColor: occupied ? 'rgba(35,21,5,0.55)' : 'rgba(0,0,0,0.35)' },
                ]}
              >
                <View
                  style={[s.slotBadgeDot, { backgroundColor: occupied ? AMBER : C.ok }]}
                />
                <Text
                  style={[s.slotBadgeText, { color: occupied ? AMBER : C.ok }]}
                  numberOfLines={1}
                >
                  {t(occupied ? 'replace' : 'available')}
                </Text>
              </View>
            )}
          </LinearGradient>
        </Animated.View>
      </Pressable>
      <Text style={[s.habitualCaption, !habitual && { opacity: 0 }]} numberOfLines={1}>
        {t('habitual')}
      </Text>
    </View>
  );
}

// ── Picker ──────────────────────────────────────────────
export default function Picker({ layout, onLayout, onPick, onOpenSettings }) {
  const { t } = useI18n();
  const { settings, ready, update } = useSettings();
  // Prioriza el host manual (settings.host) sobre la autodetección
  const host = detectHost(settings.host);
  const battery = useBatteryLevel(); // 0..1, o -1 mientras no hay dato
  const serverStatus = useServerStatus(host);
  // IP escrita a mano — solo se persiste al tocar "Conectar"
  const [hostInput, setHostInput] = useState('');
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

  // Restaurar el último modo usado (una sola vez, al cargar settings)
  const layoutRestored = useRef(false);
  useEffect(() => {
    if (!ready || layoutRestored.current) return;
    layoutRestored.current = true;
    if (settings.lastLayout && settings.lastLayout !== layout) {
      onLayout(settings.lastLayout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Tema del mando habitual → mini-joycons de las ModeCard
  const lastSlot = settings.lastSlot === 2 ? 2 : 1;
  const lastTheme = resolveTheme(settings.profiles[lastSlot]?.themeId);

  // Ocupación por slot según /status (null = sin dato, no se pinta badge)
  const occupiedFor = (n) =>
    serverStatus ? !!serverStatus.players?.[n]?.connected : null;

  const pick = (player) => {
    update({ lastSlot: player });
    onPick(player);
  };

  const connectManualHost = () => {
    const ip = hostInput.trim();
    if (!ip) return;
    haptic.select();
    update({ host: ip });
  };

  const clearManualHost = () => {
    haptic.select();
    setHostInput('');
    update({ host: null }); // vuelve a la autodetección por hostUri
  };

  const showFirstTimeHint = !host || !settings.onboarded;

  const layouts = [
    { id: 'full',  label: t('full'), sublabel: t('fullHint') },
    { id: 'left',  label: t('left'), sublabel: t('leftHint') },
    { id: 'right', label: t('right'), sublabel: t('rightHint') },
  ];

  return (
    <View style={s.picker}>
      <FloatingBlobs />

      <Pressable
        onPress={() => { haptic.select(); onOpenSettings?.(); }}
        accessibilityRole="button"
        accessibilityLabel={t('settings')}
        style={s.gearBtn}
        hitSlop={8}
      >
        <Text style={s.gearText}>⚙</Text>
      </Pressable>

      <View style={s.pickerContent}>
        {/* ─── Left column: brand ─── */}
        <Animated.View
          style={[s.pickerLeft, { opacity: fade1, transform: [{ translateY: slide }] }]}
        >
          <ScrollView contentContainerStyle={s.brandContent} showsVerticalScrollIndicator={false}>
          <Text style={s.brandKicker}>{t('brand')}</Text>
          <Text style={s.brandTitle}>Super{'\n'}Pro Max</Text>
          <View style={s.brandMeta}>
            <View style={[s.brandDot, { backgroundColor: host ? C.ok : C.err }]} />
            <Text style={s.brandHost}>
              {host ? `${host}:${SERVER_PORT}` : t('noHost')}
            </Text>
            {host && settings.host ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('clearHost')} onPress={clearManualHost} hitSlop={8} style={s.hostClearBtn}>
                <Text style={s.hostClearText}>×</Text>
              </Pressable>
            ) : null}
          </View>
          {!host && (
            <View style={s.hostManualRow}>
              <TextInput
                style={s.hostInput}
                value={hostInput}
                onChangeText={setHostInput}
                onSubmitEditing={connectManualHost}
                placeholder={t('hostPlaceholder')}
                accessibilityLabel={t('hostLabel')}
                placeholderTextColor="rgba(255,255,255,0.25)"
                autoCorrect={false}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                returnKeyType="done"
                keyboardAppearance="dark"
              />
              <Pressable
                onPress={connectManualHost}
                style={[s.hostConnectBtn, !hostInput.trim() && { opacity: 0.4 }]}
              >
                <Text style={s.hostConnectText}>{t('connect')}</Text>
              </Pressable>
            </View>
          )}
          <Text style={s.batteryText}>
            🔋 {battery >= 0 ? `${Math.round(battery * 100)}%` : '—'}
          </Text>
          <LanguagePicker />
          {showFirstTimeHint && (
            <Animated.Text style={[s.firstTimeHint, { opacity: fade4 }]}>
              {t('firstTime')}
            </Animated.Text>
          )}
          <Animated.Text style={[s.footerLeft, { opacity: fade4 }]}>
            {t('coop')}
          </Animated.Text>
          </ScrollView>
        </Animated.View>

        {/* ─── Right column: mode + players ─── */}
        <View style={s.pickerRight}>
          <Animated.View style={[s.modeBlock, { opacity: fade2 }]}>
            <Text style={s.proSectionLabel}>{t('mode')}</Text>
            <View style={s.modeGrid}>
              {layouts.map((l) => (
                <ModeCard
                  key={l.id}
                  id={l.id}
                  label={l.label}
                  sublabel={l.sublabel}
                  active={layout === l.id}
                  colorL={lastTheme.L[1]}
                  colorR={lastTheme.R[1]}
                  onPress={() => {
                    onLayout(l.id);
                    update({ lastLayout: l.id });
                  }}
                />
              ))}
            </View>
          </Animated.View>

          <Animated.View style={[s.playerBlock, { opacity: fade3 }]}>
            <Text style={s.proSectionLabel}>{t('players')}</Text>
            <View style={s.playerGrid}>
              {[1, 2].map((n) => (
                <PlayerCard
                  key={n}
                  player={n}
                  onPick={pick}
                  occupied={occupiedFor(n)}
                  habitual={lastSlot === n}
                  onLongPress={onOpenSettings}
                />
              ))}
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
  brandContent: { flexGrow: 1, justifyContent: 'space-between', gap: 6, paddingBottom: 8 },
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
  // ── Host manual (sin autodetección) ─────────────────
  hostClearBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  hostClearText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
  },
  hostManualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  hostInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    color: '#fff',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  hostConnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  hostConnectText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  batteryText: {
    color: C.inkDim,
    fontSize: 11,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
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
  playerCardCol: {
    flex: 1,
  },
  playerCardWrap: {
    position: 'relative',
  },
  playerCardRing: {
    borderWidth: 2,
    borderRadius: 24,
    padding: 3,
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
  slotBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    maxWidth: '80%',
  },
  slotBadgeDot: { width: 5, height: 5, borderRadius: 3 },
  slotBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  habitualCaption: {
    marginTop: 6,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  firstTimeHint: {
    color: 'rgba(250,160,5,0.85)',
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.3,
    marginTop: 8,
  },
  footerLeft: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    letterSpacing: 0.5,
    lineHeight: 14,
  },

  // Botón de ajustes (top-right)
  gearBtn: {
    position: 'absolute',
    top: 14,
    right: 16,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  gearText: { color: 'rgba(255,255,255,0.7)', fontSize: 18, lineHeight: 21 },
});
