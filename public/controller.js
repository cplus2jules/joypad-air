// El Control Super Pro Max — cliente PWA (Safari iOS 17+, vanilla JS, sin deps).
//
// Protocolo WS (el server hace la conversión stick→8 direcciones, SOCD, etc.):
//   → {t:'btn',k,d} · {t:'stick',s,x,y} crudos [-1,1] · {t:'config',...}
//   → {t:'ping',ts,rtt} cada 2s · {t:'motion',gx,gy,gz,ax,ay,az,ts} ~60Hz
//   ← {t:'hello'} · {t:'pong'} · {t:'focus'} · {t:'slots'} · {t:'accessibility'}

import { t, initLanguage, onLanguageChange } from "./i18n.js";
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
  names: { 1: "", 2: "" },
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
    let legacy;
    try { legacy = Number(localStorage.getItem(LEGACY_PLAYER_KEY)); } catch { /* Storage disabled. */ }
    s.player = legacy === 1 || legacy === 2 ? legacy : null;
  }
  for (const n of [1, 2]) {
    if (typeof s.names[n] !== "string" || !s.names[n].trim()) s.names[n] = "";
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
  nativeOk: true,          // false ⇒ nut-js no cargó en el Mac (modo log)
  orientation: "landscape-right",
  ryujinx: null,
};

// Pointers reclamados por un control con superficie propia (stick, d-pad,
// botones): el tracker global de hair-triggers los ignora.
const claimed = new Set();

// Resets duros de controles con estado interno propio (sticks, d-pad).
// Cada control registra aquí su limpieza para resetLocalControls().
const controlResets = [];

