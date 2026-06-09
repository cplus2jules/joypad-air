(() => {
  const picker = document.getElementById("picker");
  const pad = document.getElementById("pad");
  const rotateHint = document.getElementById("rotate-hint");
  const playerLabel = document.getElementById("playerLabel");
  const statusEl = document.getElementById("status");

  const STORAGE_KEY = "switchpad.player";
  let player = Number(localStorage.getItem(STORAGE_KEY)) || null;
  let ws = null;
  let reconnectTimer = null;
  let wakeLock = null;

  // ── Player selection ────────────────────────────────
  function showPicker() {
    picker.style.display = "flex";
    pad.hidden = true;
  }
  function showPad() {
    picker.style.display = "none";
    pad.hidden = false;
    playerLabel.textContent = "P" + player;
    playerLabel.className = "player-label p" + player;
    checkOrientation();
    requestWakeLock();
    connect();
  }

  document.querySelectorAll(".picker-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      player = Number(btn.dataset.player);
      localStorage.setItem(STORAGE_KEY, player);
      showPad();
    });
  });

  if (player) showPad(); else showPicker();

  // tap player label to switch
  playerLabel.addEventListener("click", () => {
    if (ws) { try { ws.close(); } catch {} }
    localStorage.removeItem(STORAGE_KEY);
    player = null;
    showPicker();
  });

  // ── Orientation ─────────────────────────────────────
  function checkOrientation() {
    if (pad.hidden) return;
    const portrait = window.innerHeight > window.innerWidth;
    rotateHint.hidden = !portrait;
  }
  window.addEventListener("resize", checkOrientation);
  window.addEventListener("orientationchange", () => setTimeout(checkOrientation, 100));

  // ── Wake lock ───────────────────────────────────────
  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try { wakeLock = await navigator.wakeLock.request("screen"); }
    catch {}
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestWakeLock();
  });

  // ── WebSocket ───────────────────────────────────────
  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = "status" + (cls ? " " + cls : "");
  }

  function connect() {
    if (!player) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/?p=${player}`;
    setStatus("conectando…");
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.addEventListener("open", () => setStatus("conectado", "ok"));
    ws.addEventListener("close", () => {
      setStatus("desconectado", "err");
      scheduleReconnect();
    });
    ws.addEventListener("error", () => {
      setStatus("error", "err");
    });
  }
  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 1500);
  }
  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  // ── Buttons ─────────────────────────────────────────
  function bindButton(el) {
    const name = el.dataset.btn;
    const down = (e) => {
      e.preventDefault();
      el.classList.add("active");
      send({ t: "btn", k: name, d: true });
    };
    const up = (e) => {
      e.preventDefault();
      el.classList.remove("active");
      send({ t: "btn", k: name, d: false });
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", (e) => {
      if (el.classList.contains("active")) up(e);
    });
  }

  document.querySelectorAll("[data-btn]").forEach((el) => {
    if (el.dataset.btn === "zl-mirror") return;
    bindButton(el);
  });

  // ── Sticks ──────────────────────────────────────────
  function bindStick(stickEl) {
    const stickId = stickEl.dataset.stick;
    const thumb = stickEl.querySelector(".stick-thumb");
    let activePointerId = null;
    let baseRect = null;
    let centerX = 0, centerY = 0, radius = 0;
    let lastSent = 0;
    let lastX = 0, lastY = 0;

    const compute = (px, py) => {
      let dx = px - centerX;
      let dy = py - centerY;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) {
        dx = (dx / dist) * radius;
        dy = (dy / dist) * radius;
      }
      thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      return { x: dx / radius, y: dy / radius };
    };

    const reset = () => {
      thumb.style.transform = "translate(-50%, -50%)";
      send({ t: "stick", s: stickId, x: 0, y: 0 });
      stickEl.classList.remove("active");
      lastX = 0; lastY = 0;
    };

    stickEl.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (activePointerId !== null) return;
      activePointerId = e.pointerId;
      stickEl.setPointerCapture(e.pointerId);
      baseRect = stickEl.getBoundingClientRect();
      centerX = baseRect.left + baseRect.width / 2;
      centerY = baseRect.top + baseRect.height / 2;
      radius = baseRect.width / 2 - 20;
      stickEl.classList.add("active");
      const v = compute(e.clientX, e.clientY);
      send({ t: "stick", s: stickId, x: v.x, y: v.y });
      lastX = v.x; lastY = v.y;
    });

    stickEl.addEventListener("pointermove", (e) => {
      if (e.pointerId !== activePointerId) return;
      e.preventDefault();
      const v = compute(e.clientX, e.clientY);
      const now = performance.now();
      // throttle: emit if >= 16ms passed OR direction crossed deadzone
      const crossed =
        Math.sign(v.x > 0.4 ? 1 : v.x < -0.4 ? -1 : 0) !==
          Math.sign(lastX > 0.4 ? 1 : lastX < -0.4 ? -1 : 0) ||
        Math.sign(v.y > 0.4 ? 1 : v.y < -0.4 ? -1 : 0) !==
          Math.sign(lastY > 0.4 ? 1 : lastY < -0.4 ? -1 : 0);
      if (crossed || now - lastSent > 16) {
        send({ t: "stick", s: stickId, x: v.x, y: v.y });
        lastSent = now;
        lastX = v.x; lastY = v.y;
      }
    });

    const end = (e) => {
      if (e.pointerId !== activePointerId) return;
      e.preventDefault();
      activePointerId = null;
      try { stickEl.releasePointerCapture(e.pointerId); } catch {}
      reset();
    };
    stickEl.addEventListener("pointerup", end);
    stickEl.addEventListener("pointercancel", end);
  }
  document.querySelectorAll(".stick").forEach(bindStick);

  // ── Prevent iOS gestures ────────────────────────────
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  document.addEventListener("contextmenu", (e) => e.preventDefault());
})();
