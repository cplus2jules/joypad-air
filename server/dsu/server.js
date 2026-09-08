// Servidor DSU/CemuHook (UDP 26760) — publica el motion de los iPhones.
//
// Ryujinx (build parcheado), Dolphin, Cemu y Citra se suscriben como clientes
// DSU: mandan RequestData en cada frame y nosotros respondemos con el último
// sample de giroscopio+acelerómetro del slot pedido (slot N = player N+1).
//
// Comportamiento del cliente de Ryujinx (verificado en Ryubing 1.3.3):
// usa un UdpClient CONECTADO a host:puerto → hay que responder al
// (addr, puerto) de origen de cada datagrama DESDE nuestro socket en 26760.
// No valida CRC entrante, pero otros emuladores sí — siempre lo calculamos.
//
// El timestamp del data response es el DEL SENSOR del iPhone (µs,
// monotónico): Ryujinx integra deltaTime entre samples para la orientación;
// usar tiempo de llegada inyectaría jitter de red en el apuntado.

import dgram from "node:dgram";
import {
  MSG,
  decodeRequest,
  encodeVersionResponse,
  encodeInfoResponse,
  encodeDataResponse,
} from "./packets.js";
import { toDsuFrame } from "./transform.js";
import { t } from "../i18n.js";

const SUBSCRIBER_TTL_MS = 2000; // Ryujinx re-pide cada frame; 2s sin pedir = fuera
const SUBSCRIBER_PURGE_MS = 10000;
const MAX_SUBSCRIBERS = 32;
const NUM_SLOTS = 4;

// Re-base de la línea de tiempo: performance.now() del teléfono arranca en
// ~0 en cada relanzamiento de la app/recarga de la PWA. El emulador integra
// deltaTime entre samples — un salto hacia atrás (o un hueco enorme tras una
// suspensión) produciría un deltaTime de horas y un latigazo de orientación.
// Publicamos nuestra propia línea monotónica por slot: deltas crudos
// razonables pasan tal cual; resets y huecos se sustituyen por un frame
// nominal.
const NOMINAL_DELTA_US = 16666;
const MAX_DELTA_US = 500000; // 0.5s
const MOTION_STALE_MS = 250;

