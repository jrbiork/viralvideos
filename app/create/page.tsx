'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import VideoPreview from '../../components/VideoPreview';
import MainLayout from '../../components/MainLayout';
import ProgressSteps from '../../components/ProgressSteps';
import VideoCreator from '../../components/VideoCreator';
import EditScene from '../../components/EditScene';
import EditSceneSkeleton from '../../components/EditSceneSkeleton';
import ExportVideo from '../../components/ExportVideo';
import { parseColoredText } from '../../lib/subtitle-utils';
import { useVideoGeneration } from '../../hooks/useVideoGeneration';
import { useScriptPolling } from '../../hooks/useScriptPolling';
import { useSceneManagement } from '../../hooks/useSceneManagement';
import VideoSkeleton from '../../components/VideoSkeleton';

export default function GeneratePage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);

  // Custom hooks
  const {
    state: generationState,
    generateVideo,
    isAuthenticated,
  } = useVideoGeneration();
  const { state: pollingState, startPolling } = useScriptPolling();
  const {
    state: sceneState,
    handleEditScene,
    handleSaveEdit,
    handleCancelEdit,
    handleSceneSelection,
    handleExportVideo,
    autoSelectFirstScene,
    handleAutoPlay,
    setupVideoEventListeners,
  } = useSceneManagement();

  // Example video URL
  const exampleVideoUrl = '/assets/example.mp4';

  // Auto-select first scene when script data is loaded
  useEffect(() => {
    autoSelectFirstScene(pollingState.scriptData);
  }, [pollingState.scriptData, sceneState.selectedSceneId]);

  // Auto-play video when selectedSceneId changes (only if auto-advance is enabled)
  useEffect(() => {
    handleAutoPlay(pollingState.scriptData, pollingState.currentTimestamp);
  }, [
    sceneState.selectedSceneId,
    pollingState.scriptData,
    pollingState.currentTimestamp,
    sceneState.autoAdvanceEnabled,
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
        setCurrentStep(stepNumber);
      }
    }

    // Handle timestamp and polling
    if (timestampFromUrl) {
      // If step=2 is specified and we don't have script data yet, start polling immediately
      if (stepFromUrl === '2' && !pollingState.scriptData) {
        startPolling(timestampFromUrl);
      }
    }
  }, [pollingState.currentTimestamp, pollingState.scriptData]);

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
    console.log(
      'Updating preview with edited scenes:',
      pollingState.scriptData,
    );
    // Transition to step 3
    setCurrentStep(3);
  };

  const handleNextStep = () => {
    if (pollingState.scriptData) {
      setCurrentStep(2);
    } else {
      // If no script data, start polling with the current timestamp
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
  console.log(
    'Debug - currentStep:',
    currentStep,
    'isLoadingScript:',
    pollingState.isLoadingScript,
  );
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

      {currentStep === 2 && pollingState.isLoadingScript && (
        <div className="flex justify-center items-center h-full">
          <VideoSkeleton />
        </div>
      )}

      {currentStep === 2 &&
        !pollingState.isLoadingScript &&
        pollingState.scriptData &&
        pollingState.scriptData.scenes && (
          <>
            {pollingState.scriptData.scenes.map((scene: any, index: number) => {
              const videoKey = `${pollingState.currentTimestamp}.scene-${index}.mp4`;
              const assKey = `${pollingState.currentTimestamp}.scene-${index}.ass`;
              const isVisible = sceneState.selectedSceneId === scene.id;

              // Find the correct index for the selected scene
              const selectedSceneIndex =
                pollingState.scriptData.scenes.findIndex(
                  (s: any) => s.id === sceneState.selectedSceneId,
                );
              const isVisibleByIndex = index === selectedSceneIndex;

              return (
                <div
                  key={scene.id}
                  className={isVisibleByIndex ? 'block' : 'hidden'}
                >
                  {pollingState.mediaFiles[videoKey] && (
                    <div className="relative flex justify-center">
                      <video
                        ref={(videoRef) => {
                          if (videoRef) {
                            setupVideoEventListeners(
                              videoRef,
                              scene,
                              pollingState.scriptData,
                              pollingState.assFiles,
                              pollingState.currentTimestamp,
                              index,
                            );
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
                            if (sceneState.autoAdvanceEnabled) {
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
                    </div>
                  )}
                </div>
              );
            })}

            {/* Scene Audio - Hidden Controls */}
            {pollingState.scriptData &&
              pollingState.scriptData.scenes &&
              pollingState.scriptData.scenes.map(
                (scene: any, index: number) => {
                  const audioKey = `${pollingState.currentTimestamp}.scene-${index}.mp3`;
                  return pollingState.mediaFiles[audioKey] ? (
                    <audio
                      key={scene.id}
                      id={`audio-${scene.id}`}
                      className="hidden"
                      src={pollingState.mediaFiles[audioKey]}
                    />
                  ) : null;
                },
              )}
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
                (pollingState.scriptData ||
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
            <div className="space-y-4 mb-6 max-h-[598px] overflow-y-auto pr-2 px-4">
              {pollingState.isLoadingScript && (
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
              {pollingState.isLoadingScript
                ? // Show skeleton placeholders while loading script
                  Array.from({ length: 3 }).map((_, index) => (
                    <EditSceneSkeleton key={index} />
                  ))
                : pollingState.scriptData &&
                  pollingState.scriptData.scenes &&
                  pollingState.scriptData.scenes.map(
                    (scene: any, index: number) => {
                      // Get the image URL for this scene
                      const imageKey = `${pollingState.currentTimestamp}.scene-${index}.jpg`;
                      const imageUrl = pollingState.mediaFiles[imageKey];

                      return (
                        <EditScene
                          key={scene.id}
                          scene={scene}
                          editingScene={sceneState.editingScene}
                          editedNarration={sceneState.editedNarration}
                          onEditScene={handleEditScene}
                          onSaveEdit={(sceneId) =>
                            handleSaveEdit(
                              sceneId,
                              pollingState.scriptData,
                              (updatedScript) => {
                                // This would need to be handled by updating the polling state
                                console.log('Script updated:', updatedScript);
                              },
                            )
                          }
                          onCancelEdit={handleCancelEdit}
                          onEditedNarrationChange={(value) => {
                            // This would need to be handled by the scene management hook
                            console.log('Narration changed:', value);
                          }}
                          imageUrl={imageUrl}
                          isSelected={sceneState.selectedSceneId === scene.id}
                          onSelect={handleSceneSelection}
                        />
                      );
                    },
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
