'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthContext';

interface UserDropdownProps {
  className?: string;
}

export default function UserDropdown({ className = '' }: UserDropdownProps) {
  const { user, isAuthenticated, logout, isLoading } = useAuth();
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

      <div
        className={`absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 min-w-48 transform transition-all duration-200 ease-in-out ${
          showDropdown
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
        }`}
      >
        {/* Menu Options */}
        <div className="py-2">
          <button
            onClick={() => router.push('/pricing')}
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
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
              />
            </svg>
            <span>Upgrade Plan</span>
          </button>
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
    </div>
  );
}
