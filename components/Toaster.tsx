import React from 'react';

interface ToasterProps {
  message: string;
  type: 'success' | 'error';
  isVisible: boolean;
  onClose: () => void;
}

export default function Toaster({
  message,
  type,
  isVisible,
  onClose,
}: ToasterProps) {
  const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';
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
    ) : (
      // Error warning icon
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM12 9a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0112 9zm0 8a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
    );

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div
        className={`
          ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg 
          flex items-center space-x-3 max-w-sm
          transform transition-all duration-300 ease-in-out
          ${
            isVisible
              ? 'translate-x-0 opacity-100'
              : 'translate-x-full opacity-0'
          }
        `}
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