// ─── DOM ────────────────────────────────────────────────────────────────────
const elPicker = $("#picker");
const elPickerToast = $("#picker-toast");
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
  elReconnect.hidden = !(padVisible() && ["connecting", "reconnecting"].includes(status));
  $("#pad-connection").textContent = t(status === "open" ? "pad.connectedMac" : "pad.connectingMac");
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
    // El server hizo releaseAllForPlayer cuando cayó el WS anterior: nada
    // sigue presionado del lado del Mac. Se resetea el estado local para
    // que la UI no muestre botones/sticks retenidos que ya no existen.
    resetLocalControls();
  });

  socket.addEventListener("message", (ev) => {
    if (socket !== ws) return;
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg && typeof msg.t === "string") handleServerMessage(msg);
  });

  socket.addEventListener("close", (e) => {
    if (socket !== ws) return;
    ws = null;
    stopPing();
    if (e.code === 4000) {
      // Otro dispositivo tomó el slot: NO reconectar (si no, dos teléfonos
      // con el mismo slot guardado se expulsan mutuamente en ping-pong
      // infinito). De vuelta al picker, con aviso visible.
      shouldReconnect = false;
      showPicker();
      showPickerToast("takeover");
      return;
    }
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
      state.ryujinx = msg.ryujinx ?? null;
      // native:false ⇒ las teclas se imprimen en consola y no llegan a
      // Ryujinx (también con FORCE_LOG=1, donde el aviso es igual de cierto)
      state.nativeOk = msg.native !== false;
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
    case "ryujinx":
      state.ryujinx = msg.state;
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
    name: settings.names[state.player] || `Player ${state.player}`,
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
let bannerFlashKey = null;

function bannerMessage() {
  // Prioridad: accesibilidad > teclado nativo > foco
  if (state.accessibilityOk === false) {
    return t("accessBanner");
  }
  if (state.nativeOk === false) {
    return t("nativeBanner");
  }
  if (state.ryujinx?.synced === false) {
    return t("pad.profileHelp");
  }
  if (state.focusOk === false) {
    return t("focusBanner");
  }
  return null;
}

function updateBanner() {
  requestAnimationFrame(cacheTriggerRects);
  if (bannerFlashTimer) return; // un flash temporal tiene prioridad
  const msg = bannerMessage();
  $("#pad-connection").textContent = t(state.wsStatus !== "open" ? "pad.connectingMac" : msg ? "pad.needsSetup" : "pad.inputReady");
  if (msg) {
    elBanner.textContent = msg;
    elBanner.classList.add("show");
  } else {
    elBanner.classList.remove("show");
  }
}

function flashBanner(key, ms = 3000) {
  bannerFlashKey = key;
  clearTimeout(bannerFlashTimer);
  elBanner.textContent = t(key);
  elBanner.classList.add("show");
  requestAnimationFrame(cacheTriggerRects);
  bannerFlashTimer = setTimeout(() => {
    bannerFlashTimer = null;
    bannerFlashKey = null;
    updateBanner();
  }, ms);
}

// ─── Botones de presión (ABXY, − + ⌂ captura) ──────────────────────────────
function bindPressButton(el, { level = "medium", getKey } = {}) {
  let pid = null;
  const key = getKey || (() => el.dataset.key);

  const press = (e) => {
    if (!padVisible() || settingsOpen() || state.wsStatus !== "open" || pid !== null) return;
    e.preventDefault();
    pid = e.pointerId;
    claimed.add(pid);
    try { el.setPointerCapture(pid); } catch { /* no-op */ }
    // Liberar la captura (también la IMPLÍCITA que iOS da al touch): con
    // captura activa los boundary events NO disparan, así que pointerleave
    // nunca llegaba → el botón quedaba retenido al deslizar fuera y la
    // adopción del dedo por los hair-triggers era inalcanzable. Sin captura,
    // pointerup con el dedo dentro sigue llegando al botón (target normal).
    try { el.releasePointerCapture(e.pointerId); } catch { /* no-op */ }
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

  el.addEventListener("keydown", (e) => {
    if (![" ", "Enter"].includes(e.key) || e.repeat) return;
    press({ preventDefault: () => e.preventDefault(), pointerId: -1 });
  });
  el.addEventListener("keyup", (e) => { if ([" ", "Enter"].includes(e.key)) { e.preventDefault(); release(); } });
  el.addEventListener("blur", release);
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
  let trailTimer = null; // trailing-edge del throttle (último move descartado)

  const cancelTrail = () => {
    if (trailTimer !== null) { clearTimeout(trailTimer); trailTimer = null; }
  };

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
    cancelTrail(); // defensivo (un reset pudo soltar el pid sin pasar por end)
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
      cancelTrail(); // cualquier valor pendiente queda superado por este
      // crudo [-1,1]: la deadzone/histéresis viven en el stick-engine del server
      send({ t: "stick", s: stickId, x: dx / STICK_RADIUS, y: dy / STICK_RADIUS });
    } else {
      // Trailing-edge: si este move descartado resulta ser el ÚLTIMO (el dedo
      // se queda quieto), el server retendría un valor hasta 16ms viejo (puede
      // quedar bajo el engage con el knob visualmente pasado). Se programa su
      // emisión al expirar el throttle, cancelando la pendiente anterior.
      const x = dx / STICK_RADIUS;
      const y = dy / STICK_RADIUS;
      cancelTrail();
      trailTimer = setTimeout(() => {
        trailTimer = null;
        lastSend = performance.now();
        send({ t: "stick", s: stickId, x, y });
      }, STICK_THROTTLE_MS - (now - lastSend));
    }
  });

  const end = (e) => {
    if (e.pointerId !== pid) return;
    claimed.delete(pid);
    pid = null;
    zone.classList.remove("active");
    setThumb(0, 0, true); // snap-back animado (cubic-bezier con micro-overshoot)
    cancelTrail(); // que el trailing pendiente no pise el cero
    send({ t: "stick", s: stickId, x: 0, y: 0 }); // CERO inmediato, sin throttle
  };
  zone.addEventListener("pointerup", end);
  zone.addEventListener("pointercancel", end);

  // Reset duro (reconexión): snap-back visual y se suelta el pointer activo
  // SIN mandar nada — el server ya soltó todo. El usuario re-presiona.
  controlResets.push(() => {
    cancelTrail(); // un trailing pendiente mandaría un valor viejo al server limpio
    if (pid !== null) { claimed.delete(pid); pid = null; }
    zone.classList.remove("active");
    setThumb(0, 0, true);
  });
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

  // Reset duro (reconexión): limpia held + visual SIN mandar nada — el
  // server ya soltó todo del lado del Mac.
  controlResets.push(() => {
    for (const dir of held) btns[dir].classList.remove("pressed");
    held.clear();
    if (pid !== null) { claimed.delete(pid); pid = null; }
  });
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

for (const seg of triggerSegs) {
  let keyHeld = false;
  seg.el.addEventListener("keydown", e => {
    if (!["Enter", " "].includes(e.key) || e.repeat || settingsOpen()) return;
    e.preventDefault(); keyHeld = true; triggerPress(seg);
  });
  const release = () => { if (keyHeld) { keyHeld = false; triggerRelease(seg); } };
  seg.el.addEventListener("keyup", e => { if (["Enter", " "].includes(e.key)) { e.preventDefault(); release(); } });
  seg.el.addEventListener("blur", release);
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

// Release total del estado local tras (re)conectar: el server suelta todas
// las teclas del slot en cada caída (releaseAllForPlayer), así que aquí solo
// hay que poner la UI y el tracking en cero para que sean coherentes. Los
// d:false que emiten releaseAllTriggers/_forceRelease son inofensivos (el
// server ignora releases de teclas no presionadas).
function resetLocalControls() {
  // Neutralize the server too: settings/blur may happen while the socket stays open.
  for (const stick of ["L", "R"]) send({ t: "stick", s: stick, x: 0, y: 0 });
  for (const dir of ["up", "down", "left", "right"]) send({ t: "btn", k: `dpad_${dir}`, d: false });
  releaseAllTriggers();
  $$(".face-btn, .sym-btn", elPad).forEach((el) => {
    if (typeof el._forceRelease === "function") el._forceRelease();
  });
  for (const reset of controlResets) reset();
  claimed.clear(); // pointers huérfanos: los hair-triggers podrán adoptarlos
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
  // iOS BLOQUEA los sensores de movimiento en páginas http (contexto no
  // seguro): requestPermission ni existe y devicemotion jamás dispara.
  // Antes el botón se encendía y no pasaba nada — mejor decir la verdad.
  if (!window.isSecureContext) {
    flashBanner("gyroHttp");
    return;
  }
  // iOS exige pedir permiso dentro de un gesto del usuario
  try {
    if (typeof DeviceMotionEvent !== "undefined" &&
        typeof DeviceMotionEvent.requestPermission === "function") {
      const res = await DeviceMotionEvent.requestPermission();
      if (res !== "granted") {
        flashBanner("gyroDenied");
        return;
      }
    }
  } catch {
    flashBanner("gyroError");
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
  const needsLandscape = window.innerWidth <= 600 || matchMedia("(pointer: coarse)").matches;
  elRotate.hidden = !(padVisible() && portrait && needsLandscape);
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
let lastCardStatus;

function updateCardNames() {
  for (const n of [1, 2]) {
    $(`[data-card-name="${n}"]`).textContent = settings.names[n] || t("player", { n });
  }
}

function updateCards(data) {
  const ready = data?.ryujinx?.synced && data.native && data.accessibility === true;
  $("#lobby-status").textContent = t(!data ? "lobby.offline" : ready ? "lobby.ready" : "lobby.needsSetup");
  $("#lobby-dot").className = `dot ${data ? ready ? "free" : "busy" : ""}`;
  lastCardStatus = data;
  for (const n of [1, 2]) {
    const dot = $(`[data-card-dot="${n}"]`);
    const txt = $(`[data-card-status="${n}"]`);
    const p = data && data.players && data.players[n];
    if (!p) {
      dot.className = "dot";
      txt.textContent = t(data === null ? "serverOffline" : "searching");
      continue;
    }
    if (p.connected) {
      dot.className = "dot busy";
      txt.textContent = p.name ? t("occupiedBy", { name: p.name }) : t("occupied");
    } else {
      dot.className = "dot free";
      txt.textContent = t("available");
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

// Toast del picker (aviso temporal — p. ej. «Another controller took this player slot. Choose a free player.»)
let pickerToastTimer = null;
let pickerToastKey = null;
function showPickerToast(key, ms = 4000) {
  pickerToastKey = key;
  elPickerToast.textContent = t(key);
  elPickerToast.classList.add("show");
  clearTimeout(pickerToastTimer);
  pickerToastTimer = setTimeout(() => elPickerToast.classList.remove("show"), ms);
}

function markLastCard() {
  $$(".card", elPicker).forEach((card) => {
    card.classList.toggle("last", Number(card.dataset.player) === settings.player);
  });
}

// ─── Navegación de pantallas ────────────────────────────────────────────────
function showPicker() {
  resetLocalControls();
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
  startStatusPoll();

  elPicker.hidden = true;
  elPad.hidden = false;
  elPad.dataset.player = String(player);

  elPillName.textContent = settings.names[player] || t("player", { n: player });
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

$("#rotate-back").addEventListener("click", showPicker);

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

  root.tabIndex = 0;
  root.setAttribute("role", "slider");
  const labelKey = rootId.includes("engage") ? "aria.engage" : "aria.release";
  root.dataset.i18nAriaLabel = labelKey;
  root.setAttribute("aria-label", t(labelKey));
  root.setAttribute("aria-valuemin", min);
  root.setAttribute("aria-valuemax", max);
  root.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? min : e.key === "End" ? max : val + (["ArrowRight", "ArrowUp"].includes(e.key) ? .05 : -.05);
    val = onInput(clamp(next, min, max)); render(); onChange(val);
  });
  const render = () => {
    root.setAttribute("aria-valuenow", val.toFixed(decimals));
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
  for (const [id, theme] of Object.entries(THEMES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-swatch" + (id === settings.theme ? " selected" : "");
    btn.dataset.theme = id;
    btn.setAttribute("aria-pressed", String(id === settings.theme));

    const pair = document.createElement("span");
    pair.className = "swatch-pair";
    const half1 = document.createElement("span");
    half1.className = "swatch-half sl";
    half1.style.background = `linear-gradient(135deg, ${theme.L[0]}, ${theme.L[1]} 55%, ${theme.L[2]})`;
    const half2 = document.createElement("span");
    half2.className = "swatch-half sr";
    half2.style.background = `linear-gradient(225deg, ${theme.R[0]}, ${theme.R[1]} 55%, ${theme.R[2]})`;
    pair.append(half1, half2);

    const label = document.createElement("span");
    label.className = "swatch-label";
    label.dataset.i18n = `theme.${id}`;
    label.textContent = t(`theme.${id}`);

    btn.append(pair, label);
    btn.addEventListener("click", () => {
      settings.theme = id;
      applyTheme(id);
      saveSettings();
      sendConfig();
      haptic("light");
      $$(".theme-swatch", grid).forEach((b) => (b.classList.toggle("selected", b === btn), b.setAttribute("aria-pressed", String(b === btn))));
    });
    grid.appendChild(btn);
  }
}

function bindNames() {
  for (const n of [1, 2]) {
    const input = $(`#name-${n}`);
    input.value = settings.names[n];
    input.placeholder = t("player", { n });
    input.addEventListener("input", () => {
      settings.names[n] = input.value.slice(0, 14);
      if (state.player === n) {
        elPillName.textContent = settings.names[n] || t("player", { n });
      }
      updateCardNames();
      saveSettings();
      sendConfig();
    });
    input.addEventListener("change", () => {
      if (!settings.names[n].trim()) {
        settings.names[n] = "";
        input.value = settings.names[n];
        input.placeholder = t("player", { n });
      }
      if (state.player === n) elPillName.textContent = settings.names[n] || t("player", { n });
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

let settingsReturnFocus = null;
function openSettings() {
  settingsReturnFocus = document.activeElement;
  resetLocalControls();
  elPad.inert = true;
  elPicker.inert = true;
  haptic("light");
  elSettings.hidden = false;
  $("#settings-close").focus();
  startMotionDebug();
}
function closeSettings() {
  elSettings.hidden = true;
  elPad.inert = false;
  elPicker.inert = false;
  settingsReturnFocus?.focus();
  stopMotionDebug();
  requestAnimationFrame(cacheTriggerRects);
}

$("#btn-settings").addEventListener("click", openSettings);
$("#picker-settings").addEventListener("click", openSettings);
$("#settings-close").addEventListener("click", () => { haptic("light"); closeSettings(); });
$("#settings-backdrop").addEventListener("click", closeSettings);

document.addEventListener("keydown", (e) => {
  if (!settingsOpen()) return;
  if (e.key === "Escape") closeSettings();
  if (e.key !== "Tab") return;
  const items = $$("button, input, select, [tabindex='0']", elSettings).filter(x => !x.disabled);
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
window.addEventListener("blur", resetLocalControls);
document.addEventListener("visibilitychange", () => { if (document.hidden) resetLocalControls(); });
window.addEventListener("pagehide", () => { resetLocalControls(); wsClose(); });
window.addEventListener("pageshow", (e) => { if (e.persisted) showPicker(); });

// ─── Prevención de gestos iOS ───────────────────────────────────────────────
document.addEventListener("gesturestart", (e) => { if (padVisible() && !settingsOpen()) e.preventDefault(); });
document.addEventListener("touchmove", (e) => {
  // permitir scroll y escritura dentro del panel de ajustes
  if (!padVisible() || settingsOpen()) return;
  e.preventDefault();
}, { passive: false });
document.addEventListener("contextmenu", (e) => { if (padVisible() && !settingsOpen()) e.preventDefault(); });
// doble-tap zoom defensivo (algunos iOS lo disparan igual)
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (padVisible() && now - lastTouchEnd < 320 && !(e.target && e.target.closest && e.target.closest(".sheet"))) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });

// ─── Init ───────────────────────────────────────────────────────────────────
// Standalone = lanzada desde el icono de pantalla de inicio (sin barra de
// Safari). En una pestaña normal la barra NO se puede ocultar por código en
// iPhone — lo único que funciona es guiar a "Agregar a pantalla de inicio".
const isStandalone =
  navigator.standalone === true ||
  matchMedia("(display-mode: standalone)").matches ||
  matchMedia("(display-mode: fullscreen)").matches;

function setupFullscreenCoach() {
  const hint = document.querySelector(".picker-hint");
  if (!hint) return;
  if (isStandalone) {
    hint.hidden = true; // ya está a pantalla completa: la guía sobra
    return;
  }
  hint.textContent = t("fullscreenHint");
}

function init() {
  initLanguage();
  applyTheme(settings.theme);
  initHaptics(settings.haptics);
  setupFullscreenCoach();

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

  // Remember the preferred card, but require an explicit choice to avoid stealing a live slot.
  showPicker();
}

onLanguageChange(() => {
  updateCardNames();
  if (state.player) elPillName.textContent = settings.names[state.player] || t("player", { n: state.player });
  for (const n of [1, 2]) $(`#name-${n}`).placeholder = t("player", { n });
  updateCards(lastCardStatus);
  if (bannerFlashKey) elBanner.textContent = t(bannerFlashKey);
  else updateBanner();
  if (pickerToastKey) elPickerToast.textContent = t(pickerToastKey);
  setupFullscreenCoach();
  requestAnimationFrame(cacheTriggerRects);
});

init();
