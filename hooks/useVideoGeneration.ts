import { useReducer } from 'react';
import { useAuthenticatedFetch } from '../components/useAuthenticatedFetch';
import { format } from 'date-fns';

// Define the state interface
export interface VideoGenerationState {
  isGenerating: boolean;
  generatedVideoUrl: string | null;
  selectedGalleryVideo: any;
  generationStatus: 'idle' | 'queued' | 'processing' | 'completed' | 'error';
  statusMessage: string;
  hasStartedProcess: boolean;
}

// Define action types
export type VideoGenerationAction =
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'SET_GENERATED_VIDEO_URL'; payload: string | null }
  | { type: 'SET_SELECTED_GALLERY_VIDEO'; payload: any }
  | {
      type: 'SET_GENERATION_STATUS';
      payload: 'idle' | 'queued' | 'processing' | 'completed' | 'error';
    }
  | { type: 'SET_STATUS_MESSAGE'; payload: string }
  | { type: 'SET_HAS_STARTED_PROCESS'; payload: boolean }
  | { type: 'RESET_GENERATION_STATE' };

// Initial state
const initialState: VideoGenerationState = {
  isGenerating: false,
  generatedVideoUrl: null,
  selectedGalleryVideo: null,
  generationStatus: 'idle',
  statusMessage: '',
  hasStartedProcess: false,
};

const SCENE_SIZES = {
  60: 6,
  30: 3,
};

// Reducer function
function videoGenerationReducer(
  state: VideoGenerationState,
  action: VideoGenerationAction,
): VideoGenerationState {
  switch (action.type) {
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.payload };
    case 'SET_GENERATED_VIDEO_URL':
      return { ...state, generatedVideoUrl: action.payload };
    case 'SET_SELECTED_GALLERY_VIDEO':
      return { ...state, selectedGalleryVideo: action.payload };
    case 'SET_GENERATION_STATUS':
      return { ...state, generationStatus: action.payload };
    case 'SET_STATUS_MESSAGE':
      return { ...state, statusMessage: action.payload };
    case 'SET_HAS_STARTED_PROCESS':
      return { ...state, hasStartedProcess: action.payload };
    case 'RESET_GENERATION_STATE':
      return initialState;
    default:
      return state;
  }
}

export function useVideoGeneration() {
  const [state, dispatch] = useReducer(videoGenerationReducer, initialState);
  const { authenticatedFetch, isAuthenticated } = useAuthenticatedFetch();

  const generateVideo = async (
    script: string,
    duration: 30 | 60,
    onSuccess?: (timestamp: string) => void,
  ) => {
    if (!isAuthenticated) return;

    dispatch({ type: 'SET_HAS_STARTED_PROCESS', payload: true });
    dispatch({ type: 'SET_GENERATING', payload: true });
    dispatch({ type: 'SET_GENERATED_VIDEO_URL', payload: null });
    dispatch({ type: 'SET_GENERATION_STATUS', payload: 'queued' });
    dispatch({
      type: 'SET_STATUS_MESSAGE',
      payload: 'Queuing video generation request...',
    });

    try {
      console.log('generateVideo called', duration, SCENE_SIZES[duration]);
      const timestamp = format(new Date(), 'MMddyyHHmmss');
      await authenticatedFetch('/api/generate-video', {
        method: 'POST',
        body: {
          prompt: script,
          timestamp,
          totalDuration: duration,
          sceneCount: SCENE_SIZES[duration],
          step: 1,
        },
      });

      dispatch({ type: 'SET_GENERATION_STATUS', payload: 'processing' });
      dispatch({
        type: 'SET_STATUS_MESSAGE',
        payload: 'Video is being generated... This may take a few minutes.',
      });

      // Simulate completion and transition to step 2
      dispatch({ type: 'SET_GENERATION_STATUS', payload: 'completed' });
      dispatch({
        type: 'SET_STATUS_MESSAGE',
        payload: 'Video generated successfully!',
      });

      // Update URL with timestamp query parameter
      const url = new URL(window.location.href);
      url.searchParams.set('timestamp', timestamp);
      window.history.replaceState({}, '', url.toString());

      if (onSuccess) {
        onSuccess(timestamp);
      }
    } catch (error) {
      console.error('Error queuing video generation:', error);
      dispatch({ type: 'SET_GENERATION_STATUS', payload: 'error' });
      dispatch({
        type: 'SET_STATUS_MESSAGE',
        payload: 'Failed to queue video generation. Please try again.',
      });
      alert('Failed to queue video generation. Please try again.');
    } finally {
      dispatch({ type: 'SET_GENERATING', payload: false });
    }
  };

  const resetGenerationState = () => {
    dispatch({ type: 'RESET_GENERATION_STATE' });
  };

  return {
    state,
    generateVideo,
    resetGenerationState,
    isAuthenticated,
  };
}
