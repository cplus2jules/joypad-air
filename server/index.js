import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { networkInterfaces } from "os";
import qrcode from "qrcode-terminal";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { createKeyboard } from "./keyboard.js";
import { MAPPINGS } from "./mappings.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const STICK_DEADZONE = 0.25;

const app = express();
app.use(express.static(join(__dirname, "..", "public")));

const server = createServer(app);
const wss = new WebSocketServer({ server });

const keyboard = await createKeyboard();
console.log(`[server] keyboard backend: ${keyboard.name}`);

const players = {
  1: createPlayerState(1),
  2: createPlayerState(2),
};

function createPlayerState(num) {
  return {
    num,
    connected: false,
    socket: null,
    buttons: new Set(),
    stickDirs: {
      L: { up: false, down: false, left: false, right: false },
      R: { up: false, down: false, left: false, right: false },
    },
  };
}

function releaseAllForPlayer(p) {
  const map = MAPPINGS[p.num];
  for (const btn of p.buttons) {
    const key = map.buttons[btn];
    if (key) keyboard.up(key);
  }
  p.buttons.clear();

  for (const stick of ["L", "R"]) {
    const dirs = p.stickDirs[stick];
    for (const dir of ["up", "down", "left", "right"]) {
      if (dirs[dir]) {
        const key = map.sticks[stick][dir];
        if (key) keyboard.up(key);
        dirs[dir] = false;
      }
    }
  }
}

function handleButton(p, btnName, isDown) {
  const map = MAPPINGS[p.num];
  const key = map.buttons[btnName];
  if (!key) return;

  const has = p.buttons.has(btnName);
  if (isDown && !has) {
    p.buttons.add(btnName);
    keyboard.down(key);
  } else if (!isDown && has) {
    p.buttons.delete(btnName);
    keyboard.up(key);
  }
}

function handleStick(p, stick, x, y) {
  const map = MAPPINGS[p.num];
  const sMap = map.sticks[stick];
  if (!sMap) return;
  const dirs = p.stickDirs[stick];

  const wantRight = x > STICK_DEADZONE;
  const wantLeft = x < -STICK_DEADZONE;
  const wantDown = y > STICK_DEADZONE;
  const wantUp = y < -STICK_DEADZONE;

  const apply = (dir, want) => {
    if (want && !dirs[dir]) {
      dirs[dir] = true;
      keyboard.down(sMap[dir]);
    } else if (!want && dirs[dir]) {
      dirs[dir] = false;
      keyboard.up(sMap[dir]);
    }
  };

  apply("up", wantUp);
  apply("down", wantDown);
  apply("left", wantLeft);
  apply("right", wantRight);
}

wss.on("connection", (socket, req) => {
  const url = new URL(req.url, "http://x");
  const playerNum = url.searchParams.get("p") === "2" ? 2 : 1;
  const p = players[playerNum];

  if (p.connected) {
    p.socket?.close();
    releaseAllForPlayer(p);
  }

  p.connected = true;
  p.socket = socket;
  console.log(`[ws] Player ${playerNum} conectado`);

  socket.send(JSON.stringify({ t: "hello", player: playerNum }));

  socket.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.t === "btn") handleButton(p, msg.k, !!msg.d);
    else if (msg.t === "stick") handleStick(p, msg.s, msg.x ?? 0, msg.y ?? 0);
  });

  socket.on("close", () => {
    console.log(`[ws] Player ${playerNum} desconectado`);
    releaseAllForPlayer(p);
    p.connected = false;
    p.socket = null;
  });

  socket.on("error", (err) => {
    console.error(`[ws] Player ${playerNum} error:`, err.message);
  });
});

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

server.listen(PORT, "0.0.0.0", () => {
  const ips = getLocalIPs();
  console.log("");
  console.log("Switch Controller corriendo");
  console.log("=================================");
  if (ips.length === 0) {
    console.log(`Servidor en http://localhost:${PORT}`);
    console.log("(no se detectaron interfaces de red — conecta el Mac a WiFi)");
  } else {
    for (const ip of ips) {
      const url = `http://${ip}:${PORT}`;
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
  console.log("Mapeo de teclas para Ryujinx: ver README.md");
  console.log("Ctrl+C para detener");
});

process.on("SIGINT", () => {
  console.log("\nLiberando teclas y cerrando...");
  for (const p of Object.values(players)) releaseAllForPlayer(p);
  process.exit(0);
});
