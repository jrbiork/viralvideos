'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useAuthenticatedFetch } from './useAuthenticatedFetch';
import CreditsDisplay from './CreditsDisplay';
import UserDropdown from './UserDropdown';

interface SidebarProps {
  showCreditsUpgrade?: boolean;
}

export default function Sidebar({ showCreditsUpgrade = true }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user } = useAuthenticatedFetch();

  const navigationItems = [
    {
      name: 'Dashboard',
      href: '/create',
      icon: '🏠',
      isActive: pathname === '/create' || pathname === '/',
    },
    {
      name: 'Videos',
      href: '/videos',
      icon: '📹',
      isActive: pathname === '/videos',
    },
  ];

  return (
    <div className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 lg:p-6 flex flex-col h-screen lg:h-full">
      {/* Navigation Links */}
      <div className="mb-8">
        <div className="space-y-2">
          {navigationItems.map((item) => (
            <button
              key={item.name}
              onClick={() => router.push(item.href)}
              className={`w-full flex items-center space-x-3 p-3 rounded-xl text-left transition-all duration-200 ${
                item.isActive
                  ? 'bg-gradient-to-r from-purple-600 to-blue-500 text-white shadow-lg'
                  : 'text-gray-300 hover:bg-slate-800/50 hover:text-white'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="font-medium hidden sm:inline">{item.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Videos Section */}
      <div className="mb-8">
        <h3 className="text-white text-lg font-semibold mb-4">Videos</h3>
        {/* This can be expanded with recent videos or video stats */}
      </div>

      {/* Spacer to push bottom content down */}
      <div className="flex-1"></div>

      {/* Bottom Section - Credits and User */}
      <div className="space-y-4">
        {/* Credits Section */}
        {showCreditsUpgrade && isAuthenticated && (
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">💎</span>
              </div>
              <div>
                <CreditsDisplay />
              </div>
            </div>

            <p className="text-gray-400 text-sm mb-3">
              Need more? Buy more credits
            </p>

            <button
              onClick={() => router.push('/pricing')}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-500 hover:from-purple-700 hover:to-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Buy Credits
            </button>
          </div>
        )}

        {/* User Section */}
        {isAuthenticated && (
          <div className="pt-4 border-t border-slate-700">
            <UserDropdown />
          </div>
        )}
      </div>
    </div>
  );
}
