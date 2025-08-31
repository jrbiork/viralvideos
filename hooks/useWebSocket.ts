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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const connectionAttemptRef = useRef<Promise<void> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Store latest callback functions in refs to avoid dependency issues
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);
  const onMessageRef = useRef(onMessage);

  // Update refs when callbacks change
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

  // Get WebSocket URL from environment or use a default
  const getWebSocketUrl = useCallback(() => {
    // In production, this would come from environment variables
    // For now, we'll use a placeholder that will be replaced after deployment
    const wsUrl =
      process.env.NEXT_PUBLIC_WEBSOCKET_URL ||
      'wss://your-websocket-api-id.execute-api.region.amazonaws.com/prod';
    return wsUrl;
  }, []);

  const connect = useCallback(async () => {
    if (!user || isConnecting || isConnected) return;

    // Check if there's already an open WebSocket connection
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket connection already exists and is open');
      return;
    }

    // If there's already a connection attempt in progress, return the existing promise
    if (connectionAttemptRef.current) {
      return connectionAttemptRef.current;
    }

    setIsConnecting(true);

    // Create a new connection attempt promise
    connectionAttemptRef.current = (async () => {
      try {
        // Get the JWT token from the server via API endpoint
        const tokenResponse = await fetch('/api/websocket-token');

        if (!tokenResponse.ok) {
          console.error('Failed to get authentication token for WebSocket');
          setIsConnecting(false);
          return;
        }

        const tokenData = await tokenResponse.json();
        const token = tokenData.token;

        if (!token) {
          console.error('No authentication token available');
          setIsConnecting(false);
          return;
        }

        const wsUrl = getWebSocketUrl();
        const url = `${wsUrl}?token=${encodeURIComponent(token)}`;

        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected opened! on url:', url);
          setIsConnected(true);
          setIsConnecting(false);
          reconnectAttemptsRef.current = 0;
          onConnectRef.current?.();
        };

        ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            console.log('WebSocket message received:', message);
            onMessageRef.current?.(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason);
          setIsConnected(false);
          setIsConnecting(false);
          onDisconnectRef.current?.();

          // Auto-reconnect logic
          if (
            autoReconnect &&
            reconnectAttemptsRef.current < maxReconnectAttempts
          ) {
            reconnectAttemptsRef.current++;
            console.log(
              `Attempting to reconnect (${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`,
            );

            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, reconnectInterval);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          onErrorRef.current?.(error);
        };
      } catch (error) {
        console.error('Error connecting to WebSocket:', error);
        setIsConnecting(false);
      } finally {
        // Clear the connection attempt reference
        connectionAttemptRef.current = null;
      }
    })();

    return connectionAttemptRef.current;
  }, [
    user,
    isConnecting,
    isConnected,
    autoReconnect,
    reconnectInterval,
    maxReconnectAttempts,
    getWebSocketUrl,
  ]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    reconnectAttemptsRef.current = 0;
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
    }
  }, []);

  const ping = useCallback(() => {
    sendMessage({ action: 'ping' });
  }, [sendMessage]);

  // Connect when user is available
  useEffect(() => {
    if (user) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [user]); // Only depend on user changes

  return {
    isConnected,
    isConnecting,
    connect,
    disconnect,
    sendMessage,
    ping,
  };
}
