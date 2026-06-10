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
              // ±4 con el rombo compacto de 132: el hueco diagonal entre
              // botones quedó en ~8px — un slop mayor crea zona ambigua
              // donde dos handlers compiten por el mismo touch (phantom
              // press). El botón ya mide 50pt (objetivo táctil suficiente).
              slop={4}
            />
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  // ABXY — rombo compacto (132: botones de 50 con hueco de 32, como el
  // diamante físico; feedback de David en device, 2026-06-10)
  face: { width: 132, height: 132 },
  faceSlot: { position: 'absolute', width: 50, height: 50 },
  faceBtn:  { width: 50, height: 50, borderRadius: 25 },
  faceText: { fontSize: 18, color: '#fff', fontWeight: '700' },
  faceX: { top: 0,    left: 41 },
  faceY: { top: 41,   left: 0  },
  faceA: { top: 41,   right: 0 },
  faceB: { bottom: 0, left: 41 },
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
