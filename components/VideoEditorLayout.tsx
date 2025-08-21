'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import UserDropdown from './UserDropdown';
import CreditsDisplay from './CreditsDisplay';

interface VideoEditorLayoutProps {
  children: ReactNode;
  rightSidebarContent?: ReactNode;
  showCreditsUpgrade?: boolean;
}

export default function VideoEditorLayout({
  children,
  rightSidebarContent,
  showCreditsUpgrade = true,
}: VideoEditorLayoutProps) {
  const router = useRouter();

  return (
    <div
      className="h-screen flex flex-col"
      style={{ backgroundColor: 'rgba(9,5,38,255)' }}
    >
      {/* Header */}
      <div className="sticky top-0 z-50 w-full" id="navbar-wrapper">
        <nav
          className="mx-auto transition-all duration-300 ease-in-out flex items-center justify-between"
          style={{
            backgroundColor: 'rgba(26,9,64,255)',
            width: '100%',
            maxWidth: '100%',
            padding: '0.75rem 1.5rem',
            height: '64px',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          }}
          id="navbar"
        >
          <div
            className="flex items-center space-x-2 cursor-pointer"
            onClick={() => router.push('/')}
          >
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-[#1A0033]"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <span className="text-white text-xl font-bold">Viral Shorts</span>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/pricing')}
              className="px-4 py-2 text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              Pricing
            </button>
            <UserDropdown className="w-auto" />
          </div>
        </nav>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div
          className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 lg:p-6 flex flex-col"
          style={{ backgroundColor: 'rgba(26,9,64,255)' }}
        >
          {/* Top Section */}
          <div className="flex-1 space-y-4 lg:space-y-6">
            {/* Navigation Links */}
            <div className="space-y-2">
              <div className="flex items-center space-x-3 text-white bg-slate-800 p-2 rounded-lg cursor-pointer">
                <span>🏠</span>
                <span className="hidden sm:inline">Dashboard</span>
              </div>
              <a
                href="/videos"
                className="flex items-center space-x-3 text-white hover:bg-slate-800 p-2 rounded-lg cursor-pointer"
              >
                <span>📹</span>
                <span className="hidden sm:inline">Videos</span>
              </a>
            </div>
          </div>

          {/* Bottom Section - Credits and Login */}
          <div className="space-y-3 lg:space-y-4">
            {/* Credits Section */}
            <div className="bg-gradient-to-b from-purple-900 to-purple-800 border border-purple-700 rounded-xl p-3 lg:p-4">
              <div className="flex items-start justify-between mb-2 lg:mb-3">
                <div className="flex items-center space-x-2 lg:space-x-3">
                  <div className="relative">
                    <div className="w-6 h-6 lg:w-8 lg:h-8 bg-purple-600 rounded-full flex items-center justify-center text-white text-xs lg:text-sm font-bold">
                      🪙
                    </div>
                  </div>
                  <div>
                    <CreditsDisplay
                      size="lg"
                      showLabel={false}
                      className="text-white text-lg lg:text-2xl font-bold"
                    />
                    <div className="text-gray-300 text-xs">
                      Credits {showCreditsUpgrade ? 'available' : 'remaining'}
                    </div>
                  </div>
                </div>
                {showCreditsUpgrade && (
                  <div className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
                    Free
                  </div>
                )}
              </div>
              <div className="text-white text-xs mb-2 lg:mb-3">
                Need more?{' '}
                {showCreditsUpgrade ? 'Upgrade your plan' : 'Buy more credits'}
              </div>
              <button
                onClick={() => router.push('/pricing')}
                className={`w-full text-white text-xs lg:text-sm font-semibold py-2 rounded-xl transition-colors ${
                  showCreditsUpgrade
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {showCreditsUpgrade ? 'Upgrade now' : 'Buy Credits'}
              </button>
            </div>
          </div>
        </div>

        {/* Center Content */}
        <div
          className="flex-1 p-4 lg:p-8 overflow-y-auto"
          style={{ backgroundColor: 'rgba(9,5,38,255)' }}
        >
          {children}
        </div>

        {/* Right Sidebar - Video Preview */}
        <div
          className="w-full lg:w-2/6 border-l border-slate-800 overflow-y-auto"
          style={{ backgroundColor: 'rgba(26,9,64,255)' }}
        >
          {rightSidebarContent}
        </div>
      </div>
    </div>
  );
}
