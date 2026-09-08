# Install, pair, and use the native controller

The iPhone app now includes a menu joystick, navigation buttons, QR pairing, remembered Macs, and the Core Motion probe. These controls and pairing were brought forward at the user's request. Calibration, a native Swift Mac companion, native localization, and real Just Dance scoring validation remain separate work. Keep the existing browser/Expo clients and stock emulator available.

## Install on iPhone

Open `native/JoypadAir.xcworkspace`, choose **JoypadAirProbe**, select the phone, and run. The app targets iPhone on iOS 17+ with Xcode 26.6 / Swift 6.3.3 and no third-party Swift packages. Choose your development team in Signing & Capabilities; the project deliberately does not pin a personal team. Bundle ID: `com.juliansalas.joypadair.probe`.

1. Connect and unlock the phone. Trust the Mac if prompted.
2. Enable **Settings → Privacy & Security → Developer Mode**, restart, unlock, and confirm **Turn On**.
3. Run the scheme in Xcode. Automatic signing can register the phone and create its development provisioning profile.
4. If iOS reports **Untrusted Developer**, open **Settings → General → VPN & Device Management**, select your own **Apple Development** profile, and trust it. Developer Mode and trusting the developer are separate steps.
5. Rebuild/reprovision when a Personal Team profile expires. [Apple documents Personal Team limits here](https://developer.apple.com/help/account/basics/about-your-developer-account).

This machine uses a per-command developer directory because the global Xcode selection may point to Command Line Tools:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -workspace native/JoypadAir.xcworkspace -scheme JoypadAirProbe \
  -configuration Debug -destination 'platform=iOS,id=YOUR_DEVICE_UDID' \
  -derivedDataPath /tmp/joypad-air-probe-signed \
  DEVELOPMENT_TEAM=YOUR_TEAM_ID -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration build
```

## Pair with the Mac

For daily use, double-click **Joypad Air.command** in the project folder (or run `npm run play`). It opens Terminal, starts or reuses the paired bridge, opens the pairing page, and launches the selected local Ryujinx Motion build. Keep the bridge's Terminal open while playing. Connect the remembered Mac on the iPhone and enable motion each time. To place the launcher on the Desktop, make a Finder alias rather than moving it out of the project. The separate manual commands below remain available.

Coordinate the bridge transition with any active controller session. The paired entry point owns its internal bridge; do not leave a second unauthenticated bridge exposed on the network.

1. In a Terminal with the existing keyboard/Accessibility permissions, run `npm run start:paired` from the repository root. Keep Terminal open.
2. Open the printed **local pairing page** on the Mac, normally `http://127.0.0.1:3444/`.
3. Keep iPhone and Mac on the same Wi-Fi or Personal Hotspot. On iPhone tap **Pair a Mac → Scan Mac QR code**. Allow Camera and Local Network access when prompted.
4. Scan the QR on the Mac. Confirm the decoded Mac name, then tap **Pair and connect**. Alternatively use **Copy pairing code** on the Mac and paste it into the phone's pairing form, then **Review code**. The code is one-use and expires after five minutes.
5. Confirm **Connected · Player 1**. The phone stores the certificate identity and per-phone token in Keychain. After restarting the app or bridge, tap the remembered Mac to reconnect. Connecting takes Player 1 from any previous controller.
6. The Mac pairing page lists paired phones and can remove one immediately. On iPhone, disconnect first, tap the Mac's management button, then **Forget Mac** to remove its local record. Forgetting locally does not revoke the Mac-side token; use the Mac page for that.

Bonjour advertises `_joypadair._tcp`; nearby names help locate the bridge but do not establish trust. Trust comes from the scanned/copied invitation and explicit Mac-name review. The invitation pins the SHA-256 digest of the Mac's certificate. Claims use pinned HTTPS; controller messages use pinned WSS with a Bearer header. Tokens never appear in controller URLs or UserDefaults. The Mac stores token hashes and keeps its legacy internal controller socket on loopback.

The paired service normally uses TLS port **3443**, Mac-only setup port **3444**, and internal bridge port **3001**. Use the actual printed addresses if configured differently. A physical iPhone's `localhost` is the phone itself.

Camera denial or unsupported scanning has a paste fallback. Local Network denial has inline guidance. If a Mac is unavailable, open its paired bridge and check the shared network. If its certificate identity changed, pair again. These are local connections; the app does not enable blanket arbitrary network loads.

## Navigate and test motion

The connected screen keeps the main controls together:

- Drag the right joystick to move through menus; lift to return to center. VoiceOver provides directional nudge and release actions.
- **A** selects; **B** goes back. **X/Y**, **+/−**, **SL/SR**, and a four-way D-pad are available.
- Expand **Shoulder buttons** for **L/R/ZL/ZR**. Touch buttons support independent press, release, drag-out, and cancellation, so combinations such as SL + SR can be held. VoiceOver activation sends a bounded tap.
- Keep the separately built Ryujinx Motion window focused so it receives keyboard-backed controls. Button meanings depend on the game's current menu.
- **Connection & diagnostics** shows profile acknowledgment, keyboard readiness, round-trip time, sensor delivery, and motion values.
- **Haptic feedback** provides light button feedback, a tick when the stick engages, connection/motion confirmation, and lock/unlock feedback. The switch saves your preference. It is local controller feedback; the game does not send rumble or score events back to the phone.
- After enabling Motion, tap **Dance Lock** before dancing. It releases buttons, centers the stick, and covers the controls with a dark screen while motion continues. Hold **Unlock controls** for 1.5 seconds to return; a short tap does nothing. VoiceOver provides a labeled activation action. Locking the actual iPhone with its side button or leaving the app still disconnects; Dance Lock is an in-app touch guard.
- Dance Lock is manual. The current bridge has no song-start, choreography, or score messages. Watch song progress and scores on the Mac. An automatic feature would need a separate source of game state, such as emulator instrumentation or a validated screen-reading integration.

Enable **Motion** only after the bridge acknowledges the exact `just-dance` / portrait profile. Hold the phone in the documented portrait grip. Verify approximately 1 g at rest and near-zero stationary gyro; use the six-face and rotation worksheet in [motion-coordinate-contract.md](motion-coordinate-contract.md). Finish with a real game test alongside the emulator task.

Locking the phone or switching apps stops motion and disconnects. Reconnect and explicitly enable motion again. Disconnection, stale input, and socket watchdogs release held controls. The advanced direct-connection disclosure remains available for a trusted development network; it is unencrypted and does not provide saved pairing.

## Verification

```sh
CLANG_MODULE_CACHE_PATH=/tmp/joypad-air-swift-module-cache \
SWIFTPM_MODULECACHE_OVERRIDE=/tmp/joypad-air-swift-module-cache \
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun swift test --package-path native/Packages/JoypadCore \
  --scratch-path /tmp/joypad-air-swift-probe-build --manifest-cache local --disable-sandbox

node native/tools/probe-wire-check.mjs \
  /tmp/joypad-air-swift-probe-build/debug/ProbeWireFixture

node --test tools/pairing-test.mjs
```

Use ordinary ad-hoc signing for Simulator pairing tests (`CODE_SIGNING_ALLOWED=YES`, `CODE_SIGN_IDENTITY=-`, and a development team), because an unsigned Simulator build cannot access the app's Keychain. The Simulator has no real motion sensor or camera; pasted invitations exercise its real native HTTPS/Keychain/WSS path.

Recorded on **2026-09-08, Asia/Manila**:

- 33 Swift Testing groups pass, covering motion conversions, sequence/time validation, FIFO controls, stale-motion handling, all navigation IDs, radial stick clamping, invitation validation, identity-bound encrypted endpoints, short/repeated button timing, and Dance Lock queue cleanup.
- Swift encoder → isolated Node bridge → DSU integration passes: profile negotiation, ordered A press/release, axes/units/CRC, duplicate rejection, and stale-motion neutralization.
- Simulator builds and renders the full controls. Runtime testing caught and fixed the Objective-C `release` selector collision in the hold-button wrapper; it now uses `endPress`.
- Actual Simulator pairing against the isolated TLS bridge succeeds through certificate pinning, HTTPS claim, Keychain save, WSS authentication, Player 1 hello, and exact profile acknowledgment.
- The native UI rejects an expired invitation before connecting and rejects an intentionally wrong certificate pin during TLS verification.
- Saved pairing survives app reinstall/relaunch and a Mac bridge restart; tapping the remembered Mac reconnects.
- Native A, B, Plus, accessible stick-up, and direct rightward stick drag produced matching DOWN/UP events. The bridge reported no held buttons/stick directions, queue depth zero, and no invalid messages.
- Signed iPhone 16 Pro / iOS 26.5 build verifies, installs, and launches successfully; the final update was reinstalled and launched at 01:34:58. The earlier untrusted-developer issue is resolved.
- Physical camera scanning, physical multi-touch combinations, real sensor delivery, and movement-dependent game scoring require the phone/game session and must not be inferred from Simulator results.

### Physical-phone motion crash and missed taps, September 8

The 01:37:41 iPhone crash report identifies `closure #1 in MotionCapture.start()` on `JoypadAir.sensor`, followed by Swift's executor check and `_dispatch_assert_queue_fail`. The Objective-C Core Motion callback inherited `MainActor` despite being delivered on the sensor queue. It now explicitly uses `@Sendable`, captures only the stream continuation, and copies sensor objects into `MotionSample` values on that queue. Compiler SIL confirms that the corrected callback is nonisolated and contains no executor assertion. This follows the [Swift migration guidance for callbacks that cross isolation boundaries](https://www.swift.org/migration/documentation/swift-6-concurrency-migration-guide/incrementaladoption/).

Native control buttons now disable their enclosing scroll view's delayed touch delivery. Each button also preserves a minimum 100 ms down interval and 50 ms up interval before a repeated press. Down events start immediately when eligible; long holds release immediately once the minimum is met. The queues are independent, bounded, and discarded on disconnect, so joystick input and simultaneous buttons remain independent. Eight new timing tests cover short touches, holds, repeat spacing, duplicates, delayed processing, simultaneous buttons, disconnect reset, and queue overflow.

The corrected signed device build succeeded, installed on the connected iPhone 16 Pro at 01:45, and launched at 01:46. The Swift-to-Node/DSU integration check passed. The user then confirmed motion and single taps worked. The live bridge received 2,702 phone motion samples with no rejected sequences or invalid messages; a live snapshot showed about 34 Hz. This verifies delivery, not calibration or Just Dance scoring.

The user also reported a joystick glitch while holding it and tapping another control/modal. The follow-up changes the stick from a SwiftUI drag gesture to a UIKit control that tracks the original touch identity. Other fingers cannot change its reference point or release it; cancellation, removal, and disconnect explicitly center it. The signed build passes and was installed and launched on the iPhone at 01:55. The exact multi-touch/modal sequence still needs physical confirmation.

### Save a motion trace

The bridge's live status does not retain sensor history. Record an explicit, bounded local trace while the iPhone is connected and Motion is enabled:

```sh
node tools/capture-motion.mjs --seconds 30
```

The recorder writes `trace.jsonl` and `summary.json` under the printed `.local/diagnostics/motion-...` directory. It records every received DSU sample plus periodic controller state, including held keys and stick directions. The summary includes sample count, measured rate, sensor/receive intervals, acceleration and gyro magnitudes, and packet integrity/order checks. It does not save pairing credentials, take Player 1, or send game input. Use `--output PATH` to choose a directory, `--slot 0` for Player 1, and `--port`/`--status-port` for a separate bridge. Captures last at most five minutes and can be ended with Ctrl+C.

The recorder itself adds one DSU subscriber; its presence is not emulator consumption evidence. Sensor and receive clocks are not synchronized, so interval measurements are not one-way latency. Sensor timestamps follow the bridge's rebased timeline. The trace has no automatic pose, choreography, or score labels. Match a recording to the physical worksheet and note the game segment separately.

Initial 20-second and 60-second capture attempts occurred after the phone disconnected: both contain status records and **zero motion samples**. A separate synthetic stream validates the recorder; synthetic data is not physical calibration evidence.

### Dance Lock and haptics follow-up

The user subsequently confirmed that the tracking worked well in Just Dance. That is a successful user-reported game test; no score telemetry was captured by the bridge.

The Dance Lock update passes the signed device build, 33 Swift tests, and Swift-to-Node/DSU integration. A separate Simulator fixture compiles the actual app views and exercises the real `ProbeSession` methods with synthetic connected state: queued inputs are removed, A is released, the stick is centered, new inputs are blocked, and motion remains enabled after unlock. The rendered screen was checked against the reference below. A brief screen tap leaves it locked; the accessibility activation returns to the controller with Motion still enabled. The saved haptics switch changes both ways. Simulator cannot verify the tactile sensation or physical motion.

Reference lock: preserve this app's system typography, native grouped controller, system action color, and 44-point minimum controls. The locked state uses Apple's black-canvas/system-type reference (`c1811968-89c8-4c63-9ffc-aaeaa204ca4f`), borrowing only sparse secondary copy from Cron (`0528b40d-d5ef-4783-9206-d42fa97ad1d2`). The [Train Fitness session confirmation](https://refero.design/screens/e65bd141-bd8b-439c-ab43-f4bf9a59cb2b) informs deliberate exit rather than a casual close target. Native SF Symbols supply the lock and connection status; there is no decorative imagery. White/gray text belongs to the black lock screen, semantic green/amber indicates sample freshness, and a single large hold target is the exit. The manual lock and continued motion follow the user's request and the project's Dance Mode plan.
