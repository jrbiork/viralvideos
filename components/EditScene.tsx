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
  setIsLoadingVideoScenes: (value: boolean) => void;
  timestamp?: string;
  onDeleteScene?: (sceneId: number) => void;
  onDeleteUserAddedScene?: (sceneId: number) => void;
  onRestoreOriginalScene?: (sceneId: number) => void;
  displayIndex?: number; // The sequential display index for this scene
  totalScenesCount?: number; // Total number of scenes (original + additional)
  isDisabled?: boolean; // Whether the scene is disabled (e.g., during deletion)
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
  setIsLoadingVideoScenes,
  timestamp,
  onDeleteScene,
  onDeleteUserAddedScene,
  onRestoreOriginalScene,
  displayIndex = 0,
  totalScenesCount = 0,
  isDisabled = false,
}: EditSceneProps) {
  const urlTest =
    'https://wallpaper.forfun.com/fetch/19/19549495ffb40723d19982e9961041d9.jpeg?h=1200&r=0.5';

  const urlTest2 =
    'https://dnznrvs05pmza.cloudfront.net/032af1ac-2cbe-4841-a689-032f0d05780e.png?_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlIYXNoIjoiNzMzMTM4Mjc4N2ViMjdmNyIsImJ1Y2tldCI6InJ1bndheS10YXNrLWFydGlmYWN0cyIsInN0YWdlIjoicHJvZCIsImV4cCI6MTc1Njk0NDAwMH0.HIbTLZ8moLkowSj28Vb-rMxnfM108JexJFafmfp_qgM';

  const urlTest3 =
    'https://wallpaper.forfun.com/fetch/b4/b4998cef88539ca8075898078e52ece0.jpeg?h=1200&r=0.5';

  const [isImageEditModalOpen, setIsImageEditModalOpen] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>();
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(
    imageUrl || null,
  );
  const [isAiAnimationModalOpen, setIsAiAnimationModalOpen] = useState(false);
  const [animationPrompt, setAnimationPrompt] = useState('');
  const [animationDuration, setAnimationDuration] = useState('5s');
  const [validationErrors, setValidationErrors] = useState({ image: false });

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
      alert(
        `Failed to create scene: ${
          e instanceof Error ? e.message : 'Unknown error'
        }`,
      );
      // Clear creating scene ID on error
      if (setCreatingSceneId) {
        setCreatingSceneId(null);
      }
    }
  };

  const handleAnimation = async () => {
    try {
      const timestamp = queryParams.get('timestamp');
      if (!timestamp) throw new Error('No timestamp found in URL');
      if (!currentImageUrl && !imageUrl)
        throw new Error('No image available to animate');

      const payload = {
        animationPrompt,
        animationDuration,
        timestamp,
        sceneId: Number(scene.id),
        imageUrl: currentImageUrl || imageUrl!,
      };

      const res = await fetch('/api/animate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to request animation');
      }

      const data = await res.json();
      console.log('✅ Animation requested:', data);
      setIsAiAnimationModalOpen(false);
      setIsLoadingVideoScenes(true);
    } catch (e) {
      console.error('❌ Error requesting animation:', e);
      alert(
        `Failed to request animation: ${
          e instanceof Error ? e.message : 'Unknown error'
        }`,
      );
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

        // set isLoadingVideoScenes to true
        setIsLoadingVideoScenes(true);

        // close the image edit modal
        setIsImageEditModalOpen(false);
      }
      // alert(
      //   'Image saved successfully! The new image will be used for this scene.',
      // );
    } catch (error) {
      console.error('❌ Error saving image:', error);
      alert(
        `Failed to save image: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
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
              ? 'border-purple-500 shadow-lg shadow-purple-500/25'
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
          {isRegenerating && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex items-center justify-center z-50">
              <div className="flex flex-col items-center space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent"></div>
                <span className="text-white text-sm font-medium">
                  Regenerating Scene, Audio and Captions...
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
            <div className="absolute inset-0 bg-gray-500/60 backdrop-blur-sm rounded-xl flex items-center justify-center z-40">
              <div className="flex flex-col items-center space-y-3">
                <div className="w-8 h-8 bg-gray-500/30 rounded-full flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-gray-200"
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
                  Scene removed
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestoreOriginalScene && onRestoreOriginalScene(scene.id);
                  }}
                  className="px-3 py-1.5 rounded-md bg-white/90 text-slate-900 text-xs font-semibold hover:bg-white transition-colors shadow"
                >
                  Restore scene
                </button>
              </div>
            </div>
          )}

          {/* Create Scene Loading Overlay */}
          {isCreatingScene && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex items-center justify-center z-50">
              <div className="flex flex-col items-center space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent"></div>
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

              {/* Hover Overlay with Edit Icon */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsImageEditModalOpen(true);
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full transition-colors duration-200"
                  title="Edit Image"
                >
                  <svg
                    className="w-5 h-5"
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
                </button>
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

              {/* Hover Overlay with Edit Icon */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsImageEditModalOpen(true);
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full transition-colors duration-200"
                  title="Edit Image"
                >
                  <svg
                    className="w-5 h-5"
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
                </button>
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
                <div className="relative mb-2">
                  <div className="absolute top-3 left-3 w-6 h-6 bg-purple-600 rounded flex items-center justify-center m-2">
                    <span className="text-white text-sm font-bold">T</span>
                  </div>
                  <textarea
                    className="w-full h-32 bg-slate-700/50 border border-purple-500/30 rounded-xl text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    style={{
                      margin: '8px 0 16px',
                      padding: '20px 24px 24px 64px',
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
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
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
                      <span>Save Caption</span>
                    </button>
                  ) : (
                    /* Generate Audio/Caption button for original scenes */
                    <button
                      onClick={() =>
                        onRegenerateAudio && onRegenerateAudio(scene.id)
                      }
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
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
                      <span>Regenerate Scene</span>
                    </button>
                  )}
                  <button
                    onClick={onCancelEdit}
                    className="flex items-center justify-center gap-2.5 h-10 px-6 rounded-xl border-[1.5px] border-[#5B5BFF] text-[#5B5BFF] hover:text-white hover:bg-[#5B5BFF] text-sm font-medium transition-all duration-300"
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
                  <div className="absolute top-3 left-3 w-6 h-6 bg-purple-600 rounded flex items-center justify-center m-2">
                    <span className="text-white text-sm font-bold">T</span>
                  </div>
                  <div
                    className="w-full h-32 bg-slate-700/50 border border-purple-500/30 rounded-xl pt-5 pr-6 pb-6 pl-16 text-white mt-2 mb-4 cursor-pointer"
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
                            : 'bg-green-600 hover:bg-green-700'
                        }`}
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
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
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
                            <span>Create Scene</span>
                          </>
                        )}
                      </button>
                    ) : (
                      /* AI Animation Button for original scenes */
                      <button
                        onClick={() => {
                          setIsAiAnimationModalOpen(true);
                        }}
                        className="relative flex items-center justify-center gap-2.5 h-10 px-6 rounded-xl text-white text-sm font-medium transition-all duration-300 overflow-hidden"
                        style={{
                          background:
                            'linear-gradient(45deg, #5B5BFF, #8B5CF6, #EC4899, #F59E0B, #5B5BFF)',
                          backgroundSize: '300% 300%',
                          animation: 'gradientShift 3s ease infinite',
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
                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        <span>AI Animation</span>
                      </button>
                    )}
                  </div>

                  {/* Edit Button - Right Aligned */}
                  <div className="flex justify-end">
                    <button
                      onClick={() => onEditScene(scene.id, scene.narration)}
                      className="flex items-center justify-center gap-2.5 h-10 px-6 rounded-xl border-[1.5px] border-[#5B5BFF] text-[#5B5BFF] hover:text-white hover:bg-[#5B5BFF] text-sm font-medium transition-all duration-300"
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
          onGenerateImage={async (prompt: string) => {
            setIsGeneratingImage(true);
            try {
              // Call the generate-image API endpoint
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
                alert(
                  `Failed to generate image: ${
                    errorData.error || 'Unknown error'
                  }`,
                );
              }
            } catch (error) {
              console.error('Error calling generate-image API:', error);
              alert('Failed to generate image. Please try again.');
            } finally {
              setIsGeneratingImage(false);
            }
          }}
          onSaveImage={handleSaveImage}
          isGeneratingImage={isGeneratingImage}
          isSavingImage={isSavingImage}
          generatedImageUrl={generatedImageUrl}
          validationErrors={{ image: false }}
          onClearValidationError={() => {}}
        />

        {/* AI Animation Modal */}
        {isAiAnimationModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-2xl p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">AI Animation</h2>
                <button
                  onClick={() => setIsAiAnimationModalOpen(false)}
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
                  <h3 className="text-lg font-semibold text-white">
                    Current Image
                  </h3>
                  <div className="aspect-[9/16] rounded-lg overflow-hidden bg-slate-700">
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
                      className={`w-full py-3 px-6 rounded-lg font-medium transition-colors ${'bg-purple-600 hover:bg-purple-700 text-white'}`}
                    >
                      Generate Animation (
                      {animationDuration === '5s' ? '25' : '50'} credits)
                    </button>
                  </div>
                </div>

                {/* Right Side - Example Video */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">
                    Output Example
                  </h3>
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
        )}
      </div>
    </>
  );
}
