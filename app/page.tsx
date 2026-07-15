'use client';

import React, { Fragment } from 'react';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';
import AnimatedBackground from '../components/AnimatedBackground';
import ScrollPathEffect from '../components/ScrollPathEffect';
import { useAuth } from '../components/AuthContext';
import UserDropdown from '../components/UserDropdown';
import MobileNav from '../components/MobileNav';

// Small illustrated (non-photographic) face avatar used for testimonials —
// intentionally cartoon-style rather than a photo, since we don't attach
// real people's likenesses to placeholder quotes.
function FaceAvatar({ skin, hair }: { skin: string; hair: string }) {
  return (
    <svg viewBox="0 0 44 44" className="w-11 h-11 rounded-full flex-shrink-0">
      <circle cx="22" cy="22" r="22" fill={skin} />
      <path
        d="M2 20a20 20 0 0 1 40 0v-2a20 18 0 0 0-40 0z"
        fill={hair}
      />
      <circle cx="15" cy="24" r="2.1" fill="#33261f" />
      <circle cx="29" cy="24" r="2.1" fill="#33261f" />
      <path
        d="M15 31c2.5 2.2 11.5 2.2 14 0"
        stroke="#33261f"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    posthog.capture('landing_page_loaded');
  }, []);

  // Handle navbar scroll animation
  useEffect(() => {
    const handleScroll = () => {
      const navbarWrapper = document.getElementById('navbar-wrapper');
      const navbar = document.getElementById('navbar');
      if (navbarWrapper && navbar) {
        const scrollY = window.scrollY;
        const maxScroll = 200; // Maximum scroll distance for full animation

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
      <AnimatedBackground fixed />
      {/* Scroll-driven decorative path spanning the full page height */}
      <ScrollPathEffect />
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
          <div
            className="flex items-center space-x-2 cursor-pointer"
            onClick={() => router.push('/')}
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
          <MobileNav>
            <button
              onClick={() => router.push('/pricing')}
              className="px-4 py-2 text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              Pricing
            </button>
            {!isAuthenticated ? (
              <>
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
                  Create your first video for free
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => router.push('/create')}
                  className="px-6 py-2 bg-gradient-to-r from-purple-400 to-blue-500 text-white rounded-lg hover:from-purple-500 hover:to-blue-600 transition-all"
                >
                  Dashboard
                </button>
                <UserDropdown className="w-auto" />
              </>
            )}
          </MobileNav>
        </nav>
      </div>

      {/* Hero Section */}
      <div className="container mx-auto px-6 py-20">
        <div className="relative z-10 text-center">
          <h1
            className="font-bold text-white mb-6 text-4xl sm:text-5xl md:text-6xl lg:text-[5.61rem]"
          >
            Idea to{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">
              story video
            </span>
            <span className="block">in a few clicks.</span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Turn any topic into a narrated story video — script, voiceover,
            visuals, done. <br /> No watermark.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <button
              onClick={() => router.push('/signin')}
              className="px-8 py-3 bg-gradient-to-r from-purple-400 to-blue-500 text-white rounded-lg hover:from-purple-500 hover:to-blue-600 transition-all font-semibold"
            >
              Create your first video for free
            </button>
          </div>

          {/* Trust Section */}
          <div
            className="flex items-center justify-center space-x-4"
            style={{ marginBottom: '3rem' }}
          >
            <img
              src="/assets/trusted.svg"
              alt="Trusted by creators"
              className="h-12"
            />
            <div className="flex justify-center ml-6">
              {[...Array(5)].map((_, i) => (
                <svg
                  key={i}
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
              ))}
            </div>
          </div>
          <div className="text-center mb-20 -mt-8">
            <span className="text-gray-300 text-base font-bold">
              TRUSTED BY 100k+ educators, storytellers, and creators worldwide.
            </span>
          </div>

          {/* Video Examples Section */}
          <div
            className="relative flex flex-col md:flex-row md:h-96 max-w-4xl mx-auto items-center justify-center gap-6 md:gap-0 md:pt-[15rem] md:pb-[16rem]"
            style={{
              marginTop: '2rem',
            }}
          >
            {/* Card 1 - Story time */}
            <div
              className="relative md:absolute w-full max-w-[280px] md:w-[115.2%] md:max-w-[317px] aspect-[9/16] transition-all duration-300 hover:z-50 hover:scale-105 md:translate-x-[-400px]"
              style={{
                zIndex: 3,
                boxShadow:
                  'rgba(0, 0, 0, 0.1) 0px 4px 6px, rgba(0, 0, 0, 0.08) 0px 1px 3px',
              }}
            >
              <div className="relative w-full h-full rounded-2xl overflow-hidden">
                <div className="absolute top-2 left-2 z-10">
                  <div className="px-2 h-6 bg-black/60 rounded flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">
                      Story time
                    </span>
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

            {/* Card 2 - Explainer */}
            <div
              className="relative md:absolute w-full max-w-[280px] md:w-[115.2%] md:max-w-[317px] aspect-[9/16] transition-all duration-300 hover:z-50 hover:scale-105"
              style={{
                zIndex: 2,
                boxShadow:
                  'rgba(0, 0, 0, 0.1) 0px 4px 6px, rgba(0, 0, 0, 0.08) 0px 1px 3px',
              }}
            >
              <div className="relative w-full h-full rounded-2xl overflow-hidden">
                <div className="absolute top-2 left-2 z-10">
                  <div className="px-2 h-6 bg-black/60 rounded flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">
                      Explainer
                    </span>
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

            {/* Card 3 - Lesson */}
            <div
              className="relative md:absolute w-full max-w-[280px] md:w-[115.2%] md:max-w-[317px] aspect-[9/16] transition-all duration-300 hover:z-50 hover:scale-105 md:translate-x-[400px]"
              style={{
                zIndex: 1,
                boxShadow:
                  'rgba(0, 0, 0, 0.1) 0px 4px 6px, rgba(0, 0, 0, 0.08) 0px 1px 3px',
              }}
            >
              <div className="relative w-full h-full rounded-2xl overflow-hidden">
                <div className="absolute top-2 left-2 z-10">
                  <div className="px-2 h-6 bg-black/60 rounded flex items-center justify-center">
                    <span className="text-white text-[10px] font-bold">
                      Lesson
                    </span>
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

        <div className="relative">
          {/* Features Section */}
          <div className="relative z-10 max-w-6xl mx-auto px-6 py-20">
            <h2 className="text-4xl font-bold text-white text-center mb-16">
              Creating Story &amp; Educational Videos Has Never Been So Easy
            </h2>

          {/* Feature Grid */}
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                bg: 'from-red-500 to-orange-500',
                icon: (
                  <path d="M8 5v14l11-7z" />
                ),
                title: 'Create educational shorts',
                desc: 'Turn any topic into a clear explainer or lesson with AI generated content. No need to record anything.',
              },
              {
                bg: 'from-blue-500 to-indigo-500',
                icon: (
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                ),
                title: 'Tell captivating stories',
                desc: 'Generate the script, narration and visuals for your story from a single idea.',
              },
              {
                bg: 'from-sky-500 to-cyan-500',
                icon: (
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                ),
                title: 'Share anywhere',
                desc: 'Export vertical videos ready to share on any platform.',
              },
              {
                bg: 'from-purple-500 to-fuchsia-500',
                icon: (
                  <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                ),
                title: 'AI Generated Voiceovers',
                desc: 'We use the latest AI models to generate natural-sounding voiceovers for your videos.',
              },
              {
                bg: 'from-emerald-500 to-teal-500',
                icon: (
                  <path d="M18 11c0-3.87-3.13-7-7-7s-7 3.13-7 7c0 2.38 1.19 4.47 3 5.74V19c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74zM9 21h4v1H9v-1z" />
                ),
                title: 'Auto-generated Subtitles',
                desc: 'Every video ships with synced, on-screen captions generated automatically from the narration.',
              },
              {
                bg: 'from-indigo-500 to-violet-500',
                icon: (
                  <path d="M8 5v14l11-7z M2 5v14M22 5v14" />
                ),
                title: 'AI Animated Scenes',
                desc: 'Bring static scenes to life with cinematic AI-powered animation, available on Creator and Pro plans.',
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="group bg-gray-800/50 rounded-xl p-6 border border-gray-700/50 transition-all duration-300 hover:-translate-y-1 hover:border-purple-400/40 hover:bg-gray-800/80 hover:shadow-xl hover:shadow-purple-500/10"
              >
                <div className="flex items-center mb-4">
                  <div
                    className={`w-12 h-12 bg-gradient-to-br ${feature.bg} rounded-lg flex items-center justify-center mr-4 shadow-lg transition-transform duration-300 group-hover:scale-110`}
                  >
                    <svg
                      className="w-6 h-6 text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                      stroke={feature.title === 'AI Animated Scenes' ? 'currentColor' : 'none'}
                      strokeWidth={feature.title === 'AI Animated Scenes' ? 1.5 : 0}
                    >
                      {feature.icon}
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    {feature.title}
                  </h3>
                </div>
                <p className="text-gray-300">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>

          {/* Testimonials Section */}
          <div className="relative z-10 max-w-6xl mx-auto px-6 py-20">
            <h2 className="text-4xl font-bold text-white text-center mb-4">
              Successful Stories That Speak
            </h2>
            <p className="text-xl text-gray-300 text-center mb-16">
              Real workflows from teachers, creators, and teams using
              StoryReel every day.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
              {[
                {
                  quote:
                    "I used to burn my Sunday nights making slides nobody watched past the intro. Now I write a rough script on my lunch break and StoryReel turns it into something my 7th graders actually sit through.",
                  name: 'Alice B.',
                  role: 'Middle School Teacher',
                  skin: '#f0c9a0',
                  hair: '#3b2417',
                },
                {
                  quote:
                    "Clients want a 60-second explainer by Friday on basically no budget. StoryReel is the only way I've found to say yes to that brief and still sleep.",
                  name: 'Hernandez R.',
                  role: 'Freelance Video Editor',
                  skin: '#c88a5e',
                  hair: '#1a1a1a',
                },
                {
                  quote:
                    "We don't have a video budget, full stop. Got three donor updates out last quarter that would've cost us thousands through an agency.",
                  name: 'Joshua M.',
                  role: 'Nonprofit Comms Lead',
                  skin: '#8d5a3c',
                  hair: '#120c08',
                },
                {
                  quote:
                    "Wasn't expecting much from the animation feature, ngl. It turned one flat photo into something that held people past the first three seconds, which almost never happens for me.",
                  name: 'Priya N.',
                  role: 'YouTube Creator',
                  skin: '#deab7d',
                  hair: '#241608',
                },
                {
                  quote:
                    'Re-recorded my intro lesson four separate times trying to get it right. Now I write it once and let StoryReel handle the rest.',
                  name: 'Elena K.',
                  role: 'Online Course Creator',
                  skin: '#f6d7b0',
                  hair: '#6b4423',
                },
                {
                  quote:
                    "Was skeptical an AI tool could make something that didn't look cheap. It proved me wrong fast — the first video went straight into an actual ad.",
                  name: 'Marcus D.',
                  role: 'Small Business Owner',
                  skin: '#e8b992',
                  hair: '#2b2b2b',
                },
              ].map((t, i) => (
                <div
                  key={i}
                  className="relative flex flex-col justify-between bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-6 pt-8 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.07] hover:border-purple-400/30 hover:shadow-xl hover:shadow-purple-500/10"
                >
                  <span
                    className="absolute -top-2 left-4 text-7xl font-serif text-white/10 select-none leading-none"
                    aria-hidden="true"
                  >
                    &ldquo;
                  </span>
                  <p className="relative text-gray-200 leading-relaxed mb-6">
                    {t.quote}
                  </p>
                  <div className="flex items-center pt-4 border-t border-white/10">
                    <FaceAvatar skin={t.skin} hair={t.hair} />
                    <div className="ml-3">
                      <div className="font-bold text-white">{t.name}</div>
                      <div className="text-gray-400 text-sm">{t.role}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
        <div className="flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center space-x-2 mb-4 md:mb-0">
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

          <div className="flex items-center space-x-6 mb-4 md:mb-0">
            <button
              onClick={() => router.push('/pricing')}
              className="text-gray-300 hover:text-white transition-colors"
            >
              Pricing
            </button>
            <button
              onClick={() => router.push('/contact')}
              className="text-gray-300 hover:text-white transition-colors"
            >
              Contact
            </button>
          </div>

          <div className="text-gray-400 text-sm text-center md:text-right">
            <div>Copyright © 2025 StoryReel</div>
            <div className="mt-1">All rights reserved</div>
          </div>
        </div>
      </div>
    </div>
  );
}
