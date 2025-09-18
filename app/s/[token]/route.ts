import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function fromBase64Url(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replaceAll('-', '+').replaceAll('_', '/') + pad;
  return Buffer.from(b64, 'base64').toString('utf8');
}

export async function GET(
  request: NextRequest,
  context: { params: { token: string } },
) {
  try {
    const { token } = context.params;
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const decoded = fromBase64Url(token);
    const [userId, timestamp] = decoded.split(':');
    if (!userId || !timestamp) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    }

    const region = process.env.AWS_REGION || 'us-east-1';
    const videoBucket = process.env.VIDEO_BUCKET_NAME || '';
    const partsBucket = process.env.VIDEO_PARTS_BUCKET_NAME || '';
    if (!videoBucket || !partsBucket) {
      return NextResponse.json(
        { error: 'S3 bucket env variables not configured' },
        { status: 500 },
      );
    }

    const s3 = new S3Client({ region });
    const manifestKey = `${userId}/${timestamp}.manifest.json`;
    const manifestObj = await s3.send(
      new GetObjectCommand({ Bucket: partsBucket, Key: manifestKey }),
    );
    const manifestText = await manifestObj.Body?.transformToString();
    if (!manifestText) {
      return NextResponse.json(
        { error: 'Manifest not found' },
        { status: 404 },
      );
    }
    const manifest = JSON.parse(manifestText || '{}');
    if (!manifest?.videoGenerated || !manifest?.finalVideoUrl) {
      return NextResponse.json({ error: 'Video not ready' }, { status: 404 });
    }

    const signedVideoUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: videoBucket,
        Key: manifest.finalVideoUrl,
      }),
      { expiresIn: 3600 },
    );

    return NextResponse.redirect(signedVideoUrl, 302);
  } catch (error) {
    console.error('Error resolving share link:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
