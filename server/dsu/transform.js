// Transformación de ejes: marco del iPhone → marco DSU/CemuHook.
//
// El iPhone juega en landscape; sus sensores reportan en el marco del
// dispositivo EN PORTRAIT (+X derecha, +Y arriba hacia el auricular,
// +Z saliendo de la pantalla). La convención CemuHook (heredada del DS4):
// mando plano sobre la mesa, botones arriba ⇒ accel = (0, -1, 0) g.
//
// Hay DOS matrices por orientación: una para el acelerómetro (ancla la
// gravedad — no se toca, plano boca arriba debe dar az = -1) y otra para el
// giroscopio (sentido de cada rotación). Separadas a propósito: así se puede
// invertir el sentido de una rotación (p.ej. el roll = volante de Mario Kart)
// sin desestabilizar la corrección de gravedad del filtro de Ryujinx.
//
// GYRO_GAIN amplifica la respuesta: >1 = gira más con menos inclinación
// física (Mario Kart se sentía "hay que girar demasiado el teléfono").
//
// Salida DSU gyro: { pitch (sobre X), yaw (sobre Y), roll (sobre Z) }.
// El roll va NEGADO respecto al accel en cada orientación → el volante de
// MK8 gira en el sentido natural (antes iba al revés).

const GYRO_GAIN = Number(process.env.GYRO_GAIN) || 2.2;

const TRANSFORMS = {
  // top del iPhone hacia la IZQUIERDA del jugador
  "landscape-right": {
    accel: [
      [0, -1, 0], // DSU x (derecha del jugador) = -Y device
      [0, 0, 1],  // DSU y (plano ⇒ -1g)         = +Z device
      [-1, 0, 0], // DSU z (hacia el jugador)    = -X device
    ],
    gyro: [
      [0, -1, 0], // pitch
      [0, 0, 1],  // yaw
      [1, 0, 0],  // roll INVERTIDO (era -1) → volante en sentido natural
    ],
  },
  // top del iPhone hacia la DERECHA del jugador
  "landscape-left": {
    accel: [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
    ],
    gyro: [
      [0, 1, 0],
      [0, 0, 1],
      [-1, 0, 0], // roll INVERTIDO (era +1)
    ],
  },
};

function applyMatrix(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

// sample: { ax, ay, az, gx, gy, gz, ts } (marco device)
// devuelve: { ax, ay, az, pitch, yaw, roll, tsUs } (marco DSU)
export function toDsuFrame(sample, orientation = "landscape-right") {
  const t = TRANSFORMS[orientation] ?? TRANSFORMS["landscape-right"];
  const [ax, ay, az] = applyMatrix(t.accel, [sample.ax, sample.ay, sample.az]);
  const [pitch, yaw, roll] = applyMatrix(t.gyro, [sample.gx, sample.gy, sample.gz]);
  return {
    ax, ay, az,
    pitch: pitch * GYRO_GAIN,
    yaw: yaw * GYRO_GAIN,
    roll: roll * GYRO_GAIN,
    tsUs: sample.ts,
  };
}
