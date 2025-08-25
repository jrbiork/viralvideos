import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Scene } from './script';
import { SubtitleData } from './audio';
import {
  formatASSTime,
  createASSStyleHeader,
  createWordTimedKaraokeASSSubtitle,
  SubtitleWord,
} from './util/assUtils';

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function generateSubtitles(
  scenes: Scene[],
  userId: string,
  timestamp: string,
  subtitleData?: SubtitleData[],
): Promise<string[]> {
  try {
    const subtitleKeys: string[] = [];
    let currentTime = 0;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      let assContent: string;

      // Check if we have word-level subtitle data for this scene
      const sceneSubtitleData = subtitleData?.find(
        (data) => data.sceneIndex === i,
      );

      if (sceneSubtitleData && sceneSubtitleData.words.length > 0) {
        // Use word-timed karaoke subtitle
        // For scene-by-scene combination, we need scene-relative timings (starting from 0)
        // instead of absolute timings (relative to the start of the entire video)
        assContent = createWordTimedKaraokeASSSubtitle(
          sceneSubtitleData.words,
          0, // Start from 0 for each scene
        );
      } else {
        // Fallback to simple subtitle
        // For scene-by-scene combination, we need scene-relative timings
        assContent = createSimpleASSSubtitle(
          i + 1,
          0, // Start from 0 for each scene
          scene.duration,
          scene.narration,
        );
      }

      // Use ASS format directly
      const assSubtitleBuffer = Buffer.from(assContent, 'utf-8');

      // Save ASS to S3 with timestamp prefix using scene.id
      const assSubtitleKey = `${userId}/${timestamp}.scene-${scene.id}.ass`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: assSubtitleKey,
          Body: assSubtitleBuffer,
          ContentType: 'text/plain',
        }),
      );

      subtitleKeys.push(assSubtitleKey);
      currentTime += scene.duration;
    }

    return subtitleKeys;
  } catch (error) {
    console.error('❌ Error in generateSubtitles:', error);
    throw error;
  }
}

function createSimpleASSSubtitle(
  index: number,
  startTime: number,
  duration: number,
  text: string,
): string {
  const assContent = createASSStyleHeader();

  const startTimeFormatted = formatASSTime(startTime);
  const endTimeFormatted = formatASSTime(startTime + duration);

  // Use the actual scene text instead of just the description
  const subtitleText = text || `Scene ${index + 1}`;

  return (
    assContent +
    `Dialogue: 0,${startTimeFormatted},${endTimeFormatted},Default,,0,0,0,,${subtitleText}\n`
  );
}
