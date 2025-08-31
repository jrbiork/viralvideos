import { useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useAuthenticatedFetch } from './useAuthenticatedFetch';

interface UserCredits {
  credits: number;
  lastUpdated: string;
}

export function useUserCredits() {
  const { user } = useAuth();
  const { authenticatedFetch } = useAuthenticatedFetch();
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<UserCredits | null> | null>(null);

  const fetchCredits = async (): Promise<UserCredits> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    const data = await authenticatedFetch('/api/user');
    return {
      credits: data.user.creditsAvailable || 0,
      lastUpdated: new Date().toISOString(),
    };
  };

  const refreshCredits = async (): Promise<void> => {
    // Prevent multiple simultaneous refresh attempts
    if (refreshPromiseRef.current) {
      await refreshPromiseRef.current;
      return;
    }

    setLoading(true);
    setError(null);

    const refreshPromise = fetchCredits()
      .then((userCredits) => {
        setCredits(userCredits);
        return userCredits;
      })
      .catch((err) => {
        setError(err.message);
        throw err;
      })
      .finally(() => {
        setLoading(false);
        refreshPromiseRef.current = null;
      });

    refreshPromiseRef.current = refreshPromise;
    await refreshPromise;
  };

  // Fetch credits when user changes
  useEffect(() => {
    if (user) {
      refreshCredits();
    } else {
      setCredits(null);
      setError(null);
    }
  }, [user]);

  return {
    credits: credits?.credits || 0,
    loading,
    error,
    refreshCredits,
  };
}
