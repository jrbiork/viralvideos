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

    const thumbnailListResponse = await s3.send(thumbnailListCommand);
    console.log(
      '✅ Listed thumbnail objects:',
      thumbnailListResponse.Contents?.length || 0,
    );

    // Create a map of timestamp to thumbnail URL
    const thumbnailMap = new Map<string, string>();
    console.log(
      '🖼️ Available thumbnail keys:',
      thumbnailListResponse.Contents?.map((obj) => obj.Key).filter((key) =>
        key?.endsWith('.scene-0.jpg'),
      ) || [],
    );

    if (thumbnailListResponse.Contents) {
      await Promise.all(
        thumbnailListResponse.Contents.filter((object) =>
          object.Key?.endsWith('.scene-0.jpg'),
        ).map(async (object) => {
          if (!object.Key) return;

          // Extract timestamp from thumbnail key: user123/1703123456789.scene-0.jpg -> 1703123456789
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

          thumbnailMap.set(timestamp, thumbnailUrl);
        }),
      );
    }

    // List objects in the S3 bucket for this user
    console.log('📋 Listing videos for user:', userId);
    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.VIDEO_BUCKET_NAME,
      Prefix: `${userId}/`,
    });

    const listResponse = await s3.send(listCommand);
    console.log('✅ Listed objects:', listResponse.Contents?.length || 0);
    console.log(
      '🎬 Available video keys:',
      listResponse.Contents?.map((obj) => obj.Key).filter((key) =>
        key?.endsWith('.mp4'),
      ) || [],
    );

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
            expiresIn: 36000, // 1 hour
          },
        );

        // Extract timestamp from video key: user123/1703123456789-final-video.mp4 -> 1703123456789
        const timestamp =
          object.Key.split('/').pop()?.split('-final-video')[0] || '';
        console.log(
          '🎬 Video timestamp extracted:',
          timestamp,
          'from key:',
          object.Key,
        );
        const thumbnailUrl = thumbnailMap.get(timestamp) || null;
        console.log(
          '🖼️ Thumbnail URL found:',
          thumbnailUrl ? 'YES' : 'NO',
          'for timestamp:',
          timestamp,
        );

        return {
          key: object.Key,
          url: videoUrl,
          thumbnailUrl: thumbnailUrl,
          size: object.Size,
          lastModified: object.LastModified,
          timestamp: timestamp,
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
