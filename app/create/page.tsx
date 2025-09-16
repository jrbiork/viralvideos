'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import MainLayout from '../../components/MainLayout';
import ProgressSteps from '../../components/ProgressSteps';
import VideoCreator from '../../components/VideoCreator';
import { Scene } from '../../components/EditScene';

import RightSidebar from '../../components/RightSidebar';
import SceneCardsContainer from '../../components/SceneCardsContainer';
import { DEFAULT_VOICE } from '../../lib/constants';

import ExportVideo from '../../components/ExportVideo';
import Toaster from '../../components/Toaster';
import { parseColoredText } from '../../lib/subtitle-utils';
import { useVideoGeneration } from '../../hooks/useVideoGeneration';
import { useSceneManagement } from '../../hooks/useSceneManagement';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useWebSocketHandlers } from '../../hooks/useWebSocketHandlers';

import { Manifest } from '../types/manifest';

export default function GeneratePage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedVoice, setSelectedVoice] = useState(DEFAULT_VOICE); // Track voice selection
  const [script, setScript] = useState('');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<'30s' | '60s'>(
    '30s',
  );
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<number | null>(
    null,
  );
  const [creatingSceneId, setCreatingSceneId] = useState<number | null>(null);
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  const [videoCompletionData, setVideoCompletionData] =
    useState<Manifest | null>(null);
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
    manifest: undefined as Manifest | undefined,
  });

  // Toaster state
  const [showToaster, setShowToaster] = useState(false);
  const [toasterMessage, setToasterMessage] = useState('');
  const [toasterType, setToasterType] = useState<'success' | 'error' | 'info'>(
    'error',
  );

  // Additional scenes state (for user-added scenes with position tracking)
  const [additionalScenes, setAdditionalScenes] = useState<
    { scene: Scene; position: number }[]
  >([]);

  // State to track which scene is being deleted
  const [deletingSceneId, setDeletingSceneId] = useState<number | null>(null);

  // State to track which original scenes are removed
  const [removedOriginalScenes, setRemovedOriginalScenes] = useState<
    Set<number>
  >(new Set());

  // Helper function to show toaster messages
  const showToasterMessage = (
    message: string,
    type: 'success' | 'error' | 'info',
  ) => {
    setToasterMessage(message);
    setToasterType(type);
    setShowToaster(true);
  };

  // Custom handleAddScene function to add new scenes
  const handleAddSceneCustom = (position: number) => {
    // Validation: Only allow one additional scene to be added at a time
    if (additionalScenes.length > 0) {
      showToasterMessage(
        'Please complete the current scene before adding another one',
        'error',
      );
      return;
    }

    // Generate a unique ID that is +1 from the maximum existing scene ID
    // Consider both original scenes and additional user-added scenes
    const allSceneIds = [
      ...scenes.map((s) => s.id),
      ...additionalScenes.map((item) => item.scene.id),
    ];
    const maxId = allSceneIds.length > 0 ? Math.max(...allSceneIds) : 0;
    const newId = maxId + 1;

    const newScene = {
      id: newId,
      scenePosition: position, // Will be properly reindexed later
      description: `New scene ${additionalScenes.length + 1}`,
      narration: '',
      duration: 5, // Default duration
      isUserAdded: true, // Flag to identify user-added scenes
    };

    console.log('🔄 New scene:', newScene, additionalScenes.length + 1);

    // Add the new scene with its position
    setAdditionalScenes((prev) => {
      const updated = [...prev, { scene: newScene, position }];
      console.log('📝 Added new scene:', newScene);
      console.log('📝 Updated additionalScenes:', updated);
      return updated;
    });
  };

  // Handle deleting original scenes (mark as removed)
  const handleDeleteScene = (sceneId: number) => {
    // Set the deleting state to show disabled overlay
    setDeletingSceneId(sceneId);

    console.log('[Scenes] Marking original scene as removed:', sceneId);
    // Mark original scene as removed
    setRemovedOriginalScenes((prev) => new Set(prev).add(sceneId));
    showToasterMessage('Scene marked as removed', 'success');
    setDeletingSceneId(null);
  };

  // Handle deleting user-added scenes (actually remove from array)
  const handleDeleteUserAddedScene = (sceneId: number) => {
    // Remove user-added scene from array immediately
    setAdditionalScenes((prev) =>
      prev.filter((item) => item.scene.id !== sceneId),
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

  // WebSocket handlers hook
  const { handleWebSocketMessage } = useWebSocketHandlers({
    setVideoGenerationState,
    showToasterMessage,
    setCreatingSceneId,
    creatingSceneId,
    setAdditionalScenes,
    currentEditingSceneId: sceneState.editingScene,
    setRegeneratingSceneId,
    setIsVideoGenerating,
    setVideoCompletionData,
  });

  // WebSocket hook for real-time updates
  const { isConnected } = useWebSocket({
    onMessage: handleWebSocketMessage,
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

  // Helper functions to extract data from manifest
  const getMediaFiles = useCallback(() => {
    if (!videoGenerationState.manifest) return {};
    const mediaFiles: { [key: string]: string } = {};

    videoGenerationState.manifest.scenes.forEach((scene) => {
      const { files } = scene;
      const timestamp = videoGenerationState.manifest!.generatedAt;

      // Extract actual scene number from file names
      const sceneNumber =
        files.mp3?.match(/scene-(\d+)\./)?.[1] ||
        scene.scenePosition.toString();

      // Add all file types to mediaFiles using the actual scene number
      if (files.png) {
        mediaFiles[`${timestamp}.scene-${sceneNumber}.png`] = files.png;
      }
      if (files.jpg) {
        mediaFiles[`${timestamp}.scene-${sceneNumber}.jpg`] = files.jpg;
      }
      mediaFiles[`${timestamp}.scene-${sceneNumber}.mp3`] = files.mp3;
      mediaFiles[`${timestamp}.scene-${sceneNumber}.mp4`] = files.mp4;
    });

    return mediaFiles;
  }, [videoGenerationState.manifest]);

  const getSubtitles = useCallback(() => {
    if (!videoGenerationState.manifest) return {};
    const subtitles: { [key: string]: string } = {};

    videoGenerationState.manifest.scenes.forEach((scene) => {
      const timestamp = videoGenerationState.manifest!.generatedAt;
      // Extract actual scene number from file names
      const sceneNumber =
        scene.files.mp3?.match(/scene-(\d+)\./)?.[1] ||
        scene.scenePosition.toString();
      const subtitleKey = `${timestamp}.scene-${sceneNumber}.subtitle`;
      subtitles[subtitleKey] = scene.files.subtitle;
    });

    return subtitles;
  }, [videoGenerationState.manifest]);

  const getAssFiles = useCallback(() => {
    if (!videoGenerationState.manifest) return {};
    const assFiles: { [key: string]: string } = {};

    videoGenerationState.manifest.scenes.forEach((scene) => {
      const timestamp = videoGenerationState.manifest!.generatedAt;
      // Extract actual scene number from file names
      const sceneNumber =
        scene.files.mp3?.match(/scene-(\d+)\./)?.[1] ||
        scene.scenePosition.toString();
      const assKey = `${timestamp}.scene-${sceneNumber}.ass`;
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

  // Create scenes from manifest data
  const createScenesFromSubtitleFiles = useCallback((): Scene[] => {
    if (!videoGenerationState.manifest?.scenes) return [];

    return videoGenerationState.manifest.scenes.map((manifestScene, index) => {
      // Extract the actual scene ID from the file names in the manifest
      const actualSceneId = manifestScene.files?.mp3
        ? parseInt(
            manifestScene.files.mp3.match(/scene-(\d+)\./)?.[1] ||
              manifestScene.scenePosition.toString(),
          )
        : manifestScene.scenePosition;

      // Get the narration from the subtitle field
      const narration =
        manifestScene.files?.subtitle ||
        `Scene ${manifestScene.scenePosition + 1}`;

      // Get duration from manifest scene files, fallback to calculated duration
      const actualDuration =
        manifestScene?.files?.duration ||
        Math.floor(
          (videoGenerationState.manifest?.totalDuration || 30) /
            (videoGenerationState.manifest?.sceneCount || 3),
        );

      return {
        id: actualSceneId,
        description: `Scene ${manifestScene.scenePosition + 1}`,
        narration: narration,
        duration: actualDuration,
        scenePosition: manifestScene.scenePosition,
        removed: removedOriginalScenes.has(actualSceneId), // Use local state for removed scenes
      };
    });
  }, [videoGenerationState.manifest, removedOriginalScenes]);

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

    // Sort additional scenes by the requested insertion position (ascending)
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

    // Insert each additional scene at its requested position, pushing existing scenes to the right
    for (const { scene, position } of sortedAdditionalScenes) {
      // Clamp the insertion index to [0, allScenes.length]
      const insertAt = Math.max(0, Math.min(position, allScenes.length));
      allScenes.splice(insertAt, 0, scene);
    }

    console.log(
      '🖼️ Final scenes after insertion:',
      allScenes.map((s) => ({ id: s.id, description: s.description })),
    );

    // Re-index scenePosition based on final order
    allScenes = allScenes.map((scene: Scene, index: number) => ({
      ...scene,
      scenePosition: index,
    }));

    console.log(
      '🔄 Final scenes with reindexed scenePosition:',
      allScenes.map((s) => ({
        id: s.id,
        scenePosition: s.scenePosition,
        description: s.description,
        narration: s.narration,
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

          // Initialize removedOriginalScenes from manifest
          if (manifest?.scenes) {
            const removedScenes = new Set<number>();
            manifest.scenes.forEach((scene: any) => {
              if (scene.removed) {
                // Extract scene ID from file names
                const sceneIdMatch =
                  scene.files?.mp3?.match(/scene-(\d+)\./) ||
                  scene.files?.mp4?.match(/scene-(\d+)\./) ||
                  scene.files?.ass?.match(/scene-(\d+)\./);
                const sceneId = sceneIdMatch
                  ? parseInt(sceneIdMatch[1])
                  : scene.id;
                removedScenes.add(sceneId);
              }
            });
            setRemovedOriginalScenes(removedScenes);
          }

          setVideoGenerationState((prev) => ({
            ...prev,
            manifest: manifest || undefined,
            isLoadingAudioSubtitles: false,
            isLoadingVideoScenes: false,
          }));
        }
      }
    };

    handleUrlParams();
  }, []); // Empty dependencies array to run only once

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

  const handleMagicScript = async () => {
    setIsGeneratingScript(true);
    try {
      const response = await fetch(
        `/api/enhance-prompt?prompt=${encodeURIComponent(
          script.trim(),
        )}&duration=${selectedDuration}&language=${selectedLanguage}`,
        {
          method: 'GET',
          credentials: 'include',
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (data.enhancedPrompt) {
          setScript(data.enhancedPrompt);
        }
      } else {
        console.error('Failed to generate enhanced script');
      }
    } catch (error) {
      console.error('Error generating enhanced script:', error);
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleGenerateVideoFromFooter = () => {
    const duration = parseInt(selectedDuration.replace('s', '')) as 30 | 60;
    handleGenerateVideo(script, duration, selectedVoice);
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

      // The API now returns a queued status - the actual result will come via WebSocket
      if (result.status === 'queued') {
        console.log(
          '✅ Audio regeneration queued successfully:',
          result.messageId,
        );
        // The WebSocket handler will process the preview_completed message
        // and update the video generation state automatically
      } else {
        console.error('❌ Unexpected response format:', result);
      }
    } catch (error) {
      console.error('Error regenerating audio:', error);
      alert('Failed to regenerate audio. Please try again.');
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
      showToasterMessage('Video combination started!', 'success');

      // Set generating state and navigate to step 3
      setIsVideoGenerating(true);
      setVideoCompletionData(null);
      setCurrentStep(3);

      const response = await fetch('/api/combine-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timestamp: videoGenerationState.currentTimestamp,
          removedScenes: Array.from(removedOriginalScenes),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to combine video: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('🎬 Combine video request queued:', result);
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
      showFooter
      footerContent={
        currentStep === 2 ? (
          <div
            className="ml-auto pr-4 flex items-center justify-end gap-3"
            style={{ width: '65%' }}
          >
            <button
              onClick={() => setCurrentStep(1)}
              className="h-12 px-5 min-w-[150px] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 rounded-[12px] text-white bg-transparent transition-all duration-200 hover:bg-white/10 hover:-translate-y-[1px]"
              style={{
                borderColor: '#5B5BFF',
                borderWidth: '1.5px',
                borderStyle: 'solid',
                boxShadow: '0 4px 16px 0 rgba(100, 0, 160, 0.35)',
              }}
            >
              <img src="/back.svg" alt="Back" className="w-4 h-4" />
              <span>Back to Idea</span>
            </button>
            <button
              onClick={handleCombineVideo}
              className="h-12 px-6 min-w-[170px] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 rounded-[12px] text-white transition-all duration-200 hover:-translate-y-[1px] hover:brightness-95"
              style={{
                background:
                  'var(--Gradient, linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%))',
                boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
              }}
            >
              <span>Generate Video</span>
            </button>
          </div>
        ) : (
          <div className="pl-6 flex items-center gap-12">
            <button
              onClick={handleMagicScript}
              disabled={isGeneratingScript}
              className={`h-12 px-4 text-xs sm:text-sm font-semibold flex items-center space-x-2 border rounded-[12px] text-white bg-transparent transition-colors transition-shadow transform duration-200 hover:bg-[#5B5BFF1F] hover:border-[#5B5BFF] hover:shadow-[0_6px_20px_0_rgba(100,0,160,0.55)] hover:-translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none`}
              style={{
                borderColor: '#5B5BFF',
                borderWidth: '1.5px',
                borderStyle: 'solid',
                boxShadow: '0 4px 16px 0 rgba(100, 0, 160, 0.35)',
              }}
            >
              {isGeneratingScript ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                  <span>Enhancing...</span>
                </>
              ) : (
                <>
                  <span>✨</span>
                  <span>Write Magic Script</span>
                </>
              )}
            </button>
            <button
              onClick={handleGenerateVideoFromFooter}
              disabled={
                generationState.isGenerating ||
                !script.trim() ||
                script.trim().split(/\s+/).length < 5
              }
              className={`h-12 px-4 text-xs sm:text-sm font-semibold flex items-center justify-center space-x-2 transition-all duration-300 hover:brightness-90 hover:-translate-y-[1px] ${
                generationState.isGenerating ||
                !script.trim() ||
                script.trim().split(/\s+/).length < 5
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed rounded-xl'
                  : 'text-white'
              }`}
              style={
                !generationState.isGenerating &&
                script.trim() &&
                script.trim().split(/\s+/).length >= 5
                  ? {
                      borderRadius: '0.75rem',
                      background:
                        'linear-gradient(90deg, #8A66FF 0%, #2FADFF 100%)',
                      boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
                    }
                  : {}
              }
            >
              {generationState.isGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                  <span>Generating...</span>
                </>
              ) : (
                <span>
                  Preview Scenes for {selectedDuration === '30s' ? '10' : '20'}{' '}
                  Credits
                </span>
              )}
            </button>
          </div>
        )
      }
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
              onMagicScript={handleMagicScript}
              isGeneratingScript={isGeneratingScript}
              script={script}
              onScriptChange={setScript}
              onGenerateVideoFromFooter={handleGenerateVideoFromFooter}
              selectedDuration={selectedDuration}
              selectedVoice={selectedVoice}
              selectedLanguage={selectedLanguage}
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
            <SceneCardsContainer
              videoGenerationState={videoGenerationState}
              scenes={scenes}
              sceneState={sceneState}
              handleEditSceneWithSubtitle={handleEditSceneWithSubtitle}
              setVideoGenerationState={setVideoGenerationState}
              handleSaveEdit={handleSaveEdit}
              handleCancelEdit={handleCancelEdit}
              sceneDispatch={sceneDispatch}
              handleRegenerateAudio={handleRegenerateAudio}
              getMediaFiles={getMediaFiles}
              handleSceneSelection={handleSceneSelection}
              regeneratingSceneId={regeneratingSceneId}
              creatingSceneId={creatingSceneId}
              setCreatingSceneId={setCreatingSceneId}
              handleAddSceneCustom={handleAddSceneCustom}
              additionalScenes={additionalScenes}
              setAdditionalScenes={setAdditionalScenes}
              handleDeleteScene={handleDeleteScene}
              handleDeleteUserAddedScene={handleDeleteUserAddedScene}
              onRestoreOriginalScene={(sceneId: number) => {
                console.log('[Scenes] Restoring original scene:', sceneId);
                setRemovedOriginalScenes((prev) => {
                  const next = new Set(prev);
                  next.delete(sceneId);
                  return next;
                });
                showToasterMessage('Scene restored', 'success');
              }}
              deletingSceneId={deletingSceneId}
              removedOriginalScenes={removedOriginalScenes}
            />
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
              isVideoGenerating={isVideoGenerating}
              videoCompletionData={videoCompletionData}
              onRemoveWatermark={() => {
                // TODO: Implement watermark removal
                console.log('Remove watermark clicked');
              }}
              showToasterMessage={showToasterMessage}
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
