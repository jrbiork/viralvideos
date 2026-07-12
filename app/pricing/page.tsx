'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AnimatedBackground from '../../components/AnimatedBackground';
import { useAuth } from '../../components/AuthContext';
import UserDropdown from '../../components/UserDropdown';
import MobileNav from '../../components/MobileNav';

export default function Pricing() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [showPromotion, setShowPromotion] = useState(true);
  const [timeLeft, setTimeLeft] = useState({
    hours: 9,
    minutes: 49,
    seconds: 55,
  });
  const [showToast, setShowToast] = useState(false);

  // Countdown timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prevTime) => {
        let { hours, minutes, seconds } = prevTime;

        if (seconds > 0) {
          seconds--;
        } else {
          seconds = 59;
          if (minutes > 0) {
            minutes--;
          } else {
            minutes = 59;
            if (hours > 0) {
              hours--;
            } else {
              // Timer finished
              clearInterval(timer);
              return { hours: 0, minutes: 0, seconds: 0 };
            }
          }
        }

        return { hours, minutes, seconds };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Copy to clipboard function
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText('SAVE20');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  // Scroll to pricing cards and hide promotion
  const handleGrabOffer = () => {
    setShowPromotion(false);
    const mostPopularSpan = document.querySelector(
      '.bg-gradient-to-r.from-purple-400.to-blue-500',
    ) as HTMLElement;
    if (mostPopularSpan) {
      const elementPosition = mostPopularSpan.getBoundingClientRect().top;
      const windowHeight = window.innerHeight;
      const elementHeight = mostPopularSpan.offsetHeight;
      const offsetPosition =
        elementPosition +
        window.pageYOffset -
        windowHeight / 2 +
        elementHeight / 2;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  const handleSubscribe = async (priceId: string, planName: string) => {
    if (!isAuthenticated) {
      router.push('/signin');
      return;
    }

    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId,
          planName,
          promoCode: showPromotion ? 'SAVE20' : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Failed to create checkout session:', data.error);
        alert('Failed to start checkout. Please try again.');
        return;
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      alert('Failed to start checkout. Please try again.');
    }
  };

  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: '',
      quota: '3 story videos',
      features: [
        'Up to 5 scenes per video',
        'AI script, voiceover and visuals',
        'Unlimited scene editing',
        'No watermark',
        'Vertical format for any platform',
      ],
      popular: false,
      buttonText: 'Get Started',
      buttonAction: () => router.push('/signin'),
    },
    {
      name: 'Pro',
      price: '$9',
      period: '/month',
      quota: '30 story videos per month',
      features: [
        'Up to 6 scenes per video',
        'AI script, voiceover and visuals',
        'Unlimited scene editing',
        'Background music',
        'No watermark',
        'Vertical format for any platform',
      ],
      popular: true,
      buttonText: 'Subscribe',
      buttonAction: () =>
        handleSubscribe(
          process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || '',
          'pro',
        ),
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
                  Get 3 Free Videos
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
            Choose the perfect plan for your video creation needs. Start with 3
            free videos, no credit card required.
          </p>
        </div>

        {/* Promotional Banner */}
        {showPromotion && (
          <div className="relative rounded-2xl p-8 transition-all duration-300 hover:scale-105 bg-gradient-to-br from-purple-500/20 to-blue-500/20 border-2 border-purple-400/50 mb-16 max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="mb-4 md:mb-0">
                <p className="text-lg mb-2 text-white">
                  Limited time offer on all plans
                </p>
                <h2 className="text-4xl font-bold mb-4 text-white">
                  20% off for life
                </h2>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={handleGrabOffer}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-black transition-colors focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 bg-white text-purple-600 hover:bg-gray-100"
                  >
                    Grab Offer
                  </button>
                  <div className="border border-white border-dashed rounded px-3 py-1">
                    <span className="text-sm text-white">Use promo code</span>
                    <span className="font-bold ml-2 text-white">SAVE20</span>
                    <button
                      onClick={copyToClipboard}
                      className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-black transition-colors focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 h-9 rounded-md px-3 ml-2 text-white hover:bg-transparent hover:text-white"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-copy h-4 w-4 text-white"
                      >
                        <rect
                          width="14"
                          height="14"
                          x="8"
                          y="8"
                          rx="2"
                          ry="2"
                        ></rect>
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <div className="text-center">
                <p className="mb-2 text-white">Offer expires in</p>
                <div className="bg-white bg-opacity-20 rounded-lg p-4 flex w-fit m-auto space-x-4">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-white">
                      {timeLeft.hours.toString().padStart(2, '0')}
                    </div>
                    <div className="text-xs uppercase text-white">hours</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-white">
                      {timeLeft.minutes.toString().padStart(2, '0')}
                    </div>
                    <div className="text-xs uppercase text-white">minutes</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-white">
                      {timeLeft.seconds.toString().padStart(2, '0')}
                    </div>
                    <div className="text-xs uppercase text-white">seconds</div>
                  </div>
                </div>
                <div className="mt-4 text-sm flex justify-between">
                  <span className="p-4 text-white">Previous 30% off ❌</span>
                  <span className="font-bold p-4 text-white">
                    Current promo 20% off ✅
                  </span>
                  <span className="p-4 text-white">Next promo 10% off 🔜</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {showToast && (
          <div className="fixed bottom-4 right-4 bg-gradient-to-br from-purple-500/20 to-blue-500/20 border-2 border-purple-400/50 text-white px-6 py-3 rounded-xl shadow-lg z-50 transition-all duration-300 backdrop-blur-sm">
            Promo code copied to clipboard.
          </div>
        )}

        {/* Pricing Cards */}
        <div
          id="pricing-cards"
          className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto"
        >
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
                <p className="text-gray-300 text-sm">{plan.quota}</p>
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
                How many videos can I create?
              </h3>
              <p className="text-gray-300">
                Free accounts include 3 story videos with up to 5 scenes each.
                Pro accounts can create 30 videos every month with up to 6
                scenes each. Editing scenes is always free and unlimited.
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
              <h3 className="text-xl font-semibold text-white mb-3">
                Can I cancel anytime?
              </h3>
              <p className="text-gray-300">
                Yes, you can cancel your subscription at any time. You keep
                your Pro quota until the end of the billing period.
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
              <h3 className="text-xl font-semibold text-white mb-3">
                Does my monthly quota roll over?
              </h3>
              <p className="text-gray-300">
                No — the Pro quota resets to 30 videos at the start of each
                billing period.
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
              <h3 className="text-xl font-semibold text-white mb-3">
                What video formats are supported?
              </h3>
              <p className="text-gray-300">
                We support MP4 format with vertical aspect ratios (9:16), ready
                to share on any platform.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="max-w-4xl mx-auto mt-20">
          <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-2xl p-12 text-center border border-purple-400/50">
            <h2 className="text-3xl font-bold text-white mb-6">
              Ready to Create Story Videos?
            </h2>
            <p className="text-xl text-gray-300 mb-8">
              Join thousands of educators and storytellers who are already
              using StoryReel to bring their ideas to life.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => router.push('/signin')}
                className="px-8 py-3 bg-gradient-to-r from-purple-400 to-blue-500 text-white rounded-lg hover:from-purple-500 hover:to-blue-600 transition-all font-semibold"
              >
                Get 3 Free Videos
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
