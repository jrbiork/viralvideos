import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Manifest } from '../types/s3Types';

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

    // List all manifest files for the user
    console.log('📋 Fetching all manifests for user:', userId);

    if (!process.env.VIDEO_PARTS_BUCKET_NAME) {
      console.log('❌ Error: VIDEO_PARTS_BUCKET_NAME is not set');
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Video parts bucket name not configured',
        }),
      };
    }

    const manifestListCommand = new ListObjectsV2Command({
      Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
      Prefix: `${userId}/`,
      Delimiter: '',
    });

    const manifestListResponse = await s3.send(manifestListCommand);

    // Filter for manifest files only
    const manifestFiles =
      manifestListResponse.Contents?.filter((object: any) =>
        object.Key?.endsWith('.manifest.json'),
      ) || [];

    if (manifestFiles.length > 0) {
      const videoData = await Promise.all(
        manifestFiles.map(async (manifestObject) => {
          if (!manifestObject.Key) return null;

          try {
            // Extract timestamp from manifest key: user123/1703123456789.manifest.json -> 1703123456789
            const timestamp =
              manifestObject.Key.split('/')
                .pop()
                ?.replace('.manifest.json', '') || '';

            console.log('📋 Processing manifest for timestamp:', timestamp);

            // Fetch the manifest content
            const manifestCommand = new GetObjectCommand({
              Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
              Key: manifestObject.Key,
            });

            const manifestResponse = await s3.send(manifestCommand);

            const manifest = JSON.parse(
              (await manifestResponse.Body?.transformToString()) || '{}',
            ) as Manifest;

            // Get the first scene's image file path from manifest
            const firstScene = manifest.scenes?.[0];
            if (!firstScene?.files?.png) {
              console.warn(
                `⚠️ No first scene image found for timestamp: ${timestamp}`,
              );
              return null;
            }

            // Generate presigned URL for the first scene's image
            const thumbnailCommand = new GetObjectCommand({
              Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
              Key: firstScene.files.png,
            });

            const thumbnailUrl = await getSignedUrl(s3, thumbnailCommand, {
              expiresIn: 36000,
            });

            let finalVideoUrl = '';
            let videoSize = 0;
            if (manifest.videoGenerated) {
              const videoCommand = new GetObjectCommand({
                Bucket: process.env.VIDEO_BUCKET_NAME,
                Key: manifest.finalVideoUrl,
              });
              finalVideoUrl = await getSignedUrl(s3, videoCommand, {
                expiresIn: 36000,
              });

              // Get video metadata to fetch its size
              try {
                const videoHeadCommand = new HeadObjectCommand({
                  Bucket: process.env.VIDEO_BUCKET_NAME,
                  Key: manifest.finalVideoUrl,
                });
                const videoMetadata = await s3.send(videoHeadCommand);
                videoSize = videoMetadata.ContentLength || 0;
                console.log(
                  '📊 Video size:',
                  videoSize,
                  'bytes for video:',
                  manifest.finalVideoUrl,
                );
              } catch (error) {
                console.warn('⚠️ Could not fetch video metadata:', error);
                videoSize = 0;
              }
            }

            return {
              key: firstScene.files.png,
              thumbnailUrl,
              timestamp,
              createdAt: manifest.generatedAt
                ? new Date(parseInt(manifest.generatedAt)).toISOString()
                : new Date().toISOString(),
              lastModified:
                manifestObject.LastModified?.toISOString() ||
                new Date().toISOString(),
              totalDuration: manifest.totalDuration || 0,
              sceneCount: manifest.sceneCount || 0,
              videoGenerated: manifest.videoGenerated || false,
              finalVideoUrl,
              size: videoSize,
            };
          } catch (error) {
            console.error(
              `❌ Error processing manifest ${manifestObject.Key}:`,
              error,
            );
            return null;
          }
        }),
      );

      // Filter out null values and sort by timestamp (newest first)
      const validVideos = videoData
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp));

      return {
        statusCode: 200,
        body: JSON.stringify({
          videos: validVideos,
          message: `Found ${validVideos.length} videos`,
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        videos: [],
        message: 'No videos found',
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
