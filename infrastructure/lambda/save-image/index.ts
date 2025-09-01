import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { uploadImageToS3 } from '../utils/s3Uploader';

interface RequestBody {
  sceneId: number;
  generatedImageUrl: string;
  timestamp: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  console.log('💾 Save Image Lambda handler started');

  try {
    // get userId from the authorizer context
    const userId = (event.requestContext as any).authorizer?.principalId;
    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    // get timestamp from query string
    const timestamp = event.queryStringParameters?.['timestamp'];
    if (!timestamp) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Timestamp is required' }),
      };
    }

    // Parse request body
    const body: RequestBody = JSON.parse(event.body || '{}');
    const { sceneId, generatedImageUrl } = body;

    if (sceneId === undefined || sceneId === null) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing sceneId in request body' }),
      };
    }

    // Form the imageKey
    const imageKey = `${userId}/${timestamp}.scene-${sceneId}.jpg`;
    console.log(`🔑 Formed image key: ${imageKey}`);

    await uploadImageToS3(generatedImageUrl, userId, timestamp, sceneId);
    console.log(`✅ Image replaced successfully`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Image key formed successfully',
        imageKey,
        sceneId,
      }),
    };
  } catch (error) {
    console.error('❌ Error in save-image lambda:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
