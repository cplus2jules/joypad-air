# 🎮 El Control Super Pro Max

Convierte tu iPhone (o Android) en un mando inalámbrico para **Ryujinx**,
**Dolphin** y **Cemu** en tu Mac. Botones de baja latencia por WiFi + control
por movimiento (giroscopio) vía protocolo DSU/cemuhook. Gratis, open source,
sin anuncios y sin tracking.

> English README: [README.md](README.md)

## Requisitos

- Un Mac (Apple Silicon o Intel)
- Un iPhone o Android
- Ambos en la **misma WiFi** (la de casa — las redes "de invitados" suelen
  aislar los dispositivos entre sí y no funcionará)

## Instalar (una sola vez)

1. Abre **Terminal** (⌘+Espacio, escribe "Terminal", Enter), pega esta línea
   y presiona Enter:

   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/USER/joypad-air/main/install.sh)"
   ```

   ¿Quieres ver qué hace antes de correrlo? El script es [install.sh](install.sh).

2. Si no tienes Node, se abrirá el instalador oficial: dale "Continuar" hasta
   el final y vuelve a la Terminal — el script sigue solo.

## Jugar

1. Doble click en **🎮 El Control** (en tu Escritorio).
2. La primera vez macOS abrirá "Privacidad y seguridad → Accesibilidad":
   activa la casilla **Terminal** y vuelve — el programa espera y continúa
   solo. (Si el firewall pregunta por "node", dale Permitir. El permiso de
   Accesibilidad se concede a toda la Terminal: es lo que permite inyectar
   las teclas en el emulador.)
3. Escanea el **QR** con la Cámara del iPhone → se abre en Safari → botón
   Compartir → **"Agregar a pantalla de inicio"**. Ábrelo desde el icono:
   ya tienes el mando a pantalla completa.
4. Abre **Ryujinx** y juega (El Control ya dejó configurados los mandos).
   Para parar: cierra la ventana de la Terminal.

**Actualizar:** no haces nada — cada vez que abres 🎮 El Control se usa
automáticamente la última versión.

## Panel de estado

Con el server corriendo, abre <http://localhost:3001/setup>: checklist en
vivo de permisos, foco de Ryujinx, jugadores conectados, latencia y motion.

## Control por movimiento (giroscopio)

El server publica el motion de tu teléfono por el protocolo **DSU/cemuhook**
(puerto 26760):

- **Dolphin / Cemu / Citra**: lo aceptan de fábrica (en Dolphin: Alternate
  Input Sources → DSU Client → `127.0.0.1:26760`).
- **Ryujinx**: el build oficial ignora el motion cuando los botones van por
  teclado. Modo avanzado: compila un Ryujinx con nuestro parche de ~40 líneas
  (MIT) en tu propia máquina:

  ```bash
  brew install dotnet@9
  bash tools/ryujinx-build/build-local.sh   # → "/Applications/Ryujinx Motion.app"
  npm run ryujinx:setup -- --motion --patched
  ```

  Después activa **GIRO** en el mando y juega Zelda/Mario Kart apuntando con
  el teléfono. (No distribuimos binarios del emulador; el script compila
  desde el código fuente del fork Ryubing.)

## Dos jugadores

Cada teléfono elige su slot (Player 1 / Player 2) y queda mapeado como un
mando independiente. Limitación conocida: algunos juegos (Mario Kart 8,
Mario Wonder) exigen dispositivos físicos distintos para 2P y no aceptan dos
mandos respaldados por el mismo teclado — funciona perfecto en Smash,
Overcooked, Stardew, Cuphead y similares.

## Problemas frecuentes

| Síntoma | Causa y arreglo |
|---|---|
| El mando "escribe letras" en el Mac en vez de mover el juego | Ryujinx no tiene el foco: haz click en su ventana. El mando te avisa con un banner. |
| Conectado pero el juego no responde | Falta el permiso de Accesibilidad (el banner del mando y `/setup` te lo dicen). |
| El iPhone no encuentra el server | ¿Misma WiFi? ¿Red de invitados? En iOS: Ajustes → Privacidad → Red local → permite Safari. |
| Quiero cambiar las teclas | Edita `server/mappings.js` y corre `npm run ryujinx:setup`. |

## Desarrollo

```bash
npm install
npm start            # server en :3001 (PWA + WS + DSU)
npm test             # smoke tests (38 asserts, sin teclado real)
npm run ryujinx:check  # ¿la config de Ryujinx está sincronizada?
```

La app nativa (Expo, `app/`) es opcional — la PWA es la vía soportada para
terceros. Licencia MIT.
