import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import { listScenes } from './listScenes';

const s3 = new S3Client({ region: process.env['AWS_REGION'] || 'us-east-1' });
const bucketName = process.env['S3_BUCKET_NAME']!;
const EXPIRES = Number(process.env['URL_TTL_SECONDS'] ?? 3600); // default 1h

const cors = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  try {
    // Extract timestamp from query parameters
    const timestamp = event.queryStringParameters?.['timestamp'];
    if (!timestamp) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ error: 'Timestamp is required' }),
      };
    }

    // Extract userId from the authorizer context
    const userId = (event.requestContext as any).authorizer?.principalId;
    if (!userId) {
      return {
        statusCode: 401,
        headers: cors,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    // Use listScenes to get the preview data
    const { scenes, sceneCount } = await listScenes(
      s3,
      bucketName,
      userId,
      timestamp,
      EXPIRES,
    );

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        data: scenes,
        sceneCount,
      }),
    };
  } catch (error: any) {
    console.error('fetch-preview error', { message: error?.message });
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
