'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import posthog from 'posthog-js';

import MainLayout from '@/components/MainLayout';
import ProgressSteps from '@/components/ProgressSteps';
import VideoCreator from '@/components/VideoCreator';
import { Scene } from '@/components/EditScene';

import RightSidebar from '@/components/RightSidebar';
import SceneCardsContainer from '@/components/SceneCardsContainer';
import { DEFAULT_VOICE } from '@/lib/constants';

import ExportVideo from '@/components/ExportVideo';
import { parseColoredText } from '@/lib/subtitle-utils';
import { useToaster } from '@/hooks/useToaster';
import {
  buildMediaFiles,
  buildSubtitles,
  buildAssFiles,
  isManifestFullyReady,
} from '@/lib/manifest-helpers';
import { handleExportVideo as exportVideoUtil } from '@/lib/export-utils';
import { AVAILABLE_TEMPLATES } from '@/lib/template-constants';
import { useVideoGeneration } from '@/hooks/useVideoGeneration';
import { useSceneManagement } from '@/hooks/useSceneManagement';
import { useWebSocketContext } from '@/components/WebSocketContext';
import { useCreateUrlParams } from '@/hooks/useCreateUrlParams';
import { useWebSocketHandlers } from '@/hooks/useWebSocketHandlers';
import VideoPreview from '@/components/VideoPreview';
import Modal from '@/components/Modal';
import { useUserDataCache } from '@/hooks/useUserDataCache';
import { useUserQuota } from '@/components/useUserQuota';

import { Manifest } from '../types/manifest';

