import { StyleSheet, View } from 'react-native';
import RecessedBtn from './RecessedBtn';

// Swap A/B · X/Y (layout Xbox): se aplica al name ENVIADO y las
// etiquetas visuales quedan intercambiadas de posición.
export const SWAP_MAP = { a: 'b', b: 'a', x: 'y', y: 'x' };
export const mapFaceName = (name, swap) => (swap ? SWAP_MAP[name] ?? name : name);

// ── Face buttons (X up, Y left, A right, B down — Nintendo) ─
// Con swap: Y up, X left, B right, A down (Xbox).
export default function FaceButtons({ send, big, swap }) {
  const wrap = big ? s.faceBig : s.face;
  const btnStyle = big ? s.faceBtnBig : s.faceBtn;
  const txtStyle = big ? s.faceTextBig : s.faceText;
  const slot = big ? s.faceSlotBig : s.faceSlot;
  const pos = big
    ? { top: s.faceXBig, left: s.faceYBig, right: s.faceABig, bottom: s.faceBBig }
    : { top: s.faceX,   left: s.faceY,   right: s.faceA,   bottom: s.faceB   };
  // [posición, name original Nintendo]
  const slots = [
    ['top', 'x'],
    ['left', 'y'],
    ['right', 'a'],
    ['bottom', 'b'],
  ];
  return (
    <View style={wrap}>
      {slots.map(([place, orig]) => {
        const name = mapFaceName(orig, swap);
        return (
          // key incluye el name: RecessedBtn captura `name` en su gesto
          // (useMemo []) → al cambiar swap forzamos remount.
          <View key={`${place}-${name}`} style={[slot, pos[place]]}>
            <RecessedBtn
              name={name}
              label={name.toUpperCase()}
              send={send}
              style={btnStyle}
              textStyle={txtStyle}
              // ±8 (no ±12): los botones se tocan en diagonal — con slop
              // mayor crece la zona ambigua de esquina donde dos handlers
              // compiten por el mismo touch.
              slop={8}
            />
          </View>
        );
      })}
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
