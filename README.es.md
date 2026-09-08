# 🎮 El Control Super Pro Max

Convierte tu iPhone (o Android) en un mando inalámbrico para **Ryujinx**,
**Dolphin** y **Cemu** en tu Mac. Botones de baja latencia por WiFi +
**control por movimiento real (giroscopio)** vía protocolo DSU/cemuhook.
Gratis, open source, sin anuncios y sin tracking.

> English README: [README.md](README.md)

## App local en Swift para Just Dance

El mando nativo para iPhone, el puente de emparejamiento local y una versión independiente de Ryujinx con movimiento están disponibles para pruebas. Consulta el [estado de implementación](docs/motion-implementation-status.md), la [guía de instalación en iPhone](docs/local-device-setup.md) y el [contrato de sensores](docs/motion-coordinate-contract.md). Ejecuta `JOYPAD_LANG=es npm run start:paired` en Terminal y abre el enlace de emparejamiento que aparece. Todavía falta verificar la puntuación real en Just Dance; el plan completo de las apps Swift sigue en desarrollo.

Usa `npm run start:dance` para el perfil aislado de Just Dance y `npm run ryujinx:launch` para la versión local seleccionada del emulador. La configuración original del navegador sigue disponible. Los datos privados y las compilaciones locales se guardan en `.local/`, excluido de Git.

## Requisitos

- Un Mac (Apple Silicon o Intel)
- Un iPhone o Android
- Ambos en la **misma WiFi** (la de casa — las redes "de invitados" aíslan
  los dispositivos entre sí y no funcionará)

## Instalar (una sola vez)

Abre **Terminal** (⌘+Espacio, escribe "Terminal", Enter), pega esta línea y
presiona Enter:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/mindavidev/joypad-air/main/install.sh)"
```

¿Quieres ver qué hace antes de correrlo? Es [install.sh](install.sh): comprueba
Node (si falta, abre el instalador oficial — dale "Continuar" y vuelve) y crea
**🎮 El Control** en tu Escritorio. Nada más.

## Jugar

1. Doble click en **🎮 El Control** (Escritorio).
2. La primera vez macOS abrirá "Privacidad y seguridad → Accesibilidad":
   activa la casilla **Terminal** y vuelve — el programa espera y sigue solo.
   (Si el firewall pregunta por "node", dale Permitir.)
3. Escanea el **QR** con la Cámara del iPhone → se abre en Safari → botón
   Compartir → **«Agregar a pantalla de inicio»** → abre el mando **desde el
   icono** (así corre a pantalla completa; en la pestaña de Safari la barra
   de navegación no se puede ocultar — es una regla de iOS).
4. Configura Ryujinx una sola vez (con Ryujinx cerrado):
   ```bash
   npx -y github:mindavidev/joypad-air ryujinx-setup
   ```
   …o si clonaste el repo: `npm run ryujinx:setup`. Esto genera los perfiles
   de los dos mandos y parchea la config (con backup automático).
5. Abre **Ryujinx** y juega. Para parar: cierra la ventana de Terminal.

**Panel de estado:** con el server corriendo, abre <http://localhost:3001/setup> —
checklist en vivo de permisos, configuración de Ryujinx, foco, jugadores,
latencia y motion. Si algo no funciona, esta página te dice qué es.

**Actualizar:** nada — cada vez que abres 🎮 El Control se usa la última versión.

## 🎯 Control por movimiento (giroscopio)

El server publica el motion del teléfono con el protocolo estándar
**DSU/cemuhook** (UDP 26760). Hay dos mitades: que el teléfono *mande* el
giro, y que el emulador lo *escuche*.

### Que el teléfono mande el giro

- ⚠️ **En el mando web NO funciona el giro**: iOS bloquea los sensores de
  movimiento en páginas `http://` (exige HTTPS). El botón GIRO del mando web
  te lo avisa. Los botones funcionan perfecto — solo el giro está vetado.
- ✅ **La app nativa (Expo) SÍ tiene giro.** Corre desde el código:
  ```bash
  git clone https://github.com/mindavidev/joypad-air && cd joypad-air
  npm install && npm start            # terminal 1 — el server
  cd app && npm install && npx expo start   # terminal 2 — la app
  ```
  Instala **Expo Go** (App Store / Play Store) en el teléfono y escanea el QR
  de la terminal 2. En el mando, toca **∿ GIRO** y acepta el permiso de
  movimiento.

### Que el emulador escuche

- **Dolphin / Cemu / Citra**: soporte nativo, cero parches. En Dolphin:
  `Controles → Alternate Input Sources → DSU Client → 127.0.0.1:26760`.
  (¿El emulador está en OTRA máquina? Arranca el server con
  `DSU_HOST=0.0.0.0` y apunta a la IP del Mac.)
