import { SQSRecord } from 'aws-lambda';
import { generateNarration } from '../utils/audio';
import {
  getManifest,
  hydrateManifest,
  addSceneToManifest,
  createManifestScene,
} from '../utils/manifestUtils';

import { generateSubtitles, ASSContentResult } from '../utils/subtitles';
import { generateVideoEffects } from '../utils/videoEffects';
import { broadcastProgress } from '../utils/broadcastProgress';
import { CREDITS_COST } from '../utils/credits';
import {
  hasSufficientCreditsByUserId,
  updateCreditBalanceByUserId,
} from '../utils/credits';
import { Scene } from '../utils/script';

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

  const manifest = await getManifest(userId, timestamp);

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

  // update scenes duration
  scene.duration = subtitles[0].duration || 10;

  console.log('scene duration:', scene.duration);

  const assContentArray: ASSContentResult[] = await generateSubtitles(
    [scene],
    userId,
    timestamp,
    subtitles,
  );

  const manifestHydrated = await hydrateManifest(manifest);

  // generate video effect
  await generateVideoEffects([scene], request.userId, timestamp);

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
