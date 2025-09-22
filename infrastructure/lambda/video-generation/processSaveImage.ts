import { SQSRecord } from 'aws-lambda';
import { SQSClient, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { getManifest, hydrateManifest } from '../utils/manifestUtils';
import { uploadImageToS3 } from '../utils/s3Uploader';
import { generateVideoEffects } from '../utils/videoEffects';
import { broadcastProgress } from '../utils/broadcastProgress';
import { getUser } from '../utils/user';

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export interface SaveImageRequest {
  type?: 'save-image';
  userId: string;
  timestamp: string;
  sceneId: number;
  generatedImageUrl: string;
  duration?: number;
  inMemoryEditScene?: boolean;
}

export async function processSaveImage(
  request: SaveImageRequest,
  record?: SQSRecord,
): Promise<any> {
  try {
    if (!request.userId || !request.timestamp) {
      throw new Error('Missing userId or timestamp');
    }
    if (request.sceneId === undefined || request.sceneId === null) {
      throw new Error('Missing sceneId');
    }
    if (!request.generatedImageUrl) {
      throw new Error('Missing generatedImageUrl');
    }
    if (!request.duration) {
      throw new Error('Missing duration');
    }

    const { userId, timestamp, sceneId, generatedImageUrl, duration } = request;

    // Form the imageKey
    const imageKey = `${userId}/${timestamp}.scene-${sceneId}.png`;
    console.log(`🔑 Formed image key: ${imageKey}`);

    await uploadImageToS3(generatedImageUrl, userId, timestamp, sceneId);
    console.log(`✅ Image uploaded successfully`);

    // when its a in memory edit scene
    if (request.inMemoryEditScene) {
      console.log('🔑 In memory edit scene, skipping video effects generation');
      return { message: 'Image saved successfully' };
    }

    const manifest = await getManifest(userId, timestamp);
    if (!manifest) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Manifest not found' }),
      };
    }

    const user = await getUser(userId);

    let hydratedManifest = await hydrateManifest(manifest);

    broadcastProgress('image_created', userId, timestamp, {
      manifest: hydratedManifest,
    });

    await generateVideoEffects(
      [{ id: sceneId, duration }],
      userId,
      timestamp,
      user,
    );

    hydratedManifest = await hydrateManifest(manifest);

    broadcastProgress('preview_completed', userId, timestamp, {
      manifest: hydratedManifest,
    });
    console.log('✅ Image saved via SQS for scene:', request.sceneId);

    // If this was triggered by SQS, delete the message from the queue
    if (record && process.env.VIDEO_QUEUE_URL) {
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: process.env.VIDEO_QUEUE_URL,
        ReceiptHandle: record.receiptHandle,
      });
      await sqs.send(deleteCommand);
    }

    return { message: 'Image saved successfully' };
  } catch (error) {
    console.error('Error in save image (SQS):', error);
    throw error;
  }
}
