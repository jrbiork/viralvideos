'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';
import LoginButton from './LoginButton';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Redirect to home page (which should have login)
      router.push('/');
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="relative mb-6 flex justify-center">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 w-16 h-16 border-4 border-slate-600 rounded-full animate-pulse-slow"></div>
              <div className="absolute inset-0 w-16 h-16 border-4 border-blue-500 rounded-full animate-spin border-t-transparent"></div>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-white mb-3">
            Checking Authentication
          </h3>
          <p className="text-slate-300 text-lg">
            Please wait while we verify your login status...
          </p>
        </div>
      </div>
    );
  }

  // Show login prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <div className="text-2xl">🔐</div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">
            Authentication Required
          </h1>
          <p className="text-slate-300 text-lg mb-8">
            You need to sign in to access this page. Please authenticate to
            continue.
          </p>
          <LoginButton variant="primary" />
          <div className="mt-6">
            <button
              onClick={() => router.push('/')}
              className="text-slate-400 hover:text-white transition-colors"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render the protected content if authenticated
  return <>{children}</>;
}
