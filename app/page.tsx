'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#1A0033]">
      {/* Header */}
      <nav className="flex items-center justify-between p-6 bg-white/5">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-[#1A0033]"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <span className="text-white text-xl font-bold">Viral Shorts</span>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.push('/signin')}
            className="px-6 py-2 text-white rounded-lg hover:bg-white/10 transition-colors border border-white/30"
          >
            Sign In
          </button>
          <button
            onClick={() => router.push('/signin')}
            className="px-6 py-2 bg-gradient-to-r from-purple-400 to-blue-500 text-white rounded-lg hover:from-purple-500 hover:to-blue-600 transition-all"
          >
            Get started for free
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="container mx-auto px-6 py-20">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-white mb-6">
            From idea to viral short
            <span className="block">in seconds.</span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Create short videos with audio & captions. Start free with 10
            credits — no card required.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <button
              onClick={() => router.push('/signin')}
              className="px-8 py-3 bg-gradient-to-r from-purple-400 to-blue-500 text-white rounded-lg hover:from-purple-500 hover:to-blue-600 transition-all font-semibold"
            >
              Get started for free
            </button>
            <button className="px-8 py-3 text-white rounded-lg hover:bg-white/10 transition-colors font-semibold border border-white/30">
              Watch Demo
            </button>
          </div>

          {/* Trust Section */}
          <div className="flex items-center justify-center space-x-4 mb-20">
            <div className="flex -space-x-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="w-10 h-10 bg-gradient-to-r from-purple-400 to-blue-500 rounded-full border-2 border-[#1A0033] flex items-center justify-center text-white text-sm font-bold"
                >
                  {String.fromCharCode(64 + i)}
                </div>
              ))}
            </div>
            <span className="text-white text-base font-bold">
              TRUSTED BY 100k+ Creators, marketers, educators, and storytellers
              worldwide.
            </span>
          </div>

          {/* Video Examples Section */}
          <div className="relative h-96 max-w-4xl mx-auto flex items-center justify-center">
            {/* Card 1 - Instagram */}
            <div
              className="absolute w-[80%] max-w-[220px] aspect-[9/16] transition-all duration-300 hover:z-50 hover:scale-105"
              style={{
                transform: 'rotate(0deg) translateX(-300px)',
                zIndex: 3,
                boxShadow:
                  'rgba(0, 0, 0, 0.1) 0px 4px 6px, rgba(0, 0, 0, 0.08) 0px 1px 3px',
              }}
            >
              <div className="relative w-full h-full rounded-2xl overflow-hidden">
                <div className="absolute top-2 left-2 z-10">
                  <div className="w-6 h-6 bg-gradient-to-r from-orange-400 to-pink-500 rounded flex items-center justify-center">
                    <span className="text-white text-xs font-bold">IG</span>
                  </div>
                </div>
                <video
                  className="absolute inset-0 w-full h-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                >
                  <source src="/assets/example.mp4" type="video/mp4" />
                </video>
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
                  <p className="text-white text-sm font-semibold">
                    Uncover the <span className="text-blue-400">secrets</span>,
                    power, and betrayal
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2 - YouTube */}
            <div
              className="absolute w-[80%] max-w-[220px] aspect-[9/16] transition-all duration-300 hover:z-50 hover:scale-105"
              style={{
                transform: 'rotate(0deg) translateX(0px)',
                zIndex: 2,
                boxShadow:
                  'rgba(0, 0, 0, 0.1) 0px 4px 6px, rgba(0, 0, 0, 0.08) 0px 1px 3px',
              }}
            >
              <div className="relative w-full h-full rounded-2xl overflow-hidden">
                <div className="absolute top-2 left-2 z-10">
                  <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                    <svg
                      className="w-3 h-3 text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
                <video
                  className="absolute inset-0 w-full h-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                >
                  <source src="/assets/example.mp4" type="video/mp4" />
                </video>
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
                  <p className="text-white text-sm font-semibold">
                    A lone explorer's{' '}
                    <span className="text-blue-400">journey</span> beyond the
                  </p>
                </div>
              </div>
            </div>

            {/* Card 3 - TikTok */}
            <div
              className="absolute w-[80%] max-w-[220px] aspect-[9/16] transition-all duration-300 hover:z-50 hover:scale-105"
              style={{
                transform: 'rotate(0deg) translateX(300px)',
                zIndex: 1,
                boxShadow:
                  'rgba(0, 0, 0, 0.1) 0px 4px 6px, rgba(0, 0, 0, 0.08) 0px 1px 3px',
              }}
            >
              <div className="relative w-full h-full rounded-2xl overflow-hidden">
                <div className="absolute top-2 left-2 z-10">
                  <div className="w-6 h-6 bg-black rounded flex items-center justify-center">
                    <svg
                      className="w-3 h-3 text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                    </svg>
                  </div>
                </div>
                <video
                  className="absolute inset-0 w-full h-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                >
                  <source src="/assets/example.mp4" type="video/mp4" />
                </video>
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
                  <p className="text-white text-sm font-semibold">
                    A <span className="text-blue-400">breathtaking</span> dive
                    into the mysterious
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
