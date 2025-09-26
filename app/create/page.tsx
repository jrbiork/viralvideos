'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

import MainLayout from '@/components/MainLayout';
import ProgressSteps from '@/components/ProgressSteps';
import VideoCreator from '@/components/VideoCreator';
import { Scene } from '@/components/EditScene';

import RightSidebar from '@/components/RightSidebar';
import SceneCardsContainer from '@/components/SceneCardsContainer';
import { DEFAULT_VOICE } from '@/lib/constants';

import ExportVideo from '@/components/ExportVideo';
import Toaster from '@/components/Toaster';
import { parseColoredText } from '@/lib/subtitle-utils';
import {
  buildMediaFiles,
  buildSubtitles,
  buildAssFiles,
} from '@/lib/manifest-helpers';
import { handleExportVideo as exportVideoUtil } from '@/lib/export-utils';
import { AVAILABLE_TEMPLATES } from '@/lib/template-constants';
import { useVideoGeneration } from '@/hooks/useVideoGeneration';
import { useSceneManagement } from '@/hooks/useSceneManagement';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useCreateUrlParams } from '@/hooks/useCreateUrlParams';
import { useWebSocketHandlers } from '@/hooks/useWebSocketHandlers';
import VideoPreview from '@/components/VideoPreview';
import { useUserDataCache } from '@/hooks/useUserDataCache';
import Step1Footer from '@/components/create/footers/Step1Footer';
import Step2Footer from '@/components/create/footers/Step2Footer';
import Step3Footer from '@/components/create/footers/Step3Footer';

import { Manifest } from '../types/manifest';

