import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { networkInterfaces } from "os";
import { execFile } from "child_process";
import { readFileSync } from "fs";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { createKeyboard } from "./keyboard.js";
import { MAPPINGS } from "./mappings.js";
import { createKeyQueue } from "./key-queue.js";
import { validateMessage, makeRateLimiter, isPrivateAddress } from "./validate.js";
import { createStickEngine } from "./stick-engine.js";
import { createFocusWatcher } from "./focus.js";
import { checkAccessibility, accessibilityStatus, printAccessibilityHelp, requestAccessibility } from "./accessibility.js";
import { createDsuServer } from "./dsu/server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_PORT = Number(process.env.PORT) || 3001;
let activePort = BASE_PORT; // puede subir si el puerto está ocupado (fallback)
let shuttingDown = false;

const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
})();

const app = express();
app.use(express.static(join(__dirname, "..", "public")));

const server = createServer(app);
const wss = new WebSocketServer({ server });
// ws re-emite los errores del http server en el WSS; sin listener serían un
// throw fatal ANTES de que el fallback de puerto (server.on('error')) actúe
wss.on("error", () => {});

const keyboard = await createKeyboard();
console.log(`[server] keyboard backend: ${keyboard.name}`);

const queue = createKeyQueue(keyboard);
let invalidMsgs = 0;

// Motion (giroscopio iPhone → emuladores vía protocolo DSU/CemuHook).
// DSU_OFF=1 lo desactiva; DSU_HOST=0.0.0.0 lo expone a la LAN (p.ej. para
// un Dolphin/Cemu en otra máquina).
const dsu = process.env.DSU_OFF === "1"
  ? null
  : createDsuServer({
      host: process.env.DSU_HOST || "127.0.0.1",
      port: Number(process.env.DSU_PORT) || 26760,
    });

const players = {
  1: createPlayerState(1),
  2: createPlayerState(2),
};

function createPlayerState(num) {
  return {
    num,
    connected: false,
    socket: null,
    name: null,
    theme: null,
    orientation: "landscape-right",
    motion: false,
    buttons: new Set(),
    stickEngines: { L: createStickEngine(), R: createStickEngine() },
    stickHeld: { L: new Set(), R: new Set() },
    rttMs: null,
    msgCount: 0,
    msgsPerSec: 0,
  };
}

function displayName(p) {
  return p.name ? `Player ${p.num} (${p.name})` : `Player ${p.num}`;
}

function releaseAllForPlayer(p) {
  const map = MAPPINGS[p.num];
  for (const btn of p.buttons) {
    const key = map.buttons[btn];
    if (key) queue.push("up", key);
  }
  p.buttons.clear();

  for (const stick of ["L", "R"]) {
    const sMap = map.sticks[stick];
    for (const dir of p.stickHeld[stick]) {
      if (sMap[dir]) queue.push("up", sMap[dir]);
    }
    p.stickHeld[stick].clear();
    p.stickEngines[stick].reset();
  }
}

// SOCD (izq+der o arriba+abajo simultáneos en el d-pad): last-input-wins
// sin re-press — al presionar una dirección se suelta su opuesta retenida,
// y al soltarla NO se restaura la anterior.
const OPPOSITES = {
  dpad_left: "dpad_right",
  dpad_right: "dpad_left",
  dpad_up: "dpad_down",
  dpad_down: "dpad_up",
};

function handleButton(p, btnName, isDown) {
  const map = MAPPINGS[p.num];
  const key = map.buttons[btnName];
  if (!key || typeof key !== "string") return;

  const has = p.buttons.has(btnName);
  if (isDown && !has) {
    const opp = OPPOSITES[btnName];
    if (opp && p.buttons.has(opp)) {
      p.buttons.delete(opp);
      queue.push("up", map.buttons[opp]);
    }
    p.buttons.add(btnName);
    queue.push("down", key);
  } else if (!isDown && has) {
    p.buttons.delete(btnName);
    queue.push("up", key);
  }
}

