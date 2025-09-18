import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function fromBase64Url(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64').toString('utf8');
}

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  try {
    const token = event.pathParameters?.token || '';
    if (!token) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ error: 'Missing token' }),
      };
    }

    const decoded = fromBase64Url(token);
    const [userId, timestamp] = decoded.split(':');
    if (!userId || !timestamp) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ error: 'Invalid token' }),
      };
    }

    const partsBucket = process.env.VIDEO_PARTS_BUCKET_NAME || '';
    const videoBucket = process.env.VIDEO_BUCKET_NAME || '';
    if (!partsBucket || !videoBucket) {
      return {
        statusCode: 500,
        headers: cors,
        body: JSON.stringify({ error: 'S3 buckets not configured' }),
      };
    }

    const manifestKey = `${userId}/${timestamp}.manifest.json`;
    const manifestObj = await s3.send(
      new GetObjectCommand({ Bucket: partsBucket, Key: manifestKey }),
    );
    const manifestText = await manifestObj.Body?.transformToString();
    if (!manifestText) {
      return {
        statusCode: 404,
        headers: cors,
        body: JSON.stringify({ error: 'Manifest not found' }),
      };
    }

    const manifest = JSON.parse(manifestText || '{}');
    if (!manifest?.videoGenerated || !manifest?.finalVideoUrl) {
      return {
        statusCode: 404,
        headers: cors,
        body: JSON.stringify({ error: 'Video not ready' }),
      };
    }

    const signedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: videoBucket,
        Key: manifest.finalVideoUrl,
      }),
      { expiresIn: 3600 },
    );

    return {
      statusCode: 302,
      headers: { ...cors, Location: signedUrl },
      body: '',
    };
  } catch (error: any) {
    console.error('share-resolve error', { message: error?.message });
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
