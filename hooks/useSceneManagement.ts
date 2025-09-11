import { useReducer, useEffect, useRef } from 'react';
import { parseAssFile } from '../lib/subtitle-utils';

// Define the state interface
export interface SceneManagementState {
  editingScene: number | null;
  editedNarration: string;
  selectedSceneId: number | null;
  autoAdvanceEnabled: boolean;
  currentSubtitle: string;
  isExporting: boolean;
}

// Define action types
export type SceneManagementAction =
  | { type: 'SET_EDITING_SCENE'; payload: number | null }
  | { type: 'SET_EDITED_NARRATION'; payload: string }
  | { type: 'SET_SELECTED_SCENE_ID'; payload: number | null }
  | { type: 'SET_AUTO_ADVANCE_ENABLED'; payload: boolean }
  | { type: 'SET_CURRENT_SUBTITLE'; payload: string }
  | { type: 'SET_EXPORTING'; payload: boolean }
  | { type: 'DELETE_SCENE'; payload: number }
  | { type: 'ADD_SCENE'; payload: { position: number; scene: any } };

// Initial state
const initialState: SceneManagementState = {
  editingScene: null,
  editedNarration: '',
  selectedSceneId: null,
  autoAdvanceEnabled: false,
  currentSubtitle: '',
  isExporting: false,
};

// Reducer function
function sceneManagementReducer(
  state: SceneManagementState,
  action: SceneManagementAction,
): SceneManagementState {
  switch (action.type) {
    case 'SET_EDITING_SCENE':
      return { ...state, editingScene: action.payload };
    case 'SET_EDITED_NARRATION':
      return { ...state, editedNarration: action.payload };
    case 'SET_SELECTED_SCENE_ID':
      return { ...state, selectedSceneId: action.payload };
    case 'SET_AUTO_ADVANCE_ENABLED':
      return { ...state, autoAdvanceEnabled: action.payload };
    case 'SET_CURRENT_SUBTITLE':
      return { ...state, currentSubtitle: action.payload };
    case 'SET_EXPORTING':
      return { ...state, isExporting: action.payload };

    case 'DELETE_SCENE':
      // Reset selected scene if it's being deleted
      if (state.selectedSceneId === action.payload) {
        return { ...state, selectedSceneId: null };
      }
      return state;
    case 'ADD_SCENE':
      // Reset selected scene when adding new scenes
      return { ...state, selectedSceneId: null };
    default:
      return state;
  }
}

