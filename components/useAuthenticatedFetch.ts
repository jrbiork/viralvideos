import { useAuth } from './AuthContext';

interface UseAuthenticatedFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
}

export function useAuthenticatedFetch() {
  const { user, isAuthenticated } = useAuth();

  const authenticatedFetch = async (
    url: string,
    options: UseAuthenticatedFetchOptions = {},
  ) => {
    if (!isAuthenticated) {
      throw new Error('User must be authenticated to make this request');
    }

    const { method = 'GET', headers = {}, body } = options;

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      credentials: 'include', // Include cookies for session authentication
    };

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(
        errorData.error || `HTTP error! status: ${response.status}`,
      ) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    return response.json();
  };

  return {
    authenticatedFetch,
    isAuthenticated,
    user,
  };
}
