'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import AnimatedBackground from '../../components/AnimatedBackground';

export default function Pricing() {
  const router = useRouter();

  const plans = [
    {
      name: 'Starter',
      price: '$9',
      period: '/month',
      credits: '400 credits',
      features: [
        '1 series',
        'Voiceovers',
        'AI generated content',
        'Background music',
        'No watermark',
        'Auto-publish on TikTok and Youtube',
      ],
      popular: false,
      buttonText: 'Subscribe',
      buttonAction: () => router.push('/signin'),
    },
    {
      name: 'Creator',
      price: '$29',
      period: '/month',
      credits: '1200 credits',
      features: [
        '2 series',
        'Voiceovers',
        'AI generated content',
        'Background music',
        'No watermark',
        'Auto-publish on TikTok and Youtube',
      ],
      popular: true,
      buttonText: 'Subscribe',
      buttonAction: () => router.push('/signin'),
    },
    {
      name: 'Influencer',
      price: '$99',
      period: '/month',
      credits: '2400 credits',
      features: [
        '3 series',
        'Voiceovers',
        'AI generated content',
        'Background music',
        'No watermark',
        'Auto-publish on TikTok and Youtube',
      ],
      popular: false,
      buttonText: 'Subscribe',
      buttonAction: () => router.push('/signin'),
    },
  ];

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
              onClick={() => router.push('/')}
              className="px-4 py-2 text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              Home
            </button>
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

      {/* Main Content */}
      <div className="container mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-white mb-6">
            Simple, Transparent{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">
              Pricing
            </span>
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Choose the perfect plan for your video creation needs. Start with 10
            free credits, no credit card required.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative rounded-2xl p-8 transition-all duration-300 hover:scale-105 ${
                plan.popular
                  ? 'bg-gradient-to-br from-purple-500/20 to-blue-500/20 border-2 border-purple-400/50'
                  : 'bg-gray-800/50 border border-gray-700/50'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-gradient-to-r from-purple-400 to-blue-500 text-white px-4 py-2 rounded-full text-sm font-semibold">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-white mb-4">
                  {plan.name}
                </h3>
                <div className="mb-2">
                  <span className="text-4xl font-bold text-white">
                    {plan.price}
                  </span>
                  <span className="text-gray-400">{plan.period}</span>
                </div>
                <p className="text-gray-300 text-sm">{plan.credits}</p>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li
                    key={featureIndex}
                    className="flex items-center text-gray-300"
                  >
                    <svg
                      className="w-5 h-5 text-green-400 mr-3 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={plan.buttonAction}
                className="w-full py-3 px-6 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-purple-400 to-blue-500 text-white hover:from-purple-500 hover:to-blue-600"
              >
                {plan.buttonText}
              </button>
            </div>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="max-w-4xl mx-auto mt-20">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Frequently Asked Questions
          </h2>

          <div className="space-y-6">
            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
              <h3 className="text-xl font-semibold text-white mb-3">
                What are credits?
              </h3>
              <p className="text-gray-300">
                Credits are used to generate videos. Each video generation costs
                1 credit, regardless of the video length or quality.
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
              <h3 className="text-xl font-semibold text-white mb-3">
                Can I cancel anytime?
              </h3>
              <p className="text-gray-300">
                Yes, you can cancel your subscription at any time. Your credits
                will remain available until used or expired.
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
              <h3 className="text-xl font-semibold text-white mb-3">
                Do credits expire?
              </h3>
              <p className="text-gray-300">
                Credits from paid plans never expire. Free trial credits expire
                after 30 days.
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
              <h3 className="text-xl font-semibold text-white mb-3">
                What video formats are supported?
              </h3>
              <p className="text-gray-300">
                We support MP4 format with vertical aspect ratios (9:16)
                optimized for TikTok, Instagram Reels, and YouTube Shorts.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="max-w-4xl mx-auto mt-20">
          <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-2xl p-12 text-center border border-purple-400/50">
            <h2 className="text-3xl font-bold text-white mb-6">
              Ready to Create Viral Videos?
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Join thousands of creators who are already using Viral Shorts to
              grow their audience.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => router.push('/signin')}
                className="px-8 py-3 bg-gradient-to-r from-purple-400 to-blue-500 text-white rounded-lg hover:from-purple-500 hover:to-blue-600 transition-all font-semibold"
              >
                Get 10 Free Credits
              </button>
              <button
                onClick={() => router.push('/')}
                className="px-8 py-3 text-white rounded-lg hover:bg-white/10 transition-colors font-semibold border"
                style={{ borderColor: '#5b5bff' }}
              >
                Learn More
              </button>
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
            <span className="text-white text-xl font-bold">Viral Shorts</span>
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
            <div>Copyright © 2025 Viral Shorts</div>
            <div className="mt-1">All rights reserved</div>
          </div>
        </div>
      </div>
    </div>
  );
}
