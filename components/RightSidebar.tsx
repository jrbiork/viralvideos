import React, { useEffect, useState } from 'react';
import VideoSkeleton from './VideoSkeleton';
import { isManifestFullyReady } from '@/lib/manifest-helpers';

interface RightSidebarProps {
  currentStep: number;
  generationState: {
    generatedVideoUrl?: string | null;
    selectedGalleryVideo?: { url: string };
  };
  videoGenerationState: {
    isLoadingVideoScenes: boolean;
    isLoadingAudioSubtitles: boolean;
    currentTimestamp: string;
    manifest?: {
      generatedAt: string;
      scenes: any[];
    } | null;
  };
  scenes: any[];
  sceneState: {
    selectedSceneId: number | null;
    currentSubtitle?: string;
  };
  getMediaFiles: () => Record<string, string>;
  getAssFiles: () => Record<string, string>;
  setupVideoEventListeners: (
    videoRef: HTMLVideoElement,
    scene: any,
    scenes: any[],
    assFiles: Record<string, string>,
    timestamp: string,
    index: number,
  ) => void;
  parseColoredText: (text: string) => React.ReactNode;
  exampleVideoUrl: string;
}

export default function RightSidebar({
  currentStep,
  generationState,
  videoGenerationState,
  scenes,
  sceneState,
  getMediaFiles,
  getAssFiles,
  setupVideoEventListeners,
  parseColoredText,
  exampleVideoUrl,
}: RightSidebarProps) {
  // Gate the preview on the manifest's own content (every non-removed scene
  // has a real, existence-checked mp4) rather than a flag that can be
  // cleared prematurely by the initial REST hydrate on direct navigation —
  // see useCreateUrlParams.ts, which does not verify per-scene readiness.
  const videoPreviewReady = isManifestFullyReady(
    (videoGenerationState.manifest as any) || undefined,
  );

  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) =>
      setIsDesktop(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return (
    <div className="sticky">
      {currentStep === 1 &&
        !generationState.generatedVideoUrl &&
        !generationState.selectedGalleryVideo && (
          <details className="group" open={isDesktop}>
            <summary className="flex items-center justify-center gap-2 cursor-pointer select-none list-none text-sm font-medium text-gray-300 hover:text-white py-2">
              <span>See an example</span>
              <svg
                className="w-4 h-4 transition-transform duration-200 group-open:rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </summary>
            <div className="flex justify-center mt-2">
              <div className="rounded-xl shadow-lg border-2 border-gray-600 aspect-[9/16] w-[65%] bg-black overflow-hidden">
                <video
                  className="w-full h-full object-contain"
                  controls
                  muted
                  loop
                  preload="none"
                  src={exampleVideoUrl}
                />
              </div>
            </div>
          </details>
        )}

      {currentStep === 2 && !videoPreviewReady && (
        <div className="flex justify-center items-center h-full">
          <VideoSkeleton
            phase={
              videoGenerationState.isLoadingAudioSubtitles ? 'audio' : 'scenes'
            }
          />
        </div>
      )}

      {currentStep === 2 && videoPreviewReady && scenes.length > 0 && (
          <>
            {scenes.map((scene: any, index: number) => {
              // Get the actual scene number from the manifest file names
              let sceneNumber = scene.id.toString();
              if (videoGenerationState.manifest?.scenes) {
                // Find the manifest scene by matching the scene ID
                // Extract the scene ID from the manifest file names to match with scene.id
                const manifestScene = videoGenerationState.manifest.scenes.find(
                  (manifestScene: any) => {
                    // Extract the scene ID from the manifest file names
                    const manifestSceneId = manifestScene.files?.mp3
                      ? parseInt(
                          manifestScene.files.mp3.match(/scene-(\d+)\./)?.[1] ||
                            manifestScene.scenePosition.toString(),
                        )
                      : manifestScene.scenePosition;

                    return manifestSceneId === scene.id;
                  },
                );
                if (manifestScene?.files?.mp4) {
                  const extractedNumber =
                    manifestScene.files.mp4.match(/scene-(\d+)\./)?.[1];
                  if (extractedNumber) {
                    sceneNumber = extractedNumber;
                  }
                }
              }

              // Use the timestamp from manifest instead of currentTimestamp
              const manifestTimestamp =
                videoGenerationState.manifest?.generatedAt ||
                videoGenerationState.currentTimestamp;
              const videoKey = `${manifestTimestamp}.scene-${sceneNumber}.mp4`;
              const assKey = `${manifestTimestamp}.scene-${sceneNumber}.ass`;
              const isSelected = sceneState.selectedSceneId === scene.id;
              const mediaFiles = getMediaFiles();
              const videoUrl = mediaFiles[videoKey];

              return (
                <div key={scene.id} className={isSelected ? 'block' : 'hidden'}>
                  {videoUrl && (
                    <div className="relative flex justify-center">
                      <div className="rounded-xl shadow-lg border-2 border-gray-600 aspect-[9/16] w-[65%] bg-black overflow-hidden">
                        <video
                          ref={(videoRef) => {
                            if (videoRef && isSelected) {
                              setupVideoEventListeners(
                                videoRef,
                                { ...scene, sceneNumber }, // Pass sceneNumber to the function
                                scenes,
                                getAssFiles(),
                                manifestTimestamp,
                                index,
                              );
                            }
                          }}
                          className="w-full h-full object-contain"
                          controls
                          preload="auto"
                          src={videoUrl}
                          onError={(event) => {
                            console.error('Video error:', event);
                          }}
                        />
                      </div>

                      {/* Subtitles Overlay */}
                      {isSelected && sceneState.currentSubtitle && (
                        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 w-4/5 z-10">
                          <p
                            className="text-xl font-medium leading-relaxed text-center"
                            style={{ fontFamily: 'DMSerifText, serif' }}
                          >
                            {parseColoredText(sceneState.currentSubtitle)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {!videoUrl &&
                    isSelected &&
                    (scene.isUserAdded ? (
                      <div className="flex justify-center">
                        <div className="rounded-xl shadow-lg border-2 border-gray-600 aspect-[9/16] w-[65%] bg-black overflow-hidden flex items-center justify-center">
                          <p className="text-gray-300 text-center px-4">
                            Video scene not generated yet.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-center items-center h-64">
                        <p className="text-gray-400">Video not available</p>
                      </div>
                    ))}
                </div>
              );
            })}

            {/* Scene Audio - Hidden Controls */}
            {scenes.map((scene: any, index: number) => {
              // Get the actual scene number from the manifest file names
              let sceneNumber = scene.id.toString();
              if (videoGenerationState.manifest?.scenes) {
                // Find the manifest scene by matching the scene ID
                // Extract the scene ID from the manifest file names to match with scene.id
                const manifestScene = videoGenerationState.manifest.scenes.find(
                  (manifestScene: any) => {
                    // Extract the scene ID from the manifest file names
                    const manifestSceneId = manifestScene.files?.mp3
                      ? parseInt(
                          manifestScene.files.mp3.match(/scene-(\d+)\./)?.[1] ||
                            manifestScene.scenePosition.toString(),
                        )
                      : manifestScene.scenePosition;

                    return manifestSceneId === scene.id;
                  },
                );
                if (manifestScene?.files?.mp3) {
                  const extractedNumber =
                    manifestScene.files.mp3.match(/scene-(\d+)\./)?.[1];
                  if (extractedNumber) {
                    sceneNumber = extractedNumber;
                  }
                }
              }

              // Use the same timestamp as the video
              const manifestTimestamp =
                videoGenerationState.manifest?.generatedAt ||
                videoGenerationState.currentTimestamp;
              const audioKey = `${manifestTimestamp}.scene-${sceneNumber}.mp3`;
              return getMediaFiles()[audioKey] ? (
                <audio
                  key={scene.id}
                  id={`audio-${scene.id}`}
                  className="hidden"
                  src={getMediaFiles()[audioKey]}
                />
              ) : null;
            })}
          </>
        )}

      {generationState.generatedVideoUrl && (
        <video
          className="w-full h-full sm:w-[180%] sm:h-[101.25%] rounded-xl shadow-lg group ml-0 sm:-ml-[40%]"
          controls
          src={generationState.generatedVideoUrl}
        />
      )}

      {generationState.selectedGalleryVideo &&
        !generationState.generatedVideoUrl && (
          <video
            className="w-full h-full sm:w-[180%] sm:h-[101.25%] rounded-xl shadow-lg group ml-0 sm:-ml-[40%]"
            controls
            src={generationState.selectedGalleryVideo.url}
          />
        )}
    </div>
  );
}
