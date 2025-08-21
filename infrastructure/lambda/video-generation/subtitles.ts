import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Scene, SubtitleData } from './narration';
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
  console.log('📝 Generating ASS subtitles with word-timed karaoke...');
  try {
    const subtitleKeys: string[] = [];
    let currentTime = 0;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      let assContent: string;

      // Check if we have word-level subtitle data for this scene
      console.log(
        `🔍 Looking for subtitle data for scene ${i}, available data:`,
        subtitleData?.map((d) => ({
          sceneIndex: d.sceneIndex,
          wordsCount: d.words.length,
        })),
      );
      const sceneSubtitleData = subtitleData?.find(
        (data) => data.sceneIndex === i,
      );

      if (sceneSubtitleData && sceneSubtitleData.words.length > 0) {
        // Use word-timed karaoke subtitle
        console.log(
          `🎤 Creating word-timed karaoke subtitle for scene ${i} with ${sceneSubtitleData.words.length} words`,
        );
        console.log(
          `🎤 Scene ${i} (ID: ${scene.id}) - currentTime: ${currentTime}, duration: ${scene.duration}`,
        );
        // For scene-by-scene combination, we need scene-relative timings (starting from 0)
        // instead of absolute timings (relative to the start of the entire video)
        assContent = createWordTimedKaraokeASSSubtitle(
          sceneSubtitleData.words,
          0, // Start from 0 for each scene
        );
      } else {
        // Fallback to simple subtitle
        console.log(
          `📝 Creating simple subtitle for scene ${i} (no word data available)`,
        );
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
      console.log(
        `🔍 Scene ${i} completed. Duration: ${scene.duration}s, currentTime before increment: ${currentTime}`,
      );
      currentTime += scene.duration;
      console.log(
        `🔍 Scene ${i} completed. currentTime after increment: ${currentTime}`,
      );
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
