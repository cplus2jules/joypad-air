// Smoke test del server — sin teclado real (FORCE_LOG=1) y sin red externa.
//
//   node tools/smoke-test.mjs
//
// Verifica: orden FIFO de la cola con backend async, stick engine (histéresis
// radial y angular, círculo completo), SOCD del d-pad, takeover de slot,
// validación de basura, ping/pong y /status.

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import WebSocket from "ws";

import { createStickEngine } from "../server/stick-engine.js";
import { createKeyQueue } from "../server/key-queue.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORT = 3199;

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

// ── 1. Cola FIFO con backend async desordenado ──────────────────────────────
console.log("\n[1] key-queue: orden FIFO con backend async");
{
  const events = [];
  // down tarda 5ms, up 0ms: sin cola, los UP adelantarían a los DOWN
  const fakeKb = {
    down: async (k) => { await sleep(5); events.push(`down:${k}`); },
    up: async (k) => { events.push(`up:${k}`); },
  };
  const q = createKeyQueue(fakeKb);
  for (let i = 0; i < 20; i++) {
    q.push("down", "Z");
    q.push("up", "Z");
  }
  await q.flush();
  let ordered = events.length === 40;
  for (let i = 0; i < events.length; i += 2) {
    if (events[i] !== "down:Z" || events[i + 1] !== "up:Z") ordered = false;
  }
  check("40 eventos en orden estricto down→up", ordered, events.slice(0, 6).join(","));
  check("cola drenada (depth 0)", q.depth === 0);
}

// ── 2. Stick engine: histéresis y sectores ──────────────────────────────────
console.log("\n[2] stick-engine: histéresis radial + angular");
{
  const eng = createStickEngine();

  // bajo engage: nada
  let dirs = eng.update(0.4, 0);
  check("mag 0.40 < engage 0.55 → sin dirección", dirs.size === 0);

  // engancha
  dirs = eng.update(0.7, 0);
  check("mag 0.70 → {right}", dirs.size === 1 && dirs.has("right"));

  // histéresis radial: 0.45 está bajo engage pero sobre release → mantiene
  dirs = eng.update(0.45, 0);
  check("mag 0.45 con enganche previo → mantiene {right}", dirs.has("right"));

  // suelta bajo release
  dirs = eng.update(0.3, 0);
  check("mag 0.30 < release 0.40 → suelta", dirs.size === 0);

  // histéresis angular: enganchar en diagonal SE (45°), vibrar ±8° no cambia
  eng.reset();
  const at = (deg, mag = 0.9) => eng.update(
    mag * Math.cos((deg * Math.PI) / 180),
    mag * Math.sin((deg * Math.PI) / 180)
  );
  let d1 = at(45);
  check("45° → {right,down}", d1.has("right") && d1.has("down"));
  let stable = true;
  for (const jitter of [53, 37, 52, 38, 45]) {
    const d = at(jitter);
    if (!(d.size === 2 && d.has("right") && d.has("down"))) stable = false;
  }
  check("vibrar ±8° alrededor de 45° → sector estable", stable);
  // salir del sector requiere superar 22.5 + 11.25 = 33.75° desde el centro
  let d2 = at(45 + 36);
  check("45°+36° → cambia a {down}", d2.size === 1 && d2.has("down"));

  // círculo completo: tras enganchar en 0°, una vuelta = 8 cambios de sector,
  // cada uno con exactamente 1 evento de cambio (press o release)
  eng.reset();
  let events = 0;
  let held = new Set();
  for (let deg = 0; deg <= 360; deg += 3) {
    const want = at(deg);
    for (const d of held) if (!want.has(d)) { held.delete(d); events++; }
    for (const d of want) if (!held.has(d)) { held.add(d); events++; }
  }
  // engage inicial (press right) + 8 fronteras × 1 evento = 9
  check(`círculo completo → 9 eventos exactos (got ${events})`, events === 9);
}

// ── 3. Server integrado (FORCE_LOG, puerto de test) ─────────────────────────
console.log("\n[3] server integrado: ws + validación + SOCD + takeover + /status");

let serverLog = "";
const proc = spawn("node", ["server/index.js"], {
  cwd: ROOT,
  env: { ...process.env, FORCE_LOG: "1", PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
proc.stdout.on("data", (d) => { serverLog += d.toString(); });
proc.stderr.on("data", (d) => { serverLog += d.toString(); });

// esperar arranque
for (let i = 0; i < 50 && !serverLog.includes("servidor corriendo"); i++) await sleep(100);
check("server arranca", serverLog.includes("servidor corriendo"));

const wsUrl = (p) => `ws://127.0.0.1:${PORT}/?p=${p}`;
function connect(p) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl(p));
    const msgs = [];
    ws.on("message", (raw) => msgs.push(JSON.parse(raw.toString())));
    ws.on("open", () => resolve({ ws, msgs }));
    ws.on("error", reject);
  });
}
const logMark = () => serverLog.length;
const logSince = (mark) => serverLog.slice(mark);

