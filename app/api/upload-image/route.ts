import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '../../../lib/session-utils';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg'];

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session?.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { contentType, timestamp } = await request.json();

    if (!timestamp) {
      return NextResponse.json(
        { error: 'timestamp is required' },
        { status: 400 },
      );
    }

    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: 'contentType must be image/png or image/jpeg' },
        { status: 400 },
      );
    }

    if (!process.env.VIDEO_PARTS_BUCKET_NAME) {
      return NextResponse.json(
        { error: 'VIDEO_PARTS_BUCKET_NAME not configured' },
        { status: 500 },
      );
    }

    const userId = session.sub;
    const bucket = process.env.VIDEO_PARTS_BUCKET_NAME;
    const key = `${userId}/${timestamp}.scene-${Date.now()}.png`;

    const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

    const { url: uploadUrl, fields: uploadFields } = await createPresignedPost(
      s3,
      {
        Bucket: bucket,
        Key: key,
        Conditions: [
          ['content-length-range', 0, MAX_UPLOAD_BYTES],
          ['eq', '$Content-Type', contentType],
        ],
        Fields: {
          'Content-Type': contentType,
        },
        Expires: 300,
      },
    );

    const imageUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 86400 },
    );

    return NextResponse.json({ uploadUrl, uploadFields, imageUrl });
  } catch (error) {
    console.error('💥 Error in upload-image API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
