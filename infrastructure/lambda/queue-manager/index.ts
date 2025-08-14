import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

interface VideoGenerationRequest {
  prompt: string;
  userId: string;
  userEmail?: string;
  timestamp: string;
  totalDuration: number;
  sceneCount: number;
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
    const userEmail =
      event.requestContext?.authorizer?.email || request.userEmail || '';

    if (!process.env.VIDEO_QUEUE_URL) {
      console.log('❌ Error: VIDEO_QUEUE_URL is not set');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Queue URL not configured' }),
      };
    }

    // Prepare message for SQS
    const messageBody = {
      prompt: request.prompt,
      userId: userId || request.userId || 'demo-user',
      timestamp: request.timestamp || new Date().toISOString(),
      totalDuration: request.totalDuration || 30,
      sceneCount: request.sceneCount || 3,
    };

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
