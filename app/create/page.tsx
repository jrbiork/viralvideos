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
    isLoadingVideoScenes: true,
    currentTimestamp: '',
    mediaFiles: {} as { [key: string]: string },
    assFiles: {} as { [key: string]: string },
    subtitles: {} as { [key: string]: string },
    scenes: [] as any[],
  });

  console.log('videoGenerationState:', videoGenerationState);
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
          // Unknown message type
          break;
      }
    },
    onConnect: () => {
      // WebSocket connected
    },
    onDisconnect: () => {
      // WebSocket disconnected
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
    },
  });

  // Handle script creation
  const handleScriptCreated = (data: any) => {
    setVideoGenerationState((prev) => ({
      ...prev,
      currentTimestamp: data.timestamp || prev.currentTimestamp,
      scenes: data.scenes || [],
      isLoadingScript: false,
      isLoadingVideoScenes: true, // Start loading video scenes after script is created
    }));
  };

  // Handle image creation
  const handleImageCreated = (data: any) => {
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
    const mediaFiles: { [key: string]: string } = {};
    let assFiles: { [key: string]: string } = {};

    // Handle ASS content - array of objects: [{ "timestamp.scene-id.ass": "ass-content" }]
    if (data.assContents && Array.isArray(data.assContents)) {
      // Store ASS files
      data.assContents.forEach((assObj: { [key: string]: string }) => {
        Object.assign(assFiles, assObj);
      });
    }

    // Handle subtitle URLs (ASS files) - array of objects: [{ "timestamp.scene-id.ass": "ass-url" }]
    if (data.subtitleUrls && Array.isArray(data.subtitleUrls)) {
      // Store ASS files
      data.subtitleUrls.forEach((assObj: { [key: string]: string }) => {
        Object.assign(assFiles, assObj);
      });
    }

    // Handle audio URLs if present
    if (data.audioUrls && Array.isArray(data.audioUrls)) {
      data.audioUrls.forEach((audioObj: { [key: string]: string }) => {
        Object.assign(mediaFiles, audioObj);
      });
    }

    // Handle narration URLs (MP3 files) - array of objects: [{ "timestamp.scene-id.mp3": "mp3-url" }]
    if (data.narrationUrls && Array.isArray(data.narrationUrls)) {
      data.narrationUrls.forEach((audioObj: { [key: string]: string }) => {
        Object.assign(mediaFiles, audioObj);
      });
    }

    // Extract subtitle text from the subtitles array for editing
    let subtitles: { [key: string]: string } = {};
    if (data.subtitles && Array.isArray(data.subtitles)) {
      data.subtitles.forEach((subtitleObj: any) => {
        const fileName = Object.keys(subtitleObj)[0];
        const subtitleData = subtitleObj[fileName];
        if (subtitleData && subtitleData.text) {
          subtitles[fileName] = subtitleData.text;
        }
      });
    }

    setVideoGenerationState((prev) => ({
      ...prev,
      isLoadingScript: false, // Set to false when audio/subtitles are ready
      currentTimestamp: data.timestamp || prev.currentTimestamp,
      mediaFiles: { ...prev.mediaFiles, ...mediaFiles },
      subtitles: subtitles, // Store subtitle texts for editing
      assFiles: { ...prev.assFiles, ...assFiles }, // Store ASS files
    }));
  };

  // Handle video scene creation
  const handleVideoSceneCreated = (data: any) => {
    const mediaFiles: { [key: string]: string } = {};

    // Handle video effects - array of objects: [{ "timestamp.scene-id.mp4": "signed-url" }]
    if (data.videoEffectsUrls && Array.isArray(data.videoEffectsUrls)) {
      data.videoEffectsUrls.forEach((videoObj: { [key: string]: string }) => {
        Object.assign(mediaFiles, videoObj);
      });
    }

    setVideoGenerationState((prev) => ({
      ...prev,
      isLoadingVideoScenes: false, // Set to false when video scenes are created
      currentTimestamp: data.timestamp || prev.currentTimestamp,
      mediaFiles: { ...prev.mediaFiles, ...mediaFiles },
    }));
  };

  // Handle video completion
  const handleVideoCompleted = (data: any) => {
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

  // Custom handleEditScene that uses subtitle text from subtitles
  const handleEditSceneWithSubtitle = (sceneId: number, narration: string) => {
    // Try to get subtitle text from subtitles
    const subtitleKey = `${videoGenerationState.currentTimestamp}.scene-${sceneId}.subtitle`;
    const subtitleText =
      videoGenerationState.subtitles[subtitleKey] || narration;

    handleEditScene(sceneId, subtitleText);
  };

  // Example video URL
  const exampleVideoUrl = '/assets/example.mp4';

  // Create scenes from subtitles data
  const createScenesFromSubtitleFiles = () => {
    const subtitles = videoGenerationState.subtitles;
    const subtitleKeys = Object.keys(subtitles);

    if (subtitleKeys.length === 0) {
      return [];
    }

    return subtitleKeys.map((subtitleKey, index) => {
      // Extract the actual scene index from the subtitle key
      const sceneIndexMatch = subtitleKey.match(/scene-(\d+)\./);
      const sceneIndex = sceneIndexMatch ? parseInt(sceneIndexMatch[1]) : index;

      const narration = subtitles[subtitleKey] || `Scene ${sceneIndex + 1}`;

      return {
        id: sceneIndex,
        description: `Scene ${sceneIndex + 1}`,
        narration: narration,
        duration: 5, // Default duration
      };
    });
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

    if (scenes.length > 0 && sceneState.selectedSceneId !== null) {
      // Update ref to prevent loops
      autoPlayRef.current = {
        selectedSceneId: sceneState.selectedSceneId,
        timestamp: videoGenerationState.currentTimestamp,
      };

      handleAutoPlay(scenes, videoGenerationState.currentTimestamp);
    }
  }, [sceneState.selectedSceneId, videoGenerationState.currentTimestamp]);

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
            isLoadingSubtitles: true,
          }));

          // call fetch-preview api
          const previewResponse = await fetch(
            `/api/fetch-preview?timestamp=${timestampFromUrl}`,
            {
              method: 'GET',
            },
          );

          if (previewResponse.ok) {
            const previewData = await previewResponse.json();

            if (previewData.success && previewData.data) {
              // Process the preview data and update state
              const mediaFiles: { [key: string]: string } = {};
              const subtitleFiles: any[] = [];
              const subtitleTexts: { [key: string]: string } = {};
              const subtitles: any[] = [];
              const assFiles: { [key: string]: string } = {};

              // Process each scene and fetch all content from pre-signed URLs
              for (const [sceneKey, sceneData] of Object.entries(
                previewData.data,
              ) as [string, any][]) {
                const sceneIndex = sceneKey
                  .split('.')
                  .pop()
                  ?.replace('scene-', '');
                if (sceneIndex !== undefined) {
                  const index = parseInt(sceneIndex);

                  // Add media files (pre-signed URLs)
                  mediaFiles[`${timestampFromUrl}.scene-${index}.mp3`] =
                    sceneData.audioUrl;
                  mediaFiles[`${timestampFromUrl}.scene-${index}.mp4`] =
                    sceneData.videoUrl;
                  mediaFiles[`${timestampFromUrl}.scene-${index}.jpg`] =
                    sceneData.imageUrl;

                  // Fetch subtitle content through our API to avoid CORS
                  let subtitleContent = '';
                  try {
                    console.log(
                      `Fetching subtitle from: ${sceneData.subtitleUrl}`,
                    );
                    const subtitleResponse = await fetch('/api/fetch-content', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        url: sceneData.subtitleUrl,
                        type: 'subtitle',
                      }),
                    });
                    console.log(
                      `Subtitle response status: ${subtitleResponse.status}`,
                    );
                    if (subtitleResponse.ok) {
                      const subtitleData = await subtitleResponse.json();
                      console.log(
                        `Subtitle data for scene ${index}:`,
                        subtitleData,
                      );
                      subtitleContent =
                        subtitleData.fullText || subtitleData.text || '';
                      console.log(
                        `Extracted subtitle content: "${subtitleContent}"`,
                      );
                    } else {
                      console.error(
                        `Failed to fetch subtitle for scene ${index}: ${subtitleResponse.status}`,
                      );
                    }
                  } catch (error) {
                    console.error('Error fetching subtitle content:', error);
                  }

                  // Fetch ASS content through our API to avoid CORS
                  let assContent = '';
                  try {
                    console.log(`Fetching ASS from: ${sceneData.assUrl}`);
                    const assResponse = await fetch('/api/fetch-content', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        url: sceneData.assUrl,
                        type: 'ass',
                      }),
                    });
                    console.log(`ASS response status: ${assResponse.status}`);
                    if (assResponse.ok) {
                      const assData = await assResponse.json();
                      assContent = assData.content || '';
                      console.log(
                        `ASS content length for scene ${index}: ${assContent.length}`,
                      );
                    } else {
                      console.error(
                        `Failed to fetch ASS for scene ${index}: ${assResponse.status}`,
                      );
                    }
                  } catch (error) {
                    console.error('Error fetching ASS content:', error);
                  }

                  // Add subtitle files with actual content
                  subtitleFiles.push({
                    [`${timestampFromUrl}.scene-${index}.subtitle.json`]:
                      subtitleContent,
                  });

                  // Add subtitle texts for editing with actual content
                  subtitleTexts[
                    `${timestampFromUrl}.scene-${index}.subtitle.json`
                  ] = subtitleContent;

                  // Add subtitles array for editing with actual content
                  subtitles.push({
                    [`${timestampFromUrl}.scene-${index}.subtitle`]: {
                      text: subtitleContent,
                    },
                  });

                  // Add ASS files with actual content
                  assFiles[`${timestampFromUrl}.scene-${index}.ass`] =
                    assContent;
                }
              }

              // Update the video generation state with the fetched data
              setVideoGenerationState((prev) => ({
                ...prev,
                currentTimestamp: timestampFromUrl,
                mediaFiles: { ...prev.mediaFiles, ...mediaFiles },
                subtitles: subtitleTexts,
                assFiles: assFiles,
                isLoadingScript: false,
                isLoadingVideoScenes: false, // Set to false since we have all the data
              }));
            }
          }
        }
      }
    };

    handleUrlParams();
  }, []);

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
  };

  const handleUpdatePreview = () => {
    // TODO: Implement preview update logic
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

      if (!response.ok) {
        throw new Error(`Failed to regenerate audio: ${response.statusText}`);
      }

      const result = await response.json();

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
            // Update the video element's dataset with the new ASS files
            videoElement.dataset.assFiles = JSON.stringify({
              ...videoGenerationState.assFiles,
              [audioData.assKey]: audioData.assFileContent,
            });

            // Force the video to trigger a timeupdate event to refresh subtitles
            // This will make the video event listeners use the updated ASS content
            const timeUpdateEvent = new Event('timeupdate');
            videoElement.dispatchEvent(timeUpdateEvent);

            // Also directly update the subtitle with the new content
            const newSubtitles = parseAssFile(audioData.assFileContent);
            const currentTime = videoElement.currentTime;
            const currentSub = newSubtitles.find(
              (sub: any) => currentTime >= sub.start && currentTime <= sub.end,
            );
            if (currentSub) {
              sceneDispatch({
                type: 'SET_CURRENT_SUBTITLE',
                payload: currentSub.coloredText,
              });
            }
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

      {currentStep === 2 && videoGenerationState.isLoadingVideoScenes && (
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
                            setupVideoEventListeners(
                              videoRef,
                              scene,
                              scenes,
                              videoGenerationState.assFiles,
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
              {videoGenerationState.isLoadingVideoScenes
                ? // Show skeleton placeholders while loading video scenes
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
