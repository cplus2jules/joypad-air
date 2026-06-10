import { StyleSheet, View } from 'react-native';
import RecessedBtn from './RecessedBtn';

// ── Face buttons (X up, Y left, A right, B down) ────────
export default function FaceButtons({ send, big }) {
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

const s = StyleSheet.create({
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
});
