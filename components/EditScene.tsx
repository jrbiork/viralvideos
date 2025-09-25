import React, { useState } from 'react';
import ImageEditModal from './modals/ImageEditModal';

export interface Scene {
  id: number;
  description: string;
  narration: string;
  duration: number;
  isUserAdded?: boolean;
  scenePosition?: number;
  placeholderImageUrl?: string;
  removed?: boolean;
  animated?: boolean;
}

interface EditSceneProps {
  scene: Scene;
  editingScene: number | null;
  editedNarration: string;
  onEditScene: (sceneId: number, narration: string) => void;
  onSaveEdit: (sceneId: number) => void;
  onCancelEdit: () => void;
  onEditedNarrationChange: (value: string) => void;
  onRegenerateAudio?: (sceneId: number) => void;
  imageUrl?: string;
  isSelected?: boolean;
  onSelect?: (sceneId: number) => void;
  regeneratingSceneId?: number | null;
  creatingSceneId?: number | null;
  setCreatingSceneId?: React.Dispatch<React.SetStateAction<number | null>>;
  isLoadingVideoScenes?: boolean;
  setIsLoadingVideoScenes: (value: boolean) => void;
  timestamp?: string;
  onDeleteScene?: (sceneId: number) => void;
  onDeleteUserAddedScene?: (sceneId: number) => void;
  onRestoreOriginalScene?: (sceneId: number) => void;
  displayIndex?: number; // The sequential display index for this scene
  totalScenesCount?: number; // Total number of scenes (original + additional)
  isDisabled?: boolean; // Whether the scene is disabled (e.g., during deletion)
  showToasterMessage?: (
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void;
  animationRequested?: boolean;
  onAnimationRequested?: () => void;
}

export default function EditScene({
  scene,
  editingScene,
  editedNarration,
  onEditScene,
  onSaveEdit,
  onCancelEdit,
  onEditedNarrationChange,
  onRegenerateAudio,
  imageUrl,
  isSelected = false,
  onSelect,
  regeneratingSceneId,
  creatingSceneId,
  setCreatingSceneId,
  isLoadingVideoScenes,
  setIsLoadingVideoScenes,
  timestamp,
  onDeleteScene,
  onDeleteUserAddedScene,
  onRestoreOriginalScene,
  displayIndex = 0,
  totalScenesCount = 0,
  isDisabled = false,
  showToasterMessage,
  animationRequested,
  onAnimationRequested,
}: EditSceneProps) {
  const urlTest =
    'https://wallpaper.forfun.com/fetch/19/19549495ffb40723d19982e9961041d9.jpeg?h=1200&r=0.5';

  const urlTest2 =
    'https://dnznrvs05pmza.cloudfront.net/032af1ac-2cbe-4841-a689-032f0d05780e.png?_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlIYXNoIjoiNzMzMTM4Mjc4N2ViMjdmNyIsImJ1Y2tldCI6InJ1bndheS10YXNrLWFydGlmYWN0cyIsInN0YWdlIjoicHJvZCIsImV4cCI6MTc1Njk0NDAwMH0.HIbTLZ8moLkowSj28Vb-rMxnfM108JexJFafmfp_qgM';

  const urlTest3 =
    'https://wallpaper.forfun.com/fetch/b4/b4998cef88539ca8075898078e52ece0.jpeg?h=1200&r=0.5';

  const [isImageEditModalOpen, setIsImageEditModalOpen] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isAnimatingImage, setIsAnimatingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>();
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(
    imageUrl || null,
  );
  const [isAiAnimationModalOpen, setIsAiAnimationModalOpen] = useState(false);
  const [animationPrompt, setAnimationPrompt] = useState('');
  const [animationDuration, setAnimationDuration] = useState('5s');
  const [validationErrors, setValidationErrors] = useState({ image: false });
  // animationRequested is controlled by parent (SceneCardsContainer)
  const [isRequestingAnimation, setIsRequestingAnimation] = useState(false);
  const [initialImageEditTab, setInitialImageEditTab] = useState<
    'edit' | 'animate'
  >('edit');

  // animationRequested is managed by parent via WS preview_completed toggle

  // Handlers extracted from inline props for ImageEditModal
  const handleGenerateImageFromModal = async (prompt: string) => {
    setIsGeneratingImage(true);
    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imagePrompt: prompt,
          timestamp: queryParams.get('timestamp'),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Image generation successful:', result);
        if (result.data?.imageUrl) {
          setGeneratedImageUrl(result.data.imageUrl);
        }
      } else {
        const errorData = await response.json();
        console.error('Image generation failed:', errorData);
        showToasterMessage?.(
          `Failed to generate image: ${errorData.error || 'Unknown error'}`,
          'error',
        );
      }
    } catch (error) {
      console.error('Error calling generate-image API:', error);
      showToasterMessage?.(
        'Failed to generate image. Please try again with different prompt.',
        'error',
      );
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleAnimateImageFromModal = async (
    prompt: string,
    duration: number,
  ) => {
    setIsAnimatingImage(true);
    onAnimationRequested && onAnimationRequested();
    setIsLoadingVideoScenes(true);
    try {
      const response = await fetch('/api/animate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          animationPrompt: prompt,
          animationDuration: duration,
          timestamp: queryParams.get('timestamp'),
          sceneId: scene.id,
          imageUrl: imageUrl,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Image animation successful:', result);

        // Close modal after 2 seconds
        setTimeout(() => {
          setIsImageEditModalOpen(false);
        }, 2000);
      } else {
        const errorData = await response.json();
        console.error('Image animation failed:', errorData);
        showToasterMessage?.(
          `Failed to animate image. Please try again with different prompt.`,
          'error',
        );
      }
    } catch (error) {
      console.error('Error calling animate-image API:', error);
      showToasterMessage?.(
        'Failed to animate image. Please try again with different prompt.',
        'error',
      );
    } finally {
      setIsAnimatingImage(false);
    }
  };

  React.useEffect(() => {
    setCurrentImageUrl(imageUrl || null);
  }, [imageUrl]);

  const queryParams = new URLSearchParams(window.location.search);

  const isEditing = editingScene === scene.id;
  const isRegenerating = regeneratingSceneId === scene.id;
  const isCreatingScene = creatingSceneId === scene.id;

  // Validation logic for Create Scene button
  const hasValidNarration =
    scene.narration && scene.narration.trim().length > 0;
  const hasValidImage = currentImageUrl || imageUrl;
  const isUnderSceneLimit = totalScenesCount < 20;
  const canCreateScene =
    hasValidNarration && hasValidImage && isUnderSceneLimit;

  const handleCreateScene = async () => {
    try {
      const currentTimestamp = timestamp || queryParams.get('timestamp');
      if (!currentTimestamp) throw new Error('No timestamp found');
      if (!currentImageUrl && !imageUrl)
        throw new Error('No image available to create scene');

      // Set the creating scene ID to show loading overlay
      if (setCreatingSceneId) {
        setCreatingSceneId(scene.id);
      }

      const payload = {
        imageUrl: currentImageUrl || imageUrl!,
        sceneId: scene.id,
        scenePosition: scene.scenePosition,
        timestamp: currentTimestamp,
        captionText: scene.narration,
      };

      const res = await fetch('/api/create-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create scene');
      }

      const data = await res.json();
      console.log('✅ Scene creation requested:', data);
      setIsLoadingVideoScenes(true);

      // Note: Don't clear creatingSceneId here - it will be cleared by WebSocket 'preview_completed' message
    } catch (e) {
      console.error('❌ Error creating scene:', e);
      showToasterMessage?.(
        `Failed to create scene: ${
          e instanceof Error ? e.message : 'Unknown error'
        }`,
        'error',
      );
      // Clear creating scene ID on error
      if (setCreatingSceneId) {
        setCreatingSceneId(null);
      }
    }
  };

