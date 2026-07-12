'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '../../components/MainLayout';
import { useAuth } from '../../components/AuthContext';
import { useAuthenticatedFetch } from '../../components/useAuthenticatedFetch';
import { useUserDataCache } from '../../hooks/useUserDataCache';
import { useUserQuota } from '../../components/useUserQuota';

interface UserSettings {
  id: string;
  email: string;
  name: string;
  picture?: string;
  subscription: {
    mode: 'free' | 'pro' | 'starter' | 'creator' | 'influencer';
    renewalDate?: string | null;
    status: 'active' | 'cancelled' | 'expired';
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { authenticatedFetch, isAuthenticated } = useAuthenticatedFetch();
  const {
    userData,
    loading: userDataLoading,
    refresh: refreshUserData,
  } = useUserDataCache();
  const {
    quota,
    imageQuota,
    loading: quotaLoading,
  } = useUserQuota();

  useEffect(() => {
    if (isAuthenticated) {
      fetchUserSettings();
    }
  }, [isAuthenticated, userData]);

  const fetchUserSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use cached user data if available, otherwise fetch from session
      let userInfo;
      if (userData) {
        userInfo = userData.user;
      } else {
        const sessionResponse = await fetch('/api/auth/session');
        const sessionData = await sessionResponse.json();
        userInfo = sessionData.user;
      }

      if (userInfo) {
        const settings: UserSettings = {
          id: userInfo.id || userInfo.userId,
          email: userInfo.email,
          name: userInfo.name,
          picture: userInfo.picture,
          subscription: userInfo.subscription || {
            mode: 'free',
            renewalDate: undefined,
            status: 'active',
          },
        };

        setUserSettings(settings);
      } else {
        setError('Failed to load user settings');
      }
    } catch (error) {
      console.error('Error fetching user settings:', error);
      setError('Failed to load user settings');
    } finally {
      setLoading(false);
    }
  };

  // Absolute-ify relative picture URLs, same convention as UserDropdown
  const getPictureUrl = (url: string | undefined) => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (typeof window === 'undefined') return url;
    return url.startsWith('/')
      ? `${window.location.origin}${url}`
      : `${window.location.origin}/${url}`;
  };

  const handleManageSubscription = async () => {
    try {
      setIsOpeningPortal(true);
      const response = await fetch('/api/stripe/manage-subscription', {
        method: 'GET',
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Failed to create portal session:', data.error);
        alert('Failed to open subscription management. Please try again.');
        return;
      }

      // Redirect to Stripe Billing Portal
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error opening subscription management:', error);
      alert('Failed to open subscription management. Please try again.');
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (
      !confirm(
        'Are you sure you want to cancel your subscription? You will keep Pro access until the end of your current billing period.',
      )
    ) {
      return;
    }

    try {
      setIsCancelling(true);
      const response = await fetch('/api/stripe/manage-subscription', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Failed to cancel subscription:', data.error);
        alert('Failed to cancel subscription. Please try again.');
        return;
      }

      // Refresh user data
      await refreshUserData();
      await fetchUserSettings();
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      alert('Failed to cancel subscription. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const isPro = quota.plan === 'pro';
  const status = userSettings?.subscription.status;
  const renewalDate = userSettings?.subscription.renewalDate;
  const formattedRenewalDate = renewalDate
    ? new Date(renewalDate).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const usagePercent = quota.limit
    ? Math.min(100, Math.round((quota.used / quota.limit) * 100))
    : 0;
  const imageUsagePercent = imageQuota.limit
    ? Math.min(100, Math.round((imageQuota.used / imageQuota.limit) * 100))
    : 0;

  if (loading || userDataLoading) {
    return (
      <MainLayout>
        <div className="w-full min-h-[60vh] flex items-center justify-center">
        <div className="text-center animate-fade-in-up">
          <div className="relative mb-6 flex justify-center">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 w-16 h-16 border-4 border-slate-600 rounded-full animate-pulse-slow"></div>
              <div className="absolute inset-0 w-16 h-16 border-4 border-blue-500 rounded-full animate-spin border-t-transparent"></div>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-700 mb-3">
            Loading Settings
          </h3>
          <p className="text-gray-500 text-lg">
            Fetching your account information...
          </p>
        </div>
        </div>
      </MainLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <MainLayout>
        <div className="w-full min-h-[60vh] flex items-center justify-center">
        <div className="text-center animate-fade-in-up">
          <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-yellow-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-700 mb-3">
            Authentication Required
          </h3>
          <p className="text-gray-500 text-lg mb-4">
            Please sign in to access your settings.
          </p>
        </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="w-full min-h-[60vh] flex items-center justify-center">
        <div className="text-center animate-fade-in-up">
          <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-700 mb-3">
            Error Loading Settings
          </h3>
          <p className="text-gray-500 text-lg mb-4">{error}</p>
          <button
            onClick={fetchUserSettings}
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-200 transform hover:scale-105"
          >
            Try Again
          </button>
        </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="w-full h-full overflow-y-auto">
        <div className="w-full max-w-2xl mx-auto px-6 py-10">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-1">
              Account Settings
            </h1>
            <p className="text-slate-400">
              Manage your profile and subscription
            </p>
          </div>

          {userSettings && (
            <div className="space-y-5">
              {/* Profile Card */}
              <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-4">
                  Profile
                </h2>
                <div className="flex items-center gap-4">
                  {getPictureUrl(userSettings.picture) && !imageError ? (
                    <img
                      src={getPictureUrl(userSettings.picture)!}
                      alt={userSettings.name}
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded-full object-cover ring-2 ring-slate-700"
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-lg font-bold ring-2 ring-slate-700">
                      {(userSettings.name || userSettings.email || 'U')
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">
                      {userSettings.name}
                    </h3>
                    <p className="text-slate-400 text-sm truncate">
                      {userSettings.email}
                    </p>
                  </div>
                </div>
              </section>

              {/* Plan & Billing Card */}
              <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                    Plan &amp; Billing
                  </h2>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                      isPro
                        ? 'bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-blue-300 ring-1 ring-inset ring-blue-500/30'
                        : 'bg-slate-700/60 text-slate-300 ring-1 ring-inset ring-slate-600/50'
                    }`}
                  >
                    {isPro ? 'Pro Plan' : 'Free Plan'}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-2xl font-bold text-white">
                    {isPro ? '$9.00' : '$0'}
                  </span>
                  {isPro && (
                    <span className="text-slate-400 text-sm">/ month</span>
                  )}
                </div>

                {/* Billing status line */}
                {isPro && status === 'cancelled' && formattedRenewalDate && (
                  <p className="text-sm text-yellow-400 mb-4">
                    Cancelled — Pro access ends on {formattedRenewalDate}
                  </p>
                )}
                {isPro && status === 'expired' && (
                  <p className="text-sm text-red-400 mb-4">
                    There's a problem with your payment. Update your payment
                    method to keep Pro access.
                  </p>
                )}
                {isPro && status === 'active' && formattedRenewalDate && (
                  <p className="text-sm text-slate-400 mb-4">
                    Renews on {formattedRenewalDate}
                  </p>
                )}
                {!isPro && (
                  <p className="text-sm text-slate-400 mb-4">
                    Upgrade for more videos and higher scene limits.
                  </p>
                )}

                {/* Usage */}
                <div className="mb-5">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-slate-400">
                      {isPro ? 'Videos generated' : 'Videos'}
                    </span>
                    <span className="text-slate-300 font-medium">
                      {quotaLoading ? '—' : `${quota.used} / ${quota.limit}`}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-700/60 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
                      style={{ width: `${quotaLoading ? 0 : usagePercent}%` }}
                    />
                  </div>
                </div>

                <div className="mb-5">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-slate-400">
                      {isPro ? 'Extra image regenerations' : 'Images'}
                    </span>
                    <span className="text-slate-300 font-medium">
                      {quotaLoading
                        ? '—'
                        : `${imageQuota.used} / ${imageQuota.limit}`}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-700/60 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300"
                      style={{
                        width: `${quotaLoading ? 0 : imageUsagePercent}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Actions */}
                {!isPro ? (
                  <button
                    onClick={() => router.push('/pricing')}
                    className="w-full px-4 py-2.5 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-lg font-medium transition-all duration-200"
                  >
                    Upgrade to Pro
                  </button>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleManageSubscription}
                      disabled={isOpeningPortal}
                      className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors duration-200"
                    >
                      {isOpeningPortal ? 'Opening…' : 'Manage Billing'}
                    </button>
                    {status === 'active' && (
                      <button
                        onClick={handleCancelSubscription}
                        disabled={isCancelling}
                        className="flex-1 px-4 py-2.5 border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg font-medium transition-colors duration-200"
                      >
                        {isCancelling ? 'Cancelling…' : 'Cancel Subscription'}
                      </button>
                    )}
                  </div>
                )}
              </section>

              {/* Account Actions */}
              <section className="flex justify-end">
                <button
                  onClick={logout}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors duration-200"
                >
                  Sign Out
                </button>
              </section>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
