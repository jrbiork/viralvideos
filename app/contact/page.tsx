'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import AnimatedBackground from '../../components/AnimatedBackground';
import { useAuth } from '../../components/AuthContext';
import UserDropdown from '../../components/UserDropdown';
import MobileNav from '../../components/MobileNav';

export default function Contact() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate form submission
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Reset form
    setFormData({
      name: '',
      email: '',
      subject: '',
      message: '',
    });
    setIsSubmitting(false);

    // Show success message (you can implement a toast notification here)
    alert("Thank you for your message! We'll get back to you soon.");
  };

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
            className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
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
            Get in{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">
              Touch
            </span>
          </h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            Have questions about StoryReel? We'd love to hear from you. Send
            us a message and we'll respond as soon as possible.
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Contact Form */}
          <div className="bg-gray-800/50 rounded-2xl p-8 border border-gray-700/50">
            <h2 className="text-2xl font-bold text-white mb-6">
              Send us a message
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="name"
                  className="block text-gray-300 text-sm font-medium mb-2"
                >
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-gray-300 text-sm font-medium mb-2"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="your.email@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor="subject"
                  className="block text-gray-300 text-sm font-medium mb-2"
                >
                  Subject
                </label>
                <select
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="">Select a subject</option>
                  <option value="general">General Inquiry</option>
                  <option value="support">Technical Support</option>
                  <option value="billing">Billing Question</option>
                  <option value="partnership">Partnership</option>
                  <option value="feedback">Feedback</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="message"
                  className="block text-gray-300 text-sm font-medium mb-2"
                >
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  required
                  rows={6}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  placeholder="Tell us how we can help you..."
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-6 bg-gradient-to-r from-purple-400 to-blue-500 text-white rounded-lg hover:from-purple-500 hover:to-blue-600 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
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
