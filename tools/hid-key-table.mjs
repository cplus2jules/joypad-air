// Conversión de nombres de tecla nut-js (enum Key) → Ryujinx Hid.Key.
//
// Verificada contra el Config.json real (version 70 / Ryubing 1.3.3) y el
// enum Key del código fuente. Una tecla sin entrada es un ERROR FATAL del
// generador: jamás escribir configs corruptas en Ryujinx.

const TABLE = {
  // Fila de números (no confundir con el teclado numérico)
  Num0: "Number0", Num1: "Number1", Num2: "Number2", Num3: "Number3",
  Num4: "Number4", Num5: "Number5", Num6: "Number6", Num7: "Number7",
  Num8: "Number8", Num9: "Number9",

  // Teclado numérico
  NumPad0: "Keypad0", NumPad1: "Keypad1", NumPad2: "Keypad2",
  NumPad3: "Keypad3", NumPad4: "Keypad4", NumPad5: "Keypad5",
  NumPad6: "Keypad6", NumPad7: "Keypad7", NumPad8: "Keypad8",
  NumPad9: "Keypad9",

  // Símbolos (nombres distintos en cada lado)
  Equal: "Plus",            // la tecla "=" se llama Plus en Ryujinx
  Minus: "Minus",
  Comma: "Comma",
  Period: "Period",
  Semicolon: "Semicolon",
  Quote: "Quote",
  Grave: "Tilde",
  Backslash: "BackSlash",   // S mayúscula en Ryujinx
  Slash: "Slash",
  LeftBracket: "BracketLeft",
  RightBracket: "BracketRight",

  // Flechas
  Up: "Up", Down: "Down", Left: "Left", Right: "Right",

  // Otras
  Space: "Space", Tab: "Tab", Return: "Enter", Escape: "Escape",

  // F13/F14 no son asignables en la UI de Ryujinx — quedan sin vincular
  F13: "Unbound", F14: "Unbound",
};

// Letras A-Z y F1-F12 son idénticas en ambos enums
for (let c = 65; c <= 90; c++) {
  const letter = String.fromCharCode(c);
  TABLE[letter] = letter;
}
for (let i = 1; i <= 12; i++) {
  TABLE[`F${i}`] = `F${i}`;
}

export function toRyujinxKey(nutName) {
  if (nutName === null || nutName === undefined) return "Unbound";
  const ryu = TABLE[nutName];
  if (ryu === undefined) {
    throw new Error(
      `Tecla nut-js sin conversión a Ryujinx: "${nutName}". ` +
      `Añádela a tools/hid-key-table.mjs antes de generar configs.`
    );
  }
  return ryu;
}
