import React, { useState } from 'react';

interface Scene {
  id: number;
  description: string;
  narration: string;
  duration: number;
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
  setIsLoadingVideoScenes: (value: boolean) => void;
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
  setIsLoadingVideoScenes,
}: EditSceneProps) {
  const urlTest =
    'https://wallpaper.forfun.com/fetch/19/19549495ffb40723d19982e9961041d9.jpeg?h=1200&r=0.5';

  const urlTest2 =
    'https://dnznrvs05pmza.cloudfront.net/032af1ac-2cbe-4841-a689-032f0d05780e.png?_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlIYXNoIjoiNzMzMTM4Mjc4N2ViMjdmNyIsImJ1Y2tldCI6InJ1bndheS10YXNrLWFydGlmYWN0cyIsInN0YWdlIjoicHJvZCIsImV4cCI6MTc1Njk0NDAwMH0.HIbTLZ8moLkowSj28Vb-rMxnfM108JexJFafmfp_qgM';

  const urlTest3 =
    'https://wallpaper.forfun.com/fetch/b4/b4998cef88539ca8075898078e52ece0.jpeg?h=1200&r=0.5';

  const [isImageEditModalOpen, setIsImageEditModalOpen] = useState(false);
  const [newImagePrompt, setNewImagePrompt] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>();
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(
    imageUrl || null,
  );

  React.useEffect(() => {
    setCurrentImageUrl(imageUrl || null);
  }, [imageUrl]);

  const queryParams = new URLSearchParams(window.location.search);

  const isEditing = editingScene === scene.id;
  const isRegenerating = regeneratingSceneId === scene.id;

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
    <div className="mb-4">
      {/* Scene Label */}
      <div className="mb-2">
        <h3 className="text-white text-lg font-semibold">
          Scene {scene.id + 1}
        </h3>
      </div>

      {/* Scene Card */}
      <div
        className={`bg-slate-800/50 border rounded-xl p-2 flex space-x-3 cursor-pointer transition-all duration-200 mr-4 relative ${
          isSelected
            ? 'border-purple-500 shadow-lg shadow-purple-500/25'
            : 'border-slate-700/50 hover:border-slate-600'
        }`}
        style={{ padding: '2rem' }}
        onClick={() => onSelect && onSelect(scene.id)}
      >
        {/* Loading Overlay */}
        {isRegenerating && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex items-center justify-center z-50">
            <div className="flex flex-col items-center space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent"></div>
              <span className="text-white text-sm font-medium">
                Generating Audio and Captions...
              </span>
            </div>
          </div>
        )}

        {/* Scene Image */}
        {currentImageUrl ? (
          <div
            className="flex-shrink-0 rounded-xl overflow-hidden relative group"
            style={{
              width: '7.0rem', // Reduced by 15% more from 8.23rem
              height: '12.43rem', // Reduced by 15% more from 14.62rem
            }}
          >
            <img
              src={currentImageUrl}
              alt={`Scene ${scene.id + 1}`}
              className="w-full h-full object-contain rounded-xl"
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
              <span className="text-white text-sm font-medium">Loading...</span>
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
                  className="w-full h-32 bg-slate-700/50 border border-purple-500/30 rounded-xl p-4 pl-16 text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  value={editedNarration}
                  onChange={(e) => onEditedNarrationChange(e.target.value)}
                  placeholder="Enter scene narration..."
                />
              </div>
              <div className="flex justify-end space-x-3">
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
                  <span>Generate Audio/Caption</span>
                </button>
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
                <div className="w-full min-h-28 bg-slate-700/50 border border-purple-500/30 rounded-xl p-1 pl-8 pb-4 text-white my-2">
                  <p className="text-white text-sm leading-relaxed">
                    {scene.narration}
                  </p>
                </div>
              </div>
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
          )}
        </div>
      </div>

      {/* Image Edit Modal */}
      {isImageEditModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-2xl p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">Edit Image</h2>
              <button
                onClick={() => setIsImageEditModalOpen(false)}
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
                    src={imageUrl}
                    alt={`Scene ${scene.id + 1}`}
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
                    onClick={async () => {
                      if (!newImagePrompt.trim()) {
                        alert('Please enter a prompt for the new image');
                        return;
                      }

                      setIsGeneratingImage(true);
                      try {
                        // Call the generate-image API endpoint
                        const response = await fetch('/api/generate-image', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            imagePrompt: newImagePrompt,
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
                        console.error(
                          'Error calling generate-image API:',
                          error,
                        );
                        alert('Failed to generate image. Please try again.');
                      } finally {
                        setIsGeneratingImage(false);
                      }
                    }}
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
                  {
                    <button
                      onClick={handleSaveImage}
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
                  }
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
      )}
    </div>
  );
}
