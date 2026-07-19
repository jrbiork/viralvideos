import React, { useEffect, useRef, useState } from 'react';
import { AnimationQuota } from '../useUserQuota';

interface AnimateSceneModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl?: string | null;
  displayIndex: number;
  onAnimateScene: (prompt: string) => Promise<void>;
  onSaveAnimation: () => Promise<void>;
  isAnimating: boolean;
  isSavingAnimation: boolean;
  generatedVideoUrl?: string | null;
  animationQuota: AnimationQuota;
}

export default function AnimateSceneModal({
  isOpen,
  onClose,
  currentImageUrl,
  displayIndex,
  onAnimateScene,
  onSaveAnimation,
  isAnimating,
  isSavingAnimation,
  generatedVideoUrl,
  animationQuota,
}: AnimateSceneModalProps) {
  const [animationPrompt, setAnimationPrompt] = useState('');
  const [hasGeneratedVideo, setHasGeneratedVideo] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  // Disables the button and shows a spinner the instant it's clicked,
  // covering the gap before the submit request even resolves (isAnimating
  // only flips true once the parent gets the "queued" ack back).
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canAnimate =
    animationQuota.plan !== 'free' && animationQuota.remaining > 0;

  // Animation is asynchronous — onAnimateScene only submits the job. The
  // actual result arrives later as `isAnimating` flips back to false with
  // `generatedVideoUrl` populated (driven by a WebSocket broadcast further
  // up the tree), so pick up that falling edge here instead of the submit
  // call resolving.
  const prevIsAnimatingRef = useRef(isAnimating);
  useEffect(() => {
    if (prevIsAnimatingRef.current && !isAnimating && generatedVideoUrl) {
      setHasGeneratedVideo(true);
    }
    prevIsAnimatingRef.current = isAnimating;
  }, [isAnimating, generatedVideoUrl]);

  useEffect(() => {
    if (!isOpen) setShowDiscardConfirm(false);
  }, [isOpen]);

  const handleAnimate = async () => {
    if (!animationPrompt.trim()) {
      alert('Please enter a prompt describing how the scene should move');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAnimateScene(animationPrompt);
    } catch (error) {
      console.error('Error animating scene:', error);
      alert('Failed to animate scene. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTryAnother = async () => {
    if (!animationPrompt.trim()) {
      alert('Please enter a prompt describing how the scene should move');
      return;
    }

    setIsSubmitting(true);
    try {
      await onAnimateScene(animationPrompt);
    } catch (error) {
      console.error('Error animating scene:', error);
      alert('Failed to animate scene. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDiscard = () => {
    setShowDiscardConfirm(true);
  };

  const handleConfirmDiscard = () => {
    setHasGeneratedVideo(false);
    setShowDiscardConfirm(false);
  };

  const handleUseAnimation = async () => {
    try {
      await onSaveAnimation();
      setHasGeneratedVideo(false);
      onClose();
    } catch (error) {
      console.error('Error saving animation:', error);
      alert('Failed to save animation. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center z-[100] overflow-y-auto py-8">
      <div className="bg-slate-800 rounded-2xl w-full mx-4 max-h-[85vh] overflow-hidden shadow-2xl border border-slate-700/60 transition-all duration-300 ease-in-out max-w-[51.2rem]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60">
          <h2 className="text-base font-semibold text-white">
            Animate Scene {displayIndex + 1}
          </h2>
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 p-4 items-start overflow-y-auto max-h-[calc(85vh-56px)]">
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

          {/* Right: New Animation (when generated or generating), upgrade prompt, or prompt controls */}
          {isAnimating || (hasGeneratedVideo && generatedVideoUrl) ? (
            <div className="flex flex-col items-center lg:col-span-3">
              <h3
                className="text-white font-semibold mb-2 text-center"
                style={{ width: '100%', textAlign: 'center' }}
              >
                Animated Preview (5s)
              </h3>
              <div
                className="flex justify-center bg-slate-800/50 border border-slate-700 rounded-xl p-4"
                style={{ width: '100%' }}
              >
                <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-slate-800 ring-1 ring-slate-700 h-[40vh] flex items-center justify-center">
                  {isAnimating ? (
                    <div className="w-full h-full bg-slate-700/60 animate-pulse flex items-center justify-center">
                      <span className="inline-block h-8 w-8 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <video
                      src={generatedVideoUrl!}
                      className="w-full h-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                      controls
                    />
                  )}
                </div>
              </div>

              {hasGeneratedVideo && generatedVideoUrl && (
                <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-6">
                  <button
                    onClick={handleTryAnother}
                    disabled={isSubmitting || isAnimating}
                    className="flex items-center justify-center sm:justify-start gap-2 text-[#A5A6F6] hover:text-[#A5A6F6]/80 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed min-w-0 sm:min-w-[200px]"
                  >
                    {isSubmitting || isAnimating ? (
                      <>
                        <span className="inline-block h-4 w-4 border-2 border-[#A5A6F6]/70 border-t-transparent rounded-full animate-spin" />
                        Animating...
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
                        Try another
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDiscard}
                    className="py-2 px-4 text-white transition-all duration-200 text-xs font-bold hover:bg-[#5B5BFF]/30 hover:scale-105"
                    style={{
                      borderRadius: '12px',
                      border: '1.5px solid #5B5BFF',
                      boxShadow: '0 4px 16px 0 rgba(100, 0, 160, 0.35)',
                    }}
                  >
                    Discard
                  </button>

                  <button
                    onClick={handleUseAnimation}
                    disabled={isSavingAnimation}
                    className="py-2 px-4 text-white transition-colors hover:brightness-95 text-xs font-bold"
                    style={{
                      borderRadius: '12px',
                      background:
                        'linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%)',
                      boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
                    }}
                  >
                    {isSavingAnimation ? 'Saving...' : 'Use this animation'}
                  </button>
                </div>
              )}
            </div>
          ) : !canAnimate ? (
            /* Right: Upgrade prompt */
            <div className="flex flex-col items-center justify-center lg:col-span-3 text-center py-8">
              <h4 className="text-white font-semibold mb-2">
                {animationQuota.plan === 'free'
                  ? 'Animating scenes is a Creator/Pro feature'
                  : "You've used this month's scene animations"}
              </h4>
              <p className="text-slate-400 text-sm max-w-sm">
                {animationQuota.plan === 'free'
                  ? 'Upgrade to Creator or Pro to animate scenes into short videos with Runway.'
                  : `Your limit of ${animationQuota.limit} scene animations resets next month.`}
              </p>
            </div>
          ) : (
            /* Right: Prompt controls */
            <div className="flex flex-col lg:col-span-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-white font-semibold">Animation prompt</h4>
                <span className="text-xs text-slate-400">
                  {animationQuota.remaining}/{animationQuota.limit} left this
                  month
                </span>
              </div>
              <p className="text-xs text-amber-400/90 mb-3">
                The animated clip will be 5 seconds long — adjust your
                narration to fit the new 5s scene duration.
              </p>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-0 mt-6">
                <textarea
                  value={animationPrompt}
                  onChange={(e) => setAnimationPrompt(e.target.value)}
                  placeholder="Describe how the scene should move..."
                  className="w-full h-28 bg-transparent p-3 text-slate-200 placeholder-slate-400 resize-none focus:outline-none"
                />
                <div className="px-3 pb-3 text-xs text-slate-400">
                  E.g.: Slow camera pan across the elephant as it raises its
                  trunk
                </div>
              </div>

              {/* Footer actions */}
              <div className="mt-auto pt-4 flex items-center justify-end">
                <button
                  onClick={handleAnimate}
                  disabled={
                    !animationPrompt.trim() || isSubmitting || isAnimating
                  }
                  className={`${
                    animationPrompt.trim() && !isSubmitting && !isAnimating
                      ? 'text-white hover:brightness-95'
                      : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  } inline-flex items-center text-xs font-semibold transition-colors`}
                  style={
                    animationPrompt.trim() && !isSubmitting && !isAnimating
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
                  {isSubmitting || isAnimating ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                      Animating...
                    </span>
                  ) : (
                    'Animate scene'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showDiscardConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[110]">
          <div className="bg-slate-900 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl border border-slate-700/60">
            <h3 className="text-white font-semibold mb-2">
              Discard this animation?
            </h3>
            <p className="text-slate-400 text-sm mb-6">
              You'll lose this animated clip. This can't be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="py-2 px-4 text-white transition-colors text-xs font-bold hover:bg-[#5B5BFF]/30"
                style={{
                  borderRadius: '12px',
                  border: '1.5px solid #5B5BFF',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDiscard}
                className="py-2 px-4 text-white transition-colors text-xs font-bold hover:brightness-95"
                style={{
                  borderRadius: '12px',
                  background: '#DC2626',
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
