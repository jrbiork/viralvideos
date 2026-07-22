import { Scene } from './script';
import { uploadJsonToS3, getObjectFromS3 } from './s3Uploader';
import { Manifest, ManifestScene } from '../types/s3Types';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { listExistingSceneMp4Keys } from './videoEffects';

const VIDEO_PARTS_BUCKET_NAME = process.env.VIDEO_PARTS_BUCKET_NAME || '';

export async function createManifest(
  userId: string,
  timestamp: string,
  scenes: Scene[],
  totalDuration: number,
  voiceToneInstruction: string,
  voice: string,
  language: string,
  template: string,
): Promise<string> {
  try {
    const prefix = `${userId}/${timestamp}.scene-`;
    const currentTime = Date.now().toString();

    const manifest: Manifest = {
      schemaVersion: 1,
      size: '0',
      key: `${userId}/${timestamp}.manifest.json`,
      userId,
      timestamp,
      bucket: VIDEO_PARTS_BUCKET_NAME,
      prefix,
      generatedAt: timestamp,
      updatedAt: currentTime,
      sceneCount: scenes.length,
      voiceToneInstruction,
      voice,
      language,
      template,
      scenes: scenes.map((scene, index) => ({
        id: scene.id,
        scenePosition: scene.id,
        removed: false,
        animated: false,
        files: {
          mp3: `${userId}/${timestamp}.scene-${scene.id}.mp3`,
          mp4: `${userId}/${timestamp}.scene-${scene.id}.mp4`,
          combined: `${userId}/${timestamp}.scene-${scene.id}-combined.mp4`,
          png: `${userId}/${timestamp}.scene-${scene.id}.png`,
          subtitle: `${userId}/${timestamp}.scene-${scene.id}.subtitle.json`,
          ass: `${userId}/${timestamp}.scene-${scene.id}.ass`,
          duration: scene.duration,
        },
      })),
      totalDuration,
      finalVideoUrl: '',
      videoGenerated: false,
      isCombining: false,
    };

    // Convert manifest to JSON string
    const manifestJson = JSON.stringify(manifest, null, 2);

    // Upload manifest to S3
    const manifestKey = `${userId}/${timestamp}.manifest.json`;
    const manifestUrl = await uploadJsonToS3(manifestJson, manifestKey);

    console.log('📋 Manifest created and uploaded:', manifestKey);
    console.log('📋 Manifest URL:', manifestUrl);

    return manifestUrl;
  } catch (error) {
    console.error('❌ Error creating manifest:', error);
    throw new Error(`Failed to create manifest: ${error}`);
  }
}

export async function getManifest(
  userId: string,
  timestamp: string,
): Promise<Manifest | null> {
  try {
    const manifestKey = `${userId}/${timestamp}.manifest.json`;

    const manifestData = await getObjectFromS3(manifestKey);
    if (!manifestData) {
      return null;
    }

    // getObjectFromS3 already parses JSON, so we can return it directly
    return manifestData as Manifest;
  } catch (error) {
    console.error('❌ Error getting manifest:', error);
    return null;
  }
}

export async function updateManifest(
  existingManifest: Manifest,
  updates: Partial<Manifest>,
): Promise<Manifest> {
  const updatedManifest: Manifest = {
    ...existingManifest,
    ...updates,
    updatedAt: Date.now().toString(),
  };
  await uploadJsonToS3(JSON.stringify(updatedManifest), existingManifest.key);

  return updatedManifest;
}

// create a new update manifest that will receive manifest key and a new scene object
export async function addSceneToManifest(
  existingManifest: Manifest,
  scene: ManifestScene,
): Promise<Manifest> {
  // Create a copy of existing scenes
  const updatedScenes = [...existingManifest.scenes];

  // Insert the new scene at the correct position based on scenePosition
  updatedScenes.splice(scene.scenePosition, 0, scene);

  // bump up scenePosition for all subsequent scenes
  for (let i = scene.scenePosition + 1; i < updatedScenes.length; i++) {
    updatedScenes[i].scenePosition++;
  }

  // recalculate total duration from all scenes
  const totalDuration = updatedScenes.reduce(
    (acc, scene) => acc + scene.files.duration,
    0,
  );

  const updatedManifest: Manifest = {
    ...existingManifest,
    scenes: updatedScenes,
    sceneCount: updatedScenes.length,
    updatedAt: Date.now().toString(),
    totalDuration,
  };

  await uploadJsonToS3(JSON.stringify(updatedManifest), existingManifest.key);
  return updatedManifest;
}

