// El Control Super Pro Max — cliente PWA (Safari iOS 17+, vanilla JS, sin deps).
//
// Protocolo WS (el server hace la conversión stick→8 direcciones, SOCD, etc.):
//   → {t:'btn',k,d} · {t:'stick',s,x,y} crudos [-1,1] · {t:'config',...}
//   → {t:'ping',ts,rtt} cada 2s · {t:'motion',gx,gy,gz,ax,ay,az,ts} ~60Hz
//   ← {t:'hello'} · {t:'pong'} · {t:'focus'} · {t:'slots'} · {t:'accessibility'}

import { THEMES, DEFAULT_THEME, applyTheme } from "./themes.js";
import { haptic, setHapticMode, initHaptics } from "./haptics.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ─── Ajustes persistidos ────────────────────────────────────────────────────
const SETTINGS_KEY = "cspm-pwa-settings-v1";
const LEGACY_PLAYER_KEY = "switchpad.player";

const DEFAULT_SETTINGS = {
  player: null, // último slot usado (1|2)
  names: { 1: "Chocorramito 1", 2: "Chocorramito 2" },
  theme: DEFAULT_THEME,
  engage: 0.55,
  release: 0.4,
  swapAB: false,
  haptics: "normal", // off | suave | normal | fuerte
};

function loadSettings() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch { /* privado/corrupto */ }
  const s = {
    ...DEFAULT_SETTINGS,
    ...(raw && typeof raw === "object" ? raw : {}),
    names: { ...DEFAULT_SETTINGS.names, ...(raw && raw.names ? raw.names : {}) },
  };
  if (!THEMES[s.theme]) s.theme = DEFAULT_THEME;
  s.engage = clamp(Number(s.engage) || 0.55, 0.3, 0.9);
  s.release = clamp(Number(s.release) || 0.4, 0.1, s.engage - 0.05);
  s.swapAB = !!s.swapAB;
  if (!["off", "suave", "normal", "fuerte"].includes(s.haptics)) s.haptics = "normal";
  if (s.player !== 1 && s.player !== 2) {
    // migración desde la PWA v1
    const legacy = Number(localStorage.getItem(LEGACY_PLAYER_KEY));
    s.player = legacy === 1 || legacy === 2 ? legacy : null;
  }
  for (const n of [1, 2]) {
    if (typeof s.names[n] !== "string" || !s.names[n].trim()) s.names[n] = `Chocorramito ${n}`;
    s.names[n] = s.names[n].slice(0, 14);
  }
  return s;
}

const settings = loadSettings();

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* no-op */ }
}

// ─── Estado de runtime ──────────────────────────────────────────────────────
const state = {
  player: null,            // slot activo mientras el pad está visible
  wsStatus: "idle",        // idle | connecting | open | reconnecting
  rtt: null,
  motionOn: false,
  focusOk: true,
  focusApp: null,
  accessibilityOk: true,   // true | false | "unknown"
  orientation: "landscape-right",
};

// Pointers reclamados por un control con superficie propia (stick, d-pad,
// botones): el tracker global de hair-triggers los ignora.
const claimed = new Set();

// ─── DOM ────────────────────────────────────────────────────────────────────
const elPicker = $("#picker");
const elPad = $("#pad");
const elRotate = $("#rotate-hint");
const elPillName = $("#pill-name");
const elBanner = $("#banner");
const elReconnect = $("#reconnect");
const elLatDot = $("#lat-dot");
const elLatMs = $("#lat-ms");
const elBtnMotion = $("#btn-motion");
const elSettings = $("#settings");

const padVisible = () => !elPad.hidden;
const settingsOpen = () => !elSettings.hidden;

// ─── WebSocket ──────────────────────────────────────────────────────────────
let ws = null;
let shouldReconnect = false;
let reconnectTimer = null;
let pingTimer = null;

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch { /* no-op */ }
  }
}

function setWsStatus(status) {
  state.wsStatus = status;
  // Overlay de reconexión: solo cuando el WS cayó (no en el primer intento)
  elReconnect.hidden = !(padVisible() && status === "reconnecting");
  // LED del slot parpadea si no hay conexión
  $$(".led.on", elPad).forEach((led) => led.classList.toggle("blink", status !== "open"));
  if (status !== "open") { state.rtt = null; updateLatency(); }
}

