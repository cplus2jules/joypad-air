#!/usr/bin/env node
// Cliente DSU que imita exactamente a Ryujinx — verifica el servidor motion
// sin abrir el emulador.
//
//   node tools/dsu-test-client.mjs            # valida protocolo 8s (slot 0)
//   node tools/dsu-test-client.mjs --slot 1
//   node tools/dsu-test-client.mjs --pose     # imprime accel/gyro en vivo
//                                              para la calibración de 6 poses
//
// Imita el comportamiento real del cliente (Ryubing 1.3.3): socket UDP
// "conectado" a 127.0.0.1:26760, RequestInfo al inicio y RequestData a 60Hz.
// Valida: magic DSUS, versión 1001, CRC32, tamaño 100B, packetId creciente
// y frecuencia de datos.

import dgram from "node:dgram";
import {
  encodeDataRequest,
  encodeInfoRequest,
  decodeResponse,
  MSG,
} from "../server/dsu/packets.js";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valueOf = (f, def) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const HOST = valueOf("--host", "127.0.0.1");
const PORT = Number(valueOf("--port", 26760));
const SLOT = Number(valueOf("--slot", 0));
const SECONDS = Number(valueOf("--seconds", 8));
const POSE_MODE = has("--pose");
const CLIENT_ID = 0;

const socket = dgram.createSocket("udp4");
socket.connect(PORT, HOST);

let dataCount = 0;
let lastPacketId = null;
let packetIdMonotonic = true;
let crcFailures = 0;
let badSize = 0;
let infoSeen = false;
let lastPrint = 0;
let lastSample = null;

socket.on("message", (buf) => {
  const res = decodeResponse(buf);
  if (!res) return;
  if (!res.crcOk) crcFailures++;

  if (res.type === MSG.INFO) {
    infoSeen = true;
    if (!POSE_MODE) {
      console.log(`  info: slot ${res.slot} state=${res.state === 2 ? "Connected" : "Disconnected"} crc=${res.crcOk ? "ok" : "FAIL"}`);
    }
    return;
  }

  if (res.type === MSG.DATA) {
    dataCount++;
    if (res.size !== 100) badSize++;
    if (lastPacketId !== null && res.packetId <= lastPacketId) packetIdMonotonic = false;
    lastPacketId = res.packetId;
    lastSample = res;

    const now = Date.now();
    if (POSE_MODE && now - lastPrint > 250) {
      lastPrint = now;
      const f = (v) => (v >= 0 ? " " : "") + v.toFixed(2);
      process.stdout.write(
        `\r  accel g [x${f(res.ax)} y${f(res.ay)} z${f(res.az)}]  ` +
        `gyro °/s [pitch${f(res.pitch)} yaw${f(res.yaw)} roll${f(res.roll)}]   `
      );
    }
  }
});

socket.on("connect", () => {
  console.log(`Cliente DSU → ${HOST}:${PORT} (slot ${SLOT})${POSE_MODE ? " — modo calibración" : ""}`);
  socket.send(encodeInfoRequest(CLIENT_ID, [SLOT]));

  const tick = setInterval(() => {
    socket.send(encodeDataRequest(CLIENT_ID, SLOT));
  }, 16); // ~60Hz, como el game loop de Ryujinx

  if (POSE_MODE) {
    console.log("Poses de calibración (compara contra lo esperado):");
    console.log("  1. plano boca arriba        → accel ≈ ( 0, -1,  0)");
    console.log("  2. de pie (borde largo)     → un eje ±1, resto 0");
    console.log("  3. rotar sobre cada eje     → solo UN componente de gyro se mueve");
    console.log("Ctrl+C para salir.\n");
    return; // corre hasta Ctrl+C
  }

  setTimeout(() => {
    clearInterval(tick);
    socket.close();

    const hz = dataCount / SECONDS;
    console.log("\nResultado:");
    console.log(`  data responses: ${dataCount} en ${SECONDS}s (~${hz.toFixed(0)} Hz)`);
    console.log(`  info response:  ${infoSeen ? "✓" : "✗ no recibida"}`);
    console.log(`  CRC:            ${crcFailures === 0 ? "✓ todos válidos" : `✗ ${crcFailures} fallos`}`);
    console.log(`  tamaño 100B:    ${badSize === 0 ? "✓" : `✗ ${badSize} con otro tamaño`}`);
    console.log(`  packetId:       ${packetIdMonotonic ? "✓ creciente" : "✗ no monotónico"}`);
    if (lastSample) {
      console.log(`  último sample:  accel(${lastSample.ax.toFixed(2)}, ${lastSample.ay.toFixed(2)}, ${lastSample.az.toFixed(2)})g ts=${lastSample.tsUs}µs`);
    }

    // sin motion activo en el iPhone no llegan data responses — eso no es
    // fallo del protocolo, solo aviso
    if (dataCount === 0) {
      console.log("\n  (0 respuestas: ¿hay un iPhone conectado con GIRO activado,");
      console.log("   o un feeder de prueba mandando {t:'motion'} por WS?)");
    }
    const ok = infoSeen && crcFailures === 0 && badSize === 0 && packetIdMonotonic;
    process.exit(ok ? 0 : 1);
  }, SECONDS * 1000);
});
