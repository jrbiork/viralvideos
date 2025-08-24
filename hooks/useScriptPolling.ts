import { useReducer, useEffect } from 'react';
import { useAuthenticatedFetch } from '../components/useAuthenticatedFetch';

// Define the state interface
export interface ScriptPollingState {
  isLoadingSubtitles: boolean;
  pollingCount: number;
  currentTimestamp: string;
  subtitleFiles: { [key: string]: string }[];
  mediaFiles: { [key: string]: string };
  assFiles: { [key: string]: string };
}

// Define action types
export type ScriptPollingAction =
  | { type: 'SET_LOADING_SUBTITLES'; payload: boolean }
  | { type: 'SET_POLLING_COUNT'; payload: number }
  | { type: 'SET_CURRENT_TIMESTAMP'; payload: string }
  | { type: 'SET_SUBTITLE_FILES'; payload: { [key: string]: string }[] }
  | { type: 'SET_MEDIA_FILES'; payload: { [key: string]: string } }
  | { type: 'SET_ASS_FILES'; payload: { [key: string]: string } }
  | { type: 'INCREMENT_POLLING_COUNT' }
  | { type: 'RESET_POLLING_STATE' };

// Initial state
const initialState: ScriptPollingState = {
  isLoadingSubtitles: false,
  pollingCount: 0,
  currentTimestamp: '',
  subtitleFiles: [],
  mediaFiles: {},
  assFiles: {},
};

// Reducer function
function scriptPollingReducer(
  state: ScriptPollingState,
  action: ScriptPollingAction,
): ScriptPollingState {
  switch (action.type) {
    case 'SET_LOADING_SUBTITLES':
      return { ...state, isLoadingSubtitles: action.payload };
    case 'SET_POLLING_COUNT':
      return { ...state, pollingCount: action.payload };
    case 'SET_CURRENT_TIMESTAMP':
      return { ...state, currentTimestamp: action.payload };
    case 'SET_SUBTITLE_FILES':
      return { ...state, subtitleFiles: action.payload };
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
      dispatch({ type: 'SET_LOADING_SUBTITLES', payload: true });
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
      console.log('data fetch preview:', data);

      // Check if we have data
      if (data) {
        // Store subtitle files
        if (data.subtitleFiles) {
          dispatch({ type: 'SET_SUBTITLE_FILES', payload: data.subtitleFiles });
        }

        // Store media files
        if (data.mediaFiles) {
          dispatch({ type: 'SET_MEDIA_FILES', payload: data.mediaFiles });
        }

        // Store ASS files
        if (data.assFiles) {
          dispatch({ type: 'SET_ASS_FILES', payload: data.assFiles });
        }

        // Check if we have all subtitle JSON files
        const subtitleFilesArray = data.subtitleFiles || [];

        // Count the total number of subtitle JSON files across all objects
        let subtitleJsonFileCount = 0;
        subtitleFilesArray.forEach((subtitleFile: any) => {
          Object.keys(subtitleFile).forEach((key) => {
            if (key.endsWith('.subtitle.json')) {
              subtitleJsonFileCount++;
            }
          });
        });

        console.log(`Found ${subtitleJsonFileCount} subtitle JSON files`);
        console.log('Script data received:', data.script);
        console.log('Subtitle files received:', data.subtitleFiles);

        // If we have subtitle files, check if we have a reasonable number (3 or more)
        // This indicates that the subtitle generation is complete
        if (subtitleJsonFileCount === data.scenesCount) {
          // All subtitle JSON files are ready
          dispatch({ type: 'SET_LOADING_SUBTITLES', payload: false });
          console.log(
            '✅ All subtitle JSON files have been fetched, stopping polling',
          );
          return true; // Indicate success
        } else {
          // Still waiting for subtitle JSON files
          console.log(
            `Waiting for subtitle JSON files. Polling attempt ${
              state.pollingCount + 1
            }`,
          );
          return false; // Continue polling
        }
      } else {
        // No data found yet
        console.log(
          `No data found yet. Polling attempt ${state.pollingCount + 1}`,
        );
        return false; // Indicate no data yet
      }
    } catch (error) {
      console.error('Error fetching preview data:', error);
      // Only set error and stop loading on actual errors, not when data is not ready
      if (state.pollingCount === 0) {
        dispatch({ type: 'SET_LOADING_SUBTITLES', payload: false });
      }
      return false; // Indicate failure
    }
  };

  const startPolling = async (timestamp: string) => {
    dispatch({ type: 'SET_CURRENT_TIMESTAMP', payload: timestamp });
    dispatch({ type: 'SET_POLLING_COUNT', payload: 0 });
    dispatch({ type: 'SET_LOADING_SUBTITLES', payload: true }); // Set loading immediately when polling starts

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
