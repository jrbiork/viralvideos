import React from 'react';

interface ToasterProps {
  message: string;
  type: 'success' | 'error' | 'info';
  isVisible: boolean;
  onClose: () => void;
}

export default function Toaster({
  message,
  type,
  isVisible,
  onClose,
}: ToasterProps) {
  const bgColor =
    type === 'success' ? '' : type === 'error' ? 'bg-red-200' : 'bg-blue-500';
  const textColor =
    type === 'success'
      ? 'text-white'
      : type === 'error'
      ? 'text-red-800'
      : 'text-white';

  const successGradientStyle =
    type === 'success'
      ? {
          background: 'linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%)',
          boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
        }
      : {};
  const icon =
    type === 'success' ? (
      // Success checkmark icon
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path
          fillRule="evenodd"
          d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
          clipRule="evenodd"
        />
      </svg>
    ) : type === 'error' ? (
      // Error warning icon
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM12 9a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0112 9zm0 8a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
    ) : (
      // Info icon
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path
          fillRule="evenodd"
          d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z"
          clipRule="evenodd"
        />
      </svg>
    );

  return (
    <div className="fixed right-4 z-50" style={{ top: '10%' }}>
      <div
        className={`
          ${bgColor} ${textColor} px-6 py-3 rounded-lg shadow-lg 
          flex items-center space-x-3 max-w-sm
          transform transition-all duration-500 ease-in-out
          ${
            isVisible
              ? 'translate-x-0 opacity-100'
              : 'translate-x-full opacity-0'
          }
        `}
        style={successGradientStyle}
      >
        {/* Icon */}
        <div className="flex-shrink-0">{icon}</div>

        {/* Message */}
        <div className="font-medium">{message}</div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="flex-shrink-0 ml-4 text-white hover:text-gray-200 transition-colors"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
