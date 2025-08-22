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
    <div className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 lg:p-6 flex flex-col max-h-screen overflow-y-auto">
      {/* Navigation Links */}
      <div className="mb-8">
        <div className="space-y-2">
          {navigationItems.map((item) => (
            <button
              key={item.name}
              onClick={() => router.push(item.href)}
              className={`w-full flex items-center space-x-3 p-3 rounded-xl text-left transition-all duration-200 ${
                item.isActive
                  ? 'text-white shadow-lg'
                  : 'text-gray-300 hover:bg-slate-800/50 hover:text-white'
              }`}
              style={item.isActive ? { backgroundColor: '#7552F2' } : {}}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="font-medium hidden sm:inline">{item.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Spacer to push bottom content down */}
      <div className="flex-1"></div>

      {/* Bottom Section - Credits and User */}
      <div className="space-y-4">
        {/* Credits Section */}
        {showCreditsUpgrade && isAuthenticated && (
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center space-x-3 mb-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background:
                    'linear-gradient(90deg, #8A66FF 0%, #2FADFF 100%)',
                }}
              >
                <img src="/coins.svg" alt="Credits" className="w-6 h-6" />
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
              className="w-full text-white font-semibold py-2 px-4 transition-all duration-200"
              style={{
                borderRadius: '0.75rem',
                background: 'linear-gradient(90deg, #8A66FF 0%, #2FADFF 100%)',
                boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
              }}
            >
              Buy Credits
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
