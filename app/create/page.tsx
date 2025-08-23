'use client';

import { useState, useEffect, useReducer } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import VideoPreview from '../../components/VideoPreview';
import MainLayout from '../../components/MainLayout';
import { useAuthenticatedFetch } from '../../components/useAuthenticatedFetch';
import ProgressSteps from '../../components/ProgressSteps';
import VideoCreator from '../../components/VideoCreator';
import EditScene from '../../components/EditScene';
import EditSceneSkeleton from '../../components/EditSceneSkeleton';
import ExportVideo from '../../components/ExportVideo';
import { parseAssFile, parseColoredText } from '../../lib/subtitle-utils';

// Define the state interface
interface CreatePageState {
  isGenerating: boolean;
  generatedVideoUrl: string | null;
  selectedGalleryVideo: any;
  generationStatus: 'idle' | 'queued' | 'processing' | 'completed' | 'error';
  statusMessage: string;
  currentStep: number;
  scriptData: any;
  editingScene: number | null;
  editedNarration: string;
  isExporting: boolean;
  isLoadingScript: boolean;
  hasStartedProcess: boolean;
  pollingCount: number;
  currentTimestamp: string;
  mediaFiles: { [key: string]: string };
  assFiles: { [key: string]: string };
  selectedSceneId: number | null;
  autoAdvanceEnabled: boolean;
  currentSubtitle: string;
}

// Define action types
type CreatePageAction =
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'SET_GENERATED_VIDEO_URL'; payload: string | null }
  | { type: 'SET_SELECTED_GALLERY_VIDEO'; payload: any }
  | {
      type: 'SET_GENERATION_STATUS';
      payload: 'idle' | 'queued' | 'processing' | 'completed' | 'error';
    }
  | { type: 'SET_STATUS_MESSAGE'; payload: string }
  | { type: 'SET_CURRENT_STEP'; payload: number }
  | { type: 'SET_SCRIPT_DATA'; payload: any }
  | { type: 'SET_EDITING_SCENE'; payload: number | null }
  | { type: 'SET_EDITED_NARRATION'; payload: string }
  | { type: 'SET_EXPORTING'; payload: boolean }
  | { type: 'SET_LOADING_SCRIPT'; payload: boolean }
  | { type: 'SET_HAS_STARTED_PROCESS'; payload: boolean }
  | { type: 'SET_POLLING_COUNT'; payload: number }
  | { type: 'SET_CURRENT_TIMESTAMP'; payload: string }
  | { type: 'SET_MEDIA_FILES'; payload: { [key: string]: string } }
  | { type: 'SET_ASS_FILES'; payload: { [key: string]: string } }
  | { type: 'SET_SELECTED_SCENE_ID'; payload: number | null }
  | { type: 'SET_AUTO_ADVANCE_ENABLED'; payload: boolean }
  | { type: 'SET_CURRENT_SUBTITLE'; payload: string }
  | { type: 'INCREMENT_POLLING_COUNT' }
  | { type: 'RESET_STATE' };

// Initial state
const initialState: CreatePageState = {
  isGenerating: false,
  generatedVideoUrl: null,
  selectedGalleryVideo: null,
  generationStatus: 'idle',
  statusMessage: '',
  currentStep: 1,
  scriptData: null,
  editingScene: null,
  editedNarration: '',
  isExporting: false,
  isLoadingScript: false,
  hasStartedProcess: false,
  pollingCount: 0,
  currentTimestamp: '',
  mediaFiles: {},
  assFiles: {},
  selectedSceneId: null,
  autoAdvanceEnabled: false,
  currentSubtitle: '',
};

