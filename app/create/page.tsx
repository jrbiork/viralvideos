'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import MainLayout from '../../components/MainLayout';
import ProgressSteps from '../../components/ProgressSteps';
import VideoCreator from '../../components/VideoCreator';
import EditScene from '../../components/EditScene';
import EditSceneSkeleton from '../../components/EditSceneSkeleton';
import AddSceneButton from '../../components/AddSceneButton';
import ExportVideo from '../../components/ExportVideo';
import { parseColoredText, parseAssFile } from '../../lib/subtitle-utils';
import { useVideoGeneration } from '../../hooks/useVideoGeneration';
import { useSceneManagement } from '../../hooks/useSceneManagement';
import { useWebSocket } from '../../hooks/useWebSocket';
import VideoSkeleton from '../../components/VideoSkeleton';
import { Manifest } from '../types/manifest';
import { WebSocketMessage } from '../types/websocket';

export default function GeneratePage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<number | null>(
    null,
  );
  const autoPlayRef = useRef<{
    selectedSceneId: number | null;
    timestamp: string;
  }>({
    selectedSceneId: null,
    timestamp: '',
  });

  // WebSocket-based state for video generation progress
  const [videoGenerationState, setVideoGenerationState] = useState({
    isLoadingAudioSubtitles: true,
    isLoadingVideoScenes: true,
    currentTimestamp: '',
    manifest: null as Manifest | null,
  });

  // Toaster state
  const [showToaster, setShowToaster] = useState(false);
  const [toasterMessage, setToasterMessage] = useState('');

  // Custom hooks
  const {
    state: generationState,
    generateVideo,
    isAuthenticated,
  } = useVideoGeneration();
  const {
    state: sceneState,
    dispatch: sceneDispatch,
    handleEditScene,
    handleSaveEdit,
    handleCancelEdit,
    handleSceneSelection,
    handleAddScene,
    handleExportVideo,
    autoSelectFirstScene,
    handleAutoPlay,
    setupVideoEventListeners,
  } = useSceneManagement();

  // WebSocket hook for real-time updates
  const { isConnected } = useWebSocket({
    onMessage: (message: WebSocketMessage) => {
      console.log('WebSocket message:', message);

      // Handle different message types
      switch (message.action) {
        case 'image_created':
          handleImageCreated(message.data);
          break;
        case 'audio_subtitle_created':
          handleAudioSubtitleCreated(message.data);
          break;
        case 'video_scene_created':
          handleVideoSceneCreated(message.data);
          break;
        case 'preview_completed':
          handlePreviewCompleted(message.data);
          break;
        default:
          // Unknown message type
          break;
      }
    },
    onConnect: () => {
      // WebSocket connected
      console.log('WebSocket connected: ', isConnected);
    },
    onDisconnect: () => {
      // WebSocket disconnected
      console.log('WebSocket disconnected: ', isConnected);
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
    },
  });

  // Handle image creation
  const handleImageCreated = (data: any) => {
    if (data.manifest) {
      setVideoGenerationState((prev) => ({
        ...prev,
        currentTimestamp: data.timestamp || prev.currentTimestamp,
        manifest: data.manifest,
      }));
    }
  };

  // Handle audio and subtitle creation
  const handleAudioSubtitleCreated = (data: any) => {
    if (data.manifest) {
      setVideoGenerationState((prev) => ({
        ...prev,
        currentTimestamp: data.timestamp || prev.currentTimestamp,
        manifest: data.manifest,
        isLoadingAudioSubtitles: false, // Set to false when audio/subtitles are ready
      }));
    }
  };

  // Handle video scene creation
  const handleVideoSceneCreated = (data: any) => {
    if (data.manifest) {
      setVideoGenerationState((prev) => ({
        ...prev,
        isLoadingVideoScenes: false, // Set to false when video scenes are created
        currentTimestamp: data.timestamp || prev.currentTimestamp,
        manifest: data.manifest,
      }));
    }
  };

  // Handle video completion
  const handlePreviewCompleted = (data: any) => {
    if (data.manifest) {
      setVideoGenerationState((prev) => ({
        ...prev,
        currentTimestamp: data.timestamp || prev.currentTimestamp,
        manifest: data.manifest,
        isLoadingVideoScenes: false,
        isLoadingAudioSubtitles: false,
      }));
    }

    // Show browser notification when video generation is completed
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Your video is ready!', {
        body: 'Your video has been generated successfully!',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
      });
    } else if (
      'Notification' in window &&
      Notification.permission !== 'denied'
    ) {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          new Notification('Your video is ready!', {
            body: 'Your video has been generated successfully!',
            icon: '/favicon.ico',
            badge: '/favicon.ico',
          });
        }
      });
    }
  };

  // Handle insufficient credits
  const handleInsufficientCredits = (data: any) => {
    console.log('Insufficient credits:', data);
    setToasterMessage('Insufficient credits');
    setShowToaster(true);
  };

  // Helper functions to extract data from manifest
  const getMediaFiles = useCallback(() => {
    if (!videoGenerationState.manifest) return {};
    const mediaFiles: { [key: string]: string } = {};

    videoGenerationState.manifest.scenes.forEach((scene) => {
      const { files } = scene;
      const sceneId = scene.sceneIndex;
      const timestamp = videoGenerationState.manifest!.generatedAt;

      // Add all file types to mediaFiles
      mediaFiles[`${timestamp}.scene-${sceneId}.jpg`] = files.jpg;
      mediaFiles[`${timestamp}.scene-${sceneId}.mp3`] = files.mp3;
      mediaFiles[`${timestamp}.scene-${sceneId}.mp4`] = files.mp4;
    });

    return mediaFiles;
  }, [videoGenerationState.manifest]);

  const getSubtitles = useCallback(() => {
    if (!videoGenerationState.manifest) return {};
    const subtitles: { [key: string]: string } = {};

    videoGenerationState.manifest.scenes.forEach((scene) => {
      const sceneId = scene.sceneIndex;
      const timestamp = videoGenerationState.manifest!.generatedAt;
      const subtitleKey = `${timestamp}.scene-${sceneId}.subtitle`;
      subtitles[subtitleKey] = scene.files.subtitle;
    });

    return subtitles;
  }, [videoGenerationState.manifest]);

  const getAssFiles = useCallback(() => {
    if (!videoGenerationState.manifest) return {};
    const assFiles: { [key: string]: string } = {};

    videoGenerationState.manifest.scenes.forEach((scene) => {
      const sceneId = scene.sceneIndex;
      const timestamp = videoGenerationState.manifest!.generatedAt;
      const assKey = `${timestamp}.scene-${sceneId}.ass`;
      assFiles[assKey] = scene.files.ass;
    });

    return assFiles;
  }, [videoGenerationState.manifest]);

  // Custom handleEditScene that uses subtitle text from manifest
  const handleEditSceneWithSubtitle = (sceneId: number, narration: string) => {
    const subtitles = getSubtitles();
    const subtitleKey = `${videoGenerationState.currentTimestamp}.scene-${sceneId}.subtitle`;
    const subtitleText = subtitles[subtitleKey] || narration;

    handleEditScene(sceneId, subtitleText);
  };

  // Example video URL
  const exampleVideoUrl = '/assets/example.mp4';

  // Create scenes from subtitles data
  const createScenesFromSubtitleFiles = useCallback(() => {
    const subtitles = getSubtitles();
    const subtitleKeys = Object.keys(subtitles);

    console.log('Creating scenes from subtitles:', subtitles);
    console.log('Subtitle keys:', subtitleKeys);

    if (subtitleKeys.length === 0) {
      return [];
    }

    return subtitleKeys.map((subtitleKey, index) => {
      // Extract the actual scene index from the subtitle key
      const sceneIndexMatch = subtitleKey.match(/scene-(\d+)\./);
      const sceneIndex = sceneIndexMatch ? parseInt(sceneIndexMatch[1]) : index;

      const narration = subtitles[subtitleKey] || `Scene ${sceneIndex + 1}`;

      const scene = videoGenerationState.manifest;
      console.log('Creating scene:', { id: sceneIndex, narration });

      return {
        id: sceneIndex,
        description: `Scene ${sceneIndex + 1}`,
        narration: narration,
        duration: Math.floor(
          (scene?.totalDuration || 30) / (scene?.sceneCount || 3),
        ),
      };
    });
  }, [getSubtitles]);

  const scenes = useMemo(
    () => createScenesFromSubtitleFiles(),
    [createScenesFromSubtitleFiles],
  );

  // Auto-select first scene when script data is loaded
  useEffect(() => {
    if (scenes.length > 0 && !sceneState.selectedSceneId) {
      autoSelectFirstScene(scenes);
    }
  }, [scenes.length, sceneState.selectedSceneId]); // Only depend on scenes.length, not the entire scenes array

  // Auto-play video when selectedSceneId changes (only if auto-advance is enabled)
  useEffect(() => {
    // Prevent infinite loops by checking if we've already handled this state
    if (
      autoPlayRef.current.selectedSceneId === sceneState.selectedSceneId &&
      autoPlayRef.current.timestamp === videoGenerationState.currentTimestamp
    ) {
      return;
    }

    if (scenes.length > 0 && sceneState.selectedSceneId !== null) {
      // Update ref to prevent loops
      autoPlayRef.current = {
        selectedSceneId: sceneState.selectedSceneId,
        timestamp: videoGenerationState.currentTimestamp,
      };

      handleAutoPlay(scenes, videoGenerationState.currentTimestamp);
    }
  }, [
    sceneState.selectedSceneId,
    videoGenerationState.currentTimestamp,
    scenes.length,
  ]); // Add scenes.length to dependencies

  // Auto-hide toaster after 4 seconds
  useEffect(() => {
    if (showToaster) {
      const timer = setTimeout(() => {
        setShowToaster(false);
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [showToaster]);

  // Handle URL query parameters for step 2 - edit mode
  const urlParamsProcessedRef = useRef(false);

  useEffect(() => {
    if (urlParamsProcessedRef.current) {
      return;
    }

    // Set the ref immediately to prevent multiple executions
    urlParamsProcessedRef.current = true;

    const handleUrlParams = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const timestampFromUrl = urlParams.get('timestamp');
      const stepFromUrl = urlParams.get('step');

      // Set step from URL if provided
      if (stepFromUrl) {
        const stepNumber = parseInt(stepFromUrl);
        if (stepNumber >= 1 && stepNumber <= 3) {
          setCurrentStep(stepNumber);
        }
      }

      // Handle timestamp and WebSocket subscription
      if (
        timestampFromUrl &&
        timestampFromUrl !== videoGenerationState.currentTimestamp
      ) {
        // If step=2 is specified
        if (stepFromUrl === '2') {
          setVideoGenerationState((prev) => ({
            ...prev,
            currentTimestamp: timestampFromUrl,
            isLoadingAudioSubtitles: true,
            isLoadingVideoScenes: true,
          }));

          // call fetch-preview api
          const previewResponse = await fetch(
            `/api/fetch-preview?timestamp=${timestampFromUrl}`,
            {
              method: 'GET',
            },
          );
          // handle response from fetch-preview api that is a manifest
          const response = await previewResponse.json();
          const manifest = response.manifest; // Extract the manifest from the response
          setVideoGenerationState((prev) => ({
            ...prev,
            manifest: manifest,
            isLoadingAudioSubtitles: false,
            isLoadingVideoScenes: false,
          }));
        }
      }
    };

    handleUrlParams();
  }, []); // Empty dependencies array to run only once

  // Subscribe to WebSocket updates when connected
  // WebSocket connection is now automatic - no subscription needed

  const handleGenerateVideo = async (script: string, duration: 30 | 60) => {
    await generateVideo(script, duration, (timestamp) => {
      setCurrentStep(2);
      setVideoGenerationState((prev) => ({
        ...prev,
        currentTimestamp: timestamp,
        isLoadingSubtitles: true,
      }));

      // WebSocket updates are now automatic
    });
  };

  const handleGenerateScript = async (prompt: string) => {
    // This function is now handled by the VideoCreator component
  };

  const handleRegenerateAudio = async (sceneId: number) => {
    if (!scenes.length || !videoGenerationState.currentTimestamp) {
      console.error('No scenes or timestamp available');
      return;
    }

    // Set loading state for this scene
    setRegeneratingSceneId(sceneId);

    const queryParams = new URLSearchParams(window.location.search);

    try {
      // Find the scene to regenerate
      const scene = scenes.find((s: any) => s.id === sceneId);
      if (!scene) {
        console.error('Scene not found:', sceneId);
        return;
      }

      // Create a copy of the scene with updated narration if it's being edited
      const updatedScene = {
        ...scene,
        narration: sceneState.editedNarration || scene.narration,
      };

      // Call the generate-audio-subtitle API
      const response = await fetch('/api/generate-audio-subtitle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scene: updatedScene, // Send the single scene with updated narration
          instructions: 'Speak in a cheerful and positive tone',
          timestamp:
            videoGenerationState.currentTimestamp ||
            queryParams.get('timestamp'),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to regenerate audio: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('📡 Response from generate-audio-subtitle API:', result);

      // Update the video generation state with the new audio/subtitles
      if (result.data && result.data.manifest) {
        setVideoGenerationState((prev) => ({
          ...prev,
          manifest: result.data.manifest,
        }));
        console.log(
          '✅ Audio/subtitles regenerated successfully:',
          result.data.manifest,
        );

        // Force video players to refresh their ASS and subtitle content
        const videoElements = document.querySelectorAll('video');
        videoElements.forEach((videoRef) => {
          if (videoRef.dataset.initialized) {
            // Build complete ASS files object from the updated manifest
            const timestamp = result.data.manifest.generatedAt;
            const completeAssFiles: { [key: string]: string } = {};

            result.data.manifest.scenes.forEach((scene: any) => {
              const assKey = `${timestamp}.scene-${scene.sceneIndex}.ass`;
              completeAssFiles[assKey] = scene.files.ass;
            });

            // Update the video element with complete ASS content
            videoRef.dataset.assFiles = JSON.stringify(completeAssFiles);
            console.log(
              '🔄 Updated video player with complete ASS content:',
              Object.keys(completeAssFiles),
            );

            // Force immediate subtitle update by triggering a timeupdate event
            const timeupdateEvent = new Event('timeupdate', {
              bubbles: true,
            });
            videoRef.dispatchEvent(timeupdateEvent);
          }
        });
      } else {
        console.error('❌ Unexpected response format:', result);
      }
    } catch (error) {
      console.error('Error regenerating audio:', error);
      alert('Failed to regenerate audio. Please try again.');
    } finally {
      // Clear loading state
      setRegeneratingSceneId(null);

      // Reset the scene back to initial mode (showing edit button)
      if (sceneState.editingScene === sceneId) {
        sceneDispatch({
          type: 'SET_EDITING_SCENE',
          payload: null,
        });
        sceneDispatch({
          type: 'SET_EDITED_NARRATION',
          payload: '',
        });
      }
    }
  };

  const handleNextStep = () => {
    if (scenes.length > 0) {
      setCurrentStep(2);
    } else {
      // If no scenes, start WebSocket subscription with the current timestamp
      if (videoGenerationState.currentTimestamp) {
        setCurrentStep(2);
        setVideoGenerationState((prev) => ({
          ...prev,
          isLoadingSubtitles: true,
        }));

        // WebSocket updates are now automatic
      } else {
        // Fallback: try to fetch without timestamp
        // This would need to be implemented in the WebSocket hook
        setCurrentStep(2);
      }
    }
  };

  // Right sidebar content
  const rightSidebarContent = (
    <div className="sticky">
      {currentStep === 1 &&
        !generationState.generatedVideoUrl &&
        !generationState.selectedGalleryVideo && (
          <div className="flex justify-center">
            <video
              className="rounded-xl shadow-lg border-2 border-gray-600"
              style={{ width: '85%', height: 'auto' }}
              controls
              autoPlay
              muted
              loop
              src={exampleVideoUrl}
            />
          </div>
        )}

      {currentStep === 2 && videoGenerationState.isLoadingVideoScenes && (
        <div className="flex justify-center items-center h-full">
          <VideoSkeleton />
        </div>
      )}

      {currentStep === 2 &&
        !videoGenerationState.isLoadingVideoScenes &&
        scenes.length > 0 && (
          <>
            {scenes.map((scene: any, index: number) => {
              const videoKey = `${videoGenerationState.currentTimestamp}.scene-${index}.mp4`;
              const assKey = `${videoGenerationState.currentTimestamp}.scene-${index}.ass`;
              const isVisible = sceneState.selectedSceneId === scene.id;

              // Find the correct index for the selected scene
              const selectedSceneIndex = scenes.findIndex(
                (s: any) => s.id === sceneState.selectedSceneId,
              );
              const isVisibleByIndex = index === selectedSceneIndex;

              return (
                <div
                  key={scene.id}
                  className={isVisibleByIndex ? 'block' : 'hidden'}
                >
                  {getMediaFiles()[videoKey] &&
                    getMediaFiles()[videoKey].startsWith('http') && (
                      <div className="relative flex justify-center">
                        <video
                          ref={(videoRef) => {
                            if (videoRef) {
                              setupVideoEventListeners(
                                videoRef,
                                scene,
                                scenes,
                                getAssFiles(),
                                videoGenerationState.currentTimestamp,
                                index,
                              );
                            }
                          }}
                          onError={(event) => {
                            console.error('Video error:', event);
                          }}
                          className="rounded-xl shadow-lg border-2 border-gray-600"
                          style={{ width: '85%', height: 'auto' }}
                          controls
                          preload="auto"
                          src={getMediaFiles()[videoKey] || ''}
                        />

                        {/* Subtitles Overlay */}
                        {isVisibleByIndex && sceneState.currentSubtitle && (
                          <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 w-4/5 z-10">
                            <p
                              className="text-xl font-medium leading-relaxed text-center"
                              style={{ fontFamily: 'DMSerifText, serif' }}
                            >
                              {parseColoredText(sceneState.currentSubtitle)}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                </div>
              );
            })}

            {/* Scene Audio - Hidden Controls */}
            {scenes.map((scene: any, index: number) => {
              const audioKey = `${videoGenerationState.currentTimestamp}.scene-${index}.mp3`;
              return getMediaFiles()[audioKey] ? (
                <audio
                  key={scene.id}
                  id={`audio-${scene.id}`}
                  className="hidden"
                  src={getMediaFiles()[audioKey]}
                />
              ) : null;
            })}
          </>
        )}

      {generationState.generatedVideoUrl && (
        <video
          className="w-[180%] h-[101.25%] rounded-xl shadow-lg group -ml-[40%]"
          controls
          src={generationState.generatedVideoUrl}
        />
      )}

      {generationState.selectedGalleryVideo &&
        !generationState.generatedVideoUrl && (
          <video
            className="w-[180%] h-[101.25%] rounded-xl shadow-lg group -ml-[40%]"
            controls
            src={generationState.selectedGalleryVideo.url}
          />
        )}
    </div>
  );

  return (
    <MainLayout
      showCreditsUpgrade={true}
      rightSidebarContent={rightSidebarContent}
      backgroundColor={currentStep === 1 ? '#090526' : '#0F0A1E'}
      progressSteps={<ProgressSteps currentStep={currentStep} />}
    >
      {/* WebSocket Status for Testing */}

      <div className="flex flex-col justify-start px-4 h-full overflow-y-auto">
        <div className="relative overflow-hidden flex-1">
          <div
            className={`h-full transition-transform duration-500 ease-in-out ${
              currentStep === 1
                ? 'translate-x-0'
                : currentStep > 1
                ? '-translate-x-full'
                : 'translate-x-full'
            }`}
          >
            <VideoCreator
              isGenerating={generationState.isGenerating}
              onGenerateVideo={handleGenerateVideo}
              onGenerateScript={handleGenerateScript}
              generationStatus={generationState.generationStatus}
              statusMessage={generationState.statusMessage}
              showNextButton={
                generationState.hasStartedProcess &&
                currentStep === 1 &&
                (scenes.length > 0 ||
                  generationState.generationStatus === 'completed')
              }
              onNextStep={handleNextStep}
            />
          </div>

          <div
            className={`absolute top-0 left-0 w-full h-full transition-transform duration-500 ease-in-out px-3 ${
              currentStep === 2
                ? 'translate-x-0'
                : currentStep > 2
                ? '-translate-x-full'
                : 'translate-x-full'
            }`}
          >
            {/* Scene Cards Container */}
            <div className="space-y-4 mb-6 h-full overflow-y-auto pr-2 px-4 custom-scrollbar">
              {videoGenerationState.isLoadingVideoScenes && (
                <div className="flex items-center justify-center">
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
              {videoGenerationState.isLoadingAudioSubtitles
                ? // Show skeleton placeholders while loading audio/subtitles
                  Array.from({ length: 3 }).map((_, index) => (
                    <EditSceneSkeleton key={index} />
                  ))
                : scenes.length > 0 && (
                    <>
                      {/* Add scene button before first scene */}
                      <AddSceneButton
                        onAddScene={handleAddScene}
                        position={0}
                        isFirst={true}
                        disabled={true}
                      />

                      {/* Scene Cards */}
                      {scenes.map((scene: any, index: number) => {
                        // Get the image URL for this scene
                        const imageKey = `${videoGenerationState.currentTimestamp}.scene-${index}.jpg`;
                        const imageUrl = getMediaFiles()[imageKey];

                        return (
                          <div key={scene.id}>
                            <EditScene
                              scene={scene}
                              editingScene={sceneState.editingScene}
                              editedNarration={sceneState.editedNarration}
                              onEditScene={handleEditSceneWithSubtitle}
                              setIsLoadingVideoScenes={(value: boolean) =>
                                setVideoGenerationState((prev) => ({
                                  ...prev,
                                  isLoadingVideoScenes: value,
                                }))
                              }
                              onSaveEdit={(sceneId) =>
                                handleSaveEdit(
                                  sceneId,
                                  scenes,
                                  (updatedScenes) => {
                                    // Update the subtitleFiles in video generation state

                                    // Create updated subtitleFiles from the updated scenes
                                    const updatedSubtitleFiles =
                                      updatedScenes.map(
                                        (scene: any, index: number) => {
                                          const fileName = `${videoGenerationState.currentTimestamp}.scene-${index}.subtitle.json`;
                                          return {
                                            [fileName]: scene.narration,
                                          };
                                        },
                                      );

                                    // Update the subtitleFiles in video generation state
                                    setVideoGenerationState((prev) => ({
                                      ...prev,
                                      subtitleFiles: updatedSubtitleFiles,
                                    }));
                                  },
                                )
                              }
                              onCancelEdit={handleCancelEdit}
                              onEditedNarrationChange={(value) => {
                                // Update the edited narration in the scene management state
                                sceneDispatch({
                                  type: 'SET_EDITED_NARRATION',
                                  payload: value,
                                });
                              }}
                              onRegenerateAudio={handleRegenerateAudio}
                              imageUrl={imageUrl}
                              isSelected={
                                sceneState.selectedSceneId === scene.id
                              }
                              onSelect={handleSceneSelection}
                              regeneratingSceneId={regeneratingSceneId}
                            />

                            {/* Add scene button after each scene (except the last one) */}
                            {index < scenes.length - 1 && (
                              <AddSceneButton
                                onAddScene={handleAddScene}
                                position={index + 1}
                                disabled={true}
                              />
                            )}
                          </div>
                        );
                      })}

                      {/* Add scene button after last scene */}
                      <AddSceneButton
                        onAddScene={handleAddScene}
                        position={scenes.length}
                        isLast={true}
                        disabled={true}
                      />
                    </>
                  )}
            </div>
          </div>

          {/* Back Button */}
          <div className="absolute bottom-4 left-4">
            <button
              onClick={() => {
                setCurrentStep(1);
                // Keep the hasStartedProcess flag when going back
              }}
              className="px-4 py-2 border border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white rounded-lg transition-colors"
            >
              ← Back
            </button>
          </div>

          {/* Step 3: Export Video */}
          <div
            className={`absolute top-0 left-0 w-full h-full transition-transform duration-500 ease-in-out ${
              currentStep === 3 ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <ExportVideo
              onExportVideo={handleExportVideo}
              isExporting={sceneState.isExporting}
              onBack={() => setCurrentStep(2)}
            />
          </div>
        </div>
      </div>

      {/* Animated Toaster */}
      {showToaster && (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            className={`
              bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg 
              flex items-center space-x-3 max-w-sm
              transform transition-all duration-300 ease-in-out
              ${
                showToaster
                  ? 'translate-x-0 opacity-100'
                  : 'translate-x-full opacity-0'
              }
            `}
          >
            {/* Warning Icon */}
            <div className="flex-shrink-0">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM12 9a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0112 9zm0 8a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
            </div>

            {/* Message */}
            <div className="font-medium">{toasterMessage}</div>

            {/* Close Button */}
            <button
              onClick={() => setShowToaster(false)}
              className="flex-shrink-0 ml-4 text-white hover:text-gray-200 transition-colors"
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
          </div>
        </div>
      )}
    </MainLayout>
  );
}
