import { Scene } from '../narration';
import { uploadToS3, uploadJsonToS3 } from './s3Uploader';

interface ManifestFile {
  mp3: string;
  mp4: string;
  combined: string;
  jpg: string;
  subtitle: string;
  ass: string;
}

interface ManifestScene {
  sceneIndex: number;
  files: ManifestFile;
}

interface VideoManifest {
  schemaVersion: number;
  userId: string;
  bucket: string;
  prefix: string;
  generatedAt: string;
  updatedAt: string;
  sceneCount: number;
  scenes: ManifestScene[];
}

export async function createManifest(
  userId: string,
  timestamp: string,
  scenes: Scene[],
): Promise<string> {
  try {
    const bucketName = process.env.VIDEO_PARTS_BUCKET_NAME || '';
    const prefix = `${userId}/${timestamp}.scene-`;
    const currentTime = Date.now().toString();

    const manifest: VideoManifest = {
      schemaVersion: 1,
      userId,
      bucket: bucketName,
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
): Promise<VideoManifest | null> {
  try {
    const { getObjectFromS3 } = await import('./s3Uploader');
    const manifestKey = `${userId}/${timestamp}.manifest.json`;

    const manifestData = await getObjectFromS3(manifestKey);
    if (!manifestData) {
      return null;
    }

    return JSON.parse(manifestData) as VideoManifest;
  } catch (error) {
    console.error('❌ Error getting manifest:', error);
    return null;
  }
}

export async function updateManifest(
  userId: string,
  timestamp: string,
  updates: Partial<VideoManifest>,
): Promise<string> {
  try {
    // Get existing manifest
    const existingManifest = await getManifest(userId, timestamp);
    if (!existingManifest) {
      throw new Error('Manifest not found');
    }

    // Update manifest
    const updatedManifest: VideoManifest = {
      ...existingManifest,
      ...updates,
      updatedAt: Date.now().toString(),
    };

    // Convert to JSON and upload
    const manifestJson = JSON.stringify(updatedManifest, null, 2);
    const manifestKey = `${userId}/${timestamp}.manifest.json`;
    const manifestUrl = await uploadJsonToS3(manifestJson, manifestKey);

    console.log('📋 Manifest updated and uploaded');
    return manifestUrl;
  } catch (error) {
    console.error('❌ Error updating manifest:', error);
    throw new Error(`Failed to update manifest: ${error}`);
  }
}