export default function GeneratePage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [selectedVoice, setSelectedVoiceState] = useState(DEFAULT_VOICE); // Track voice selection
  const [isVoiceLoaded, setIsVoiceLoaded] = useState(false);

  // User data and subscription information
  const { userData } = useUserDataCache();
  const { quota, animationQuota } = useUserQuota();

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

  // Toaster hook
  const { showToasterMessage, ToasterComponent } = useToaster();

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

  // In-memory edits accumulated in the UI until the user clicks "Apply changes"
  const [pendingEdits, setPendingEdits] = useState<{
    narrationEdits: {
      sceneId: number;
      scenePosition: number;
      narration: string;
    }[];
    imageEdits: { sceneId: number; generatedImageUrl: string }[];
    addedScenes: {
      sceneId: number;
      scenePosition: number;
      captionText: string;
      imageUrl: string;
    }[];
    animationEdits: {
      sceneId: number;
      animatedVideoUrl: string;
      animationPrompt: string;
    }[];
  }>({
    narrationEdits: [],
    imageEdits: [],
    addedScenes: [],
    animationEdits: [],
  });
  const [isApplyingEdits, setIsApplyingEdits] = useState(false);
  const [showPendingChangesModal, setShowPendingChangesModal] =
    useState(false);

  // Scene ids already marked removed in the persisted manifest (hydrated by
  // useCreateUrlParams on load) — these are NOT pending changes, they were
  // already applied. Only ids in removedOriginalScenes but not yet reflected
  // in the manifest represent a genuine queued-but-unapplied removal.
  const manifestRemovedSceneIds = useMemo(() => {
    const ids = new Set<number>();
    videoGenerationState.manifest?.scenes?.forEach((manifestScene: any) => {
      if (manifestScene.removed) {
        const sceneIdMatch =
          manifestScene.files?.mp3?.match(/scene-(\d+)\./) ||
          manifestScene.files?.mp4?.match(/scene-(\d+)\./) ||
          manifestScene.files?.ass?.match(/scene-(\d+)\./);
        const sceneId = sceneIdMatch
          ? parseInt(sceneIdMatch[1])
          : manifestScene.scenePosition;
        ids.add(sceneId);
      }
    });
    return ids;
  }, [videoGenerationState.manifest]);

  const pendingRemovedSceneIds = Array.from(removedOriginalScenes).filter(
    (id) => !manifestRemovedSceneIds.has(id),
  );

  const pendingEditsCount =
    pendingEdits.narrationEdits.length +
    pendingEdits.imageEdits.length +
    pendingEdits.addedScenes.length +
    pendingEdits.animationEdits.length +
    pendingRemovedSceneIds.length;

  // Record a replaced image for an existing scene (original scenes only)
  const handleQueueImageEdit = useCallback(
    (sceneId: number, generatedImageUrl: string) => {
      setPendingEdits((prev) => ({
        ...prev,
        imageEdits: [
          ...prev.imageEdits.filter((e) => e.sceneId !== sceneId),
          { sceneId, generatedImageUrl },
        ],
      }));
    },
    [],
  );

  // Record a Runway-animated scene to be applied on the next Apply
  const handleQueueAnimationEdit = useCallback(
    (sceneId: number, animatedVideoUrl: string, animationPrompt: string) => {
      setPendingEdits((prev) => ({
        ...prev,
        animationEdits: [
          ...prev.animationEdits.filter((e) => e.sceneId !== sceneId),
          { sceneId, animatedVideoUrl, animationPrompt },
        ],
      }));
    },
    [],
  );

  // Runway animation runs asynchronously (routinely exceeds API Gateway's
  // 29s limit) — track which scene is mid-animation and store completed
  // results, both fed by the 'scene_animated' WebSocket broadcast below.
  const [animatingSceneId, setAnimatingSceneId] = useState<number | null>(
    null,
  );
  const [animationResults, setAnimationResults] = useState<
    Record<number, { videoUrl: string; prompt: string }>
  >({});

  const handleStartAnimation = useCallback((sceneId: number) => {
    setAnimatingSceneId(sceneId);
    setAnimationResults((prev) => {
      const next = { ...prev };
      delete next[sceneId];
      return next;
    });
  }, []);

  // Record a new user-added scene to be created on the next Apply
  const handleQueueAddedScene = useCallback(
    (
      sceneId: number,
      scenePosition: number,
      captionText: string,
      imageUrl: string,
    ) => {
      setPendingEdits((prev) => ({
        ...prev,
        addedScenes: [
          ...prev.addedScenes.filter((s) => s.sceneId !== sceneId),
          { sceneId, scenePosition, captionText, imageUrl },
        ],
      }));
    },
    [],
  );

  // Custom handleAddScene function to add new scenes
  const handleAddSceneCustom = (position: number) => {
    // Validation: don't exceed the max scene count (existing non-removed +
    // already-queued additions + the one about to be added)
    const currentNonRemovedOriginal = originalScenes.filter(
      (s) => !s.removed,
    ).length;
    const resultingTotal =
      currentNonRemovedOriginal + additionalScenes.length + 1;
    if (resultingTotal > quota.maxScenes) {
      showToasterMessage(`Maximum ${quota.maxScenes} scenes allowed`, 'error');
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

  // Use WebSocket context for global connection
  const { isConnected, subscribe } = useWebSocketContext();

  // Subscribe to WebSocket messages for this page
  useEffect(() => {
    const unsubscribe = subscribe('create-page', handleWebSocketMessage);
    return unsubscribe;
  }, [subscribe, handleWebSocketMessage]);

  // Clear pending edits once a batch apply completes (preview_completed)
  useEffect(() => {
    if (!isApplyingEdits) return;

    const unsubscribe = subscribe('create-page-batch-apply', (message) => {
      if (message.action === 'error') {
        // Rejected server-side (e.g. scene limit exceeded) — the general
        // WebSocket handler already shows the toast; just stop the spinner
        // and leave pendingEdits/removedOriginalScenes queued for retry.
        setIsApplyingEdits(false);
        return;
      }

      if (message.action !== 'preview_completed') return;

      // Added scenes are now part of the manifest — drop the local placeholders
      const appliedAddedIds = pendingEdits.addedScenes.map((s) => s.sceneId);
      if (appliedAddedIds.length > 0) {
        setAdditionalScenes((prev) =>
          prev.filter((item) => !appliedAddedIds.includes(item.scene.id)),
        );
      }

      setPendingEdits({
        narrationEdits: [],
        imageEdits: [],
        addedScenes: [],
        animationEdits: [],
      });
      setRemovedOriginalScenes(new Set());
      setIsApplyingEdits(false);
      showToasterMessage('Changes applied', 'success');
    });

    return unsubscribe;
  }, [isApplyingEdits, subscribe, pendingEdits.addedScenes, showToasterMessage]);

  // Pick up the Runway animation result once it completes in the background
  // (the global handler already toasts on 'error'; this just clears the
  // per-scene spinner so it doesn't hang forever on failure).
  useEffect(() => {
    const unsubscribe = subscribe('create-page-animate', (message) => {
      if (message.action === 'scene_animated') {
        const { sceneId, videoUrl, animationPrompt } = message.data;
        if (sceneId === undefined || !videoUrl) return;
        setAnimationResults((prev) => ({
          ...prev,
          [sceneId]: { videoUrl, prompt: animationPrompt ?? '' },
        }));
        setAnimatingSceneId((current) => (current === sceneId ? null : current));
      } else if (message.action === 'error') {
        setAnimatingSceneId(null);
      }
    });

    return unsubscribe;
  }, [subscribe]);

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

      // Get the narration from the subtitle field, overridden by any pending edit
      const pendingNarration = pendingEdits.narrationEdits.find(
        (e) => e.sceneId === actualSceneId,
      )?.narration;
      const narration =
        pendingNarration ??
        manifestScene.files?.subtitle ??
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
        removed:
          manifestScene.removed || removedOriginalScenes.has(actualSceneId), // Manifest is authoritative; local state covers not-yet-applied removals
      };
    });
  }, [
    videoGenerationState.manifest,
    removedOriginalScenes,
    pendingEdits.narrationEdits,
  ]);

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

    // Each scene's `position` was captured against the combined scenes array
    // (including previously-added scenes) at the moment it was added. Since
    // additionalScenes is only ever appended to, insertion order already
    // matches that reference frame — sorting by position here would replay
    // positions against the wrong (original-only) array and misplace scenes
    // added after earlier ones.
    console.log(
      '📝 additionalScenes to insert (in insertion order):',
      additionalScenes.map((item) => ({
        id: item.scene.id,
        position: item.position,
        description: item.scene.description,
      })),
    );

    // Insert each additional scene at its requested position, pushing existing scenes to the right
    for (const { scene, position } of additionalScenes) {
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

  // Generate Video should be blocked when every scene has been removed —
  // there would be nothing left to combine into a video.
  const allScenesDisabled =
    scenes.length > 0 && scenes.every((s: Scene) => s.removed);

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

  // URL params handling
  useCreateUrlParams({
    setCurrentStep,
    videoGenerationState,
    setVideoGenerationState,
    setRemovedOriginalScenes,
    setIsVideoGenerating,
    setVideoCompletionData,
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

    posthog.capture('generate_preview_clicked', { duration });

    await generateVideo(
      script,
      selectedTemplateData?.description || '',
      duration,
      (timestamp) => {
        posthog.capture('scenes_generated', { duration });
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
      undefined,
      () => setShowQuotaModal(true),
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

  // Record an edited narration for an existing scene in memory.
  // The actual audio/subtitle regeneration happens when the user clicks "Apply changes".
  const handleRegenerateAudio = (
    sceneId: number,
    narrationOverride?: string,
  ) => {
    const scene = scenes.find((s: Scene) => s.id === sceneId);
    if (!scene) {
      console.error('Scene not found:', sceneId);
      return;
    }

    const narration =
      narrationOverride || sceneState.editedNarration || scene.narration;

    setPendingEdits((prev) => ({
      ...prev,
      narrationEdits: [
        ...prev.narrationEdits.filter((e) => e.sceneId !== sceneId),
        {
          sceneId,
          scenePosition: scene.scenePosition ?? 0,
          narration,
        },
      ],
    }));

    // Exit edit mode; the optimistic narration is shown via the pending override
    handleCancelEdit();
  };

  // Send all accumulated in-memory edits to the backend in a single batch
  const handleApplyEdits = async () => {
    if (pendingEditsCount === 0 || !videoGenerationState.currentTimestamp) {
      return;
    }

    const incompleteScene = additionalScenes.find(
      (item) => !item.scene.narration || !item.scene.narration.trim(),
    );
    if (incompleteScene) {
      showToasterMessage(
        'One of your new scenes is missing narration. Add narration or remove the scene before applying changes.',
        'error',
      );
      return;
    }

    setIsApplyingEdits(true);
    setVideoGenerationState((prev) => ({
      ...prev,
      isLoadingVideoScenes: true,
    }));
    showToasterMessage(
      "This might take a couple of minutes. You can come back later or check your Videos gallery — we'll notify you once it's done.",
      'info',
    );

    try {
      const response = await fetch('/api/apply-edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: videoGenerationState.currentTimestamp,
          edits: {
            narrationEdits: pendingEdits.narrationEdits,
            imageEdits: pendingEdits.imageEdits,
            addedScenes: pendingEdits.addedScenes,
            removedSceneIds: pendingRemovedSceneIds,
            animationEdits: pendingEdits.animationEdits,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to apply changes');
      }

      // Pending state is cleared when the preview_completed WebSocket event arrives
      console.log('✅ Batch edit queued');
    } catch (error) {
      console.error('Error applying edits:', error);
      setIsApplyingEdits(false);
      setVideoGenerationState((prev) => ({
        ...prev,
        isLoadingVideoScenes: false,
      }));
      showToasterMessage(
        error instanceof Error ? error.message : 'Failed to apply changes',
        'error',
      );
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

    posthog.capture('generate_video_clicked');

    try {
      // Set generating state and navigate to step 3
      setIsVideoGenerating(true);
      setVideoCompletionData(null);
      // Enable transitions before changing step
      setDisableInitialTransition(false);
      setCurrentStep(3);
      showToasterMessage(
        "This might take a couple of minutes. You can come back later or check your Videos gallery — we'll notify you once it's done.",
        'info',
      );

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

  // "Generate Video" is blocked behind a confirmation whenever there are
  // queued-but-unapplied edits, since those edits are not sent as part of
  // /api/combine-video and would otherwise be silently dropped.
  const handleGenerateVideoClick = () => {
    if (pendingEditsCount > 0) {
      setShowPendingChangesModal(true);
      return;
    }
    handleCombineVideo();
  };

  const handleApplyChangesFromModal = () => {
    setShowPendingChangesModal(false);
    handleApplyEdits();
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
      rightSidebarContent={rightSidebarContent}
      backgroundColor={currentStep === 1 ? '#090526' : '#0F0A1E'}
      progressSteps={<ProgressSteps currentStep={currentStep} />}
      currentStep={currentStep}
      rightSidebarButton={
        currentStep === 2 ? (
          <div className="flex items-center gap-3">
            {pendingEditsCount > 0 && (
              <button
                onClick={handleApplyEdits}
                disabled={isApplyingEdits}
                className={`h-12 px-6 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 rounded-[12px] text-white transition-all duration-200 border-[1.5px] border-[#5B5BFF] hover:bg-[#5B5BFF] ${
                  isApplyingEdits ? 'opacity-60 cursor-not-allowed' : ''
                }`}
                style={{
                  boxShadow: '0 4px 16px 0 rgba(100, 0, 160, 0.35)',
                }}
              >
                {isApplyingEdits ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                    <span>Applying...</span>
                  </>
                ) : (
                  <span>Apply changes ({pendingEditsCount})</span>
                )}
              </button>
            )}
            <button
              onClick={handleGenerateVideoClick}
              disabled={
                !isManifestFullyReady(videoGenerationState.manifest) ||
                isApplyingEdits ||
                allScenesDisabled
              }
              title={
                isApplyingEdits
                  ? 'Waiting for pending changes to finish applying...'
                  : allScenesDisabled
                  ? 'All scenes are disabled. Restore at least one scene to generate a video.'
                  : !isManifestFullyReady(videoGenerationState.manifest)
                  ? 'Waiting for all scenes to finish generating...'
                  : undefined
              }
              className={`h-12 px-6 min-w-[170px] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 rounded-[12px] text-white transition-all duration-200 ${
                isManifestFullyReady(videoGenerationState.manifest) &&
                !isApplyingEdits &&
                !allScenesDisabled
                  ? 'hover:-translate-y-[1px] hover:brightness-95'
                  : 'opacity-50 cursor-not-allowed'
              }`}
              style={{
                background:
                  'var(--Gradient, linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%))',
                boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
              }}
            >
              <span>Generate Video</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5 12H19M19 12L12 5M19 12L12 19"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
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
                canGenerate={
                  !generationState.isGenerating &&
                  !!script.trim() &&
                  script.trim().split(/\s+/).length >= 5
                }
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
                const currentActiveTotal = scenes.filter(
                  (s) => !s.removed,
                ).length;
                if (currentActiveTotal + 1 > quota.maxScenes) {
                  showToasterMessage(
                    `You're at the ${quota.maxScenes}-scene limit. Remove a scene before restoring this one.`,
                    'error',
                  );
                  return;
                }
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
              onQueueImageEdit={handleQueueImageEdit}
              onQueueAddedScene={handleQueueAddedScene}
              onQueueAnimationEdit={handleQueueAnimationEdit}
              animationQuota={animationQuota}
              maxScenes={quota.maxScenes}
              animatingSceneId={animatingSceneId}
              animationResults={animationResults}
              onStartAnimation={handleStartAnimation}
              pendingAnimationEdits={pendingEdits.animationEdits}
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
                  isExporting={isExportingFinalVideo}
                  onBack={undefined}
                  isVideoGenerating={isVideoGenerating}
                  videoCompletionData={videoCompletionData}
                  showToasterMessage={showToasterMessage}
                  userSubscription={userSubscription}
                />
              </div>

              {/* Right Side: Final Video Player */}
              {!isVideoGenerating && (
                <div className="flex-[1] order-1 md:order-2 md:overflow-hidden mx-4 my-6 md:mx-[100px] md:my-[80px]">
                  <div className="h-full p-4">
                    {videoCompletionData?.finalVideoUrl ? (
                      <VideoPreview
                        videoUrl={videoCompletionData.finalVideoUrl}
                        loop={false}
                      >
                        <button
                          onClick={async () => {
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
                                finalVideoUrl:
                                  videoCompletionData.finalVideoUrl,
                                filename: `video-${videoCompletionData.generatedAt}.mp4`,
                                showToasterMessage,
                              });
                            } finally {
                              setIsExportingFinalVideo(false);
                            }
                          }}
                          disabled={
                            isExportingFinalVideo ||
                            !videoCompletionData?.finalVideoUrl
                          }
                          className={`h-12 px-6 min-w-[170px] text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 rounded-[12px] text-white transition-all duration-200 hover:-translate-y-[1px] hover:brightness-95 ${
                            isExportingFinalVideo ||
                            !videoCompletionData?.finalVideoUrl
                              ? 'opacity-50 cursor-not-allowed'
                              : ''
                          }`}
                          style={{
                            background:
                              'var(--Gradient, linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%))',
                            boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
                          }}
                        >
                          {isExportingFinalVideo ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                              <span>Exporting...</span>
                            </>
                          ) : !videoCompletionData?.finalVideoUrl ? (
                            <span>Creating your video...</span>
                          ) : (
                            <span>Export Video</span>
                          )}
                        </button>
                      </VideoPreview>
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

      {/* Pending changes confirmation, shown when Generate Video is clicked
          while there are queued-but-unapplied edits */}
      <Modal
        isOpen={showPendingChangesModal}
        onClose={() => setShowPendingChangesModal(false)}
        title="You have unsaved changes"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <p className="text-gray-300 text-sm">
            You have {pendingEditsCount} pending change
            {pendingEditsCount === 1 ? '' : 's'} that haven't been applied
            yet. Apply them before generating.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => setShowPendingChangesModal(false)}
              className="flex-1 px-4 py-3 rounded-xl border-[1.5px] border-[#5B5BFF] text-white hover:bg-[#5B5BFF] font-medium transition-all duration-300"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyChangesFromModal}
              className="flex-1 px-4 py-3 text-white rounded-xl font-medium transition-all duration-200 hover:-translate-y-[1px] hover:brightness-95"
              style={{
                background:
                  'var(--Gradient, linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%))',
                boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
              }}
            >
              Apply Changes
            </button>
          </div>
        </div>
      </Modal>

      {/* Shown when a user has used up their video quota for the current
          period (free: lifetime cap, creator/pro: monthly cap) */}
      <Modal
        isOpen={showQuotaModal}
        onClose={() => setShowQuotaModal(false)}
        title={
          quota.plan === 'free'
            ? "You've used your free video"
            : "You've reached your monthly video limit"
        }
      >
        <div className="space-y-4">
          <p className="text-gray-300 text-sm">
            {quota.plan === 'free'
              ? `Free plan includes ${quota.limit} video. Upgrade to Creator or Pro for more videos every month.`
              : `Your plan includes ${quota.limit} videos per month. Your quota resets next month.`}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => setShowQuotaModal(false)}
              className="flex-1 px-4 py-3 rounded-xl border-[1.5px] border-[#5B5BFF] text-white hover:bg-[#5B5BFF] font-medium transition-all duration-300"
            >
              Cancel
            </button>
            {quota.plan !== 'pro' && (
              <button
                onClick={() => router.push('/pricing')}
                className="flex-1 px-4 py-3 text-white rounded-xl font-medium transition-all duration-200 hover:-translate-y-[1px] hover:brightness-95"
                style={{
                  background:
                    'var(--Gradient, linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%))',
                  boxShadow: '0 2px 6px 0 rgba(100, 0, 160, 0.25)',
                }}
              >
                {quota.plan === 'free' ? 'Upgrade to Pro' : 'Upgrade Plan'}
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* Toaster */}
      {ToasterComponent}
    </MainLayout>
  );
}
