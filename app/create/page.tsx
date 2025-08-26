'use client';

import { useState, useEffect, useRef } from 'react';
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
    isLoadingScript: true,
    currentTimestamp: '',
    subtitleFiles: [] as { [key: string]: string }[],
    mediaFiles: {} as { [key: string]: string },
    assFiles: {} as { [key: string]: string },
    subtitleTexts: {} as { [key: string]: string },
    scenes: [] as any[],
    subtitles: [] as any[],
  });

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
    handleDeleteScene,
    handleAddScene,
    handleExportVideo,
    autoSelectFirstScene,
    handleAutoPlay,
    setupVideoEventListeners,
  } = useSceneManagement();

  // WebSocket hook for real-time updates
  const { isConnected } = useWebSocket({
    onMessage: (message) => {
      console.log('WebSocket message received:', message);

      // Handle different message types
      switch (message.action) {
        case 'script_created':
          handleScriptCreated(message.data);
          break;
        case 'image_created':
          handleImageCreated(message.data);
          break;
        case 'audio_subtitle_created':
          handleAudioSubtitleCreated(message.data);
          break;
        case 'video_scene_created':
          handleVideoSceneCreated(message.data);
          break;
        case 'video_completed':
          handleVideoCompleted(message.data);
          break;
        default:
          console.log('Unknown WebSocket message type:', message.action);
      }
    },
    onConnect: () => {
      console.log('WebSocket connected');
    },
    onDisconnect: () => {
      console.log('WebSocket disconnected');
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
    },
  });

  // Handle script creation
  const handleScriptCreated = (data: any) => {
    console.log('Script created:', data);
    setVideoGenerationState((prev) => ({
      ...prev,
      currentTimestamp: data.timestamp || prev.currentTimestamp,
      scenes: data.scenes || [],
      isLoadingScript: true,
    }));
  };

  // Handle image creation
  const handleImageCreated = (data: any) => {
    console.log('Images created:', data);

    const mediaFiles: { [key: string]: string } = {};

    // Handle images - data structure: {0: {"timestamp.scene-0.jpg": "url"}, 1: {"timestamp.scene-1.jpg": "url"}, ...}
    Object.keys(data).forEach((key) => {
      if (key !== 'userId' && key !== 'timestamp' && key !== 'message') {
        const imageObj = data[key];
        if (typeof imageObj === 'object') {
          Object.assign(mediaFiles, imageObj);
        }
      }
    });

    setVideoGenerationState((prev) => ({
      ...prev,
      currentTimestamp: data.timestamp || prev.currentTimestamp,
      mediaFiles: { ...prev.mediaFiles, ...mediaFiles },
    }));
  };

  // Handle audio and subtitle creation
  const handleAudioSubtitleCreated = (data: any) => {
    console.log('Audio and subtitles created:', data);

    const mediaFiles: { [key: string]: string } = {};
    let subtitleFiles: any[] = [];

    // Handle subtitle content - array of objects: [{ "timestamp.scene-id.ass": "ass-content" }]
    if (data.subtitleContent && Array.isArray(data.subtitleContent)) {
      subtitleFiles = data.subtitleContent.map(
        (subtitleObj: { [key: string]: string }) => {
          return subtitleObj;
        },
      );
    }

    // Handle narration URLs if present
    if (data.narrationUrls && Array.isArray(data.narrationUrls)) {
      data.narrationUrls.forEach((narrationObj: { [key: string]: string }) => {
        Object.assign(mediaFiles, narrationObj);
      });
    }

    // Extract subtitle text from the subtitles array for editing
    let subtitleTexts: { [key: string]: string } = {};
    if (data.subtitles && Array.isArray(data.subtitles)) {
      data.subtitles.forEach((subtitleObj: any) => {
        const fileName = Object.keys(subtitleObj)[0];
        const subtitleData = subtitleObj[fileName];
        if (subtitleData && subtitleData.text) {
          subtitleTexts[fileName] = subtitleData.text;
        }
      });
    }

    setVideoGenerationState((prev) => ({
      ...prev,
      isLoadingScript: false, // Set to false when audio/subtitles are ready
      currentTimestamp: data.timestamp || prev.currentTimestamp,
      mediaFiles: { ...prev.mediaFiles, ...mediaFiles },
      subtitleFiles: subtitleFiles,
      subtitleTexts: subtitleTexts, // Store subtitle texts for editing
      subtitles: data.subtitles || [], // Store subtitles array for editing
    }));
  };

  // Handle video scene creation
  const handleVideoSceneCreated = (data: any) => {
    console.log('Video scenes created:', data);

    const mediaFiles: { [key: string]: string } = {};

    // Handle video effects - array of objects: [{ "timestamp.scene-id.mp4": "signed-url" }]
    if (data.videoEffectsUrls && Array.isArray(data.videoEffectsUrls)) {
      data.videoEffectsUrls.forEach((videoObj: { [key: string]: string }) => {
        Object.assign(mediaFiles, videoObj);
      });
    }

    setVideoGenerationState((prev) => ({
      ...prev,
      isLoadingScript: false, // Set to false when video scenes are ready
      currentTimestamp: data.timestamp || prev.currentTimestamp,
      mediaFiles: { ...prev.mediaFiles, ...mediaFiles },
    }));
  };

  // Handle video completion
  const handleVideoCompleted = (data: any) => {
    console.log('Video completed:', data);
    setVideoGenerationState((prev) => ({
      ...prev,
      currentTimestamp: data.timestamp || prev.currentTimestamp,
      videoKey: data.videoKey,
    }));

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

  // Custom handleEditScene that uses subtitle text from subtitles array
  const handleEditSceneWithSubtitle = (sceneId: number, narration: string) => {
    // Try to get subtitle text from subtitles array first
    const subtitleKey = `${videoGenerationState.currentTimestamp}.scene-${sceneId}.subtitle`;
    const subtitleData = videoGenerationState.subtitles?.find(
      (subtitleObj: any) => Object.keys(subtitleObj)[0] === subtitleKey,
    );

    // Extract text from the subtitle data structure: {text: "actual text"}
    let subtitleText = narration; // fallback
    if (subtitleData) {
      const subtitleContent = subtitleData[subtitleKey];
      if (
        subtitleContent &&
        typeof subtitleContent === 'object' &&
        'text' in subtitleContent
      ) {
        subtitleText = subtitleContent.text;
      }
    }

    handleEditScene(sceneId, subtitleText);
  };

  // Example video URL
  const exampleVideoUrl = '/assets/example.mp4';

  // Create scenes from subtitles data
  const createScenesFromSubtitleFiles = () => {
    if (
      !videoGenerationState.subtitles ||
      videoGenerationState.subtitles.length === 0
    ) {
      return [];
    }

    return videoGenerationState.subtitles.map(
      (subtitleObj: any, index: number) => {
        // Extract the subtitle text from the object structure: { "timestamp.scene-id.subtitle": { text: "actual text" } }
        const subtitleKey = Object.keys(subtitleObj)[0];
        const subtitleData = subtitleObj[subtitleKey];
        const narration = subtitleData?.text || `Scene ${index + 1}`;

        return {
          id: index,
          description: `Scene ${index + 1}`,
          narration: narration,
          duration: 5, // Default duration
        };
      },
    );
  };

  const scenes = createScenesFromSubtitleFiles();

  // Auto-select first scene when script data is loaded
  useEffect(() => {
    if (scenes.length > 0 && !sceneState.selectedSceneId) {
      autoSelectFirstScene(scenes);
    }
  }, [scenes, sceneState.selectedSceneId]);

  // Auto-play video when selectedSceneId changes (only if auto-advance is enabled)
  useEffect(() => {
    // Prevent infinite loops by checking if we've already handled this state
    if (
      autoPlayRef.current.selectedSceneId === sceneState.selectedSceneId &&
      autoPlayRef.current.timestamp === videoGenerationState.currentTimestamp
    ) {
      return;
    }

    console.log('🎬 Auto-play effect triggered:', {
      scenesLength: scenes.length,
      selectedSceneId: sceneState.selectedSceneId,
      autoAdvanceEnabled: sceneState.autoAdvanceEnabled,
      currentTimestamp: videoGenerationState.currentTimestamp,
    });

    if (scenes.length > 0 && sceneState.selectedSceneId !== null) {
      // Update ref to prevent loops
      autoPlayRef.current = {
        selectedSceneId: sceneState.selectedSceneId,
        timestamp: videoGenerationState.currentTimestamp,
      };

      handleAutoPlay(scenes, videoGenerationState.currentTimestamp);
    }
  }, [sceneState.selectedSceneId, videoGenerationState.currentTimestamp]);

  // Handle URL query parameters for step and timestamp
  useEffect(() => {
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
    if (timestampFromUrl) {
      // If step=2 is specified and we don't have subtitle files yet, subscribe to updates
      if (stepFromUrl === '2' && !videoGenerationState.subtitleFiles.length) {
        setVideoGenerationState((prev) => ({
          ...prev,
          currentTimestamp: timestampFromUrl,
          isLoadingSubtitles: true,
        }));

        // WebSocket updates are now automatic
      }
    }
  }, [
    videoGenerationState.currentTimestamp,
    videoGenerationState.subtitleFiles,
    isConnected,
  ]);

  // Subscribe to WebSocket updates when connected
  // WebSocket connection is now automatic - no subscription needed

  const handleGenerateVideo = async (script: string, duration: number) => {
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
    console.log('Script generated:', prompt);
  };

  const handleUpdatePreview = () => {
    // TODO: Implement preview update logic
    console.log('Updating preview with edited scenes:', scenes);
    // Transition to step 3
    setCurrentStep(3);
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

      console.log('Regenerating audio for scene:', sceneId);
      console.log('Using narration:', updatedScene.narration);

      // Call the generate-audio-subtitle API
      const response = await fetch('/api/generate-audio-subtitle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scenes: [updatedScene], // Send the scene with updated narration
          instructions: 'Speak in a cheerful and positive tone',
          timestamp:
            videoGenerationState.currentTimestamp ||
            queryParams.get('timestamp'),
        }),
      });
      console.log('Regenerating audio response:', response);
      console.log('Regenerating videoGenerationState:', videoGenerationState);

      if (!response.ok) {
        throw new Error(`Failed to regenerate audio: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Audio regeneration result:', result);

      // Update the video generation state with the new audio/subtitles
      if (result.data && result.data.length > 0) {
        const audioData = result.data[0];

        setVideoGenerationState((prev) => ({
          ...prev,
          mediaFiles: {
            ...prev.mediaFiles,
            [audioData.audioKey]: audioData.audioUrl,
          },
          assFiles: {
            ...prev.assFiles,
            [audioData.assKey]: audioData.assFileContent,
          },
        }));

        // Force refresh of the video player to use new subtitles
        // If this scene is currently selected, update the current subtitle immediately
        if (sceneState.selectedSceneId === sceneId) {
          console.log(
            '🔄 Regenerating audio for currently selected scene:',
            sceneId,
          );
          console.log(
            '🔄 New ASS content length:',
            audioData.assFileContent.length,
          );

          // Clear the current subtitle first
          sceneDispatch({
            type: 'SET_CURRENT_SUBTITLE',
            payload: '',
          });

          // Find the video element and update its ASS files data
          const videoElement = document.querySelector(
            'video',
          ) as HTMLVideoElement;
          if (videoElement) {
            console.log('🔄 Found video element, updating dataset...');
            // Update the video element's dataset with the new ASS files
            videoElement.dataset.assFiles = JSON.stringify({
              ...videoGenerationState.assFiles,
              [audioData.assKey]: audioData.assFileContent,
            });
            console.log('🔄 Dataset updated, triggering timeupdate event...');

            // Force the video to trigger a timeupdate event to refresh subtitles
            // This will make the video event listeners use the updated ASS content
            const timeUpdateEvent = new Event('timeupdate');
            videoElement.dispatchEvent(timeUpdateEvent);
            console.log('🔄 Timeupdate event dispatched');

            // Also directly update the subtitle with the new content
            const newSubtitles = parseAssFile(audioData.assFileContent);
            const currentTime = videoElement.currentTime;
            const currentSub = newSubtitles.find(
              (sub: any) => currentTime >= sub.start && currentTime <= sub.end,
            );
            if (currentSub) {
              console.log(
                '🔄 Directly updating subtitle to:',
                currentSub.coloredText,
              );
              sceneDispatch({
                type: 'SET_CURRENT_SUBTITLE',
                payload: currentSub.coloredText,
              });
            }
          } else {
            console.log('🔄 No video element found');
          }
        }
      }

      // TODO: Update the UI to reflect the new audio/subtitles
      // This might involve refreshing the video generation state or updating specific files
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
    <div className="sticky top-4 p-[50px]">
      {currentStep === 1 &&
        !generationState.generatedVideoUrl &&
        !generationState.selectedGalleryVideo && (
          <div className="flex justify-center">
            <video
              className="rounded-xl shadow-lg border-2 border-gray-600"
              style={{ width: '60%', height: 'auto' }}
              controls
              autoPlay
              muted
              loop
              src={exampleVideoUrl}
            />
          </div>
        )}

      {currentStep === 2 && videoGenerationState.isLoadingScript && (
        <div className="flex justify-center items-center h-full">
          <VideoSkeleton />
        </div>
      )}

      {currentStep === 2 && scenes.length > 0 && (
        <>
          {scenes.map((scene: any, index: number) => {
            const videoKey = `${videoGenerationState.currentTimestamp}.scene-${index}.mp4`;
            const assKey = `${videoGenerationState.currentTimestamp}.scene-${index}.ass`;
            const isVisible = sceneState.selectedSceneId === scene.id;

            // Debug logging
            console.log(
              '🎬 Scene',
              index,
              'videoKey:',
              videoKey,
              'URL:',
              videoGenerationState.mediaFiles[videoKey],
            );

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
                {videoGenerationState.mediaFiles[videoKey] &&
                  videoGenerationState.mediaFiles[videoKey].startsWith(
                    'http',
                  ) && (
                    <div className="relative flex justify-center">
                      <video
                        ref={(videoRef) => {
                          if (videoRef) {
                            // Convert subtitleFiles array to object format
                            const subtitleFilesObj =
                              videoGenerationState.subtitleFiles.reduce(
                                (
                                  acc: { [key: string]: string },
                                  subtitleFile: any,
                                ) => {
                                  const key = Object.keys(subtitleFile)[0];
                                  acc[key] = subtitleFile[key];
                                  return acc;
                                },
                                {},
                              );

                            setupVideoEventListeners(
                              videoRef,
                              scene,
                              scenes,
                              subtitleFilesObj,
                              videoGenerationState.currentTimestamp,
                              index,
                            );
                          }
                        }}
                        onError={(event) => {
                          console.error('Video error:', event);
                        }}
                        className="rounded-xl shadow-lg border-2 border-gray-600"
                        style={{ width: '60%', height: 'auto' }}
                        controls
                        preload="auto"
                        src={videoGenerationState.mediaFiles[videoKey]}
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
            return videoGenerationState.mediaFiles[audioKey] ? (
              <audio
                key={scene.id}
                id={`audio-${scene.id}`}
                className="hidden"
                src={videoGenerationState.mediaFiles[audioKey]}
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

      <div className="flex flex-col justify-start p-4">
        <div
          className="relative overflow-hidden"
          style={{ height: 'calc(100vh - 64px - 200px)' }}
        >
          <div
            className={`transition-transform duration-500 ease-in-out ${
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
            className={`absolute top-0 left-0 w-full h-[80%] transition-transform duration-500 ease-in-out px-3 ${
              currentStep === 2
                ? 'translate-x-0'
                : currentStep > 2
                ? '-translate-x-full'
                : 'translate-x-full'
            }`}
          >
            {/* Scene Cards Container */}
            <div className="space-y-4 mb-6 h-full overflow-y-auto pr-2 px-4">
              {videoGenerationState.isLoadingScript && (
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
              {videoGenerationState.isLoadingScript
                ? // Show skeleton placeholders while loading script
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
                      />

                      {/* Scene Cards */}
                      {scenes.map((scene: any, index: number) => {
                        // Get the image URL for this scene
                        const imageKey = `${videoGenerationState.currentTimestamp}.scene-${index}.jpg`;
                        const imageUrl =
                          videoGenerationState.mediaFiles[imageKey];

                        return (
                          <div key={scene.id}>
                            <EditScene
                              scene={scene}
                              editingScene={sceneState.editingScene}
                              editedNarration={sceneState.editedNarration}
                              onEditScene={handleEditSceneWithSubtitle}
                              onSaveEdit={(sceneId) =>
                                handleSaveEdit(
                                  sceneId,
                                  scenes,
                                  (updatedScenes) => {
                                    // Update the subtitleFiles in video generation state
                                    console.log(
                                      'Scenes updated:',
                                      updatedScenes,
                                    );

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
                              onDeleteScene={handleDeleteScene}
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
            className={`absolute top-0 left-0 w-full transition-transform duration-500 ease-in-out ${
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
    </MainLayout>
  );
}
