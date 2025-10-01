'use client';

import React from 'react';
import { useWebSocketContext } from './WebSocketContext';

interface WebSocketStatusProps {
  showControls?: boolean;
  className?: string;
}

export default function WebSocketStatus({
  showControls = false,
  className = '',
}: WebSocketStatusProps) {
  const { isConnected, isConnecting, connect, disconnect, ping } =
    useWebSocketContext();

  const getStatusColor = () => {
    if (isConnecting) return 'text-yellow-500';
    if (isConnected) return 'text-green-500';
    return 'text-red-500';
  };

  const getStatusText = () => {
    if (isConnecting) return 'Connecting...';
    if (isConnected) return 'Connected';
    return 'Disconnected';
  };

  const getStatusIcon = () => {
    if (isConnecting) return '🔄';
    if (isConnected) return '🟢';
    return '🔴';
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <span className={`text-sm font-medium ${getStatusColor()}`}>
        {getStatusIcon()} {getStatusText()}
      </span>

      {showControls && (
        <div className="flex items-center space-x-2">
          {!isConnected && !isConnecting && (
            <button
              onClick={connect}
              className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Connect
            </button>
          )}

          {isConnected && (
            <>
              <button
                onClick={disconnect}
                className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Disconnect
              </button>

              <button
                onClick={ping}
                className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
              >
                Ping
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
