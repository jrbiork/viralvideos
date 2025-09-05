import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { generateNarration } from '../utils/audio';
import { generateSubtitles, ASSContentResult } from '../utils/subtitles';
import { Scene } from '../utils/script';

import { broadcastProgress } from '../video-generation';
import { CREDITS_COST } from '../utils/credits';

import { getManifest, hydrateManifest } from '../utils/manifestUtils';
import {
  hasSufficientCreditsByUserId,
  updateCreditBalanceByUserId,
} from '../utils/credits';

// Constants
const DEFAULT_LANGUAGE = 'en';

interface RequestBody {
  scenes: Scene[];
  userId: string;
  timestamp: string;
  voiceToneInstruction?: string;
  voice?: string;
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
    const requestBody = JSON.parse(event.body);
    const scene = requestBody.scene as Scene;
    const voice = requestBody.voice || 'alloy';
    const language = requestBody.language || DEFAULT_LANGUAGE;

    if (!scene) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Scenes array is required and must not be empty',
        }),
      };
    }

    const { hasSufficientCredits, currentCredits } =
      await hasSufficientCreditsByUserId(
        userId,
        CREDITS_COST.new_audio_subtitle,
      );

    console.log(
      'hasCredits / current credits:',
      hasSufficientCredits,
      currentCredits,
    );
    if (!hasSufficientCredits) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Insufficient credits' }),
      };
    }

    console.log('getting manifest');
    console.log('userId:', userId);
    console.log('timestamp:', timestamp);

    const manifest = await getManifest(userId, timestamp);

    console.log('manifest:', JSON.stringify(manifest, null, 2));

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
      'Speak in a cheerful and positive tone',
      voice,
      language,
    );
    console.log('subtitles generated:', JSON.stringify(subtitles, null, 2));

    const assContentArray: ASSContentResult[] = await generateSubtitles(
      [scene],
      userId,
      timestamp,
      subtitles,
    );
    console.log('assContentArray:', assContentArray);

    const manifestHydrated = await hydrateManifest(manifest);
    console.log('manifestHydrated:', manifestHydrated);

    const newCurrentCredits = await updateCreditBalanceByUserId(
      userId,
      CREDITS_COST.new_audio_subtitle,
    );
    console.log('new credits after deduction:', newCurrentCredits);

    await broadcastProgress('credit_updated', userId, timestamp, {
      currentCredits,
    });

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
