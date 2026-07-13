import { useEffect, useRef } from 'react';
import { Manifest } from '@/app/types/manifest';

interface Params {
  setCurrentStep: (s: number) => void;
  videoGenerationState: {
    currentTimestamp: string;
  };
  setVideoGenerationState: React.Dispatch<
    React.SetStateAction<{
      isLoadingAudioSubtitles: boolean;
      isLoadingVideoScenes: boolean;
      currentTimestamp: string;
      manifest: Manifest | undefined;
    }>
  >;
  setRemovedOriginalScenes: (s: Set<number>) => void;
  setIsVideoGenerating?: (v: boolean) => void;
  setVideoCompletionData?: (m: Manifest | null) => void;
  onInitialStep?: (step: number) => void;
}

export function useCreateUrlParams({
  setCurrentStep,
  videoGenerationState,
  setVideoGenerationState,
  setRemovedOriginalScenes,
  setIsVideoGenerating,
  setVideoCompletionData,
  onInitialStep,
}: Params) {
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const run = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const timestampFromUrl = urlParams.get('timestamp');
      const stepFromUrl = urlParams.get('step');

      if (stepFromUrl) {
        const stepNumber = parseInt(stepFromUrl);
        if (stepNumber >= 1 && stepNumber <= 3) {
          setCurrentStep(stepNumber);
          onInitialStep && onInitialStep(stepNumber);
        }
      }

      if (
        timestampFromUrl &&
        timestampFromUrl !== videoGenerationState.currentTimestamp
      ) {
        if (stepFromUrl === '3') {
          // Landing directly on the export step (fresh load, refresh, or
          // navigating back later) has no live WebSocket session to report
          // completion, so hydrate from the persisted manifest instead.
          setVideoGenerationState((prev) => ({
            ...prev,
            currentTimestamp: timestampFromUrl,
          }));

          const previewResponse = await fetch(
            `/api/fetch-preview?timestamp=${timestampFromUrl}`,
            {
              method: 'GET',
            },
          );
          const response = await previewResponse.json();
          const manifest = response.manifest;

          if (manifest?.finalVideoUrl) {
            setIsVideoGenerating && setIsVideoGenerating(false);
            setVideoCompletionData && setVideoCompletionData(manifest);
          } else {
            // Video hasn't finished yet — show the generating state rather
            // than the empty "0 seconds / 0 scenes" placeholder.
            setIsVideoGenerating && setIsVideoGenerating(true);
          }
        }

        if (stepFromUrl === '2') {
          setVideoGenerationState((prev) => ({
            ...prev,
            currentTimestamp: timestampFromUrl,
            isLoadingAudioSubtitles: true,
            isLoadingVideoScenes: true,
          }));

          const previewResponse = await fetch(
            `/api/fetch-preview?timestamp=${timestampFromUrl}`,
            {
              method: 'GET',
            },
          );
          const response = await previewResponse.json();
          const manifest = response.manifest;

          if (manifest?.scenes) {
            const removedScenes = new Set<number>();
            manifest.scenes.forEach((scene: any) => {
              if (scene.removed) {
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

    run();
  }, []);
}