export function useSceneManagement() {
  const [state, dispatch] = useReducer(sceneManagementReducer, initialState);
  const lastAutoPlayCall = useRef<string>('');

  const handleEditScene = (sceneId: number, narration: string) => {
    dispatch({ type: 'SET_EDITING_SCENE', payload: sceneId });
    dispatch({ type: 'SET_EDITED_NARRATION', payload: narration });
  };

  const handleSaveEdit = (
    sceneId: number,
    scenes: any[],
    onScenesUpdate: (updatedScenes: any[]) => void,
  ) => {
    if (scenes) {
      const updatedScenes = scenes.map((scene: any) =>
        scene.id === sceneId
          ? { ...scene, narration: state.editedNarration }
          : scene,
      );
      onScenesUpdate(updatedScenes);
      dispatch({ type: 'SET_EDITING_SCENE', payload: null });
      dispatch({ type: 'SET_EDITED_NARRATION', payload: '' });
    }
  };

  const handleCancelEdit = () => {
    dispatch({ type: 'SET_EDITING_SCENE', payload: null });
    dispatch({ type: 'SET_EDITED_NARRATION', payload: '' });
  };

  const handleSceneSelection = (sceneId: number) => {
    // Clear subtitle state when selecting a new scene
    dispatch({ type: 'SET_CURRENT_SUBTITLE', payload: '' });
    dispatch({ type: 'SET_SELECTED_SCENE_ID', payload: sceneId });
  };

  const handleDeleteScene = (sceneId: number) => {
    dispatch({ type: 'DELETE_SCENE', payload: sceneId });
  };

  const handleAddScene = (
    position: number,
    existingScenes: any[] = [],
    additionalScenes: any[] = [],
  ) => {
    // Generate a unique ID that is +1 from the maximum existing scene ID
    // Consider both existing scenes and additional user-added scenes
    const allSceneIds = [
      ...existingScenes.map((s) => s.id),
      ...additionalScenes.map((item) => item.scene?.id || item.id),
    ];
    const maxId = allSceneIds.length > 0 ? Math.max(...allSceneIds) : 0;
    const newId = maxId + 1;

    // Create a new scene object
    const newScene = {
      id: newId,
      description: `New scene at position ${position + 1}`,
      narration: 'Enter scene narration here...',
      duration: 5, // Default duration
    };

    dispatch({ type: 'ADD_SCENE', payload: { position, scene: newScene } });
  };

  const handleExportVideo = () => {
    dispatch({ type: 'SET_EXPORTING', payload: true });
    // TODO: Implement actual export logic
    setTimeout(() => {
      dispatch({ type: 'SET_EXPORTING', payload: false });
      console.log('Video exported successfully!');
      // Could redirect to a success page or show download link
    }, 2000);
  };

  // Auto-select first scene when scenes are loaded
  const autoSelectFirstScene = (scenes: any[]) => {
    if (scenes && scenes.length > 0 && state.selectedSceneId === null) {
      // Clear subtitle state when auto-selecting first scene
      dispatch({ type: 'SET_CURRENT_SUBTITLE', payload: '' });
      dispatch({
        type: 'SET_SELECTED_SCENE_ID',
        payload: scenes[0].id,
      });
      // Enable auto-advance by default when first scene is selected
      if (!state.autoAdvanceEnabled) {
        dispatch({ type: 'SET_AUTO_ADVANCE_ENABLED', payload: true });
      }
    }
  };

  // Auto-play video when selectedSceneId changes (only if auto-advance is enabled)
  const handleAutoPlay = (scenes: any[], currentTimestamp: string) => {
    // Prevent multiple calls with the same parameters
    const callKey = `${state.selectedSceneId}-${currentTimestamp}`;
    if (lastAutoPlayCall.current === callKey) {
      console.log(
        '🎬 handleAutoPlay already called with same parameters, skipping',
      );
      return;
    }
    lastAutoPlayCall.current = callKey;

    console.log('🎬 handleAutoPlay called:', {
      selectedSceneId: state.selectedSceneId,
      scenesCount: scenes?.length,
      autoAdvanceEnabled: state.autoAdvanceEnabled,
      currentTimestamp,
    });

    if (
      state.selectedSceneId !== null &&
      scenes &&
      scenes.length > 0 &&
      state.autoAdvanceEnabled
    ) {
      const selectedscenePosition = scenes.findIndex(
        (s: any) => s.id === state.selectedSceneId,
      );

      console.log('🎬 Selected scene index:', selectedscenePosition);

      if (selectedscenePosition !== -1) {
        // Stop all videos first
        const allVideos = document.querySelectorAll('video');
        console.log('🎬 Stopping', allVideos.length, 'videos');
        allVideos.forEach((video) => {
          video.pause();
          video.currentTime = 0;
        });

        // Start the selected video after a longer delay to avoid conflicts
        setTimeout(() => {
          const selectedScene = scenes[selectedscenePosition];
          const videoKey = `${currentTimestamp}.scene-${selectedScene.id}.mp4`;
          console.log('🎬 Looking for video with key:', videoKey);
          const videoElement = document.querySelector(
            `video[src*="${videoKey}"]`,
          ) as HTMLVideoElement;
          if (videoElement && !videoElement.dataset.autoPlaying) {
            console.log('🎬 Found video element, attempting to play');
            // Mark as auto-playing to prevent conflicts
            videoElement.dataset.autoPlaying = 'true';

            // Check if video is ready before playing
            if (videoElement.readyState >= 2) {
              // HAVE_CURRENT_DATA
              videoElement.play().catch((error) => {
                console.error('🎬 Failed to auto-play video:', error);
                videoElement.dataset.autoPlaying = 'false';
              });
            } else {
              console.log('🎬 Video not ready yet, waiting...');
              videoElement.addEventListener(
                'canplay',
                () => {
                  videoElement.play().catch((error) => {
                    console.error(
                      '🎬 Failed to auto-play video after canplay:',
                      error,
                    );
                    videoElement.dataset.autoPlaying = 'false';
                  });
                },
                { once: true },
              );
            }
          } else {
            console.log(
              '🎬 Video element not found or already auto-playing for key:',
              videoKey,
            );
          }
        }, 500); // Increased delay to avoid conflicts
      }
    }
  };

  // Setup video event listeners
  const setupVideoEventListeners = (
    videoRef: HTMLVideoElement,
    scene: any,
    scenes: any[],
    assFiles: { [key: string]: string },
    currentTimestamp: string,
    scenePosition: number,
  ) => {
    if (!videoRef || videoRef.dataset.initialized) return;

    // Mark as initialized to prevent multiple event listener setup
    videoRef.dataset.initialized = 'true';

    // Store the assFiles reference on the video element for dynamic updates
    videoRef.dataset.assFiles = JSON.stringify(assFiles);
    videoRef.dataset.currentTimestamp = currentTimestamp;
    videoRef.dataset.sceneId = scene.id.toString();

    const updateSubtitle = async () => {
      // Get the latest assFiles from the video element (now expected to hold inline contents)
      const latestAssFiles = JSON.parse(videoRef.dataset.assFiles || '{}');
      const assKey = `${currentTimestamp}.scene-${scene.id}.ass`;
      const assContent = latestAssFiles[assKey];

      if (assContent) {
        try {
          const subtitles = assContent ? parseAssFile(assContent) : [];

          const currentTime = videoRef.currentTime;
          const currentSub = subtitles.find(
            (sub) => currentTime >= sub.start && currentTime <= sub.end,
          );

          dispatch({
            type: 'SET_CURRENT_SUBTITLE',
            payload: currentSub ? currentSub.coloredText : '',
          });
        } catch (error) {
          console.error('Error parsing ASS content:', error);
        }
      }
    };

    // Add event listeners only once
    videoRef.addEventListener('play', () => {
      console.log('🎬 Video play event triggered for scene:', scene.id);
      // Enable auto-advance when user manually plays a video
      if (!state.autoAdvanceEnabled) {
        dispatch({ type: 'SET_AUTO_ADVANCE_ENABLED', payload: true });
      }

      // Sync audio with video
      const audioElement = document.getElementById(
        `audio-${scene.id}`,
      ) as HTMLAudioElement;
      if (audioElement) {
        audioElement.currentTime = videoRef.currentTime;
        audioElement.play().catch((error) => {
          console.error('Failed to play audio for scene:', scene.id, error);
        });
      }
    });

    videoRef.addEventListener('pause', () => {
      // Reset auto-playing flag
      videoRef.dataset.autoPlaying = 'false';

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

    videoRef.addEventListener('timeupdate', updateSubtitle);

    // Set initial subtitle when video is ready
    videoRef.addEventListener('loadeddata', () => {
      updateSubtitle();
    });

    videoRef.addEventListener('ended', () => {
      // Reset auto-playing flag
      videoRef.dataset.autoPlaying = 'false';

      const audioElement = document.getElementById(
        `audio-${scene.id}`,
      ) as HTMLAudioElement;
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
      dispatch({ type: 'SET_CURRENT_SUBTITLE', payload: '' });

      // Auto-select next scene if available
      if (scenes && scenes.length > 0) {
        const currentscenePosition = scenes.findIndex(
          (s: any) => s.id === scene.id,
        );
        const nextscenePosition = currentscenePosition + 1;

        if (nextscenePosition < scenes.length) {
          const nextScene = scenes[nextscenePosition];
          dispatch({ type: 'SET_SELECTED_SCENE_ID', payload: nextScene.id });
        }
      }
    });
  };

  return {
    state,
    dispatch,
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
  };
}
