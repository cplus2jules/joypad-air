# 🎮 joypad-air — iPhone as a game controller for macOS emulators

Turn your iPhone (or Android) into a wireless gamepad for **Ryujinx**,
**Dolphin** and **Cemu** on your Mac. Low-latency buttons over Wi-Fi plus
real **motion controls** (gyro) via the DSU/cemuhook protocol. Free, open
source, no ads, no tracking.

A.K.A. **"El Control Super Pro Max"** · Guía en español: [README.es.md](README.es.md)

## Why this exists

Every "phone as gamepad" project is Android→Windows. On macOS there was no
way to get buttons *and* motion into Ryujinx from an iPhone — iOS DSU apps
are motion-only, and the ones with buttons need a Windows-only companion.
joypad-air does both, macOS-first:

- **Buttons** → injected as keyboard events (nut-js / CGEventPost), the only
  input path Ryujinx supports on macOS without a physical controller.
- **Motion** → served as a DSU/cemuhook server on UDP 26760. Dolphin, Cemu
  and Citra consume it natively; for Ryujinx we ship a 40-line MIT patch you
  build locally (see below).

## Install (macOS)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/USER/joypad-air/main/install.sh)"
```

The script checks for Node ≥18 (opens the official installer if missing) and
drops a **"🎮 El Control"** launcher on your Desktop. Double-click it, grant
the Accessibility permission to Terminal the first time, scan the QR with
your phone, add it to your Home Screen — done. Every launch runs
`npx -y joypad-air@latest`, so updates are automatic.

Prefer manual? `npx -y joypad-air@latest` does everything except the
launcher.

## Features

- **Feel**: server-side analog→8-way conversion with radial + angular
  hysteresis (no direction flutter), SOCD cleaning, rolling d-pad, hair
  triggers, multi-touch that never drops your stick while you mash buttons.
- **Haptics**: multi-stage Taptic patterns per button type (native app),
  progressive haptics on the PWA.
- **Personalization**: player names, 8 Joy-Con-style color themes, stick
  sensitivity sliders, A/B·X/Y swap — synced live to the server.
- **Status you can see**: latency dot, "Ryujinx lost focus" banner,
  Accessibility-permission banner, player LEDs, live `/setup` dashboard.
- **Robust**: FIFO key queue (no stuck keys), heartbeat releases keys ≤10s
  after a phone dies, slot takeover, LAN-only connections, input validation.
- **Ryujinx auto-config**: `npm run ryujinx:setup` generates the keyboard
  profiles and patches `Config.json` (with backup) straight from
  `server/mappings.js` — both players, zero key collisions.

## Motion in Ryujinx (advanced)

Stock Ryujinx ignores DSU motion when buttons come from a keyboard backend
(verified in source). Build a patched "Ryujinx Motion.app" locally — we never
distribute emulator binaries:

```bash
brew install dotnet@9
bash tools/ryujinx-build/build-local.sh      # clones Ryubing, applies tools/ryubing-motion.patch, builds
npm run ryujinx:setup -- --motion --patched
```

Then toggle **GIRO** on the controller and aim with your phone in Zelda or
steer in Mario Kart.

## Two players

Each phone claims a slot (Player 1 / Player 2) mapped as an independent pad.
Known limitation: a few games (MK8, Mario Wonder) require physically distinct
HID devices for 2P and reject two keyboard-backed pads — Smash, Overcooked,
Stardew, Cuphead and most co-op games work great.

## Development

```bash
npm install
npm start             # server on :3001 — PWA + WebSocket + DSU
npm test              # 38-assert smoke suite (no real keyboard needed)
npm run ryujinx:check # is Ryujinx config in sync with mappings.js?
```

`public/` is the PWA (the supported client). `app/` is an optional Expo
native app (Expo Go can't open third-party projects on iOS, so it's for
development). `server/` is the Node engine. MIT licensed.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Controller "types letters" into random apps | Ryujinx lost focus — click its window (the controller shows a banner). |
| Connected but game doesn't react | Grant Accessibility to Terminal (System Settings → Privacy & Security). |
| Phone can't find the server | Same Wi-Fi? Guest networks isolate clients. iOS: Settings → Privacy → Local Network. |
| Remap keys | Edit `server/mappings.js`, run `npm run ryujinx:setup`. |
