'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import UserDropdown from './UserDropdown';
import CreditsDisplay from './CreditsDisplay';

interface MainLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
  showCreditsUpgrade?: boolean;
  rightSidebarContent?: ReactNode;
}

export default function MainLayout({
  children,
  showSidebar = true,
  showCreditsUpgrade = true,
  rightSidebarContent,
}: MainLayoutProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0F0A1E' }}>
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

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-6">
            <CreditsDisplay />
            <UserDropdown />
          </div>

          {/* Mobile Navigation */}
          <div className="lg:hidden">
            <UserDropdown />
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden h-screen">
        {showSidebar && (
          <div
            style={{ backgroundColor: 'rgba(26,9,64,255)' }}
            className="h-full"
          >
            <Sidebar showCreditsUpgrade={showCreditsUpgrade} />
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-auto">
          <div className="flex">
            <div className="flex-1">{children}</div>
            {rightSidebarContent && (
              <div className="w-80 p-6 hidden lg:block">
                {rightSidebarContent}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
