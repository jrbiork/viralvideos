'use client';

import {
  createContext,
  useContext,
  ReactNode,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { WebSocketMessage } from '@/app/types/websocket';

interface WebSocketContextType {
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (message: WebSocketMessage) => void;
  ping: () => void;
  subscribe: (
    id: string,
    callback: (message: WebSocketMessage) => void,
  ) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(
  undefined,
);

// Message subscribers for distributing messages to different components
type MessageSubscriber = {
  id: string;
  callback: (message: WebSocketMessage) => void;
};

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const subscribersRef = useRef<Map<string, MessageSubscriber>>(new Map());

  // Handle incoming WebSocket messages and distribute to subscribers
  const handleMessage = useCallback((message: WebSocketMessage) => {
    // Broadcast to all subscribers
    subscribersRef.current.forEach((subscriber) => {
      try {
        subscriber.callback(message);
      } catch (error) {
        console.error(`Error in WebSocket subscriber ${subscriber.id}:`, error);
      }
    });
  }, []);

  // Initialize WebSocket connection at the provider level
  const { isConnected, isConnecting, connect, disconnect, sendMessage, ping } =
    useWebSocket({
      onMessage: handleMessage,
      onConnect: () => {
        console.log('WebSocket connected (global)');
      },
      onDisconnect: () => {
        console.log('WebSocket disconnected (global)');
      },
      onError: (error) => {
        console.error('WebSocket error (global):', error);
      },
    });

  // Subscribe to WebSocket messages
  const subscribe = useCallback(
    (id: string, callback: (message: WebSocketMessage) => void) => {
      subscribersRef.current.set(id, { id, callback });

      // Return unsubscribe function
      return () => {
        subscribersRef.current.delete(id);
      };
    },
    [],
  );

  const value: WebSocketContextType = {
    isConnected,
    isConnecting,
    connect,
    disconnect,
    sendMessage,
    ping,
    subscribe,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error(
      'useWebSocketContext must be used within a WebSocketProvider',
    );
  }
  return context;
}

