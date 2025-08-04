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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated (e.g., from localStorage or session)
    const checkAuthStatus = async () => {
      try {
        const token = localStorage.getItem('cognito_token');
        if (token) {
          // Validate token and get user info
          const userInfo = await getUserInfo(token);
          setUser(userInfo);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('cognito_token');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
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

    const authUrl =
      `https://${cognitoDomain}/oauth2/authorize?` +
      `response_type=code&` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `identity_provider=${provider}&` +
      `scope=openid+email+profile&` +
      `state=${state}`;

    window.location.href = authUrl;
  };

  const handleAuthCallback = async (code: string) => {
    try {
      setIsLoading(true);

      // Exchange authorization code for tokens
      const tokens = await exchangeCodeForTokens(code);

      // Store the access token
      localStorage.setItem('cognito_token', tokens.access_token);

      // Get user information
      const userInfo = await getUserInfo(tokens.access_token);
      setUser(userInfo);

      // Clear the state parameter
      localStorage.removeItem('oauth_state');
    } catch (error) {
      console.error('Auth callback failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('cognito_token');
    localStorage.removeItem('oauth_state');

    // Redirect to Cognito logout if needed
    const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI;

    if (cognitoDomain && clientId && redirectUri) {
      const logoutUrl =
        `https://${cognitoDomain}/logout?` +
        `client_id=${clientId}&` +
        `logout_uri=${encodeURIComponent(redirectUri)}`;
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
  const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI;

  const response = await fetch(`https://${cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId!,
      code: code,
      redirect_uri: redirectUri!,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to exchange code for tokens');
  }

  return await response.json();
}

async function getUserInfo(accessToken: string) {
  const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;

  const response = await fetch(`https://${cognitoDomain}/oauth2/userInfo`, {
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