function wsConnect() {
  if (!state.player || !shouldReconnect) return;
  clearTimeout(reconnectTimer);
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  let socket;
  try {
    socket = new WebSocket(`${proto}//${location.host}/?p=${state.player}`);
  } catch {
    scheduleReconnect();
    return;
  }
  ws = socket;

  socket.addEventListener("open", () => {
    if (socket !== ws) return;
    setWsStatus("open");
    sendConfig();
    startPing();
  });

  socket.addEventListener("message", (ev) => {
    if (socket !== ws) return;
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg && typeof msg.t === "string") handleServerMessage(msg);
  });

  socket.addEventListener("close", () => {
    if (socket !== ws) return;
    ws = null;
    stopPing();
    if (shouldReconnect) {
      setWsStatus("reconnecting");
      scheduleReconnect();
    } else {
      setWsStatus("idle");
    }
  });

  socket.addEventListener("error", () => { /* close se encarga */ });
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(wsConnect, 1500);
}

function wsClose() {
  shouldReconnect = false;
  clearTimeout(reconnectTimer);
  stopPing();
  if (ws) {
    const s = ws;
    ws = null;
    try { s.close(); } catch { /* no-op */ }
  }
  setWsStatus("idle");
}

function startPing() {
  stopPing();
  const ping = () => send({ t: "ping", ts: Date.now(), rtt: state.rtt ?? undefined });
  ping();
  pingTimer = setInterval(ping, 2000);
}
function stopPing() {
  clearInterval(pingTimer);
  pingTimer = null;
}

function handleServerMessage(msg) {
  switch (msg.t) {
    case "hello":
      state.accessibilityOk = msg.accessibility;
      state.focusOk = msg.focus ? !!msg.focus.ok : true;
      state.focusApp = (msg.focus && msg.focus.app) || null;
      updateBanner();
      break;
    case "pong": {
      const rtt = Date.now() - Number(msg.ts);
      if (Number.isFinite(rtt) && rtt >= 0 && rtt < 60000) {
        state.rtt = rtt;
        updateLatency();
      }
      break;
    }
    case "focus":
      state.focusOk = !!msg.ok;
      state.focusApp = msg.app || null;
      updateBanner();
      break;
    case "accessibility":
      state.accessibilityOk = !!msg.ok;
      updateBanner();
      break;
    case "slots":
      // los LEDs muestran solo el slot propio; nada que hacer aquí
      break;
  }
}

function sendConfig() {
  if (!state.player) return;
  send({
    t: "config",
    name: settings.names[state.player],
    theme: settings.theme,
    orientation: state.orientation,
    engage: settings.engage,
    release: settings.release,
    angularHysteresis: 11.25,
    motion: state.motionOn,
  });
}

// ─── Latencia (punto + número al tocar) ─────────────────────────────────────
function updateLatency() {
  const r = state.rtt;
  let cls = "lat-none";
  if (state.wsStatus === "open" && r != null) {
    cls = r < 25 ? "lat-ok" : r < 60 ? "lat-warn" : "lat-err";
  }
  elLatDot.className = `lat-dot ${cls}`;
  elLatMs.textContent = r == null ? "— ms" : `${r} ms`;
}

let latMsTimer = null;
$("#lat-btn").addEventListener("click", () => {
  haptic("light");
  elLatMs.classList.add("show");
  clearTimeout(latMsTimer);
  latMsTimer = setTimeout(() => elLatMs.classList.remove("show"), 2000);
});

// ─── Banner de estado (ámbar) ───────────────────────────────────────────────
let bannerFlashTimer = null;

function bannerMessage() {
  if (state.accessibilityOk === false) {
    return "Falta el permiso de Accesibilidad en el Mac — mira la Terminal";
  }
  if (state.focusOk === false) {
    return "Ryujinx no tiene el foco — haz click en su ventana";
  }
  return null;
}

function updateBanner() {
  if (bannerFlashTimer) return; // un flash temporal tiene prioridad
  const msg = bannerMessage();
  if (msg) {
    elBanner.textContent = msg;
    elBanner.classList.add("show");
  } else {
    elBanner.classList.remove("show");
  }
}