// Reducer function
function createPageReducer(
  state: CreatePageState,
  action: CreatePageAction,
): CreatePageState {
  switch (action.type) {
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.payload };
    case 'SET_GENERATED_VIDEO_URL':
      return { ...state, generatedVideoUrl: action.payload };
    case 'SET_SELECTED_GALLERY_VIDEO':
      return { ...state, selectedGalleryVideo: action.payload };
    case 'SET_GENERATION_STATUS':
      return { ...state, generationStatus: action.payload };
    case 'SET_STATUS_MESSAGE':
      return { ...state, statusMessage: action.payload };
    case 'SET_CURRENT_STEP':
      return { ...state, currentStep: action.payload };
    case 'SET_SCRIPT_DATA':
      return { ...state, scriptData: action.payload };
    case 'SET_EDITING_SCENE':
      return { ...state, editingScene: action.payload };
    case 'SET_EDITED_NARRATION':
      return { ...state, editedNarration: action.payload };
    case 'SET_EXPORTING':
      return { ...state, isExporting: action.payload };
    case 'SET_LOADING_SCRIPT':
      return { ...state, isLoadingScript: action.payload };
    case 'SET_HAS_STARTED_PROCESS':
      return { ...state, hasStartedProcess: action.payload };
    case 'SET_POLLING_COUNT':
      return { ...state, pollingCount: action.payload };
    case 'SET_CURRENT_TIMESTAMP':
      return { ...state, currentTimestamp: action.payload };
    case 'SET_MEDIA_FILES':
      return { ...state, mediaFiles: action.payload };
    case 'SET_ASS_FILES':
      return { ...state, assFiles: action.payload };
    case 'SET_SELECTED_SCENE_ID':
      return { ...state, selectedSceneId: action.payload };
    case 'SET_AUTO_ADVANCE_ENABLED':
      return { ...state, autoAdvanceEnabled: action.payload };
    case 'SET_CURRENT_SUBTITLE':
      return { ...state, currentSubtitle: action.payload };
    case 'INCREMENT_POLLING_COUNT':
      return { ...state, pollingCount: state.pollingCount + 1 };
    case 'RESET_STATE':
      return initialState;
    default:
      return state;
  }
}

