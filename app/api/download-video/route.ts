import { NextRequest, NextResponse } from 'next/server';
import { verifyCognitoTokenPayload } from '@/lib/auth-utils';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication from cookies
    const cookieStore = cookies();
    const cognitoToken = cookieStore.get('viral-videos-cognito-token');

    if (!cognitoToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await verifyCognitoTokenPayload(cognitoToken.value);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get the video URL from query parameters
    const { searchParams } = new URL(request.url);
    const videoUrl = searchParams.get('url');
    const filename = searchParams.get('filename') || 'video.mp4';

    if (!videoUrl) {
      return NextResponse.json(
        { error: 'Video URL is required' },
        { status: 400 },
      );
    }

    // Fetch the video from S3
    const response = await fetch(videoUrl);

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch video' },
        { status: response.status },
      );
    }

    // Get the video as a buffer
    const videoBuffer = await response.arrayBuffer();

    // Return the video with proper headers for download
    return new NextResponse(videoBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': videoBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('Error downloading video:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
