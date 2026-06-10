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
export function useConnection(player) {
  const wsRef = useRef(null);
  const [status, setStatus] = useState('conectando');
  const host = useMemo(() => detectHost(), []);

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
  }, [player, host]);

  const send = (obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify(obj)); } catch {}
    }
  };

  return { status, send };
}