function flashBanner(msg, ms = 3000) {
  clearTimeout(bannerFlashTimer);
  elBanner.textContent = msg;
  elBanner.classList.add("show");
  bannerFlashTimer = setTimeout(() => {
    bannerFlashTimer = null;
    updateBanner();
  }, ms);
}

// ─── Botones de presión (ABXY, − + ⌂ captura) ──────────────────────────────
function bindPressButton(el, { level = "medium", getKey } = {}) {
  let pid = null;
  const key = getKey || (() => el.dataset.key);

  const press = (e) => {
    if (pid !== null) return;
    e.preventDefault();
    pid = e.pointerId;
    claimed.add(pid);
    try { el.setPointerCapture(pid); } catch { /* no-op */ }
    el.classList.add("pressed");
    send({ t: "btn", k: key(), d: true });
    haptic(level);
  };

  const release = () => {
    if (pid === null) return;
    claimed.delete(pid);
    pid = null;
    el.classList.remove("pressed");
    send({ t: "btn", k: key(), d: false });
    haptic("light");
  };

  el.addEventListener("pointerdown", press);
  el.addEventListener("pointerup", (e) => { if (e.pointerId === pid) release(); });
  el.addEventListener("pointercancel", (e) => { if (e.pointerId === pid) release(); });
  // si el dedo se desliza fuera, se suelta el botón (y el pointer queda libre
  // para los hair-triggers)
  el.addEventListener("pointerleave", (e) => { if (e.pointerId === pid) release(); });
  el._forceRelease = release;
}

// ABXY con swap A/B·X/Y (intercambia name enviado + posición de etiqueta)
const FACE_LAYOUTS = {
  switch: { top: "x", left: "y", right: "a", bottom: "b" },
  xbox: { top: "y", left: "x", right: "b", bottom: "a" },
};

function applyFaceLayout() {
  const layout = settings.swapAB ? FACE_LAYOUTS.xbox : FACE_LAYOUTS.switch;
  $$(".face-btn", elPad).forEach((el) => {
    if (typeof el._forceRelease === "function") el._forceRelease();
    el.dataset.key = layout[el.dataset.pos];
    el.textContent = layout[el.dataset.pos].toUpperCase();
  });
}

// ─── Sticks (knob sigue el dedo, modo flotante, snap-back) ──────────────────
const STICK_RADIUS = 55;
const STICK_THROTTLE_MS = 16;

function createStick(zone, stickId) {
  const thumb = $(".stick-thumb", zone);
  let pid = null;
  let ox = 0, oy = 0;
  let lastSend = 0;

  const setThumb = (dx, dy, animate) => {
    thumb.style.transition = animate ? "" : "none"; // "" → vuelve a la transición del CSS
    thumb.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
  };

  zone.addEventListener("pointerdown", (e) => {
    if (pid !== null) return;
    e.preventDefault();
    pid = e.pointerId;
    claimed.add(pid);
    try { zone.setPointerCapture(pid); } catch { /* no-op */ }
    // Modo flotante: el centro lógico se recalibra donde apoyas el dedo
    ox = e.clientX;
    oy = e.clientY;
    zone.classList.add("active");
    setThumb(0, 0, false);
    lastSend = 0;
  });

  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pid) return;
    e.preventDefault();
    let dx = e.clientX - ox;
    let dy = e.clientY - oy;
    const dist = Math.hypot(dx, dy);
    if (dist > STICK_RADIUS) {
      dx = (dx / dist) * STICK_RADIUS;
      dy = (dy / dist) * STICK_RADIUS;
    }
    setThumb(dx, dy, false);
    const now = performance.now();
    if (now - lastSend >= STICK_THROTTLE_MS) {
      lastSend = now;
      // crudo [-1,1]: la deadzone/histéresis viven en el stick-engine del server
      send({ t: "stick", s: stickId, x: dx / STICK_RADIUS, y: dy / STICK_RADIUS });
    }
  });

  const end = (e) => {
    if (e.pointerId !== pid) return;
    claimed.delete(pid);
    pid = null;
    zone.classList.remove("active");
    setThumb(0, 0, true); // snap-back animado (cubic-bezier con micro-overshoot)
    send({ t: "stick", s: stickId, x: 0, y: 0 }); // CERO inmediato, sin throttle
  };
  zone.addEventListener("pointerup", end);
  zone.addEventListener("pointercancel", end);
}