  const handleSaveImage = async () => {
    if (!generatedImageUrl) {
      console.error('No generated image URL to save');
      return;
    }

    if (scene.id === undefined || scene.id === null) {
      console.error('Scene ID is missing:', scene.id);
      alert('Error: Scene ID is missing');
      return;
    }

    setIsSavingImage(true);
    try {
      // Get timestamp from URL query params
      const timestamp = queryParams.get('timestamp');
      if (!timestamp) {
        throw new Error('No timestamp found in URL');
      }

      console.log('🔍 Timestamp from URL:', timestamp);
      console.log('🔍 Scene ID from scene object:', scene.id);

      const requestPayload = {
        timestamp,
        sceneId: Number(scene.id),
        generatedImageUrl,
        duration: scene.duration,
        inMemoryEditScene: scene.isUserAdded || false,
      };

      console.log('🚀 Sending request payload:', requestPayload);
      console.log('🔍 Scene ID type:', typeof scene.id, 'Value:', scene.id);

      const response = await fetch('/api/save-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save image');
      }

      const result = await response.json();
      console.log('✅ Image saved successfully:', result);

      // Implement logic to replace the original image
      if (generatedImageUrl) {
        setCurrentImageUrl(generatedImageUrl);

        setIsLoadingVideoScenes(true);

        showToasterMessage?.('Image saved', 'success');
      }
    } catch (error) {
      console.error('❌ Error saving image:', error);
      showToasterMessage?.(
        `Failed to save image: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        'error',
      );
    } finally {
      setIsSavingImage(false);
    }
  };

  return (
    <>
      <style jsx>{`
        @keyframes gradientShift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
      `}</style>
      <div className="mb-4">
        {/* Scene Label */}
        <div className="mb-2">
          <h3 className="text-white text-lg font-semibold">
            Scene {displayIndex + 1}
          </h3>
        </div>

        {/* Scene Card */}
        <div
          className={`bg-slate-800/50 border rounded-xl p-2 flex space-x-3 transition-all duration-200 mr-4 relative ${
            isSelected
              ? 'border-[#7552F2] shadow-lg'
              : 'border-slate-700/50 hover:border-slate-600'
          } ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}
          style={{ padding: '2rem' }}
          onClick={() =>
            !isDisabled &&
            !(scene.removed && !scene.isUserAdded) &&
            onSelect &&
            onSelect(scene.id)
          }
        >
          {/* Loading Overlay */}
          {(isRegenerating || (animationRequested && isLoadingVideoScenes)) && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex items-center justify-center z-50">
              <div className="flex flex-col items-center space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent"></div>
                <span className="text-white text-sm font-medium">
                  {isRegenerating
                    ? 'Regenerating Scene, Audio and Captions...'
                    : 'Generating Animation...'}
                </span>
              </div>
            </div>
          )}

