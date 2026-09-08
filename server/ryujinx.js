import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
import { MAPPINGS } from "./mappings.js";
import { toRyujinxKey } from "../tools/hid-key-table.mjs";

const DSU_PORT = 26760;
function setupError(code, message) { return Object.assign(new Error(message), { code }); }
export const DEFAULT_CONFIG_DIR = join(homedir(), "Library", "Application Support", "Ryujinx");
export function buildProfile(playerNum, controllerType, withMotion, { dsuPort = DSU_PORT, deadzone = 1 } = {}) {
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
      gyro_deadzone: deadzone,
      enable_motion: true,
      slot: playerNum - 1,
      alt_slot: playerNum - 1,
      mirror_input: false,
      dsu_server_host: "127.0.0.1",
      dsu_server_port: dsuPort,
    };
  }
  return profile;
}

// Compare fields owned by Joypad; Ryujinx adds defaults when it saves profiles.
function matches(actual, expected) {
  if (expected && typeof expected === "object") return Object.entries(expected).every(([k,v]) => matches(actual?.[k], v));
  return actual === expected;
}
export function ryujinxRunning() {
  try {
    const output = execFileSync("ps", ["-axo", "comm="], { encoding: "utf8", timeout: 2000 });
    return output.split("\n").some(line => /(?:^|\/)Ryujinx(?:\.Avalonia)?$/i.test(line.trim()));
  } catch {
    // Never overwrite a running emulator's configuration when process inspection fails.
    throw setupError("process_check_failed", "Cannot check whether Ryujinx is running. Run setup from Terminal on your Mac.");
  }
}
export function inspectRyujinx(configDir = DEFAULT_CONFIG_DIR, { preset, dsuPort = DSU_PORT } = {}) {
  const path = join(configDir, "Config.json");
  if (!existsSync(path)) return { found: false, synced: false, players: [], issue: "Open Ryujinx once to create its configuration." };
  try {
    const config = JSON.parse(readFileSync(path, "utf8"));
    const flags = config.enable_keyboard === true && config.use_input_global_config === true;
    const dance = preset === "just-dance" || (preset === undefined && config.input_config?.length === 1 && config.input_config[0].name === "Joypad Air Just Dance");
    const players = (dance ? [1] : [1,2]).map(n => {
      const actual = config.input_config?.find(p => p.player_index === `Player${n}`);
      const supported = ["ProController", "JoyconPair", "JoyconLeft", "JoyconRight"].includes(actual?.controller_type);
      const expected = buildProfile(n, dance ? "JoyconRight" : actual?.controller_type, dance, { dsuPort, deadzone: dance ? 0 : 1 });
      delete expected.name;
      return { player: n, type: actual?.controller_type ?? null, synced: flags && supported && matches(actual, expected) };
    });
    const synced = players.every(p => p.synced) && (!dance || config.input_config.length === 1);
    return { found: true, synced, preset: dance ? "just-dance" : "standard", configVersion: config.version, players, issue: synced ? null : "Configure the Joypad Air input profiles with Ryujinx closed." };
  } catch {
    return { found: true, synced: false, players: [], issue: "Ryujinx Config.json could not be read. Check it before running setup." };
  }
}
function atomicJson(path, data) {
  const temporary = `${path}.joypad-${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(data, null, 2) + "\n");
  renameSync(temporary, path);
}
export function configureRyujinx({ configDir = DEFAULT_CONFIG_DIR, types = ["ProController", "ProController"], motion = false, preset, dsuPort = DSU_PORT } = {}, { isRunning = ryujinxRunning } = {}) {
  if (!Number.isInteger(dsuPort) || dsuPort < 1024 || dsuPort > 65535) throw setupError("invalid_dsu_port", "DSU port must be an integer from 1024 to 65535.");
  if (types.length !== 2 || types.some(t => !["ProController","JoyconLeft","JoyconRight"].includes(t))) throw setupError("unsupported_layout", "Unsupported controller layout.");
  if (isRunning()) throw setupError("ryujinx_running", "Quit Ryujinx first, then try again. Ryujinx saves its old settings when it closes.");
  const path = join(configDir, "Config.json");
  let config;
  try { config = JSON.parse(readFileSync(path, "utf8")); }
  catch { throw setupError("config_unreadable", "Open Ryujinx once to create its configuration, then quit it and try again."); }
  if (config.version !== 70) throw setupError("unsupported_config", `Unsupported Ryujinx config version ${config.version}. Expected version 70; your settings were not changed.`);
  const backup = `Config.json.backup-${Date.now()}`;
  copyFileSync(path, join(configDir, backup));
  const dance = preset === "just-dance";
  const profiles = (dance ? ["JoyconRight"] : types).map((type, i) => buildProfile(i + 1, type, dance || motion, { dsuPort, deadzone: dance ? 0 : 1 }));
  if (dance) profiles[0].name = "Joypad Air Just Dance";
  config.enable_keyboard = true;
  config.use_input_global_config = true;
  config.input_config = dance ? profiles : [...profiles, ...(config.input_config ?? []).filter(p => !["Player1","Player2"].includes(p.player_index))];
  const dir = join(configDir, "profiles", "keyboard");
  mkdirSync(dir, { recursive: true });
  profiles.forEach((profile, i) => atomicJson(join(dir, `Chocorramito_${i+1}.json`), profile));
  atomicJson(path, config);
  return { backup, ...inspectRyujinx(configDir, { preset, dsuPort }) };
}
