import React from 'react';
import EditScene, { Scene } from './EditScene';
import EditSceneSkeleton from './EditSceneSkeleton';
import AddSceneButton from './AddSceneButton';
import { MAX_SCENES } from './useUserQuota';
import { Manifest } from '@/app/types/manifest';

interface SceneCardsContainerProps {
  videoGenerationState: {
    isLoadingVideoScenes: boolean;
    isLoadingAudioSubtitles: boolean;
    currentTimestamp: string;
    manifest?: Manifest;
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
    narration: string,
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
  additionalScenes: { scene: Scene; position: number }[];
  setAdditionalScenes: React.Dispatch<
    React.SetStateAction<{ scene: Scene; position: number }[]>
  >;
  handleDeleteScene: (sceneId: number) => void;
  handleDeleteUserAddedScene: (sceneId: number) => void;
  deletingSceneId: number | null;
  removedOriginalScenes: Set<number>;
  onRestoreOriginalScene?: (sceneId: number) => void;
  showToasterMessage?: (
    message: string,
    type: 'success' | 'error' | 'info',
  ) => void;
  onQueueImageEdit?: (sceneId: number, generatedImageUrl: string) => void;
  onQueueAddedScene?: (
    sceneId: number,
    scenePosition: number,
    captionText: string,
    imageUrl: string,
  ) => void;
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
  handleDeleteUserAddedScene,
  deletingSceneId,
  removedOriginalScenes,
  onRestoreOriginalScene,
  showToasterMessage,
  onQueueImageEdit,
  onQueueAddedScene,
}: SceneCardsContainerProps) {
  const nonRemovedTotal = scenes.filter((s: any) => !s.removed).length;
  const atSceneLimit = nonRemovedTotal >= MAX_SCENES;
  const addSceneDisabled = atSceneLimit || deletingSceneId !== null;
  const addSceneDisabledReason = atSceneLimit
    ? `Maximum ${MAX_SCENES} scenes allowed`
    : 'Cannot add a scene while a scene is being deleted';

  return (
    <div className="space-y-4 mb-6 h-full overflow-y-auto pr-2 px-4 custom-scrollbar">
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
                disabled={addSceneDisabled}
                disabledReason={addSceneDisabledReason}
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
                  // Find the manifest scene by matching the scene ID
                  // Extract the scene ID from the manifest file names to match with scene.id
                  const manifestScene =
                    videoGenerationState.manifest.scenes.find(
                      (manifestScene) => {
                        // Extract the scene ID from the manifest file names
                        const manifestSceneId = manifestScene.files?.mp3
                          ? parseInt(
                              manifestScene.files.mp3.match(
                                /scene-(\d+)\./,
                              )?.[1] || manifestScene.scenePosition.toString(),
                            )
                          : manifestScene.scenePosition;

                        return manifestSceneId === scene.id;
                      },
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
                      isLoadingVideoScenes={
                        videoGenerationState.isLoadingVideoScenes
                      }
                      setIsLoadingVideoScenes={(value: boolean) =>
                        setVideoGenerationState((prev: any) => ({
                          ...prev,
                          isLoadingVideoScenes: value,
                        }))
                      }
                      onSaveEdit={(sceneId, narration) =>
                        handleSaveEdit(
                          sceneId,
                          narration ?? sceneState.editedNarration,
                          scenes,
                          (updatedScenes) => {
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
                                        narration:
                                          narration ??
                                          sceneState.editedNarration,
                                      },
                                    }
                                  : item,
                              ),
                            );
                          },
                        )
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
                      onDeleteUserAddedScene={handleDeleteUserAddedScene}
                      onRestoreOriginalScene={onRestoreOriginalScene}
                      displayIndex={index}
                      totalScenesCount={nonRemovedTotal}
                      isDisabled={
                        deletingSceneId === scene.id && !scene.isUserAdded
                      }
                      showToasterMessage={showToasterMessage}
                      onQueueImageEdit={onQueueImageEdit}
                      onQueueAddedScene={onQueueAddedScene}
                    />

                    {/* Add scene button after each scene (except the last one) */}
                    {index < scenes.length - 1 && (
                      <AddSceneButton
                        onAddScene={handleAddSceneCustom}
                        position={index + 1}
                        disabled={addSceneDisabled}
                        disabledReason={addSceneDisabledReason}
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
                disabled={addSceneDisabled}
                disabledReason={addSceneDisabledReason}
              />
            </>
          )}
    </div>
  );
}
