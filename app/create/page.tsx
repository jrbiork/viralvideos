'use client';

import { useState, useEffect } from 'react';
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

  // Custom hooks
  const {
    state: generationState,
    generateVideo,
    isAuthenticated,
  } = useVideoGeneration();
  const { state: pollingState, startPolling } = useScriptPolling();
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

  const handleRegenerateAudio = async (sceneId: number) => {
    if (!pollingState.scriptData || !pollingState.currentTimestamp) {
      console.error('No script data or timestamp available');
      return;
    }

    const queryParams = new URLSearchParams(window.location.search);

    try {
      // Find the scene to regenerate
      const scene = pollingState.scriptData.scenes.find(
        (s: any) => s.id === sceneId,
      );
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

      // Update the polling state with the new audio/subtitles
      // Example response:
      // {
      //     "data": [
      //         {
      //             "sceneId": 1,
      //             "audioKey": "1004.scene-1.mp3",
      //             "assKey": "1004.scene-1.ass",
      //             "audioUrl": "https://video-parts-445241615553-us-east-1.s3.us-east-1.amazonaws.com/b49864f8-70a1-70f1-cc63-70f4f8c1985e/1004.scene-1.mp3?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAWPKTX4TA2UH66GCE%2F20250824%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20250824T121459Z&X-Amz-Expires=3600&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEO3%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEaCXVzLWVhc3QtMSJHMEUCIECfc5nE77wRVKlWeQpyGj0tRBVk%2BGx5K6hhyJ7AkPSdAiEAl6KIQyN3LWAuP8GEqaAtdjpUv0tEMQEqgF%2BLyqOVZHIq0wMIRRAEGgw0NDUyNDE2MTU1NTMiDG5JZ%2FrlxbWz9vxFBCqwA4Z87YGOUzeLc76GtBo3NUa2E0Ef%2B%2BJH8SAB1FJZBV565QnWwAOw30EHyuuFsJMgM4SttNcHJsuEbyrAW%2FRxBQBQQjzusmfW2ouve3CG5OOGkeV66T8fVUH2RDHNiAWHq6P62RRfqgBqoBgt1stwEI5LhnydTB%2FItGnrkitOeyourXUPtu51T7yZNlY2HgmSDYQg2zDHLDMS86kyJnRK8uV%2BOXbwGKEXJgq7WPkVoZGdPHfqDwDVqzR3jRLOKRbaCmwUTyV%2BFHaua83SASwsJl4o%2FhTrwAlfqE7xIf0KLrxqF0OkA7ipJ51Vpxi6wEiUQo1WND2XI%2FrqO6VX4T7SSf%2FfixDQIQmPbsw795VoKJS%2Bc9CQps8Hn1Em5x1LqmGlj%2B5bLGn%2FwTljYfvPRNIsPsnxkyWjtQnFuoFteyJM7F2BxehXRgVX8CTToGWsLzrPeYHz%2Fz6GqvoGARsMtxJzlMNbthwsfC7IkaScIV5o2WR1bRiGrDK4MtAMnh1qEslYKHZv1Zl9xULaBoSY66c%2Fr%2FcmubNQx5jyUgLq0sdhR0ZZsvq5dOQE%2B2DLXxknLJniZzC%2BhKzFBjqeASgIVzT5hOWm7Nz4Tfns8iZTDWwdnfnRE93nKXIdkbJw3hEn08bCT8hApt8G3ilsfyoTb7jhQOGBGNUQfyjLaxWjfji4lPBMRFNWpU0gHW16oDxulXpjFL46a%2B%2BSyqQZ%2FIPcMQLJ37Hg762RfZRiP5sDglzOSb%2FilFmzuy6%2F9xJ4CF3FyVy4JRx2lCjHG9HLJ5mbZCqkgxvuIKXfbTW5&X-Amz-Signature=40e391939462dcfa19b6c079048bfa8bb95669be237768a0c7d2347967a69b2b&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject",
      //             "assFileContent": "[Script Info]\nTitle: Test\nScriptType: v4.00+\nWrapStyle: 1\nScaledBorderAndShadow: yes\nYCbCr Matrix: None\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DMSerifText,100,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,6,6,2,10,10,480,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:00.54,Default,,,,,,{\\c&H00FFFF&}SHENZHEN{\\c&H00FFFFFF&} DAZZLES\nDialogue: 0,0:00:00.54,0:00:00.96,Default,,,,,,{\\c&H00FFFFFF&}SHENZHEN {\\c&H00FFFF&}DAZZLES\nDialogue: 0,0:00:00.96,0:00:01.18,Default,,,,,,{\\c&H00FFFF&}AT{\\c&H00FFFFFF&} NIGHT\nDialogue: 0,0:00:01.18,0:00:01.44,Default,,,,,,{\\c&H00FFFFFF&}AT {\\c&H00FFFF&}NIGHT\nDialogue: 0,0:00:02.08,0:00:02.34,Default,,,,,,{\\c&H00FFFF&}SHOWCASING{\\c&H00FFFFFF&} ITS\nDialogue: 0,0:00:02.34,0:00:02.60,Default,,,,,,{\\c&H00FFFFFF&}SHOWCASING {\\c&H00FFFF&}ITS\nDialogue: 0,0:00:02.60,0:00:03.04,Default,,,,,,{\\c&H00FFFF&}VIBRANT{\\c&H00FFFFFF&} ILLUMINATED\nDialogue: 0,0:00:03.04,0:00:03.70,Default,,,,,,{\\c&H00FFFFFF&}VIBRANT {\\c&H00FFFF&}ILLUMINATED\nDialogue: 0,0:00:03.70,0:00:04.28,Default,,,,,,{\\c&H00FFFF&}ARCHITECTURE\n"
      //         }
      //     ],
      //     "message": "Audio and subtitles generated successfully"
      // }

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

        // Force a re-render by updating the polling state
        // This will cause the video components to re-initialize with new data
        startPolling(pollingState.currentTimestamp);

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
    }
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
            <div className="space-y-4 mb-6 h-full overflow-y-auto pr-2 px-4">
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
                  pollingState.scriptData.scenes && (
                    <>
                      {/* Add scene button before first scene */}
                      <AddSceneButton
                        onAddScene={handleAddScene}
                        position={0}
                        isFirst={true}
                      />

                      {/* Scene Cards */}
                      {pollingState.scriptData.scenes.map(
                        (scene: any, index: number) => {
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
                                    pollingState.scriptData,
                                    (updatedScript) => {
                                      // This would need to be handled by updating the polling state
                                      console.log(
                                        'Script updated:',
                                        updatedScript,
                                      );
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
                              />

                              {/* Add scene button after each scene (except the last one) */}
                              {index <
                                pollingState.scriptData.scenes.length - 1 && (
                                <AddSceneButton
                                  onAddScene={handleAddScene}
                                  position={index + 1}
                                />
                              )}
                            </div>
                          );
                        },
                      )}

                      {/* Add scene button after last scene */}
                      <AddSceneButton
                        onAddScene={handleAddScene}
                        position={pollingState.scriptData.scenes.length}
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