function handleStick(p, stick, x, y) {
  const sMap = MAPPINGS[p.num].sticks[stick];
  if (!sMap) return;

  const want = p.stickEngines[stick].update(x, y);
  const held = p.stickHeld[stick];

  // releases primero, presses después: nunca un frame con izq+der a la vez
  for (const dir of [...held]) {
    if (!want.has(dir)) {
      held.delete(dir);
      queue.push("up", sMap[dir]);
    }
  }
  for (const dir of want) {
    if (!held.has(dir)) {
      held.add(dir);
      queue.push("down", sMap[dir]);
    }
  }
}

function applyConfig(p, msg) {
  if (msg.name) {
    p.name = msg.name;
    console.log(`[ws] Player ${p.num} se llama "${p.name}"`);
  }
  if (msg.theme) p.theme = msg.theme;
  if (msg.orientation) p.orientation = msg.orientation;
  if (msg.motion !== undefined) {
    p.motion = msg.motion;
    // GIRO apagado → publicar un último sample con gyro a cero y soltar el
    // slot; si no, el emulador queda integrando el último gyro congelado
    // (drift continuo de cámara) y el slot reporta Connected para siempre.
    if (msg.motion === false) dsu?.quiesceSlot(p.num - 1);
  }
  if (msg.engage !== undefined || msg.release !== undefined || msg.angularHysteresis !== undefined) {
    p.stickEngines.L.configure(msg);
    p.stickEngines.R.configure(msg);
  }
}

function send(socket, obj) {
  if (socket && socket.readyState === 1) socket.send(JSON.stringify(obj));
}

function broadcast(obj) {
  for (const p of Object.values(players)) send(p.socket, obj);
}

function broadcastSlots() {
  const occupied = Object.values(players)
    .filter((p) => p.connected)
    .map((p) => p.num);
  broadcast({ t: "slots", occupied });
}

// ── Foco de ventana ─────────────────────────────────────────────────────────
const focusWatcher = createFocusWatcher({
  match: "ryujinx",
  intervalMs: 2000,
  isActive: () => Object.values(players).some((p) => p.connected),
  onChange: (state) => {
    console.log(
      state.ok
        ? "[focus] Ryujinx al frente ✓"
        : `[focus] al frente: ${state.app} — las teclas NO van a Ryujinx`
    );
    broadcast({ t: "focus", ok: state.ok, app: state.app });
  },
});
focusWatcher.start();

// ── WebSocket ───────────────────────────────────────────────────────────────
wss.on("connection", (socket, req) => {
  const ip = req.socket.remoteAddress || "";
  if (!isPrivateAddress(ip)) {
    console.warn(`[ws] conexión rechazada desde IP no privada: ${ip}`);
    socket.close(1008, "solo LAN");
    return;
  }

  const url = new URL(req.url, "http://x");
  const playerNum = url.searchParams.get("p") === "2" ? 2 : 1;
  const p = players[playerNum];

  // Takeover de slot: soltar las teclas del cliente viejo ANTES de reasignar.
  // Sus handlers close/error comprueban identidad de socket y ya no tocarán
  // el estado del nuevo.
  if (p.connected && p.socket && p.socket !== socket) {
    const old = p.socket;
    releaseAllForPlayer(p);
    old.close(4000, "reemplazado por otro mando");
  }

  p.connected = true;
  p.socket = socket;
  socket.isAlive = true;
  const allowed = makeRateLimiter(300);
  console.log(`[ws] ${displayName(p)} conectado desde ${ip}`);

  send(socket, {
    t: "hello",
    player: playerNum,
    kb: keyboard.name,
    native: keyboard.isNative,
    accessibility: accessibilityStatus(),
    focus: focusWatcher.last,
  });
  broadcastSlots();

  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", (raw) => {
    // Mismo guard de identidad que close/error: tras un takeover, ws sigue
    // emitiendo los frames bufferados del socket VIEJO — sin esto mutarían
    // el estado del cliente nuevo (tecla pegada que nadie suelta).
    if (p.socket !== socket || shuttingDown) return;
    if (!allowed()) {
      console.warn(`[ws] ${displayName(p)} supera el rate limit — cerrando`);
      socket.close(1008, "rate limit");
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      invalidMsgs++;
      return;
    }
    const msg = validateMessage(parsed, MAPPINGS[p.num]);
    if (!msg) {
      invalidMsgs++;
      return;
    }
    p.msgCount++;

    // Ningún mensaje individual puede tumbar el proceso (la garantía que
    // promete validate.js — esto es la defensa en profundidad).
    try {
      switch (msg.t) {
        case "btn":
          handleButton(p, msg.k, msg.d);
          break;
        case "stick":
          handleStick(p, msg.s, msg.x, msg.y);
          break;
        case "ping":
          if (msg.rtt !== undefined) p.rttMs = msg.rtt;
          send(socket, { t: "pong", ts: msg.ts });
          break;
        case "config":
          applyConfig(p, msg);
          break;
        case "motion":
          p.motion = true;
          dsu?.updateSlot(p.num - 1, msg, p.orientation);
          break;
      }
    } catch (e) {
      invalidMsgs++;
      console.error(`[ws] error procesando '${msg.t}' de ${displayName(p)}:`, e.message);
    }
  });

  socket.on("close", () => {
    if (p.socket !== socket) return; // socket viejo tras un takeover
    console.log(`[ws] ${displayName(p)} desconectado`);
    releaseAllForPlayer(p);
    p.connected = false;
    p.socket = null;
    p.rttMs = null;
    p.motion = false;
    dsu?.quiesceSlot(p.num - 1);
    broadcastSlots();
  });

  socket.on("error", (err) => {
    console.error(`[ws] ${displayName(p)} error:`, err.message);
    if (p.socket !== socket) return;
    releaseAllForPlayer(p);
  });
});

