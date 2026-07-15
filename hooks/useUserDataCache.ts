import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../components/AuthContext';
import { useAuthenticatedFetch } from '../components/useAuthenticatedFetch';

interface UserData {
  user: {
    id: string;
    email: string;
    name: string;
    picture?: string;
    videosCreated?: number;
    videosCreatedThisMonth?: number;
    quotaPeriodStart?: string;
    imagesGenerated?: number;
    imagesGeneratedThisMonth?: number;
    imageQuotaPeriodStart?: string;
    animationsGeneratedThisMonth?: number;
    animationQuotaPeriodStart?: string;
    username: string;
    createdAt: string;
    lastLoginAt: string;
    subscription?: {
      mode: 'free' | 'pro' | 'starter' | 'creator' | 'influencer';
      renewalDate?: string | null;
      status: 'active' | 'cancelled' | 'expired';
    };
  };
}

interface CachedUserData {
  data: UserData;
  timestamp: number;
  expiresAt: number;
}

// In-memory cache for user data
class UserDataCache {
  private cache = new Map<string, CachedUserData>();
  // Extend cache duration significantly to reduce API calls
  private readonly CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours
  private readonly STALE_WHILE_REVALIDATE = 12 * 60 * 60 * 1000; // 12 hours

  set(userId: string, data: UserData): void {
    const now = Date.now();
    this.cache.set(userId, {
      data,
      timestamp: now,
      expiresAt: now + this.CACHE_DURATION,
    });
  }

  get(userId: string): UserData | null {
    const cached = this.cache.get(userId);
    if (!cached) return null;

    const now = Date.now();

    // If expired, remove from cache
    if (now > cached.expiresAt) {
      this.cache.delete(userId);
      return null;
    }

    return cached.data;
  }

  isStale(userId: string): boolean {
    const cached = this.cache.get(userId);
    if (!cached) return true;

    const now = Date.now();
    return now > cached.timestamp + this.STALE_WHILE_REVALIDATE;
  }

  clear(userId?: string): void {
    if (userId) {
      this.cache.delete(userId);
    } else {
      this.cache.clear();
    }
  }
}

// Global cache instance
const userDataCache = new UserDataCache();

export function useUserDataCache() {
  const { user } = useAuth();
  const { authenticatedFetch } = useAuthenticatedFetch();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchPromiseRef = useRef<Promise<UserData | null> | null>(null);

  const fetchUserData = useCallback(
    async (forceRefresh = false): Promise<UserData | null> => {
      if (!user?.id) {
        setUserData(null);
        return null;
      }

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cachedData = userDataCache.get(user.id);
        if (cachedData) {
          setUserData(cachedData);

          // If data is stale, fetch in background (stale-while-revalidate)
          if (userDataCache.isStale(user.id)) {
            console.log('User data is stale, fetching in background...');
            fetchUserData(true).catch(console.error);
          }

          return cachedData;
        }
      }

      // Prevent multiple simultaneous requests
      if (fetchPromiseRef.current) {
        return fetchPromiseRef.current;
      }

      setLoading(true);
      setError(null);

      const fetchPromise = (async (): Promise<UserData | null> => {
        try {
          console.log('Fetching user data from API...');
          const data = await authenticatedFetch('/api/user');

          // Cache the data
          userDataCache.set(user.id, data);
          setUserData(data);

          return data;
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : 'Failed to fetch user data';
          setError(errorMessage);
          console.error('Error fetching user data:', err);
          return null;
        } finally {
          setLoading(false);
          fetchPromiseRef.current = null;
        }
      })();

      fetchPromiseRef.current = fetchPromise;
      return fetchPromise;
    },
    [user?.id, authenticatedFetch],
  );

  // Initial load
  useEffect(() => {
    if (user?.id) {
      fetchUserData();
    } else {
      // Clear cache and data when user logs out
      userDataCache.clear();
      setUserData(null);
      setError(null);
    }
  }, [user?.id, fetchUserData]);

  // Force refresh
  const refresh = useCallback(() => {
    return fetchUserData(true);
  }, [fetchUserData]);

  // Clear cache
  const clearCache = useCallback(() => {
    if (user?.id) {
      userDataCache.clear(user.id);
    }
  }, [user?.id]);

  return {
    userData,
    loading,
    error,
    refresh,
    clearCache,
    // Convenience getter
    userInfo: userData?.user,
  };
}
