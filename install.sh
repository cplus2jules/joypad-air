#!/bin/bash
# Instalador de El Control Super Pro Max (joypad-air) para macOS.
#
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/mindavidev/joypad-air/main/install.sh)"
#
# Qué hace (idempotente, sin sudo):
#   1. Comprueba Node ≥18; si falta, descarga el instalador OFICIAL de
#      nodejs.org (.pkg) y lo abre — tú le das "Continuar".
#   2. Crea "🎮 El Control.command" en tu Escritorio: doble-click y juega.
#      El launcher ejecuta `npx -y joypad-air@latest`, así que SIEMPRE usa
#      la última versión sin que hagas nada.
#
# Todo el script corre dentro de main() — si la descarga se corta a la mitad,
# no se ejecuta nada parcial.

set -euo pipefail

# Mientras el paquete no esté publicado en npm, npx lo ejecuta directo
# desde GitHub (resuelve la rama main en cada arranque = auto-update).
# Cuando se publique en npm, cambiar a: joypad-air@latest  (ver RELEASING.md)
PKG_SPEC="github:mindavidev/joypad-air"
LAUNCHER="$HOME/Desktop/🎮 El Control.command"
NODE_LTS_LINE="v22.x"

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }

have_node() {
  command -v node >/dev/null 2>&1 || return 1
  local major
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$major" -ge 18 ]
}

install_node() {
  say "→ No tienes Node.js (o es muy viejo). Descargando el instalador oficial…"
  local listing pkg url tmp
  listing="$(curl -fsSL "https://nodejs.org/dist/latest-${NODE_LTS_LINE}/")"
  pkg="$(printf '%s' "$listing" | grep -o 'node-v[0-9.]*\.pkg' | head -1)"
  if [ -z "$pkg" ]; then
    echo "✗ No pude localizar el instalador de Node. Instálalo a mano desde https://nodejs.org y vuelve a correr este comando."
    exit 1
  fi
  url="https://nodejs.org/dist/latest-${NODE_LTS_LINE}/${pkg}"
  tmp="$(mktemp -d)/${pkg}"
  curl -fL --progress-bar "$url" -o "$tmp"

  say "→ Se abrirá el instalador de Node: dale \"Continuar\" hasta el final y vuelve aquí."
  open "$tmp"

  # Esperar a que el usuario termine el instalador GUI
  local i=0
  until have_node; do
    sleep 5
    i=$((i + 1))
    if [ $((i % 12)) -eq 0 ]; then
      echo "  (esperando a que termines el instalador de Node…)"
    fi
    if [ "$i" -gt 240 ]; then
      echo "✗ Me cansé de esperar. Termina el instalador de Node y corre este comando otra vez."
      exit 1
    fi
    # el PATH del shell actual puede no ver /usr/local/bin todavía
    export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
  done
  say "✓ Node $(node -v) instalado."
}

create_launcher() {
  say "→ Creando el launcher en tu Escritorio…"
  cat > "$LAUNCHER" <<EOF
#!/bin/bash
# El Control Super Pro Max — doble click para jugar.
# Cierra esta ventana de Terminal para detener los mandos.
export PATH="/usr/local/bin:/opt/homebrew/bin:\$PATH"
clear
echo "🎮 El Control Super Pro Max"
echo "Arrancando (la primera vez tarda un poco)…"
echo
npx -y ${PKG_SPEC}
EOF
  chmod +x "$LAUNCHER"
  # creado localmente → sin atributo de cuarentena → Gatekeeper no molesta
}

main() {
  say "🎮 Instalador de El Control Super Pro Max"

  if have_node; then
    say "✓ Node $(node -v) detectado."
  else
    install_node
  fi

  create_launcher

  say "✓ Listo. Así se juega:"
  echo "  1. Doble click en \"🎮 El Control\" (está en tu Escritorio)."
  echo "  2. La primera vez, macOS pedirá el permiso de Accesibilidad para"
  echo "     Terminal — actívalo y vuelve: el programa sigue solo."
  echo "     (Si el firewall pregunta por \"node\", dale Permitir.)"
  echo "  3. Escanea el QR con la cámara del iPhone (misma WiFi),"
  echo "     Safari → Compartir → \"Agregar a pantalla de inicio\"."
  echo "  4. Abre Ryujinx y juega."
  echo ""
  echo "  Actualizaciones: automáticas — cada arranque usa la última versión."
}

main "$@"
