'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '../../components/MainLayout';
import { useAuthenticatedFetch } from '../../components/useAuthenticatedFetch';

interface UserSettings {
  id: string;
  email: string;
  name: string;
  picture?: string;
  subscription: {
    mode: 'free' | 'starter' | 'creator' | 'influencer';
    renewalDate?: string;
    status: 'active' | 'cancelled' | 'expired';
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<'personal' | 'subscription'>(
    'personal',
  );
  const { authenticatedFetch, isAuthenticated } = useAuthenticatedFetch();

  useEffect(() => {
    if (isAuthenticated) {
      fetchUserSettings();
    }
  }, [isAuthenticated]);

  const fetchUserSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch user data from the session
      const sessionResponse = await fetch('/api/auth/session');
      const sessionData = await sessionResponse.json();

      if (sessionData.user) {
        // Mock subscription data for now - in a real app this would come from your backend
        const mockSettings: UserSettings = {
          id: sessionData.user.id,
          email: sessionData.user.email,
          name: sessionData.user.name,
          picture: sessionData.user.picture,
          subscription: {
            mode: 'free', // This would be fetched from your subscription service
            renewalDate: undefined, // Free users don't have renewal dates
            status: 'active',
          },
        };

        setUserSettings(mockSettings);
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

  const handleCancelSubscription = async () => {
    if (
      !confirm(
        'Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your current billing period.',
      )
    ) {
      return;
    }

    try {
      setIsCancelling(true);
      // This would call your backend API to cancel the subscription
      // await authenticatedFetch('/api/cancel-subscription', { method: 'POST' });

      // For now, just update the local state
      if (userSettings) {
        setUserSettings({
          ...userSettings,
          subscription: {
            ...userSettings.subscription,
            status: 'cancelled',
          },
        });
      }

      alert('Subscription cancelled successfully');
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      alert('Failed to cancel subscription. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const getSubscriptionModeDisplay = (mode: string) => {
    switch (mode) {
      case 'free':
        return 'Free Plan';
      case 'starter':
        return 'Starter Plan';
      case 'creator':
        return 'Creator Plan';
      case 'influencer':
        return 'Influencer Plan';
      default:
        return mode;
    }
  };

  const getSubscriptionStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-500';
      case 'cancelled':
        return 'text-yellow-500';
      case 'expired':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  if (loading) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ top: '64px', left: '250px', right: '0px', bottom: '0px' }}
      >
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
    );
  }

  if (!isAuthenticated) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ top: '64px', left: '250px', right: '0px', bottom: '0px' }}
      >
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
    );
  }

  if (error) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ top: '64px', left: '250px', right: '0px', bottom: '0px' }}
      >
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
    );
  }

  return (
    <MainLayout showCreditsUpgrade={false}>
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-full max-w-2xl mx-auto p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-700 mb-2">
              Account Settings
            </h1>
            <p className="text-gray-500">
              Manage your account and subscription
            </p>
          </div>

          {userSettings && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              {/* Tab Navigation */}
              <div className="flex space-x-1 mb-6 bg-slate-700/50 rounded-lg p-1">
                <button
                  onClick={() => setActiveTab('personal')}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    activeTab === 'personal'
                      ? 'bg-slate-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-300 hover:bg-slate-600/50'
                  }`}
                >
                  Personal
                </button>
                <button
                  onClick={() => setActiveTab('subscription')}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                    activeTab === 'subscription'
                      ? 'bg-slate-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-300 hover:bg-slate-600/50'
                  }`}
                >
                  Subscription
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === 'personal' && (
                <div className="space-y-6">
                  {/* Profile Section */}
                  <div>
                    <h2 className="text-xl font-semibold text-white mb-4">
                      Profile Information
                    </h2>
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        {userSettings.picture ? (
                          <img
                            src={userSettings.picture}
                            alt={userSettings.name}
                            className="w-16 h-16 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-slate-600 rounded-full flex items-center justify-center">
                            <svg
                              className="w-8 h-8 text-slate-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-white">
                          {userSettings.name}
                        </h3>
                        <p className="text-slate-400">{userSettings.email}</p>
                      </div>
                    </div>
                  </div>

                  {/* Account Actions */}
                  <div>
                    <h2 className="text-xl font-semibold text-white mb-4">
                      Account Actions
                    </h2>
                    <div className="space-y-3">
                      <button
                        onClick={() => router.push('/pricing')}
                        className="w-full px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg font-medium transition-all duration-200"
                      >
                        Upgrade Plan
                      </button>
                      <button
                        onClick={() => {
                          // This would handle sign out
                        }}
                        className="w-full px-4 py-2 border border-slate-600 text-slate-300 hover:bg-slate-700 rounded-lg font-medium transition-colors duration-200"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'subscription' && (
                <div className="space-y-6">
                  {/* Subscription Section */}
                  <div>
                    <h2 className="text-xl font-semibold text-white mb-4">
                      Subscription Details
                    </h2>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Current Plan:</span>
                        <span className="text-white font-medium">
                          {getSubscriptionModeDisplay(
                            userSettings.subscription.mode,
                          )}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Status:</span>
                        <span
                          className={`font-medium ${getSubscriptionStatusColor(
                            userSettings.subscription.status,
                          )}`}
                        >
                          {userSettings.subscription.status
                            .charAt(0)
                            .toUpperCase() +
                            userSettings.subscription.status.slice(1)}
                        </span>
                      </div>

                      {userSettings.subscription.renewalDate && (
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Renewal Date:</span>
                          <span className="text-white">
                            {new Date(
                              userSettings.subscription.renewalDate,
                            ).toLocaleDateString()}
                          </span>
                        </div>
                      )}

                      {userSettings.subscription.mode !== 'free' && (
                        <div className="pt-4 border-t border-slate-700">
                          <button
                            onClick={handleCancelSubscription}
                            disabled={
                              isCancelling ||
                              userSettings.subscription.status === 'cancelled'
                            }
                            className={`w-full px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
                              userSettings.subscription.status === 'cancelled'
                                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-700 text-white'
                            }`}
                          >
                            {isCancelling
                              ? 'Cancelling...'
                              : 'Cancel Subscription'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
