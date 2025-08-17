'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useUserCredits } from './useUserCredits';

interface UserDropdownProps {
  className?: string;
}

export default function UserDropdown({ className = '' }: UserDropdownProps) {
  const { user, isAuthenticated, logout, isLoading } = useAuth();
  const { credits, loading: creditsLoading } = useUserCredits();
  const [showDropdown, setShowDropdown] = useState(false);
  const [imageError, setImageError] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Helper function to ensure picture URL is absolute
  const getPictureUrl = (url: string | undefined) => {
    if (!url) return null;

    // If it's already an absolute URL, return as is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // If it's a relative URL, make it absolute
    if (url.startsWith('/')) {
      return `${window.location.origin}${url}`;
    }

    // If it's a relative URL without leading slash, add it
    return `${window.location.origin}/${url}`;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!isAuthenticated || !user) {
    return null;
  }

  // Debug: Log the user picture URL
  if (user.picture) {
    console.log('User picture URL:', user.picture);
    console.log('Processed picture URL:', getPictureUrl(user.picture));
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="w-full flex items-center justify-between text-white p-3 rounded-lg hover:bg-slate-800 transition-colors duration-200"
        disabled={isLoading}
      >
        <div className="flex items-center space-x-3">
          {getPictureUrl(user.picture) && !imageError ? (
            <img
              src={getPictureUrl(user.picture)!}
              alt={user.name || user.email}
              className="w-8 h-8 rounded-full object-cover"
              onError={(e) => {
                console.error('Image failed to load:', e);
                setImageError(true);
              }}
              onLoad={() => {
                console.log('Image loaded successfully');
                setImageError(false);
              }}
            />
          ) : (
            <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
              {(user.name || user.email || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="text-left">
            <div className="text-sm font-medium truncate max-w-32">
              {user.name || 'User'}
            </div>
            <div className="text-xs text-gray-400 truncate max-w-32">
              {user.email}
            </div>
            {/* Credits Display in Button */}
            <div className="flex items-center space-x-1 mt-1">
              <svg
                className="w-3 h-3 text-yellow-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-yellow-400 text-xs font-medium">
                {creditsLoading ? '...' : credits?.creditsAvailable || 0}
              </span>
            </div>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
            showDropdown ? 'rotate-180' : ''
          }`}
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
      </button>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 min-w-48">
          {/* Menu Options */}
          <div className="py-2">
            <button
              onClick={logout}
              className="w-full px-4 py-3 text-left text-gray-300 hover:bg-slate-800 hover:text-white transition-colors duration-200 flex items-center space-x-3"
            >
              <svg
                className="w-4 h-4"
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
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