// hello + ping/pong
{
  const { ws, msgs } = await connect(1);
  await sleep(150);
  const hello = msgs.find((m) => m.t === "hello");
  check("hello con player/kb/accessibility", !!hello && hello.player === 1 && typeof hello.kb === "string");

  ws.send(JSON.stringify({ t: "ping", ts: 12345, rtt: 18 }));
  await sleep(150);
  const pong = msgs.find((m) => m.t === "pong");
  check("pong ecoa ts", !!pong && pong.ts === 12345);

  // ráfaga de botón: 30 pares down/up rápidos
  let mark = logMark();
  for (let i = 0; i < 30; i++) {
    ws.send(JSON.stringify({ t: "btn", k: "a", d: true }));
    ws.send(JSON.stringify({ t: "btn", k: "a", d: false }));
  }
  await sleep(400);
  const lines = logSince(mark).split("\n").filter((l) => /DOWN Z|UP {3}Z/.test(l));
  let alternates = lines.length === 60;
  for (let i = 0; i < lines.length; i += 2) {
    if (!/DOWN Z/.test(lines[i] ?? "") || !/UP {3}Z/.test(lines[i + 1] ?? "")) alternates = false;
  }
  check(`ráfaga 30 pares → 60 líneas alternadas estrictas (got ${lines.length})`, alternates);

  // basura: no debe tumbar el server ni generar teclas
  mark = logMark();
  ws.send("esto no es json{{{");
  ws.send(JSON.stringify({ t: "btn", k: "rm -rf /", d: true }));
  ws.send(JSON.stringify({ t: "stick", s: "Z", x: 99, y: "nan" }));
  ws.send(JSON.stringify({ t: "stick", s: "L", x: Infinity, y: 0 }));
  await sleep(200);
  check("basura → cero eventos de tecla", !/DOWN|UP/.test(logSince(mark)));
  check("server sigue vivo tras basura", ws.readyState === WebSocket.OPEN);

  // SOCD: mantener dpad_left (F) y presionar dpad_right (H) → UP F antes de DOWN H
  mark = logMark();
  ws.send(JSON.stringify({ t: "btn", k: "dpad_left", d: true }));
  await sleep(80);
  ws.send(JSON.stringify({ t: "btn", k: "dpad_right", d: true }));
  await sleep(200);
  const socd = logSince(mark);
  const iDownF = socd.indexOf("DOWN F");
  const iUpF = socd.indexOf("UP   F");
  const iDownH = socd.indexOf("DOWN H");
  check("SOCD: DOWN F → UP F → DOWN H", iDownF >= 0 && iUpF > iDownF && iDownH > iUpF);
  ws.send(JSON.stringify({ t: "btn", k: "dpad_right", d: false }));

  // stick por ws: círculo a magnitud 0.9 → 9 eventos
  mark = logMark();
  for (let deg = 0; deg <= 360; deg += 3) {
    ws.send(JSON.stringify({
      t: "stick", s: "L",
      x: 0.9 * Math.cos((deg * Math.PI) / 180),
      y: 0.9 * Math.sin((deg * Math.PI) / 180),
    }));
  }
  ws.send(JSON.stringify({ t: "stick", s: "L", x: 0, y: 0 }));
  await sleep(400);
  const stickEvents = (logSince(mark).match(/DOWN [WASD]|UP {3}[WASD]/g) || []).length;
  // 9 del círculo + 1 release final (vuelve a centro soltando la última dir)
  check(`círculo ws → 10 eventos (got ${stickEvents})`, stickEvents === 10);

  // config: cambiar nombre
  ws.send(JSON.stringify({ t: "config", name: "Wanda", engage: 0.5, release: 0.35 }));
  await sleep(150);
  check("config aplica nombre", serverLog.includes('se llama "Wanda"'));

  // takeover: cliente nuevo en slot 1 mientras este retiene una tecla
  ws.send(JSON.stringify({ t: "btn", k: "b", d: true })); // X física
  await sleep(100);
  mark = logMark();
  const closedCode = new Promise((resolve) => ws.on("close", (code) => resolve(code)));
  const second = await connect(1);
  await sleep(250);
  check("takeover suelta la tecla retenida (UP X)", logSince(mark).includes("UP   X"));
  check("socket viejo cerrado con 4000", (await closedCode) === 4000);

  // el nuevo cliente funciona
  mark = logMark();
  second.ws.send(JSON.stringify({ t: "btn", k: "a", d: true }));
  second.ws.send(JSON.stringify({ t: "btn", k: "a", d: false }));
  await sleep(200);
  check("nuevo cliente inyecta teclas tras takeover", logSince(mark).includes("DOWN Z"));

  // desconexión con tecla retenida → release
  second.ws.send(JSON.stringify({ t: "btn", k: "x", d: true })); // C física
  await sleep(100);
  mark = logMark();
  second.ws.close();
  await sleep(300);
  check("close suelta teclas retenidas (UP C)", logSince(mark).includes("UP   C"));
}

// /status
{
  const { ws } = await connect(2);
  await sleep(150);
  const res = await fetch(`http://127.0.0.1:${PORT}/status`);
  const st = await res.json();
  check("/status responde JSON con firma", st.app === "switch-controller" && st.v === 1);
  check("/status player 2 conectado", st.players?.["2"]?.connected === true);
  check("/status player 1 libre", st.players?.["1"]?.connected === false);
  // 3 inválidos: JSON roto, botón inexistente, stick s:"Z". El 4º (x:Infinity)
  // se serializa como null → x=0 válido, no cuenta.
  check("/status cuenta mensajes inválidos", st.invalidMsgs >= 3);
  check("/status backend log", st.native === false);
  ws.close();
}

proc.kill("SIGTERM");
await sleep(200);

console.log(`\n${"=".repeat(40)}\nResultado: ${passed} OK, ${failed} FALLOS\n`);
process.exit(failed === 0 ? 0 : 1);
