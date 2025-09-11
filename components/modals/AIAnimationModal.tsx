import React, { useState } from 'react';

interface AIAnimationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl?: string | null;
  imageUrl?: string;
  displayIndex: number;
  onAnimateImage: (prompt: string, duration: string) => Promise<void>;
  isAnimating: boolean;
  validationErrors: { image: boolean };
}

export default function AIAnimationModal({
  isOpen,
  onClose,
  currentImageUrl,
  imageUrl,
  displayIndex,
  onAnimateImage,
  isAnimating,
  validationErrors,
}: AIAnimationModalProps) {
  const [animationPrompt, setAnimationPrompt] = useState('');
  const [animationDuration, setAnimationDuration] = useState('5s');

  const handleAnimation = async () => {
    try {
      await onAnimateImage(animationPrompt, animationDuration);
    } catch (error) {
      console.error('Error animating image:', error);
      alert('Failed to animate image. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-2xl p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">AI Animation</h2>
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

        {/* Modal Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Side - Current Image */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Current Image</h3>
            <div
              className={`aspect-[9/16] rounded-lg overflow-hidden bg-slate-700 ${
                validationErrors.image
                  ? 'ring-2 ring-red-500 border-2 border-red-500'
                  : ''
              }`}
            >
              <img
                src={currentImageUrl || imageUrl}
                alt={`Scene ${displayIndex + 1}`}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Middle - Prompt and Duration */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">
              Animation Settings
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Animation Prompt (optional)
                </label>
                <textarea
                  value={animationPrompt}
                  onChange={(e) => setAnimationPrompt(e.target.value)}
                  placeholder="Describe how you want the image to be animated..."
                  className="w-full h-32 bg-slate-700 border border-slate-600 rounded-lg p-3 text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-300">
                  Duration
                </label>
                <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                  <button
                    onClick={() => setAnimationDuration('5s')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      animationDuration === '5s'
                        ? 'text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    style={
                      animationDuration === '5s'
                        ? { backgroundColor: '#7552F2' }
                        : {}
                    }
                  >
                    5s
                  </button>
                  <button
                    onClick={() => setAnimationDuration('10s')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      animationDuration === '10s'
                        ? 'text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    style={
                      animationDuration === '10s'
                        ? { backgroundColor: '#7552F2' }
                        : {}
                    }
                  >
                    10s
                  </button>
                </div>
              </div>

              <button
                onClick={handleAnimation}
                disabled={isAnimating}
                className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
                  isAnimating
                    ? 'bg-gray-500 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-700'
                } text-white`}
              >
                {isAnimating ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>Animating...</span>
                  </div>
                ) : (
                  `Generate Animation (${
                    animationDuration === '5s' ? '25' : '50'
                  } credits)`
                )}
              </button>
            </div>
          </div>

          {/* Right Side - Example Video */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Output Example</h3>
            <div className="aspect-[9/16] rounded-lg overflow-hidden bg-slate-700 flex items-center justify-center">
              <video
                className="w-full h-full object-cover rounded-lg"
                controls
                muted
                loop
                poster="/assets/sample1.mp4"
              >
                <source src="/assets/example.mp4" type="video/mp4" />
                <div className="text-center text-gray-400">
                  <svg
                    className="w-16 h-16 mx-auto mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1a3 3 0 000-6h-1m4 6V4a3 3 0 003-3M9 10v8a3 3 0 01-3 3M12 14l4-4 4 4"
                    />
                  </svg>
                  <p className="text-sm">Output example preview</p>
                </div>
              </video>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
