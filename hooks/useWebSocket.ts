import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../components/AuthContext';
import { WebSocketMessage } from '../app/types/websocket';

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

// ---- Module-level singleton state ----
type Subscriber = {
  onMessage?: (m: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (e: Event) => void;
  setStatus?: (status: { connected: boolean; connecting: boolean }) => void;
};

let singletonWS: WebSocket | null = null;
let singletonConnected = false;
let singletonConnecting = false;
let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let connectPromise: Promise<void> | null = null;
const subscribers = new Set<Subscriber>();
let currentUserId: string | null = null;

// Send a ping periodically so idle connections aren't closed by the server
// (API Gateway/proxies drop WebSocket connections with no traffic).
const HEARTBEAT_INTERVAL_MS = 30000;

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    if (singletonWS && singletonWS.readyState === WebSocket.OPEN) {
      singletonWS.send(JSON.stringify({ action: 'ping' }));
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function getWebSocketUrl(): string {
  return (
    process.env.NEXT_PUBLIC_WEBSOCKET_URL ||
    'wss://your-websocket-api-id.execute-api.region.amazonaws.com/prod'
  );
}

async function fetchToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/websocket-token');
    if (!res.ok) return null;
    const data = await res.json();
    return data.token || null;
  } catch (e) {
    console.error('WS token fetch failed:', e);
    return null;
  }
}

function notifyStatus() {
  for (const sub of subscribers) {
    sub.setStatus?.({
      connected: singletonConnected,
      connecting: singletonConnecting,
    });
  }
}

function notify(event: 'connect' | 'disconnect' | 'error', arg?: any) {
  for (const sub of subscribers) {
    try {
      if (event === 'connect') sub.onConnect?.();
      else if (event === 'disconnect') sub.onDisconnect?.();
      else if (event === 'error') sub.onError?.(arg);
    } catch (e) {
      console.error('WS subscriber error:', e);
    }
  }
}

function broadcastMessage(msg: WebSocketMessage) {
  for (const sub of subscribers) {
    try {
      sub.onMessage?.(msg);
    } catch (e) {
      console.error('WS subscriber message error:', e);
    }
  }
}

async function singletonConnect(
  autoReconnect: boolean,
  reconnectInterval: number,
  maxReconnectAttempts: number,
) {
  if (singletonConnected || singletonConnecting) return connectPromise;
  singletonConnecting = true;
  notifyStatus();

  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      const token = await fetchToken();
      if (!token) {
        singletonConnecting = false;
        notifyStatus();
        return;
      }
      const url = `${getWebSocketUrl()}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      singletonWS = ws;

      ws.onopen = () => {
        console.log('WS connected (singleton)');
        singletonConnected = true;
        singletonConnecting = false;
        reconnectAttempts = 0;
        notifyStatus();
        notify('connect');
        startHeartbeat();
      };

      ws.onmessage = (ev) => {
        try {
          const msg: WebSocketMessage = JSON.parse(ev.data);
          broadcastMessage(msg);
        } catch (e) {
          console.error('WS parse error', e);
        }
      };

      ws.onclose = (ev) => {
        console.log('WS closed', ev.code, ev.reason);
        singletonConnected = false;
        singletonConnecting = false;
        stopHeartbeat();
        notifyStatus();
        notify('disconnect');

        if (autoReconnect && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(() => {
            singletonConnect(
              autoReconnect,
              reconnectInterval,
              maxReconnectAttempts,
            );
          }, reconnectInterval);
        }
      };

      ws.onerror = (err) => {
        console.error('WS error', err);
        notify('error', err);
      };
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

function singletonDisconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  stopHeartbeat();
  if (singletonWS) {
    try {
      singletonWS.close();
    } catch {}
    singletonWS = null;
  }
  singletonConnected = false;
  singletonConnecting = false;
  notifyStatus();
}

function singletonSend(msg: WebSocketMessage) {
  if (singletonWS && singletonWS.readyState === WebSocket.OPEN) {
    singletonWS.send(JSON.stringify(msg));
  } else {
    console.error('WebSocket is not connected');
  }
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    autoReconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
  } = options;

  const { user } = useAuth();
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);
  const onMessageRef = useRef(onMessage);
  const [isConnected, setIsConnected] = useState<boolean>(singletonConnected);
  const [isConnecting, setIsConnecting] =
    useState<boolean>(singletonConnecting);

  useEffect(() => {
    onConnectRef.current = onConnect;
  }, [onConnect]);
  useEffect(() => {
    onDisconnectRef.current = onDisconnect;
  }, [onDisconnect]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // subscribe this hook instance to singleton events
  useEffect(() => {
    const sub: Subscriber = {
      onConnect: () => onConnectRef.current?.(),
      onDisconnect: () => onDisconnectRef.current?.(),
      onError: (e) => onErrorRef.current?.(e),
      onMessage: (m) => onMessageRef.current?.(m),
      setStatus: ({ connected, connecting }) => {
        setIsConnected(connected);
        setIsConnecting(connecting);
      },
    };
    subscribers.add(sub);
    // sync initial status
    sub.setStatus?.({
      connected: singletonConnected,
      connecting: singletonConnecting,
    });
    return () => {
      subscribers.delete(sub);
    };
  }, []);

  const connect = useCallback(async () => {
    if (!user) return;
    // if user changed, force disconnect to refresh token
    if (currentUserId !== user.userId) {
      currentUserId = user.userId;
      singletonDisconnect();
    }
    await singletonConnect(
      autoReconnect,
      reconnectInterval,
      maxReconnectAttempts,
    );
  }, [user, autoReconnect, reconnectInterval, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    singletonDisconnect();
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    singletonSend(message);
  }, []);

  const ping = useCallback(() => {
    sendMessage({ action: 'ping' });
  }, [sendMessage]);

  useEffect(() => {
    if (user) connect();
    else disconnect();
    return () => {
      /* leave connection for other subscribers */
    };
  }, [user, connect, disconnect]);

  return { isConnected, isConnecting, connect, disconnect, sendMessage, ping };
}
