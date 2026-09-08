# Local Swift motion implementation

Updated September 8, 2026. Phase 1 is implemented for testing; the physical Just Dance scoring gate is still open. This document distinguishes compiled/tested code from gameplay proof.

## Available now

- Native iPhone probe: `native/JoypadAir.xcworkspace`, scheme `JoypadAirProbe`, Swift 6.3.3 / Xcode 26.6, iOS 17+. See [device setup](local-device-setup.md).
- Shared Swift motion/protocol core with unit and transport tests. The phone sends raw Core Motion vectors with timestamps; the Mac applies the dance coordinate transform exactly once. See [coordinate contract](motion-coordinate-contract.md).
- Explicit `just-dance` handshake, portrait grip, gain 1, gyro degrees/second, acceleration including gravity in g.
- Node bridge supports the probe, ordered button events, diagnostic sample/sequence fields, duplicate suppression, reconnect reset, and a 250 ms stale-sensor stop.
- Local pairing bridge: one-use QR invitations, pinned HTTPS/WSS, saved phone credentials, live revocation, and independent phone liveness checks. The setup page supports English and Spanish. The unauthenticated input bridge binds only to loopback in paired mode.
- One-player Just Dance preset: right Joy-Con, DSU slot 0, localhost UDP 26760, sensitivity 100, deadzone 0 for the initial measurement.
- Separate local emulator based on Ryubing 1.3.3 revision `e2143d43bcb6762340d8a01f20e7b5fdf104f02f`. Keyboard motion survives JSON conversion and input-settings saves; its consumer processes UDP in order, rejects older sensor timestamps and expires stale input after 500 ms.
- Isolated emulator data at `.local/ryujinx-motion-data`. The existing emulator app and original data remain the fallback. Original Config.json was copied with SHA256 `6ed78f96b63d67ddf49e6d029e777decfa24df87b94afc43aa8afcf9b046ba7f`; a baseline copy is in `.local/baseline`.

The phone app is a motion proof with connection, sensor diagnostics and menu controls. Full calibration onboarding, Dance Mode, Swift Mac companion, native English/Spanish localization and long-session validation remain later stages in the [implementation plan](swift-local-just-dance-plan.md). The native app currently uses English; the Mac pairing page supports both languages.

The user subsequently requested full native menu controls and device pairing. Those are now part of the active implementation alongside the motion gate. See the device setup document for native installation and test evidence.

## Start the local test

For a single daily entry point, double-click **Joypad Air.command** in the project folder, or run `npm run play`. It starts or reuses the paired bridge, opens the pairing page, then launches the selected local emulator. Keep the bridge's Terminal window open, connect your saved Mac on the iPhone, and turn on **Enable Motion**. The launcher simplifies startup; it does not calibrate motion or change reconnect timing.

Use Terminal, which already had Accessibility permission during the working browser-button test:

```sh
cd /Users/juliansalas/Desktop/joypad-air
npm run start:paired
```

Leave that Terminal open. This command reads the isolated preset and stops on occupied ports instead of silently changing HTTP ports while DSU fails. Stop an older Joypad Air server with Ctrl+C in its own Terminal before starting another. No process is killed automatically. For Spanish startup text, use `JOYPAD_LANG=es npm run start:paired`.

Open `http://127.0.0.1:3444/` on this Mac. In the iPhone app choose **Pair a Mac → Scan Mac QR code**, review the Mac identity and confirm. Pairing text is available if scanning is inconvenient. The invitation lasts five minutes and works once. The saved connection uses HTTPS/WSS on port 3443; the phone must be on the same reachable local network. Removing a phone on this page revokes its credential and closes its active connection.

Pairing keys and hashed phone credentials live in `.local/pairing`; the phone stores its credential and certificate fingerprint in Keychain. Keep this identity between runs so saved phones recognize the Mac. No remote service receives controller traffic. A logging-only development preview on other ports is separate from this production test command and cannot control the game.

In a second Terminal:

```sh
cd /Users/juliansalas/Desktop/joypad-air
npm run ryujinx:launch
```

The launcher selects the exact local motion app and passes `--root-data-dir` for the isolated copy. It also creates `.local/portable` as a link to `ryujinx-motion-data` when that path is unused. Ryujinx discovers this folder beside the local app bundle, so subsequent Finder/Dock launches use the same dance profile. An existing portable folder is preserved; if the launcher reports a conflict, continue using the launcher explicitly.

On the iPhone, connect to the saved Mac, allow local networking if prompted, and enable motion after the dance profile is acknowledged. Keep the app in front. Camera permission is needed only for QR scanning. The tested Mac hotspot address during setup was `172.20.10.2`; the pairing invitation supplies current addresses.

