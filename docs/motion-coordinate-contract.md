# Motion coordinate contract — feasibility probe

Profile: `just-dance`. Status: implemented and checked with synthetic fixtures; **physical grip and Just Dance scoring remain unverified**. This is the Phase 1 contract, not a completed dance-controller calibration.

## Ownership and boundaries

The Swift phone sends raw device-frame samples. The Node bridge applies the only phone-to-DSU transform. The separately patched Ryujinx consumes DSU using its existing conventions. Do not apply the transform again in the phone.

The proposed grip is portrait, in the right hand, with the top/earpiece toward the fingertips. Phone axes are +X toward its right edge, +Y toward its top, and +Z out of the screen. Screen orientation is locked to portrait. Use a secure grip/case for movement testing.

| Boundary | Acceleration | Angular velocity | Time |
| --- | --- | --- | --- |
| Core Motion | `gravity + userAcceleration`, both already in g | `rotationRate`, radians/second | Sensor `timestamp`, monotonic seconds |
| Swift → WebSocket | Device axes, g; no gravity subtraction or 9.81 conversion | Same axes × 180/π, degrees/second | Rounded integer microseconds, within JSON's safe-integer range |
| Node validation | Clamped to ±8 g per axis | Clamped to ±2000 °/s per axis | Safe nonnegative integer; DSU maintains a rebased timeline |
| Bridge → DSU | `(x, z, -y)` | `(pitch, yaw, roll) = (x, z, -y)`, gain 1 | DSU little-endian microseconds |
| Ryujinx CemuHook client | `(-DSU.x, DSU.z, -DSU.y)` | `(pitch, roll, -yaw)` | Received DSU timestamp |
| Ryujinx MotionInput | Negates the incoming acceleration | Applies configured deadzone and sensitivity | Integrates sample-time deltas |
| Npad six-axis state | Original phone `(x, y, z)` after these conversions | Phone `(x, -y, -z)` × 0.0027, before three-decimal truncation | Emulator-owned state delivery |

The last row is a derivation from the pinned source, assuming sensitivity 100 and deadzone 0. It describes what the code supplies; it does not establish that the game's expected physical grip matches the phone. The first MotionInput update initializes time before subsequent updates fill the acceleration/gyro state.

The bridge matrix is a proper orthogonal rotation with determinant +1:

```text
M = [ 1  0  0 ]
    [ 0  0  1 ]
    [ 0 -1  0 ]
```

Use the same matrix for gyro and acceleration. The old landscape profile's steering-specific roll reversal and default 2.2 multiplier are deliberately absent. Gyro fields must never contain attitude angles or a quaternion.

## Wire contract

Paired endpoint: `wss://MAC:3443/controller` with a per-phone Bearer header and a certificate pinned from the Mac's QR invitation. The paired Node service proxies these same messages to its loopback-only `ws://127.0.0.1:3001/?p=1` bridge. Connecting takes Player 1 from any previous client. See [device pairing](local-device-setup.md) for the HTTPS claim, Keychain storage, and revocation flow. The advanced direct probe endpoint remains `ws://MAC:3001/?p=1` and is unencrypted. Native endpoint parsing accepts private IPv4, loopback, link-local IPv4, or `.local` names.

```json
{"t":"hello","player":1,"motionProfiles":["just-dance"]}
{"t":"config","name":"Swift motion probe","motion":true,"orientation":"portrait","motionProfile":"just-dance"}
{"t":"config-ack","motion":true,"orientation":"portrait","motionProfile":"just-dance"}
{"t":"motion","gx":180,"gy":360,"gz":540,"ax":0.2,"ay":-0.4,"az":-0.8,"ts":1000000,"seq":1,"sessionId":"NEW-UUID-PER-CONNECTION"}
{"t":"btn","k":"a","d":true}
{"t":"btn","k":"a","d":false}
```

The hello and acknowledgment above show their relevant fields, not every bridge field. Accessibility can be `true`, `false`, `null`, or the string `"unknown"`; it is diagnostic information and must not break the handshake.

