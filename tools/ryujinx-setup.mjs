#!/usr/bin/env node
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG_DIR, configureRyujinx, inspectRyujinx, ryujinxRunning } from "../server/ryujinx.js";
import { t, terminalMessages } from "../server/i18n.js";
const args = process.argv.slice(2);
const has = flag => args.includes(flag);
const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag)+1] ?? fallback : fallback;
const configDir = value("--config-dir", DEFAULT_CONFIG_DIR);
const preset = has("--just-dance") ? "just-dance" : undefined;
const dsuPort = Number(value("--dsu-port", 26760));
try {
  if (has("--restore")) {
    if (ryujinxRunning()) throw new Error(t("ryujinx.restoreRunning"));
    const file = value("--restore");
    if (!file) throw new Error(t("ryujinx.restoreFile"));
    const src = existsSync(file) ? file : join(configDir, file);
    copyFileSync(src, join(configDir, "Config.json"));
    console.log(t("ryujinx.restored", { path: src }));
  } else if (has("--check")) {
    const state = inspectRyujinx(configDir, { preset, dsuPort });
    if (has("--json")) console.log(JSON.stringify(state));
    else {
      const issueKey = !state.found ? "ryujinx.missing" : state.players.length === 0 ? "ryujinx.unreadable" : "ryujinx.unsynced";
      console.log(state.synced ? t("ryujinx.synced") : `✗ ${t(issueKey)}`);
      state.players.forEach(p => console.log(t("ryujinx.player", {
        n: p.player, type: p.type ?? t("ryujinx.unconfigured"),
        status: t(p.synced ? "ryujinx.ready" : "ryujinx.setupNeeded"),
      })));
    }
    process.exitCode = state.synced ? 0 : 1;
  } else {
    if ((has("--motion") || preset) && !has("--patched")) throw new Error(t("ryujinx.motion"));
    const side = (n, fallback) => value(`--p${n}`, fallback) === "right" ? "JoyconRight" : "JoyconLeft";
    const types = has("--sideways") ? [side(1,"left"),side(2,"right")] : ["ProController","ProController"];
    const result = configureRyujinx({ configDir, types, motion: has("--motion"), preset, dsuPort });
    console.log(t(preset ? "ryujinx.danceConfigured" : "ryujinx.configured", { backup: result.backup }));
  }
} catch (error) {
  const key = `error.${error.code}`;
  console.error(Object.hasOwn(terminalMessages.en, key) ? t(key) : error.message);
  process.exitCode = 1;
}