// Heartbeat: detecta iPhones muertos (WiFi off, batería, app matada) y suelta
// sus teclas en ≤10s aunque el TCP nunca llegue a cerrar limpiamente.
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) {
      socket.terminate(); // dispara close → releaseAllForPlayer
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 5000);
heartbeat.unref?.();

// Tasa de mensajes (ventana de 5s) para /status
const rateTick = setInterval(() => {
  for (const p of Object.values(players)) {
    p.msgsPerSec = Math.round(p.msgCount / 5);
    p.msgCount = 0;
  }
}, 5000);
rateTick.unref?.();

// ── Setup y QR ──────────────────────────────────────────────────────────────
app.get("/setup", (_req, res) => {
  res.sendFile(join(__dirname, "..", "public", "setup.html"));
});

app.get("/qr.png", async (_req, res) => {
  const ip = getLocalIPs()[0];
  if (!ip) return res.status(404).end();
  try {
    const png = await QRCode.toBuffer(`http://${ip}:${activePort}`, {
      width: 400,
      margin: 1,
      color: { dark: "#0b0d12", light: "#ffffff" },
    });
    res.type("png").send(png);
  } catch {
    res.status(500).end();
  }
});

// ── Chequeo de sincronización con Ryujinx ───────────────────────────────────
// Reutiliza el tooling (--check, exit 0 = sincronizado). Cacheado: al boot y
// bajo demanda con /status?refresh=1.
let ryujinxState = { found: null, synced: null };

function checkRyujinx() {
  return new Promise((resolve) => {
    const tool = join(__dirname, "..", "tools", "ryujinx-setup.mjs");
    execFile(process.execPath, [tool, "--check"], { timeout: 5000 }, (err, _out, stderr) => {
      if (stderr.includes("No existe") || /no existe .*Config\.json/i.test(_out + stderr)) {
        ryujinxState = { found: false, synced: false };
      } else {
        ryujinxState = { found: true, synced: !err };
      }
      resolve(ryujinxState);
    });
  });
}
checkRyujinx();

