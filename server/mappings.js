// Nombres de teclas según el enum Key de @nut-tree-fork/nut-js.
// Cada jugador usa un set sin colisiones para que Ryujinx pueda
// distinguirlos como dos teclados independientes.
//
// Si quieres remapear, edita estos valores y reinicia el servidor.
// Después en Ryujinx -> Input -> Player N -> Keyboard, asigna las
// mismas teclas a cada botón.

export const MAPPINGS = {
  1: {
    buttons: {
      a: "Z", b: "X", x: "C", y: "V",
      l: "Q", r: "E",
      zl: "Num1", zr: "Num2",
      plus: "Num3", minus: "Num4",
      lstick: "Num5", rstick: "Num6",
      home: "Num7", capture: "Num8",
      dpad_up: "T", dpad_down: "G", dpad_left: "F", dpad_right: "H",
      sl: "B", sr: "Y",
    },
    sticks: {
      L: { up: "W", down: "S", left: "A", right: "D" },
      R: { up: "I", down: "K", left: "J", right: "L" },
    },
  },
  2: {
    // Teclas reales asignadas en Ryujinx para el Jugador 2 (verificado
    // mapeando la ventana de Entrada). Solo letras/números/coma/= y flechas,
    // que se asignan sin problemas en un MacBook (sin teclado numérico).
    buttons: {
      a: "M", b: "N", x: "O", y: "U",
      l: "P", r: "R",
      zl: "Num9", zr: "Num0",
      plus: "Comma", minus: "Equal",
      // Lo siguiente NO se usa en Mario co-op y queda SIN asignar en
      // Ryujinx: se mandan a teclas F para no chocar con nada.
      lstick: "F9", rstick: "F10",
      home: "F11", capture: "F12",
      dpad_up: "F1", dpad_down: "F2", dpad_left: "F3", dpad_right: "F4",
      sl: "F13", sr: "F14",
    },
    sticks: {
      // Movimiento del Jugador 2 = flechas.
      L: { up: "Up", down: "Down", left: "Left", right: "Right" },
      // Stick derecho sin uso en Mario → teclas F sin asignar en Ryujinx.
      R: { up: "F5", down: "F6", left: "F7", right: "F8" },
    },
  },
};
