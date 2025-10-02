import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getObjectFromS3 } from '../utils/s3Uploader';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

export interface SubtitleWord {
  word: string;
  start: number;
  end: number;
}

export interface SubtitleData {
  scenePosition: number;
  words: SubtitleWord[];
  fullText: string;
}

export interface NarrationResult {
  audioKeys: string[];
  subtitles: SubtitleData[];
  narrationUrls: Array<{ [key: string]: string }>; // Format: [{ "timestamp.scene-id.mp3": "signed-url" }]
}

export async function fetchAudioFilesForTimestamp(
  userId: string,
  timestamp: string,
): Promise<NarrationResult> {
  try {
    console.log(
      `🔍 Fetching audio files for user: ${userId}, timestamp: ${timestamp}`,
    );

    // List all audio files for this timestamp
    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
      Prefix: `${userId}/${timestamp}.scene-`,
    });

    const response = await s3.send(listCommand);

    if (!response.Contents || response.Contents.length === 0) {
      console.log('📭 No audio files found for the given timestamp');
      return { audioKeys: [], subtitles: [], narrationUrls: [] };
    }

    // Filter for audio files and sort by scene number
    const audioObjects = response.Contents.filter((obj) =>
      obj.Key?.endsWith('.mp3'),
    ).sort((a, b) => {
      const sceneA = parseInt(a.Key?.split('scene-')[1]?.split('.')[0] || '0');
      const sceneB = parseInt(b.Key?.split('scene-')[1]?.split('.')[0] || '0');
      return sceneA - sceneB;
    });

    console.log(
      `✅ Found ${audioObjects.length} audio files:`,
      audioObjects.map((obj) => obj.Key),
    );

    const audioKeys: string[] = [];
    const subtitles: SubtitleData[] = [];

    // Process each audio file
    for (const audioObj of audioObjects) {
      if (!audioObj.Key) continue;

      const audioKey = audioObj.Key;
      audioKeys.push(audioKey);

      // Extract scene index from the key
      const sceneMatch = audioKey.match(/scene-(\d+)\.mp3$/);
      const scenePosition = sceneMatch ? parseInt(sceneMatch[1]) : 0;

      // Try to fetch subtitle data if it exists
      const subtitleKey = audioKey.replace('.mp3', '.subtitle.json');

      try {
        const subtitleCommand = new GetObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: subtitleKey,
        });

        const subtitleResponse = await s3.send(subtitleCommand);

        if (subtitleResponse.Body) {
          const subtitleContent =
            await subtitleResponse.Body.transformToString();
          const subtitleData = JSON.parse(subtitleContent);

          subtitles.push({
            scenePosition,
            words: subtitleData.words || [],
            fullText: subtitleData.text || '', // Use 'text' field from Whisper transcription
          });

          console.log(`✅ Found subtitle data for scene ${scenePosition}`);
        }
      } catch (error) {
        console.log(
          `⚠️ No subtitle data found for scene ${scenePosition}, creating fallback`,
        );

        // Create fallback subtitle data
        subtitles.push({
          scenePosition,
          words: [],
          fullText: '',
        });
      }
    }

    // Generate signed URLs for all audio files with filename mapping
    const narrationUrls = await Promise.all(
      audioKeys.map(async (audioKey) => {
        const signedUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: audioKey,
          }),
          { expiresIn: 36000 }, // 10 hours expiration
        );

        // Extract filename without user prefix (e.g., "1004.scene-1.mp3")
        const filename = audioKey.replace(`${userId}/`, '');

        return { [filename]: signedUrl };
      }),
    );

    console.log(
      `✅ Fetched ${audioKeys.length} audio files and ${subtitles.length} subtitle sets`,
    );

    return { audioKeys, subtitles, narrationUrls };
  } catch (error) {
    console.error('❌ Error fetching audio files from S3:', error);
    return { audioKeys: [], subtitles: [], narrationUrls: [] };
  }
}

export async function getAudioSignedUrl(
  audioKey: string,
): Promise<string | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
      Key: audioKey,
    });

    return await getSignedUrl(s3, command, { expiresIn: 36000 });
  } catch (error) {
    console.error(`❌ Error getting signed URL for ${audioKey}:`, error);
    return null;
  }
}

export async function checkAudioCaptionExists(
  userId: string,
  timestamp: string,
): Promise<boolean> {
  try {
    const bucket = process.env.VIDEO_PARTS_BUCKET_NAME;

    if (!bucket) {
      throw new Error('VIDEO_PARTS_BUCKET_NAME not set');
    }

    // Get the manifest to check how many scenes we have
    const manifestKey = `${userId}/${timestamp}.manifest.json`;
    const manifest = await getObjectFromS3(manifestKey, bucket);

    if (!manifest || !manifest.scenes) {
      console.log('No manifest found, files do not exist');
      return false;
    }

    const scenes = manifest.scenes;
    const fileChecks: Promise<boolean>[] = [];

    // Check for each scene: .mp3, .subtitle.json, and .ass files
    for (const scene of scenes) {
      const sceneId = scene.scenePosition;

      // Check .mp3 file
      const mp3Key = `${userId}/${timestamp}.scene-${sceneId}.mp3`;
      fileChecks.push(checkFileExists(mp3Key, bucket));

      // Check .subtitle.json file
      const subtitleKey = `${userId}/${timestamp}.scene-${sceneId}.subtitle.json`;
      fileChecks.push(checkFileExists(subtitleKey, bucket));

      // Check .ass file
      const assKey = `${userId}/${timestamp}.scene-${sceneId}.ass`;
      fileChecks.push(checkFileExists(assKey, bucket));
    }

    // Wait for all file checks to complete
    const results = await Promise.all(fileChecks);

    // All files must exist
    const allFilesExist = results.every((exists) => exists);

    console.log(
      `File existence check for ${scenes.length} scenes: ${
        allFilesExist ? 'All files exist' : 'Some files missing'
      }`,
    );

    return allFilesExist;
  } catch (error) {
    console.error('Error checking file existence:', error);
    return false;
  }
}

async function checkFileExists(key: string, bucket: string): Promise<boolean> {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    return true;
  } catch (error) {
    // If the object doesn't exist, HeadObjectCommand will throw an error
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'NoSuchKey'
    ) {
      return false;
    }
    console.error(`Error checking file existence for ${key}:`, error);
    return false;
  }
}
