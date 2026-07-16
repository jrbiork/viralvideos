import { SQSRecord } from 'aws-lambda';
import { DeleteMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { generateNarration } from '../utils/audio';
import { generateSubtitles } from '../utils/subtitles';
import { generateVideoEffects } from '../utils/videoEffects';
import { ANIMATION_DURATION_SECONDS } from '../utils/runwayAnimate';
import { uploadImageToS3 } from '../utils/s3Uploader';
import { broadcastProgress } from '../utils/broadcastProgress';
import { getUser } from '../utils/user';
import { getMaxScenesForUser } from '../utils/quota';
import { Scene } from '../utils/script';
import {
  getManifest,
  updateManifest,
  createManifestScene,
  hydrateManifest,
} from '../utils/manifestUtils';
import { ManifestScene } from '../types/s3Types';

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export interface BatchEditRequest {
  type?: 'batch-edit';
  userId: string;
  timestamp: string;
  edits: {
    narrationEdits: {
      sceneId: number;
      scenePosition: number;
      narration: string;
    }[];
    imageEdits: { sceneId: number; generatedImageUrl: string }[];
    addedScenes: {
      sceneId: number;
      scenePosition: number;
      captionText: string;
      imageUrl: string;
    }[];
    removedSceneIds: number[];
    animationEdits?: {
      sceneId: number;
      animatedVideoUrl: string;
      animationPrompt: string;
    }[];
    sceneOrder?: number[] | null;
  };
}

/**
 * Processes all pending scene edits from the UI in a single pass:
 * one manifest read, one manifest write, one WebSocket broadcast.
 */
export async function processBatchEdit(
  request: BatchEditRequest,
  record?: SQSRecord,
): Promise<any> {
  const { userId, timestamp, edits } = request;
  const {
    narrationEdits,
    imageEdits: requestedImageEdits,
    addedScenes,
    removedSceneIds,
    animationEdits = [],
    sceneOrder,
  } = edits;

  try {
    console.log('processBatchEdit:', JSON.stringify(request, null, 2));

    const manifest = await getManifest(userId, timestamp);
    if (!manifest) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Manifest not found' }),
      };
    }

    const currentNonRemovedCount = manifest.scenes.filter(
      (s) => !s.removed,
    ).length;
    const resultingCount =
      currentNonRemovedCount - removedSceneIds.length + addedScenes.length;

    const maxScenes = await getMaxScenesForUser(userId);
    if (resultingCount > maxScenes) {
      const message = `This change would result in ${resultingCount} scenes, but the maximum is ${maxScenes}.`;
      console.error('processBatchEdit rejected:', message);

      await broadcastProgress('error', userId, timestamp, {}, message);

      if (record && process.env.VIDEO_QUEUE_URL) {
        await sqs.send(
          new DeleteMessageCommand({
            QueueUrl: process.env.VIDEO_QUEUE_URL,
            ReceiptHandle: record.receiptHandle,
          }),
        );
      }

      return { message: 'Batch edit rejected: scene limit exceeded' };
    }

    // Scenes that are (or are about to become) Runway-animated: their image
    // is locked (the animated clip is tied to that exact source image) and
    // their mp4 must never be touched by the Ken-Burns path again.
    const animatedSceneIds = new Set<number>([
      ...manifest.scenes.filter((s) => s.animated).map((s) => s.id),
      ...animationEdits.map((e) => e.sceneId),
    ]);

    const imageEdits = requestedImageEdits.filter((edit) => {
      if (animatedSceneIds.has(edit.sceneId)) {
        console.warn(
          `⚠️ Ignoring image edit for scene ${edit.sceneId}: scene is animated, image is locked`,
        );
        return false;
      }
      return true;
    });

    // 1) Persist replaced/new images to S3 (scene-{id}.png)
    const imageUploads = [
      ...imageEdits.map((edit) => ({
        sceneId: edit.sceneId,
        url: edit.generatedImageUrl,
      })),
      ...addedScenes.map((scene) => ({
        sceneId: scene.sceneId,
        url: scene.imageUrl,
      })),
    ];

    if (imageUploads.length > 0) {
      const uploadResults = await Promise.allSettled(
        imageUploads.map(({ sceneId, url }) =>
          uploadImageToS3(url, userId, timestamp, sceneId),
        ),
      );
      uploadResults.forEach((result, i) => {
        if (result.status === 'rejected') {
          console.error(
            `❌ Image upload failed for scene ${imageUploads[i].sceneId}:`,
            result.reason,
          );
        }
      });
    }

    // 2) Regenerate audio + subtitles for edited narrations and added scenes in one call
    const durationForScene = (sceneId: number) =>
      manifest.scenes.find((s) => s.id === sceneId)?.files.duration || 10;

    const audioScenes: Scene[] = [
      ...narrationEdits.map((edit) => ({
        id: edit.sceneId,
        scenePosition: edit.scenePosition,
        description: '',
        duration: durationForScene(edit.sceneId),
        narration: edit.narration,
        animated: animatedSceneIds.has(edit.sceneId),
        hardCapSeconds: animatedSceneIds.has(edit.sceneId)
          ? ANIMATION_DURATION_SECONDS
          : undefined,
      })),
      ...addedScenes.map((scene) => ({
        id: scene.sceneId,
        scenePosition: scene.scenePosition,
        description: '',
        duration: 10,
        narration: scene.captionText,
        animated: false,
      })),
    ];

    if (audioScenes.length > 0) {
      const { subtitles } = await generateNarration(
        audioScenes,
        userId,
        timestamp,
        manifest.voiceToneInstruction,
        manifest.voice,
        manifest.language,
      );

      audioScenes.forEach((scene, i) => {
        scene.duration = subtitles[i].duration || 10;
      });

      await generateSubtitles(audioScenes, userId, timestamp, subtitles);
    }

    // 3) Apply all changes to the manifest in memory
    const editedSceneIds = new Set(narrationEdits.map((e) => e.sceneId));
    const updatedScenes: ManifestScene[] = manifest.scenes.map((scene) => {
      const narrationEdit = editedSceneIds.has(scene.id)
        ? audioScenes.find((edited) => edited.id === scene.id)
        : undefined;
      const animationEdit = animationEdits.find((e) => e.sceneId === scene.id);
      const isAnimated = animatedSceneIds.has(scene.id);
      return {
        ...scene,
        removed: removedSceneIds.includes(scene.id) || scene.removed || false,
        animated: isAnimated,
        animationPrompt: animationEdit?.animationPrompt ?? scene.animationPrompt,
        files: {
          ...scene.files,
          // Animated scenes are a fixed-length Runway clip — always pin
          // duration to that, regardless of what narration produced.
          duration: isAnimated
            ? ANIMATION_DURATION_SECONDS
            : narrationEdit?.duration ?? scene.files.duration,
        },
      };
    });

    // Apply any drag-and-drop reorder before inserting added scenes, so the
    // splice/bump logic below operates on final desired order. Ids not
    // present in sceneOrder (shouldn't happen in practice) keep their
    // existing relative order at the end.
    if (sceneOrder && sceneOrder.length > 0) {
      const orderIndex = new Map(sceneOrder.map((id, i) => [id, i]));
      const known = updatedScenes
        .filter((s) => orderIndex.has(s.id))
        .sort((a, b) => orderIndex.get(a.id)! - orderIndex.get(b.id)!);
      const unknown = updatedScenes.filter((s) => !orderIndex.has(s.id));
      updatedScenes.length = 0;
      updatedScenes.push(...known, ...unknown);
      updatedScenes.forEach((s, i) => {
        s.scenePosition = i;
      });
    }

    // Insert added scenes at their positions (mirrors addSceneToManifest)
    const addedByPosition = [...addedScenes].sort(
      (a, b) => a.scenePosition - b.scenePosition,
    );
    for (const added of addedByPosition) {
      const audioScene = audioScenes.find((s) => s.id === added.sceneId);
      const manifestScene = createManifestScene(
        {
          id: added.sceneId,
          scenePosition: added.scenePosition,
          description: '',
          duration: audioScene?.duration || 10,
          narration: added.captionText,
          animated: false,
        },
        userId,
        timestamp,
        added.scenePosition,
      );
      updatedScenes.splice(added.scenePosition, 0, manifestScene);
      for (let i = added.scenePosition + 1; i < updatedScenes.length; i++) {
        updatedScenes[i].scenePosition++;
      }
    }

    // 4) Regenerate video effects for every scene whose image or duration changed
    const affectedSceneIds = new Set<number>([
      ...narrationEdits.map((e) => e.sceneId),
      ...imageEdits.map((e) => e.sceneId),
      ...addedScenes.map((s) => s.sceneId),
    ]);

    if (affectedSceneIds.size > 0) {
      const user = await getUser(userId);
      const effectScenes = updatedScenes
        .filter(
          (scene) =>
            affectedSceneIds.has(scene.id) &&
            !scene.removed &&
            !scene.animated, // animated scenes keep their Runway clip forever
        )
        .map((scene) => ({
          id: scene.id,
          scenePosition: scene.scenePosition,
          duration: scene.files.duration,
          animated: false,
        }));
      if (effectScenes.length > 0) {
        await generateVideoEffects(effectScenes, userId, timestamp, user);
      }
    }

    // 5) Single manifest write + single broadcast
    const totalDuration = updatedScenes
      .filter((scene) => !scene.removed)
      .reduce((acc, scene) => acc + scene.files.duration, 0);

    const updatedManifest = await updateManifest(manifest, {
      scenes: updatedScenes,
      sceneCount: updatedScenes.length,
      totalDuration,
    });

    const manifestHydrated = await hydrateManifest(updatedManifest);

    await broadcastProgress(
      'preview_completed',
      userId,
      timestamp,
      { manifest: manifestHydrated },
      'Scene changes applied',
    );

    // If this was triggered by SQS, delete the message from the queue
    if (record && process.env.VIDEO_QUEUE_URL) {
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: process.env.VIDEO_QUEUE_URL,
        ReceiptHandle: record.receiptHandle,
      });
      await sqs.send(deleteCommand);
    }

    return { message: 'Batch edit applied successfully' };
  } catch (error) {
    console.error('Error in batch edit (SQS):', error);
    throw Error('Batch edit failed');
  }
}
