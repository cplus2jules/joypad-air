// Encode/decode de paquetes DSU (protocolo CemuHook), little-endian.
//
// Verificado byte a byte contra Ryubing 1.3.3
// (src/Ryujinx.Input/Motion/CemuHook/Protocol/*.cs, Pack=1):
//
//   Header (16B): magic u32 | version u16 (1001) | length u16 (payload INCL.
//   el message type) | crc32 u32 (campo a 0 al calcular) | id u32
//
//   SharedResponse (15B): type u32 | slot u8 | state u8 | model u8 | conn u8
//   | mac u8[6] | battery u8
//
//   DataResponse (84B payload, 100B total): SharedResponse | connected u8 |
//   packetId u32 | extraButtons u8 | mainButtons u8 | psExtra u16 |
//   leftStick u16 | rightStick u16 | dpadAnalog u32 | mainAnalog u64 |
//   touch1 u8[6] | touch2 u8[6] | motionTimestamp u64 (µs) |
//   accel f32×3 (g) | gyro f32×3 (°/s, orden PITCH, YAW, ROLL)

import zlib from "node:zlib";

export const MAGIC_SERVER = 0x53555344; // "DSUS"
export const MAGIC_CLIENT = 0x43555344; // "DSUC"
export const PROTOCOL_VERSION = 1001;

export const MSG = {
  VERSION: 0x100000,
  INFO: 0x100001,
  DATA: 0x100002,
};

export const SLOT_STATE = { DISCONNECTED: 0, RESERVED: 1, CONNECTED: 2 };
export const MODEL = { NONE: 0, PARTIAL_GYRO: 1, FULL_GYRO: 2 };
export const CONN = { NONE: 0, USB: 1, BLUETOOTH: 2 };
export const BATTERY = { NA: 0, FULL: 5 };

export const crc32 = zlib.crc32
  ? (buf) => zlib.crc32(buf) >>> 0
  : makeCrc32Fallback();

function makeCrc32Fallback() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
}

// Header + payload → datagrama completo con length y CRC correctos.
function packet(magic, id, payloadLength, fill) {
  const buf = Buffer.alloc(16 + payloadLength);
  buf.writeUInt32LE(magic, 0);
  buf.writeUInt16LE(PROTOCOL_VERSION, 4);
  buf.writeUInt16LE(payloadLength, 6);
  buf.writeUInt32LE(0, 8); // CRC se calcula al final
  buf.writeUInt32LE(id >>> 0, 12);
  fill(buf, 16);
  buf.writeUInt32LE(crc32(buf), 8);
  return buf;
}

function writeShared(buf, o, type, slot, connected) {
  buf.writeUInt32LE(type, o);
  buf.writeUInt8(slot, o + 4);
  buf.writeUInt8(connected ? SLOT_STATE.CONNECTED : SLOT_STATE.DISCONNECTED, o + 5);
  buf.writeUInt8(MODEL.FULL_GYRO, o + 6);
  buf.writeUInt8(CONN.BLUETOOTH, o + 7);
  // MAC fake estable por slot: 00:00:00:00:00:0(slot+1)
  buf.fill(0, o + 8, o + 13);
  buf.writeUInt8(slot + 1, o + 13);
  buf.writeUInt8(BATTERY.FULL, o + 14);
  return o + 15;
}

// ── Respuestas (server → emulador) ──────────────────────────────────────────

export function encodeVersionResponse(serverId) {
  return packet(MAGIC_SERVER, serverId, 8, (buf, o) => {
    buf.writeUInt32LE(MSG.VERSION, o);
    buf.writeUInt16LE(PROTOCOL_VERSION, o + 4);
    // 2 bytes de padding a cero
  });
}

export function encodeInfoResponse(serverId, slot, connected) {
  return packet(MAGIC_SERVER, serverId, 16, (buf, o) => {
    const end = writeShared(buf, o, MSG.INFO, slot, connected);
    buf.writeUInt8(0, end); // byte cero final del struct
  });
}

