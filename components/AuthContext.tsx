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
    // Check if user is already authenticated via session
    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/api/auth/session');
        const data = await response.json();

        if (data.user) {
          setUser(data.user);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
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

    console.log('Login debug:', {
      cognitoDomain,
      clientId: clientId ? '***' : 'undefined',
      redirectUri,
      provider,
    });

    if (!cognitoDomain || !clientId || !redirectUri) {
      console.error('Missing Cognito configuration:', {
        cognitoDomain: !!cognitoDomain,
        clientId: !!clientId,
        redirectUri: !!redirectUri,
      });
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

    console.log('Constructed auth URL:', authUrl);

    console.log('Redirecting to auth URL:', authUrl);
    window.location.href = authUrl;
  };

  const handleAuthCallback = async (code: string) => {
    try {
      setIsLoading(true);

      // Exchange authorization code for tokens
      const tokens = await exchangeCodeForTokens(code);

      console.log('Tokens received:', {
        access_token: tokens.access_token ? 'present' : 'missing',
        token_type: tokens.token_type,
        available_tokens: Object.keys(tokens),
      });

      // Create a session with the token
      const sessionResponse = await fetch('/api/auth/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: tokens.access_token }),
      });

      console.log('Session response status:', sessionResponse.status);

      if (!sessionResponse.ok) {
        const errorText = await sessionResponse.text();
        console.error('Session creation failed:', errorText);
        throw new Error('Failed to create session');
      }

      const sessionData = await sessionResponse.json();
      console.log('Session data received:', sessionData);
      setUser(sessionData.user);

      // Clear the state parameter
      localStorage.removeItem('oauth_state');
    } catch (error) {
      console.error('Auth callback failed:', error);

      // If it's an invalid_grant error, clear the state and suggest retry
      if (error instanceof Error && error.message.includes('invalid_grant')) {
        localStorage.removeItem('oauth_state');
        console.log(
          'Authorization code expired or already used. Please try signing in again.',
        );
      }

      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Clear the session on the server
      await fetch('/api/auth/session', {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }

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

  console.log('Token exchange debug:', {
    cognitoDomain,
    clientId: clientId ? clientId : 'undefined',
    clientSecret: clientSecret ? clientSecret : 'undefined',
    redirectUri,
    code: code ? code : 'undefined',
  });

  if (!cognitoDomain || !clientId || !redirectUri) {
    throw new Error(
      `Missing Cognito configuration: domain=${!!cognitoDomain}, clientId=${!!clientId}, redirectUri=${!!redirectUri}`,
    );
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

  console.log('Making token request to:', tokenUrl);
  console.log('Request body params:', Object.fromEntries(bodyParams.entries()));

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams,
  });

  console.log('Token response status:', response);
  console.log(
    'Token response headers:',
    Object.fromEntries(response.headers.entries()),
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Token exchange error response:', errorText);
    throw new Error(
      `Failed to exchange code for tokens: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const tokens = await response.json();
  console.log(
    'Token exchange successful, received tokens:',
    Object.keys(tokens),
  );
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
