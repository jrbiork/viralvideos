import { NextRequest, NextResponse } from 'next/server';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

export async function GET(request: NextRequest) {
  console.log('📋 Starting video fetch request...');

  try {
    // Check environment variables
    console.log('🔍 Checking environment variables...');
    console.log('AWS_REGION:', process.env.AWS_REGION);
    console.log('VIDEO_BUCKET_NAME:', process.env.VIDEO_BUCKET_NAME);

    if (!process.env.VIDEO_BUCKET_NAME) {
      console.log('❌ Error: VIDEO_BUCKET_NAME is not set');
      return NextResponse.json(
        { error: 'S3 bucket name not configured' },
        { status: 500 },
      );
    }

    const userId = 'demo-user2';
    console.log(`🔍 Fetching videos for user: ${userId}`);

    // List objects in the user's folder
    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.VIDEO_BUCKET_NAME,
      Prefix: `${userId}/`,
      MaxKeys: 50, // Limit to 50 videos
    });

    console.log('📋 Listing objects from S3...');
    const listResponse = await s3.send(listCommand);

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      console.log('📭 No videos found for user');
      return NextResponse.json({
        videos: [],
        message: 'No videos found for user',
      });
    }

    console.log(`📹 Found ${listResponse.Contents.length} objects in S3`);

    // Filter for video files and generate pre-signed URLs
    const videos = [];

    for (const object of listResponse.Contents) {
      if (!object.Key) continue;

      // Only include final video files (not scene parts)
      if (object.Key.includes('final-video') && object.Key.endsWith('.mp4')) {
        console.log(`🎬 Processing video: ${object.Key}`);

        try {
          // Generate pre-signed URL for the video
          const getObjectCommand = new GetObjectCommand({
            Bucket: process.env.VIDEO_BUCKET_NAME,
            Key: object.Key,
          });

          const videoUrl = await getSignedUrl(s3, getObjectCommand, {
            expiresIn: 3600, // 1 hour
          });

          // Extract timestamp from filename
          const timestampMatch = object.Key.match(/final-video-(\d+)\.mp4/);
          const timestamp = timestampMatch
            ? parseInt(timestampMatch[1])
            : Date.now();

          videos.push({
            key: object.Key,
            url: videoUrl,
            timestamp: timestamp,
            createdAt: new Date(timestamp).toISOString(),
            size: object.Size || 0,
          });
        } catch (error) {
          console.error(`❌ Error generating URL for ${object.Key}:`, error);
        }
      }
    }

    // Sort videos by timestamp (newest first)
    videos.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`✅ Successfully processed ${videos.length} videos`);

    return NextResponse.json({
      videos,
      message: `Found ${videos.length} videos for user`,
    });
  } catch (error) {
    console.error('💥 Error fetching videos:', error);
    console.error(
      'Error stack:',
      error instanceof Error ? error.stack : 'No stack trace',
    );
    console.error(
      'Error message:',
      error instanceof Error ? error.message : 'Unknown error',
    );

    return NextResponse.json(
      {
        error: 'Failed to fetch videos',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