The probe first configures motion off. It requires the supported-profile advertisement and an exact acknowledgment before enabling sensors. An old bridge can still receive navigation controls, but the probe disables motion. A mismatched/missing acknowledgment terminates the session. Samples carry a new UUID per connection and an increasing sequence; duplicate/backward sample timestamps are dropped on the phone. The bridge suppresses duplicate/out-of-order sequences per WebSocket. A session identifier is diagnostic metadata, not authentication.

## Freshness, ordering, and lifecycle

- Core Motion requests 60 Hz on a dedicated serial callback queue. An `AsyncThrowingStream` retains at most the newest unconsumed sample. Measured delivery is displayed separately from the requested rate.
- The WebSocket has one sender. At most 32 control messages and one unsent motion frame are queued. Control frames keep FIFO order; motion can be replaced and is discarded if more than 100 ms old when selected for sending.
- Touch buttons send independent down/up frames, including drag-out and cancellation. VoiceOver activation sends a complete 100 ms tap. The radial right stick sends `{t:"stick",s:"R",x,y}` with screen-space positive Y downward and explicit `(0,0)` on release; accessible nudges last 180 ms. The buffer cannot coalesce a control release with motion.
- The probe sends a ping every 250 ms. It closes after two seconds without a valid pong, a send suspended for over one second, a full control queue, or a missing profile acknowledgment. Round trip uses the phone's monotonic clock and is **not** one-way sensor-to-emulator latency.
- The Node motion watchdog independently quiesces stale motion after 250 ms. Production thresholds still require measurement; TCP can buffer below the app's bounded queue.
- On app inactivity, backgrounding, lock, sensor error, or explicit disconnect, sensors stop, all local pending input is discarded, and the socket closes. The bridge releases held keys and neutralizes motion on close; its independent watchdog covers delayed/missing close delivery.
- Reconnecting starts a new session and leaves motion off. Old reader, writer, tap, and sensor callbacks cannot mutate the new session.
- Range exceedances are counted before the bridge clamps values. No additional bias calibration or dead zone is applied in Swift. The UI updates sensor statistics at most five times per second.

## Physical validation worksheet

Record these with `node tools/dsu-test-client.mjs --pose` while the probe is the only Player 1 controller. Expected values below are mathematical fixtures, not measured sensor evidence.

| Phone pose at rest | Phone gravity `(x,y,z)` | Expected DSU acceleration `(x,y,z)` |
| --- | --- | --- |
| Screen up | `(0,0,-1)` | `(0,-1,0)` |
| Screen down | `(0,0,+1)` | `(0,+1,0)` |
| Top/earpiece up | `(0,-1,0)` | `(0,0,+1)` |
| Top/earpiece down | `(0,+1,0)` | `(0,0,-1)` |
| Right edge up | `(-1,0,0)` | `(-1,0,0)` |
| Right edge down | `(+1,0,0)` | `(+1,0,0)` |

For each positive and negative right-hand-rule rotation: phone X maps to DSU pitch, phone Y maps to negative DSU roll, and phone Z maps to DSU yaw. At rest expect acceleration magnitude near 1 g and gyro near zero. Check quarter turns, slow rotations, quick movement, signs, largest sample gap, and range-exceedance counts. Preserve gravity; gyro-bias calibration and orientation reset are separate later work.

Then compare stationary and active repeated game segments, finish a song, and record movement-dependent scoring. Simulator and synthetic fixtures cannot pass this gate.

## Sources

- Installed Xcode 26.6 / Swift 6.3.3 headers: `CMMotionManager.h` and `CMDeviceMotion.h` verify the callback API and `gravity + userAcceleration` contract.
- [Apple CMDeviceMotion](https://developer.apple.com/documentation/coremotion/cmdevicemotion), [sensor timestamp](https://developer.apple.com/documentation/coremotion/cmlogitem/timestamp), and [update interval](https://developer.apple.com/documentation/coremotion/cmmotionmanager/devicemotionupdateinterval).
- Pinned Ryubing commit `e2143d43bcb6762340d8a01f20e7b5fdf104f02f`: `src/Ryujinx.Input/Motion/CemuHook/Client.cs`, `src/Ryujinx.Input/Motion/MotionInput.cs`, and `src/Ryujinx.Input/HLE/NpadController.cs` inspected locally. The local patch may change lifecycle handling; recheck these mappings when updating the emulator.
