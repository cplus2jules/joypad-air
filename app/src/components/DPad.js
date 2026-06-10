import { StyleSheet, View } from 'react-native';
import RecessedBtn from './RecessedBtn';

// ── D-Pad (4 separate round buttons like real Joy-Con) ─
export default function DPad({ send }) {
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

const s = StyleSheet.create({
  // D-Pad — tamaño que calza con stick en vertical
  dpad: { width: 150, height: 150 },
  dpadSlot: { position: 'absolute', width: 50, height: 50 },
  dpadBtn: { width: 50, height: 50, borderRadius: 25 },
  dpadText: { fontSize: 15, color: '#cfd2da' },
  dpadUp:    { top: 0,    left: 50 },
  dpadDown:  { bottom: 0, left: 50 },
  dpadLeft:  { left: 0,   top: 50 },
  dpadRight: { right: 0,  top: 50 },
});