// ─── D-pad unificado (1 superficie, 8 sectores de 45°, rolling) ─────────────
const DPAD_DEADZONE_PX = 14;
const DPAD_SECTORS = [
  ["right"], ["right", "down"], ["down"], ["down", "left"],
  ["left"], ["left", "up"], ["up"], ["up", "right"],
];

function createDpad(surface) {
  const btns = {};
  $$(".dpad-btn", surface).forEach((b) => { btns[b.dataset.dir] = b; });

  let pid = null;
  let rect = null;
  const held = new Set();

  const dirsAt = (x, y) => {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    if (Math.hypot(dx, dy) < DPAD_DEADZONE_PX) return [];
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI; // 0° = derecha
    const sector = ((Math.round(ang / 45) % 8) + 8) % 8;
    return DPAD_SECTORS[sector];
  };

  const apply = (wantArr) => {
    const want = new Set(wantArr);
    let changed = false;
    for (const dir of Array.from(held)) {
      if (!want.has(dir)) {
        held.delete(dir);
        btns[dir].classList.remove("pressed");
        send({ t: "btn", k: `dpad_${dir}`, d: false });
        changed = true;
      }
    }
    for (const dir of want) {
      if (!held.has(dir)) {
        held.add(dir);
        btns[dir].classList.add("pressed");
        send({ t: "btn", k: `dpad_${dir}`, d: true });
        changed = true;
      }
    }
    if (changed && held.size) haptic("light");
  };

  surface.addEventListener("pointerdown", (e) => {
    if (pid !== null) return;
    e.preventDefault();
    pid = e.pointerId;
    claimed.add(pid);
    try { surface.setPointerCapture(pid); } catch { /* no-op */ }
    rect = surface.getBoundingClientRect();
    apply(dirsAt(e.clientX, e.clientY));
  });

  surface.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pid) return;
    e.preventDefault();
    apply(dirsAt(e.clientX, e.clientY)); // rolling sin levantar el dedo
  });

  const end = (e) => {
    if (e.pointerId !== pid) return;
    apply([]);
    claimed.delete(pid);
    pid = null;
  };
  surface.addEventListener("pointerup", end);
  surface.addEventListener("pointercancel", end);
}

// ─── Hair triggers (barras SL/L/ZL · SR/R/ZR) ───────────────────────────────
// Superficie única por barra con hit-testing por frames cacheados: un dedo que
// ENTRA deslizando activa el segmento, y se puede rodar L↔ZL sin levantar.
const triggerSegs = $$(".tseg", elPad).map((el) => ({
  el,
  key: el.dataset.tkey,
  rect: null,
  count: 0,
}));
const triggerPointers = new Map(); // pointerId → seg | null

function cacheTriggerRects() {
  for (const seg of triggerSegs) {
    const r = seg.el.getBoundingClientRect();
    if (!r.width) { seg.rect = null; continue; }
    // slop vertical generoso (los pulgares llegan desde abajo)
    seg.rect = { left: r.left - 3, right: r.right + 3, top: r.top - 14, bottom: r.bottom + 14 };
  }
}

function segAt(x, y) {
  for (const seg of triggerSegs) {
    const r = seg.rect;
    if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return seg;
  }
  return null;
}

function triggerPress(seg) {
  seg.count++;
  if (seg.count === 1) {
    seg.el.classList.add("pressed");
    send({ t: "btn", k: seg.key, d: true });
    haptic(seg.key === "zl" || seg.key === "zr" ? "heavy" : "light");
  }
}

function triggerRelease(seg) {
  seg.count = Math.max(0, seg.count - 1);
  if (seg.count === 0) {
    seg.el.classList.remove("pressed");
    send({ t: "btn", k: seg.key, d: false });
  }
}

function triggerTrackMove(e) {
  const prev = triggerPointers.get(e.pointerId);
  const seg = segAt(e.clientX, e.clientY);
  if (seg === prev) return;
  if (prev) triggerRelease(prev);
  if (seg) triggerPress(seg);
  triggerPointers.set(e.pointerId, seg);
}

