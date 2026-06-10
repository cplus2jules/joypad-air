// Vigila qué app tiene el foco en macOS.
//
// Si Ryujinx no está al frente, las teclas inyectadas van a otra app — el
// bloqueador #1 histórico de este proyecto ("controla el Mac, no el juego").
// Detectamos el frontmost con `lsappinfo` (builtin de macOS, NO dispara
// prompts de TCC, a diferencia de osascript+System Events) y avisamos a los
// iPhones para que muestren un banner.
//
// Si lsappinfo falla o cambia de formato, el estado queda en "unknown" y no
// se molesta a nadie (nunca usar osascript aquí: correría cada 2s y pediría
// el permiso de Automation).

import { execFile } from "node:child_process";

function getFrontApp() {
  return new Promise((resolve) => {
    execFile("lsappinfo", ["front"], { timeout: 1500 }, (err, stdout) => {
      const asn = (stdout || "").trim();
      if (err || !asn) return resolve(null);
      execFile(
        "lsappinfo",
        ["info", "-only", "name", asn],
        { timeout: 1500 },
        (err2, out2) => {
          if (err2 || !out2) return resolve(null);
          // formato esperado: "LSDisplayName"="Ryujinx"
          const m = out2.match(/=\s*"([^"]+)"/);
          resolve(m ? m[1].trim() : null);
        }
      );
    });
  });
}

// match: substring case-insensitive del nombre de la app objetivo.
// isActive: solo sondear cuando hay players conectados (no gastar CPU).
export function createFocusWatcher({ match = "ryujinx", intervalMs = 2000, isActive = () => true, onChange } = {}) {
  let last = null; // { ok, app } | null
  let timer = null;
  let polling = false;

  async function poll() {
    if (polling || !isActive()) return;
    polling = true;
    try {
      const app = await getFrontApp();
      if (app === null) return; // unknown — no cambiar estado
      const ok = app.toLowerCase().includes(match.toLowerCase());
      if (!last || last.ok !== ok || last.app !== app) {
        last = { ok, app };
        onChange?.(last);
      }
    } finally {
      polling = false;
    }
  }

  return {
    start() {
      if (!timer) {
        timer = setInterval(poll, intervalMs);
        timer.unref?.();
        poll();
      }
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    get last() {
      return last;
    },
  };
}
