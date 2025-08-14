import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

interface FetchVideosRequest {
  userId: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    let request: FetchVideosRequest;

    // Handle different event formats
    if (event.body) {
      // API Gateway format - body is a JSON string
      if (typeof event.body === 'string') {
        request = JSON.parse(event.body);
      } else {
        // Direct Lambda invocation - body is already an object
        request = event.body as FetchVideosRequest;
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

    console.log('🔍 Fetching videos for user:', userId);

    if (!process.env.VIDEO_BUCKET_NAME) {
      console.log('❌ Error: VIDEO_BUCKET_NAME is not set');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'S3 bucket name not configured' }),
      };
    }

    // List objects in the S3 bucket for this user
    console.log('📋 Listing videos for user:', userId);
    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.VIDEO_BUCKET_NAME,
      Prefix: `${userId}/`,
    });

    const listResponse = await s3.send(listCommand);
    console.log('✅ Listed objects:', listResponse.Contents?.length || 0);

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      console.log('📭 No videos found for user:', userId);
      return {
        statusCode: 200,
        body: JSON.stringify({
          videos: [],
          message: 'No videos found',
        }),
      };
    }

    // Filter for video files and generate pre-signed URLs
    const videos = await Promise.all(
      listResponse.Contents.filter((object) =>
        object.Key?.endsWith('.mp4'),
      ).map(async (object) => {
        if (!object.Key) return null;

        console.log('🔗 Generating pre-signed URL for:', object.Key);
        const getObjectCommand = new GetObjectCommand({
          Bucket: process.env.VIDEO_BUCKET_NAME,
          Key: object.Key,
        });

        const videoUrl = await getSignedUrl(
          s3 as any,
          getObjectCommand as any,
          {
            expiresIn: 3600, // 1 hour
          },
        );

        return {
          key: object.Key,
          url: videoUrl,
          size: object.Size,
          lastModified: object.LastModified,
          timestamp: object.Key.split('/').pop()?.split('.')[0] || '',
        };
      }),
    );

    const validVideos = videos.filter((video) => video !== null);
    console.log('✅ Generated URLs for', validVideos.length, 'videos');

    return {
      statusCode: 200,
      body: JSON.stringify({
        videos: validVideos,
        message: `Found ${validVideos.length} videos`,
      }),
    };
  } catch (error) {
    console.error('💥 Error in fetch videos:', error);
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
        error: 'Failed to fetch videos',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
