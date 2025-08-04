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

    const token = localStorage.getItem('cognito_token');

    if (!token) {
      throw new Error('No authentication token found');
    }

    const { method = 'GET', headers = {}, body } = options;

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...headers,
      },
    };

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `HTTP error! status: ${response.status}`,
      );
    }

    return response.json();
  };

  return {
    authenticatedFetch,
    isAuthenticated,
    user,
  };
}

// Example usage:
// const { authenticatedFetch, isAuthenticated, user } = useAuthenticatedFetch();
//
// const fetchUserData = async () => {
//   try {
//     const data = await authenticatedFetch('/api/user');
//     console.log('User data:', data);
//   } catch (error) {
//     console.error('Failed to fetch user data:', error);
//   }
// };
