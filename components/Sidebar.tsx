'use client';

import { useRouter, usePathname } from 'next/navigation';

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const navigationItems = [
    {
      name: 'Dashboard',
      href: '/create',
      isActive: pathname === '/create' || pathname === '/',
    },
    {
      name: 'Videos',
      href: '/videos',
      isActive: pathname === '/videos',
    },
    {
      name: 'Settings',
      href: '/settings',
      isActive: pathname === '/settings',
    },
  ];

  return (
    <div className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-slate-800 p-4 lg:p-6 flex flex-col max-h-screen overflow-y-auto">
      {/* Navigation Links */}
      <div className="mb-8">
        <div className="space-y-2">
          {navigationItems.slice(0, 2).map((item) => (
            <button
              key={item.name}
              onClick={() => router.push(item.href)}
              className={`w-full flex items-center p-3 rounded-xl text-left transition-all duration-200 ${
                item.isActive
                  ? 'text-white shadow-lg'
                  : 'text-gray-300 hover:bg-slate-800/50 hover:text-white'
              }`}
              style={item.isActive ? { backgroundColor: '#7552F2' } : {}}
            >
              <span className="font-medium">{item.name}</span>
            </button>
          ))}

          {/* Separator */}
          <div
            className="border-t border-slate-700"
            style={{ margin: '50px 0' }}
          ></div>

          {navigationItems.slice(2).map((item) => (
            <button
              key={item.name}
              onClick={() => router.push(item.href)}
              className={`w-full flex items-center p-3 rounded-xl text-left transition-all duration-200 ${
                item.isActive
                  ? 'text-white shadow-lg'
                  : 'text-gray-300 hover:bg-slate-800/50 hover:text-white'
              }`}
              style={item.isActive ? { backgroundColor: '#7552F2' } : {}}
            >
              <span className="font-medium">{item.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Spacer to push bottom content down */}
      <div className="flex-1"></div>
    </div>
  );
}
