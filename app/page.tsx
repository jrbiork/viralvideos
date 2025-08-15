'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'rgba(9,5,38,255)' }}
    >
      {/* Header */}
      <nav
        className="flex items-center justify-between p-6"
        style={{ backgroundColor: 'rgba(26,9,64,255)' }}
      >
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
            className="px-6 py-2 text-white rounded-lg hover:bg-white/10 transition-colors border"
            style={{ borderColor: '#5b5bff' }}
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
            From idea to{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">
              viral short
            </span>
            <span className="block">in few clicks.</span>
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
            <button
              className="px-8 py-3 text-white rounded-lg hover:bg-white/10 transition-colors font-semibold border"
              style={{ borderColor: '#5b5bff' }}
            >
              Watch Demo
            </button>
          </div>

          {/* Trust Section */}
          <div
            className="flex items-center justify-center space-x-4"
            style={{ marginBottom: '3rem' }}
          >
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
            <div className="flex justify-center ml-6">
              <svg
                stroke="currentColor"
                fill="currentColor"
                strokeWidth="0"
                viewBox="0 0 16 16"
                className="h-4 w-4 text-yellow-400 mx-1"
                height="1em"
                width="1em"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"></path>
              </svg>
              <svg
                stroke="currentColor"
                fill="currentColor"
                strokeWidth="0"
                viewBox="0 0 16 16"
                className="h-4 w-4 text-yellow-400 mx-1"
                height="1em"
                width="1em"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"></path>
              </svg>
              <svg
                stroke="currentColor"
                fill="currentColor"
                strokeWidth="0"
                viewBox="0 0 16 16"
                className="h-4 w-4 text-yellow-400 mx-1"
                height="1em"
                width="1em"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"></path>
              </svg>
              <svg
                stroke="currentColor"
                fill="currentColor"
                strokeWidth="0"
                viewBox="0 0 16 16"
                className="h-4 w-4 text-yellow-400 mx-1"
                height="1em"
                width="1em"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"></path>
              </svg>
              <svg
                stroke="currentColor"
                fill="currentColor"
                strokeWidth="0"
                viewBox="0 0 16 16"
                className="h-4 w-4 text-yellow-400 mx-1"
                height="1em"
                width="1em"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"></path>
              </svg>
            </div>
          </div>
          <div className="text-center mb-20 -mt-8">
            <span className="text-gray-300 text-base font-bold">
              TRUSTED BY 100k+ Creators, marketers, educators, and storytellers
              worldwide.
            </span>
          </div>

          {/* Video Examples Section */}
          <div className="relative h-96 max-w-4xl mx-auto flex items-center justify-center">
            {/* Card 1 - Instagram */}
            <div
              className="absolute w-[96%] max-w-[264px] aspect-[9/16] transition-all duration-300 hover:z-50 hover:scale-105"
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
              </div>
            </div>

            {/* Card 2 - YouTube */}
            <div
              className="absolute w-[96%] max-w-[264px] aspect-[9/16] transition-all duration-300 hover:z-50 hover:scale-105"
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
              </div>
            </div>

            {/* Card 3 - TikTok */}
            <div
              className="absolute w-[96%] max-w-[264px] aspect-[9/16] transition-all duration-300 hover:z-50 hover:scale-105"
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
