import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { generateNarration } from '../video-generation/audio';
import { generateSubtitles } from '../video-generation/subtitles';
import { Scene } from '../video-generation/script';

import { broadcastProgress } from '../video-generation';
import {
  getManifest,
  updateManifest,
} from '../video-generation/util/manifestUtils';

interface RequestBody {
  scenes: Scene[];
  userId: string;
  timestamp: string;
  voiceToneInstruction?: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  console.log('🎤 Audio-Subtitle Lambda handler started');

  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

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

    // get one scene object from body
    const scene = JSON.parse(event.body).scene as Scene;
    if (!scene) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Scenes array is required and must not be empty',
        }),
      };
    }

    const manifest = await getManifest(userId, timestamp);
    if (!manifest) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Manifest not found' }),
      };
    }

    // Step 3: Generate audio narration with word-level timestamps
    const { subtitles, narrationUrls } = await generateNarration(
      [scene],
      userId,
      timestamp,
    );

    const assContent = await generateSubtitles(
      [scene],
      userId,
      timestamp,
      subtitles,
    );

    // update manifest with subtitle content, ass content and audio urls
    const updatedScenesWithAudio = manifest!.scenes.map((manifestScene) => {
      const narrationUrlObj = narrationUrls[manifestScene.sceneIndex];
      const narrationUrl = narrationUrlObj
        ? Object.values(narrationUrlObj)[0]
        : manifestScene.files.mp3;

      const assContentStr = typeof assContent === 'string' ? assContent : '';

      return {
        ...manifestScene,
        files: {
          ...manifestScene.files,
          mp3: narrationUrl,
          ass: assContentStr,
          subtitle: subtitles[manifestScene.sceneIndex].fullText,
        },
      };
    });

    const manifestUpdated = await updateManifest(manifest!, {
      scenes: updatedScenesWithAudio,
    });

    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        manifest: manifestUpdated,
      }),
    };
  } catch (error) {
    console.error('❌ Error in audio-subtitle generation:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message:
          error instanceof Error ? error.message : 'Unknown error occurred',
      }),
    };
  }
};
