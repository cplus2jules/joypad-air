# 🎮 joypad-air — iPhone as a game controller for macOS emulators

Turn your iPhone (or Android) into a wireless gamepad for **Ryujinx**,
**Dolphin** and **Cemu** on your Mac. Low-latency buttons over Wi-Fi plus
real **motion controls** (gyro) via the DSU/cemuhook protocol. Free, open
source, no ads, no tracking.

A.K.A. **"El Control Super Pro Max"** · Guía en español: [README.es.md](README.es.md)

## Local Swift app for Just Dance

The native iPhone controller, local pairing bridge and separate patched Ryujinx build are available for testing. Start with the [implementation status](docs/motion-implementation-status.md), [iPhone installation guide](docs/local-device-setup.md), and [sensor contract](docs/motion-coordinate-contract.md). Double-click **Joypad Air.command** in Finder to start the pairing bridge, open its pairing page, and launch the selected Ryujinx Motion build. Connect your saved Mac on the iPhone and turn on **Enable Motion**. Keep the launcher's Terminal window open while playing. The real-phone Just Dance scoring test is still required; the full Swift app plan is not complete.

The launcher reuses a running paired bridge and brings the selected emulator forward if it is already open. If it reuses a bridge, keep that bridge's original Terminal open. Closing Terminal stops its bridge; quit the emulator normally when finished. Keep the launcher in this project folder, or make a Finder alias for your Desktop. The equivalent command is `npm run play`; `npm run start:paired` still starts only the bridge.

Use `npm run start:dance` for the isolated Just Dance preset and `npm run ryujinx:launch` for the selected local emulator build. Keep the original browser setup as the fallback. Development builds and private local emulator data stay under the ignored `.local/` directory.

## Why this exists

Every "phone as gamepad" project is Android→Windows. On macOS there was no
way to get buttons *and* motion into Ryujinx from an iPhone — iOS DSU apps
are motion-only, and the ones with buttons need a Windows-only companion.
joypad-air does both, macOS-first:

- **Buttons** → injected as keyboard events (nut-js / CGEventPost), the only
  input path Ryujinx supports on macOS without a physical controller. Server-side
  analog→8-way conversion with radial + angular hysteresis, SOCD cleaning,
  rolling d-pad, hair triggers.
- **Motion** → served as a DSU/cemuhook server on UDP 26760. Dolphin, Cemu
  and Citra consume it natively; for Ryujinx there's a local source patch you
  build locally (below).

## Install (macOS)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/mindavidev/joypad-air/main/install.sh)"
```

The script checks for Node ≥18 (opens the official installer if missing) and
drops a **"🎮 El Control"** launcher on your Desktop. Then:

1. Double-click the launcher; grant **Accessibility** to Terminal the first
   time (the app waits for you).
2. Scan the QR with your phone → Safari → Share → **Add to Home Screen** →
   open from the icon (true fullscreen; iOS never hides Safari's bar in-tab).
3. Configure Ryujinx once (with Ryujinx closed):
   `npx -y github:mindavidev/joypad-air ryujinx-setup`
4. Open Ryujinx and play. Live dashboard at <http://localhost:3001/setup>.

Updates are automatic — every launch resolves the latest version.

## 🎯 Motion controls (gyro)

Two halves: the phone must *send* motion, and the emulator must *listen*.

**Phone side**
- ⚠️ The web controller **cannot** read motion sensors: iOS blocks them on
  `http://` pages (HTTPS-only API). Buttons work great; the GIRO toggle
  tells you honestly.
- ✅ The native app (Expo) has full gyro. Run from source:
  ```bash
  git clone https://github.com/mindavidev/joypad-air && cd joypad-air
  npm install && npm start              # terminal 1 — server
  cd app && npm install && npx expo start   # terminal 2 — app
  ```
  Install **Expo Go** on the phone, scan terminal 2's QR, tap **∿ GIRO**.

**Emulator side**
- **Dolphin / Cemu / Citra**: native support — point their DSU/cemuhook
  client at `127.0.0.1:26760` (server on another machine? run with
  `DSU_HOST=0.0.0.0`).
- **Ryujinx**: stock builds ignore DSU when buttons come from a keyboard
  backend (verified in source). Build the patched **"Ryujinx Motion.app"**
  locally — we never distribute emulator binaries:
  ```bash
  brew install dotnet@9
  bash tools/ryujinx-build/build-local.sh
  npm run ryujinx:setup -- --motion --patched
  ```
  Play using "Ryujinx Motion" (your stock Ryujinx stays untouched).

