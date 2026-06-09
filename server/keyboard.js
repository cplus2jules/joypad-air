// Backend de teclado. Intenta usar @nut-tree-fork/nut-js (envia teclas
// nativas en macOS). Si no está instalado o falla, cae a un backend "log"
// que solo imprime los eventos por consola — útil para depurar la PWA
// sin permisos de Accesibilidad.

export async function createKeyboard() {
  try {
    const nut = await import("@nut-tree-fork/nut-js");
    const { keyboard, Key } = nut;
    keyboard.config.autoDelayMs = 0;

    const resolveKey = (name) => {
      const k = Key[name];
      if (k === undefined) {
        console.warn(`[keyboard] tecla desconocida: ${name}`);
        return null;
      }
      return k;
    };

    return {
      name: "nut-js (nativo macOS)",
      down: async (name) => {
        const k = resolveKey(name);
        if (k !== null) {
          try { await keyboard.pressKey(k); }
          catch (e) { console.error(`[keyboard] pressKey ${name}:`, e.message); }
        }
      },
      up: async (name) => {
        const k = resolveKey(name);
        if (k !== null) {
          try { await keyboard.releaseKey(k); }
          catch (e) { console.error(`[keyboard] releaseKey ${name}:`, e.message); }
        }
      },
    };
  } catch (err) {
    console.warn("[keyboard] @nut-tree-fork/nut-js no disponible — usando backend log");
    console.warn(`[keyboard] razón: ${err.message}`);
    return {
      name: "log (solo consola)",
      down: (name) => console.log(`  DOWN ${name}`),
      up:   (name) => console.log(`  UP   ${name}`),
    };
  }
}
