import { useCallback } from 'react';
import { WebSocketMessage } from '../app/types/websocket';
import { Manifest } from '../app/types/manifest';

interface UseWebSocketHandlersProps {
  setVideoGenerationState: React.Dispatch<
    React.SetStateAction<{
      isLoadingAudioSubtitles: boolean;
      isLoadingVideoScenes: boolean;
      currentTimestamp: string;
      manifest: Manifest | null;
    }>
  >;
  showToasterMessage: (message: string, type: 'success' | 'error') => void;
  setCreatingSceneId?: React.Dispatch<React.SetStateAction<number | null>>;
  setAdditionalScenes?: React.Dispatch<React.SetStateAction<any[]>>;
}

export function useWebSocketHandlers({
  setVideoGenerationState,
  showToasterMessage,
  setCreatingSceneId,
  setAdditionalScenes,
}: UseWebSocketHandlersProps) {
  // Handle video completion
  const handleVideoCompleted = useCallback(
    (data: any) => {
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
    },
    [showToasterMessage],
  );

  // Handle image creation
  const handleImageCreated = useCallback(
    (data: any) => {
      if (data.manifest) {
        setVideoGenerationState((prev) => ({
          ...prev,
          currentTimestamp: data.timestamp || prev.currentTimestamp,
          manifest: data.manifest,
        }));
      }
    },
    [setVideoGenerationState],
  );

  // Handle audio and subtitle creation
  const handleAudioSubtitleCreated = useCallback(
    (data: any) => {
      if (data.manifest) {
        setVideoGenerationState((prev) => ({
          ...prev,
          currentTimestamp: data.timestamp || prev.currentTimestamp,
          manifest: data.manifest,
          isLoadingAudioSubtitles: false, // Set to false when audio/subtitles are ready
        }));
      }
    },
    [setVideoGenerationState],
  );

  // Handle video completion
  const handlePreviewCompleted = useCallback(
    (data: any) => {
      if (data.manifest) {
        setVideoGenerationState((prev) => ({
          ...prev,
          currentTimestamp: data.timestamp || prev.currentTimestamp,
          manifest: data.manifest,
          isLoadingVideoScenes: false,
          isLoadingAudioSubtitles: false,
        }));

        // Clear creating scene ID when preview is completed
        if (setCreatingSceneId) {
          setCreatingSceneId(null);
        }

        // Clear all in-memory scenes when a new manifest is received
        // This prevents duplicate scenes when the WebSocket response includes the newly created scene
        if (setAdditionalScenes) {
          setAdditionalScenes([]);
        }
      }
    },
    [setVideoGenerationState, setCreatingSceneId, setAdditionalScenes],
  );

  // Handle insufficient credits
  const handleInsufficientCredits = useCallback(
    (data: any) => {
      console.log('Insufficient credits:', data);
      showToasterMessage('Insufficient credits', 'error');
    },
    [showToasterMessage],
  );

  // Main WebSocket message handler
  const handleWebSocketMessage = useCallback(
    (message: WebSocketMessage) => {
      console.log('WebSocket message:', message);

      // Handle different message types
      switch (message.action) {
        case 'image_created':
          handleImageCreated(message.data);
          break;
        case 'audio_subtitle_created':
          handleAudioSubtitleCreated(message.data);
          break;
        case 'preview_completed':
          handlePreviewCompleted(message.data);
          break;
        case 'video_completed':
          handleVideoCompleted(message.data);
          break;
        case 'insufficient_credits':
          handleInsufficientCredits(message.data);
          break;
        default:
          // Unknown message type
          break;
      }
    },
    [
      handleImageCreated,
      handleAudioSubtitleCreated,
      handlePreviewCompleted,
      handleVideoCompleted,
      handleInsufficientCredits,
    ],
  );

  return {
    handleWebSocketMessage,
    handleVideoCompleted,
    handleImageCreated,
    handleAudioSubtitleCreated,
    handlePreviewCompleted,
    handleInsufficientCredits,
  };
}
