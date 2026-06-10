#!/bin/bash
# Compila un Ryujinx CON motion para mandos de teclado ("Ryujinx Motion.app").
#
# El Ryujinx stock ignora los servidores DSU/CemuHook cuando los botones van
# por teclado (nuestro caso). Este script clona el código del fork Ryubing,
# aplica tools/ryubing-motion.patch (~40 líneas, MIT) y compila el .app en TU
# máquina — no distribuimos binarios del emulador.
#
# Requisitos: macOS, git, .NET SDK 9 (el script lo detecta y sugiere brew).
# Uso:   bash tools/ryujinx-build/build-local.sh
# Salida: /Applications/Ryujinx Motion.app  (el Ryujinx que ya tengas queda intacto)

set -euo pipefail

RYUBING_URL="${RYUBING_URL:-https://git.ryujinx.app/ryubing/ryujinx.git}"
RYUBING_REF="${RYUBING_REF:-1.3.3}"
WORK="${WORK:-$HOME/.cache/joypad-air/ryubing-build}"
DEST="${DEST:-/Applications/Ryujinx Motion.app}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_FILE="$SCRIPT_DIR/../ryubing-motion.patch"

main() {
  # ── .NET 9 ────────────────────────────────────────────────────────────────
  if [ -x /opt/homebrew/opt/dotnet@9/bin/dotnet ]; then
    export PATH="/opt/homebrew/opt/dotnet@9/bin:$PATH"
  elif [ -x /usr/local/opt/dotnet@9/bin/dotnet ]; then
    export PATH="/usr/local/opt/dotnet@9/bin:$PATH"
  fi
  if ! command -v dotnet >/dev/null || ! dotnet --list-sdks 2>/dev/null | grep -q "^9\."; then
    echo "✗ Falta el .NET SDK 9. Instálalo con:"
    echo "    brew install dotnet@9"
    echo "  (o desde https://dotnet.microsoft.com/download/dotnet/9.0)"
    exit 1
  fi
  export DOTNET_CLI_TELEMETRY_OPTOUT=1

  [ -f "$PATCH_FILE" ] || { echo "✗ No encuentro $PATCH_FILE"; exit 1; }

  # ── Código fuente ─────────────────────────────────────────────────────────
  if [ ! -d "$WORK/src" ]; then
    echo "→ Clonando Ryubing $RYUBING_REF (~200MB, una sola vez)…"
    mkdir -p "$(dirname "$WORK")"
    git clone --depth 1 --branch "$RYUBING_REF" "$RYUBING_URL" "$WORK"
  else
    echo "→ Reusando checkout en $WORK"
    git -C "$WORK" checkout -- . 2>/dev/null || true
  fi

  # ── Parche ────────────────────────────────────────────────────────────────
  echo "→ Aplicando ryubing-motion.patch…"
  if ! patch -p1 -d "$WORK" --dry-run < "$PATCH_FILE" >/dev/null 2>&1; then
    echo "✗ El parche no aplica limpio sobre $RYUBING_REF."
    echo "  ¿Cambió el código upstream? Revisa tools/ryubing-motion.patch."
    exit 1
  fi
  patch -p1 -d "$WORK" < "$PATCH_FILE"

  # ── Build (~10-20 min según máquina) ─────────────────────────────────────
  echo "→ Compilando (esto tarda 10-20 minutos)…"
  local temp out
  temp="$(mktemp -d)/build"
  out="$WORK/__output"
  rm -rf "$out"
  (
    cd "$WORK"
    ./distribution/macos/create_macos_build_ava.sh \
      . "$temp" "$out" distribution/macos/entitlements.xml \
      "$RYUBING_REF" "motion-patch" Release false
  )

  [ -d "$out/Ryujinx.app" ] || { echo "✗ El build no produjo Ryujinx.app — revisa la salida"; exit 1; }

  # ── Instalar ──────────────────────────────────────────────────────────────
  rm -rf "$DEST"
  cp -R "$out/Ryujinx.app" "$DEST"
  echo ""
  echo "✓ Instalado: $DEST"
  echo "  (compilado localmente → sin cuarentena de Gatekeeper)"
  echo ""
  echo "Siguiente paso: npm run ryujinx:setup -- --motion --patched"
  echo "y abre 'Ryujinx Motion' en vez del Ryujinx normal para jugar con giro."
}

main "$@"
