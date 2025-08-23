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
        <span className={`text-white font-medium ${currentSize.text}`}>
          ...
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center ${currentSize.container} ${className}`}>
      <span
        className={`${currentSize.text}`}
        style={{
          color: 'white',
          fontFamily: 'Satoshi',
          fontSize: '2rem',
          fontStyle: 'normal',
          fontWeight: 900,
        }}
      >
        {credits?.creditsAvailable || 0}
        {showLabel && (
          <>
            <div style={{ height: '0.25rem' }}></div>
            <span
              style={{
                color: 'white',
                fontFamily: 'Satoshi',
                fontSize: '0.875rem',
                fontStyle: 'normal',
                fontWeight: 500,
                lineHeight: 'normal',
              }}
            >
              Credits remaining
            </span>
          </>
        )}
      </span>
    </div>
  );
}
