'use client';

import { useState, useEffect } from 'react';
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

export default function GeneratePage() {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(
    null,
  );
  const [selectedGalleryVideo, setSelectedGalleryVideo] = useState<any>(null);
  const [generationStatus, setGenerationStatus] = useState<
    'idle' | 'queued' | 'processing' | 'completed' | 'error'
  >('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const [scriptData, setScriptData] = useState<any>(null);
  const [editingScene, setEditingScene] = useState<number | null>(null);
  const [editedNarration, setEditedNarration] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingScript, setIsLoadingScript] = useState(false);
  const [hasStartedProcess, setHasStartedProcess] = useState(false);
  const [pollingCount, setPollingCount] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState<string>('');
  const [mediaFiles, setMediaFiles] = useState<{ [key: string]: string }>({});
  const [assFiles, setAssFiles] = useState<{ [key: string]: string }>({});
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null);
  const [autoAdvanceEnabled, setAutoAdvanceEnabled] = useState<boolean>(false);

  // Wrapper function to handle scene selection
  const handleSceneSelection = (sceneId: number) => {
    setSelectedSceneId(sceneId);
  };
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('');
  const { authenticatedFetch, isAuthenticated, user } = useAuthenticatedFetch();

  // Example video URL
  const exampleVideoUrl = '/assets/example.mp4';

  const fetchPreviewData = async (timestamp?: string): Promise<boolean> => {
    // Only set loading true on the first fetch
    if (pollingCount === 0) {
      setIsLoadingScript(true);
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
        setScriptData(data.script);

        // Store media files
        if (data.mediaFiles) {
          setMediaFiles(data.mediaFiles);
        }

        // Store ASS files
        if (data.assFiles) {
          setAssFiles(data.assFiles);
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
          setIsLoadingScript(false);
          console.log('✅ All MP4 scenes have signed URLs, stopping polling');
          return true; // Indicate success
        } else {
          // Still waiting for MP4 files
          console.log(
            `Waiting for MP4 files. Polling attempt ${pollingCount + 1}`,
          );
          return false; // Continue polling
        }
      } else {
        // No script found yet
        console.log(`No script found yet. Polling attempt ${pollingCount + 1}`);
        return false; // Indicate no data yet
      }
    } catch (error) {
      console.error('Error fetching preview data:', error);
      // Only set error and stop loading on actual errors, not when data is not ready
      if (pollingCount === 0) {
        setIsLoadingScript(false);
      }
      return false; // Indicate failure
    }
  };

  // Polling mechanism
  const startPolling = async (timestamp: string) => {
    setCurrentTimestamp(timestamp);
    setPollingCount(0);
    setIsLoadingScript(true); // Set loading immediately when polling starts

    const pollInterval = setInterval(async () => {
      setPollingCount((prev) => prev + 1);
      const success = await fetchPreviewData(timestamp);

      if (success) {
        clearInterval(pollInterval);
        console.log('Script found! Stopping polling.');
      }
    }, 5000); // Poll every 5 seconds

    // Store the interval ID for cleanup
    return pollInterval;
  };

  // Auto-select first scene when script data is loaded (only if not in step 2)
  useEffect(() => {
    if (
      scriptData &&
      scriptData.scenes &&
      scriptData.scenes.length > 0 &&
      selectedSceneId === null &&
      currentStep !== 2
    ) {
      handleSceneSelection(scriptData.scenes[0].id);
    }
  }, [scriptData, selectedSceneId, currentStep]);

  // Auto-play video when selectedSceneId changes (only if auto-advance is enabled)
  useEffect(() => {
    if (
      selectedSceneId !== null &&
      scriptData &&
      scriptData.scenes &&
      autoAdvanceEnabled
    ) {
      const selectedSceneIndex = scriptData.scenes.findIndex(
        (s: any) => s.id === selectedSceneId,
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
          const videoKey = `${currentTimestamp}.scene-${selectedSceneIndex}.mp4`;
          const videoElement = document.querySelector(
            `video[src*="${videoKey}"]`,
          ) as HTMLVideoElement;
          if (videoElement) {
            videoElement.play().catch(console.error);
          }
        }, 300);
      }
    }
  }, [selectedSceneId, scriptData, currentTimestamp, autoAdvanceEnabled]);

  // Cleanup polling on component unmount
  useEffect(() => {
    // Check if there's a timestamp in the URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const timestampFromUrl = urlParams.get('timestamp');

    if (timestampFromUrl && !currentTimestamp) {
      setCurrentTimestamp(timestampFromUrl);
      // If we're on step 2 and have a timestamp, start polling
      if (currentStep === 2) {
        startPolling(timestampFromUrl);
      }
    }

    return () => {
      // Any cleanup needed for polling
    };
  }, [currentStep, currentTimestamp]);

  // Reset subtitle when selected scene changes
  useEffect(() => {
    setCurrentSubtitle('');
  }, [selectedSceneId]);

  const handleGenerateVideo = async (script: string, duration: number) => {
    if (!isAuthenticated) return;

    setHasStartedProcess(true);
    setIsGenerating(true);
    setGeneratedVideoUrl(null);
    setGenerationStatus('queued');
    setStatusMessage('Queuing video generation request...');

    try {
      const timestamp = '1003'; // format(new Date(), 'MMddyyHHmmss');
      // const data = await authenticatedFetch('/api/generate-video', {
      //   method: 'POST',
      //   body: {
      //     prompt: script,
      //     timestamp,
      //     totalDuration: duration,
      //     sceneCount: duration === 60 || duration === 30 ? 6 : 3,
      //   },
      // });

      setGenerationStatus('processing');
      setStatusMessage(
        'Video is being generated... This may take a few minutes.',
      );

      // Simulate completion and transition to step 2

      setGenerationStatus('completed');
      setStatusMessage('Video generated successfully!');

      // Update URL with timestamp query parameter
      const url = new URL(window.location.href);
      url.searchParams.set('timestamp', timestamp);
      window.history.replaceState({}, '', url.toString());

      setCurrentStep(2);

      // Start polling for the specific script file
      await startPolling(timestamp);
    } catch (error) {
      console.error('Error queuing video generation:', error);
      setGenerationStatus('error');
      setStatusMessage('Failed to queue video generation. Please try again.');
      alert('Failed to queue video generation. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateScript = async (prompt: string) => {
    // This function is now handled by the VideoCreator component
    console.log('Script generated:', prompt);
  };

  const handleEditScene = (sceneId: number, narration: string) => {
    setEditingScene(sceneId);
    setEditedNarration(narration);
  };

  const handleSaveEdit = (sceneId: number) => {
    if (scriptData) {
      const updatedScenes = scriptData.scenes.map((scene: any) =>
        scene.id === sceneId ? { ...scene, narration: editedNarration } : scene,
      );
      setScriptData({ ...scriptData, scenes: updatedScenes });
      setEditingScene(null);
      setEditedNarration('');
    }
  };

  const handleCancelEdit = () => {
    setEditingScene(null);
    setEditedNarration('');
  };

  const handleUpdatePreview = () => {
    // TODO: Implement preview update logic
    console.log('Updating preview with edited scenes:', scriptData);
    // Transition to step 3
    setCurrentStep(3);
  };

  const handleExportVideo = () => {
    setIsExporting(true);
    // TODO: Implement actual export logic
    setTimeout(() => {
      setIsExporting(false);
      console.log('Video exported successfully!');
      // Could redirect to a success page or show download link
    }, 2000);
  };

  const handleNextStep = () => {
    if (scriptData) {
      setCurrentStep(2);
    } else {
      // If no script data, start polling with the current timestamp
      if (currentTimestamp) {
        setCurrentStep(2);
        startPolling(currentTimestamp);
      } else {
        // Fallback: try to fetch without timestamp
        fetchPreviewData().then(() => {
          setCurrentStep(2);
        });
      }
    }
  };

  // Right sidebar content
  const rightSidebarContent = (
    <div className="sticky top-4">
      {currentStep === 1 && !generatedVideoUrl && !selectedGalleryVideo && (
        <video
          className="w-[180%] h-[101.25%] rounded-xl shadow-lg group -ml-[60%] mt-16"
          controls
          autoPlay
          muted
          loop
          src={exampleVideoUrl}
        />
      )}

      {currentStep === 2 && scriptData && scriptData.scenes && (
        <>
          {scriptData.scenes.map((scene: any, index: number) => {
            const videoKey = `${currentTimestamp}.scene-${index}.mp4`;
            const assKey = `${currentTimestamp}.scene-${index}.ass`;
            const isVisible = selectedSceneId === scene.id;

            // Find the correct index for the selected scene
            const selectedSceneIndex = scriptData.scenes.findIndex(
              (s: any) => s.id === selectedSceneId,
            );
            const isVisibleByIndex = index === selectedSceneIndex;

            return (
              <div
                key={scene.id}
                className={`w-full h-[600px] ${
                  isVisibleByIndex ? 'block' : 'hidden'
                }`}
              >
                {mediaFiles[videoKey] && (
                  <div className="relative w-full h-full">
                    <video
                      ref={(videoRef) => {
                        if (videoRef && !videoRef.dataset.initialized) {
                          // Mark as initialized to prevent multiple event listener setup
                          videoRef.dataset.initialized = 'true';

                          // Parse subtitles for this scene
                          const assContent = assFiles[assKey];
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
                            setCurrentSubtitle(
                              currentSub ? currentSub.coloredText : '',
                            );
                          };

                          // Add event listeners only once
                          videoRef.addEventListener('play', () => {
                            // Enable auto-advance when user manually plays a video
                            if (!autoAdvanceEnabled) {
                              setAutoAdvanceEnabled(true);
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
                            setCurrentSubtitle('');

                            // Auto-select next scene if available
                            if (scriptData && scriptData.scenes) {
                              const currentSceneIndex =
                                scriptData.scenes.findIndex(
                                  (s: any) => s.id === scene.id,
                                );
                              const nextSceneIndex = currentSceneIndex + 1;

                              if (nextSceneIndex < scriptData.scenes.length) {
                                const nextScene =
                                  scriptData.scenes[nextSceneIndex];
                                setSelectedSceneId(nextScene.id);
                              }
                            }
                          });
                        }
                      }}
                      onLoadStart={(event) => {
                        // Handle visibility changes when video loads
                        if (isVisibleByIndex) {
                          // First, stop ALL videos
                          const allVideos = document.querySelectorAll('video');
                          allVideos.forEach((video) => {
                            if (video !== event.target) {
                              video.pause();
                              video.currentTime = 0;
                            }
                          });

                          // Only auto-play if auto-advance is enabled
                          if (autoAdvanceEnabled) {
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
                      style={{
                        width: '140%',
                        height: '840px',
                        margin: '0 auto',
                      }}
                      controls
                      preload="auto"
                      src={mediaFiles[videoKey]}
                    />

                    {/* Subtitles Overlay - Inside video container */}
                    {isVisibleByIndex && currentSubtitle && (
                      <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 w-4/5 z-10">
                        <p
                          className="text-xl font-medium leading-relaxed text-center"
                          style={{ fontFamily: 'DMSerifText, serif' }}
                        >
                          {parseColoredText(currentSubtitle)}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Scene Audio - Hidden Controls */}
          {scriptData &&
            scriptData.scenes &&
            scriptData.scenes.map((scene: any, index: number) => {
              const audioKey = `${currentTimestamp}.scene-${index}.mp3`;
              return mediaFiles[audioKey] ? (
                <audio
                  key={scene.id}
                  id={`audio-${scene.id}`}
                  className="hidden"
                  src={mediaFiles[audioKey]}
                />
              ) : null;
            })}
        </>
      )}

      {generatedVideoUrl && (
        <video
          className="w-[180%] h-[101.25%] rounded-xl shadow-lg group -ml-[40%]"
          controls
          src={generatedVideoUrl}
        />
      )}

      {selectedGalleryVideo && !generatedVideoUrl && (
        <video
          className="w-[180%] h-[101.25%] rounded-xl shadow-lg group -ml-[40%]"
          controls
          src={selectedGalleryVideo.url}
        />
      )}
    </div>
  );

  return (
    <MainLayout
      showCreditsUpgrade={true}
      rightSidebarContent={rightSidebarContent}
    >
      <div className="flex flex-col justify-start pt-4 lg:pt-8 mb-6 lg:mb-8">
        <ProgressSteps currentStep={currentStep} />

        <div className="relative overflow-hidden">
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
              isGenerating={isGenerating}
              onGenerateVideo={handleGenerateVideo}
              onGenerateScript={handleGenerateScript}
              generationStatus={generationStatus}
              statusMessage={statusMessage}
              showNextButton={
                hasStartedProcess &&
                currentStep === 1 &&
                (scriptData || generationStatus === 'completed')
              }
              onNextStep={handleNextStep}
            />
          </div>

          <div
            className={`absolute top-0 left-0 w-full h-[120%] transition-transform duration-500 ease-in-out px-3 ${
              currentStep === 2
                ? 'translate-x-0'
                : currentStep > 2
                ? '-translate-x-full'
                : 'translate-x-full'
            }`}
          >
            {/* Scene Cards Container */}
            <div className="space-y-4 mb-6 max-h-[598px] overflow-y-auto pr-2 px-4">
              {/* Header */}
              <div className="mb-6 lg:mb-8">
                <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">
                  Review the scenes of your video
                </h1>
                <p className="text-gray-300 text-sm lg:text-base">
                  Edit the text and add new or delete scenes.
                </p>
                {isLoadingScript && (
                  <div className="mt-4 bg-gradient-to-br from-purple-900 via-purple-800 to-blue-900 border border-purple-700 rounded-xl p-3 lg:p-4 shadow-lg">
                    <div className="text-white text-sm">
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Loading video information...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Scene Cards */}
              {isLoadingScript
                ? // Show skeleton placeholders while loading script
                  Array.from({ length: 3 }).map((_, index) => (
                    <EditSceneSkeleton key={index} />
                  ))
                : scriptData &&
                  scriptData.scenes &&
                  scriptData.scenes.map((scene: any, index: number) => {
                    // Get the image URL for this scene
                    const imageKey = `${currentTimestamp}.scene-${index}.jpg`;
                    const imageUrl = mediaFiles[imageKey];
                    console.log('mediaFiles:', mediaFiles);
                    console.log('imageUrl:', imageUrl);

                    return (
                      <EditScene
                        key={scene.id}
                        scene={scene}
                        editingScene={editingScene}
                        editedNarration={editedNarration}
                        onEditScene={handleEditScene}
                        onSaveEdit={handleSaveEdit}
                        onCancelEdit={handleCancelEdit}
                        onEditedNarrationChange={setEditedNarration}
                        imageUrl={imageUrl}
                        isSelected={selectedSceneId === scene.id}
                        onSelect={handleSceneSelection}
                      />
                    );
                  })}
            </div>
          </div>

          {/* Update Preview Button - Outside scrollable container */}
          <div className="text-center mb-6">
            <button
              onClick={handleUpdatePreview}
              disabled={isLoadingScript}
              className={`px-8 py-4 rounded-lg text-lg font-semibold transition-colors ${
                isLoadingScript
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isLoadingScript ? 'Loading...' : 'Update Preview 3 Credits'}
            </button>
          </div>

          {/* Back Button */}
          <div className="absolute bottom-6 left-4">
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
              isExporting={isExporting}
              onBack={() => setCurrentStep(2)}
            />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
