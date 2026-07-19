'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUnsavedChanges } from './UnsavedChangesContext';

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { confirmNavigation } = useUnsavedChanges();
  const [isExpanded, setIsExpanded] = useState(false);

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
      {/* Mobile-only collapse toggle */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between text-gray-300 lg:hidden"
        aria-expanded={isExpanded}
      >
        <span className="font-medium text-sm">Menu</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Navigation Links */}
      <div className={`mb-8 ${isExpanded ? 'mt-4' : 'hidden'} lg:block lg:mt-0`}>
        <div className="space-y-2">
          {navigationItems.slice(0, 2).map((item) => (
            <button
              key={item.name}
              onClick={() => confirmNavigation(() => router.push(item.href))}
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
          <div className="border-t border-slate-700 my-6 lg:my-[50px]"></div>

          {navigationItems.slice(2).map((item) => (
            <button
              key={item.name}
              onClick={() => confirmNavigation(() => router.push(item.href))}
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

      {/* Spacer to push bottom content down (only has room to grow once the
          sidebar reaches full height, at the lg breakpoint) */}
      <div className="hidden lg:block flex-1"></div>
    </div>
  );
}