document.addEventListener("pointerdown", (e) => {
  if (!padVisible() || settingsOpen()) return;
  if (claimed.has(e.pointerId)) return;
  const seg = segAt(e.clientX, e.clientY);
  triggerPointers.set(e.pointerId, seg);
  if (seg) triggerPress(seg);
});

document.addEventListener("pointermove", (e) => {
  if (claimed.has(e.pointerId)) {
    // un control con superficie propia es dueño de este dedo
    const prev = triggerPointers.get(e.pointerId);
    if (prev) triggerRelease(prev);
    triggerPointers.delete(e.pointerId);
    return;
  }
  if (triggerPointers.has(e.pointerId)) {
    triggerTrackMove(e);
    return;
  }
  // dedo liberado por un botón (slide-off): adoptarlo si sigue apoyado
  if (!padVisible() || settingsOpen()) return;
  if (e.pointerType === "touch" || e.buttons) {
    const seg = segAt(e.clientX, e.clientY);
    triggerPointers.set(e.pointerId, seg);
    if (seg) triggerPress(seg);
  }
});

function triggerTrackEnd(e) {
  const prev = triggerPointers.get(e.pointerId);
  if (prev) triggerRelease(prev);
  triggerPointers.delete(e.pointerId);
  claimed.delete(e.pointerId); // limpieza defensiva global
}
document.addEventListener("pointerup", triggerTrackEnd);
document.addEventListener("pointercancel", triggerTrackEnd);

function releaseAllTriggers() {
  for (const seg of triggerSegs) {
    if (seg.count > 0) {
      seg.count = 0;
      seg.el.classList.remove("pressed");
      send({ t: "btn", k: seg.key, d: false });
    }
  }
  triggerPointers.clear();
}

// ─── Motion (GIRO → DSU vía server) ─────────────────────────────────────────
// Marco DEVICE estilo CoreMotion: plano boca arriba ⇒ az ≈ -1g. Safari da
// z ≈ +9.81 en accelerationIncludingGravity → dividir los 3 ejes entre
// -9.80665. rotationRate ya viene en °/s: gx=beta(X), gy=gamma(Y), gz=alpha(Z).
const G_TO_CM = -9.80665;
const MOTION_MIN_INTERVAL_MS = 14; // ~70Hz máx (margen bajo el rate limit)

let motionHandler = null;
let lastMotionTs = 0;
const motionDebug = { ax: null, ay: null, az: null };

function onDeviceMotion(e) {
  const now = performance.now();
  if (now - lastMotionTs < MOTION_MIN_INTERVAL_MS) return;
  lastMotionTs = now;
  const acc = e.accelerationIncludingGravity;
  if (!acc) return;
  const rot = e.rotationRate;
  const ax = (acc.x || 0) / G_TO_CM;
  const ay = (acc.y || 0) / G_TO_CM;
  const az = (acc.z || 0) / G_TO_CM;
  const gx = (rot && rot.beta) || 0;
  const gy = (rot && rot.gamma) || 0;
  const gz = (rot && rot.alpha) || 0;
  motionDebug.ax = ax;
  motionDebug.ay = ay;
  motionDebug.az = az;
  send({ t: "motion", gx, gy, gz, ax, ay, az, ts: Math.round(now * 1000) });
}

function stopMotion() {
  if (motionHandler) {
    window.removeEventListener("devicemotion", motionHandler);
    motionHandler = null;
  }
  state.motionOn = false;
  motionDebug.ax = motionDebug.ay = motionDebug.az = null;
  elBtnMotion.classList.remove("on");
}

async function toggleMotion() {
  haptic("light");
  if (state.motionOn) {
    stopMotion();
    sendConfig();
    return;
  }
  // iOS exige pedir permiso dentro de un gesto del usuario
  try {
    if (typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function") {
      const res = await DeviceMotionEvent.requestPermission();
      if (res !== "granted") {
        flashBanner("Permiso de movimiento denegado — actívalo en Ajustes de Safari");
        return;
      }
    }
  } catch {
    flashBanner("No se pudo pedir el permiso de movimiento");
    return;
  }
  state.motionOn = true;
  motionHandler = onDeviceMotion;
  window.addEventListener("devicemotion", motionHandler);
  elBtnMotion.classList.add("on");
  sendConfig();
}

