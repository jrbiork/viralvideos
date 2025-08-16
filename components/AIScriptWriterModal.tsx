'use client';

import React, { useState } from 'react';

interface AIScriptWriterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialScript: string;
  onGenerate: (prompt: string) => void;
  isGenerating?: boolean;
}

export default function AIScriptWriterModal({
  isOpen,
  onClose,
  initialScript,
  onGenerate,
  isGenerating = false,
}: AIScriptWriterModalProps) {
  const [prompt, setPrompt] = useState(initialScript);

  // Update prompt when modal opens or initialScript changes
  React.useEffect(() => {
    setPrompt(initialScript);
  }, [initialScript, isOpen]);

  // Handle Escape key to close modal
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Word count calculation
  const wordCount = prompt.trim() ? prompt.trim().split(/\s+/).length : 0;
  const maxWords = 100;
  const isOverLimit = wordCount > maxWords;

  const handleGenerate = async () => {
    if (prompt.trim()) {
      try {
        // Call the enhance-prompt API
        const response = await fetch(
          `/api/enhance-prompt?prompt=${encodeURIComponent(
            prompt.trim(),
          )}&duration=30s`,
          {
            method: 'GET',
            credentials: 'include',
          },
        );

        if (response.ok) {
          const data = await response.json();
          if (data.enhancedPrompt) {
            setPrompt(data.enhancedPrompt);
          }
        } else {
          console.error('Failed to generate script');
        }
      } catch (error) {
        console.error('Error generating script:', error);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleGenerate();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white text-lg">✨</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">AI Script Writer</h2>
              <p className="text-gray-400 text-sm">
                Generate a script for your video
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <div>
            <label className="block text-white font-medium mb-2">
              What kind of video do you want to create?
            </label>
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => {
                  const newValue = e.target.value;
                  const newWordCount = newValue.trim()
                    ? newValue.trim().split(/\s+/).length
                    : 0;

                  // Only allow input if under word limit
                  if (
                    newWordCount <= maxWords ||
                    newValue.length < prompt.length
                  ) {
                    setPrompt(newValue);
                  }
                }}
                onKeyDown={handleKeyPress}
                placeholder="Describe your video idea, topic, or what you want to create. For example: 'A short video about a cat playing in a garden' or 'A tutorial on making the perfect coffee'"
                className={`w-full h-56 bg-slate-800 border rounded-lg p-4 text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                  isOverLimit
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-700'
                }`}
                disabled={isGenerating}
              />
              <div
                className={`absolute bottom-2 right-2 text-xs font-medium ${
                  isOverLimit
                    ? 'text-red-400'
                    : wordCount > maxWords * 0.8
                    ? 'text-yellow-400'
                    : 'text-gray-400'
                }`}
              >
                {wordCount}/{maxWords}
              </div>
            </div>
            <p className="text-gray-400 text-xs mt-2">
              Press Ctrl+Enter (or Cmd+Enter) to generate
            </p>
          </div>

          {/* Examples */}
          <div>
            <p className="text-gray-400 text-sm mb-2">Example prompts:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                'A cat playing in a garden with butterflies',
                'A tutorial on making perfect coffee',
                'A motivational video about achieving goals',
                'A funny video about morning routines',
              ].map((example, index) => (
                <button
                  key={index}
                  onClick={() => setPrompt(example)}
                  className="text-left p-2 bg-slate-800 hover:bg-slate-700 rounded text-gray-300 text-xs transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-700">
          {/* Left side - Use button */}
          <button
            onClick={() => {
              onGenerate(prompt.trim());
              onClose();
            }}
            disabled={!prompt.trim()}
            className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
              !prompt.trim()
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'text-white hover:bg-white/10 border'
            }`}
            style={!prompt.trim() ? {} : { borderColor: '#5b5bff' }}
          >
            Use
          </button>

          {/* Right side - Cancel and Generate buttons */}
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              disabled={isGenerating}
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim()}
              className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                !prompt.trim()
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-400 to-blue-500 text-white hover:from-purple-500 hover:to-blue-600'
              }`}
            >
              {isGenerating ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Generating...</span>
                </div>
              ) : (
                'Generate Script'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