// create a function to create a single manifest scene from a Scene object
export function createManifestScene(
  scene: Scene,
  userId: string,
  timestamp: string,
  scenePosition: number,
): ManifestScene {
  return {
    scenePosition: scenePosition,
    removed: false,
    id: scene.id,
    animated: scene.animated || false,
    animationPrompt: scene.animationPrompt,
    files: {
      mp3: `${userId}/${timestamp}.scene-${scene.id}.mp3`,
      mp4: `${userId}/${timestamp}.scene-${scene.id}.mp4`,
      combined: `${userId}/${timestamp}.scene-${scene.id}-combined.mp4`,
      png: `${userId}/${timestamp}.scene-${scene.id}.png`,
      subtitle: `${userId}/${timestamp}.scene-${scene.id}.subtitle.json`,
      ass: `${userId}/${timestamp}.scene-${scene.id}.ass`,
      duration: scene.duration,
    },
  };
}

// create a function to hydrate scenes from manifest
// it will add pre sign url to the scenes .png, .mp3, .mp4
// and download the content of .ass, .subtitle.json files
export async function hydrateManifest(
  manifest: Manifest | null,
): Promise<Manifest | null> {
  if (!manifest) {
    return null;
  }

  const scenes: ManifestScene[] = [];

  const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  const expiresIn = 36000;
  const bucketVideoName = process.env.VIDEO_BUCKET_NAME || '';
  const bucketName = VIDEO_PARTS_BUCKET_NAME;

  // getSignedUrl never checks object existence — it's pure crypto-signing.
  // A scene's files.mp4 key is written to the manifest as soon as the video
  // is *planned* (createManifest/createManifestScene), long before the
  // Ken-Burns effect actually uploads that object. Without this check, every
  // manifest sent to the frontend before that upload finishes would carry a
  // plausible-looking but 404 mp4 URL. List which mp4s truly exist once
  // (single S3 call for all scenes) so we can omit signed URLs for the rest.
  const existingMp4Keys = await listExistingSceneMp4Keys(
    manifest.userId,
    manifest.timestamp,
  );

  for (const scene of manifest.scenes) {
    const files = scene.files;

    // Validate required file keys before making S3 requests
    console.log(`🔍 Hydrating scene ${scene.scenePosition}, files:`, files);

    const [audioUrl, videoUrl, combinedUrl, imageUrl, subtitleContent, assContent] =
      await Promise.all([
        getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: bucketName,
            Key: files.mp3,
          }),
          {
            expiresIn,
          },
        ),
        existingMp4Keys.has(files.mp4)
          ? getSignedUrl(
              s3,
              new GetObjectCommand({ Bucket: bucketName, Key: files.mp4 }),
              {
                expiresIn,
              },
            )
          : Promise.resolve(''),
        // The per-scene "-combined.mp4" (narration-length, subtitle-baked,
        // animation-looped) only exists after the video has been exported at
        // least once via combineVideoAndAudio — sign it when present so the
        // editor preview can show the real, full-duration clip instead of
        // the raw (5s, for animated scenes) source video.
        files.combined && existingMp4Keys.has(files.combined)
          ? getSignedUrl(
              s3,
              new GetObjectCommand({ Bucket: bucketName, Key: files.combined }),
              {
                expiresIn,
              },
            )
          : Promise.resolve(''),
        getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: bucketName,
            Key: files.png || files.jpg,
          }),
          {
            expiresIn,
          },
        ),
        // Fetch inline subtitle.json content
        s3
          .send(
            new GetObjectCommand({ Bucket: bucketName, Key: files.subtitle }),
          )
          .then(async (subtitleObj) => {
            const subtitleText = await subtitleObj.Body?.transformToString();
            try {
              const parsedSubtitle = JSON.parse(subtitleText || '{}');
              return parsedSubtitle.fullText || '';
            } catch {
              return '';
            }
          })
          .catch((error) => {
            console.warn(
              `⚠️ Failed to fetch subtitle for scene ${scene.scenePosition}:`,
              error.message,
            );
            return '';
          }),
        // Fetch inline .ass content
        s3
          .send(new GetObjectCommand({ Bucket: bucketName, Key: files.ass }))
          .then(async (assObj) => {
            return (await assObj.Body?.transformToString()) || null;
          })
          .catch((error) => {
            console.warn(
              `⚠️ Failed to fetch ass for scene ${scene.scenePosition}:`,
              error.message,
            );
            return null;
          }),
      ]);

    // create a scene object
    const sceneObject: ManifestScene = {
      scenePosition: scene.scenePosition,
      id: scene.id,
      removed: scene.removed || false,
      animated: scene.animated || false,
      animationPrompt: scene.animationPrompt,
      files: {
        mp3: audioUrl,
        mp4: videoUrl,
        combined: combinedUrl,
        jpg: imageUrl,
        png: imageUrl,
        ass: assContent || '',
        subtitle: subtitleContent || '',
        duration: scene.files.duration,
      },
    };

    scenes.push(sceneObject);
  }

  return {
    ...manifest,
    scenes,
  };
}
