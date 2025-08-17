import { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface UserCredits {
  userId: string;
  email: string;
  creditsAvailable: number;
  createdAt: string;
  lastLoginAt: string;
}

export function useUserCredits() {
  const { user, isAuthenticated } = useAuth();
  const [credits, setCredits] = useState<UserCredits | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCredits = async () => {
    if (!user || !isAuthenticated) {
      setCredits(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        userId: user.id,
        username: user.email, // user.email is actually the username from JWT token
      });
      const response = await fetch(`/api/user?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch user credits');
      }

      const data = await response.json();

      if (data.success && data.user) {
        setCredits(data.user);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      console.error('Error fetching user credits:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const refreshCredits = () => {
    fetchCredits();
  };

  useEffect(() => {
    fetchCredits();
  }, [user, isAuthenticated]);

  return {
    credits,
    loading,
    error,
    refreshCredits,
  };
}
