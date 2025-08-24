import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

interface DeleteVideoRequest {
  timestamp: string;
  userId: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    let request: DeleteVideoRequest;

    // Handle different event formats
    if (event.body) {
      // API Gateway format - body is a JSON string
      if (typeof event.body === 'string') {
        request = JSON.parse(event.body);
      } else {
        // Direct Lambda invocation - body is already an object
        request = event.body as DeleteVideoRequest;
      }
    } else {
      // Direct Lambda invocation - payload is the entire event
      request = event as any;
    }

    // Extract user information from JWT authorizer context or request
    const userId =
      event.requestContext?.authorizer?.userId ||
      request.userId ||
      event.queryStringParameters?.userId ||
      'demo-user';

    // Extract timestamp from query parameters or request body
    const timestamp =
      event.queryStringParameters?.timestamp ||
      request.timestamp ||
      event.pathParameters?.timestamp;

    if (!timestamp) {
      console.log('❌ Error: timestamp is required');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'timestamp is required' }),
      };
    }

    console.log('🗑️ Deleting video for user:', userId, 'timestamp:', timestamp);

    if (!process.env.VIDEO_BUCKET_NAME) {
      console.log('❌ Error: VIDEO_BUCKET_NAME is not set');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'S3 bucket name not configured' }),
      };
    }

    // Construct the video key based on the timestamp
    const videoKey = `${userId}/${timestamp}-final-video.mp4`;

    console.log('🗑️ Deleting video with key:', videoKey);

    // Delete the video from S3
    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.VIDEO_BUCKET_NAME,
      Key: videoKey,
    });

    await s3.send(deleteCommand);

    console.log('✅ Video deleted successfully:', videoKey);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Video deleted successfully',
        deletedKey: videoKey,
      }),
    };
  } catch (error) {
    console.error('💥 Error in delete video:', error);
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
        error: 'Failed to delete video',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
