import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
  CREDITS_COST,
  hasSufficientCreditsByUserId,
  updateCreditBalanceByUserId,
} from '../utils/credits';

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

interface RequestBody {
  animationPrompt: string;
  animationDuration: '5s' | '10s' | number;
  sceneId: number;
  imageUrl: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  console.log('🎞️ Animate Image Lambda handler started');

  try {
    // Parse and validate request
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

    const { animationPrompt, animationDuration, sceneId, imageUrl } =
      JSON.parse(event.body) as RequestBody;

    if (!animationPrompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'animationPrompt is required' }),
      };
    }
    if (sceneId === undefined || sceneId === null) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'sceneId is required' }),
      };
    }
    if (!imageUrl) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'imageUrl is required' }),
      };
    }

    // Normalize duration to 5 or 10 seconds
    let duration: 5 | 10;
    if (animationDuration === '5s' || animationDuration === 5) {
      duration = 5;
    } else if (animationDuration === '10s' || animationDuration === 10) {
      duration = 10;
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'animationDuration must be 5s or 10s' }),
      };
    }

    // Check credits based on duration
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

    // Deduct credits before enqueueing
    const newCurrentCredits = await updateCreditBalanceByUserId(
      userId,
      creditsToCharge,
    );
    console.log('new credits after deduction:', newCurrentCredits);

    // Enqueue the animate-image request to SQS
    const queueUrl = process.env.VIDEO_QUEUE_URL;
    if (!queueUrl) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'VIDEO_QUEUE_URL not configured' }),
      };
    }

    const messageBody = JSON.stringify({
      type: 'animate-image',
      userId,
      timestamp,
      sceneId: Number(sceneId),
      animationPrompt,
      duration,
      imageUrl,
      step: 0,
    });

    const sendCommand = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: messageBody,
    });
    const sendResult = await sqs.send(sendCommand);
    console.log('📨 Enqueued animate-image request:', sendResult.MessageId);

    return {
      statusCode: 200,
      body: JSON.stringify({ messageId: sendResult.MessageId, queued: true }),
    };
  } catch (error) {
    console.error('❌ Error in animate-image:', error);
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
