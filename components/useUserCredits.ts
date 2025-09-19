import { useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useAuthenticatedFetch } from './useAuthenticatedFetch';
import { WebSocketMessage } from '@/app/types/websocket';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useUserDataCache } from '../hooks/useUserDataCache';

interface UserCredits {
  credits: number;
  lastUpdated: string;
}

export function useUserCredits() {
  const { user } = useAuth();
  const { authenticatedFetch } = useAuthenticatedFetch();
  const { userData, loading, error, updateCredits, refresh } =
    useUserDataCache();
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const refreshPromiseRef = useRef<Promise<UserCredits | null> | null>(null);

  // listen to credit_updated  from websocket and update credits
  const { isConnected } = useWebSocket({
    onMessage: (message: WebSocketMessage) => {
      // Handle different message types
      switch (message.action) {
        case 'credit_updated':
          console.log('WebSocket credit_updated msg:', message);
          if (message.data.currentCredits !== undefined) {
            // Update the cache directly
            updateCredits(message.data.currentCredits);
            setCredits({
              credits: message.data.currentCredits,
              lastUpdated: new Date().toISOString(),
            });
          }
          break;
      }
    },
    onConnect: () => {
      // WebSocket connected - refresh credits to ensure we have the latest data
      console.log('WebSocket credit_updated connected', isConnected);
      refreshCredits();
    },
    onDisconnect: () => {
      // WebSocket disconnected
      console.log('WebSocket credit_updated disconnected', isConnected);
    },
    onError: (error) => {
      console.error('WebSocket credit_updated', error);
    },
  });

  const fetchCredits = async (): Promise<UserCredits> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Use cached data if available, otherwise fetch from API
    if (userData) {
      return {
        credits: userData.user.creditsAvailable || 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    // Fallback to API call if no cached data
    const data = await authenticatedFetch('/api/user');
    return {
      credits: data.user.creditsAvailable || 0,
      lastUpdated: new Date().toISOString(),
    };
  };

  const refreshCredits = async (): Promise<void> => {
    // Use the cache's refresh method
    await refresh();

    // Update local credits state if we have cached data
    if (userData) {
      setCredits({
        credits: userData.user.creditsAvailable || 0,
        lastUpdated: new Date().toISOString(),
      });
    }
  };

  // Sync cached user data with local credits state
  useEffect(() => {
    if (userData) {
      setCredits({
        credits: userData.user.creditsAvailable || 0,
        lastUpdated: new Date().toISOString(),
      });
    } else if (!user) {
      setCredits(null);
    }
  }, [userData, user]);

  // Fetch credits when user changes (only if no cached data)
  useEffect(() => {
    if (user && !userData) {
      refreshCredits();
    } else if (!user) {
      setCredits(null);
      setError(null);
    }
  }, [user, userData]);

  return {
    credits: credits?.credits || 0,
    loading,
    error,
    refreshCredits,
  };
}
