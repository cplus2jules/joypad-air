# Joypad Air verification — 2026-09-07

## Visual reference

Nintendo's official front-view Neon Red/Neon Blue Joy-Con photo was inspected in the browser. The playable UI follows its narrow silhouettes, inner rails, curved outside edges, vertically arranged controls, and dark recessed buttons. The rejected stretched color panels have been replaced.

## Verified locally

- Browser: desktop plus 844×390 landscape and 390px portrait. At 844×390 the stick and D-pad surfaces are 112px, separated vertically with no intersecting bounds or horizontal overflow. Portrait provides a working return-to-player-selection action.
- Shared English/Spanish work: language switching, persisted preferences and player names, settings labels, and mobile layouts checked by the parallel localization task. Its logging-backend A-button test produced matching DOWN/UP Z events after each language switch without reconnecting.
- 51 controller/DSU smoke assertions pass, including foreign-origin WebSocket rejection and guarded setup endpoints.
- 6 Ryujinx fixture tests pass: defaults/reordering, real mapping mismatches, exact backup, preserving unrelated players/settings, refusing running-emulator writes, unsupported/corrupt configuration.
- 7 localization tests pass. Native iOS and Android bundles built successfully on Expo SDK 54 in the localization task after the Pad changes.
- `git diff --check` and JavaScript syntax checks pass.

## Installed Ryujinx

Ryujinx 1.3.3 uses configuration schema 70. Both players were changed from sideways Joy-Cons to Pro Controller profiles for the full web controller. The original configuration backup is `~/Library/Application Support/Ryujinx/Config.json.backup-1788788976839`.

The setup page applied profiles successfully while Ryujinx was closed (additional backup `Config.json.backup-1788789098837`), then correctly refused an apply while Ryujinx was running. Computer use confirmed both players load Pro Controller with the generated key assignments. `npm run ryujinx:check` passes after reopening Ryujinx.

## Remaining verification boundary

macOS reports Accessibility denied for the server's responsible application. User permission was requested before granting that OS access. No successful real game input or gyro gameplay is claimed. A phone over actual Wi-Fi and a native device gyro run are also not yet verified; the available browser checks used the local Mac. Stock Ryujinx still needs the existing motion patch for DSU with keyboard input.
