'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import MainLayout from '../../components/MainLayout';
import ProgressSteps from '../../components/ProgressSteps';
import VideoCreator from '../../components/VideoCreator';
import EditScene, { Scene } from '../../components/EditScene';
import EditSceneSkeleton from '../../components/EditSceneSkeleton';
import RightSidebar from '../../components/RightSidebar';
import { DEFAULT_VOICE, DEFAULT_LANGUAGE } from '../../lib/constants';
import AddSceneButton from '../../components/AddSceneButton';
import ExportVideo from '../../components/ExportVideo';
import Toaster from '../../components/Toaster';
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
  const [selectedVoice, setSelectedVoice] = useState(DEFAULT_VOICE); // Track voice selection
  const [selectedLanguage, setSelectedLanguage] = useState(DEFAULT_LANGUAGE); // Track language selection
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
  const [toasterType, setToasterType] = useState<'success' | 'error'>('error');

  // Additional scenes state (for user-added scenes with position tracking)
  const [additionalScenes, setAdditionalScenes] = useState<
    { scene: Scene; position: number }[]
  >([]);

  // Helper function to show toaster messages
  const showToasterMessage = (message: string, type: 'success' | 'error') => {
    setToasterMessage(message);
    setToasterType(type);
    setShowToaster(true);
  };

  // Custom handleAddScene function to add new scenes
  const handleAddSceneCustom = (position: number) => {
    const newScene = {
      id: Date.now(), // Use timestamp as unique ID
      sceneIndex: position, // Will be properly reindexed later
      description: `New scene ${additionalScenes.length + 1}`,
      narration: 'Enter your scene description here...',
      duration: 5, // Default duration
      isUserAdded: true, // Flag to identify user-added scenes
    };

    // Add the new scene with its position
    setAdditionalScenes((prev) => {
      const updated = [...prev, { scene: newScene, position }];
      console.log('📝 Added new scene:', newScene);
      console.log('📝 Updated additionalScenes:', updated);
      return updated;
    });

    showToasterMessage(
      `New scene added at position ${position + 1}`,
      'success',
    );
  };

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
        // case 'video_scene_created':
        //   handleVideoSceneCreated(message.data);
        //   break;
        case 'preview_completed':
          handlePreviewCompleted(message.data);
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

  // Handle video completion
  const handleVideoCompleted = (data: any) => {
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

    // set toaster message
    showToasterMessage('Video generated successfully', 'success');
  };

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
  // const handleVideoSceneCreated = (data: any) => {
  //   if (data.manifest) {
  //     setVideoGenerationState((prev) => ({
  //       ...prev,
  //       isLoadingVideoScenes: false, // Set to false when video scenes are created
  //       currentTimestamp: data.timestamp || prev.currentTimestamp,
  //       manifest: data.manifest,
  //     }));
  //   }
  // };

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
  };

  // Handle insufficient credits
  const handleInsufficientCredits = (data: any) => {
    console.log('Insufficient credits:', data);
    showToasterMessage('Insufficient credits', 'error');
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
      mediaFiles[`${timestamp}.scene-${sceneId}.png`] = files.png || '';
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
  const createScenesFromSubtitleFiles = useCallback((): Scene[] => {
    if (!videoGenerationState.manifest?.scenes) return [];

    const subtitles = getSubtitles();
    const subtitleKeys = Object.keys(subtitles).sort((a, b) => {
      const indexA = parseInt(a.match(/scene-(\d+)\./)?.[1] || '0');
      const indexB = parseInt(b.match(/scene-(\d+)\./)?.[1] || '0');
      return indexA - indexB;
    });

    return subtitleKeys.map((subtitleKey: string, index: number) => {
      // Extract the actual scene index from the subtitle key
      const sceneIndexMatch = subtitleKey.match(/scene-(\d+)\./);
      const sceneIndex = sceneIndexMatch ? parseInt(sceneIndexMatch[1]) : index;

      const narration = subtitles[subtitleKey] || `Scene ${sceneIndex + 1}`;

      // Make sure videoGenerationState.manifest is not null or undefined
      const sceneManifest = videoGenerationState.manifest;

      return {
        id: sceneIndex,
        description: `Scene ${sceneIndex + 1}`,
        narration: narration,
        duration: Math.floor(
          (sceneManifest?.totalDuration || 30) /
            (sceneManifest?.sceneCount || 3),
        ),
        sceneIndex: index, // Ensure sceneIndex is set for original scenes
      };
    });
  }, [getSubtitles, videoGenerationState.manifest]);

  // Combine original scenes with additional user-added scenes
  const originalScenes = useMemo(
    () => createScenesFromSubtitleFiles(),
    [createScenesFromSubtitleFiles],
  );

  const scenes = useMemo(() => {
    // Start with original scenes
    let allScenes: Scene[] = [...originalScenes];

    console.log(
      '🔄 Initial allScenes (from originalScenes):',
      allScenes.map((s) => ({ id: s.id, description: s.description })),
    );

    // Sort additional scenes by position and insert them correctly
    const sortedAdditionalScenes = [...additionalScenes].sort(
      (a, b) => a.position - b.position,
    );

    console.log(
      '📝 Sorted additionalScenes to insert:',
      sortedAdditionalScenes.map((item) => ({
        id: item.scene.id,
        position: item.position,
        description: item.scene.description,
      })),
    );

    // Insert additional scenes at their correct positions
    sortedAdditionalScenes.forEach(
      ({ scene, position }: { scene: Scene; position: number }) => {
        // Simple approach: insert at the exact position requested
        // But ensure we don't go beyond the current array length
        const insertPosition = Math.min(position, allScenes.length);

        console.log(
          `Inserting scene (ID: ${scene.id}, Desc: ${scene.description}) at position ${position}, actual insert at ${insertPosition}. Current array length: ${allScenes.length}`,
        );

        allScenes.splice(insertPosition, 0, scene);

        console.log(
          '🖼️ allScenes after insertion:',
          allScenes.map((s) => ({ id: s.id, description: s.description })),
        );
      },
    );

    // Reindex all scenes to have proper sequential sceneIndex
    allScenes = allScenes.map((scene: Scene, index: number) => ({
      ...scene,
      sceneIndex: index, // Set proper sequential sceneIndex
    }));

    console.log(
      '🔄 Final scenes with reindexed sceneIndex:',
      allScenes.map((s) => ({
        id: s.id,
        sceneIndex: s.sceneIndex,
        description: s.description,
      })),
    );
    return allScenes;
  }, [originalScenes, additionalScenes]);

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

  const handleGenerateVideo = async (
    script: string,
    duration: 30 | 60,
    voice?: string,
  ) => {
    // Update the selected voice state for use in regeneration
    if (voice) {
      setSelectedVoice(voice);
    }

    await generateVideo(
      script,
      duration,
      (timestamp) => {
        setCurrentStep(2);
        setVideoGenerationState((prev) => ({
          ...prev,
          currentTimestamp: timestamp,
          isLoadingSubtitles: true,
        }));
      },
      voice,
    );
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
          voice: selectedVoice, // Include the selected voice
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

  const handleCombineVideo = async () => {
    if (!videoGenerationState.currentTimestamp) {
      console.error('No timestamp available');
      return;
    }

    try {
      const response = await fetch('/api/combine-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timestamp: videoGenerationState.currentTimestamp,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to combine video: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('🎬 Combine video request queued:', result);
      showToasterMessage('Video combination started!', 'success');
    } catch (error) {
      console.error('Error combining video:', error);
      showToasterMessage('Failed to combine video. Please try again.', 'error');
    }
  };

  // Right sidebar content
  const rightSidebarContent = (
    <RightSidebar
      currentStep={currentStep}
      generationState={generationState}
      videoGenerationState={videoGenerationState}
      scenes={scenes}
      sceneState={sceneState}
      getMediaFiles={getMediaFiles}
      getAssFiles={getAssFiles}
      setupVideoEventListeners={setupVideoEventListeners}
      parseColoredText={parseColoredText}
      exampleVideoUrl={exampleVideoUrl}
    />
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
                        onAddScene={handleAddSceneCustom}
                        position={0}
                        isFirst={true}
                        disabled={false}
                      />

                      {/* Scene Cards */}
                      {scenes.map((scene: any, index: number) => {
                        // Get the image URL for this scene (only for original scenes)
                        // For original scenes, we need to find their original index in the manifest
                        let imageUrl = undefined;
                        if (
                          !scene.isUserAdded &&
                          videoGenerationState.manifest?.scenes
                        ) {
                          // Find the original scene index from the manifest
                          const originalSceneIndex =
                            videoGenerationState.manifest.scenes.findIndex(
                              (manifestScene) =>
                                manifestScene.sceneIndex === scene.id,
                            );
                          if (originalSceneIndex !== -1) {
                            const imageKey = `${videoGenerationState.currentTimestamp}.scene-${originalSceneIndex}.png`;
                            imageUrl = getMediaFiles()[imageKey];
                          }
                        }

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

                                    // Update additionalScenes state for user-added scenes
                                    setAdditionalScenes((prev) =>
                                      prev.map((item) =>
                                        item.scene.id === sceneId
                                          ? {
                                              ...item,
                                              scene: {
                                                ...item.scene,
                                                narration:
                                                  sceneState.editedNarration,
                                              },
                                            }
                                          : item,
                                      ),
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
                                onAddScene={handleAddSceneCustom}
                                position={index + 1}
                                disabled={false}
                              />
                            )}
                          </div>
                        );
                      })}

                      {/* Add scene button after last scene */}
                      <AddSceneButton
                        onAddScene={handleAddSceneCustom}
                        position={scenes.length}
                        isLast={true}
                        disabled={false}
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

          {/* Combine Video Button */}
          <div className="absolute bottom-4 right-4">
            <button
              onClick={handleCombineVideo}
              className="px-4 py-2 bg-green-500 text-white hover:bg-green-600 rounded-lg transition-colors"
            >
              Generate Video
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

      {/* Toaster */}
      <Toaster
        message={toasterMessage}
        type={toasterType}
        isVisible={showToaster}
        onClose={() => setShowToaster(false)}
      />
    </MainLayout>
  );
}
