'use client';

import { useState, type ReactNode } from 'react';

interface MobileNavProps {
  /** The nav buttons/links to render — used in both the desktop row and the mobile panel. */
  children: ReactNode;
  /** Breakpoint at which the desktop row switches to the hamburger. Defaults to 'md' (768px). */
  breakpoint?: 'md' | 'lg';
}

export default function MobileNav({
  children,
  breakpoint = 'md',
}: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  const desktopClass =
    breakpoint === 'lg' ? 'hidden lg:flex' : 'hidden md:flex';
  const hamburgerWrapperClass = breakpoint === 'lg' ? 'lg:hidden' : 'md:hidden';

  return (
    <>
      <div className={`${desktopClass} items-center space-x-4`}>
        {children}
      </div>

      <div className={`relative ${hamburgerWrapperClass}`}>
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className="p-2 text-white rounded-lg hover:bg-white/10 transition-colors"
          aria-label={isOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={isOpen}
        >
          {isOpen ? (
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          ) : (
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          )}
        </button>

        {isOpen && (
          <div
            className="absolute right-0 top-full mt-2 min-w-[220px] rounded-xl border border-white/10 shadow-xl p-3 flex flex-col gap-2 z-50 [&>*]:w-full [&>*]:text-center"
            style={{ backgroundColor: 'rgba(26,9,64,255)' }}
            onClick={() => setIsOpen(false)}
          >
            {children}
          </div>
        )}
      </div>
    </>
  );
}