**In-game**: MK8 needs motion steering enabled *inside the game* (the
controller-with-waves icon pre-race). Aiming in Zelda-likes just works.
Weird axes? Controller Settings → calibration row with GIRO on (flat
face-up ⇒ `az ≈ -1.00`); the axis matrix lives in `server/dsu/transform.js`.

## Languages

The web controller, setup dashboard, and native app support **English** and
**Español**. Choose a language on the connection screen or in Settings. Your choice
is saved on that device and updates the interface without disconnecting the controller.
The first visit follows the device language, with English as the fallback.

Terminal output defaults to English, including `npm start` and the Ryujinx setup
commands. To run the server in Spanish:

```bash
JOYPAD_LANG=es npm start
```

Use `JOYPAD_LANG=es npm run ryujinx:setup` for Spanish setup instructions, or
`JOYPAD_LANG=en` to explicitly select English. Restart the server after changing
this setting. Terminal language is separate from the language selected on your phone.

## Features

- Player names, 8 Joy-Con-style color themes, stick sensitivity sliders,
  haptic intensity, A/B·X/Y swap — synced live, persisted per player.
- Latency dot, "Ryujinx lost focus" banner, Accessibility banner, player
  LEDs, reconnect overlay, `/setup` dashboard.
- FIFO key queue (no stuck keys), heartbeat releases keys ≤10s after a phone
  dies, slot takeover with client notice, LAN-only, full input validation.
- `npm run ryujinx:setup` generates both keyboard profiles and patches
  `Config.json` (with backup) straight from `server/mappings.js` — zero key
  collisions between players. `--check` works as a regression test.

## Two players

Each phone claims a slot as an independent pad. Known limitation: a few
games (MK8, Mario Wonder) require physically distinct HID devices for 2P and
reject two keyboard-backed pads — Smash, Overcooked, Stardew, Cuphead and
most co-op games work great.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Controller "types letters" into random apps | Ryujinx lost focus — click its window (the controller shows a banner). |
| Connected but game doesn't react | Grant Accessibility to Terminal, or run `ryujinx-setup`. |
| Gyro does nothing | ① Web controller? Gyro needs the native app. ② Opened "Ryujinx Motion" (not stock)? ③ MK8? Enable motion in-game. ④ iOS motion permission denied? |
| Safari bar in the way | Share → Add to Home Screen, open from the icon — the only true fullscreen on iOS. |
| Phone can't find the server | Same Wi-Fi? Guest networks isolate clients. iOS: Settings → Privacy → Local Network. |

## Development

```bash
npm install
npm start             # server on :3001 — PWA + WebSocket + DSU
npm test              # 47-assert smoke suite (no real keyboard needed)
npm run ryujinx:check # is Ryujinx config in sync with mappings.js?
```

`public/` is the web controller (the supported third-party client). `app/`
is the Expo native app (gyro; run via expo start). `server/` is the Node
engine. `tools/` holds the Ryujinx setup tool, the motion patch and tests.
MIT licensed. Releasing: see [RELEASING.md](RELEASING.md).

## Connection setup dashboard

Open `http://localhost:3001/setup` on the Mac to scan the phone QR, inspect both players, and check the keyboard bridge, Accessibility permission, input profiles, and Ryujinx focus. Quit Ryujinx before using **Set up Ryujinx**. The full controller uses Pro Controller profiles; the optional sideways layout uses a left/right Joy-Con. Setup saves a timestamped Config.json backup and preserves other players and unrelated settings.

The web controller requires an explicit player choice on each launch, remembers the last choice, releases held inputs when hidden or when settings opens, and shows reconnect and recovery states. Native input pauses when the emulator loses focus. To use the existing keyboard bridge with another supported emulator, set `TARGET_APP=dolphin` (or `cemu`) when starting the server.

Startup does not open system permission dialogs automatically. Allow Accessibility for the app running the server in System Settings; the dashboard rechecks it. `ACCESSIBILITY_PROMPT=1 npm start` opts into the original guided permission prompt.

Regression checks: `npm test`, `npm run test:ryujinx`, and `npm run test:i18n`. Smoke-test DSU uses UDP 26797, separate from the normal server on 26760.
