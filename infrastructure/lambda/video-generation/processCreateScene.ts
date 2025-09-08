import { SQSRecord } from 'aws-lambda';
import { generateNarration } from '../utils/audio';
import {
  getManifest,
  hydrateManifest,
  addSceneToManifest,
  createManifestScene,
} from '../utils/manifestUtils';
import { uploadImageToS3 } from '../utils/s3Uploader';
import { generateSubtitles } from '../utils/subtitles';
import { generateVideoEffects } from '../utils/videoEffects';
import { broadcastProgress } from './broadcastProgress';

export interface CreateSceneRequest {
  imageUrl: string;
  sceneId: number;
  sceneIndex: number;
  userId: string;
  timestamp: string;
  captionText: string;
}

export async function processCreateScene(
  request: CreateSceneRequest,
  record?: SQSRecord,
) {
  const { imageUrl, sceneId, sceneIndex, captionText, userId, timestamp } =
    request;

  const scenes = [
    {
      id: sceneIndex,
      description: '',
      duration: 10, // Todo: get duration from audio
      narration: captionText,
    },
  ];

  const manifest = await getManifest(userId, timestamp);
  if (!manifest) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Manifest not found' }),
    };
  }

  // save imageURL receive into s3 bucket video parts
  await uploadImageToS3(imageUrl, userId, timestamp, sceneId);

  // generate audio and transcription
  const { subtitles } = await generateNarration(
    scenes,
    request.userId,
    timestamp,
    manifest.voiceToneInstruction,
    manifest.voice,
    manifest.language,
  );

  console.log('subtitles:', subtitles);

  // update scenes duration
  scenes[0].duration = subtitles[0].duration || 10;
  console.log('subtitles[0].duration:', subtitles[0].duration);

  // Step 4: Generate subtitle file
  await generateSubtitles(scenes, request.userId, timestamp, subtitles);

  // generate video effect
  await generateVideoEffects(scenes, request.userId, timestamp);

  const manifestScene = createManifestScene(
    scenes[0],
    request.userId,
    timestamp,
  );

  // Set the sceneIndex to the position where the scene should be inserted
  manifestScene.sceneIndex = sceneIndex;

  // update manifest
  await addSceneToManifest(manifest, manifestScene);

  // hydrate manifest
  const manifestHydrated = await hydrateManifest(manifest);

  broadcastProgress('preview_completed', request.userId, timestamp, {
    manifest: manifestHydrated,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Scene created successfully',
    }),
  };
}