export function createDsuServer({ port = 26760, host = "127.0.0.1", onError = () => {} } = {}) {
  // id de servidor estable durante el proceso (los clientes lo ignoran)
  const serverId = (Math.floor(Math.random() * 0xffffffff)) >>> 0;

  const socket = dgram.createSocket("udp4");
  const subscribers = new Map(); // "addr:port" → { addr, port, slots:Set|null, lastSeen }
  const slots = new Map();       // slot → { packetId, hzCount, hz, lastSample }
  let listening = false;

  function slotState(n) {
    if (!slots.has(n)) {
      slots.set(n, { packetId: 0, hzCount: 0, hz: 0, lastSample: null, lastRawTs: null, pubTs: 0, lastArrival: 0 });
    }
    return slots.get(n);
  }

  // Línea de tiempo publicada (monotónica) a partir del ts crudo del sensor.
  function rebaseTs(s, rawTs) {
    if (s.lastRawTs === null) {
      s.pubTs = Math.max(rawTs, s.pubTs + NOMINAL_DELTA_US);
    } else {
      const delta = rawTs - s.lastRawTs;
      s.pubTs += delta > 0 && delta <= MAX_DELTA_US ? delta : NOMINAL_DELTA_US;
    }
    s.lastRawTs = rawTs;
    return s.pubTs;
  }

  function sendToSubscribers(slot, data) {
    const now = Date.now();
    for (const sub of subscribers.values()) {
      if (now - sub.lastSeen > SUBSCRIBER_TTL_MS) continue;
      if (sub.all || sub.slots.has(slot)) {
        socket.send(data, sub.port, sub.addr);
      }
    }
  }

  socket.on("message", (buf, rinfo) => {
    const req = decodeRequest(buf);
    if (!req) return;

    if (req.type === MSG.VERSION) {
      socket.send(encodeVersionResponse(serverId), rinfo.port, rinfo.address);
      return;
    }

    if (req.type === MSG.INFO) {
      for (const slot of req.ports) {
        if (slot >= NUM_SLOTS) continue;
        const connected = slots.get(slot)?.lastSample != null;
        socket.send(encodeInfoResponse(serverId, slot, connected), rinfo.port, rinfo.address);
      }
      return;
    }

    if (req.type === MSG.DATA) {
      const key = `${rinfo.address}:${rinfo.port}`;
      let sub = subscribers.get(key);
      if (!sub) {
        // Tope defensivo: cada relanzamiento del emulador usa un puerto
        // efímero nuevo — sin límite, el Map crecería sin fin.
        if (subscribers.size >= MAX_SUBSCRIBERS) {
          let oldestKey = null;
          let oldestSeen = Infinity;
          for (const [k, s] of subscribers) {
            if (s.lastSeen < oldestSeen) {
              oldestSeen = s.lastSeen;
              oldestKey = k;
            }
          }
          if (oldestKey) subscribers.delete(oldestKey);
        }
        sub = { addr: rinfo.address, port: rinfo.port, slots: new Set(), all: false, lastSeen: 0 };
        subscribers.set(key, sub);
        console.log(t("dsu.subscriber", { address: key, slot: req.subscriberType === 0 ? t("dsu.all") : req.slot }));
      }
      sub.lastSeen = Date.now();
      if (req.subscriberType === 0) sub.all = true;
      else if (req.subscriberType === 1 && req.slot < NUM_SLOTS) sub.slots.add(req.slot);
      // SubscriberType.Mac (2) no se usa en los emuladores objetivo — ignorado
    }
  });

  socket.on("error", (err) => {
    console.error(t("dsu.error", { message: err.message }));
    if (err.code === "EADDRINUSE") console.error(t("dsu.portBusy", { host, port }));
    onError(err);
  });

  socket.bind(port, host, () => {
    listening = true;
    console.log(t("dsu.ready", { host, port }));
  });

  // hz por slot (ventana de 2s) + purga de suscriptores muertos (antes la
  // purga solo corría dentro de updateSlot: sin motion fluyendo, cada
  // relanzamiento del emulador dejaba una entrada huérfana para siempre)
  const hzTick = setInterval(() => {
    for (const s of slots.values()) {
      s.hz = Math.round(s.hzCount / 2);
      s.hzCount = 0;
    }
    const now = Date.now();
    for (const [key, sub] of subscribers) {
      if (now - sub.lastSeen > SUBSCRIBER_PURGE_MS) subscribers.delete(key);
    }
  }, 2000);
  hzTick.unref?.();

  function quiesceSlot(slot) {
    const s = slots.get(slot);
    if (!s?.lastSample) return;
    s.pubTs += NOMINAL_DELTA_US;
    const still = { ...s.lastSample, pitch: 0, yaw: 0, roll: 0, tsUs: s.pubTs };
    s.packetId = (s.packetId + 1) >>> 0;
    sendToSubscribers(slot, encodeDataResponse(serverId, slot, s.packetId, still));
    s.lastSample = null;
    s.lastRawTs = null;
    s.hz = 0;
  }
  // This deadline is independent of WebSocket keepalive: a live socket can
  // stop producing sensors when the phone locks or the app is interrupted.
  const staleTick = setInterval(() => {
    for (const [slot, s] of slots) {
      if (s.lastSample && performance.now() - s.lastArrival > MOTION_STALE_MS) quiesceSlot(slot);
    }
  }, 50);
  staleTick.unref?.();

  return {
    // sample crudo del iPhone (marco device); orientation del player
    updateSlot(slot, sample, orientation, motionProfile) {
      if (slot < 0 || slot >= NUM_SLOTS) return;
      const s = slotState(slot);
      const dsuSample = toDsuFrame(sample, orientation, motionProfile);
      dsuSample.tsUs = rebaseTs(s, dsuSample.tsUs);
      s.lastSample = dsuSample;
      s.lastArrival = performance.now();
      s.hzCount++;
      s.packetId = (s.packetId + 1) >>> 0;

      sendToSubscribers(slot, encodeDataResponse(serverId, slot, s.packetId, dsuSample));
    },

    // GIRO apagado o player desconectado: publicar un último sample con el
    // gyro a CERO (el emulador integra el último valor recibido — sin esto
    // un gyro congelado ≠ 0 deja la cámara girando sola) y soltar el slot.
    quiesceSlot,

    // alias para compatibilidad (mismo efecto sin el sample de reposo)
    clearSlot(slot) {
      const s = slots.get(slot);
      if (s) {
        s.lastSample = null;
        s.lastRawTs = null;
      }
    },

    status() {
      const out = {};
      for (const [n, s] of slots) {
        out[n] = s.lastSample ? { hz: s.hz, packetId: s.packetId, ageMs: Math.round(performance.now() - s.lastArrival), sample: s.lastSample } : null;
      }
      return {
        listening,
        host,
        port,
        subscribers: subscribers.size,
        slots: out,
      };
    },

    close() {
      clearInterval(hzTick);
      clearInterval(staleTick);
      try { socket.close(); } catch { /* ya cerrado */ }
    },
  };
}
