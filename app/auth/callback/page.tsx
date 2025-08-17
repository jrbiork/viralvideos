'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../components/AuthContext';

export default function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { handleAuthCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasProcessed = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      // Prevent multiple executions
      if (error || isLoading || hasProcessed.current) {
        return;
      }

      hasProcessed.current = true;

      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const errorParam = searchParams.get('error');

        // Check for OAuth errors
        if (errorParam) {
          console.error('OAuth error received:', errorParam);
          setError(`Authentication failed: ${errorParam}`);
          return;
        }

        // Validate state parameter
        const savedState = localStorage.getItem('oauth_state');
        if (state !== savedState) {
          console.error('State mismatch:', {
            received: state,
            saved: savedState,
          });
          setError('Invalid state parameter. Please try again.');
          return;
        }

        if (!code) {
          console.error('No authorization code received');
          setError('No authorization code received.');
          return;
        }

        // Set loading state
        setIsLoading(true);

        // Clear the state immediately to prevent reuse
        localStorage.removeItem('oauth_state');

        // Handle the authentication callback
        await handleAuthCallback(code);

        // Send success message to parent window and close popup
        if (window.opener) {
          window.opener.postMessage(
            { type: 'AUTH_SUCCESS' },
            window.location.origin,
          );
          window.close();
        } else {
          // Fallback: redirect to create page if not in popup
          router.push('/create');
        }
      } catch (error) {
        console.error('Auth callback error:', error);

        // Send error message to parent window and close popup
        if (window.opener) {
          window.opener.postMessage(
            {
              type: 'AUTH_ERROR',
              error: 'Authentication failed. Please try again.',
            },
            window.location.origin,
          );
          window.close();
        } else {
          // Fallback: show error if not in popup
          setError('Authentication failed. Please try again.');
        }
      }
    };

    handleCallback();
  }, [searchParams, handleAuthCallback, router, error]);

  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'rgba(9,5,38,255)' }}
      >
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">
              Authentication Failed
            </h2>
            <p className="text-gray-300 mb-6">{error}</p>
            <div className="space-y-3">
              <button
                onClick={() => router.push('/')}
                className="bg-gradient-to-r from-pink-500 to-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:from-pink-600 hover:to-purple-700 transition-all duration-300"
              >
                Back to Home
              </button>

              {error?.includes('invalid_grant') && (
                <button
                  onClick={() => {
                    localStorage.clear();
                    router.push('/');
                  }}
                  className="bg-blue-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-blue-700 transition-all duration-300"
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: 'rgba(9,5,38,255)' }}
    >
      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">
            Completing Sign In
          </h2>
          <p className="text-gray-300">
            Please wait while we complete your authentication...
          </p>
        </div>
      </div>
    </div>
  );
}
