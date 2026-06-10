#!/usr/bin/env node
// Configura Ryujinx desde server/mappings.js (única fuente de verdad).
//
// Genera los perfiles de teclado Chocorramito_1/2 y parchea Config.json
// (con backup) para que los mandos queden mapeados EXACTAMENTE igual que
// lo que envía el server. Reemplaza a los scripts perdidos de /tmp.
//
// Uso:
//   npm run ryujinx:setup                # ProController ×2 (default)
//   npm run ryujinx:sideways             # P1=JoyconLeft, P2=JoyconRight
//   node tools/ryujinx-setup.mjs --sideways --p1 right --p2 left
//   node tools/ryujinx-setup.mjs --check          # diff sin escribir; exit 1 si desync
//   node tools/ryujinx-setup.mjs --restore <archivo-backup>
//   node tools/ryujinx-setup.mjs --motion --patched   # añade motion DSU
//
// --motion requiere --patched: el Ryujinx stock NO consulta el servidor DSU
// con backend de teclado (verificado en el código fuente de Ryubing 1.3.3);
// solo el build parcheado de tools/ryubing-motion.patch lo hace.

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
import { MAPPINGS } from "../server/mappings.js";
import { toRyujinxKey } from "./hid-key-table.mjs";

const EXPECTED_CONFIG_VERSION = 70;
const DSU_PORT = 26760;

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valueOf = (f, def) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const configDir = valueOf("--config-dir", join(homedir(), "Library", "Application Support", "Ryujinx"));
const configPath = join(configDir, "Config.json");
const profilesDir = join(configDir, "profiles", "keyboard");

// ── Perfiles deseados ────────────────────────────────────────────────────────
function buildProfile(playerNum, controllerType, withMotion) {
  const m = MAPPINGS[playerNum];
  const btn = (name) => toRyujinxKey(m.buttons[name] ?? null);
  const stick = (s, dir) => toRyujinxKey(m.sticks[s][dir]);

  const profile = {
    left_joycon_stick: {
      stick_up: stick("L", "up"),
      stick_down: stick("L", "down"),
      stick_left: stick("L", "left"),
      stick_right: stick("L", "right"),
      stick_button: btn("lstick"),
    },
    right_joycon_stick: {
      stick_up: stick("R", "up"),
      stick_down: stick("R", "down"),
      stick_left: stick("R", "left"),
      stick_right: stick("R", "right"),
      stick_button: btn("rstick"),
    },
    left_joycon: {
      button_minus: btn("minus"),
      button_l: btn("l"),
      button_zl: btn("zl"),
      button_sl: btn("sl"),
      button_sr: btn("sr"),
      dpad_up: btn("dpad_up"),
      dpad_down: btn("dpad_down"),
      dpad_left: btn("dpad_left"),
      dpad_right: btn("dpad_right"),
    },
    right_joycon: {
      button_plus: btn("plus"),
      button_r: btn("r"),
      button_zr: btn("zr"),
      button_sl: btn("sl"),
      button_sr: btn("sr"),
      button_x: btn("x"),
      button_b: btn("b"),
      button_y: btn("y"),
      button_a: btn("a"),
    },
    version: 1,
    backend: "WindowKeyboard",
    id: "0",
    name: `Chocorramito ${playerNum}`,
    controller_type: controllerType,
    player_index: `Player${playerNum}`,
  };

  if (withMotion) {
    profile.motion = {
      motion_backend: "CemuHook",
      sensitivity: 100,
      gyro_deadzone: 1,
      enable_motion: true,
      slot: playerNum - 1,
      alt_slot: playerNum - 1,
      mirror_input: false,
      dsu_server_host: "127.0.0.1",
      dsu_server_port: DSU_PORT,
    };
  }
  return profile;
}

function desiredProfiles() {
  const sideways = has("--sideways");
  const withMotion = has("--motion");
  const sideFor = (n, def) => (valueOf(`--p${n}`, def) === "right" ? "JoyconRight" : "JoyconLeft");
  const type1 = sideways ? sideFor(1, "left") : "ProController";
  const type2 = sideways ? sideFor(2, "right") : "ProController";
  return [buildProfile(1, type1, withMotion), buildProfile(2, type2, withMotion)];
}

