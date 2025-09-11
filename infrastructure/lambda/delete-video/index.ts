import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  S3Client,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

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
    const videoPartsPrefix = `${userId}/${timestamp}`;

    console.log('🗑️ Deleting video with key:', videoKey);

    // Delete the video from S3
    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.VIDEO_BUCKET_NAME,
      Key: videoKey,
    });

    await s3.send(deleteCommand);
    console.log('✅ Video deleted successfully:', videoKey);

    // Delete all video parts from the video parts bucket
    if (process.env.VIDEO_PARTS_BUCKET_NAME) {
      console.log('🗑️ Deleting video parts with prefix:', videoPartsPrefix);

      // List all objects with the prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Prefix: videoPartsPrefix,
      });

      const listResponse = await s3.send(listCommand);
      const objectsToDelete = listResponse.Contents || [];

      if (objectsToDelete.length > 0) {
        console.log(
          `🗑️ Found ${objectsToDelete.length} objects to delete in video parts bucket`,
        );

        // Delete all objects in batches of 1000 (S3 limit)
        const deletePromises = [];
        for (let i = 0; i < objectsToDelete.length; i += 1000) {
          const batch = objectsToDelete.slice(i, i + 1000);
          const deleteObjectsCommand = new DeleteObjectsCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Delete: {
              Objects: batch.map((obj) => ({ Key: obj.Key! })),
              Quiet: false,
            },
          });
          deletePromises.push(s3.send(deleteObjectsCommand));
        }

        await Promise.all(deletePromises);
        console.log(
          `✅ Successfully deleted ${objectsToDelete.length} video parts`,
        );
      } else {
        console.log('⚠️ No video parts found to delete');
      }
    } else {
      console.log('❌ Error: VIDEO_PARTS_BUCKET_NAME is not set');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Video and all associated files deleted successfully',
        deletedVideoKey: videoKey,
        deletedPartsPrefix: videoPartsPrefix,
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
