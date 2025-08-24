'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import VideoPreview from '../../components/VideoPreview';
import MainLayout from '../../components/MainLayout';
import ProgressSteps from '../../components/ProgressSteps';
import VideoCreator from '../../components/VideoCreator';
import EditScene from '../../components/EditScene';
import EditSceneSkeleton from '../../components/EditSceneSkeleton';
import AddSceneButton from '../../components/AddSceneButton';
import ExportVideo from '../../components/ExportVideo';
import { parseColoredText, parseAssFile } from '../../lib/subtitle-utils';
import { useVideoGeneration } from '../../hooks/useVideoGeneration';
import { useScriptPolling } from '../../hooks/useScriptPolling';
import { useSceneManagement } from '../../hooks/useSceneManagement';
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

  // Custom hooks
  const {
    state: generationState,
    generateVideo,
    isAuthenticated,
  } = useVideoGeneration();
  const {
    state: pollingState,
    dispatch: pollingDispatch,
    startPolling,
  } = useScriptPolling();
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

  // Example video URL
  const exampleVideoUrl = '/assets/example.mp4';

  // Create scenes from subtitleFiles data
  const createScenesFromSubtitleFiles = () => {
    if (
      !pollingState.subtitleFiles ||
      pollingState.subtitleFiles.length === 0
    ) {
      return [];
    }

    return pollingState.subtitleFiles.map(
      (subtitleFile: any, index: number) => {
        // Extract the subtitle content from the object
        const fileName = Object.keys(subtitleFile)[0];
        const narration = subtitleFile[fileName];

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

  // Debug video URLs
  useEffect(() => {
    if (scenes.length > 0 && pollingState.mediaFiles) {
      console.log(
        '🎬 Available video files:',
        Object.keys(pollingState.mediaFiles).filter((key) =>
          key.includes('.mp4'),
        ),
      );
      scenes.forEach((scene, index) => {
        const videoKey = `${pollingState.currentTimestamp}.scene-${index}.mp4`;
        console.log(
          `🎬 Scene ${index} video:`,
          videoKey,
          'URL:',
          pollingState.mediaFiles[videoKey],
        );
      });
    }
  }, [scenes, pollingState.mediaFiles, pollingState.currentTimestamp]);

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
      autoPlayRef.current.timestamp === pollingState.currentTimestamp
    ) {
      return;
    }

    console.log('🎬 Auto-play effect triggered:', {
      scenesLength: scenes.length,
      selectedSceneId: sceneState.selectedSceneId,
      autoAdvanceEnabled: sceneState.autoAdvanceEnabled,
      currentTimestamp: pollingState.currentTimestamp,
    });

    if (scenes.length > 0 && sceneState.selectedSceneId !== null) {
      // Update ref to prevent loops
      autoPlayRef.current = {
        selectedSceneId: sceneState.selectedSceneId,
        timestamp: pollingState.currentTimestamp,
      };

      handleAutoPlay(scenes, pollingState.currentTimestamp);
    }
  }, [sceneState.selectedSceneId, pollingState.currentTimestamp]);

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

    // Handle timestamp and polling
    if (timestampFromUrl) {
      // If step=2 is specified and we don't have subtitle files yet, start polling immediately
      if (stepFromUrl === '2' && !pollingState.subtitleFiles.length) {
        startPolling(timestampFromUrl);
      }
    }
  }, [pollingState.currentTimestamp, pollingState.subtitleFiles]);

  const handleGenerateVideo = async (script: string, duration: number) => {
    await generateVideo(script, duration, (timestamp) => {
      setCurrentStep(2);
      startPolling(timestamp);
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
    if (!scenes.length || !pollingState.currentTimestamp) {
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
            pollingState.currentTimestamp || queryParams.get('timestamp'),
        }),
      });
      console.log('Regenerating audio response:', response);
      console.log('Regenerating pollingState:', pollingState);

      if (!response.ok) {
        throw new Error(`Failed to regenerate audio: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Audio regeneration result:', result);

      // Update the polling state with the new audio/subtitles
      if (result.data && result.data.length > 0) {
        const audioData = result.data[0];
        pollingState.mediaFiles[audioData.audioKey] = audioData.audioUrl;
        pollingState.assFiles[audioData.assKey] = audioData.assFileContent;

        // Force a re-render of just the video components by updating the polling state
        // This will cause only the video components to re-initialize with new data
        const updatedMediaFiles = { ...pollingState.mediaFiles };
        const updatedAssFiles = { ...pollingState.assFiles };

        // Update the polling state directly to trigger re-render
        pollingDispatch({
          type: 'SET_MEDIA_FILES',
          payload: updatedMediaFiles,
        });
        pollingDispatch({
          type: 'SET_ASS_FILES',
          payload: updatedAssFiles,
        });

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
            videoElement.dataset.assFiles = JSON.stringify(
              pollingState.assFiles,
            );
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
      // This might involve refreshing the polling state or updating specific files
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
      // If no scenes, start polling with the current timestamp
      if (pollingState.currentTimestamp) {
        setCurrentStep(2);
        startPolling(pollingState.currentTimestamp);
      } else {
        // Fallback: try to fetch without timestamp
        // This would need to be implemented in the polling hook
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

      {currentStep === 2 && pollingState.isLoadingSubtitles && (
        <div className="flex justify-center items-center h-full">
          <VideoSkeleton />
        </div>
      )}

      {currentStep === 2 &&
        !pollingState.isLoadingSubtitles &&
        scenes.length > 0 && (
          <>
            {scenes.map((scene: any, index: number) => {
              const videoKey = `${pollingState.currentTimestamp}.scene-${index}.mp4`;
              const assKey = `${pollingState.currentTimestamp}.scene-${index}.ass`;
              const isVisible = sceneState.selectedSceneId === scene.id;

              // Debug logging
              console.log(
                '🎬 Scene',
                index,
                'videoKey:',
                videoKey,
                'URL:',
                pollingState.mediaFiles[videoKey],
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
                  {pollingState.mediaFiles[videoKey] &&
                    pollingState.mediaFiles[videoKey].startsWith('http') && (
                      <div className="relative flex justify-center">
                        <video
                          ref={(videoRef) => {
                            if (videoRef) {
                              setupVideoEventListeners(
                                videoRef,
                                scene,
                                scenes,
                                pollingState.assFiles,
                                pollingState.currentTimestamp,
                                index,
                              );
                            }
                          }}
                          onLoadStart={(event) => {
                            console.log(
                              '🎬 Video load start for scene:',
                              index,
                            );
                          }}
                          onCanPlay={(event) => {
                            console.log('🎬 Video can play for scene:', index);
                          }}
                          onError={(event) => {
                            console.error('Video error:', event);
                          }}
                          onLoadedData={(event) => {
                            console.log(
                              '🎬 Video loaded data for scene:',
                              index,
                              'URL:',
                              pollingState.mediaFiles[videoKey],
                            );
                          }}
                          onPlay={(event) => {
                            console.log(
                              '🎬 Video play event for scene:',
                              index,
                            );
                          }}
                          onPause={(event) => {
                            console.log(
                              '🎬 Video pause event for scene:',
                              index,
                            );
                          }}
                          className="rounded-xl shadow-lg border-2 border-gray-600"
                          style={{ width: '60%', height: 'auto' }}
                          controls
                          preload="auto"
                          src={pollingState.mediaFiles[videoKey]}
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

                        {/* Debug Play Button */}
                        {isVisibleByIndex && (
                          <div className="absolute top-4 right-4">
                            <button
                              onClick={() => {
                                const video = document.querySelector(
                                  `video[src*="${videoKey}"]`,
                                ) as HTMLVideoElement;
                                if (video) {
                                  console.log(
                                    '🎬 Manual play button clicked for scene:',
                                    index,
                                  );
                                  video.play().catch((error) => {
                                    console.error(
                                      '🎬 Manual play failed:',
                                      error,
                                    );
                                  });
                                }
                              }}
                              className="px-2 py-1 bg-blue-500 text-white text-xs rounded"
                            >
                              Test Play
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                </div>
              );
            })}

            {/* Scene Audio - Hidden Controls */}
            {scenes.map((scene: any, index: number) => {
              const audioKey = `${pollingState.currentTimestamp}.scene-${index}.mp3`;
              return pollingState.mediaFiles[audioKey] ? (
                <audio
                  key={scene.id}
                  id={`audio-${scene.id}`}
                  className="hidden"
                  src={pollingState.mediaFiles[audioKey]}
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
              {pollingState.isLoadingSubtitles && (
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
              {pollingState.isLoadingSubtitles
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
                        const imageKey = `${pollingState.currentTimestamp}.scene-${index}.jpg`;
                        const imageUrl = pollingState.mediaFiles[imageKey];

                        return (
                          <div key={scene.id}>
                            <EditScene
                              scene={scene}
                              editingScene={sceneState.editingScene}
                              editedNarration={sceneState.editedNarration}
                              onEditScene={handleEditScene}
                              onSaveEdit={(sceneId) =>
                                handleSaveEdit(
                                  sceneId,
                                  scenes,
                                  (updatedScenes) => {
                                    // Update the subtitleFiles in polling state
                                    console.log(
                                      'Scenes updated:',
                                      updatedScenes,
                                    );

                                    // Create updated subtitleFiles from the updated scenes
                                    const updatedSubtitleFiles =
                                      updatedScenes.map(
                                        (scene: any, index: number) => {
                                          const fileName = `${pollingState.currentTimestamp}.scene-${index}.subtitle.json`;
                                          return {
                                            [fileName]: scene.narration,
                                          };
                                        },
                                      );

                                    // Update the subtitleFiles in polling state
                                    pollingDispatch({
                                      type: 'SET_SUBTITLE_FILES',
                                      payload: updatedSubtitleFiles,
                                    });
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
