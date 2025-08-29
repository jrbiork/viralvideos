import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { generateNarration } from '../video-generation/audio';
import {
  generateSubtitles,
  ASSContentResult,
} from '../video-generation/subtitles';
import { Scene } from '../video-generation/script';

import { broadcastProgress } from '../video-generation';
import {
  getManifest,
  hydrateManifest,
  updateManifest,
} from '../video-generation/util/manifestUtils';
import { uploadJsonToS3 } from '../video-generation/util/s3Uploader';

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

    const manifestHydrated = await hydrateManifest(manifest);
    console.log('manifestHydrated:', manifestHydrated);

    // Step 3: Generate audio narration with word-level timestamps
    const { subtitles, narrationUrls } = await generateNarration(
      [scene],
      userId,
      timestamp,
    );
    console.log('subtitles generated:', JSON.stringify(subtitles, null, 2));

    const assContentArray: ASSContentResult[] = await generateSubtitles(
      [scene],
      userId,
      timestamp,
      subtitles,
    );
    console.log('assContentArray:', assContentArray);

    // update manifest with subtitle content, ass content and audio urls
    // Only update the specific scene that was regenerated (scene.id corresponds to sceneIndex)
    const updatedScenesWithAudio = manifestHydrated!.scenes.map(
      (manifestScene) => {
        // Only update the scene that matches the regenerated scene
        if (manifestScene.sceneIndex === scene.id) {
          const narrationUrlObj = narrationUrls[0]; // Only one scene was processed
          const narrationUrl = narrationUrlObj
            ? Object.values(narrationUrlObj)[0]
            : manifestScene.files.mp3;

          // Extract ASS content from the array (first element contains the ASS content)
          const assContent = assContentArray[0]
            ? Object.values(assContentArray[0])[0]
            : '';

          return {
            ...manifestScene,
            files: {
              ...manifestScene.files,
              mp3: narrationUrl,
              ass: assContent,
              subtitle: subtitles[0].fullText, // Only one subtitle was generated
            },
          };
        }

        // Return unchanged scene for all other scenes
        return manifestScene;
      },
    );

    // update manifestHydrated with updatedScenesWithAudio
    manifestHydrated!.scenes = updatedScenesWithAudio;
    console.log('manifestHydrated:', JSON.stringify(manifestHydrated, null, 2));

    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        manifest: manifestHydrated,
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
