import { NextRequest, NextResponse } from 'next/server';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

export async function GET(request: NextRequest) {
  console.log('🚀 Starting video fetch request...');

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'demo-user4';

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
      return NextResponse.json({
        videos: [],
        message: 'No videos found',
      });
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

        const videoUrl = await getSignedUrl(s3, getObjectCommand, {
          expiresIn: 3600, // 1 hour
        });

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

    return NextResponse.json({
      videos: validVideos,
      message: `Found ${validVideos.length} videos`,
    });
  } catch (error) {
    console.error('💥 Error in video fetch:', error);
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
