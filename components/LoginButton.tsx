'use client';

import { useState } from 'react';
import { useAuth } from './AuthContext';

interface LoginButtonProps {
  variant?: 'primary' | 'outline';
  className?: string;
}

export default function LoginButton({
  variant = 'primary',
  className = '',
}: LoginButtonProps) {
  const { user, isAuthenticated, login, logout, isLoading } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);

  const handleLogin = (provider: string) => {
    login(provider);
  };

  const baseClasses =
    'inline-flex items-center px-6 py-3 rounded-full font-semibold transition-all duration-300 transform hover:scale-105';

  const variantClasses =
    variant === 'primary'
      ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:from-pink-600 hover:to-purple-700 shadow-lg hover:shadow-xl'
      : 'border-2 border-white text-white hover:bg-white hover:text-purple-900';

  if (isAuthenticated && user) {
    return (
      <div className="relative">
        <button
          className={`${baseClasses} ${variantClasses} ${className}`}
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={isLoading}
        >
          <div className="flex items-center">
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name || user.email}
                className="w-6 h-6 rounded-full mr-2"
              />
            ) : (
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center mr-2">
                <span className="text-white text-xs font-bold">
                  {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <span className="text-white">{user.name || user.email}</span>
            <svg
              className="w-4 h-4 ml-2 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </button>

        {showDropdown && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl z-50">
            <div className="py-2">
              <div className="px-4 py-2 text-sm text-gray-500 border-b">
                Signed in as {user.email}
              </div>
              <button
                onClick={logout}
                className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center"
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        className={`${baseClasses} ${variantClasses} ${className}`}
        onClick={() => handleLogin('Google')}
        disabled={isLoading}
      >
        {isLoading ? (
          <div className="flex items-center">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
            Signing in...
          </div>
        ) : (
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </div>
        )}
      </button>
    </div>
  );
}
