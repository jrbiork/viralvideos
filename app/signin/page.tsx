'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/AuthContext';
import AnimatedBackground from '../../components/AnimatedBackground';

export default function SignIn() {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { login, isAuthenticated, user, refreshAuth } = useAuth();

  // Redirect to create page if user is already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      router.push('/create');
    }
  }, [isAuthenticated, user, router]);

  const handleGoogleSignIn = async () => {
    try {
      setError('');
      login('Google');
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      setError('');
      const resp = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        const message = data?.error || 'Failed to sign in';
        setError(message);
        return;
      }
      // Ensure React auth state is updated based on the cookie (no localStorage used)
      await refreshAuth();
      router.push('/create');
    } catch (error) {
      console.error('Sign in failed:', error);
      setError(error instanceof Error ? error.message : 'Sign in failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Section - Sign In Form */}
      <div className="w-1/2 flex items-center justify-center p-12">
        <div className="max-w-md w-full">
          {/* Header/Logo */}
          <div className="flex items-center space-x-2 mb-8">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <svg
                className="w-5 h-5 text-[#1A0033]"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <span className="text-white text-2xl font-bold">Viral Shorts</span>
          </div>

          {/* Main Heading */}
          <h1 className="text-3xl font-bold text-white mb-8">
            Sign in to bring your next viral idea to life.
          </h1>

          {/* Sign In Form */}
          <form onSubmit={handleSignIn} className="space-y-6">
            {/* Email Input */}
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white text-gray-900 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Email"
              />
            </div>

            {/* Password Input */}
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                className="w-full pr-12 px-4 py-3 bg-white text-gray-900 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute inset-y-0 right-3 flex items-center text-gray-600 hover:text-gray-800"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 3l18 18" />
                    <path d="M10.58 10.58a2 2 0 102.83 2.83" />
                    <path d="M16.88 13.12A10.94 10.94 0 0012 11c-4.2 0-7.8 2.5-9 6 1.1 2.8 3.7 5 7 5 1.2 0 2.3-.2 3.3-.7" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
              {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-purple-400 to-blue-500 text-white rounded-lg hover:from-purple-500 hover:to-blue-600 transition-all font-semibold"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>

            {/* Sign Up Link */}
            <div className="text-center">
              <p className="text-gray-400 text-sm">
                Don't have an account?{' '}
                <a
                  href="/signup"
                  className="text-white font-semibold hover:text-gray-300"
                >
                  Sign up
                </a>
              </p>
            </div>

            {/* Separator */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span
                  className="px-2 text-gray-300"
                  style={{
                    background:
                      'linear-gradient(135deg, rgb(var(--background-start-rgb)) 0%, rgb(var(--background-end-rgb)) 100%)',
                  }}
                >
                  Or continue with
                </span>
              </div>
            </div>

            {/* Google Sign In Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center space-x-3 bg-white text-gray-800 py-3 px-4 rounded-lg hover:bg-gray-50 transition-all font-semibold border border-gray-300 shadow-sm"
            >
              <svg className="w-5 h-5 text-gray-800" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Google</span>
            </button>

            {/* Legal Text */}
            <div className="text-left">
              <p className="text-gray-400 text-xs">
                By clicking on sign in, you agree to our{' '}
                <a href="#" className="text-blue-400 hover:text-blue-300">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" className="text-blue-400 hover:text-blue-300">
                  Privacy Policy
                </a>
              </p>
            </div>
          </form>
        </div>
      </div>

      {/* Right Section - Video Examples */}
      <div className="w-1/2 flex items-center justify-center p-12 relative">
        <AnimatedBackground />
        {/* Video Cards Container */}
        <div
          className="relative w-full md:w-1/2 min-w-1/2 h-[600px] flex items-center justify-center"
          style={{
            marginTop: '-60px',
            transform: 'rotate(-10deg)',
          }}
        >
          {/* Card 1 - Instagram (Left, no rotation) */}
          <div
            className="absolute w-[105.6%] max-w-[290px] aspect-[9/16] transition-all duration-300 hover:z-50 hover:scale-105"
            style={{
              transform: 'rotate(0deg) translateX(-200px)',
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

          {/* Card 2 - YouTube (Middle, 10deg rotation) */}
          <div
            className="absolute w-[105.6%] max-w-[290px] aspect-[9/16] transition-all duration-300 hover:z-50 hover:scale-105"
            style={{
              transform: 'rotate(10deg) translateX(0px)',
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
                <source src="https://strshrt.xyz/apollo.mp4" type="video/mp4" />
              </video>
            </div>
          </div>

          {/* Card 3 - TikTok (Right, 20deg rotation) */}
          <div
            className="absolute w-[105.6%] max-w-[290px] aspect-[9/16] transition-all duration-300 hover:z-50 hover:scale-105"
            style={{
              transform: 'rotate(20deg) translateX(200px)',
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
                <source
                  src="https://strshrt.xyz/cleopatra-features.mp4"
                  type="video/mp4"
                />
              </video>
            </div>
          </div>
        </div>

        {/* Bottom Right Section - Trust Elements */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-center">
          {/* Trust Badge */}
          <div className="flex items-center justify-center mb-4">
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

          {/* Trust Text */}
          <div className="mb-2">
            <span className="text-white text-sm font-bold">
              TRUSTED BY 100K+ creators
            </span>
          </div>

          {/* Main Heading */}
          <div>
            <h2 className="text-2xl font-bold text-white">
              Grow Your Audience With Powerful AI Videos
            </h2>
          </div>
        </div>
      </div>
    </div>
  );
}
