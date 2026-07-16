'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';
import AnimatedBackground from '../../components/AnimatedBackground';
import { useAuth } from '../../components/AuthContext';
import MobileNav from '../../components/MobileNav';
import MainLayout from '../../components/MainLayout';
import { useUserQuota } from '../../components/useUserQuota';

export default function Pricing() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { quota } = useUserQuota();
  const currentPlan = isAuthenticated ? quota.plan : null;
  const [isChangingPlan, setIsChangingPlan] = useState(false);
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

    posthog.capture('checkout_started', { plan: planName });

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

  // Switching between two already-paid plans (Creator<->Pro) should modify
  // the existing Stripe subscription, not start a second one — route
  // through the billing portal instead of create-checkout-session. If the
  // stored billing record is broken (stale/invalid customer, e.g. from
  // resetting test data), fall back to a normal checkout for the target
  // plan instead of leaving the user stuck with no way to change plans.
  const handleManagePlanChange = async (
    targetPriceId: string,
    targetPlanName: string,
  ) => {
    posthog.capture('plan_change_started', { targetPlan: targetPlanName });

    try {
      setIsChangingPlan(true);
      const response = await fetch('/api/stripe/manage-subscription', {
        method: 'GET',
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.code === 'customer_not_found') {
          await handleSubscribe(targetPriceId, targetPlanName);
          return;
        }
        console.error('Failed to open plan management:', data.error);
        alert(
          data.error || 'Failed to open plan management. Please try again.',
        );
        return;
      }

      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('Error opening plan management:', error);
      alert('Failed to open plan management. Please try again.');
    } finally {
      setIsChangingPlan(false);
    }
  };

  type PlanFeature = { text: string; highlight?: boolean };
  type PlanKey = 'free' | 'creator' | 'pro';

  const plans: {
    planKey: PlanKey;
    name: string;
    price: string;
    period: string;
    quota: string;
    features: PlanFeature[];
    popular: boolean;
  }[] = [
    {
      planKey: 'free',
      name: 'Free',
      price: '$0',
      period: '',
      quota: '1 video',
      features: [
        { text: 'Up to 3 scenes per video' },
        { text: 'Auto-generated audio' },
        { text: 'Auto-generated subtitles' },
        { text: 'Vertical format' },
        { text: 'Download and share' },
      ],
      popular: false,
    },
    {
      planKey: 'creator',
      name: 'Creator',
      price: '$11.90',
      period: '/month',
      quota: '10 videos per month',
      features: [
        { text: 'Up to 4 scenes per video', highlight: true },
        { text: '3 Incredible AI Animated Scenes', highlight: true },
        { text: '20 additional AI-generated images', highlight: true },
        { text: 'Auto-generated audio' },
        { text: 'Auto-generated subtitles' },
        { text: 'No watermark' },
        { text: 'Vertical format' },
        { text: 'Download and share' },
      ],
      popular: false,
    },
    {
      planKey: 'pro',
      name: 'Pro',
      price: '$19.90',
      period: '/month',
      quota: '20 videos per month',
      features: [
        { text: 'Up to 6 scenes per video', highlight: true },
        { text: '10 Incredible AI Animated Scenes', highlight: true },
        { text: '40 additional AI-generated images', highlight: true },
        { text: 'Auto-generated audio' },
        { text: 'Auto-generated subtitles' },
        { text: 'Access to all AI voices' },
        { text: 'High resolution video' },
        { text: 'No watermark' },
        { text: 'Vertical format' },
        { text: 'Download and share' },
      ],
      popular: true,
    },
  ];

  // Determines the CTA (or lack of one) for each plan card based on the
  // signed-in user's current plan. Free<->paid transitions go through a new
  // Stripe checkout session; paid<->paid transitions go through the billing
  // portal so they modify the existing subscription instead of creating a
  // second one.
  type PlanButton =
    | { kind: 'hidden' }
    | { kind: 'current' }
    | { kind: 'action'; text: string; onClick: () => void };

  function getPlanButton(planKey: PlanKey): PlanButton {
    const priceIds: Record<'creator' | 'pro', string> = {
      creator: process.env.NEXT_PUBLIC_STRIPE_CREATOR_PRICE_ID || '',
      pro: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || '',
    };

    if (!isAuthenticated) {
      if (planKey === 'free') {
        return {
          kind: 'action',
          text: 'Get Started',
          onClick: () => {
            posthog.capture('free_signup_clicked');
            router.push('/signin');
          },
        };
      }
      return {
        kind: 'action',
        text: 'Subscribe',
        onClick: () => handleSubscribe(priceIds[planKey], planKey),
      };
    }

    // Signed in: the Free card never has a CTA — you can't "subscribe" to
    // or downgrade to it from this page.
    if (planKey === 'free') {
      return { kind: 'hidden' };
    }

    // The plan the user is already on gets a "Current Plan" label instead
    // of a button.
    if (planKey === currentPlan) {
      return { kind: 'current' };
    }

    if (currentPlan === 'free') {
      return {
        kind: 'action',
        text: 'Subscribe',
        onClick: () => handleSubscribe(priceIds[planKey], planKey),
      };
    }

    // currentPlan is 'creator' or 'pro' and planKey is the other paid tier
    const isUpgrade = currentPlan === 'creator' && planKey === 'pro';
    return {
      kind: 'action',
      text: isUpgrade ? 'Upgrade Plan' : 'Downgrade Plan',
      onClick: () => handleManagePlanChange(priceIds[planKey], planKey),
    };
  }

  // Shared between the marketing (unauthenticated) layout and the in-app
  // (authenticated, MainLayout-wrapped) layout.
  const pricingContent = (
    <>
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold text-white mb-6">
          Transparent{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">
            Pricing
          </span>
        </h1>
        <p className="text-xl text-gray-300 max-w-2xl mx-auto">
          Choose the perfect plan for your video creation needs. Start with 1
          free video, no credit card required.
        </p>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed bottom-4 right-4 bg-gradient-to-br from-purple-500/20 to-blue-500/20 border-2 border-purple-400/50 text-white px-6 py-3 rounded-xl shadow-lg z-50 transition-all duration-300 backdrop-blur-sm">
          Promo code copied to clipboard.
        </div>
      )}

      {/* Pricing Cards */}
      <div
        id="pricing-cards"
        className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto"
      >
        {plans.map((plan, index) => (
          <div
            key={index}
            className={`relative rounded-2xl p-8 transition-all duration-300 hover:scale-105 flex flex-col h-full ${
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
              <p
                className={
                  plan.name === 'Free'
                    ? 'text-gray-300 text-sm'
                    : 'text-white text-base font-bold'
                }
              >
                {plan.quota}
              </p>
            </div>

            <ul className="space-y-4 mb-8">
              {plan.features.map((feature, featureIndex) => (
                <li
                  key={featureIndex}
                  className={`flex items-center ${
                    feature.highlight
                      ? 'text-yellow-300 font-semibold'
                      : 'text-gray-300'
                  }`}
                >
                  <svg
                    className={`w-5 h-5 mr-3 flex-shrink-0 ${
                      feature.highlight ? 'text-yellow-300' : 'text-green-400'
                    }`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {feature.text}
                </li>
              ))}
            </ul>

            {(() => {
              const button = getPlanButton(plan.planKey);
              if (button.kind === 'hidden') {
                return null;
              }
              if (button.kind === 'current') {
                return (
                  <div className="w-full py-3 px-6 rounded-lg font-semibold text-center border border-gray-600 text-gray-400 mt-auto">
                    Current Plan
                  </div>
                );
              }
              return (
                <button
                  onClick={button.onClick}
                  disabled={isChangingPlan}
                  className="w-full py-3 px-6 rounded-lg font-semibold transition-all duration-200 bg-gradient-to-r from-purple-400 to-blue-500 text-white hover:from-purple-500 hover:to-blue-600 disabled:opacity-60 disabled:cursor-not-allowed mt-auto"
                >
                  {isChangingPlan ? 'Opening…' : button.text}
                </button>
              );
            })()}
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
              Free accounts include 1 story video with up to 3 scenes.
              Creator accounts can create 10 videos every month with up to
              4 scenes each, and Pro accounts can create 20 videos every
              month with up to 6 scenes each.
            </p>
          </div>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
            <h3 className="text-xl font-semibold text-white mb-3">
              Can I cancel anytime?
            </h3>
            <p className="text-gray-300">
              Yes, you can cancel your subscription at any time. You keep
              your plan's quota until the end of the billing period.
            </p>
          </div>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50">
            <h3 className="text-xl font-semibold text-white mb-3">
              Does my monthly quota roll over?
            </h3>
            <p className="text-gray-300">
              No — Creator resets to 10 videos and Pro resets to 20 videos
              at the start of each billing period.
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
    </>
  );

  if (isAuthenticated) {
    return (
      <MainLayout>
        <div className="w-full h-full overflow-y-auto px-6 py-10">
          {pricingContent}
        </div>
      </MainLayout>
    );
  }

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
              Get 1 Free Video
            </button>
          </MobileNav>
        </nav>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-20">
        {pricingContent}

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
                Get 1 Free Video
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
