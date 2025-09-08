import React from 'react';
import VideoSkeleton from './VideoSkeleton';

interface RightSidebarProps {
  currentStep: number;
  generationState: {
    generatedVideoUrl?: string | null;
    selectedGalleryVideo?: { url: string };
  };
  videoGenerationState: {
    isLoadingVideoScenes: boolean;
    currentTimestamp: string;
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
  return (
    <div className="sticky">
      {currentStep === 1 &&
        !generationState.generatedVideoUrl &&
        !generationState.selectedGalleryVideo && (
          <div className="flex justify-center">
            <video
              className="rounded-xl shadow-lg border-2 border-gray-600"
              style={{ width: '85%', height: 'auto' }}
              controls
              autoPlay
              muted
              loop
              src={exampleVideoUrl}
            />
          </div>
        )}

      {currentStep === 2 && videoGenerationState.isLoadingVideoScenes && (
        <div className="flex justify-center items-center h-full">
          <VideoSkeleton />
        </div>
      )}

      {currentStep === 2 &&
        !videoGenerationState.isLoadingVideoScenes &&
        scenes.length > 0 && (
          <>
            {scenes.map((scene: any, index: number) => {
              const videoKey = `${videoGenerationState.currentTimestamp}.scene-${index}.mp4`;
              const assKey = `${videoGenerationState.currentTimestamp}.scene-${index}.ass`;
              const isVisible = sceneState.selectedSceneId === scene.id;

              // Find the correct index for the selected scene
              const selectedSceneIndex = scenes.findIndex(
                (s: any) => s.id === sceneState.selectedSceneId,
              );
              const isVisibleByIndex = index === selectedSceneIndex;

              return (
                <div
                  key={scene.id}
                  className={isVisibleByIndex ? 'block' : 'hidden'}
                >
                  {getMediaFiles()[videoKey] &&
                    getMediaFiles()[videoKey].startsWith('http') && (
                      <div className="relative flex justify-center">
                        <video
                          ref={(videoRef) => {
                            if (videoRef) {
                              setupVideoEventListeners(
                                videoRef,
                                scene,
                                scenes,
                                getAssFiles(),
                                videoGenerationState.currentTimestamp,
                                index,
                              );
                            }
                          }}
                          onError={(event) => {
                            console.error('Video error:', event);
                          }}
                          className="rounded-xl shadow-lg border-2 border-gray-600"
                          style={{ width: '85%', height: 'auto' }}
                          controls
                          preload="auto"
                          src={getMediaFiles()[videoKey] || ''}
                        />

                        {/* Subtitles Overlay */}
                        {isVisibleByIndex && sceneState.currentSubtitle && (
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
                </div>
              );
            })}

            {/* Scene Audio - Hidden Controls */}
            {scenes.map((scene: any, index: number) => {
              const audioKey = `${videoGenerationState.currentTimestamp}.scene-${index}.mp3`;
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
          className="w-[180%] h-[101.25%] rounded-xl shadow-lg group -ml-[40%]"
          controls
          src={generationState.generatedVideoUrl}
        />
      )}

      {generationState.selectedGalleryVideo &&
        !generationState.generatedVideoUrl && (
          <video
            className="w-[180%] h-[101.25%] rounded-xl shadow-lg group -ml-[40%]"
            controls
            src={generationState.selectedGalleryVideo.url}
          />
        )}
    </div>
  );
}
