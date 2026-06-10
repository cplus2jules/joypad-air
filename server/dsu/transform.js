// Transformación de ejes: marco del iPhone → marco DSU/CemuHook.
//
// El iPhone juega en landscape; sus sensores reportan en el marco del
// dispositivo EN PORTRAIT (+X derecha, +Y arriba hacia el auricular,
// +Z saliendo de la pantalla). La convención CemuHook (heredada del DS4):
// mando plano sobre la mesa, botones arriba ⇒ accel = (0, -1, 0) g.
//
// Las matrices son hipótesis iniciales DISEÑADAS PARA AJUSTARSE con la
// calibración física de 6 poses (tools/dsu-test-client.mjs --pose) — solo
// valores ∈ {-1, 0, 1}, una matriz por orientación de pantalla. El gyro usa
// la misma rotación que el accel (det = +1).
//
// Entrada del app (marco device, ya convertida de unidades):
//   ax/ay/az en g · gx/gy/gz en °/s (gx = rate sobre X device, etc.)
// Salida DSU:
//   accel {x,y,z} en g · gyro {pitch (sobre X), yaw (sobre Y), roll (sobre Z)}

const TRANSFORMS = {
  // top del iPhone hacia la IZQUIERDA del jugador
  "landscape-right": {
    // filas = ejes DSU [x, y, z] expresados en ejes device [x, y, z]
    m: [
      [0, -1, 0], // DSU x (derecha del jugador)  = -Y device
      [0, 0, 1],  // DSU y (plano⇒-1g)            = +Z device
      [-1, 0, 0], // DSU z (hacia el jugador)     = -X device
    ],
  },
  // top del iPhone hacia la DERECHA del jugador
  "landscape-left": {
    m: [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
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
  const [ax, ay, az] = applyMatrix(t.m, [sample.ax, sample.ay, sample.az]);
  const [pitch, yaw, roll] = applyMatrix(t.m, [sample.gx, sample.gy, sample.gz]);
  return { ax, ay, az, pitch, yaw, roll, tsUs: sample.ts };
}
