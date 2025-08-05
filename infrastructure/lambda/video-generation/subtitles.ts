import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Scene, SubtitleData } from './narration';
import { formatASSTime, createASSStyleHeader } from './util/assUtils';

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function generateSubtitles(
  scenes: Scene[],
  userId: string,
  timestamp: string,
  subtitleData?: SubtitleData[],
): Promise<string[]> {
  console.log('📝 Generating simple ASS subtitles (no karaoke)...');
  try {
    const subtitleKeys: string[] = [];
    let currentTime = 0;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];

      // For testing: Always use simple ASS subtitle (skip karaoke)
      const assContent = createSimpleASSSubtitle(
        i + 1,
        currentTime,
        scene.duration,
        scene.narration,
      );

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