- **Ryujinx**: el build oficial **ignora** los servidores DSU cuando los
  botones entran por teclado (verificado en su código fuente). Incluimos un
  parche local ([tools/ryubing-motion.patch](tools/ryubing-motion.patch))
  y un script que clona el código del fork Ryubing, lo aplica y compila un
  **"Ryujinx Motion.app"** en tu propia máquina (~15 min; no distribuimos
  binarios del emulador):
  ```bash
  brew install dotnet@9
  bash tools/ryujinx-build/build-local.sh
  npm run ryujinx:setup -- --motion --patched
  ```
  Desde entonces: juega abriendo **"Ryujinx Motion"** (tu Ryujinx normal
  queda intacto).

### En el juego

- **Mario Kart 8**: el volante por giro se activa **dentro del juego** (el
  icono del mando con ondas en la pantalla previa a la carrera) — sin eso el
  juego ignora el motion aunque le llegue.
- **Zelda y similares**: el apuntado por giro funciona directo.
- **¿Ejes raros/invertidos?** En el mando: Ajustes (engranaje) con GIRO
  activo → fila de calibración. Plano boca arriba debe marcar `az ≈ -1.00`.
  La matriz de ejes vive en `server/dsu/transform.js` (se ajusta sin tocar
  el teléfono).

## Dos jugadores

Cada teléfono elige su slot (Player 1 / Player 2) como mando independiente.
Limitación conocida: algunos juegos (Mario Kart 8, Mario Wonder) exigen
dispositivos físicos distintos para 2P y rechazan dos mandos respaldados por
el mismo teclado — Smash, Overcooked, Stardew, Cuphead y la mayoría del co-op
funcionan perfecto.

## Personalización

En el mando (engranaje ⚙): nombre de cada jugador, 8 temas de color estilo
Joy-Con, sensibilidad del stick (activación/liberación), intensidad háptica,
swap A/B·X/Y, tamaño de botones (app) y sonido de click. Todo persiste y se
aplica en vivo. ¿Cambiar teclas? `server/mappings.js` + `npm run ryujinx:setup`.

## Problemas frecuentes

| Síntoma | Causa y arreglo |
|---|---|
| El mando "escribe letras" en el Mac | Ryujinx no tiene el foco — haz click en su ventana (el mando te avisa con un banner). |
| Conectado pero el juego no responde | Falta el permiso de Accesibilidad (el banner y `/setup` lo dicen) o falta correr `ryujinx-setup`. |
| El giro no hace nada en el juego | ① ¿Mando web? El giro requiere la app nativa. ② ¿Abriste "Ryujinx Motion" (no el normal)? ③ ¿MK8? Activa el motion DENTRO del juego. ④ ¿Permiso de movimiento denegado en iOS? |
| La barra de Safari estorba | Compartir → «Agregar a pantalla de inicio» y abre el mando desde el icono — única vía a pantalla completa en iOS. |
| El iPhone no encuentra el server | ¿Misma WiFi? ¿Red de invitados? iOS: Ajustes → Privacidad → Red local. |
| Dos teléfonos pelean por un slot | El segundo expulsa al primero una vez (aviso "Otro mando tomó tu slot") — elige slots distintos. |

## Desarrollo

```bash
npm install
npm start              # server en :3001 — PWA + WebSocket + DSU
npm test               # smoke suite (47 asserts, sin teclado real)
npm run ryujinx:check  # ¿la config de Ryujinx está sincronizada?
```

`public/` = mando web (la vía soportada para terceros) · `app/` = app nativa
Expo (giro; correr con expo start) · `server/` = motor Node · `tools/` =
setup de Ryujinx, parche motion y tests. Licencia MIT.

## Idiomas

El mando web, el panel de configuración y la app nativa están disponibles en
**English** y **Español**. Elige el idioma en la pantalla de conexión o en Ajustes.
La elección se guarda en el dispositivo y la interfaz se actualiza sin desconectar
el mando. En la primera visita se usa el idioma del dispositivo, con inglés como alternativa.

Los mensajes de Terminal están en inglés de forma predeterminada, tanto al ejecutar
`npm start` como los comandos de configuración de Ryujinx. Para iniciar el servidor
en español:

```bash
JOYPAD_LANG=es npm start
```

Usa `JOYPAD_LANG=es npm run ryujinx:setup` para configurar Ryujinx en español, o
`JOYPAD_LANG=en` para elegir inglés. Reinicia el servidor tras cambiar este ajuste.
El idioma de Terminal es independiente del que elijas en el teléfono.
