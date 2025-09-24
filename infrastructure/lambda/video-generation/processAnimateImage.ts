import { SQSRecord } from 'aws-lambda';
import { SQSClient, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import {
  getManifest,
  hydrateManifest,
  updateManifest,
} from '../utils/manifestUtils';
import { animateImageToVideo } from '../utils/video';
import { broadcastProgress } from '../utils/broadcastProgress';
import {
  CREDITS_COST,
  hasSufficientCreditsByUserId,
  updateCreditBalanceByUserId,
} from '../utils/credits';

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export interface AnimateImageRequest {
  type?: 'animate-image';
  userId: string;
  timestamp: string;
  sceneId: number;
  animationPrompt: string;
  imageUrl: string;
  duration: 5 | 10;
}

export async function processAnimateImage(
  request: AnimateImageRequest,
  record?: SQSRecord,
): Promise<any> {
  try {
    const { userId, timestamp, sceneId, animationPrompt, imageUrl, duration } =
      request;

    if (!userId || !timestamp) {
      throw new Error('Missing userId or timestamp');
    }
    if (sceneId === undefined || sceneId === null) {
      throw new Error('Missing sceneId');
    }
    if (!animationPrompt) {
      throw new Error('Missing animationPrompt');
    }
    if (!imageUrl) {
      throw new Error('Missing imageUrl');
    }
    if (!duration) {
      throw new Error('Missing duration');
    }

    const creditsToCharge =
      duration === 5 ? CREDITS_COST.ai_video_5s : CREDITS_COST.ai_video_10s;

    const { hasSufficientCredits, currentCredits } =
      await hasSufficientCreditsByUserId(userId, creditsToCharge);

    console.log(
      'hasCredits / current credits:',
      hasSufficientCredits,
      currentCredits,
    );

    if (!hasSufficientCredits) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Insufficient credits' }),
      };
    }

    const manifest = await getManifest(userId, timestamp);
    if (!manifest) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Manifest not found' }),
      };
    }

    const seed = Math.floor(Math.random() * 10000);

    // Generate video from the provided image
    const videoKey = await animateImageToVideo(
      animationPrompt,
      duration,
      sceneId,
      userId,
      timestamp,
      seed,
      imageUrl,
    );
    console.log(`✅ Animated video created for scene ${sceneId}: ${videoKey}`);

    // Build the updated array once
    const updatedScenes = manifest.scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, duration, animated: true } : scene,
    );

    // Reuse it for both in-memory state and persistence
    manifest.scenes = updatedScenes;

    await updateManifest(manifest, {
      scenes: updatedScenes,
    });

    // Deduct credits
    const newCurrentCredits = await updateCreditBalanceByUserId(
      userId,
      creditsToCharge,
    );

    console.log('new credits after deduction:', newCurrentCredits);

    let hydratedManifest = await hydrateManifest(manifest);

    // Broadcast that the scene video is created
    await broadcastProgress(
      'preview_completed',
      userId,
      timestamp,
      { manifest: hydratedManifest },
      'Scene animation completed',
    );

    // If this was triggered by SQS, delete the message from the queue
    if (record && process.env.VIDEO_QUEUE_URL) {
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: process.env.VIDEO_QUEUE_URL,
        ReceiptHandle: record.receiptHandle,
      });
      await sqs.send(deleteCommand);
    }

    return { message: 'Scene animated successfully', videoKey };
  } catch (error) {
    console.error('Error in animate image (SQS):', error);
    throw error;
  }
}
