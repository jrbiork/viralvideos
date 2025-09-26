import React, { useState } from 'react';

interface ImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl?: string | null;
  displayIndex: number;
  onGenerateImage: (prompt: string) => Promise<void>;
  onAnimateImage: (prompt: string, duration: number) => Promise<void>;
  onSaveImage: () => Promise<void>;
  isGeneratingImage: boolean;
  isAnimatingImage: boolean;
  isSavingImage: boolean;
  generatedImageUrl?: string | null;
  validationErrors: { image: boolean };
  onClearValidationError: () => void;
  initialTab?: 'edit' | 'animate';
}

export default function ImageEditModal({
  isOpen,
  onClose,
  currentImageUrl,
  displayIndex,
  onGenerateImage,
  onAnimateImage,
  onSaveImage,
  isGeneratingImage,
  isAnimatingImage,
  isSavingImage,
  generatedImageUrl,
  validationErrors,
  onClearValidationError,
  initialTab,
}: ImageEditModalProps) {
  const [editPrompt, setEditPrompt] = useState('');
  const [animatePrompt, setAnimatePrompt] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'animate'>('edit');
  const [animationDuration, setAnimationDuration] = useState<5 | 10>(5);
  const [hasGeneratedImage, setHasGeneratedImage] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || 'edit');
    }
  }, [isOpen, initialTab]);

  const handleGenerateImage = async () => {
    if (!editPrompt.trim()) {
      alert('Please enter a prompt for the new image');
      return;
    }

    try {
      await onGenerateImage(editPrompt);
      setHasGeneratedImage(true);
      onClearValidationError();
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image. Please try again.');
    }
  };

  const handleAnimateImage = async () => {
    if (!animatePrompt.trim()) {
      alert('Please enter a prompt for the animation');
      return;
    }

    try {
      await onAnimateImage(animatePrompt, animationDuration);
      onClearValidationError();
    } catch (error) {
      console.error('Error animating image:', error);
      alert('Failed to animate image. Please try again.');
    }
  };

  const handleTryAnother = async () => {
    if (!editPrompt.trim()) {
      alert('Please enter a prompt for the new image');
      return;
    }

    try {
      await onGenerateImage(editPrompt);
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image. Please try again.');
    }
  };

  const handleDiscard = () => {
    setHasGeneratedImage(false);
  };

  const handleUseImage = async () => {
    try {
      await onSaveImage();
      setHasGeneratedImage(false);
    } catch (error) {
      console.error('Error saving image:', error);
      alert('Failed to save image. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100]">
      <div
        className={`bg-slate-900 rounded-2xl w-full mx-4 max-h-[65vh] overflow-hidden shadow-2xl border border-slate-700/60 transition-all duration-300 ease-in-out ${
          activeTab === 'animate' ? 'max-w-[60rem]' : 'max-w-[51.2rem]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60">
          <h2 className="text-base font-semibold text-white">
            Scene {displayIndex + 1}
          </h2>
          {/* Tabs */}
          <div className="flex items-center gap-2 bg-slate-800 rounded-xl p-1 w-48">
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
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors"
          >
            <svg
              className="w-3 h-3"
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 p-4 items-start">
          {/* Left: Current Image */}
          <div className="lg:col-span-1 flex flex-col items-center">
            <h3 className="text-white font-semibold mb-4">Current Image</h3>
            <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-slate-800 ring-2 ring-slate-700 max-h-[40vh] mt-2">
              {currentImageUrl ? (
                <img
                  src={currentImageUrl}
                  alt={`Scene ${displayIndex + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm p-16 whitespace-nowrap">
                  No image
                </div>
              )}
            </div>
          </div>

          {/* Right: New Image (when generated) or Edit/Animate Controls */}
          {hasGeneratedImage && generatedImageUrl ? (
            <div className="flex flex-col items-center lg:col-span-3">
              <h3
                className="text-white font-semibold mb-2 text-center"
                style={{
                  width: '100%',
                  textAlign: 'center',
                }}
              >
                New Image
              </h3>
              <div
                className="flex justify-center bg-slate-800/50 border border-slate-700 rounded-xl p-4"
                style={{ width: '100%' }}
              >
                <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-slate-800 ring-1 ring-slate-700 max-h-[40vh] flex items-center justify-center">
                  <img
                    src={generatedImageUrl}
                    alt="Generated image"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 flex items-center gap-6">
                <button
                  onClick={handleTryAnother}
                  disabled={isGeneratingImage}
                  className="flex items-center gap-2 text-[#A5A6F6] hover:text-[#A5A6F6]/80 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed min-w-[200px]"
                >
                  {isGeneratingImage ? (
                    <>
                      <span className="inline-block h-4 w-4 border-2 border-[#A5A6F6]/70 border-t-transparent rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                      >
                        <path
                          d="M1 4v6h6"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M23 20v-6h-6"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Try another for 5 credits
                    </>
                  )}
                </button>

                <button
                  onClick={handleDiscard}
                  className="py-2 px-4 text-white transition-all duration-200 text-xs font-bold hover:bg-[#5B5BFF]/30 hover:scale-105 ml-4"
                  style={{
                    borderRadius: '12px',
                    border: '1.5px solid #5B5BFF',
                    boxShadow: '0 4px 16px 0 rgba(100, 0, 160, 0.35)',
                  }}
                >
                  Discard
                </button>

                <button
                  onClick={handleUseImage}
                  disabled={isSavingImage}
                  className="py-2 px-4 text-white transition-colors hover:brightness-95 text-xs font-bold"
                  style={{
                    borderRadius: '12px',
                    background:
                      'linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%)',
                    boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
                  }}
                >
                  {isSavingImage ? 'Saving...' : 'Use this image'}
                </button>
              </div>
            </div>
          ) : (
            /* Right: Edit / Animate */
            <div className="flex flex-col lg:col-span-3">
              {/* Tab Content */}
              {activeTab === 'edit' ? (
                <div>
                  <h4 className="text-white font-semibold mb-2">Prompt</h4>
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-0 mt-6">
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      placeholder="Describe the new image you want to generate..."
                      className="w-full h-28 bg-transparent p-3 text-slate-200 placeholder-slate-400 resize-none focus:outline-none"
                    />
                    <div className="px-3 pb-3 text-xs text-slate-400">
                      E.g.: An elephant in the jungle
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Labels Row */}
                  <div className="grid grid-cols-3 gap-4 items-center">
                    <h4 className="text-white font-semibold mb-2">Prompt</h4>
                    <div></div>
                    <h3 className="text-white font-semibold mb-2 text-center">
                      Animation Example
                    </h3>
                  </div>

                  <div className="grid grid-cols-3 gap-4 items-start mt-0 pt-0">
                    {/* Input and Duration - 2/3 */}
                    <div
                      className="col-span-2 flex flex-col justify-between"
                      style={{ height: '40vh' }}
                    >
                      <div className="space-y-3">
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-0 h-28">
                          <textarea
                            value={animatePrompt}
                            onChange={(e) => setAnimatePrompt(e.target.value)}
                            placeholder="Describe how animate the image..."
                            className="w-full h-28 bg-transparent p-3 text-slate-200 placeholder-slate-400 resize-none focus:outline-none"
                          />
                          <div className="px-3 pb-3 text-xs text-slate-400">
                            E.g.: A whale jumping out of the sea
                          </div>
                        </div>

                        {/* Duration Selection */}
                        <div
                          className="space-y-2 mt-8"
                          style={{ paddingTop: '40px' }}
                        >
                          <div className="flex items-center gap-4">
                            <h5 className="text-white font-bold text-sm">
                              Duration
                            </h5>
                            <div className="flex items-center gap-2 bg-slate-800 rounded-xl p-1">
                              <button
                                onClick={() => setAnimationDuration(5)}
                                className={`${
                                  animationDuration === 5
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-300'
                                } py-2 px-3 rounded-lg text-sm font-medium transition-colors`}
                              >
                                5 seconds
                              </button>
                              <button
                                onClick={() => setAnimationDuration(10)}
                                className={`${
                                  animationDuration === 10
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-slate-300'
                                } py-2 px-3 rounded-lg text-sm font-medium transition-colors`}
                              >
                                10 seconds
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Animate Button */}
                      <div className="flex items-center justify-end">
                        <button
                          onClick={handleAnimateImage}
                          disabled={!animatePrompt.trim() || isAnimatingImage}
                          className={`${
                            animatePrompt.trim() && !isAnimatingImage
                              ? 'text-white hover:brightness-95'
                              : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                          } inline-flex items-center text-xs font-semibold transition-colors`}
                          style={
                            animatePrompt.trim() && !isAnimatingImage
                              ? {
                                  borderRadius: '12px',
                                  background:
                                    'var(--Gradient, linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%))',
                                  boxShadow:
                                    '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
                                  height: '40px',
                                  padding: '8px 16px',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  gap: '10px',
                                }
                              : {
                                  borderRadius: '12px',
                                  height: '40px',
                                  padding: '8px 16px',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  gap: '10px',
                                }
                          }
                        >
                          {isAnimatingImage ? (
                            <span className="flex items-center gap-2">
                              <span className="inline-block h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                              Animating...
                            </span>
                          ) : (
                            `Animate image: ${
                              animationDuration === 5 ? '25' : '50'
                            } credits`
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Example Animation - 1/3 */}
                    <div className="flex flex-col items-center justify-center">
                      <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-slate-800 ring-1 ring-slate-700 max-h-[40vh]">
                        <video
                          src="/assets/animation-example.mp4"
                          className="w-full h-full object-cover"
                          autoPlay
                          loop
                          muted
                          playsInline
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer actions - only for edit tab */}
              {activeTab === 'edit' && (
                <div className="mt-auto pt-4 flex items-center justify-end">
                  <button
                    onClick={handleGenerateImage}
                    disabled={!editPrompt.trim() || isGeneratingImage}
                    className={`${
                      editPrompt.trim() && !isGeneratingImage
                        ? 'text-white hover:brightness-95'
                        : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    } inline-flex items-center text-xs font-semibold transition-colors`}
                    style={
                      editPrompt.trim() && !isGeneratingImage
                        ? {
                            borderRadius: '12px',
                            background:
                              'var(--Gradient, linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%))',
                            boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
                            height: '40px',
                            padding: '8px 16px',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '10px',
                          }
                        : {
                            borderRadius: '12px',
                            height: '40px',
                            padding: '8px 16px',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '10px',
                          }
                    }
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
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
