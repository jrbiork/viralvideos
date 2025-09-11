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
      <div className="bg-slate-800 rounded-2xl p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Edit Image</h2>
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
            <div className="aspect-[9/16] rounded-lg overflow-hidden bg-slate-700">
              <img
                src={imageUrl}
                alt={`Scene ${displayIndex + 1}`}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Middle - Prompt Input */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">
              New Image Prompt
            </h3>
            <div className="space-y-3">
              <textarea
                value={newImagePrompt}
                onChange={(e) => setNewImagePrompt(e.target.value)}
                placeholder="Describe the new image you want to generate..."
                className="w-full h-32 bg-slate-700 border border-slate-600 rounded-lg p-3 text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
              <button
                onClick={handleGenerateImage}
                disabled={!newImagePrompt.trim() || isGeneratingImage}
                className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${
                  newImagePrompt.trim() && !isGeneratingImage
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                }`}
              >
                {isGeneratingImage ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>Generating...</span>
                  </div>
                ) : (
                  'Generate New Image (10 credits)'
                )}
              </button>

              {/* Replace Original Image Button */}
              <button
                onClick={onSaveImage}
                disabled={isSavingImage}
                className={`w-full py-3 px-6 rounded-lg font-medium transition-colors mt-3 ${
                  isSavingImage
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700'
                } text-white`}
              >
                {isSavingImage ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>Saving Image...</span>
                  </div>
                ) : (
                  'Replace Original Image'
                )}
              </button>
            </div>
          </div>

          {/* Right Side - New Generated Image Placeholder */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">
              New Generated Image
            </h3>
            <div className="aspect-[9/16] rounded-lg overflow-hidden bg-slate-700 flex items-center justify-center">
              {generatedImageUrl ? (
                <img
                  src={generatedImageUrl}
                  alt="Generated Image"
                  className="w-full h-full object-cover"
                />
              ) : isGeneratingImage ? (
                <div className="text-center text-gray-400">
                  <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-500 border-t-transparent mx-auto mb-2"></div>
                  <p className="text-sm">Generating your image...</p>
                </div>
              ) : newImagePrompt ? (
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
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p className="text-sm">
                    Image will appear here after generation
                  </p>
                </div>
              ) : (
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
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p className="text-sm">
                    Enter a prompt to generate a new image
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
