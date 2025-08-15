'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
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

// Cache keys for localStorage
const AUTH_CACHE_KEY = 'viral-videos-auth-cache';
const AUTH_CACHE_TIMESTAMP_KEY = 'viral-videos-auth-timestamp';
const CACHE_DURATION = 20 * 60 * 1000; // 20 minutes in milliseconds

interface AuthCache {
  user: User;
  timestamp: number;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if cached auth data is still valid
  const isCacheValid = (): boolean => {
    try {
      const timestamp = localStorage.getItem(AUTH_CACHE_TIMESTAMP_KEY);
      if (!timestamp) return false;

      const cacheAge = Date.now() - parseInt(timestamp);
      return cacheAge < CACHE_DURATION;
    } catch {
      return false;
    }
  };

  // Get cached auth data
  const getCachedAuth = (): User | null => {
    try {
      if (!isCacheValid()) return null;

      const cached = localStorage.getItem(AUTH_CACHE_KEY);
      if (!cached) return null;

      const authCache: AuthCache = JSON.parse(cached);
      return authCache.user;
    } catch {
      return null;
    }
  };

  // Set cached auth data
  const setCachedAuth = (user: User | null) => {
    try {
      if (user) {
        const authCache: AuthCache = {
          user,
          timestamp: Date.now(),
        };
        localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(authCache));
        localStorage.setItem(AUTH_CACHE_TIMESTAMP_KEY, Date.now().toString());
      } else {
        localStorage.removeItem(AUTH_CACHE_KEY);
        localStorage.removeItem(AUTH_CACHE_TIMESTAMP_KEY);
      }
    } catch (error) {
      console.error('Failed to cache auth data:', error);
    }
  };

  // Check authentication status from server
  const checkAuthStatus = async (): Promise<User | null> => {
    try {
      const response = await fetch('/api/auth/session');
      const data = await response.json();

      if (data.user) {
        setCachedAuth(data.user);
        return data.user;
      }

      // Clear cache if no user found
      setCachedAuth(null);
      return null;
    } catch (error) {
      console.error('Auth check failed:', error);
      return null;
    }
  };

  // Refresh authentication status (force server check)
  const refreshAuth = async () => {
    setIsLoading(true);
    try {
      const user = await checkAuthStatus();
      setUser(user);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      // First, try to get auth from cache
      const cachedUser = getCachedAuth();

      if (cachedUser) {
        setUser(cachedUser);
        setIsLoading(false);
        return;
      }

      // If no valid cache, check with server
      const user = await checkAuthStatus();
      setUser(user);
      setIsLoading(false);
    };

    initializeAuth();
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
    localStorage.setItem('oauth_state', state);

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
        return originalOnBeforeUnload.call(window);
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
      setCachedAuth(sessionData.user);
      setUser(sessionData.user);

      // Clear the state parameter
      localStorage.removeItem('oauth_state');
    } catch (error) {
      console.error('Auth callback failed:', error);

      // If it's an invalid_grant error, clear the state and suggest retry
      if (error instanceof Error && error.message.includes('invalid_grant')) {
        localStorage.removeItem('oauth_state');
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
    setCachedAuth(null);
    setUser(null);
    localStorage.removeItem('oauth_state');

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
    isLoading,
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
