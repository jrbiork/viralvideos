'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import VideoGallery from '../../components/VideoGallery';
import LoginButton from '../../components/LoginButton';
import UserDropdown from '../../components/UserDropdown';
import Breadcrumb from '../../components/Breadcrumb';
import CreditsDisplay from '../../components/CreditsDisplay';

export default function VideosPage() {
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
          navbarWrapper.style.marginTop = '0px'; // Reset margin
          navbar.style.width = '100%';
          navbar.style.maxWidth = '100%';
          navbar.style.padding = '0.88rem 1.32rem'; // Keep reduced padding
          navbar.style.backdropFilter = 'none';
          navbar.style.backgroundColor = 'rgba(26,9,64,255)';
          navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
          navbar.style.borderRadius = '12px'; // Original rounded corners
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
            padding: '0.88rem 1.32rem',
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

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div
          className="w-64 border-r border-slate-800 p-6 flex flex-col"
          style={{ backgroundColor: 'rgba(26,9,64,255)' }}
        >
          {/* Top Section */}
          <div className="flex-1 space-y-6">
            {/* Navigation Links */}
            <div className="space-y-2">
              <a
                href="/create"
                className="flex items-center space-x-3 text-gray-400 hover:bg-slate-800 p-2 rounded-lg cursor-pointer"
              >
                <span>🏠</span>
                <span>Dashboard</span>
              </a>
              <div className="flex items-center space-x-3 text-white bg-slate-800 p-2 rounded-lg cursor-pointer">
                <span>📹</span>
                <span>Videos</span>
              </div>
            </div>
          </div>

          {/* Bottom Section - Credits and Login */}
          <div className="space-y-4">
            {/* Credits Section */}
            <div className="bg-gradient-to-b from-purple-900 to-purple-800 border border-purple-700 rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      🪙
                    </div>
                  </div>
                  <div>
                    <CreditsDisplay
                      size="lg"
                      showLabel={false}
                      className="text-white text-2xl font-bold"
                    />
                    <div className="text-gray-300 text-xs">
                      Credits available
                    </div>
                  </div>
                </div>
                <div className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full">
                  Free
                </div>
              </div>
              <div className="text-white text-xs mb-3">
                Need more? Upgrade your plan
              </div>
              <button
                onClick={() => router.push('/pricing')}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-2 rounded-xl transition-colors"
              >
                Upgrade now
              </button>
            </div>
          </div>
        </div>

        {/* Center Content - Video Gallery */}
        <div
          className="flex-1 p-8 overflow-y-auto"
          style={{ backgroundColor: 'rgba(9,5,38,255)' }}
        >
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white mb-2">
                Your Video Library
              </h1>
              <p className="text-gray-300">
                Browse and manage all your generated videos.
              </p>
            </div>

            {/* Video Gallery */}
            <VideoGallery />
          </div>
        </div>
      </div>
    </div>
  );
}
