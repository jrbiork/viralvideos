import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../components/AuthContext';
import WebSocketStatus from '../components/WebSocketStatus';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Viral Videos MVP - AI Video Generator',
  description:
    'Generate 60-second vertical videos for TikTok and Instagram Reels using AI',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/favicon.svg',
    shortcut: '/favicon.ico',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          {children}
          {/* Global WebSocket Status - visible on all pages */}
          {/* <div className="fixed top-20 right-4 z-50 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg border">
            <div className="text-xs text-gray-600 mb-1">WebSocket Status</div>
            <WebSocketStatus showControls={true} />
          </div> */}
        </AuthProvider>
      </body>
    </html>
  );
}
