#!/bin/bash
# Doble-click para arrancar El Control Super Pro Max.
# Esta Terminal queda viva mientras quieras jugar. Ciérrala para detener todo.

set -e
cd "$(dirname "$0")"

PORT_NODE=3001
PORT_EXPO=8081

# Mata cualquier instancia previa
echo "→ Limpiando procesos previos..."
lsof -ti:$PORT_NODE | xargs kill -9 2>/dev/null || true
lsof -ti:$PORT_EXPO | xargs kill -9 2>/dev/null || true
sleep 1

# Detectar IP local
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")
URL_EXPO="exp://${IP}:${PORT_EXPO}"

echo ""
echo "════════════════════════════════════════════════════════"
echo "   EL CONTROL SUPER PRO MAX"
echo "════════════════════════════════════════════════════════"
echo ""
echo "   Mac IP:   $IP"
echo "   Node ws:  http://${IP}:${PORT_NODE}"
echo "   Expo:     $URL_EXPO"
echo ""
echo "   Abre Expo Go en el iPhone y escanea el QR del Mac"
echo "   (o entra esta URL manualmente: $URL_EXPO)"
echo ""
echo "   Para detener: cierra esta ventana de Terminal"
echo "════════════════════════════════════════════════════════"
echo ""

# Genera QR PNG y lo abre en Preview
if command -v npx >/dev/null; then
  npx --yes qrcode -o /tmp/expo-qr.png "$URL_EXPO" 2>/dev/null || true
  [ -f /tmp/expo-qr.png ] && open /tmp/expo-qr.png
fi

# Arranca Node server en background con logs a archivo
echo "→ Iniciando Node server..."
PORT=$PORT_NODE npm start > /tmp/swctrl-node.log 2>&1 &
NODE_PID=$!

# Cleanup al cerrar
trap "echo ''; echo '→ Deteniendo servers...'; kill $NODE_PID 2>/dev/null; lsof -ti:$PORT_NODE,$PORT_EXPO | xargs kill -9 2>/dev/null; exit 0" INT TERM EXIT

sleep 2

if ! lsof -ti:$PORT_NODE >/dev/null; then
  echo "✗ Node server NO arrancó. Revisa /tmp/swctrl-node.log"
  tail -20 /tmp/swctrl-node.log
  echo ""
  echo "Presiona Enter para cerrar..."
  read
  exit 1
fi

echo "✓ Node server vivo en :${PORT_NODE}"
echo ""
echo "→ Iniciando Expo dev server (verás el QR en pantalla)..."
echo ""

# Expo en foreground — su QR aparece en esta misma terminal
cd app
exec npx expo start --lan
