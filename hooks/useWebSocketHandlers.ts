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
  creatingSceneId?: number | null;
  setAdditionalScenes?: React.Dispatch<React.SetStateAction<any[]>>;
  currentEditingSceneId?: number | null;
  setRegeneratingSceneId?: React.Dispatch<React.SetStateAction<number | null>>;
}

export function useWebSocketHandlers({
  setVideoGenerationState,
  showToasterMessage,
  setCreatingSceneId,
  creatingSceneId,
  setAdditionalScenes,
  currentEditingSceneId,
  setRegeneratingSceneId,
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
    (data: { manifest?: Manifest; timestamp: string }) => {
      if (data.manifest) {
        setVideoGenerationState((prev) => ({
          ...prev,
          currentTimestamp: data.timestamp || prev.currentTimestamp,
          manifest: data.manifest || null,
          isLoadingVideoScenes: false,
          isLoadingAudioSubtitles: false,
        }));

        // Update video elements with new ASS and subtitle content
        // This handles both scene creation and audio regeneration
        const videoElements = document.querySelectorAll('video');
        videoElements.forEach((videoRef) => {
          if (videoRef.dataset.initialized) {
            // Build complete ASS files object from the updated manifest
            const timestamp = data.manifest?.generatedAt || data.timestamp;
            const completeAssFiles: { [key: string]: string } = {};

            data.manifest?.scenes.forEach((scene: any) => {
              const assKey = `${timestamp}.scene-${scene.scenePosition}.ass`;
              completeAssFiles[assKey] = scene.files.ass;
            });

            // Update the video element with complete ASS content
            videoRef.dataset.assFiles = JSON.stringify(completeAssFiles);

            // Force immediate subtitle update by triggering a timeupdate event
            const timeupdateEvent = new Event('timeupdate', {
              bubbles: true,
            });
            videoRef.dispatchEvent(timeupdateEvent);
          }
        });

        // Update scene durations from manifest
        if (data.manifest?.scenes) {
          data.manifest.scenes.forEach((manifestScene: any) => {
            if (manifestScene.files?.duration) {
              // Find and update the corresponding scene in additionalScenes
              if (setAdditionalScenes) {
                setAdditionalScenes((prev) => {
                  return prev.map((item) => {
                    if (item.scene.id === manifestScene.id) {
                      return {
                        ...item,
                        scene: {
                          ...item.scene,
                          duration: manifestScene.files.duration,
                        },
                      };
                    }
                    return item;
                  });
                });
              }
            }
          });
        }

        // Remove the specific scene that was just saved from additionalScenes
        // This prevents duplicates since the scene is now part of the manifest
        if (
          setAdditionalScenes &&
          creatingSceneId !== null &&
          creatingSceneId !== undefined
        ) {
          setAdditionalScenes((prev) => {
            const filtered = prev.filter(
              (item) => item.scene.id !== creatingSceneId,
            );

            // If we're currently editing a user-added scene and it's not the one being removed,
            // we need to ensure the editing state is preserved by maintaining the scene object identity
            if (
              currentEditingSceneId &&
              currentEditingSceneId !== creatingSceneId
            ) {
              // Find the scene being edited and preserve its object reference
              const editingSceneItem = prev.find(
                (item) => item.scene.id === currentEditingSceneId,
              );
              if (editingSceneItem) {
                // Replace the scene in the filtered array with the original object to preserve identity
                const editingIndex = filtered.findIndex(
                  (item) => item.scene.id === currentEditingSceneId,
                );
                if (editingIndex !== -1) {
                  filtered[editingIndex] = editingSceneItem;
                }
              }
            }

            return filtered;
          });
        }

        // Clear creating scene ID when preview is completed
        if (setCreatingSceneId) {
          setCreatingSceneId(null);
        }

        // Clear regenerating scene ID when preview is completed
        if (setRegeneratingSceneId) {
          setRegeneratingSceneId(null);
        }
      }
    },
    [
      setVideoGenerationState,
      setCreatingSceneId,
      creatingSceneId,
      setAdditionalScenes,
      currentEditingSceneId,
      setRegeneratingSceneId,
    ],
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
