import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

// Import constants - using relative path from Lambda location
const DEFAULT_VOICE = 'ash';
const DEFAULT_LANGUAGE = 'en';

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

interface VideoGenerationRequest {
  prompt: string;
  userId: string;
  voice?: string;
  language?: string;
  timestamp: string;
  totalDuration: number;
  sceneCount: number;
  imageTemplate?: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    let request: VideoGenerationRequest;

    // Handle different event formats
    if (event.body) {
      // API Gateway format - body is a JSON string
      if (typeof event.body === 'string') {
        request = JSON.parse(event.body);
      } else {
        // Direct Lambda invocation - body is already an object
        request = event.body as VideoGenerationRequest;
      }
    } else {
      // Direct Lambda invocation - payload is the entire event
      request = event as any;
    }

    if (!request.prompt) {
      console.log('❌ Error: Prompt is required');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Prompt is required' }),
      };
    }

    // Extract user information from JWT authorizer context or request body
    const userId =
      event.requestContext?.authorizer?.userId || request.userId || 'demo-user';

    if (!process.env.VIDEO_QUEUE_URL) {
      console.log('❌ Error: VIDEO_QUEUE_URL is not set');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Queue URL not configured' }),
      };
    }

    // Prepare message for SQS
    const messageBody = {
      type: 'generate-video' as const,
      prompt: request.prompt,
      userId: userId || request.userId || 'demo-user',
      voice: request.voice || DEFAULT_VOICE,
      language: request.language || DEFAULT_LANGUAGE,
      timestamp: request.timestamp || new Date().toISOString(),
      totalDuration: request.totalDuration || 30,
      sceneCount: request.sceneCount || 3,
      step: 1,
      imageTemplate: request.imageTemplate,
    };

    console.log('🎤 Video Queue - Request voice:', request.voice);
    console.log('🌍 Video Queue - Request language:', request.language);
    console.log('🎤 Video Queue - MessageBody voice:', messageBody.voice);
    console.log('🌍 Video Queue - MessageBody language:', messageBody.language);
    console.log(
      '🖼️ Video Queue - Request imageTemplate:',
      request.imageTemplate,
    );
    console.log(
      '🖼️ Video Queue - MessageBody imageTemplate:',
      messageBody.imageTemplate,
    );
    console.log('🚀 Video Queue - Full messageBody:', messageBody);

    // Send message to SQS
    const sendMessageCommand = new SendMessageCommand({
      QueueUrl: process.env.VIDEO_QUEUE_URL,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: {
        RequestType: {
          DataType: 'String',
          StringValue: 'VideoGeneration',
        },
        UserId: {
          DataType: 'String',
          StringValue: messageBody.userId,
        },
      },
    });

    const sqsResponse = await sqs.send(sendMessageCommand);

    return {
      statusCode: 200,
      body: JSON.stringify({
        messageId: sqsResponse.MessageId,
        message: 'Video generation request queued successfully',
        status: 'queued',
      }),
    };
  } catch (error) {
    console.error('💥 Error in queue manager:', error);
    console.error(
      'Error stack:',
      error instanceof Error ? error.stack : 'No stack trace',
    );
    console.error(
      'Error message:',
      error instanceof Error ? error.message : 'Unknown error',
    );

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to queue video generation request',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
