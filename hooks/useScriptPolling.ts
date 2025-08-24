import { useReducer, useEffect } from 'react';
import { useAuthenticatedFetch } from '../components/useAuthenticatedFetch';

// Define the state interface
export interface ScriptPollingState {
  isLoadingScript: boolean;
  pollingCount: number;
  currentTimestamp: string;
  scriptData: any;
  mediaFiles: { [key: string]: string };
  assFiles: { [key: string]: string };
}

// Define action types
export type ScriptPollingAction =
  | { type: 'SET_LOADING_SCRIPT'; payload: boolean }
  | { type: 'SET_POLLING_COUNT'; payload: number }
  | { type: 'SET_CURRENT_TIMESTAMP'; payload: string }
  | { type: 'SET_SCRIPT_DATA'; payload: any }
  | { type: 'SET_MEDIA_FILES'; payload: { [key: string]: string } }
  | { type: 'SET_ASS_FILES'; payload: { [key: string]: string } }
  | { type: 'INCREMENT_POLLING_COUNT' }
  | { type: 'RESET_POLLING_STATE' };

// Initial state
const initialState: ScriptPollingState = {
  isLoadingScript: false,
  pollingCount: 0,
  currentTimestamp: '',
  scriptData: null,
  mediaFiles: {},
  assFiles: {},
};

// Reducer function
function scriptPollingReducer(
  state: ScriptPollingState,
  action: ScriptPollingAction,
): ScriptPollingState {
  switch (action.type) {
    case 'SET_LOADING_SCRIPT':
      return { ...state, isLoadingScript: action.payload };
    case 'SET_POLLING_COUNT':
      return { ...state, pollingCount: action.payload };
    case 'SET_CURRENT_TIMESTAMP':
      return { ...state, currentTimestamp: action.payload };
    case 'SET_SCRIPT_DATA':
      return { ...state, scriptData: action.payload };
    case 'SET_MEDIA_FILES':
      return { ...state, mediaFiles: action.payload };
    case 'SET_ASS_FILES':
      return { ...state, assFiles: action.payload };
    case 'INCREMENT_POLLING_COUNT':
      return { ...state, pollingCount: state.pollingCount + 1 };
    case 'RESET_POLLING_STATE':
      return initialState;
    default:
      return state;
  }
}

export function useScriptPolling() {
  const [state, dispatch] = useReducer(scriptPollingReducer, initialState);
  const { authenticatedFetch } = useAuthenticatedFetch();

  const fetchPreviewData = async (timestamp?: string): Promise<boolean> => {
    // Only set loading true on the first fetch
    if (state.pollingCount === 0) {
      dispatch({ type: 'SET_LOADING_SCRIPT', payload: true });
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
        dispatch({ type: 'SET_SCRIPT_DATA', payload: data.script });

        // Store media files
        if (data.mediaFiles) {
          dispatch({ type: 'SET_MEDIA_FILES', payload: data.mediaFiles });
        }

        // Store ASS files
        if (data.assFiles) {
          dispatch({ type: 'SET_ASS_FILES', payload: data.assFiles });
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
          dispatch({ type: 'SET_LOADING_SCRIPT', payload: false });
          console.log('✅ All MP4 scenes have signed URLs, stopping polling');
          return true; // Indicate success
        } else {
          // Still waiting for MP4 files
          console.log(
            `Waiting for MP4 files. Polling attempt ${state.pollingCount + 1}`,
          );
          return false; // Continue polling
        }
      } else {
        // No script found yet
        console.log(
          `No script found yet. Polling attempt ${state.pollingCount + 1}`,
        );
        return false; // Indicate no data yet
      }
    } catch (error) {
      console.error('Error fetching preview data:', error);
      // Only set error and stop loading on actual errors, not when data is not ready
      if (state.pollingCount === 0) {
        dispatch({ type: 'SET_LOADING_SCRIPT', payload: false });
      }
      return false; // Indicate failure
    }
  };

  const startPolling = async (timestamp: string) => {
    dispatch({ type: 'SET_CURRENT_TIMESTAMP', payload: timestamp });
    dispatch({ type: 'SET_POLLING_COUNT', payload: 0 });
    dispatch({ type: 'SET_LOADING_SCRIPT', payload: true }); // Set loading immediately when polling starts

    const pollInterval = setInterval(async () => {
      dispatch({ type: 'INCREMENT_POLLING_COUNT' });
      const success = await fetchPreviewData(timestamp);

      if (success) {
        clearInterval(pollInterval);
        console.log('Script found! Stopping polling.');
      }
    }, 5000); // Poll every 5 seconds

    // Store the interval ID for cleanup
    return pollInterval;
  };

  const resetPollingState = () => {
    dispatch({ type: 'RESET_POLLING_STATE' });
  };

  return {
    state,
    dispatch,
    fetchPreviewData,
    startPolling,
    resetPollingState,
  };
}
