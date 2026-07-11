import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { generateNanoBananaImage } from '../utils/imageNanoBanana';

import { getManifest } from '../utils/manifestUtils';
import {
  checkAndConsumeImageGenQuota,
  PRO_IMAGE_GEN_MONTHLY_LIMIT,
} from '../utils/quota';

interface RequestBody {
  imagePrompt: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  console.log('🎨 Image Generation Lambda handler started');

  try {
    // Parse request body
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

    // Mock generation just copies an existing S3 image (no Gemini cost), so
    // it shouldn't burn the user's real image quota.
    const isMockGeneration = process.env.MOCK_IMAGE_GENERATION === 'true';

    const { allowed, used, limit, plan } = isMockGeneration
      ? { allowed: true, used: 0, limit: 0, plan: 'free' as const }
      : await checkAndConsumeImageGenQuota(userId);
    if (!allowed) {
      console.log(
        `❌ Image quota exceeded for user ${userId}: ${used}/${limit} (${plan})`,
      );
      return {
        statusCode: 403,
        body: JSON.stringify({
          error:
            plan === 'free'
              ? `You've used all ${limit} additional image generations included with your free plan. Upgrade to Pro for ${PRO_IMAGE_GEN_MONTHLY_LIMIT} image generations per month.`
              : `You've reached this month's limit of ${limit} image generations. Your limit resets next month.`,
          imageQuota: { used, limit, plan },
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

    // get scene object from body
    const { imagePrompt } = JSON.parse(event.body) as RequestBody;
    if (!imagePrompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Image prompt is required',
        }),
      };
    }

    // get last 4 digits of timestamp
    const seed = Math.floor(Math.random() * 10000);
    const sceneId = Date.now();

    const manifest = await getManifest(userId, timestamp);
    if (!manifest) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Manifest not found' }),
      };
    }

    const prompt = manifest.template + ': ' + imagePrompt;

    const imageUrl = await generateNanoBananaImage(
      prompt,
      sceneId,
      userId,
      timestamp,
      seed,
      true,
    );

    console.log('🎨 Image generated successfully:', imageUrl);

    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        imageUrl,
      }),
    };
  } catch (error) {
    console.error('❌ Error in image generation:', error);

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
