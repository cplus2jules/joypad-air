import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { C, JOYCON_THEMES, resolveTheme } from '../theme';
import { haptic, depth, setIntensity } from '../haptics';
import { useSettings } from '../store/settings';

const HAPTIC_LEVELS = [
  { id: 'off', label: 'Off' },
  { id: 'soft', label: 'Suave' },
  { id: 'normal', label: 'Normal' },
  { id: 'strong', label: 'Fuerte' },
];

const MIN_RELEASE = 0.10;
const RELEASE_GAP = 0.05;
const round2 = (v) => Math.round(v * 100) / 100;
const pct = (v) => `${Math.round(v * 100)}%`;

// ── Sub-piezas ──────────────────────────────────────────
function SectionLabel({ children }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
}

function ThemeSwatch({ def, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={s.swatchWrap}>
      <View
        style={[
          s.swatch,
          active && { borderColor: def.accentR, backgroundColor: 'rgba(255,255,255,0.10)' },
        ]}
      >
        <View style={s.swatchPair}>
          <LinearGradient
            colors={def.L}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[s.medal, s.medalL]}
          />
          <LinearGradient
            colors={def.R}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[s.medal, s.medalR]}
          />
        </View>
        <Text style={[s.swatchLabel, active && { color: '#fff' }]} numberOfLines={1}>
          {def.label}
        </Text>
      </View>
    </Pressable>
  );
}