export default function GeneratePage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedVoice, setSelectedVoiceState] = useState(DEFAULT_VOICE); // Track voice selection
  const [isVoiceLoaded, setIsVoiceLoaded] = useState(false);

  // User data and subscription information
  const { userData } = useUserDataCache();

  // Get user subscription data from backend
  const userSubscription = useMemo(() => {
    console.log('userSubscription:', userData);
    if (!userData?.user?.subscription) return undefined;

    return userData.user.subscription;
  }, [userData]);

  const setSelectedVoice = (voiceId: string) => {
    localStorage.setItem('selectedVoice', voiceId);
    setSelectedVoiceState(voiceId);
  };

  // Load voice from localStorage after hydration
  useEffect(() => {
    const savedVoice = localStorage.getItem('selectedVoice');
    if (savedVoice) {
      setSelectedVoiceState(savedVoice);
    }
    setIsVoiceLoaded(true);
  }, []);
  const [script, setScript] = useState('');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<'30s' | '60s'>(
    '30s',
  );
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [selectedTemplate, setSelectedTemplateState] = useState('realistic');
  const [isTemplateLoaded, setIsTemplateLoaded] = useState(false);

  const setSelectedTemplate = (templateId: string) => {
    localStorage.setItem('selectedTemplate', templateId);
    setSelectedTemplateState(templateId);
  };

  // Load template from localStorage after hydration
  useEffect(() => {
    const savedTemplate = localStorage.getItem('selectedTemplate');
    if (savedTemplate) {
      setSelectedTemplateState(savedTemplate);
    }
    setIsTemplateLoaded(true);
  }, []);

  const [regeneratingSceneId, setRegeneratingSceneId] = useState<number | null>(
    null,
  );
  const [creatingSceneId, setCreatingSceneId] = useState<number | null>(null);
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  const [disableInitialTransition, setDisableInitialTransition] =
    useState(true);
  const [videoCompletionData, setVideoCompletionData] =
    useState<Manifest | null>(null);
  const [isExportingFinalVideo, setIsExportingFinalVideo] = useState(false);
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
      animated: false, // Default to false for new scenes
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
    onCancelEdit: handleCancelEdit,
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
  const getMediaFiles = useCallback(
    () => buildMediaFiles(videoGenerationState.manifest),
    [videoGenerationState.manifest],
  );

  const getSubtitles = useCallback(
    () => buildSubtitles(videoGenerationState.manifest),
    [videoGenerationState.manifest],
  );

  const getAssFiles = useCallback(
    () => buildAssFiles(videoGenerationState.manifest),
    [videoGenerationState.manifest],
  );

  // Custom handleEditScene that uses subtitle text from manifest
  const handleEditSceneWithSubtitle = (sceneId: number, narration: string) => {
    const subtitles = getSubtitles();
    const subtitleKey = `${videoGenerationState.currentTimestamp}.scene-${sceneId}.subtitle`;
    const subtitleText = subtitles[subtitleKey] || narration;

    handleEditScene(sceneId, subtitleText);
  };

  // Example video URL
  const exampleVideoUrl = '/assets/mars-example.mp4';

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
        animated: manifestScene.animated || false, // Default to false for original scenes
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

  // URL params handling
  useCreateUrlParams({
    setCurrentStep,
    videoGenerationState,
    setVideoGenerationState,
    setRemovedOriginalScenes,
    onInitialStep: (s) => {
      // If user lands directly on step 2 or 3, disable first transition
      if (s >= 2) setDisableInitialTransition(true);
      else setDisableInitialTransition(false);
      // Re-enable transitions after first paint
      requestAnimationFrame(() => setDisableInitialTransition(false));
    },
  });

  const handleGenerateVideo = async (
    script: string,
    duration: 30 | 60,
    voice?: string,
  ) => {
    // Update the selected voice state for use in regeneration
    if (voice) {
      setSelectedVoice(voice);
    }

    // Get the selected template description
    const selectedTemplateData = AVAILABLE_TEMPLATES.find(
      (template) => template.id === selectedTemplate,
    );

    await generateVideo(
      script,
      selectedTemplateData?.description || '',
      duration,
      (timestamp) => {
        // Enable transitions before changing step
        setDisableInitialTransition(false);
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
      const scene = scenes.find((s: Scene) => s.id === sceneId);
      console.log('log1 scene:', scene);
      if (!scene) {
        console.error('Scene not found:', sceneId);
        return;
      }

      // Create a copy of the scene with updated narration if it's being edited
      const updatedScene = {
        ...scene,
        narration: sceneState.editedNarration || scene.narration,
      };
      console.log('log1 updatedScene:', updatedScene);

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
    // Enable transitions before changing step
    setDisableInitialTransition(false);

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
      // Set generating state and navigate to step 3
      setIsVideoGenerating(true);
      setVideoCompletionData(null);
      // Enable transitions before changing step
      setDisableInitialTransition(false);
      setCurrentStep(3);

      // Update URL to reflect step 3, preserving timestamp
      try {
        const params = new URLSearchParams(window.location.search);
        params.set('step', '3');
        if (videoGenerationState.currentTimestamp) {
          params.set('timestamp', videoGenerationState.currentTimestamp);
        }
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState(null, '', newUrl);
      } catch (e) {
        console.warn('Failed to update URL to step=3', e);
      }

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
      currentStep={currentStep}
      footerContent={
        currentStep === 2 ? (
          <Step2Footer onGenerateVideo={handleCombineVideo} />
        ) : currentStep === 3 ? (
          <Step3Footer
            canExport={!!videoCompletionData?.finalVideoUrl}
            isExporting={isExportingFinalVideo}
            onExport={async () => {
              if (!videoCompletionData?.finalVideoUrl) {
                showToasterMessage(
                  'Video URL not available for export',
                  'error',
                );
                return;
              }
              try {
                setIsExportingFinalVideo(true);
                await exportVideoUtil({
                  finalVideoUrl: videoCompletionData.finalVideoUrl,
                  filename: `video-${videoCompletionData.generatedAt}.mp4`,
                  showToasterMessage,
                });
              } finally {
                setIsExportingFinalVideo(false);
              }
            }}
          />
        ) : currentStep === 1 ? (
          <Step1Footer
            onMagicScript={handleMagicScript}
            isGeneratingScript={isGeneratingScript}
            onGenerate={handleGenerateVideoFromFooter}
            canGenerate={
              !generationState.isGenerating &&
              !!script.trim() &&
              script.trim().split(/\s+/).length >= 5
            }
            selectedDuration={selectedDuration}
          />
        ) : null
      }
    >
      {/* WebSocket Status for Testing */}

      <div className="flex flex-col justify-start px-4 h-full overflow-y-auto">
        <div className="relative overflow-hidden flex-1">
          <div
            className={`h-full overflow-y-scroll custom-scrollbar ${
              disableInitialTransition
                ? ''
                : 'transition-transform duration-500 ease-in-out'
            } ${
              currentStep === 1
                ? 'translate-x-0'
                : currentStep > 1
                ? '-translate-x-full'
                : 'translate-x-full'
            }`}
          >
            <div className="space-y-6">
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
                selectedTemplate={selectedTemplate}
                onTemplateSelect={setSelectedTemplate}
              />

              {/* Template grid kept inline or inside VideoCreator */}
            </div>
          </div>

          <div
            className={`absolute top-0 left-0 w-full h-full overflow-y-scroll custom-scrollbar ${
              disableInitialTransition
                ? ''
                : 'transition-transform duration-500 ease-in-out'
            } ${
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
            className={`absolute top-0 left-0 w-full h-full overflow-y-scroll custom-scrollbar ${
              disableInitialTransition
                ? ''
                : 'transition-transform duration-500 ease-in-out'
            } ${currentStep === 3 ? 'translate-x-0' : 'translate-x-full'}`}
          >
            <div className="flex flex-col md:flex-row h-full">
              <div className="flex-[2]">
                <ExportVideo
                  onExportVideo={() => {}}
                  isExporting={sceneState.isExporting}
                  onBack={undefined}
                  isVideoGenerating={isVideoGenerating}
                  videoCompletionData={videoCompletionData}
                  onRemoveWatermark={() => {
                    // TODO: Implement watermark removal
                    console.log('Remove watermark clicked');
                  }}
                  showToasterMessage={showToasterMessage}
                  userSubscription={userSubscription}
                />
              </div>

              {/* Right Side: Final Video Player */}
              {!isVideoGenerating && (
                <div
                  className="flex-[1] order-1 md:order-2 overflow-hidden"
                  style={{ margin: '80px 100px' }}
                >
                  <div className="h-full p-4">
                    {videoCompletionData?.finalVideoUrl ? (
                      <VideoPreview
                        videoUrl={videoCompletionData.finalVideoUrl}
                        loop={false}
                      />
                    ) : (
                      <div className="bg-slate-900 border border-slate-700 rounded-2xl h-96 flex items-center justify-center text-gray-400">
                        Creating your video...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
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
