'use client';

import React, { Fragment } from 'react';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AnimatedBackground from '../components/AnimatedBackground';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Handle navbar scroll animation
  useEffect(() => {
    const handleScroll = () => {
      const navbarWrapper = document.getElementById('navbar-wrapper');
      const navbar = document.getElementById('navbar');
      if (navbarWrapper && navbar) {
        const scrollY = window.scrollY;
        const maxScroll = 200; // Maximum scroll distance for full animation

        console.log('Scroll Y:', scrollY); // Debug scroll position

        if (scrollY > 0) {
          // Calculate width reduction (100% to 90%)
          const widthReduction = Math.min(scrollY / maxScroll, 1);
          const newWidth = 100 - widthReduction * 10; // 100% to 90%

          // Apply styles to navbar
          navbar.style.width = `${newWidth}%`;
          navbar.style.maxWidth = `${newWidth}%`;
          navbar.style.marginLeft = 'auto';
          navbar.style.marginRight = 'auto';

          // Add more styling for scrolled state
          if (scrollY > 50) {
            navbarWrapper.style.marginTop = '20px'; // Add margin to wrapper
            console.log('Setting margin-top to 20px'); // Debug margin
            navbar.style.padding = '1.1rem 1.65rem'; // Keep increased padding
            navbar.style.backdropFilter = 'blur(15px)';
            navbar.style.backgroundColor = 'rgba(26,9,64,0.7)';
            navbar.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.4)';
            navbar.style.borderRadius = '28px'; // Much more rounded corners when floating
          } else {
            navbarWrapper.style.marginTop = '0px'; // Reset margin
            navbar.style.padding = '1.1rem 1.65rem'; // Keep increased padding
            navbar.style.backdropFilter = 'blur(8px)';
            navbar.style.backgroundColor = 'rgba(26,9,64,0.8)';
            navbar.style.boxShadow = '0 8px 28px rgba(0, 0, 0, 0.25)';
            navbar.style.borderRadius = '20px'; // More rounded
          }
        } else {
          // Reset to original state
          navbarWrapper.style.marginTop = '0px'; // Reset margin
          navbar.style.width = '100%';
          navbar.style.maxWidth = '100%';
          navbar.style.padding = '1.1rem 1.65rem'; // Keep increased padding
          navbar.style.backdropFilter = 'none';
          navbar.style.backgroundColor = 'rgba(26,9,64,255)';
          navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
          navbar.style.borderRadius = '12px'; // Original rounded corners
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen relative">
      <AnimatedBackground />
      {/* Header */}
      <div className="sticky top-0 z-50 w-full" id="navbar-wrapper">
        <nav
          className="mx-auto transition-all duration-300 ease-in-out flex items-center justify-between"
          style={{
            backgroundColor: 'rgba(26,9,64,255)',
            width: '100%',
            maxWidth: '100%',
            padding: '1.1rem 1.65rem',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          }}
          id="navbar"
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
              Get 10 Free Credits
            </button>
          </div>
        </nav>
      </div>

      {/* Hero Section */}
      <div className="container mx-auto px-6 py-20">
        <div className="text-center">
          <h1
            className="font-bold text-white mb-6"
            style={{ fontSize: '5.61rem' }}
          >
            From idea to{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">
              viral short
            </span>
            <span className="block">in a few clicks.</span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Text to viral shorts in minutes - no watermark. <br /> text → video
            → auto-caption → post.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <button
              onClick={() => router.push('/signin')}
              className="px-8 py-3 bg-gradient-to-r from-purple-400 to-blue-500 text-white rounded-lg hover:from-purple-500 hover:to-blue-600 transition-all font-semibold"
            >
              Get 10 Free Credits
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
          <div
            className="relative h-96 max-w-4xl mx-auto flex items-center justify-center"
            style={{
              marginTop: '2rem',
              paddingTop: '15rem',
              paddingBottom: '16rem',
            }}
          >
            {/* Card 1 - Instagram */}
            <div
              className="absolute w-[115.2%] max-w-[317px] aspect-[9/16] transition-all duration-300 hover:z-50 hover:scale-105"
              style={{
                transform: 'rotate(0deg) translateX(-400px)',
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
                  <source src="/assets/sample1.mp4" type="video/mp4" />
                </video>
              </div>
            </div>

            {/* Card 2 - YouTube */}
            <div
              className="absolute w-[115.2%] max-w-[317px] aspect-[9/16] transition-all duration-300 hover:z-50 hover:scale-105"
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
                  <source src="/assets/sample2.mp4" type="video/mp4" />
                </video>
              </div>
            </div>

            {/* Card 3 - TikTok */}
            <div
              className="absolute w-[115.2%] max-w-[317px] aspect-[9/16] transition-all duration-300 hover:z-50 hover:scale-105"
              style={{
                transform: 'rotate(0deg) translateX(400px)',
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
                  <source src="/assets/sample3.mp4" type="video/mp4" />
                </video>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-4xl font-bold text-white text-center mb-16">
            Creating Viral Faceless Videos Has Never Been So Easy
          </h2>

          {/* Top Row - Core Features */}
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {/* Card 1: Create Youtube Shorts */}
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-red-500 rounded-lg flex items-center justify-center mr-4">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white">
                  Create Youtube Shorts
                </h3>
              </div>
              <p className="text-gray-300">
                Create Youtube Shorts with AI generated content. No need to
                record anything.
              </p>
            </div>

            {/* Card 2: Create viral Tiktok videos */}
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-black rounded-lg flex items-center justify-center mr-4">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white">
                  Create viral Tiktok videos
                </h3>
              </div>
              <p className="text-gray-300">
                Create Tiktok videos that go viral. No need to dance or lip
                sync.
              </p>
            </div>

            {/* Card 3: Publish on Tiktok & Youtube */}
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center mr-4">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white">
                  Publish on Tiktok & Youtube
                </h3>
              </div>
              <p className="text-gray-300">
                Publish your videos directly from the app.
              </p>
            </div>
          </div>

          {/* Bottom Row - Additional Features */}
          <div className="grid md:grid-cols-3 gap-8">
            {/* Card 4: AI Generated Voiceovers */}
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center mr-4">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white">
                  AI Generated Voiceovers
                </h3>
              </div>
              <p className="text-gray-300">
                We use the latest AI models to generate voiceovers for your
                videos.
              </p>
            </div>

            {/* Card 5: Background music */}
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center mr-4">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white">
                  Background music
                </h3>
              </div>
              <p className="text-gray-300">
                Add background music to your videos. We have a library of 1000s
                of songs.
              </p>
            </div>

            {/* Card 6: And much more... */}
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 bg-pink-500 rounded-lg flex items-center justify-center mr-4">
                  <svg
                    className="w-6 h-6 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white">
                  And much more...
                </h3>
              </div>
              <p className="text-gray-300">
                StoryShort is constantly evolving. We are adding new features
                every week.
              </p>
            </div>
          </div>
        </div>

        {/* Promotional Banner */}
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="bg-gray-800/50 rounded-2xl p-12 text-center border border-gray-700/50">
            <h2 className="text-4xl font-bold text-white mb-6">
              Say Goodbye To Boring Videos 👋
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Get started with StoryShort.ai today and start creating engaging
              videos for Tiktok and Youtube on autopilot.
            </p>
            <button className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-8 rounded-full transition-colors duration-200">
              Get Started
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="border-t border-gray-700 p-8"
        style={{
          backgroundColor: 'rgba(26,9,64,0.7)',
          backdropFilter: 'blur(15px)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div className="flex items-center justify-between">
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
          <div className="text-gray-400 text-sm">
            <div>Copyright © 2025 Viral Shorts</div>
            <div className="mt-1">All rights reserved</div>
          </div>
        </div>
      </div>
    </div>
  );
}
