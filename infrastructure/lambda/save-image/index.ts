import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { uploadImageToS3 } from '../utils/s3Uploader';
import { generateVideoEffects } from '../utils/videoEffects';
import { broadcastMessage } from '../websocket-broadcast';

import { getManifest, hydrateManifest } from '../utils/manifestUtils';
import { broadcastProgress } from '../video-generation';

interface RequestBody {
  sceneId: number;
  generatedImageUrl: string;
  timestamp: string;
  duration: number;
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
    const { sceneId, generatedImageUrl, duration } = body;

    if (sceneId === undefined || sceneId === null) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing sceneId in request body' }),
      };
    }

    if (!duration) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing duration in request body' }),
      };
    }
    const manifest = await getManifest(userId, timestamp);
    if (!manifest) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Manifest not found' }),
      };
    }

    // Form the imageKey
    const imageKey = `${userId}/${timestamp}.scene-${sceneId}.jpg`;
    console.log(`🔑 Formed image key: ${imageKey}`);

    await uploadImageToS3(generatedImageUrl, userId, timestamp, sceneId);
    console.log(`✅ Image replaced successfully`);

    const hydratedManifest = await hydrateManifest(manifest);

    broadcastProgress(userId, timestamp, 'image_created', {
      manifest: hydratedManifest,
    });

    await generateVideoEffects([{ id: sceneId, duration }], userId, timestamp);

    broadcastProgress(userId, timestamp, 'video_scene_created', {
      manifest: hydratedManifest,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Image saved successfully' }),
    };
  } catch (error) {
    console.error('❌ Error in save-image lambda:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