The manual unpaired diagnostic route remains `npm run start:dance` with the Mac's private IP and port 3001 in the app's advanced connection controls. It is a separate launch mode; stop one before starting the other.

Click the Just Dance window to bring it forward before pressing A on the phone. The Mac bridge must report Accessibility granted. A bridge launched by Codex has a different macOS responsible-process permission context than Terminal; the earlier Codex-started process reported denied, while the user's Terminal reported granted.

## Checks and evidence

- 56 existing Node smoke checks passed (button ordering, takeover, protocol and regression behavior).
- 25 Node motion/preset/localization/pairing test groups passed. Motion integration used a real WebSocket and UDP receiver on temporary ports, with keyboard output disabled.
- Pairing tests use real TLS/WSS and the actual bridge. They cover certificate mismatch rejection, expired/replayed codes, bounded guessing attempts, local setup access, authenticated input, persisted hashed tokens, live revocation releasing held buttons, and expiry of a phone that stops answering pings.
- The native Swift encoder also passed its separate Node/DSU integration test in the parallel native task.
- Native Simulator pairing completed pinned HTTPS, saved the identity in Keychain, connected over authenticated WSS and received the exact dance-profile acknowledgment. Saved pairing survived app relaunch and a bridge restart. Native A/B/Plus, directional actions and joystick movement produced matching key press/release logs with no held keys left behind. The native UI also rejected expired invitations and a deliberately wrong certificate fingerprint. These checks used a logging-only bridge, not live game input.
- The Mac pairing page was checked in English and Spanish, including language persistence after reload.
- All 11 emulator contract checks passed, including real converter, settings-model, DSU consumer and single-right-Joy-Con six-axis checks. A live run exposed per-frame configuration resets; the corrected patch compares a copied value snapshot so unchanged frame updates retain the socket. Both repeated updates and in-place endpoint changes have regression assertions. A subsequent 15-second live emulator check retained exactly one DSU subscription after initial connection.
- The signed build was installed on the physical iPhone and launched successfully after developer trust was resolved. Actual phone setup and current native test counts are recorded in the device setup document. Installation alone is not game scoring evidence.

Run local code checks:

```sh
npm test
npm run test:motion
npm run test:ryujinx
npm run test:i18n
npm run test:pairing
```

For the emulator contract test, pass the source checkout used to build the app:

```sh
DOTNET_BIN="$PWD/.local/sdk/dotnet-9.0.317/dotnet" bash tools/ryujinx-build/test-local.sh /tmp/joypad-air-ryubing-e2143d4
```

The harness reads the actual built Release assemblies; build the matching source first. Its synthetic packets verify protocol and routing, not the game's scoring algorithm.

## Rebuild and recovery

A checksum-verified .NET 9.0.317 SDK is retained locally under `.local/sdk/dotnet-9.0.317`. The downloaded official manifest record is `.local/sdk/sdk-source.json`. The source archive hash is checked against Microsoft's release manifest before extraction.

```sh
DOTNET_BIN="$PWD/.local/sdk/dotnet-9.0.317/dotnet" npm run ryujinx:build
```

The build script clones into a fresh directory, checks the exact pinned revision, applies the patch, and builds only Apple Silicon. It runs the emulator contract test, prints the new app path, and records the selected build in `.local/emulator-build.json`. The launcher reads that manifest; `RYUJINX_MOTION_APP` can explicitly override it. The build never replaces an installed app or resets a reused checkout. It does not include a game downloader.

`npm run ryujinx:prepare` is first-time setup only. It copies existing local emulator data and refuses to overwrite an existing test directory. To reapply the isolated preset, quit the emulator and run:

```sh
npm run ryujinx:dance -- --config-dir "$PWD/.local/ryujinx-motion-data"
```

This backs up that copy's Config.json. It does not touch the original emulator data. For the original browser fallback, launch the installed stock Ryujinx and use the original server command `npm start`.

`.local/` is deliberately ignored by Git: it contains private local emulator data, saves, configuration backups, SDKs and built apps. Keep this directory local.

## Physical gate still required

1. Confirm roughly 60 Hz nonzero live phone samples and one stable emulator DSU subscription.
2. Verify still/face-up/face-down/portrait/rotation direction against the coordinate worksheet.
3. Use the phone's A button to navigate with the game in front.
4. Compare a stationary control interval with intentional movement during a real song.
5. Record the scoring result and errors. Complete a song, then test pause/background/reconnection.

Only after this passes do we move into the complete Swift apps and the longer calibration/networking phases. Matching hardware Joy-Con scoring, three complete songs, 30-minute reliability, battery use and latency tails remain unverified.
