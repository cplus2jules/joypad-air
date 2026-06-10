import { useEffect, useMemo, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { haptic } from '../haptics';

export const SERVER_PORT = 3001;
const PING_INTERVAL_MS = 2000;

export function detectHost() {
  const hu =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.developer?.hostUri ||
    '';
  const ip = hu.split(':')[0];
  return ip || null;
}

// Estado del server según hello/focus/slots/accessibility.
// `hello` distingue "aún no sabemos nada" de "el server reportó X" —
// sin él, native:null dispararía falsos avisos antes del handshake.
const INITIAL_SERVER_INFO = {
  hello: false,
  kb: null,
  native: null,
  accessibility: null,
  focus: null, // {ok, app} | null
  slots: [],   // números de slot ocupados
};

// ── Conexión WebSocket con reconexión (1.5s) ────────────
// Estados: 'conectando' | 'conectado' | 'error' | 'sin host' | 'reconectando'
//          | 'reemplazado' (otro mando tomó el slot — NO se reintenta)
// `profile` (opcional): perfil activo de settings — name/themeId/engage/release
// viajan en el mensaje config y se reenvían en vivo si cambian.
// `opts` (opcional): { motion, orientation } — estado de sesión del Pad
// (GIRO activo, 'landscape-left'|'landscape-right'); también van en el
// config y se reenvían en vivo.
// Devuelve { status, send, rtt, serverInfo }:
//   rtt        — latencia suavizada en ms (EMA 0.6/0.4) o null sin dato
//   serverInfo — ver INITIAL_SERVER_INFO, actualizado por el dispatcher
export function useConnection(player, profile, opts) {
  const wsRef = useRef(null);
  const [status, setStatus] = useState('conectando');
  const [rtt, setRtt] = useState(null);
  const [serverInfo, setServerInfo] = useState(INITIAL_SERVER_INFO);
  const rttRef = useRef(null); // valor crudo del EMA (sin redondear)
  const host = useMemo(() => detectHost(), []);

  const name = profile?.name ?? `Chocorramito ${player}`;
  const themeId = profile?.themeId ?? 'neon';
  const engage = profile?.engage ?? 0.55;
  const release = profile?.release ?? 0.40;
  const motion = opts?.motion;
  const orientation = opts?.orientation;

  // Ref con el config vigente — el onopen lo lee fresco sin
  // reconectar el socket cada vez que cambia un slider.
  const cfgRef = useRef(null);
  cfgRef.current = { name, theme: themeId, engage, release };
  if (motion !== undefined) cfgRef.current.motion = !!motion;
  if (orientation) cfgRef.current.orientation = orientation;

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
    let pingTimer = null;

    const stopPing = () => {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
    };

    const sendPing = () => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== 1) return;
      const msg = { t: 'ping', ts: Date.now() };
      if (rttRef.current != null) msg.rtt = Math.round(rttRef.current);
      try { ws.send(JSON.stringify(msg)); } catch {}
    };

    const handleMessage = (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      switch (msg.t) {
        case 'pong': {
          const sample = Date.now() - Number(msg.ts);
          if (!Number.isFinite(sample) || sample < 0) return;
          // EMA: primera muestra directa, después 0.6·prev + 0.4·nueva
          const prev = rttRef.current;
          rttRef.current = prev == null ? sample : 0.6 * prev + 0.4 * sample;
          setRtt(Math.round(rttRef.current));
          break;
        }
        case 'hello':
          setServerInfo((si) => ({
            ...si,
            hello: true,
            kb: msg.kb ?? null,
            native: !!msg.native,
            accessibility: typeof msg.accessibility === 'boolean' ? msg.accessibility : null,
            focus: msg.focus ?? null,
          }));
          break;
        case 'focus':
          setServerInfo((si) => ({ ...si, focus: { ok: !!msg.ok, app: msg.app ?? null } }));
          break;
        case 'slots':
          setServerInfo((si) => ({
            ...si,
            slots: Array.isArray(msg.occupied) ? msg.occupied : [],
          }));
          break;
        case 'accessibility':
          setServerInfo((si) => ({ ...si, accessibility: !!msg.ok }));
          break;
      }
    };

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
          sendPing();
          pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
        }
      };
      socket.onmessage = (ev) => {
        if (active) handleMessage(ev.data);
      };
      socket.onclose = (e) => {
        if (!active) return;
        stopPing();
        rttRef.current = null;
        setRtt(null); // sin socket no hay dato de latencia
        // 4000 = takeover: otro mando tomó este slot. Reconectar aquí
        // produciría un ping-pong infinito entre los dos teléfonos —
        // se queda en 'reemplazado' hasta que el Pad se remonte.
        if (e?.code === 4000) {
          setStatus('reemplazado');
          return;
        }
        setStatus('reconectando');
        reconnectTimer = setTimeout(connect, 1500);
      };
      socket.onerror = () => active && setStatus('error');
    };

    connect();
    return () => {
      active = false;
      stopPing();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { wsRef.current?.close(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, host]);

  // Reenviar config en vivo cuando cambian los valores con el socket abierto
  useEffect(() => {
    sendConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, themeId, engage, release, motion, orientation]);

  const send = (obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify(obj)); } catch {}
    }
  };

  return { status, send, rtt, serverInfo };
}