          {/* Disabled Overlay */}
          {isDisabled && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm rounded-xl flex items-center justify-center z-40">
              <div className="flex flex-col items-center space-y-2">
                <div className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-red-400"
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
                </div>
                <span className="text-white text-sm font-medium">
                  Scene is being deleted...
                </span>
              </div>
            </div>
          )}

          {/* Removed Overlay - Only for original scenes */}
          {scene.removed && !scene.isUserAdded && (
            <div
              className="absolute inset-0 backdrop-blur-sm rounded-xl z-40"
              style={{ backgroundColor: 'rgba(117, 82, 242, 0.20)' }}
            >
              {/* Revert icon (top-right) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRestoreOriginalScene && onRestoreOriginalScene(scene.id);
                }}
                className="absolute top-2 right-2 z-10 text-purple-500 hover:text-purple-400 hover:bg-purple-500/10 rounded-full p-1.5 transition-all duration-200"
                title="Restore scene"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 10l-4-4m0 0l4-4m-4 4h11a4 4 0 010 8h-1"
                  />
                </svg>
              </button>

              {/* Centered content (message + button) */}
              <div className="absolute inset-0 flex items-center justify-center px-3 text-center">
                <span className="text-white text-sm font-medium">
                  This scene will not be included in the final video
                </span>
              </div>
            </div>
          )}

          {/* Create Scene Loading Overlay */}
          {isCreatingScene && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex items-center justify-center z-50">
              <div className="flex flex-col items-center space-y-3">
                <div
                  className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent"
                  style={{
                    borderColor: 'rgb(99, 102, 241)',
                    borderTopColor: 'transparent',
                  }}
                ></div>
                <span className="text-white text-sm font-medium">
                  Creating Scene...
                </span>
              </div>
            </div>
          )}

          {/* Delete Button for Original Scenes (to mark as removed) */}
          {!scene.isUserAdded && onDeleteScene && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteScene(scene.id);
              }}
              className="absolute top-2 right-2 z-10 text-purple-500 hover:text-purple-400 hover:bg-purple-500/10 rounded-full p-1.5 transition-all duration-200"
              title="Delete Scene"
            >
              <svg
                className="w-4 h-4"
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
          )}

          {/* Delete Button for User-Added Scenes (actually remove) */}
          {scene.isUserAdded && onDeleteUserAddedScene && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteUserAddedScene(scene.id);
              }}
              className="absolute top-2 right-2 z-10 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-full p-1.5 transition-all duration-200"
              title="Delete Scene"
            >
              <svg
                className="w-4 h-4"
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
          )}

          {/* Scene Image */}
          {currentImageUrl ||
          (scene.isUserAdded && scene.placeholderImageUrl) ? (
            <div
              className="flex-shrink-0 rounded-xl overflow-hidden relative group"
              style={{
                width: '7.0rem', // Reduced by 15% more from 8.23rem
                height: 'auto',
              }}
            >
              {scene.animated && (
                <div className="absolute bottom-1 right-1 text-white text-[10px] p-1.5 rounded-md bg-black/60">
                  Animated
                </div>
              )}
              <img
                src={
                  currentImageUrl ||
                  (scene.isUserAdded ? scene.placeholderImageUrl : undefined)
                }
                alt={`Scene ${displayIndex + 1}`}
                className="w-full h-auto object-contain object-top rounded-xl"
                onError={(e) => {
                  // Hide the image if it fails to load
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement!.style.backgroundColor =
                    '#374151';
                }}
              />

              {/* Hover Overlay with Top-Right Icons */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div className="absolute top-1 right-1 flex gap-1 pointer-events-none">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setInitialImageEditTab('edit');
                      setIsImageEditModalOpen(true);
                    }}
                    className="pointer-events-auto bg-black/60 hover:bg-black/70 p-1.5 rounded-md"
                    title="Edit"
                  >
                    <img src="/edit.svg" alt="Edit" className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setInitialImageEditTab('animate');
                      setIsImageEditModalOpen(true);
                    }}
                    className="pointer-events-auto bg-black/60 hover:bg-black/70 p-1.5 rounded-md"
                    title="Animate"
                  >
                    <img src="/animate.svg" alt="Animate" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : scene.isUserAdded ? (
            <div
              className="flex-shrink-0 rounded-xl flex items-center justify-center relative group"
              style={{
                width: '7.0rem', // Reduced by 15% more from 8.23rem
                height: '12.43rem', // Reduced by 15% more from 14.62rem
                backgroundColor: '#374151',
                border: '2px dashed #6B7280',
              }}
            >
              {scene.animated && (
                <div className="absolute bottom-1 right-1 text-white text-[10px] p-1.5 rounded-md bg-black/60">
                  Animated
                </div>
              )}
              <div className="flex flex-col items-center space-y-2 text-gray-400">
                <svg
                  className="w-8 h-8"
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
                <span className="text-xs text-center">No Image</span>
              </div>

              {/* Hover Overlay with Top-Right Icons */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div className="absolute top-1 right-1 flex gap-1 pointer-events-none">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setInitialImageEditTab('edit');
                      setIsImageEditModalOpen(true);
                    }}
                    className="pointer-events-auto bg-black/60 hover:bg-black/70 p-1.5 rounded-md"
                    title="Edit"
                  >
                    <img src="/edit.svg" alt="Edit" className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setInitialImageEditTab('animate');
                      setIsImageEditModalOpen(true);
                    }}
                    className="pointer-events-auto bg-black/60 hover:bg-black/70 p-1.5 rounded-md"
                    title="Animate"
                  >
                    <img src="/animate.svg" alt="Animate" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="flex-shrink-0 rounded-xl flex items-center justify-center"
              style={{
                width: '7.0rem', // Reduced by 15% more from 8.23rem
                height: '12.43rem', // Reduced by 15% more from 14.62rem
                backgroundColor: '#374151',
              }}
            >
              <div className="flex flex-col items-center space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent"></div>
                <span className="text-white text-sm font-medium">
                  Loading...
                </span>
              </div>
            </div>
          )}

          {/* Scene Content */}
          <div className="flex-1 flex flex-col">
            {isEditing ? (
              <div className="space-y-1">
                <div className="relative">
                  <textarea
                    className="w-full h-32 bg-slate-700/50 border border-purple-500/30 rounded-xl text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    style={{
                      padding: '20px 24px 24px 24px',
                    }}
                    value={editedNarration}
                    onChange={(e) => onEditedNarrationChange(e.target.value)}
                    placeholder="Enter scene narration..."
                  />
                </div>
                {/* Duration Badge - positioned below the textarea (only show for saved scenes) */}
                {!scene.isUserAdded && (
                  <div className="flex justify-start mb-2">
                    <div className="bg-transparent text-white text-xs rounded-md px-2 py-1 flex items-center gap-1">
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span>{scene.duration}s</span>
                    </div>
                  </div>
                )}
                <div className="flex justify-end space-x-3">
                  {scene.isUserAdded ? (
                    /* OK button for user-added scenes */
                    <button
                      onClick={() => onSaveEdit(scene.id)}
                      className="flex items-center justify-center gap-2 px-3 py-2 text-white rounded-lg text-sm font-medium transition-colors hover:brightness-95"
                      style={{ backgroundColor: 'rgb(99, 102, 241)' }}
                      title="Save changes"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span>Save</span>
                    </button>
                  ) : (
                    /* Generate Audio/Caption button for original scenes */
                    <button
                      onClick={() =>
                        onRegenerateAudio && onRegenerateAudio(scene.id)
                      }
                      className="flex items-center justify-center gap-2 px-3 py-2 text-white rounded-lg text-sm font-medium transition-colors hover:brightness-95"
                      style={{ backgroundColor: '#6366F1' }}
                      title="Generate audio and captions"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      <span>Regenerate</span>
                    </button>
                  )}
                  <button
                    onClick={onCancelEdit}
                    className="flex items-center justify-center gap-2.5 h-10 px-6 rounded-xl border-[1.5px] border-[#5B5BFF] text-white hover:text-white hover:bg-[#5B5BFF] text-sm font-medium transition-all duration-300"
                    style={{
                      boxShadow: '0 4px 16px 0 rgba(100, 0, 160, 0.35)',
                    }}
                  >
                    <svg
                      className="w-4 h-4"
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
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="relative">
                  <div
                    className="w-full h-32 bg-slate-700/50 rounded-xl pt-5 pr-6 pb-6 pl-6 text-white mb-2 cursor-pointer"
                    style={{
                      fontFamily: 'inherit',
                      fontFeatureSettings: 'inherit',
                      fontVariationSettings: 'inherit',
                      fontSize: '16px',
                      fontWeight: 'inherit',
                    }}
                    onDoubleClick={() => onEditScene(scene.id, scene.narration)}
                  >
                    <p
                      className="text-white text-sm leading-relaxed"
                      style={{ fontSize: '16px' }}
                    >
                      {scene.narration || 'Enter scene narration...'}
                    </p>
                  </div>
                </div>
                {/* Duration Badge - positioned below the text area (only show for saved scenes) */}
                {!scene.isUserAdded && (
                  <div className="flex justify-start mb-2">
                    <div className="bg-transparent text-white text-xs rounded-md px-2 py-1 flex items-center gap-1">
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span>{scene.duration}s</span>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 items-center">
                  {/* Empty space for left alignment */}
                  <div></div>

                  {/* AI Animation Button - Center Aligned */}
                  <div className="flex justify-center">
                    {scene.isUserAdded ? (
                      /* Create Scene Button for user-added scenes */
                      <button
                        onClick={handleCreateScene}
                        disabled={isCreatingScene || !canCreateScene}
                        className={`relative flex items-center justify-center gap-2.5 h-10 px-6 rounded-xl text-white text-sm font-medium transition-all duration-300 overflow-hidden ${
                          isCreatingScene || !canCreateScene
                            ? 'bg-gray-500 cursor-not-allowed'
                            : 'hover:brightness-95'
                        }`}
                        style={
                          isCreatingScene || !canCreateScene
                            ? undefined
                            : { backgroundColor: 'rgb(99, 102, 241)' }
                        }
                        title={
                          isCreatingScene
                            ? 'Creating scene...'
                            : !hasValidNarration
                            ? 'Please add narration text'
                            : !hasValidImage
                            ? 'Please select an image'
                            : !isUnderSceneLimit
                            ? 'Maximum 20 scenes allowed'
                            : 'Create scene with current image and narration'
                        }
                      >
                        {isCreatingScene ? (
                          <>
                            <div
                              className="animate-spin rounded-full h-4 w-4 border-2 border-t-transparent"
                              style={{
                                borderColor: 'rgb(99, 102, 241)',
                                borderTopColor: 'transparent',
                              }}
                            ></div>
                            <span>Creating...</span>
                          </>
                        ) : (
                          <>
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                            <span>Create New Scene</span>
                          </>
                        )}
                      </button>
                    ) : null}
                  </div>

                  {/* Edit Button - Right Aligned */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => onEditScene(scene.id, scene.narration)}
                      className="flex items-center justify-center gap-2.5 h-10 px-6 rounded-xl border-[1.5px] border-[#5B5BFF] text-white hover:text-white hover:bg-[#5B5BFF] text-sm font-medium transition-all duration-300"
                      style={{
                        boxShadow: '0 4px 16px 0 rgba(100, 0, 160, 0.35)',
                      }}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Image Edit Modal */}
        <ImageEditModal
          isOpen={isImageEditModalOpen}
          onClose={() => setIsImageEditModalOpen(false)}
          imageUrl={imageUrl}
          displayIndex={displayIndex}
          initialTab={initialImageEditTab}
          onGenerateImage={handleGenerateImageFromModal}
          onAnimateImage={handleAnimateImageFromModal}
          onSaveImage={handleSaveImage}
          isGeneratingImage={isGeneratingImage}
          isAnimatingImage={isAnimatingImage}
          isSavingImage={isSavingImage}
          generatedImageUrl={generatedImageUrl}
          validationErrors={{ image: false }}
          onClearValidationError={() => {}}
        />
      </div>
    </>
  );
}
