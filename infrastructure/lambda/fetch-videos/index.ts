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

    // List thumbnail images from video parts bucket
    console.log('🖼️ Fetching thumbnails for user:', userId);

    if (!process.env.VIDEO_PARTS_BUCKET_NAME) {
      console.log('❌ Error: VIDEO_PARTS_BUCKET_NAME is not set');
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Video parts bucket name not configured',
        }),
      };
    }

    const thumbnailListCommand = new ListObjectsV2Command({
      Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
      Prefix: `${userId}/`,
    });

    const thumbnailListResponse = await (s3 as any).send(thumbnailListCommand);
    console.log(
      '✅ Listed thumbnail objects:',
      thumbnailListResponse.Contents?.length || 0,
    );

    console.log(
      '🖼️ Available thumbnail keys:',
      thumbnailListResponse.Contents?.map((obj: any) => obj.Key).filter(
        (key: any) => key?.endsWith('.scene-0.png'),
      ) || [],
    );

    if (thumbnailListResponse.Contents) {
      const thumbnailData = await Promise.all(
        thumbnailListResponse.Contents.filter((object: any) =>
          object.Key?.endsWith('.scene-0.png'),
        ).map(async (object: any) => {
          if (!object.Key) return null;

          // Extract timestamp from thumbnail key: user123/1703123456789.scene-0.png -> 1703123456789
          const timestamp = object.Key.split('/').pop()?.split('.')[0] || '';
          console.log('🖼️ Generating thumbnail URL for timestamp:', timestamp);

          const getThumbnailCommand = new GetObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: object.Key,
          });

          const thumbnailUrl = await getSignedUrl(
            s3 as any,
            getThumbnailCommand as any,
            {
              expiresIn: 36000, // 1 hour
            },
          );

          return {
            thumbnailUrl,
            size: object.Size,
            lastModified: object.LastModified?.toISOString(),
            timestamp,
            createdAt: object.LastModified?.toISOString(),
          };
        }),
      );

      // Filter out null values and sort by timestamp (newest first)
      const validThumbnails = thumbnailData
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp));

      return {
        statusCode: 200,
        body: JSON.stringify({
          videos: validThumbnails,
          message: `Found ${validThumbnails.length} thumbnails`,
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        videos: [],
        message: 'No thumbnails found',
      }),
    };
  } catch (error) {
    console.error('💥 Error in fetch videos:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to fetch videos',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
