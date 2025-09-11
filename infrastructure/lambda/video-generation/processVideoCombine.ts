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

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export interface VideoCombineRequest {
  userId: string;
  timestamp: string;
}

export async function processVideoCombine(
  request: VideoCombineRequest,
  record?: SQSRecord,
): Promise<any> {
  try {
    const { userId, timestamp } = request;

    if (!userId || !timestamp) {
      throw new Error('Missing userId or timestamp');
    }

    const manifest = await getManifest(userId, timestamp);
    if (!manifest) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Manifest not found' }),
      };
    }

    const finalVideoUrl = await combineVideoAndAudio(
      userId,
      timestamp,
      manifest,
    );

    await updateManifest(manifest, { videoGenerated: true });

    const hydratedManifest = await hydrateManifest(manifest);

    await broadcastProgress('video_completed', userId, timestamp, {
      manifest: hydratedManifest,
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

    console.log('🎬 Video combined completed', finalVideoUrl);
  } catch (error) {
    console.error('Error in processVideoCombine:', error);
    throw error;
  }
}
