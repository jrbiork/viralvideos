import { Scene } from '../narration';
import { uploadToS3, uploadJsonToS3, getObjectFromS3 } from './s3Uploader';
import { Manifest, ManifestScene } from '../../types/s3Types';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const VIDEO_PARTS_BUCKET_NAME = process.env.VIDEO_PARTS_BUCKET_NAME || '';

export async function createManifest(
  userId: string,
  timestamp: string,
  scenes: Scene[],
  totalDuration: number,
): Promise<string> {
  try {
    const prefix = `${userId}/${timestamp}.scene-`;
    const currentTime = Date.now().toString();

    const manifest: Manifest = {
      schemaVersion: 1,
      userId,
      timestamp,
      bucket: VIDEO_PARTS_BUCKET_NAME,
      prefix,
      generatedAt: timestamp,
      updatedAt: currentTime,
      sceneCount: scenes.length,
      scenes: scenes.map((scene, index) => ({
        sceneIndex: scene.id,
        files: {
          mp3: `${userId}/${timestamp}.scene-${scene.id}.mp3`,
          mp4: `${userId}/${timestamp}.scene-${scene.id}.mp4`,
          combined: `${userId}/${timestamp}.scene-${scene.id}-combined.mp4`,
          jpg: `${userId}/${timestamp}.scene-${scene.id}.jpg`,
          subtitle: `${userId}/${timestamp}.scene-${scene.id}.subtitle.json`,
          ass: `${userId}/${timestamp}.scene-${scene.id}.ass`,
        },
      })),
      totalDuration,
      finalVideoUrl: `${userId}/${timestamp}.final-video.mp4`,
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

  return updatedManifest;
}

// create a function to hydrate scenes from manifest
// it will add pre sign url to the scenes .jpg, .mp3, .mp4
// and download the content of .ass, .subtitle.json files
export async function hydrateManifest(
  manifest: Manifest | null,
): Promise<Manifest | null> {
  if (!manifest) {
    return null;
  }

  const scenes: ManifestScene[] = [];

  const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  const expiresIn = 3600; // 1 hour
  const bucketName = VIDEO_PARTS_BUCKET_NAME;

  for (const scene of manifest.scenes) {
    const files = scene.files;

    const [audioUrl, videoUrl, imageUrl, subtitleContent, assContent] =
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
        getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucketName, Key: files.mp4 }),
          {
            expiresIn,
          },
        ),
        getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucketName, Key: files.jpg }),
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
          .catch(() => ''),
        // Fetch inline .ass content
        s3
          .send(new GetObjectCommand({ Bucket: bucketName, Key: files.ass }))
          .then(async (assObj) => {
            return (await assObj.Body?.transformToString()) || null;
          })
          .catch(() => null),
      ]);

    // create a scene object
    const sceneObject: ManifestScene = {
      sceneIndex: scene.sceneIndex,
      files: {
        mp3: audioUrl,
        mp4: videoUrl,
        jpg: imageUrl,
        ass: assContent || '',
        subtitle: subtitleContent || '',
      },
    };

    scenes.push(sceneObject);
  }

  return {
    ...manifest,
    scenes,
  };
}
