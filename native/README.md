# Joypad Air native controller and motion probe

Open **JoypadAir.xcworkspace** in Xcode and choose **JoypadAirProbe**. The iPhone app pairs with the Mac's local bridge, remembers its identity securely, provides a menu joystick and navigation buttons, and streams Core Motion after the bridge acknowledges the `just-dance` profile. Navigation and pairing were brought forward from the plan at the user's request; actual game scoring remains unverified.

- [Install, pair, and verify](../docs/local-device-setup.md)
- [Sensor, wire, and coordinate contract](../docs/motion-coordinate-contract.md)
- [Master implementation plan](../docs/swift-local-just-dance-plan.md)

`Packages/JoypadCore` contains sensor conversions, wire messages, safe endpoints, invitation parsing, session sequencing, bounded output buffering, and Swift Testing tests. `iOS/JoypadAirProbe` owns Core Motion, the ordered WebSocket sender, lifecycle cleanup, touch controls, Bonjour browsing, the QR scanner, pinned TLS, and Keychain persistence. The Mac pairing service is currently Node; no Swift Mac companion exists yet.

## Reference lock

Use native grouped iOS surfaces, system typography, clear state text, and compact controls. Keep the connected Mac row short so the joystick, ABXY, pause, SL/SR, and D-pad fit on the connected screen. Put connection diagnostics and extra shoulders behind disclosures. Preserve Dynamic Type, dark mode, at least 44 pt buttons, and VoiceOver actions.

| Decision | Evidence | Role |
| --- | --- | --- |
| Grouped device state and settings | [Telegram connected-device screen](https://refero.design/screens/18e53b31-8dcc-40ff-8d7a-d8ff56a2ac4d) | Connected-device hierarchy |
| Scan or paste, then review the decoded identity | [Fuse QR selection flow](https://refero.design/flows/8737) | Pairing entry alternatives and confirmation sequence only |
| System type and interactive-color actions | Apple reference `c1811968-89c8-4c63-9ffc-aaeaa204ca4f` | Native legibility and action color |
| Monospaced diagnostic values | Ui reference `c14c0a94-1037-449e-bf5b-4cb972656ac7` | Technical data readability |
| 44 pt touch targets, labeled fields, inline errors | Refero craft-details | Touch and accessibility |

The QR flow confirms a specific Mac before trust is saved. Discovery alone never authorizes a connection. Error text should lead to a concrete recovery action; a successful socket connection must not be described as successful game scoring.
