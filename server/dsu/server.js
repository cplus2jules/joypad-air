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

const SUBSCRIBER_TTL_MS = 2000; // Ryujinx re-pide cada frame; 2s sin pedir = fuera
const NUM_SLOTS = 4;

export function createDsuServer({ port = 26760, host = "127.0.0.1" } = {}) {
  // id de servidor estable durante el proceso (los clientes lo ignoran)
  const serverId = (Math.floor(Math.random() * 0xffffffff)) >>> 0;

  const socket = dgram.createSocket("udp4");
  const subscribers = new Map(); // "addr:port" → { addr, port, slots:Set|null, lastSeen }
  const slots = new Map();       // slot → { packetId, hzCount, hz, lastSample }
  let listening = false;

  function slotState(n) {
    if (!slots.has(n)) slots.set(n, { packetId: 0, hzCount: 0, hz: 0, lastSample: null });
    return slots.get(n);
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
        sub = { addr: rinfo.address, port: rinfo.port, slots: new Set(), all: false, lastSeen: 0 };
        subscribers.set(key, sub);
        console.log(`[dsu] suscriptor nuevo: ${key} (slot ${req.subscriberType === 0 ? "ALL" : req.slot})`);
      }
      sub.lastSeen = Date.now();
      if (req.subscriberType === 0) sub.all = true;
      else if (req.subscriberType === 1 && req.slot < NUM_SLOTS) sub.slots.add(req.slot);
      // SubscriberType.Mac (2) no se usa en los emuladores objetivo — ignorado
    }
  });

  socket.on("error", (err) => {
    console.error(`[dsu] error de socket: ${err.message}`);
  });

  socket.bind(port, host, () => {
    listening = true;
    console.log(`[dsu] servidor motion DSU/CemuHook en ${host}:${port}`);
  });

  // hz por slot (ventana de 2s)
  const hzTick = setInterval(() => {
    for (const s of slots.values()) {
      s.hz = Math.round(s.hzCount / 2);
      s.hzCount = 0;
    }
  }, 2000);
  hzTick.unref?.();

  return {
    // sample crudo del iPhone (marco device); orientation del player
    updateSlot(slot, sample, orientation) {
      if (slot < 0 || slot >= NUM_SLOTS) return;
      const s = slotState(slot);
      const dsuSample = toDsuFrame(sample, orientation);
      s.lastSample = dsuSample;
      s.hzCount++;
      s.packetId = (s.packetId + 1) >>> 0;

      const now = Date.now();
      const data = encodeDataResponse(serverId, slot, s.packetId, dsuSample);
      for (const [key, sub] of subscribers) {
        if (now - sub.lastSeen > SUBSCRIBER_TTL_MS) {
          if (now - sub.lastSeen > 10000) subscribers.delete(key);
          continue;
        }
        if (sub.all || sub.slots.has(slot)) {
          socket.send(data, sub.port, sub.addr);
        }
      }
    },

    // player desconectado → su slot deja de reportar Connected en Info
    clearSlot(slot) {
      const s = slots.get(slot);
      if (s) s.lastSample = null;
    },

    status() {
      const out = {};
      for (const [n, s] of slots) {
        out[n] = s.lastSample ? { hz: s.hz, packetId: s.packetId } : null;
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
      try { socket.close(); } catch { /* ya cerrado */ }
    },
  };
}
