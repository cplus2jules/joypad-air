import { useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { haptic } from '../haptics';

export const SERVER_PORT = 3001;

export function detectHost() {
  const hu =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.developer?.hostUri ||
    '';
  const ip = hu.split(':')[0];
  return ip || null;
}

// ── Conexión WebSocket con reconexión (1.5s) ────────────
// Estados: 'conectando' | 'conectado' | 'error' | 'sin host' | 'reconectando'
// `profile` (opcional): perfil activo de settings — name/themeId/engage/release
// viajan en el mensaje config y se reenvían en vivo si cambian.
export function useConnection(player, profile) {
  const wsRef = useRef(null);
  const [status, setStatus] = useState('conectando');
  const host = useMemo(() => detectHost(), []);

  const name = profile?.name ?? `Chocorramito ${player}`;
  const themeId = profile?.themeId ?? 'neon';
  const engage = profile?.engage ?? 0.55;
  const release = profile?.release ?? 0.40;

  // Ref con el config vigente — el onopen lo lee fresco sin
  // reconectar el socket cada vez que cambia un slider.
  const cfgRef = useRef(null);
  cfgRef.current = { name, theme: themeId, engage, release };

  const sendConfig = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      // El stick envía valores crudos; la deadzone/histéresis la aplica
      // el stick-engine del server con esta configuración.
      try {
        ws.send(JSON.stringify({ t: 'config', ...cfgRef.current, angularHysteresis: 11.25 }));
      } catch {}
    }
  };

  useEffect(() => {
    let active = true;
    let reconnectTimer = null;

    const connect = () => {
      if (!active) return;
      if (!host) {
        setStatus('sin host');
        return;
      }
      const url = `ws://${host}:${SERVER_PORT}/?p=${player}`;
      let socket;
      try {
        socket = new WebSocket(url);
      } catch {
        if (active) reconnectTimer = setTimeout(connect, 1500);
        return;
      }
      wsRef.current = socket;
      socket.onopen = () => {
        if (active) {
          setStatus('conectado');
          haptic.light();
          sendConfig();
        }
      };
      socket.onclose = () => {
        if (!active) return;
        setStatus('reconectando');
        reconnectTimer = setTimeout(connect, 1500);
      };
      socket.onerror = () => active && setStatus('error');
    };

    connect();
    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { wsRef.current?.close(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, host]);

  // Reenviar config en vivo cuando cambian los valores con el socket abierto
  useEffect(() => {
    sendConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, themeId, engage, release]);

  const send = (obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify(obj)); } catch {}
    }
  };

  return { status, send };
}
