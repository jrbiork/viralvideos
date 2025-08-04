import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Scene, SubtitleData } from './narration';

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
      console.log(
        `📝 Generating ASS subtitle for scene ${i}:`,
        scene.narration,
      );

      // For testing: Always use simple ASS subtitle (skip karaoke)
      const assContent = createSimpleASSSubtitle(
        i + 1,
        currentTime,
        scene.duration,
        scene.narration,
      );

      // Use ASS format directly
      const assSubtitleBuffer = Buffer.from(assContent, 'utf-8');
      console.log(
        `✅ Generated ASS subtitle for scene ${i}, size: ${assSubtitleBuffer.length} bytes`,
      );

      // Debug: Log the ASS content for verification
      console.log(
        '📄 Generated ASS content preview:',
        assContent.substring(0, 300),
      );
      console.log(
        '🔍 ASS contains Dialogue entries:',
        (assContent.match(/Dialogue:/g) || []).length,
      );

      // Save ASS to S3 with timestamp prefix
      const assSubtitleKey = `${userId}/${timestamp}.scene-${i}.ass`;
      console.log(
        `☁️ Uploading ASS subtitle to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${assSubtitleKey}`,
      );

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: assSubtitleKey,
          Body: assSubtitleBuffer,
          ContentType: 'text/plain',
        }),
      );
      console.log(`✅ Uploaded ASS subtitle to S3: ${assSubtitleKey}`);

      subtitleKeys.push(assSubtitleKey);
      currentTime += scene.duration;
    }

    return subtitleKeys;
  } catch (error) {
    console.error('❌ Error in generateSubtitles:', error);
    throw error;
  }
}

function createKaraokeASSSubtitle(
  index: number,
  sceneStartTime: number,
  subtitleData: SubtitleData,
): string {
  const assContent = createASSStyleHeader();
  const words = subtitleData.words;

  const firstWordStart = sceneStartTime + words[0].start;
  const lastWordEnd = sceneStartTime + words[words.length - 1].end;

  const startTimeFormatted = formatASSTime(firstWordStart);
  const endTimeFormatted = formatASSTime(lastWordEnd);

  const karaokeText = words
    .map((w) => `{\\k${Math.round((w.end - w.start) * 100)}}${w.word}`)
    .join(' ');

  return (
    assContent +
    `Dialogue: 0,${startTimeFormatted},${endTimeFormatted},Default,,0,0,0,,${karaokeText}\n`
  );
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

function createASSStyleHeader(
  opts: {
    fontName?: string;
    fontSize?: number;
    primaryColor?: string;
    outlineColor?: string;
  } = {},
): string {
  const {
    fontName = 'LiberationSans',
    fontSize = 72,
    primaryColor = '&H00FFFFFF',
    outlineColor = '&H00000000',
  } = opts;
  return `[Script Info]
Title: Test
ScriptType: v4.00+
WrapStyle: 1
ScaledBorderAndShadow: yes
YCbCr Matrix: None
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${primaryColor},${outlineColor},&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

function formatASSTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centis = Math.round((seconds % 1) * 100);
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}