elBtnMotion.addEventListener("click", toggleMotion);

// ─── Orientación ────────────────────────────────────────────────────────────
function computeOrientation() {
  const type = (screen.orientation && screen.orientation.type) || "";
  if (type === "landscape-primary") return "landscape-right";
  if (type === "landscape-secondary") return "landscape-left";
  if (window.orientation === 90) return "landscape-right";
  if (window.orientation === -90) return "landscape-left";
  return "landscape-right";
}

function checkRotateHint() {
  const portrait = window.innerHeight > window.innerWidth;
  elRotate.hidden = !(padVisible() && portrait);
}

function onOrientationOrResize() {
  const prev = state.orientation;
  state.orientation = computeOrientation();
  checkRotateHint();
  requestAnimationFrame(cacheTriggerRects);
  if (prev !== state.orientation) sendConfig();
}
window.addEventListener("resize", onOrientationOrResize);
window.addEventListener("orientationchange", () => setTimeout(onOrientationOrResize, 120));
if (screen.orientation && typeof screen.orientation.addEventListener === "function") {
  screen.orientation.addEventListener("change", () => setTimeout(onOrientationOrResize, 120));
}

// ─── Wake lock ──────────────────────────────────────────────────────────────
let wakeLock = null;
async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request("screen"); } catch { /* no-op */ }
}
function releaseWakeLock() {
  try { wakeLock && wakeLock.release(); } catch { /* no-op */ }
  wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if (padVisible()) requestWakeLock();
    requestAnimationFrame(cacheTriggerRects);
  }
});

// ─── Picker: tarjetas + /status cada 3s ─────────────────────────────────────
let statusTimer = null;

function updateCardNames() {
  for (const n of [1, 2]) {
    $(`[data-card-name="${n}"]`).textContent = settings.names[n];
  }
}

function updateCards(data) {
  for (const n of [1, 2]) {
    const dot = $(`[data-card-dot="${n}"]`);
    const txt = $(`[data-card-status="${n}"]`);
    const p = data && data.players && data.players[n];
    if (!p) {
      dot.className = "dot";
      txt.textContent = data === null ? "Servidor no responde" : "…";
      continue;
    }
    if (p.connected) {
      dot.className = "dot busy";
      txt.textContent = p.name ? `Ocupado · ${p.name}` : "Ocupado";
    } else {
      dot.className = "dot free";
      txt.textContent = "Libre";
    }
  }
}

async function pollStatus() {
  try {
    const res = await fetch("/status", { cache: "no-store" });
    if (!res.ok) throw new Error("status " + res.status);
    updateCards(await res.json());
  } catch {
    updateCards(null);
  }
}

function startStatusPoll() {
  stopStatusPoll();
  pollStatus();
  statusTimer = setInterval(pollStatus, 3000);
}
function stopStatusPoll() {
  clearInterval(statusTimer);
  statusTimer = null;
}

function markLastCard() {
  $$(".card", elPicker).forEach((card) => {
    card.classList.toggle("last", Number(card.dataset.player) === settings.player);
  });
}

// ─── Navegación de pantallas ────────────────────────────────────────────────
function showPicker() {
  wsClose();
  stopMotion();
  releaseAllTriggers();
  releaseWakeLock();
  state.player = null;
  elPad.hidden = true;
  elPicker.hidden = false;
  elPad.removeAttribute("data-player");
  updateCardNames();
  markLastCard();
  startStatusPoll();
  checkRotateHint();
}

function showPad(player) {
  state.player = player;
  settings.player = player;
  saveSettings();
  stopStatusPoll();

  elPicker.hidden = true;
  elPad.hidden = false;
  elPad.dataset.player = String(player);

  elPillName.textContent = settings.names[player];
  $$(".led", elPad).forEach((led) => {
    const on = Number(led.dataset.led) === player;
    led.classList.toggle("on", on);
    led.classList.toggle("blink", on); // parpadea hasta conectar
  });

  applyFaceLayout();
  updateLatency();
  updateBanner();
  checkRotateHint();
  requestAnimationFrame(cacheTriggerRects);

  shouldReconnect = true;
  setWsStatus("connecting");
  wsConnect();
  requestWakeLock();
}

