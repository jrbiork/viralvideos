import React from 'react';
import EditScene, { Scene } from './EditScene';
import EditSceneSkeleton from './EditSceneSkeleton';
import AddSceneButton from './AddSceneButton';

interface SceneCardsContainerProps {
  videoGenerationState: {
    isLoadingVideoScenes: boolean;
    isLoadingAudioSubtitles: boolean;
    currentTimestamp: string;
    manifest?: {
      scenes: any[];
    } | null;
  };
  scenes: Scene[];
  sceneState: {
    editingScene: number | null;
    editedNarration: string;
    selectedSceneId: number | null;
  };
  handleEditSceneWithSubtitle: (sceneId: number, narration: string) => void;
  setVideoGenerationState: React.Dispatch<React.SetStateAction<any>>;
  handleSaveEdit: (
    sceneId: number,
    scenes: any[],
    onScenesUpdate: (updatedScenes: any[]) => void,
  ) => void;
  handleCancelEdit: () => void;
  sceneDispatch: React.Dispatch<any>;
  handleRegenerateAudio?: (sceneId: number) => void;
  getMediaFiles: () => Record<string, string>;
  handleSceneSelection: (sceneId: number) => void;
  regeneratingSceneId: number | null;
  creatingSceneId: number | null;
  setCreatingSceneId: React.Dispatch<React.SetStateAction<number | null>>;
  handleAddSceneCustom: (position: number) => void;
  setAdditionalScenes: React.Dispatch<
    React.SetStateAction<{ scene: Scene; position: number }[]>
  >;
  handleDeleteScene: (sceneId: number) => void;
}

export default function SceneCardsContainer({
  videoGenerationState,
  scenes,
  sceneState,
  handleEditSceneWithSubtitle,
  setVideoGenerationState,
  handleSaveEdit,
  handleCancelEdit,
  sceneDispatch,
  handleRegenerateAudio,
  getMediaFiles,
  handleSceneSelection,
  regeneratingSceneId,
  creatingSceneId,
  setCreatingSceneId,
  handleAddSceneCustom,
  setAdditionalScenes,
  handleDeleteScene,
}: SceneCardsContainerProps) {
  return (
    <div className="space-y-4 mb-6 h-full overflow-y-auto pr-2 px-4 custom-scrollbar">
      {videoGenerationState.isLoadingVideoScenes && (
        <div className="flex items-center justify-center">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
              <span className="text-lg font-medium text-gray-700">
                Loading your videos...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Scene Cards */}
      {videoGenerationState.isLoadingAudioSubtitles
        ? // Show skeleton placeholders while loading audio/subtitles
          Array.from({ length: 3 }).map((_, index) => (
            <EditSceneSkeleton key={index} />
          ))
        : scenes.length > 0 && (
            <>
              {/* Add scene button before first scene */}
              <AddSceneButton
                onAddScene={handleAddSceneCustom}
                position={0}
                isFirst={true}
                disabled={false}
              />

              {/* Scene Cards */}
              {scenes.map((scene: any, index: number) => {
                // Get the image URL for this scene (only for original scenes)
                // Use the hydrated image URLs directly from the manifest
                let imageUrl = undefined;
                if (
                  !scene.isUserAdded &&
                  videoGenerationState.manifest?.scenes
                ) {
                  // Find the manifest scene by scenePosition
                  const manifestScene =
                    videoGenerationState.manifest.scenes.find(
                      (manifestScene) =>
                        manifestScene.scenePosition === scene.scenePosition,
                    );

                  // Use the hydrated image URL directly from the manifest
                  // The hydrateManifest function sets both png and jpg to the same signed URL
                  imageUrl =
                    manifestScene?.files?.png || manifestScene?.files?.jpg;
                }

                return (
                  <div key={scene.id}>
                    <EditScene
                      scene={scene}
                      editingScene={sceneState.editingScene}
                      editedNarration={sceneState.editedNarration}
                      onEditScene={handleEditSceneWithSubtitle}
                      setIsLoadingVideoScenes={(value: boolean) =>
                        setVideoGenerationState((prev: any) => ({
                          ...prev,
                          isLoadingVideoScenes: value,
                        }))
                      }
                      onSaveEdit={(sceneId) =>
                        handleSaveEdit(sceneId, scenes, (updatedScenes) => {
                          // Update the subtitleFiles in video generation state
                          const updatedSubtitleFiles = updatedScenes.map(
                            (scene: any, index: number) => {
                              const fileName = `${videoGenerationState.currentTimestamp}.scene-${index}.subtitle.json`;
                              return {
                                [fileName]: scene.narration,
                              };
                            },
                          );

                          // Update the subtitleFiles in video generation state
                          setVideoGenerationState((prev: any) => ({
                            ...prev,
                            subtitleFiles: updatedSubtitleFiles,
                          }));

                          // Update additionalScenes state for user-added scenes
                          setAdditionalScenes((prev) =>
                            prev.map((item) =>
                              item.scene.id === sceneId
                                ? {
                                    ...item,
                                    scene: {
                                      ...item.scene,
                                      narration: sceneState.editedNarration,
                                    },
                                  }
                                : item,
                            ),
                          );
                        })
                      }
                      onCancelEdit={handleCancelEdit}
                      onEditedNarrationChange={(value) => {
                        // Update the edited narration in the scene management state
                        sceneDispatch({
                          type: 'SET_EDITED_NARRATION',
                          payload: value,
                        });
                      }}
                      onRegenerateAudio={handleRegenerateAudio}
                      imageUrl={imageUrl}
                      isSelected={sceneState.selectedSceneId === scene.id}
                      onSelect={handleSceneSelection}
                      regeneratingSceneId={regeneratingSceneId}
                      creatingSceneId={creatingSceneId}
                      setCreatingSceneId={setCreatingSceneId}
                      timestamp={videoGenerationState.currentTimestamp}
                      onDeleteScene={handleDeleteScene}
                      displayIndex={index}
                      totalScenesCount={scenes.length}
                    />

                    {/* Add scene button after each scene (except the last one) */}
                    {index < scenes.length - 1 && (
                      <AddSceneButton
                        onAddScene={handleAddSceneCustom}
                        position={index + 1}
                        disabled={false}
                      />
                    )}
                  </div>
                );
              })}

              {/* Add scene button after last scene */}
              <AddSceneButton
                onAddScene={handleAddSceneCustom}
                position={scenes.length}
                isLast={true}
                disabled={false}
              />
            </>
          )}
    </div>
  );
}
