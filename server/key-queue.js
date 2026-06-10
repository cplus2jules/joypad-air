// Cola FIFO global de operaciones de tecla.
//
// El teclado del Mac es un recurso único compartido entre los dos players:
// nut-js (pressKey/releaseKey) es async, y sin serialización un release puede
// adelantar a su press cuando llegan con <10ms de diferencia (tap rápido).
// Una sola cola garantiza el orden exacto de llegada, players incluidos.

export function createKeyQueue(keyboard) {
  let chain = Promise.resolve();
  let depth = 0;

  return {
    // type: "down" | "up", key: nombre de tecla nut-js
    push(type, key) {
      if (depth > 256) {
        console.warn(`[queue] profundidad ${depth} — ¿inundación de mensajes?`);
      }
      depth++;
      chain = chain
        .then(() => (type === "down" ? keyboard.down(key) : keyboard.up(key)))
        .catch((e) => console.error(`[queue] ${type} ${key}:`, e.message))
        .finally(() => {
          depth--;
        });
      return chain;
    },

    // Espera a que se drene todo lo encolado hasta ahora (p.ej. antes de salir).
    flush() {
      return chain;
    },

    get depth() {
      return depth;
    },
  };
}
