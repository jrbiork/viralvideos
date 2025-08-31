'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useRef,
} from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (provider: string) => void;
  logout: () => void;
  handleAuthCallback: (code: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// In-memory cache for auth state with TTL
interface AuthCacheEntry {
  user: User;
  timestamp: number;
  expiresAt: number;
}

class AuthCache {
  private cache: AuthCacheEntry | null = null;
  private readonly ttl = 20 * 60 * 1000; // 20 minutes in milliseconds

  get(): User | null {
    if (!this.cache) return null;

    const now = Date.now();
    if (now > this.cache.expiresAt) {
      this.clear();
      return null;
    }

    return this.cache.user;
  }

  set(user: User): void {
    const now = Date.now();
    this.cache = {
      user,
      timestamp: now,
      expiresAt: now + this.ttl,
    };
  }

  clear(): void {
    this.cache = null;
  }

  isValid(): boolean {
    return this.cache !== null && Date.now() <= this.cache.expiresAt;
  }
}

// Global auth cache instance
const authCache = new AuthCache();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshPromiseRef = useRef<Promise<User | null> | null>(null);
  const isInitializedRef = useRef(false);
  const oauthStateRef = useRef<string | null>(null);

  // Check authentication status from server
  const checkAuthStatus = async (): Promise<User | null> => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();

      if (data.user) {
        authCache.set(data.user);
        return data.user;
      }

      // Clear cache if no user found
      authCache.clear();
      return null;
    } catch (error) {
      console.error('Auth check failed:', error);
      return null;
    }
  };

  // Refresh authentication status (force server check)
  const refreshAuth = async (): Promise<void> => {
    // Prevent multiple simultaneous refresh attempts
    if (refreshPromiseRef.current) {
      await refreshPromiseRef.current;
      return;
    }

    setIsRefreshing(true);

    const refreshPromise = checkAuthStatus()
      .then((user) => {
        setUser(user);
        return user;
      })
      .finally(() => {
        setIsRefreshing(false);
        refreshPromiseRef.current = null;
      });

    refreshPromiseRef.current = refreshPromise;
    await refreshPromise;
  };

  // Stale-while-revalidate pattern for auth state
  const getAuthState = async (): Promise<User | null> => {
    // First, return cached data immediately if available
    const cachedUser = authCache.get();
    if (cachedUser) {
      setUser(cachedUser);
      setIsLoading(false);

      // Then refresh in background if cache is stale
      if (!authCache.isValid()) {
        refreshAuth().catch(console.error);
      }
      return cachedUser;
    }

    // If no cache, fetch from server
    const user = await checkAuthStatus();
    setUser(user);
    setIsLoading(false);
    return user;
  };

  // Detect if user was redirected due to expired authentication
  const detectExpiredAuthRedirect = () => {
    // Check if we're on the root page and have cached auth data
    if (typeof window !== 'undefined' && window.location.pathname === '/') {
      const cachedUser = authCache.get();
      if (cachedUser && !isInitializedRef.current) {
        // User has cached auth but is on root page - likely expired session
        console.log(
          'Detected potential expired session redirect, clearing cache',
        );
        authCache.clear();
        setUser(null);
        return true;
      }
    }
    return false;
  };

  // Check for middleware redirects on page load
  const checkForMiddlewareRedirect = () => {
    if (typeof window === 'undefined') return false;

    // Check if we have a referrer that indicates we were redirected from a protected route
    const referrer = document.referrer;
    const currentPath = window.location.pathname;

    // If we're on the root page and the referrer was from a protected route,
    // it's likely a middleware redirect due to expired auth
    if (currentPath === '/' && referrer) {
      const referrerUrl = new URL(referrer);
      const protectedRoutes = ['/create', '/videos', '/debug'];
      const wasFromProtectedRoute = protectedRoutes.some((route) =>
        referrerUrl.pathname.startsWith(route),
      );

      if (wasFromProtectedRoute) {
        console.log(
          'Detected middleware redirect from protected route, clearing auth cache',
        );
        authCache.clear();
        setUser(null);
        return true;
      }
    }

    return false;
  };

  useEffect(() => {
    // Check for expired auth redirect first
    if (detectExpiredAuthRedirect()) {
      setIsLoading(false);
      return;
    }

    // Check for middleware redirects
    if (checkForMiddlewareRedirect()) {
      setIsLoading(false);
      return;
    }

    // Initialize auth state
    getAuthState().finally(() => {
      isInitializedRef.current = true;
    });
  }, []);

  // Listen for navigation events to detect expired auth redirects
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeUnload = () => {
      // Clear cache on page unload to ensure fresh state on next load
      if (window.location.pathname === '/') {
        authCache.clear();
      }
    };

    const handlePopState = () => {
      // Check if we navigated to root page with cached auth
      if (window.location.pathname === '/') {
        const cachedUser = authCache.get();
        if (cachedUser) {
          // User has cached auth but is on root page - likely expired session
          console.log(
            'Detected navigation to root with cached auth, clearing cache',
          );
          authCache.clear();
          setUser(null);
        }
      }
    };

    // Listen for navigation events
    const handleNavigation = () => {
      // Check if we're on root page and have cached auth
      if (window.location.pathname === '/') {
        const cachedUser = authCache.get();
        if (cachedUser && isInitializedRef.current) {
          // This might be a middleware redirect, clear the cache
          console.log(
            'Detected navigation to root with cached auth, clearing cache',
          );
          authCache.clear();
          setUser(null);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    // Use a more reliable method to detect navigation changes
    let currentPath = window.location.pathname;
    const checkPathChange = () => {
      if (window.location.pathname !== currentPath) {
        currentPath = window.location.pathname;
        handleNavigation();
      }
    };

    // Check for path changes periodically
    const pathCheckInterval = setInterval(checkPathChange, 100);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      clearInterval(pathCheckInterval);
    };
  }, []);

  const login = (provider: string) => {
    const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI;

    if (!cognitoDomain || !clientId || !redirectUri) {
      console.error('Missing Cognito configuration');
      return;
    }

    // Generate a random state parameter for security
    const state = Math.random().toString(36).substring(2, 15);
    // Store state in memory only (no sessionStorage)
    oauthStateRef.current = state;

    // Ensure the domain doesn't already include the protocol
    const cleanDomain = cognitoDomain.replace(/^https?:\/\//, '');
    const authUrl =
      `https://${cleanDomain}/oauth2/authorize?` +
      `response_type=code&` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `identity_provider=${provider}&` +
      `scope=openid+email+profile&` +
      `state=${state}`;

    // Open popup window for authentication
    const popup = window.open(
      authUrl,
      'auth-popup',
      'width=500,height=600,scrollbars=yes,resizable=yes',
    );

    if (!popup) {
      console.error('Popup blocked by browser');
      alert('Please allow popups for this site to sign in with Google');
      return;
    }

    // Listen for popup close or message
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        // Check if authentication was successful by checking the session
        refreshAuth();
      }
    }, 1000);

    // Listen for messages from popup (if needed)
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'AUTH_SUCCESS') {
        clearInterval(checkClosed);
        popup.close();
        refreshAuth();
      } else if (event.data.type === 'AUTH_ERROR') {
        clearInterval(checkClosed);
        popup.close();
        console.error('Authentication failed:', event.data.error);
      }
    };

    window.addEventListener('message', handleMessage);

    // Cleanup listener when popup closes
    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(checkClosed);
    };

    // Set up cleanup when popup closes
    const originalOnBeforeUnload = window.onbeforeunload;
    window.onbeforeunload = () => {
      cleanup();
      if (originalOnBeforeUnload) {
        return originalOnBeforeUnload.call(window, new Event('beforeunload'));
      }
    };
  };

  const handleAuthCallback = async (code: string) => {
    try {
      setIsLoading(true);

      // Exchange authorization code for tokens
      const tokens = await exchangeCodeForTokens(code);

      // Store the Cognito token in a cookie via the session API
      const sessionResponse = await fetch('/api/auth/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: tokens.access_token }),
      });

      if (!sessionResponse.ok) {
        const errorText = await sessionResponse.text();
        console.error('Session creation failed:', errorText);
        throw new Error('Failed to create session');
      }

      const sessionData = await sessionResponse.json();

      // Cache the user data and update state
      authCache.set(sessionData.user);
      setUser(sessionData.user);

      // Clear the state parameter from memory
      oauthStateRef.current = null;
    } catch (error) {
      console.error('Auth callback failed:', error);

      // If it's an invalid_grant error, clear the state and suggest retry
      if (error instanceof Error && error.message.includes('invalid_grant')) {
        oauthStateRef.current = null;
      }

      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Clear the Cognito token cookie
      await fetch('/api/auth/session', {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }

    // Clear cached auth data and state
    authCache.clear();
    setUser(null);
    oauthStateRef.current = null;

    // Redirect to Cognito logout if needed
    const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI;

    if (cognitoDomain && clientId) {
      // Ensure the domain doesn't already include the protocol
      const cleanDomain = cognitoDomain.replace(/^https?:\/\//, '');
      const logoutUri =
        process.env.NEXT_PUBLIC_LOGOUT_URI || 'http://localhost:3000';
      const logoutUrl =
        `https://${cleanDomain}/logout?` +
        `client_id=${clientId}&` +
        `logout_uri=${encodeURIComponent(logoutUri)}`;
      window.location.href = logoutUrl;
    }
  };

  const value = {
    user,
    isLoading: isLoading || isRefreshing,
    isAuthenticated: !!user,
    login,
    logout,
    handleAuthCallback,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper functions for token exchange and user info
async function exchangeCodeForTokens(code: string) {
  const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const clientSecret = process.env.NEXT_PUBLIC_COGNITO_CLIENT_SECRET;
  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI;

  if (!cognitoDomain || !clientId || !redirectUri) {
    throw new Error('Missing Cognito configuration');
  }

  // Ensure the domain doesn't already include the protocol
  const cleanDomain = cognitoDomain.replace(/^https?:\/\//, '');
  const tokenUrl = `https://${cleanDomain}/oauth2/token`;

  // Prepare the request body
  const bodyParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code: code,
    redirect_uri: redirectUri,
  });

  // Add client secret if available (for confidential clients)
  if (clientSecret) {
    bodyParams.append('client_secret', clientSecret);
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Token exchange error response:', errorText);
    throw new Error(
      `Failed to exchange code for tokens: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const tokens = await response.json();
  return tokens;
}

async function getUserInfo(accessToken: string) {
  const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;

  // Ensure the domain doesn't already include the protocol
  const cleanDomain = cognitoDomain?.replace(/^https?:\/\//, '') || '';

  const response = await fetch(`https://${cleanDomain}/oauth2/userInfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  const userInfo = await response.json();

  return {
    id: userInfo.sub,
    email: userInfo.email,
    name: userInfo.name || userInfo.email,
    picture: userInfo.picture,
  };
}
