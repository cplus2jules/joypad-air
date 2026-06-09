# Switch Controller

Convierte 2 iPhones en mandos para **Ryujinx** en tu Mac.
Sin App Store, sin Xcode, sin cuenta de developer.

## Cómo funciona

1. Un servidor Node corre en tu Mac y sirve una página web (PWA).
2. Cada iPhone abre la URL del Mac por WiFi local → la guarda en su pantalla de inicio.
3. Los toques en pantalla viajan al Mac por WebSocket.
4. El servidor los traduce a pulsaciones de teclado.
5. Ryujinx ve dos teclados virtuales y los asigna a Player 1 y Player 2.

> Latencia esperada en WiFi local: ~10–25 ms. Jugable para single‑player y co‑op casual. Para juegos competitivos hardcore, mejor un mando bluetooth real.

## Requisitos

- macOS (probado en Apple Silicon).
- Node.js 20+ (`brew install node`).
- iPhone con iOS 15+ en la **misma red WiFi** que el Mac.
- Ryujinx instalado.

## Instalación

```bash
cd switch-controller
npm install
```

> Si `@nut-tree-fork/nut-js` falla al compilar, el servidor igual arranca en
> "modo log" (imprime los inputs en consola sin enviar teclas). Útil para
> probar la PWA. Para envío real de teclas, instálalo manualmente:
> `npm install @nut-tree-fork/nut-js`

## Arrancar el servidor

```bash
npm start
```

Verás algo así:

```
Switch Controller corriendo
Abre esta URL en el iPhone:  http://192.168.1.42:3000
█▀▀▀▀▀█  (QR)
```

## Conectar el iPhone

1. Abre la URL **en Safari** (no en Chrome).
2. Toca el botón **Compartir** → **Agregar a pantalla de inicio**.
3. Abre la app desde el icono nuevo → se ve en pantalla completa.
4. Elige **Player 1** o **Player 2**.
5. Gira el teléfono en horizontal.

Repite con el segundo iPhone y elige el otro jugador.

## Permiso de Accesibilidad en macOS

La primera vez que arranques el servidor, macOS te pedirá permiso para que
Node pueda enviar pulsaciones de teclado:

**Ajustes del Sistema → Privacidad y seguridad → Accesibilidad** → activa
**Terminal** (o iTerm, o lo que estés usando para correr `npm start`).

Después reinicia el servidor.

## Configurar Ryujinx

Ryujinx soporta dos teclados como Player 1 y Player 2 con mapeos distintos.
Abre **Ryujinx → Options → Settings → Input** y mapea exactamente así:

### Player 1 (botón rojo en la PWA)

| Botón Switch | Tecla |
|---|---|
| L stick ↑ / ↓ / ← / → | W / S / A / D |
| R stick ↑ / ↓ / ← / → | I / K / J / L |
| D-Pad ↑ / ↓ / ← / → | T / G / F / H |
| A / B / X / Y | Z / X / C / V |
| L / R | Q / E |
| ZL / ZR | 1 / 2 |
| + / − | 3 / 4 |
| L Stick click / R Stick click | 5 / 6 |
| Home / Capture | 7 / 8 |

### Player 2 (botón azul en la PWA)

> Solo letras/números/coma/= y flechas, que se asignan sin problema en un
> MacBook (sin teclado numérico). Movimiento en **flechas**. Lo no esencial
> para Mario (D-Pad, stick derecho, clicks, Home/Capture) va a teclas **F**
> que se dejan **sin asignar** en Ryujinx.

| Botón Switch | Tecla |
|---|---|
| L stick ↑ / ↓ / ← / → | ↑ / ↓ / ← / → (flechas) |
| A / B / X / Y | M / N / O / U |
| L / R | P / R |
| ZL / ZR | 9 / 0 |
| + / − | , (coma) / = |
| R stick · D-Pad · clicks · Home/Capture | teclas F (sin asignar) |

> ¿No quieres mapear todo eso a mano? Edita `server/mappings.js` para que
> coincida con las teclas que ya usas en Ryujinx, y reinicia el servidor.

## Limitaciones honestas

- **Sticks digitales (8 direcciones)**. El servidor convierte el stick analógico
  del iPhone a pulsaciones de teclado con un threshold del 40%. La mayoría de
  juegos van bien (Mario Kart, Smash, Zelda básico). Juegos que dependen de
  movimiento analógico fino del stick (Splatoon competitivo, BOTW caminar
  sigiloso) se sienten "todo o nada".
- **Sin giroscopio / sin rumble**. iOS Safari no expone esas APIs a páginas web.
- **WiFi local obligatorio**. Mac e iPhone deben estar en la misma red.
- **Solo 2 jugadores**. Es lo que necesitas; añadir más es cambiar el array de
  `players` en `server/index.js`.

## Problemas comunes

**El iPhone no se conecta** → revisa que el Mac y el iPhone estén en la misma
WiFi. Si tu router tiene "AP isolation" activado, desactívalo o usa una red
de hotspot del Mac.

**No envía teclas aunque dice "conectado"** → falta el permiso de
Accesibilidad en macOS. Mira la sección de arriba.

**El icono en pantalla de inicio se ve genérico** → reemplaza
`public/icon.svg` por un PNG de 192×192 y 512×512, o tócalo desde Safari y
elige una imagen propia al agregar a inicio.

**Inputs se quedan "pegados"** → si la conexión se cae a mitad de pulsación,
el servidor libera todas las teclas en `close`. Si igual ocurre, presiona y
suelta la misma tecla físicamente, o reinicia el servidor (`Ctrl+C` + `npm start`).
