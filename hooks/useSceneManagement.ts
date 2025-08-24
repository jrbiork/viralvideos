import { useReducer, useEffect } from 'react';
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
  | { type: 'RESET_SCENE_STATE' }
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
    case 'RESET_SCENE_STATE':
      return initialState;
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

  const handleEditScene = (sceneId: number, narration: string) => {
    dispatch({ type: 'SET_EDITING_SCENE', payload: sceneId });
    dispatch({ type: 'SET_EDITED_NARRATION', payload: narration });
  };

  const handleSaveEdit = (
    sceneId: number,
    scriptData: any,
    onScriptUpdate: (updatedScript: any) => void,
  ) => {
    if (scriptData) {
      const updatedScenes = scriptData.scenes.map((scene: any) =>
        scene.id === sceneId
          ? { ...scene, narration: state.editedNarration }
          : scene,
      );
      const updatedScript = { ...scriptData, scenes: updatedScenes };
      onScriptUpdate(updatedScript);
      dispatch({ type: 'SET_EDITING_SCENE', payload: null });
      dispatch({ type: 'SET_EDITED_NARRATION', payload: '' });
    }
  };

  const handleCancelEdit = () => {
    dispatch({ type: 'SET_EDITING_SCENE', payload: null });
    dispatch({ type: 'SET_EDITED_NARRATION', payload: '' });
  };

  const handleSceneSelection = (sceneId: number) => {
    dispatch({ type: 'SET_SELECTED_SCENE_ID', payload: sceneId });
  };

  const handleDeleteScene = (sceneId: number) => {
    dispatch({ type: 'DELETE_SCENE', payload: sceneId });
  };

  const handleAddScene = (position: number) => {
    // Create a new scene object
    const newScene = {
      id: Date.now(), // Use timestamp as temporary ID
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

  const resetSceneState = () => {
    dispatch({ type: 'RESET_SCENE_STATE' });
  };

  // Auto-select first scene when script data is loaded
  const autoSelectFirstScene = (scriptData: any) => {
    if (
      scriptData &&
      scriptData.scenes &&
      scriptData.scenes.length > 0 &&
      state.selectedSceneId === null
    ) {
      dispatch({
        type: 'SET_SELECTED_SCENE_ID',
        payload: scriptData.scenes[0].id,
      });
    }
  };

  // Auto-play video when selectedSceneId changes (only if auto-advance is enabled)
  const handleAutoPlay = (scriptData: any, currentTimestamp: string) => {
    if (
      state.selectedSceneId !== null &&
      scriptData &&
      scriptData.scenes &&
      state.autoAdvanceEnabled
    ) {
      const selectedSceneIndex = scriptData.scenes.findIndex(
        (s: any) => s.id === state.selectedSceneId,
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
  };

  // Setup video event listeners
  const setupVideoEventListeners = (
    videoRef: HTMLVideoElement,
    scene: any,
    scriptData: any,
    assFiles: { [key: string]: string },
    currentTimestamp: string,
    sceneIndex: number,
  ) => {
    if (!videoRef || videoRef.dataset.initialized) return;

    // Mark as initialized to prevent multiple event listener setup
    videoRef.dataset.initialized = 'true';

    // Store the assFiles reference on the video element for dynamic updates
    videoRef.dataset.assFiles = JSON.stringify(assFiles);
    videoRef.dataset.currentTimestamp = currentTimestamp;
    videoRef.dataset.sceneId = scene.id.toString();

    const updateSubtitle = () => {
      // Get the latest assFiles from the video element
      const latestAssFiles = JSON.parse(videoRef.dataset.assFiles || '{}');
      const assKey = `${currentTimestamp}.scene-${scene.id}.ass`;
      const assContent = latestAssFiles[assKey];
      const subtitles = assContent ? parseAssFile(assContent) : [];

      console.log('🔍 updateSubtitle - assKey:', assKey);
      console.log(
        '🔍 updateSubtitle - assContent length:',
        assContent ? assContent.length : 0,
      );
      console.log('🔍 updateSubtitle - subtitles count:', subtitles.length);

      const currentTime = videoRef.currentTime;
      const currentSub = subtitles.find(
        (sub) => currentTime >= sub.start && currentTime <= sub.end,
      );

      console.log('🔍 updateSubtitle - currentTime:', currentTime);
      console.log(
        '🔍 updateSubtitle - currentSub:',
        currentSub ? currentSub.coloredText : 'none',
      );

      dispatch({
        type: 'SET_CURRENT_SUBTITLE',
        payload: currentSub ? currentSub.coloredText : '',
      });
    };

    // Add event listeners only once
    videoRef.addEventListener('play', () => {
      // Enable auto-advance when user manually plays a video
      if (!state.autoAdvanceEnabled) {
        dispatch({ type: 'SET_AUTO_ADVANCE_ENABLED', payload: true });
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

    videoRef.addEventListener('timeupdate', updateSubtitle);

    videoRef.addEventListener('ended', () => {
      const audioElement = document.getElementById(
        `audio-${scene.id}`,
      ) as HTMLAudioElement;
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
      dispatch({ type: 'SET_CURRENT_SUBTITLE', payload: '' });

      // Auto-select next scene if available
      if (scriptData && scriptData.scenes) {
        const currentSceneIndex = scriptData.scenes.findIndex(
          (s: any) => s.id === scene.id,
        );
        const nextSceneIndex = currentSceneIndex + 1;

        if (nextSceneIndex < scriptData.scenes.length) {
          const nextScene = scriptData.scenes[nextSceneIndex];
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
    resetSceneState,
    autoSelectFirstScene,
    handleAutoPlay,
    setupVideoEventListeners,
  };
}
