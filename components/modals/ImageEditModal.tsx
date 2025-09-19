import React, { useState } from 'react';

interface ImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string;
  displayIndex: number;
  onGenerateImage: (prompt: string) => Promise<void>;
  onSaveImage: () => Promise<void>;
  isGeneratingImage: boolean;
  isSavingImage: boolean;
  generatedImageUrl?: string | null;
  validationErrors: { image: boolean };
  onClearValidationError: () => void;
}

export default function ImageEditModal({
  isOpen,
  onClose,
  imageUrl,
  displayIndex,
  onGenerateImage,
  onSaveImage,
  isGeneratingImage,
  isSavingImage,
  generatedImageUrl,
  validationErrors,
  onClearValidationError,
}: ImageEditModalProps) {
  const [newImagePrompt, setNewImagePrompt] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'animate'>('edit');

  const handleGenerateImage = async () => {
    if (!newImagePrompt.trim()) {
      alert('Please enter a prompt for the new image');
      return;
    }

    try {
      await onGenerateImage(newImagePrompt);
      onClearValidationError();
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-2xl w-full max-w-6xl mx-4 max-h-[92vh] overflow-hidden shadow-2xl border border-slate-700/60">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700/60">
          <h2 className="text-lg font-semibold text-white">Edit Scene Image</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                d="M6 18L18 6M6 6l12 12"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-6">
          {/* Left: Current Image */}
          <div>
            <h3 className="text-white font-semibold mb-3">Current Image</h3>
            <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-slate-800 ring-1 ring-slate-700">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={`Scene ${displayIndex + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  No image
                </div>
              )}
              {/* 9:16 badge */}
              <div className="absolute top-3 left-3 px-3 py-1 rounded-lg bg-black/50 text-slate-200 text-xs font-medium flex items-center gap-2">
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <rect
                    x="7"
                    y="3"
                    width="10"
                    height="18"
                    rx="2"
                    ry="2"
                    strokeWidth="2"
                  />
                </svg>
                9:16 Vertical
              </div>
            </div>
          </div>

          {/* Right: Edit / Animate */}
          <div className="flex flex-col">
            {/* Tabs */}
            <div className="flex items-center gap-2 bg-slate-800 rounded-xl p-1 w-full max-w-md">
              <button
                className={`${
                  activeTab === 'edit'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300'
                } flex-1 py-2 rounded-lg text-sm font-medium transition-colors`}
                onClick={() => setActiveTab('edit')}
              >
                Edit
              </button>
              <button
                className={`${
                  activeTab === 'animate'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300'
                } flex-1 py-2 rounded-lg text-sm font-medium transition-colors`}
                onClick={() => setActiveTab('animate')}
              >
                Animate
              </button>
            </div>

            {/* Prompt */}
            <div className="mt-5">
              <h4 className="text-white font-semibold mb-2">Prompt</h4>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-0">
                <textarea
                  value={newImagePrompt}
                  onChange={(e) => setNewImagePrompt(e.target.value)}
                  placeholder={
                    'Describe your new image... (e.g. A donut with rainbow\nsprinkles on a pink background)'
                  }
                  className="w-full h-36 bg-transparent p-4 text-slate-200 placeholder-slate-400 resize-none focus:outline-none"
                />
                <div className="px-4 pb-4 text-xs text-slate-400">
                  Tip: keep under 100 words for the best video pacing
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-600/40 transition-colors"
                  onClick={() => {
                    // reserved: could open AI assist modal
                  }}
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      d="M12 3v18m9-9H3"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  Write Magic Script
                </button>
              </div>
            </div>

            {/* Footer actions */}
            <div className="mt-auto pt-6 flex items-center justify-end">
              <button
                onClick={handleGenerateImage}
                disabled={!newImagePrompt.trim() || isGeneratingImage}
                className={`${
                  newImagePrompt.trim() && !isGeneratingImage
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                } inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors`}
              >
                {isGeneratingImage ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                    Generating...
                  </span>
                ) : (
                  'Generate image: 5 Credits'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
