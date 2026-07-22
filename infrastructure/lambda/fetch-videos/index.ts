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

// Helper function to get video size with error handling
async function getVideoSize(bucket: string, key: string): Promise<number> {
  try {
    const videoHeadCommand = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    const videoMetadata = await s3.send(videoHeadCommand);
    return videoMetadata.ContentLength || 0;
  } catch (error) {
    console.warn('⚠️ Could not fetch video metadata for:', key, error);
    return 0;
  }
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();

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
      console.log(
        `🚀 Processing ${manifestFiles.length} manifests in parallel...`,
      );
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
            const manifestStartTime = Date.now();

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

            // 🚀 PARALLEL PROCESSING: Run all S3 operations concurrently
            const thumbnailUrlPromise = getSignedUrl(
              s3,
              new GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: firstScene.files.png,
              }),
              { expiresIn: 36000 },
            );

            let finalVideoUrlPromise = Promise.resolve('');
            let videoSizePromise = Promise.resolve(0);

            // Add video operations only if video is generated
            if (manifest.videoGenerated) {
              finalVideoUrlPromise = getSignedUrl(
                s3,
                new GetObjectCommand({
                  Bucket: process.env.VIDEO_BUCKET_NAME,
                  Key: manifest.finalVideoUrl,
                }),
                { expiresIn: 36000 },
              );

              videoSizePromise = getVideoSize(
                process.env.VIDEO_BUCKET_NAME!,
                manifest.finalVideoUrl,
              );
            }

            // Execute all operations in parallel
            const [thumbnailUrl, finalVideoUrl, videoSize] = await Promise.all([
              thumbnailUrlPromise,
              finalVideoUrlPromise,
              videoSizePromise,
            ]);

            if (videoSize > 0) {
              console.log(
                '📊 Video size:',
                videoSize,
                'bytes for video:',
                manifest.finalVideoUrl,
              );
            }

            const manifestDuration = Date.now() - manifestStartTime;
            console.log(
              `⚡ Processed manifest ${timestamp} in ${manifestDuration}ms`,
            );

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
              isCombining: manifest.isCombining || false,
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

      const duration = Date.now() - startTime;
      console.log(
        `✅ Processed ${validVideos.length} videos in ${duration}ms (${manifestFiles.length} manifests)`,
      );

      return {
        statusCode: 200,
        body: JSON.stringify({
          videos: validVideos,
          message: `Found ${validVideos.length} videos`,
          processingTimeMs: duration,
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