// ── Utilidades ───────────────────────────────────────────────────────────────
function ryujinxRunning() {
  try {
    execFileSync("pgrep", ["-if", "ryujinx"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function deepDiff(a, b, path = "") {
  const isObj = (v) => v !== null && typeof v === "object";
  if (!isObj(a) || !isObj(b)) {
    return JSON.stringify(a) !== JSON.stringify(b)
      ? [`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`]
      : [];
  }
  const diffs = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    diffs.push(...deepDiff(a[k], b[k], path ? `${path}.${k}` : k));
  }
  return diffs;
}

function loadConfig() {
  if (!existsSync(configPath)) {
    console.error(`✗ No existe ${configPath} — ¿está instalado Ryujinx?`);
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(configPath, "utf8"));
  if (cfg.version !== EXPECTED_CONFIG_VERSION) {
    console.warn(`⚠ Config.json version ${cfg.version} (esperaba ${EXPECTED_CONFIG_VERSION}) — el schema pudo cambiar; revisa el resultado.`);
  }
  return cfg;
}

// ── Modos ────────────────────────────────────────────────────────────────────
if (has("--restore")) {
  const backup = valueOf("--restore");
  if (!backup || !existsSync(join(configDir, backup)) && !existsSync(backup)) {
    console.error("✗ Indica el archivo de backup: --restore Config.json.backup-<epoch>");
    process.exit(1);
  }
  if (ryujinxRunning()) {
    console.error("✗ Cierra Ryujinx antes de restaurar (sobrescribe Config.json al salir).");
    process.exit(1);
  }
  const src = existsSync(backup) ? backup : join(configDir, backup);
  copyFileSync(src, configPath);
  console.log(`✓ Restaurado ${src} → Config.json`);
  process.exit(0);
}

if (has("--motion") && !has("--patched") && !has("--check")) {
  console.error(
    "✗ --motion requiere --patched.\n" +
    "  El Ryujinx stock ignora el servidor DSU con backend de teclado; solo el\n" +
    "  build parcheado (tools/ryubing-motion.patch) lo consulta. Si ya usas ese\n" +
    "  build, repite con: --motion --patched"
  );
  process.exit(1);
}

const desired = desiredProfiles();
const cfg = loadConfig();

if (has("--check")) {
  let clean = true;
  const current = cfg.input_config ?? [];
  for (let i = 0; i < 2; i++) {
    const diffs = deepDiff(current[i] ?? {}, desired[i], `input_config[${i}]`);
    if (diffs.length) {
      clean = false;
      console.log(`\nPlayer ${i + 1} desincronizado (${diffs.length} diferencias):`);
      for (const d of diffs.slice(0, 12)) console.log(`  · ${d}`);
      if (diffs.length > 12) console.log(`  · … y ${diffs.length - 12} más`);
    }
  }
  for (const flag of [["enable_keyboard", true], ["use_input_global_config", true]]) {
    if (cfg[flag[0]] !== flag[1]) {
      clean = false;
      console.log(`\n${flag[0]} = ${cfg[flag[0]]} (debe ser ${flag[1]})`);
    }
  }
  for (let i = 0; i < 2; i++) {
    const p = join(profilesDir, `Chocorramito_${i + 1}.json`);
    if (!existsSync(p)) {
      clean = false;
      console.log(`\nFalta el perfil ${p}`);
      continue;
    }
    const diffs = deepDiff(JSON.parse(readFileSync(p, "utf8")), desired[i], `Chocorramito_${i + 1}`);
    if (diffs.length) {
      clean = false;
      console.log(`\nPerfil Chocorramito_${i + 1}.json desincronizado (${diffs.length} diferencias)`);
      for (const d of diffs.slice(0, 6)) console.log(`  · ${d}`);
    }
  }
  console.log(clean ? "\n✓ Ryujinx sincronizado con server/mappings.js" : "\n✗ Desincronizado — corre: npm run ryujinx:setup");
  process.exit(clean ? 0 : 1);
}

// ── Aplicar ──────────────────────────────────────────────────────────────────
if (ryujinxRunning()) {
  console.error("✗ Ryujinx está abierto. Ciérralo primero (sobrescribe Config.json al salir) y repite.");
  process.exit(1);
}

const backupName = `Config.json.backup-${Math.floor(Date.now() / 1000)}`;
copyFileSync(configPath, join(configDir, backupName));

cfg.enable_keyboard = true;
cfg.use_input_global_config = true;
cfg.input_config = desired;

mkdirSync(profilesDir, { recursive: true });
for (let i = 0; i < 2; i++) {
  writeFileSync(join(profilesDir, `Chocorramito_${i + 1}.json`), JSON.stringify(desired[i], null, 2) + "\n");
}
writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n");

// validar re-parseando
JSON.parse(readFileSync(configPath, "utf8"));
for (let i = 0; i < 2; i++) JSON.parse(readFileSync(join(profilesDir, `Chocorramito_${i + 1}.json`), "utf8"));

console.log(`✓ Backup: ${backupName}`);
console.log(`✓ Perfiles: Chocorramito_1.json (${desired[0].controller_type}), Chocorramito_2.json (${desired[1].controller_type})`);
console.log(`✓ Config.json parcheado (enable_keyboard, input_config${has("--motion") ? ", motion DSU" : ""})`);
console.log("\nAbre Ryujinx — los mandos ya están configurados. Verificar: node tools/ryujinx-setup.mjs --check");
