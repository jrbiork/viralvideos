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

  // Handle navbar scroll animation
  useEffect(() => {
    const handleScroll = () => {
      const navbarWrapper = document.getElementById('navbar-wrapper');
      const navbar = document.getElementById('navbar');
      if (navbarWrapper && navbar) {
        const scrollY = window.scrollY;
        const maxScroll = 200; // Maximum scroll distance for full animation

        if (scrollY > 0) {
          // Calculate width reduction (100% to 90%)
          const widthReduction = Math.min(scrollY / maxScroll, 1);
          const newWidth = 100 - widthReduction * 10; // 100% to 90%

          // Apply styles to navbar
          navbar.style.width = `${newWidth}%`;
          navbar.style.maxWidth = `${newWidth}%`;
          navbar.style.marginLeft = 'auto';
          navbar.style.marginRight = 'auto';

          // Add more styling for scrolled state
          if (scrollY > 50) {
            navbarWrapper.style.marginTop = '20px'; // Add margin to wrapper
            navbar.style.padding = '0.88rem 1.32rem'; // Keep reduced padding
            navbar.style.backdropFilter = 'blur(15px)';
            navbar.style.backgroundColor = 'rgba(26,9,64,0.7)';
            navbar.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.4)';
            navbar.style.borderRadius = '28px'; // Much more rounded corners when floating
          } else {
            navbarWrapper.style.marginTop = '0px'; // Reset margin
            navbar.style.padding = '0.88rem 1.32rem'; // Keep reduced padding
            navbar.style.backdropFilter = 'blur(8px)';
            navbar.style.backgroundColor = 'rgba(26,9,64,0.8)';
            navbar.style.boxShadow = '0 8px 28px rgba(0, 0, 0, 0.25)';
            navbar.style.borderRadius = '20px'; // More rounded
          }
        } else {
          // Reset to original state
          navbarWrapper.style.marginTop = '0px';
          navbar.style.padding = '1.1rem 1.65rem';
          navbar.style.width = '100%';
          navbar.style.maxWidth = '100%';
          navbar.style.marginLeft = '0';
          navbar.style.marginRight = '0';
          navbar.style.backdropFilter = 'blur(0px)';
          navbar.style.backgroundColor = 'rgba(26,9,64,255)';
          navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
          navbar.style.borderRadius = '12px';
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
            padding: '1.1rem 1.65rem',
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
