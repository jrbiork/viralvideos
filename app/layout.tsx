import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../components/AuthContext';
import { WebSocketProvider } from '../components/WebSocketContext';
import WebSocketStatus from '../components/WebSocketStatus';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'StoryReel — AI Story Video Generator',
  description:
    'Turn any topic into a narrated story video with AI — script, voiceover, visuals, done.',
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
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          <WebSocketProvider>
            {children}
            {/* Global WebSocket Status - visible on all pages */}
            {/* <div className="fixed top-20 right-4 z-50 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg border">
              <div className="text-xs text-gray-600 mb-1">WebSocket Status</div>
              <WebSocketStatus showControls={true} />
            </div> */}
          </WebSocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
