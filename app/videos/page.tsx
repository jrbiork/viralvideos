'use client';

import VideoGallery from '../../components/VideoGallery';
import Breadcrumb from '../../components/Breadcrumb';

export default function VideosPage() {
  return (
    <div className="min-h-screen bg-black">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900">
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

      <div className="flex h-screen">
        {/* Left Sidebar */}
        <div className="w-64 bg-black border-r border-slate-800 p-6 flex flex-col">
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

            {/* Credits Section */}
            <div className="border-t border-slate-800 pt-4">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <div className="text-white text-sm font-medium">
                  10 Free Credits available
                </div>
                <div className="text-gray-400 text-xs">Free</div>
                <button className="w-full mt-2 bg-purple-600 hover:bg-purple-700 text-white text-xs py-2 rounded-lg transition-colors">
                  Upgrade now
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Section - User Info */}
          <div className="border-t border-slate-800 pt-4 mt-auto">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-sm">
                  R
                </div>
                <div>
                  <div className="text-sm font-medium">Rubens</div>
                  <div className="text-xs text-gray-400">rbiork@gmail.com</div>
                </div>
              </div>
              <span>▼</span>
            </div>
          </div>
        </div>

        {/* Center Content - Video Gallery */}
        <div className="flex-1 p-8 bg-black overflow-y-auto">
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
