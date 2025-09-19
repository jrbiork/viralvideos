import { SQSRecord } from 'aws-lambda';
import { generateNarration } from '../utils/audio';
import { getManifest, hydrateManifest } from '../utils/manifestUtils';

import { generateSubtitles } from '../utils/subtitles';
import { generateVideoEffects } from '../utils/videoEffects';
import { broadcastProgress } from '../utils/broadcastProgress';
import { CREDITS_COST } from '../utils/credits';
import {
  hasSufficientCreditsByUserId,
  updateCreditBalanceByUserId,
} from '../utils/credits';
import { Scene } from '../utils/script';

import { updateManifest } from '../utils/manifestUtils';
import { Manifest } from '../types/s3Types';

export interface processRegenerateAudioSceneRequest {
  scene: Scene;
  voice: string;
  language: string;
  userId: string;
  timestamp: string;
}

export async function processRegenerateAudioScene(
  request: processRegenerateAudioSceneRequest,
  record?: SQSRecord,
) {
  console.log(
    'request processRegenerateAudioScene:',
    JSON.stringify(request, null, 2),
  );
  const { scene, voice, language, userId, timestamp } = request;

  if (!scene) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Scenes array is required and must not be empty',
      }),
    };
  }

  const { hasSufficientCredits, currentCredits } =
    await hasSufficientCreditsByUserId(userId, CREDITS_COST.new_audio_subtitle);

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

  let manifest = await getManifest(userId, timestamp);

  console.log('manifest:', JSON.stringify(manifest, null, 2));

  if (!manifest) {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Manifest not found' }),
    };
  }

  // Step 3: Generate audio narration with word-level timestamps
  const { subtitles } = await generateNarration(
    [scene],
    request.userId,
    timestamp,
    manifest.voiceToneInstruction,
    manifest.voice,
    manifest.language,
  );
  console.log('subtitles generated:', JSON.stringify(subtitles, null, 2));

  await generateSubtitles([scene], userId, timestamp, subtitles);

  manifest = await updateManifest(manifest, {
    scenes: manifest.scenes.map((manifestScene) => {
      // Only update the duration for the specific scene that was regenerated
      if (manifestScene.scenePosition === scene.scenePosition) {
        return {
          ...manifestScene,
          files: {
            ...manifestScene.files,
            duration: subtitles[0].duration || 10,
          },
        };
      }
      return manifestScene;
    }),
  });

  const manifestHydrated = await hydrateManifest(manifest);

  // generate video effect
  if (!scene.animated) {
    await generateVideoEffects([scene], request.userId, timestamp);
  }

  await broadcastProgress('preview_completed', request.userId, timestamp, {
    manifest: manifestHydrated,
  });

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
}
