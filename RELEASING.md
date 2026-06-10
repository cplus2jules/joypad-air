# Releasing / mantenimiento

## Estado actual de distribución

- Los usuarios instalan vía `install.sh`, cuyo launcher ejecuta
  `npx -y github:mindavidev/joypad-air` → npm resuelve la rama `main` en
  cada arranque (= auto-update con cada push a main, sin publicar nada).
- Ventaja: cero infraestructura. Coste: el primer arranque de cada versión
  descarga el repo (~unos segundos más).

## Publicar en npm (opcional, recomendado si hay tracción)

1. `npm login` (cuenta personal).
2. Subir versión: `npm version patch` (o minor/major) — commitea y taggea.
3. `npm publish` (el `files` whitelist ya limita el paquete a ~62 kB).
4. Cambiar el spec del launcher en `install.sh`:
   `PKG_SPEC="joypad-air@latest"` — y avisar en el README que el comando
   manual es `npx -y joypad-air@latest`.
5. `git push && git push --tags` + crear release en GitHub
   (`gh release create vX.Y.Z --generate-notes`).

## Checklist antes de cada release

- `npm test` → 47/47.
- `npm run ryujinx:check` con una config generada por la versión anterior
  (compatibilidad del schema; el tool avisa si `version` ≠ 70).
- `cd app && npx expo export --platform ios` compila (si se tocó `app/`).
- `npm pack --dry-run` sin archivos inesperados.
- Nada de Nintendo en el repo (ni keys, ni firmware, ni binarios del
  emulador — el motion va como patch + build local, ver
  `tools/ryujinx-build/`).

## Si Ryubing publica una versión nueva

`tools/ryubing-motion.patch` está pineado a la 1.3.3. Para re-basarlo:
clonar el tag nuevo, `patch -p1 --dry-run` — si no aplica limpio, los 3
puntos del parche son: propiedad `Motion` en `GenericKeyboardInputConfig`,
helper `GetMotionConfig` en `NpadController` (3 usos) y el switch del
sanity-check en `Client.HandleResponse`. Regenerar el diff y actualizar
`RYUBING_REF` en `tools/ryujinx-build/build-local.sh`.
