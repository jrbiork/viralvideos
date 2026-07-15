import { SQSRecord } from 'aws-lambda';
import { DeleteMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { getManifest } from '../utils/manifestUtils';
import { getImageSignedUrl } from '../utils/videoEffects';
import { animateSceneImage } from '../utils/runwayAnimate';
import { broadcastProgress } from '../utils/broadcastProgress';

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export interface AnimateSceneRequest {
  type?: 'animate-scene';
  userId: string;
  timestamp: string;
  sceneId: number;
  animationPrompt: string;
}

export async function processAnimateScene(
  request: AnimateSceneRequest,
  record?: SQSRecord,
): Promise<any> {
  const { userId, timestamp, sceneId, animationPrompt } = request;

  try {
    console.log('processAnimateScene:', JSON.stringify(request, null, 2));

    const manifest = await getManifest(userId, timestamp);
    const scene = manifest?.scenes.find((s) => s.id === sceneId);
    const imageKey = scene?.files.png || scene?.files.jpg;
    const imageUrl = imageKey ? await getImageSignedUrl(imageKey) : null;

    if (!imageUrl) {
      throw new Error('Scene has no generated image to animate');
    }

    const videoUrl = await animateSceneImage(
      imageUrl,
      animationPrompt,
      sceneId,
      userId,
      timestamp,
    );

    await broadcastProgress(
      'scene_animated',
      userId,
      timestamp,
      { sceneId, videoUrl, animationPrompt },
      'Scene animated',
    );

    console.log(`✅ Scene ${sceneId} animated:`, videoUrl);

    if (record && process.env.VIDEO_QUEUE_URL) {
      await sqs.send(
        new DeleteMessageCommand({
          QueueUrl: process.env.VIDEO_QUEUE_URL,
          ReceiptHandle: record.receiptHandle,
        }),
      );
    }

    return { message: 'Scene animated successfully' };
  } catch (error) {
    console.error(`❌ Error animating scene ${sceneId}:`, error);
    // The caller (index.ts) broadcasts the 'error' WS event and deletes the
    // SQS message uniformly for every request type — Runway calls aren't
    // idempotent, so we don't want this message retried either.
    throw error;
  }
}
