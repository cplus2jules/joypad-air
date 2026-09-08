# Joypad Air interface

Build target: the existing dark Joy-Con interface, reworked as a usable hardware control surface. Direct implementation follows the user's request to redesign and test the app.

Primary reference: [Elektron](https://elektron.se), Refero style 362d9644-ce48-40af-8c2a-35753ec54b5e. Preserve graphite surfaces, compact Helvetica typography, functional readouts, white primary actions, and restrained chrome.

Borrow only: [Analogue](https://analogue.co) supplies isolated hardware presentation; [Teenage Engineering](https://teenage.engineering) supplies precise spacing and small technical labels. The [Nothing QR dialog](https://refero.design/pages/afbf86f7-4d59-4875-b863-90cd2c49d210) supplies a high-contrast QR tile with an adjacent fallback link.

| Decision | Source / role | Implementation |
| --- | --- | --- |
| Near-black canvas, graphite panels, white text | Elektron control panel | #101112, #1a1c1e, #eeeef2; Helvetica Neue with system fallbacks |
| Saturated red/cyan | Existing Joy-Con theme identity | Controller shells and player identification only; green/amber reserved for state |
| Controller first | User's play goal, Analogue product presentation | Functional controls provide the visual centerpiece; no stock or generated hero imagery |
| Pairing checklist and QR | Nothing screen, existing bridge constraints | Phone connection, input profile, permission and focus each have real status |
| Touch and keyboard access | Refero craft details | Large targets, visible focus, modal focus management, reduced motion |
| Honest connection state | Existing keyboard/DSU architecture | Wi-Fi connection is distinct from emulator readiness; gyro limitations stay explicit |

Reject: blurred decorative blobs, gradient headlines, fake latency, unsupported Bluetooth pairing claims, and automatic slot takeover on page reload.

## Revised physical reference (user correction)

The user rejected the initial oversized colored panels. The final controller follows Nintendo's [official front-view Joy-Con photograph](https://assets.nintendo.com/image/upload/ar_16%3A9%2Cb_auto%3Aborder%2Cc_lpad/b_white/f_auto/q_auto/dpr_1.5/ncom/en_US/products/accessories/nintendo-switch/controllers/joy-con-controllers/joy-con-neon-red-neon-blue/104882-nintendo-switch-joy-con-red-blue-1200x675), visually inspected in the browser. Preserve the narrow body, flat inner rail, curved outer ends, offset minus/plus, vertically aligned sticks/button diamonds, and textured dark button materials. Touch viewports widen the shells to keep input targets usable. The rendered controls remain interactive CSS/HTML rather than flattened photo overlays.
