import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Scene, SubtitleData } from './narration';

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function generateSubtitles(
  scenes: Scene[],
  userId: string,
  timestamp: string,
  subtitleData?: SubtitleData[],
): Promise<string[]> {
  console.log('📝 Generating subtitles from scenes...');
  try {
    const subtitleKeys: string[] = [];
    let currentTime = 0;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      console.log(`📝 Generating subtitle for scene ${i}:`, scene.narration);

      let srtContent: string;

      if (subtitleData && subtitleData[i]) {
        // Use word-level timestamps if available
        srtContent = createWordLevelSRTSubtitle(
          i + 1,
          currentTime,
          subtitleData[i],
        );
      } else {
        // Fallback to scene-level subtitle
        srtContent = createSRTSubtitle(
          i + 1,
          currentTime,
          scene.duration,
          scene.narration,
        );
      }

      // Create ASS format directly for better FFmpeg compatibility
      const assContent = convertSRTtoASS(srtContent);
      const assSubtitleBuffer = Buffer.from(assContent, 'utf-8');
      console.log(
        `✅ Generated ASS subtitle for scene ${i}, size: ${assSubtitleBuffer.length} bytes`,
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

function createWordLevelSRTSubtitle(
  index: number,
  sceneStartTime: number,
  subtitleData: SubtitleData,
): string {
  let srtContent = '';
  let subtitleIndex = 1;

  // Group words into phrases for better readability
  const phrases = groupWordsIntoPhrases(subtitleData.words);

  for (const phrase of phrases) {
    const startTime = sceneStartTime + phrase.start;
    const endTime = sceneStartTime + phrase.end;

    srtContent += `${subtitleIndex}\n`;
    srtContent += `${formatTime(startTime)} --> ${formatTime(endTime)}\n`;
    srtContent += `${phrase.text}\n\n`;

    subtitleIndex++;
  }

  return srtContent;
}

function groupWordsIntoPhrases(
  words: { word: string; start: number; end: number }[],
): Array<{ text: string; start: number; end: number }> {
  const phrases: Array<{ text: string; start: number; end: number }> = [];
  let currentPhrase: string[] = [];
  let phraseStart = 0;
  let phraseEnd = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    if (currentPhrase.length === 0) {
      phraseStart = word.start;
    }

    currentPhrase.push(word.word);
    phraseEnd = word.end;

    // End phrase on punctuation or after 3-4 words
    const shouldEndPhrase =
      word.word.match(/[.!?]$/) ||
      currentPhrase.length >= 4 ||
      i === words.length - 1;

    if (shouldEndPhrase) {
      phrases.push({
        text: currentPhrase.join(' '),
        start: phraseStart,
        end: phraseEnd,
      });
      currentPhrase = [];
    }
  }

  return phrases;
}

function createSRTSubtitle(
  index: number,
  startTime: number,
  duration: number,
  text: string,
): string {
  const startTimeFormatted = formatTime(startTime);
  const endTimeFormatted = formatTime(startTime + duration);

  return `${index}\n${startTimeFormatted} --> ${endTimeFormatted}\n${text}\n\n`;
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds
    .toString()
    .padStart(3, '0')}`;
}

function convertSRTtoASS(srtContent: string): string {
  // Simple SRT to ASS conversion
  const lines = srtContent.split('\n');
  let assContent = '[Script Info]\n';
  assContent += 'Title: Generated Subtitles\n';
  assContent += 'ScriptType: v4.00+\n';
  assContent += 'WrapStyle: 1\n';
  assContent += 'ScaledBorderAndShadow: yes\n';
  assContent += 'YCbCr Matrix: None\n\n';
  assContent += '[V4+ Styles]\n';
  assContent +=
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n';
  assContent +=
    'Style: Default,Arial,24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1\n\n';
  assContent += '[Events]\n';
  assContent +=
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';

  for (let i = 0; i < lines.length; i += 4) {
    if (lines[i] && lines[i + 1] && lines[i + 2]) {
      const timeLine = lines[i + 1];
      const textLine = lines[i + 2];

      const timeMatch = timeLine.match(
        /(\d{2}:\d{2}:\d{2}),(\d{3}) --> (\d{2}:\d{2}:\d{2}),(\d{3})/,
      );
      if (timeMatch) {
        const startTime = timeMatch[1] + '.' + timeMatch[2].padStart(2, '0');
        const endTime = timeMatch[3] + '.' + timeMatch[4].padStart(2, '0');
        assContent += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${textLine}\n`;
      }
    }
  }

  return assContent;
}
