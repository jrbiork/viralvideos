'use client';

import { useUserCredits } from './useUserCredits';

interface CreditsDisplayProps {
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function CreditsDisplay({
  showLabel = true,
  size = 'md',
  className = '',
}: CreditsDisplayProps) {
  const { credits, loading } = useUserCredits();

  const sizeClasses = {
    sm: {
      icon: 'w-3 h-3',
      text: 'text-xs',
      container: 'space-x-1',
    },
    md: {
      icon: 'w-4 h-4',
      text: 'text-sm',
      container: 'space-x-1',
    },
    lg: {
      icon: 'w-5 h-5',
      text: 'text-base',
      container: 'space-x-2',
    },
  };

  const currentSize = sizeClasses[size];

  if (loading) {
    return (
      <div
        className={`flex items-center ${currentSize.container} ${className}`}
      >
        <div className={`${currentSize.icon} text-yellow-400 animate-pulse`}>
          <svg fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </div>
        <span className={`text-yellow-400 font-medium ${currentSize.text}`}>
          ...
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center ${currentSize.container} ${className}`}>
      <svg
        className={`${currentSize.icon} text-yellow-400`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      <span className={`text-yellow-400 font-medium ${currentSize.text}`}>
        {credits?.creditsAvailable || 0}
        {showLabel && <span className="ml-1">Credits</span>}
      </span>
    </div>
  );
}