// ── Estado ──────────────────────────────────────────────────────────────────
app.get("/status", async (req, res) => {
  if (req.query.refresh === "1") {
    await Promise.all([checkAccessibility(), checkRyujinx()]);
  }
  res.set("Access-Control-Allow-Origin", "*");
  res.json({
    app: "joypad-air",
    v: 1,
    version: VERSION,
    port: activePort,
    ryujinx: ryujinxState,
    backend: keyboard.name,
    native: keyboard.isNative,
    accessibility: accessibilityStatus(),
    focusApp: focusWatcher.last?.app ?? null,
    ryujinxFocused: focusWatcher.last?.ok ?? null,
    players: Object.fromEntries(
      Object.values(players).map((p) => [
        p.num,
        {
          connected: p.connected,
          name: p.name,
          theme: p.theme,
          motion: p.motion,
          rttMs: p.rttMs,
          msgsPerSec: p.msgsPerSec,
          heldButtons: [...p.buttons],
          stickDirs: {
            L: [...p.stickHeld.L],
            R: [...p.stickHeld.R],
          },
        },
      ])
    ),
    queueDepth: queue.depth,
    invalidMsgs,
    dsu: dsu ? dsu.status() : null,
  });
});

// ── Arranque ────────────────────────────────────────────────────────────────
function getLocalIPs() {
  const ips = [];
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

// Onboarding de Accesibilidad: si falta el permiso, pre-insertar la app en
// la lista, abrir el panel correcto de Ajustes y esperar a que el usuario
// active la casilla — el server arranca igual (QR + /setup disponibles) y
// avisa solo cuando el permiso llega.
const accessibilityOk = await checkAccessibility();
const needsOnboarding = keyboard.isNative && accessibilityOk === false;
if (needsOnboarding) {
  printAccessibilityHelp();
  requestAccessibility();
  const poll = setInterval(async () => {
    if ((await checkAccessibility()) === true) {
      clearInterval(poll);
      console.log("\n✓ Permiso de Accesibilidad concedido — ¡a jugar!\n");
      broadcast({ t: "accessibility", ok: true });
    }
  }, 2000);
  poll.unref?.();
}

// Fallback de puerto: doble click dos veces en el launcher (o una instancia
// vieja viva) no debe terminar en un stack trace críptico de EADDRINUSE.
let listenTries = 0;
server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && listenTries < 5) {
    listenTries++;
    console.warn(`[server] puerto ${activePort} ocupado (¿otra instancia corriendo?) — probando ${activePort + 1}`);
    activePort++;
    setTimeout(() => server.listen(activePort, "0.0.0.0"), 100);
    return;
  }
  console.error(`[server] no pude abrir el puerto ${activePort}: ${err.message}`);
  process.exit(1);
});

server.on("listening", () => {
  const ips = getLocalIPs();
  console.log("");
  console.log("El Control Super Pro Max — servidor corriendo");
  console.log("=============================================");
  if (ips.length === 0) {
    console.log(`Servidor en http://localhost:${activePort}`);
    console.log("(no se detectaron interfaces de red — conecta el Mac a WiFi)");
  } else {
    for (const ip of ips) {
      const url = `http://${ip}:${activePort}`;
      console.log("");
      console.log(`Abre esta URL en el iPhone:  ${url}`);
      qrcode.generate(url, { small: true });
    }
  }
  console.log("");
  console.log("En el iPhone:");
  console.log("  1. Abre la URL en Safari");
  console.log("  2. Compartir -> Agregar a pantalla de inicio");
  console.log("  3. Abre la app desde el icono, elige Player 1 o Player 2");
  console.log("");
  console.log(`Panel de estado: http://localhost:${activePort}/setup`);
  console.log("Mapeo de teclas para Ryujinx: npm run ryujinx:setup (ver README.md)");
  console.log("Ctrl+C para detener");

  // Si falta el permiso de Accesibilidad, abrir el panel guiado en el
  // navegador (solo entonces — en el uso diario no estorba).
  if (needsOnboarding) {
    execFile("open", [`http://localhost:${activePort}/setup`]);
  }
});

server.listen(activePort, "0.0.0.0");

async function shutdown() {
  console.log("\nLiberando teclas y cerrando...");
  // Dejar de procesar mensajes nuevos para que la cola pueda drenar los
  // releases (bajo inundación, los 'up' finales quedan detrás del backlog).
  shuttingDown = true;
  for (const p of Object.values(players)) releaseAllForPlayer(p);
  await Promise.race([queue.flush(), new Promise((r) => setTimeout(r, 1500))]);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
