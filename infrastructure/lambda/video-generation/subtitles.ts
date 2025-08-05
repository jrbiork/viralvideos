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
      const sceneSubtitleData = subtitleData?.find(
        (data) => data.sceneIndex === i,
      );

      if (sceneSubtitleData && sceneSubtitleData.words.length > 0) {
        // Use word-timed karaoke subtitle
        console.log(
          `🎤 Creating word-timed karaoke subtitle for scene ${i} with ${sceneSubtitleData.words.length} words`,
        );
        assContent = createWordTimedKaraokeASSSubtitle(
          sceneSubtitleData.words,
          currentTime,
        );
      } else {
        // Fallback to simple subtitle
        console.log(
          `📝 Creating simple subtitle for scene ${i} (no word data available)`,
        );
        assContent = createSimpleASSSubtitle(
          i + 1,
          currentTime,
          scene.duration,
          scene.narration,
        );
      }

      // Use ASS format directly
      const assSubtitleBuffer = Buffer.from(assContent, 'utf-8');

      // Save ASS to S3 with timestamp prefix
      const assSubtitleKey = `${userId}/${timestamp}.scene-${i}.ass`;

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
