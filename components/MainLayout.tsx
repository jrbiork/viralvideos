'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import UserDropdown from './UserDropdown';
import Breadcrumb from './Breadcrumb';
import MobileNav from './MobileNav';
import { useUnsavedChanges } from './UnsavedChangesContext';

interface MainLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
  rightSidebarContent?: ReactNode;
  backgroundColor?: string;
  progressSteps?: ReactNode;
  showFooter?: boolean;
  footerContent?: ReactNode;
  currentStep?: number;
  rightSidebarButton?: ReactNode;
}

export default function MainLayout({
  children,
  showSidebar = true,
  rightSidebarContent,
  backgroundColor = '#0F0A1E',
  progressSteps,
  showFooter = false,
  footerContent,
  currentStep,
  rightSidebarButton,
}: MainLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { confirmNavigation } = useUnsavedChanges();

  // Define breadcrumb items based on current path
  const getBreadcrumbItems = () => {
    if (pathname === '/create') {
      return [
        { label: 'Dashboard', href: '/create' },
        { label: 'Create Video', shortLabel: 'Create', href: '/create' },
      ];
    } else if (pathname === '/videos') {
      return [
        { label: 'Dashboard', href: '/create' },
        { label: 'Videos', href: '/videos' },
      ];
    }
    return [];
  };

  return (
    <div className="lg:h-screen flex flex-col" style={{ backgroundColor }}>
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
          <div className="flex items-center space-x-4">
            <div
              className="flex items-center space-x-2 cursor-pointer"
              onClick={() => confirmNavigation(() => router.push('/'))}
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
              <span className="text-white text-xl font-bold">StoryReel</span>
            </div>

            {/* Breadcrumb */}
            {getBreadcrumbItems().length > 0 && (
              <div className="ml-8">
                <Breadcrumb items={getBreadcrumbItems()} />
              </div>
            )}
          </div>

          <MobileNav breakpoint="lg">
            <UserDropdown />
          </MobileNav>
        </nav>
      </div>

      {/* Main Content */}
      <div
        className="flex flex-col lg:flex-row flex-1 lg:overflow-hidden lg:h-full"
        style={{ backgroundColor: '#090526' }}
      >
        {showSidebar && (
          <div
            style={{ backgroundColor: 'rgba(26,9,64,255)' }}
            className="lg:h-full"
          >
            <Sidebar />
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col lg:overflow-hidden">
          {/* Progress Steps */}
          {progressSteps && (
            <div className="flex items-center justify-center flex-shrink-0">
              {progressSteps}
            </div>
          )}

          <div
            className="flex flex-col md:flex-row flex-1 md:overflow-hidden"
            style={{ backgroundColor: '#090526' }}
          >
            <div className="flex-[1.86] md:overflow-hidden">{children}</div>
            {rightSidebarContent && currentStep !== 3 && (
              <div
                className="flex-1 order-1 md:order-2 md:overflow-hidden mt-4 mr-0 md:mr-[45px]"
                style={{ backgroundColor: '#090526' }}
              >
                {rightSidebarContent}
                {rightSidebarButton && (
                  <div className="flex justify-center mt-8 mb-4 px-4">
                    {rightSidebarButton}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
