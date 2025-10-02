import { SQSRecord } from 'aws-lambda';
import { combineVideoAndAudio } from './videoCombiner';
import { broadcastProgress } from '../utils/broadcastProgress';
import {
  getManifest,
  hydrateManifest,
  updateManifest,
} from '../utils/manifestUtils';
import { DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { SQSClient } from '@aws-sdk/client-sqs';
import { ManifestScene } from '../types/s3Types';

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export interface VideoCombineRequest {
  userId: string;
  timestamp: string;
  removedScenes?: number[];
}

export async function processVideoCombine(
  request: VideoCombineRequest,
  record?: SQSRecord,
): Promise<any> {
  try {
    const { userId, timestamp, removedScenes = [] } = request;

    if (!userId || !timestamp) {
      throw new Error('Missing userId or timestamp');
    }

    console.log(
      '🎬 Processing video combine with removed scenes:',
      removedScenes,
    );

    const manifest = await getManifest(userId, timestamp);
    if (!manifest) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Manifest not found' }),
      };
    }

    const { finalVideoSignedUrl, size } = await combineVideoAndAudio(
      userId,
      timestamp,
      manifest,
      removedScenes,
      null,
    );

    //
    await updateManifest(manifest, {
      videoGenerated: true,
      sceneCount: manifest.scenes.filter(
        (scene: ManifestScene) => !removedScenes.includes(scene.id),
      ).length,
      totalDuration: manifest.scenes
        .filter((scene: ManifestScene) => !removedScenes.includes(scene.id))
        .reduce(
          (acc: number, scene: ManifestScene) => acc + scene.files.duration,
          0,
        ),
      finalVideoUrl: `${userId}/${timestamp}-final-video.mp4`,
      scenes: manifest.scenes.map((scene: ManifestScene) => ({
        ...scene,
        removed: removedScenes.includes(scene.id),
      })),
      generatedAt: Date.now().toString(),
    });

    const hydratedManifest = await hydrateManifest(manifest);

    await broadcastProgress('video_completed', userId, timestamp, {
      manifest: {
        ...hydratedManifest,
        finalVideoUrl: finalVideoSignedUrl,
        size: size,
      },
    });
    console.log('✅ Video combined completed');

    // If this was triggered by SQS, delete the message from the queue
    if (record && process.env.VIDEO_QUEUE_URL) {
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: process.env.VIDEO_QUEUE_URL,
        ReceiptHandle: record.receiptHandle,
      });
      await sqs.send(deleteCommand);
    }

    console.log('🎬 Video combined completed', finalVideoSignedUrl);
  } catch (error) {
    console.error('Error in processVideoCombine:', error);
    throw Error('Video combine failed');
  }
}
