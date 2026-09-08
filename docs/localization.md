# English and Spanish

The web controller, setup dashboard, and Expo app share `public/i18n/messages.js`.
Device language selects the initial language (`es-*` selects Spanish; other languages
use English). A manual choice overrides the device language and is saved locally.
The web controller and setup page share a preference on the same origin. The native
app saves its own choice in the existing settings store.

Choose **English** or **Español** on the connection screen or in Settings / Ajustes.
Changing language updates the current screen without reloading or reconnecting.
Player names, theme identifiers, controller buttons, keyboard mappings, and network
message values retain their meaning in either language. Existing saved names are
preserved; unnamed players display Player 1 / Jugador 1 and Player 2 / Jugador 2.

## Terminal

The server and Ryujinx setup command use `server/i18n.js`. Terminal output defaults
to English regardless of the Mac's system locale. Use `JOYPAD_LANG=es npm start`
for Spanish or `JOYPAD_LANG=en npm start` for English. The same variable applies to
`npm run ryujinx:setup` and `npm run ryujinx:check`. Restart to apply a change.

This includes startup and iPhone instructions, Accessibility help, keyboard errors,
HTTP port fallback, DSU motion errors, player connection logs, and shutdown text.
Add matching keys and placeholders to both terminal catalogs for new messages.
Backend identifiers, WebSocket codes, JSON output, OS error details, and player names
remain independent of the terminal language. Phone and setup-page preferences do
not change the server's logs.

## Adding text

- Add matching English and Spanish keys to the shared catalog. Use `{name}`-style
  interpolation for values; keep sentences together so translations can reorder them.
- Web: mark plain text with `data-i18n="key"` or use `t('key', values)` for live status.
  Use `data-i18n-aria-label`, `data-i18n-placeholder`, or `data-i18n-alt` for attributes.
  Translation text is inserted with `textContent`, never HTML.
- Native: get `t` from `useI18n()` inside the component. Keep display labels separate
  from connection-state identifiers. The Metro watch folder exposes only the shared
  dependency-free catalog; Expo remains on SDK 54.
- If a screen adds dynamic status, rerender that status in `onLanguageChange` as well
  as when data arrives. Do not reconnect the socket to change labels.

The visual target is the existing controller and its current UI refinement. Language
names stay in their own language, with an explicit selected state. This adapts the
language-selection patterns in [Klarna](https://refero.design/pages/101766c2-4348-4476-a224-64987084643c)
and [Instagram](https://refero.design/pages/1afd87ce-03f3-4a8f-9708-8bdbc667a4f2).

## Validation

Run `npm run test:i18n` for catalog coverage, interpolation, fallback behavior,
language persistence, storage restrictions, cross-tab updates, Terminal permission
help, and Ryujinx CLI language selection. Run `npm test` for controller protocol
regressions and server startup, port conflicts, and shutdown in English and Spanish.
Export the native bundles from `app/` with
`npx expo export --platform ios --platform android`.

Browser QA should cover both languages on the connection screen, controller settings,
and setup dashboard; verify reload persistence, saved player names, and continued
controller input after switching languages. Check narrow portrait and landscape
viewports for translation overflow. Gyro and physical iPhone behavior require a device.
