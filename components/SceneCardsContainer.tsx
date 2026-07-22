import React from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import EditScene, { Scene } from './EditScene';
import EditSceneSkeleton from './EditSceneSkeleton';
import AddSceneButton from './AddSceneButton';
import { AnimationQuota } from './useUserQuota';
import { Manifest } from '@/app/types/manifest';

// Wraps a single scene card so it can be dragged to reorder (desktop only —
// the handle is hidden below the `md` breakpoint via CSS, so mobile is
// unaffected since only the handle carries drag listeners).
function SortableSceneCard({
  id,
  disabled,
  children,
}: {
  id: number;
  disabled?: boolean;
  children: (args: { dragHandle: React.ReactNode }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  };

  const dragHandle = (
    <button
      type="button"
      className="hidden md:flex items-center justify-center text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing touch-none"
      aria-label="Drag to reorder scene"
      {...attributes}
      {...listeners}
    >
      <GripVertical size={18} />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragHandle })}
    </div>
  );
}

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
  onQueueAnimationEdit?: (
    sceneId: number,
    animatedVideoUrl: string,
    animationPrompt: string,
  ) => Promise<void>;
  animationQuota?: AnimationQuota;
  maxScenes: number;
  animatingSceneId?: number | null;
  animationResults?: Record<number, { videoUrl: string; prompt: string }>;
  onStartAnimation?: (sceneId: number) => void;
  pendingAnimationEdits?: {
    sceneId: number;
    animatedVideoUrl: string;
    animationPrompt: string;
  }[];
  onReorderScene?: (activeId: number, overId: number) => void;
  isApplyingEdits?: boolean;
}

// Shown while audio/subtitles are generating for the first time — reassures
// the user they don't need to stay on this screen, since the finished video
// also shows up in Videos.
const GENERATING_SCENES_MESSAGE =
  "Scenes ready in a minute — we'll notify you, or find them in Videos.";

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
  onQueueAnimationEdit,
  animationQuota,
  maxScenes,
  animatingSceneId,
  animationResults,
  onStartAnimation,
  pendingAnimationEdits,
  onReorderScene,
  isApplyingEdits = false,
}: SceneCardsContainerProps) {
  const nonRemovedTotal = scenes.filter((s: any) => !s.removed).length;
  const atSceneLimit = nonRemovedTotal >= maxScenes;
  const addSceneDisabled =
    atSceneLimit || deletingSceneId !== null || isApplyingEdits;
  const addSceneDisabledReason = isApplyingEdits
    ? 'Cannot add a scene while changes are being applied'
    : atSceneLimit
    ? `Maximum ${maxScenes} scenes allowed`
    : 'Cannot add a scene while a scene is being deleted';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (isApplyingEdits) return;
    if (!over || active.id === over.id || !onReorderScene) return;
    onReorderScene(Number(active.id), Number(over.id));
  };

  return (
    <div className="space-y-4 mb-6 h-full overflow-y-auto pr-2 px-4 custom-scrollbar">
      {/* Scene Cards */}
      {videoGenerationState.isLoadingAudioSubtitles
        ? // Show skeleton placeholders while loading audio/subtitles
          <>
            <div
              className="text-center text-[11px] font-medium text-white rounded-lg px-2.5 py-1"
              style={{
                background: 'linear-gradient(90deg, #7552F2 0%, #2CA4F2 100%)',
              }}
            >
              {GENERATING_SCENES_MESSAGE}
            </div>
            {Array.from({ length: 3 }).map((_, index) => (
              <EditSceneSkeleton key={index} />
            ))}
          </>
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
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={scenes.map((s: any) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {scenes.map((scene: any, index: number) => {
                // Get the image URL for this scene (only for original scenes)
                // Use the hydrated image URLs directly from the manifest
                let imageUrl = undefined;
                let manifestScene: any = undefined;
                if (
                  !scene.isUserAdded &&
                  videoGenerationState.manifest?.scenes
                ) {
                  // Find the manifest scene by matching the scene ID
                  // Extract the scene ID from the manifest file names to match with scene.id
                  manifestScene = videoGenerationState.manifest.scenes.find(
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

                // A "Use this animation" click is only queued client-side
                // until "Apply changes" persists it to the manifest — check
                // that queue first so the thumbnail updates immediately
                // instead of waiting on an apply round-trip.
                const pendingAnimation = pendingAnimationEdits?.find(
                  (edit) => edit.sceneId === scene.id,
                );

                const isAnimated = Boolean(
                  pendingAnimation || manifestScene?.animated,
                );

                // For animated scenes, the thumbnail should show the actual
                // Runway clip (not just the static source image) so the card
                // visually reflects the animation.
                const sceneVideoUrl = isAnimated
                  ? pendingAnimation?.animatedVideoUrl ||
                    manifestScene?.files?.mp4
                  : undefined;

                return (
                  <SortableSceneCard
                    key={scene.id}
                    id={scene.id}
                    disabled={isApplyingEdits}
                  >
                    {({ dragHandle }) => (
                      <>
                    <EditScene
                      dragHandle={dragHandle}
                      scene={{
                        ...scene,
                        animated: isAnimated,
                        animationPrompt:
                          pendingAnimation?.animationPrompt ||
                          manifestScene?.animationPrompt,
                      }}
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
                      sceneVideoUrl={sceneVideoUrl}
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
                      isApplying={isApplyingEdits}
                      showToasterMessage={showToasterMessage}
                      onQueueImageEdit={onQueueImageEdit}
                      onQueueAddedScene={onQueueAddedScene}
                      onQueueAnimationEdit={onQueueAnimationEdit}
                      animationQuota={animationQuota}
                      maxScenes={maxScenes}
                      isAnimating={animatingSceneId === scene.id}
                      animationResult={animationResults?.[scene.id]}
                      onStartAnimation={onStartAnimation}
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
                      </>
                    )}
                  </SortableSceneCard>
                );
                  })}
                </SortableContext>
              </DndContext>

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