$$(".card", elPicker).forEach((card) => {
  card.addEventListener("click", () => {
    haptic("medium");
    showPad(Number(card.dataset.player));
  });
});

$("#btn-back").addEventListener("click", () => {
  haptic("light");
  showPicker();
});

// ─── Settings (modal) ───────────────────────────────────────────────────────
const sliders = {};

function createSlider(rootId, { min, max, value, decimals = 2, onInput, onChange }) {
  const root = $(rootId);
  const track = $(".slider-track", root);
  const fill = $(".slider-fill", root);
  const thumbEl = $(".slider-thumb", root);
  let pid = null;
  let rect = null;
  let val = value;

  const render = () => {
    const p = clamp((val - min) / (max - min), 0, 1);
    fill.style.width = `${p * 100}%`;
    thumbEl.style.left = `${p * 100}%`;
  };

  const valueFromX = (x) => {
    const p = clamp((x - rect.left) / rect.width, 0, 1);
    return min + p * (max - min);
  };

  root.addEventListener("pointerdown", (e) => {
    if (pid !== null) return;
    e.preventDefault();
    pid = e.pointerId;
    try { root.setPointerCapture(pid); } catch { /* no-op */ }
    rect = track.getBoundingClientRect();
    val = onInput(valueFromX(e.clientX));
    render();
  });
  root.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pid) return;
    e.preventDefault();
    val = onInput(valueFromX(e.clientX));
    render();
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    onChange(val);
  };
  root.addEventListener("pointerup", end);
  root.addEventListener("pointercancel", end);

  render();
  return {
    set(v) { val = clamp(v, min, max); render(); },
    get() { return val; },
  };
}

const round2 = (v) => Math.round(v * 100) / 100;
const elEngageValue = $("#engage-value");
const elReleaseValue = $("#release-value");

function syncSliderLabels() {
  elEngageValue.textContent = settings.engage.toFixed(2);
  elReleaseValue.textContent = settings.release.toFixed(2);
}

function buildSliders() {
  sliders.engage = createSlider("#slider-engage", {
    min: 0.3,
    max: 0.9,
    value: settings.engage,
    onInput: (v) => {
      settings.engage = round2(clamp(v, 0.3, 0.9));
      // liberación SIEMPRE por debajo de la activación
      if (settings.release > settings.engage - 0.05) {
        settings.release = round2(settings.engage - 0.05);
        sliders.release.set(settings.release);
      }
      syncSliderLabels();
      return settings.engage;
    },
    onChange: () => { saveSettings(); sendConfig(); haptic("light"); },
  });

  sliders.release = createSlider("#slider-release", {
    min: 0.1,
    max: 0.85,
    value: settings.release,
    onInput: (v) => {
      settings.release = round2(clamp(v, 0.1, settings.engage - 0.05));
      syncSliderLabels();
      return settings.release;
    },
    onChange: () => { saveSettings(); sendConfig(); haptic("light"); },
  });
  syncSliderLabels();
}

