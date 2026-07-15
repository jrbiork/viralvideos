import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

import { getManifest } from '../utils/manifestUtils';
import { checkAndConsumeAnimationQuota } from '../utils/quota';

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

interface RequestBody {
  sceneId: number;
  animationPrompt: string;
}

/**
 * Scene animation via Runway routinely takes longer than API Gateway's hard
 * 29s integration timeout, so this handler only validates the request and
 * quota, then enqueues the actual work to the video-generation SQS queue
 * (processAnimateScene). The frontend is notified of completion via the
 * existing WebSocket broadcast channel ('scene_animated' / 'error'), the
 * same pattern already used for video generation and batch edits.
 */
export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  console.log('🎬 Animate Scene Lambda handler started');

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    // get userId from the authorizer context
    const userId = (event.requestContext as any).authorizer?.principalId;
    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    // Mock generation renders a real clip via ffmpeg but doesn't call
    // Runway, so it shouldn't burn the user's real animation quota.
    const isMockGeneration = process.env.MOCK_IMAGE_GENERATION === 'true';

    const { allowed, used, limit, plan } = isMockGeneration
      ? { allowed: true, used: 0, limit: 0, plan: 'pro' as const }
      : await checkAndConsumeAnimationQuota(userId);
    if (!allowed) {
      console.log(
        `❌ Animation quota exceeded for user ${userId}: ${used}/${limit} (${plan})`,
      );
      return {
        statusCode: 403,
        body: JSON.stringify({
          error:
            plan === 'free'
              ? `Animating scenes is a Creator/Pro feature. Upgrade for scene animations every month.`
              : `You've reached this month's limit of ${limit} scene animations. Your limit resets next month.`,
          animationQuota: { used, limit, plan },
        }),
      };
    }

    // get timestamp from query string
    const timestamp = event.queryStringParameters?.['timestamp'];
    if (!timestamp) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Timestamp is required' }),
      };
    }

    const { sceneId, animationPrompt } = JSON.parse(
      event.body,
    ) as RequestBody;
    if (sceneId === undefined || sceneId === null) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'sceneId is required' }),
      };
    }
    if (!animationPrompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'animationPrompt is required' }),
      };
    }

    const manifest = await getManifest(userId, timestamp);
    if (!manifest) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Manifest not found' }),
      };
    }

    const scene = manifest.scenes.find((s) => s.id === sceneId);
    if (!scene) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Scene not found' }),
      };
    }

    if (!scene.files.png && !scene.files.jpg) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Scene has no generated image to animate',
        }),
      };
    }

    if (!process.env.VIDEO_QUEUE_URL) {
      console.error('❌ VIDEO_QUEUE_URL is not set');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Queue URL not configured' }),
      };
    }

    await sqs.send(
      new SendMessageCommand({
        QueueUrl: process.env.VIDEO_QUEUE_URL,
        MessageBody: JSON.stringify({
          type: 'animate-scene',
          userId,
          timestamp,
          sceneId,
          animationPrompt,
        }),
      }),
    );

    console.log(`🎬 Queued scene ${sceneId} for animation`);

    return {
      statusCode: 200,
      body: JSON.stringify({ status: 'queued' }),
    };
  } catch (error) {
    console.error('❌ Error in scene animation:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message:
          error instanceof Error ? error.message : 'Unknown error occurred',
      }),
    };
  }
};
