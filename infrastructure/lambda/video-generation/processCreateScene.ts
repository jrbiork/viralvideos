import { SQSRecord } from 'aws-lambda';
import { generateNarration } from '../utils/audio';
import {
  getManifest,
  hydrateManifest,
  addSceneToManifest,
  createManifestScene,
} from '../utils/manifestUtils';

import { generateSubtitles } from '../utils/subtitles';
import { generateVideoEffects } from '../utils/videoEffects';
import { broadcastProgress } from '../utils/broadcastProgress';
import { getUser } from '../utils/user';
import { DeleteMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export interface CreateSceneRequest {
  imageUrl: string;
  sceneId: number;
  scenePosition?: number;
  userId: string;
  timestamp: string;
  captionText: string;
}

export async function processCreateScene(
  request: CreateSceneRequest,
  record?: SQSRecord,
) {
  const { sceneId, scenePosition, captionText, userId, timestamp } = request;

  try {
    console.log('request:', JSON.stringify(request, null, 2));

    const scenes = [
      {
        id: sceneId,
        scenePosition: scenePosition || 0,
        description: '',
        duration: 10,
        narration: captionText,
        animated: false,
      },
    ];

    const manifest = await getManifest(userId, timestamp);
    if (!manifest) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Manifest not found' }),
      };
    }

    // generate audio and transcription
    const { subtitles } = await generateNarration(
      scenes,
      request.userId,
      timestamp,
      manifest.voiceToneInstruction,
      manifest.voice,
      manifest.language,
    );

    console.log('subtitles:', subtitles);

    // update scenes duration
    scenes[0].duration = subtitles[0].duration || 10;
    console.log('subtitles[0].duration:', subtitles[0].duration);

    // Step 4: Generate subtitle file
    await generateSubtitles(scenes, request.userId, timestamp, subtitles);

    const user = await getUser(request.userId);

    // generate video effect
    await generateVideoEffects(scenes, request.userId, timestamp, user);

    const manifestScene = createManifestScene(
      scenes[0],
      request.userId,
      timestamp,
      scenePosition || 0,
    );

    // update manifest
    const updatedManifest = await addSceneToManifest(manifest, manifestScene);

    // hydrate manifest
    const manifestHydrated = await hydrateManifest(updatedManifest);

    await broadcastProgress('preview_completed', request.userId, timestamp, {
      manifest: manifestHydrated,
    });

    // If this was triggered by SQS, delete the message from the queue
    if (record && process.env.VIDEO_QUEUE_URL) {
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: process.env.VIDEO_QUEUE_URL,
        ReceiptHandle: record.receiptHandle,
      });
      await sqs.send(deleteCommand);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Scene created successfully',
      }),
    };
  } catch (error) {
    console.error('Error in create scene (SQS):', error);

    throw Error('Scene creation failed');
  }
}