function buildThemeGrid() {
  const grid = $("#theme-grid");
  grid.textContent = "";
  for (const [id, t] of Object.entries(THEMES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-swatch" + (id === settings.theme ? " selected" : "");
    btn.dataset.theme = id;

    const pair = document.createElement("span");
    pair.className = "swatch-pair";
    const half1 = document.createElement("span");
    half1.className = "swatch-half sl";
    half1.style.background = `linear-gradient(135deg, ${t.L[0]}, ${t.L[1]} 55%, ${t.L[2]})`;
    const half2 = document.createElement("span");
    half2.className = "swatch-half sr";
    half2.style.background = `linear-gradient(225deg, ${t.R[0]}, ${t.R[1]} 55%, ${t.R[2]})`;
    pair.append(half1, half2);

    const label = document.createElement("span");
    label.className = "swatch-label";
    label.textContent = t.label;

    btn.append(pair, label);
    btn.addEventListener("click", () => {
      settings.theme = id;
      applyTheme(id);
      saveSettings();
      sendConfig();
      haptic("light");
      $$(".theme-swatch", grid).forEach((b) => b.classList.toggle("selected", b === btn));
    });
    grid.appendChild(btn);
  }
}

function bindNames() {
  for (const n of [1, 2]) {
    const input = $(`#name-${n}`);
    input.value = settings.names[n];
    input.addEventListener("input", () => {
      settings.names[n] = input.value.slice(0, 14);
      if (state.player === n) {
        elPillName.textContent = settings.names[n] || `Chocorramito ${n}`;
      }
      updateCardNames();
    });
    input.addEventListener("change", () => {
      if (!settings.names[n].trim()) {
        settings.names[n] = `Chocorramito ${n}`;
        input.value = settings.names[n];
      }
      if (state.player === n) elPillName.textContent = settings.names[n];
      updateCardNames();
      saveSettings();
      sendConfig();
    });
  }
}

function bindSwap() {
  const toggle = $("#swap-toggle");
  const render = () => {
    toggle.classList.toggle("on", settings.swapAB);
    toggle.setAttribute("aria-checked", settings.swapAB ? "true" : "false");
  };
  render();
  toggle.addEventListener("click", () => {
    settings.swapAB = !settings.swapAB;
    render();
    applyFaceLayout();
    saveSettings();
    haptic("medium");
  });
}

function bindHapticSeg() {
  const seg = $("#haptic-seg");
  const render = () => {
    $$(".seg-btn", seg).forEach((b) =>
      b.classList.toggle("selected", b.dataset.haptic === settings.haptics));
  };
  render();
  $$(".seg-btn", seg).forEach((btn) => {
    btn.addEventListener("click", () => {
      settings.haptics = btn.dataset.haptic;
      setHapticMode(settings.haptics);
      saveSettings();
      render();
      haptic("medium"); // preview del nivel elegido
    });
  });
}

// Fila de debug del giro (ax/ay/az en vivo para calibración física)
let motionDebugTimer = null;
function startMotionDebug() {
  stopMotionDebug();
  const ax = $("#dbg-ax"), ay = $("#dbg-ay"), az = $("#dbg-az");
  const tick = () => {
    const fmt = (v) => (v == null ? "—" : v.toFixed(2));
    ax.textContent = fmt(motionDebug.ax);
    ay.textContent = fmt(motionDebug.ay);
    az.textContent = fmt(motionDebug.az);
  };
  tick();
  motionDebugTimer = setInterval(tick, 150);
}
function stopMotionDebug() {
  clearInterval(motionDebugTimer);
  motionDebugTimer = null;
}

function openSettings() {
  haptic("light");
  elSettings.hidden = false;
  startMotionDebug();
}
function closeSettings() {
  elSettings.hidden = true;
  stopMotionDebug();
  requestAnimationFrame(cacheTriggerRects);
}

$("#btn-settings").addEventListener("click", openSettings);
$("#picker-settings").addEventListener("click", openSettings);
$("#settings-close").addEventListener("click", () => { haptic("light"); closeSettings(); });
$("#settings-backdrop").addEventListener("click", closeSettings);

// ─── Prevención de gestos iOS ───────────────────────────────────────────────
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("touchmove", (e) => {
  // permitir scroll y escritura dentro del panel de ajustes
  if (e.target && e.target.closest && e.target.closest(".sheet")) return;
  e.preventDefault();
}, { passive: false });
document.addEventListener("contextmenu", (e) => e.preventDefault());
// doble-tap zoom defensivo (algunos iOS lo disparan igual)
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 320 && !(e.target && e.target.closest && e.target.closest(".sheet"))) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });

// ─── Init ───────────────────────────────────────────────────────────────────
function init() {
  applyTheme(settings.theme);
  initHaptics(settings.haptics);

  // pad
  createStick($("#stick-l"), "L");
  createStick($("#stick-r"), "R");
  createDpad($("#dpad"));
  $$(".face-btn", elPad).forEach((el) => bindPressButton(el, { level: "medium" }));
  $$(".sym-btn", elPad).forEach((el) => bindPressButton(el, { level: "light" }));
  applyFaceLayout();

  // settings
  buildThemeGrid();
  buildSliders();
  bindNames();
  bindSwap();
  bindHapticSeg();

  state.orientation = computeOrientation();
  updateCardNames();
  markLastCard();

  // arranque: directo al último slot usado, o al picker
  if (settings.player === 1 || settings.player === 2) {
    showPad(settings.player);
  } else {
    showPicker();
  }
}

init();