// Mini-preview del pad: dos joycons con el gradiente del tema + 4 LEDs
function PadPreview({ theme, slot }) {
  const dot = theme.light ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.40)';
  const accent = slot === 1 ? theme.accentL : theme.accentR;
  return (
    <View style={s.previewBlock}>
      <View style={s.previewRow}>
        <LinearGradient
          colors={theme.L}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[s.prevJoy, s.prevJoyL]}
        >
          <View style={[s.prevStick, { borderColor: dot }]} />
          <View style={s.prevCluster}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[s.prevDot, { backgroundColor: dot }]} />
            ))}
          </View>
        </LinearGradient>
        <LinearGradient
          colors={theme.R}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[s.prevJoy, s.prevJoyR]}
        >
          <View style={s.prevCluster}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[s.prevDot, { backgroundColor: dot }]} />
            ))}
          </View>
          <View style={[s.prevStick, { borderColor: dot }]} />
        </LinearGradient>
      </View>
      <View style={s.ledRow}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              s.led,
              i === slot && {
                backgroundColor: accent,
                shadowColor: accent,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.9,
                shadowRadius: 5,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function SliderRow({ label, value, display, min, max, accent, onChange }) {
  return (
    <View style={s.sliderRow}>
      <View style={s.sliderHead}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={[s.rowValue, { color: accent }]}>{display}</Text>
      </View>
      <Slider
        style={s.slider}
        minimumValue={min}
        maximumValue={max}
        step={0.01}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={accent}
        maximumTrackTintColor="rgba(255,255,255,0.15)"
        thumbTintColor="#fff"
      />
    </View>
  );
}

function ToggleRow({ label, value, accent, onChange }) {
  return (
    <View style={s.toggleRow}>
      <Text style={s.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={(v) => {
          haptic.select();
          onChange(v);
        }}
        trackColor={{ false: 'rgba(255,255,255,0.15)', true: accent }}
        thumbColor="#fff"
        ios_backgroundColor="rgba(255,255,255,0.15)"
      />
    </View>
  );
}

// ── Settings ────────────────────────────────────────────
export default function Settings({ initialSlot = 1, onClose }) {
  const { settings, updateProfile } = useSettings();
  const [slot, setSlot] = useState(initialSlot === 2 ? 2 : 1);
  const profile = settings.profiles[slot];
  const theme = useMemo(() => resolveTheme(profile.themeId), [profile.themeId]);
  const accent = slot === 1 ? theme.accentL : theme.accentR;

  // Nombre con estado local (resync al cambiar de perfil)
  const [name, setName] = useState(profile.name);
  useEffect(() => {
    setName(settings.profiles[slot].name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);

  const defaultName = `Chocorramito ${slot}`;
  const commitName = (raw) => {
    const trimmed = (raw ?? '').trim();
    const finalName = trimmed || defaultName; // vacío → vuelve al default
    setName(finalName);
    updateProfile(slot, { name: finalName });
  };

  const onEngage = (v) => {
    const engage = round2(v);
    const patch = { engage };
    // Liberación siempre < activación − 0.05
    if (profile.release > engage - RELEASE_GAP) {
      patch.release = round2(Math.max(MIN_RELEASE, engage - RELEASE_GAP));
    }
    updateProfile(slot, patch);
  };

  const onRelease = (v) => {
    const max = round2(profile.engage - RELEASE_GAP);
    updateProfile(slot, { release: round2(Math.min(v, max)) });
  };

  const pickHaptic = (id) => {
    updateProfile(slot, { hapticLevel: id });
    setIntensity(id);
    depth.buttonIn(); // preview con el nivel recién elegido
  };

  return (
    <View style={s.root}>
      {/* ── Header: volver + título + selector de perfil ── */}
      <View style={s.header}>
        <Pressable
          onPress={() => {
            haptic.light();
            onClose();
          }}
          style={s.backBtn}
          hitSlop={10}
        >
          <Text style={s.backText}>‹</Text>
        </Pressable>
        <Text style={s.title}>AJUSTES</Text>
        <View style={s.slotRow}>
          {[1, 2].map((n) => {
            const p = settings.profiles[n];
            const t = resolveTheme(p.themeId);
            const a = n === 1 ? t.accentL : t.accentR;
            const active = slot === n;
            return (
              <Pressable
                key={n}
                onPress={() => {
                  haptic.select();
                  setSlot(n);
                }}
                style={[s.slotChip, active && { borderColor: a, backgroundColor: 'rgba(255,255,255,0.10)' }]}
              >
                <View style={[s.slotDot, { backgroundColor: a }]} />
                <Text style={[s.slotChipText, active && { color: '#fff' }]} numberOfLines={1}>
                  {p.name.toUpperCase()}
                </Text>
                {active && <Text style={[s.slotCaret, { color: a }]}>▾</Text>}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={s.columns}>
        {/* ── Columna izquierda: identidad ── */}
        <ScrollView style={s.col} contentContainerStyle={s.colContent} showsVerticalScrollIndicator={false}>
          <SectionLabel>Nombre</SectionLabel>
          <TextInput
            style={[s.nameInput, { borderColor: name.trim() ? 'rgba(255,255,255,0.14)' : C.err }]}
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (t.trim()) updateProfile(slot, { name: t });
            }}
            onEndEditing={() => commitName(name)}
            onBlur={() => commitName(name)}
            maxLength={14}
            placeholder={defaultName}
            placeholderTextColor="rgba(255,255,255,0.25)"
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="done"
            keyboardAppearance="dark"
          />

          <SectionLabel>Color</SectionLabel>
          <View style={s.swatchGrid}>
            {Object.entries(JOYCON_THEMES).map(([id, def]) => (
              <ThemeSwatch
                key={id}
                def={def}
                active={profile.themeId === id}
                onPress={() => {
                  haptic.select();
                  updateProfile(slot, { themeId: id });
                }}
              />
            ))}
          </View>

          <PadPreview theme={theme} slot={slot} />
        </ScrollView>

        {/* ── Columna derecha: stick + botones ── */}
        <ScrollView style={s.col} contentContainerStyle={s.colContent} showsVerticalScrollIndicator={false}>
          <SectionLabel>Stick</SectionLabel>
          <View style={s.card}>
            <SliderRow
              label="Activación"
              value={profile.engage}
              display={pct(profile.engage)}
              min={0.30}
              max={0.90}
              accent={accent}
              onChange={onEngage}
            />
            <SliderRow
              label="Liberación"
              value={profile.release}
              display={pct(profile.release)}
              min={MIN_RELEASE}
              max={Math.max(MIN_RELEASE + 0.01, round2(profile.engage - RELEASE_GAP))}
              accent={accent}
              onChange={onRelease}
            />
            <ToggleRow
              label="Stick flotante"
              value={profile.stickFloating}
              accent={accent}
              onChange={(v) => updateProfile(slot, { stickFloating: v })}
            />
          </View>

          <SectionLabel>Botones</SectionLabel>
          <View style={s.card}>
            <Text style={s.rowLabel}>Háptica</Text>
            <View style={s.chipRow}>
              {HAPTIC_LEVELS.map((lvl) => {
                const active = profile.hapticLevel === lvl.id;
                return (
                  <Pressable
                    key={lvl.id}
                    onPress={() => pickHaptic(lvl.id)}
                    style={[s.hChip, active && { borderColor: accent, backgroundColor: 'rgba(255,255,255,0.10)' }]}
                  >
                    <Text style={[s.hChipText, active && { color: '#fff' }]}>{lvl.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <SliderRow
              label="Tamaño"
              value={profile.buttonScale}
              display={pct(profile.buttonScale)}
              min={0.9}
              max={1.2}
              accent={accent}
              onChange={(v) => updateProfile(slot, { buttonScale: round2(v) })}
            />
            <ToggleRow
              label="Swap A/B · X/Y (Xbox)"
              value={profile.swapAB}
              accent={accent}
              onChange={(v) => updateProfile(slot, { swapAB: v })}
            />
            <ToggleRow
              label="Sonido de click"
              value={profile.clickSound}
              accent={accent}
              onChange={(v) => updateProfile(slot, { clickSound: v })}
            />
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.bg,
    zIndex: 50,
  },

  // Header
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 14,
  },
  backBtn: { paddingVertical: 2, paddingHorizontal: 8 },
  backText: { color: C.inkDim, fontSize: 26, fontWeight: '700', marginTop: -2 },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 3,
  },
  slotRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  slotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    maxWidth: 190,
  },
  slotDot: { width: 8, height: 8, borderRadius: 4 },
  slotChipText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  slotCaret: { fontSize: 10, fontWeight: '800' },

  // Columnas
  columns: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 18,
  },
  col: { flex: 1 },
  colContent: { paddingBottom: 24 },

  sectionLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 8,
  },

  // Card contenedor (estética ModeCard)
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },

  // Nombre
  nameInput: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Grid de temas
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  swatchWrap: { width: '23.5%', minWidth: 74 },
  swatch: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 5,
  },
  swatchPair: { flexDirection: 'row', gap: 4 },
  medal: { width: 22, height: 22 },
  medalL: {
    borderTopLeftRadius: 11,
    borderBottomLeftRadius: 11,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  medalR: {
    borderTopRightRadius: 11,
    borderBottomRightRadius: 11,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  swatchLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // Mini-preview
  previewBlock: { marginTop: 14, alignItems: 'center', gap: 8 },
  previewRow: { flexDirection: 'row', gap: 6 },
  prevJoy: {
    width: 64,
    height: 96,
    justifyContent: 'space-between',
    paddingVertical: 12,
    alignItems: 'center',
  },
  prevJoyL: {
    borderTopLeftRadius: 26,
    borderBottomLeftRadius: 26,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  prevJoyR: {
    borderTopRightRadius: 26,
    borderBottomRightRadius: 26,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  prevStick: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
  },
  prevCluster: {
    width: 26,
    height: 26,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignContent: 'center',
    gap: 3,
  },
  prevDot: { width: 7, height: 7, borderRadius: 4 },
  ledRow: { flexDirection: 'row', gap: 8 },
  led: {
    width: 10,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },

  // Sliders / filas
  sliderRow: { paddingVertical: 4 },
  sliderHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  slider: { width: '100%', height: 32 },
  rowLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
  },
  rowValue: {
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
  },

  // Chips de háptica
  chipRow: { flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 4 },
  hChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  hChipText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
