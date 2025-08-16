'use client';

import VideoGallery from '../../components/VideoGallery';
import LoginButton from '../../components/LoginButton';
import UserDropdown from '../../components/UserDropdown';
import Breadcrumb from '../../components/Breadcrumb';
import CreditsDisplay from '../../components/CreditsDisplay';

export default function VideosPage() {
  return (
    <div
      className="h-screen flex flex-col"
      style={{ backgroundColor: 'rgba(9,5,38,255)' }}
    >
      {/* Top Bar */}
      <div
        className="flex items-center justify-between p-4 border-b border-slate-800 flex-shrink-0"
        style={{ backgroundColor: 'rgba(26,9,64,255)' }}
      >
        <div className="flex items-center space-x-4">
          <div className="text-yellow-400 text-2xl">⚡</div>
          <div className="text-white text-xl font-bold">Viral Shorts</div>
        </div>

        <div className="flex-1 flex justify-center">
          <div className="max-w-7xl w-full">
            <Breadcrumb
              items={[
                { label: 'Dashboard', href: '/create' },
                { label: 'Videos' },
              ]}
            />
          </div>
        </div>

        <div className="w-32">{/* Spacer to balance the layout */}</div>
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
                      ⭐
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
              <button className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-2 rounded-xl transition-colors">
                Upgrade now
              </button>
            </div>

            {/* User Dropdown */}
            <UserDropdown className="w-full" />
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