export default function GeneratePage() {
  const router = useRouter();
  const [state, dispatch] = useReducer(createPageReducer, initialState);
  const { authenticatedFetch, isAuthenticated, user } = useAuthenticatedFetch();

  // Example video URL
  const exampleVideoUrl = '/assets/example.mp4';

  const fetchPreviewData = async (timestamp?: string): Promise<boolean> => {
    // Only set loading true on the first fetch
    if (state.pollingCount === 0) {
      dispatch({ type: 'SET_LOADING_SCRIPT', payload: true });
    }

    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (timestamp) {
        params.append('timestamp', timestamp);
      }

      const data = await authenticatedFetch(
        `/api/fetch-data-preview?${params.toString()}`,
      );

      // Check if we have script data
      if (data.script) {
        dispatch({ type: 'SET_SCRIPT_DATA', payload: data.script });

        // Store media files
        if (data.mediaFiles) {
          dispatch({ type: 'SET_MEDIA_FILES', payload: data.mediaFiles });
        }

        // Store ASS files
        if (data.assFiles) {
          dispatch({ type: 'SET_ASS_FILES', payload: data.assFiles });
        }

        // Check if we have all MP4 scenes with signed URLs
        const expectedScenes = data.script.scenes?.length || 0;
        const mp4Files = Object.keys(data.mediaFiles || {}).filter((key) =>
          key.endsWith('.mp4'),
        );

        console.log(
          `Found ${mp4Files.length} MP4 files out of ${expectedScenes} expected scenes`,
        );
        console.log('Script data received:', data.script);
        console.log('Media files received:', data.mediaFiles);

        if (mp4Files.length >= expectedScenes && expectedScenes > 0) {
          // All MP4 scenes are ready
          dispatch({ type: 'SET_LOADING_SCRIPT', payload: false });
          console.log('✅ All MP4 scenes have signed URLs, stopping polling');
          return true; // Indicate success
        } else {
          // Still waiting for MP4 files
          console.log(
            `Waiting for MP4 files. Polling attempt ${state.pollingCount + 1}`,
          );
          return false; // Continue polling
        }
      } else {
        // No script found yet
        console.log(
          `No script found yet. Polling attempt ${state.pollingCount + 1}`,
        );
        return false; // Indicate no data yet
      }
    } catch (error) {
      console.error('Error fetching preview data:', error);
      // Only set error and stop loading on actual errors, not when data is not ready
      if (state.pollingCount === 0) {
        dispatch({ type: 'SET_LOADING_SCRIPT', payload: false });
      }
      return false; // Indicate failure
    }
  };

  // Polling mechanism
  const startPolling = async (timestamp: string) => {
    dispatch({ type: 'SET_CURRENT_TIMESTAMP', payload: timestamp });
    dispatch({ type: 'SET_POLLING_COUNT', payload: 0 });
    dispatch({ type: 'SET_LOADING_SCRIPT', payload: true }); // Set loading immediately when polling starts

    const pollInterval = setInterval(async () => {
      dispatch({ type: 'INCREMENT_POLLING_COUNT' });
      const success = await fetchPreviewData(timestamp);

      if (success) {
        clearInterval(pollInterval);
        console.log('Script found! Stopping polling.');
      }
    }, 5000); // Poll every 5 seconds

    // Store the interval ID for cleanup
    return pollInterval;
  };

  // Auto-select first scene when script data is loaded
  useEffect(() => {
    if (
      state.scriptData &&
      state.scriptData.scenes &&
      state.scriptData.scenes.length > 0 &&
      state.selectedSceneId === null
    ) {
      dispatch({
        type: 'SET_SELECTED_SCENE_ID',
        payload: state.scriptData.scenes[0].id,
      });
    }
  }, [state.scriptData, state.selectedSceneId]);

  // Auto-play video when selectedSceneId changes (only if auto-advance is enabled)
  useEffect(() => {
    if (
      state.selectedSceneId !== null &&
      state.scriptData &&
      state.scriptData.scenes &&
      state.autoAdvanceEnabled
    ) {
      const selectedSceneIndex = state.scriptData.scenes.findIndex(
        (s: any) => s.id === state.selectedSceneId,
      );

      if (selectedSceneIndex !== -1) {
        // Stop all videos first
        const allVideos = document.querySelectorAll('video');
        allVideos.forEach((video) => {
          video.pause();
          video.currentTime = 0;
        });

        // Start the selected video after a short delay
        setTimeout(() => {
          const videoKey = `${state.currentTimestamp}.scene-${selectedSceneIndex}.mp4`;
          const videoElement = document.querySelector(
            `video[src*="${videoKey}"]`,
          ) as HTMLVideoElement;
          if (videoElement) {
            videoElement.play().catch(console.error);
          }
        }, 300);
      }
    }
  }, [
    state.selectedSceneId,
    state.scriptData,
    state.currentTimestamp,
    state.autoAdvanceEnabled,
  ]);

  // Handle URL query parameters for step and timestamp
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const timestampFromUrl = urlParams.get('timestamp');
    const stepFromUrl = urlParams.get('step');

    // Set step from URL if provided
    if (stepFromUrl) {
      const stepNumber = parseInt(stepFromUrl);
      if (stepNumber >= 1 && stepNumber <= 3) {
        dispatch({ type: 'SET_CURRENT_STEP', payload: stepNumber });
      }
    }

    // Handle timestamp and polling
    if (timestampFromUrl) {
      // Always set the timestamp from URL
      dispatch({ type: 'SET_CURRENT_TIMESTAMP', payload: timestampFromUrl });

      // If step=2 is specified and we don't have script data yet, start polling immediately
      if (stepFromUrl === '2' && !state.scriptData) {
        startPolling(timestampFromUrl);
      }
    }

    return () => {
      // Any cleanup needed for polling
    };
  }, [state.currentTimestamp, state.scriptData]);

  // Reset subtitle when selected scene changes
  useEffect(() => {
    dispatch({ type: 'SET_CURRENT_SUBTITLE', payload: '' });
  }, [state.selectedSceneId]);

  const handleGenerateVideo = async (script: string, duration: number) => {
    if (!isAuthenticated) return;

    dispatch({ type: 'SET_HAS_STARTED_PROCESS', payload: true });
    dispatch({ type: 'SET_GENERATING', payload: true });
    dispatch({ type: 'SET_GENERATED_VIDEO_URL', payload: null });
    dispatch({ type: 'SET_GENERATION_STATUS', payload: 'queued' });
    dispatch({
      type: 'SET_STATUS_MESSAGE',
      payload: 'Queuing video generation request...',
    });

    try {
      const timestamp = '1004'; // format(new Date(), 'MMddyyHHmmss');
      const data = await authenticatedFetch('/api/generate-video', {
        method: 'POST',
        body: {
          prompt: script,
          timestamp,
          totalDuration: duration,
          sceneCount: duration === 60 || duration === 30 ? 6 : 3,
        },
      });

      dispatch({ type: 'SET_GENERATION_STATUS', payload: 'processing' });
      dispatch({
        type: 'SET_STATUS_MESSAGE',
        payload: 'Video is being generated... This may take a few minutes.',
      });

      // Simulate completion and transition to step 2

      dispatch({ type: 'SET_GENERATION_STATUS', payload: 'completed' });
      dispatch({
        type: 'SET_STATUS_MESSAGE',
        payload: 'Video generated successfully!',
      });

      // Update URL with timestamp query parameter
      const url = new URL(window.location.href);
      url.searchParams.set('timestamp', timestamp);
      window.history.replaceState({}, '', url.toString());

      dispatch({ type: 'SET_CURRENT_STEP', payload: 2 });

      // Start polling for the specific script file
      await startPolling(timestamp);
    } catch (error) {
      console.error('Error queuing video generation:', error);
      dispatch({ type: 'SET_GENERATION_STATUS', payload: 'error' });
      dispatch({
        type: 'SET_STATUS_MESSAGE',
        payload: 'Failed to queue video generation. Please try again.',
      });
      alert('Failed to queue video generation. Please try again.');
    } finally {
      dispatch({ type: 'SET_GENERATING', payload: false });
    }
  };

  const handleGenerateScript = async (prompt: string) => {
    // This function is now handled by the VideoCreator component
    console.log('Script generated:', prompt);
  };

  const handleEditScene = (sceneId: number, narration: string) => {
    dispatch({ type: 'SET_EDITING_SCENE', payload: sceneId });
    dispatch({ type: 'SET_EDITED_NARRATION', payload: narration });
  };

  const handleSaveEdit = (sceneId: number) => {
    if (state.scriptData) {
      const updatedScenes = state.scriptData.scenes.map((scene: any) =>
        scene.id === sceneId
          ? { ...scene, narration: state.editedNarration }
          : scene,
      );
      dispatch({
        type: 'SET_SCRIPT_DATA',
        payload: { ...state.scriptData, scenes: updatedScenes },
      });
      dispatch({ type: 'SET_EDITING_SCENE', payload: null });
      dispatch({ type: 'SET_EDITED_NARRATION', payload: '' });
    }
  };

  const handleCancelEdit = () => {
    dispatch({ type: 'SET_EDITING_SCENE', payload: null });
    dispatch({ type: 'SET_EDITED_NARRATION', payload: '' });
  };

  const handleUpdatePreview = () => {
    // TODO: Implement preview update logic
    console.log('Updating preview with edited scenes:', state.scriptData);
    // Transition to step 3
    dispatch({ type: 'SET_CURRENT_STEP', payload: 3 });
  };

  const handleExportVideo = () => {
    dispatch({ type: 'SET_EXPORTING', payload: true });
    // TODO: Implement actual export logic
    setTimeout(() => {
      dispatch({ type: 'SET_EXPORTING', payload: false });
      console.log('Video exported successfully!');
      // Could redirect to a success page or show download link
    }, 2000);
  };

  const handleNextStep = () => {
    if (state.scriptData) {
      dispatch({ type: 'SET_CURRENT_STEP', payload: 2 });
    } else {
      // If no script data, start polling with the current timestamp
      if (state.currentTimestamp) {
        dispatch({ type: 'SET_CURRENT_STEP', payload: 2 });
        startPolling(state.currentTimestamp);
      } else {
        // Fallback: try to fetch without timestamp
        fetchPreviewData().then(() => {
          dispatch({ type: 'SET_CURRENT_STEP', payload: 2 });
        });
      }
    }
  };

  // Wrapper function to handle scene selection
  const handleSceneSelection = (sceneId: number) => {
    dispatch({ type: 'SET_SELECTED_SCENE_ID', payload: sceneId });
  };

  // Right sidebar content
  const rightSidebarContent = (
    <div className="sticky top-4 p-[50px]">
      {state.currentStep === 1 &&
        !state.generatedVideoUrl &&
        !state.selectedGalleryVideo && (
          <div className="flex justify-center">
            <video
              className="rounded-xl shadow-lg border-2 border-gray-600"
              style={{ width: '80%', height: 'auto' }}
              controls
              autoPlay
              muted
              loop
              src={exampleVideoUrl}
            />
          </div>
        )}

      {state.currentStep === 2 &&
        state.scriptData &&
        state.scriptData.scenes && (
          <>
            {state.scriptData.scenes.map((scene: any, index: number) => {
              const videoKey = `${state.currentTimestamp}.scene-${index}.mp4`;
              const assKey = `${state.currentTimestamp}.scene-${index}.ass`;
              const isVisible = state.selectedSceneId === scene.id;

              // Find the correct index for the selected scene
              const selectedSceneIndex = state.scriptData.scenes.findIndex(
                (s: any) => s.id === state.selectedSceneId,
              );
              const isVisibleByIndex = index === selectedSceneIndex;

              return (
                <div
                  key={scene.id}
                  className={isVisibleByIndex ? 'block' : 'hidden'}
                >
                  {state.mediaFiles[videoKey] && (
                    <div className="relative flex justify-center">
                      <video
                        ref={(videoRef) => {
                          if (videoRef && !videoRef.dataset.initialized) {
                            // Mark as initialized to prevent multiple event listener setup
                            videoRef.dataset.initialized = 'true';

                            // Parse subtitles for this scene
                            const assContent = state.assFiles[assKey];
                            const subtitles = assContent
                              ? parseAssFile(assContent)
                              : [];

                            const updateSubtitle = () => {
                              const currentTime = videoRef.currentTime;
                              const currentSub = subtitles.find(
                                (sub) =>
                                  currentTime >= sub.start &&
                                  currentTime <= sub.end,
                              );
                              dispatch({
                                type: 'SET_CURRENT_SUBTITLE',
                                payload: currentSub
                                  ? currentSub.coloredText
                                  : '',
                              });
                            };

                            // Add event listeners only once
                            videoRef.addEventListener('play', () => {
                              // Enable auto-advance when user manually plays a video
                              if (!state.autoAdvanceEnabled) {
                                dispatch({
                                  type: 'SET_AUTO_ADVANCE_ENABLED',
                                  payload: true,
                                });
                              }

                              const audioElement = document.getElementById(
                                `audio-${scene.id}`,
                              ) as HTMLAudioElement;
                              if (audioElement) {
                                audioElement.currentTime = videoRef.currentTime;
                                audioElement.play();
                              }
                            });
                            videoRef.addEventListener('pause', () => {
                              const audioElement = document.getElementById(
                                `audio-${scene.id}`,
                              ) as HTMLAudioElement;
                              if (audioElement) {
                                audioElement.pause();
                              }
                            });
                            videoRef.addEventListener('seeked', () => {
                              const audioElement = document.getElementById(
                                `audio-${scene.id}`,
                              ) as HTMLAudioElement;
                              if (audioElement) {
                                audioElement.currentTime = videoRef.currentTime;
                              }
                              updateSubtitle();
                            });
                            videoRef.addEventListener(
                              'timeupdate',
                              updateSubtitle,
                            );
                            videoRef.addEventListener('ended', () => {
                              const audioElement = document.getElementById(
                                `audio-${scene.id}`,
                              ) as HTMLAudioElement;
                              if (audioElement) {
                                audioElement.pause();
                                audioElement.currentTime = 0;
                              }
                              dispatch({
                                type: 'SET_CURRENT_SUBTITLE',
                                payload: '',
                              });

                              // Auto-select next scene if available
                              if (state.scriptData && state.scriptData.scenes) {
                                const currentSceneIndex =
                                  state.scriptData.scenes.findIndex(
                                    (s: any) => s.id === scene.id,
                                  );
                                const nextSceneIndex = currentSceneIndex + 1;

                                if (
                                  nextSceneIndex <
                                  state.scriptData.scenes.length
                                ) {
                                  const nextScene =
                                    state.scriptData.scenes[nextSceneIndex];
                                  dispatch({
                                    type: 'SET_SELECTED_SCENE_ID',
                                    payload: nextScene.id,
                                  });
                                }
                              }
                            });
                          }
                        }}
                        onLoadStart={(event) => {
                          // Handle visibility changes when video loads
                          if (isVisibleByIndex) {
                            // First, stop ALL videos
                            const allVideos =
                              document.querySelectorAll('video');
                            allVideos.forEach((video) => {
                              if (video !== event.target) {
                                video.pause();
                                video.currentTime = 0;
                              }
                            });

                            // Only auto-play if auto-advance is enabled
                            if (state.autoAdvanceEnabled) {
                              setTimeout(() => {
                                const video = event.target as HTMLVideoElement;
                                if (video && isVisibleByIndex) {
                                  video.play().catch(console.error);
                                }
                              }, 200);
                            }
                          }
                        }}
                        className="rounded-xl shadow-lg border-2 border-gray-600"
                        style={{ width: '80%', height: 'auto' }}
                        controls
                        preload="auto"
                        src={state.mediaFiles[videoKey]}
                      />

                      {/* Subtitles Overlay */}
                      {isVisibleByIndex && state.currentSubtitle && (
                        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 w-4/5 z-10">
                          <p
                            className="text-xl font-medium leading-relaxed text-center"
                            style={{ fontFamily: 'DMSerifText, serif' }}
                          >
                            {parseColoredText(state.currentSubtitle)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Scene Audio - Hidden Controls */}
            {state.scriptData &&
              state.scriptData.scenes &&
              state.scriptData.scenes.map((scene: any, index: number) => {
                const audioKey = `${state.currentTimestamp}.scene-${index}.mp3`;
                return state.mediaFiles[audioKey] ? (
                  <audio
                    key={scene.id}
                    id={`audio-${scene.id}`}
                    className="hidden"
                    src={state.mediaFiles[audioKey]}
                  />
                ) : null;
              })}
          </>
        )}

      {state.generatedVideoUrl && (
        <video
          className="w-[180%] h-[101.25%] rounded-xl shadow-lg group -ml-[40%]"
          controls
          src={state.generatedVideoUrl}
        />
      )}

      {state.selectedGalleryVideo && !state.generatedVideoUrl && (
        <video
          className="w-[180%] h-[101.25%] rounded-xl shadow-lg group -ml-[40%]"
          controls
          src={state.selectedGalleryVideo.url}
        />
      )}
    </div>
  );

  return (
    <MainLayout
      showCreditsUpgrade={true}
      rightSidebarContent={rightSidebarContent}
      backgroundColor={state.currentStep === 1 ? '#090526' : '#0F0A1E'}
      progressSteps={<ProgressSteps currentStep={state.currentStep} />}
    >
      <div className="flex flex-col justify-start p-4">
        <div
          className="relative overflow-hidden"
          style={{ height: 'calc(100vh - 64px - 200px)' }}
        >
          <div
            className={`transition-transform duration-500 ease-in-out ${
              state.currentStep === 1
                ? 'translate-x-0'
                : state.currentStep > 1
                ? '-translate-x-full'
                : 'translate-x-full'
            }`}
          >
            <VideoCreator
              isGenerating={state.isGenerating}
              onGenerateVideo={handleGenerateVideo}
              onGenerateScript={handleGenerateScript}
              generationStatus={state.generationStatus}
              statusMessage={state.statusMessage}
              showNextButton={
                state.hasStartedProcess &&
                state.currentStep === 1 &&
                (state.scriptData || state.generationStatus === 'completed')
              }
              onNextStep={handleNextStep}
            />
          </div>

          <div
            className={`absolute top-0 left-0 w-full h-[80%] transition-transform duration-500 ease-in-out px-3 ${
              state.currentStep === 2
                ? 'translate-x-0'
                : state.currentStep > 2
                ? '-translate-x-full'
                : 'translate-x-full'
            }`}
          >
            {/* Scene Cards Container */}
            <div className="space-y-4 mb-6 max-h-[598px] overflow-y-auto pr-2 px-4">
              {state.isLoadingScript && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="flex items-center justify-center space-x-2 mb-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                      <span className="text-lg font-medium text-gray-700">
                        Loading your videos...
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Scene Cards */}
              {state.isLoadingScript
                ? // Show skeleton placeholders while loading script
                  Array.from({ length: 3 }).map((_, index) => (
                    <EditSceneSkeleton key={index} />
                  ))
                : state.scriptData &&
                  state.scriptData.scenes &&
                  state.scriptData.scenes.map((scene: any, index: number) => {
                    // Get the image URL for this scene
                    const imageKey = `${state.currentTimestamp}.scene-${index}.jpg`;
                    const imageUrl = state.mediaFiles[imageKey];
                    console.log('mediaFiles:', state.mediaFiles);
                    console.log('imageUrl:', imageUrl);

                    return (
                      <EditScene
                        key={scene.id}
                        scene={scene}
                        editingScene={state.editingScene}
                        editedNarration={state.editedNarration}
                        onEditScene={handleEditScene}
                        onSaveEdit={handleSaveEdit}
                        onCancelEdit={handleCancelEdit}
                        onEditedNarrationChange={(value) =>
                          dispatch({
                            type: 'SET_EDITED_NARRATION',
                            payload: value,
                          })
                        }
                        imageUrl={imageUrl}
                        isSelected={state.selectedSceneId === scene.id}
                        onSelect={handleSceneSelection}
                      />
                    );
                  })}
            </div>
          </div>

          {/* Back Button */}
          <div className="absolute bottom-4 left-4">
            <button
              onClick={() => {
                dispatch({ type: 'SET_CURRENT_STEP', payload: 1 });
                // Keep the hasStartedProcess flag when going back
              }}
              className="px-4 py-2 border border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white rounded-lg transition-colors"
            >
              ← Back
            </button>
          </div>
          {/* Step 3: Export Video */}
          <div
            className={`absolute top-0 left-0 w-full transition-transform duration-500 ease-in-out ${
              state.currentStep === 3 ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <ExportVideo
              onExportVideo={handleExportVideo}
              isExporting={state.isExporting}
              onBack={() => dispatch({ type: 'SET_CURRENT_STEP', payload: 2 })}
            />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
