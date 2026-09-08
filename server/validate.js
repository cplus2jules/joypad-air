// Validación de mensajes WebSocket. Un mensaje inválido se descarta en
// silencio (devuelve null) — nunca debe tumbar el server ni llegar a nut-js.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// map = MAPPINGS[playerNum] (para validar que el botón exista)
export function validateMessage(msg, map) {
  if (!msg || typeof msg !== "object" || typeof msg.t !== "string") return null;

  switch (msg.t) {
    case "btn": {
      // Object.hasOwn (no `in`): el operador `in` recorre la cadena de
      // prototipos y dejaría pasar k="toString"/"constructor"/"__proto__"
      if (typeof msg.k !== "string" || !Object.hasOwn(map.buttons, msg.k)) return null;
      return { t: "btn", k: msg.k, d: !!msg.d };
    }

    case "stick": {
      if (msg.s !== "L" && msg.s !== "R") return null;
      const x = num(msg.x);
      const y = num(msg.y);
      if (x === null || y === null) return null;
      return { t: "stick", s: msg.s, x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
    }

    case "ping": {
      const ts = num(msg.ts);
      if (ts === null || Math.abs(ts) > Number.MAX_SAFE_INTEGER) return null;
      const out = { t: "ping", ts };
      const rtt = num(msg.rtt);
      if (rtt !== null && rtt >= 0) out.rtt = Math.round(clamp(rtt, 0, 60000));
      return out;
    }

    case "config": {
      const out = { t: "config" };
      if (typeof msg.name === "string" && msg.name.trim()) {
        out.name = msg.name.trim().slice(0, 24);
      }
      if (typeof msg.theme === "string") out.theme = msg.theme.slice(0, 24);
      if (["landscape-left", "landscape-right", "portrait"].includes(msg.orientation)) {
        out.orientation = msg.orientation;
      }
      if (msg.motionProfile !== undefined) {
        if (!["legacy", "just-dance"].includes(msg.motionProfile)) return null;
        out.motionProfile = msg.motionProfile;
      }
      const engage = num(msg.engage);
      if (engage !== null) out.engage = clamp(engage, 0.3, 0.9);
      const release = num(msg.release);
      if (release !== null) out.release = clamp(release, 0.05, 0.85);
      const ah = num(msg.angularHysteresis);
      if (ah !== null) out.angularHysteresis = clamp(ah, 0, 22.5);
      if (msg.motion === true || msg.motion === false) out.motion = msg.motion;
      return out;
    }

    case "motion": {
      // gyro en grados/segundo, accel en g, ts en microsegundos (monotónico del sensor)
      const gx = num(msg.gx), gy = num(msg.gy), gz = num(msg.gz);
      const ax = num(msg.ax), ay = num(msg.ay), az = num(msg.az);
      // Tope superior del ts OBLIGATORIO: sin él, un ts ≥ 2^64 llega a
      // writeBigUInt64LE en el encoder DSU y el RangeError tumba el proceso.
      const ts = num(msg.ts);
      if ([gx, gy, gz, ax, ay, az].some((v) => v === null) || ts === null || ts < 0 || ts > Number.MAX_SAFE_INTEGER) {
        return null;
      }
      return {
        t: "motion",
        ...(Number.isSafeInteger(msg.seq) && msg.seq >= 0 ? { seq: msg.seq } : {}),
        ...(typeof msg.sessionId === "string" ? { sessionId: msg.sessionId.slice(0, 64) } : {}),
        gx: clamp(gx, -2000, 2000),
        gy: clamp(gy, -2000, 2000),
        gz: clamp(gz, -2000, 2000),
        ax: clamp(ax, -8, 8),
        ay: clamp(ay, -8, 8),
        az: clamp(az, -8, 8),
        ts: Math.round(ts),
      };
    }

    default:
      return null;
  }
}

// Rate limit defensivo por socket (ventana fija de 1s).
export function makeRateLimiter(maxPerSec = 300) {
  let count = 0;
  let windowStart = Date.now();
  return () => {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      count = 0;
    }
    count++;
    return count <= maxPerSec;
  };
}

// Solo aceptamos clientes de la LAN (RFC1918 / loopback / link-local).
export function isPrivateAddress(ip) {
  if (!ip) return false;
  const v4 = ip.replace(/^::ffff:/i, "");
  if (v4 === "127.0.0.1" || ip === "::1") return true;
  if (/^10\./.test(v4)) return true;
  if (/^192\.168\./.test(v4)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v4)) return true;
  if (/^169\.254\./.test(v4)) return true; // link-local
  if (/^fe80:/i.test(ip)) return true;
  return false;
}
