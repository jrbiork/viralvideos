import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

export interface SubtitleWord {
  word: string;
  start: number;
  end: number;
}

export interface SubtitleData {
  sceneIndex: number;
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
      const sceneIndex = sceneMatch ? parseInt(sceneMatch[1]) : 0;

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
            sceneIndex,
            words: subtitleData.words || [],
            fullText: subtitleData.text || '', // Use 'text' field from Whisper transcription
          });

          console.log(`✅ Found subtitle data for scene ${sceneIndex}`);
        }
      } catch (error) {
        console.log(
          `⚠️ No subtitle data found for scene ${sceneIndex}, creating fallback`,
        );

        // Create fallback subtitle data
        subtitles.push({
          sceneIndex,
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

    return await getSignedUrl(s3, command, { expiresIn: 3600 });
  } catch (error) {
    console.error(`❌ Error getting signed URL for ${audioKey}:`, error);
    return null;
  }
}
