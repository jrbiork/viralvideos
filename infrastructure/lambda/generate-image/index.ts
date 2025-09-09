import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { generateNanoBananaImage } from '../utils/imageNanoBanana';

import { CREDITS_COST } from '../utils/credits';

import {
  hasSufficientCreditsByUserId,
  updateCreditBalanceByUserId,
} from '../utils/credits';

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

    // Check if user has sufficient credits
    const { hasSufficientCredits, currentCredits } =
      await hasSufficientCreditsByUserId(userId, CREDITS_COST.new_image);

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

    // get last 4 digits of timestamp

    const seed = Math.floor(Math.random() * 10000);
    const sceneId = Date.now();

    const imageUrl = await generateNanoBananaImage(
      imagePrompt,
      sceneId,
      userId,
      timestamp,
      seed,
      true,
    );

    console.log('🎨 Image generated successfully:', imageUrl);

    // Deduct credits
    const newCurrentCredits = await updateCreditBalanceByUserId(
      userId,
      CREDITS_COST.new_image,
    );

    console.log('new credits after deduction:', newCurrentCredits);

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