// sample: { ax, ay, az (g), pitch, yaw, roll (°/s), tsUs (BigInt|number µs) }
export function encodeDataResponse(serverId, slot, packetId, sample) {
  return packet(MAGIC_SERVER, serverId, 84, (buf, o) => {
    o = writeShared(buf, o, MSG.DATA, slot, true);
    buf.writeUInt8(1, o); o += 1;                      // connected
    buf.writeUInt32LE(packetId >>> 0, o); o += 4;      // packetId
    buf.writeUInt8(0, o); o += 1;                      // extraButtons
    buf.writeUInt8(0, o); o += 1;                      // mainButtons
    buf.writeUInt16LE(0, o); o += 2;                   // psExtra
    buf.writeUInt16LE(0x8080, o); o += 2;              // left stick neutro
    buf.writeUInt16LE(0x8080, o); o += 2;              // right stick neutro
    buf.writeUInt32LE(0, o); o += 4;                   // dpad analógico
    buf.writeBigUInt64LE(0n, o); o += 8;               // botones analógicos
    buf.fill(0, o, o + 12); o += 12;                   // touch1 + touch2
    buf.writeBigUInt64LE(BigInt(Math.round(Number(sample.tsUs))), o); o += 8;
    buf.writeFloatLE(sample.ax, o); o += 4;
    buf.writeFloatLE(sample.ay, o); o += 4;
    buf.writeFloatLE(sample.az, o); o += 4;
    buf.writeFloatLE(sample.pitch, o); o += 4;
    buf.writeFloatLE(sample.yaw, o); o += 4;
    buf.writeFloatLE(sample.roll, o); o += 4;
  });
}

// ── Requests (emulador → server); también usados por el test client ─────────

export function decodeRequest(buf) {
  if (buf.length < 20) return null;
  if (buf.readUInt32LE(0) !== MAGIC_CLIENT) return null;
  const version = buf.readUInt16LE(4);
  const id = buf.readUInt32LE(12);
  const type = buf.readUInt32LE(16);

  if (type === MSG.VERSION) return { type, id, version };

  if (type === MSG.INFO) {
    if (buf.length < 24) return null;
    const portsCount = Math.min(buf.readInt32LE(20), 4);
    const ports = [];
    for (let i = 0; i < portsCount && 24 + i < buf.length; i++) ports.push(buf.readUInt8(24 + i));
    return { type, id, ports };
  }

  if (type === MSG.DATA) {
    if (buf.length < 22) return null;
    const subscriberType = buf.readUInt8(20); // 0=All, 1=Slot, 2=Mac
    const slot = buf.readUInt8(21);
    return { type, id, subscriberType, slot };
  }

  return null;
}

export function encodeDataRequest(clientId, slot) {
  return packet(MAGIC_CLIENT, clientId, 12, (buf, o) => {
    buf.writeUInt32LE(MSG.DATA, o);
    buf.writeUInt8(1, o + 4); // SubscriberType.Slot
    buf.writeUInt8(slot, o + 5);
    // mac[6] = 0
  });
}

export function encodeInfoRequest(clientId, slots) {
  return packet(MAGIC_CLIENT, clientId, 12, (buf, o) => {
    buf.writeUInt32LE(MSG.INFO, o);
    buf.writeInt32LE(slots.length, o + 4);
    for (let i = 0; i < 4; i++) buf.writeUInt8(slots[i] ?? 0, o + 8 + i);
  });
}

// Decodifica una respuesta de datos (para el test client). Valida CRC.
export function decodeResponse(buf) {
  if (buf.length < 20) return null;
  if (buf.readUInt32LE(0) !== MAGIC_SERVER) return null;
  const length = buf.readUInt16LE(6);
  const crcStored = buf.readUInt32LE(8);
  const copy = Buffer.from(buf);
  copy.writeUInt32LE(0, 8);
  const crcOk = crc32(copy) === crcStored;
  const type = buf.readUInt32LE(16);

  const out = { type, length, crcOk, size: buf.length, id: buf.readUInt32LE(12) };
  if (type === MSG.DATA && buf.length >= 100) {
    let o = 16;
    out.slot = buf.readUInt8(o + 4);
    out.state = buf.readUInt8(o + 5);
    o = 16 + 15;
    out.connected = buf.readUInt8(o); o += 1;
    out.packetId = buf.readUInt32LE(o); o += 4;
    o += 1 + 1 + 2 + 2 + 2 + 4 + 8 + 6 + 6;
    out.tsUs = buf.readBigUInt64LE(o); o += 8;
    out.ax = buf.readFloatLE(o); o += 4;
    out.ay = buf.readFloatLE(o); o += 4;
    out.az = buf.readFloatLE(o); o += 4;
    out.pitch = buf.readFloatLE(o); o += 4;
    out.yaw = buf.readFloatLE(o); o += 4;
    out.roll = buf.readFloatLE(o); o += 4;
  }
  if (type === MSG.INFO && buf.length >= 32) {
    out.slot = buf.readUInt8(20);
    out.state = buf.readUInt8(21);
  }
  return out;
}
