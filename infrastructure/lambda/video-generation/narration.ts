import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import OpenAI from 'openai';
const ffmpeg = require('fluent-ffmpeg');

const s3 = new S3Client({ region: process.env.AWS_REGION });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface Scene {
  description: string;
  duration: number;
  narration: string;
}

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
}

/**
 * Adjusts audio duration to match target duration using FFmpeg
 * @param audioBuffer - The original audio buffer
 * @param targetDuration - The target duration in seconds
 * @returns Promise<Buffer> - The adjusted audio buffer
 */
async function adjustAudioDuration(
  audioBuffer: Buffer,
  targetDuration: number,
): Promise<Buffer> {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  // Write original audio to temp file
  const tempInputPath = path.join(
    os.tmpdir(),
    `original-audio-${Date.now()}.mp3`,
  );
  const tempOutputPath = path.join(
    os.tmpdir(),
    `adjusted-audio-${Date.now()}.mp3`,
  );

  fs.writeFileSync(tempInputPath, audioBuffer);

  try {
    // Get original audio duration
    const durationResult = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(tempInputPath, (err: any, metadata: any) => {
        if (err) {
          console.error('❌ Error getting audio duration:', err);
          reject(err);
        } else {
          const duration = metadata.format.duration || 0;
          console.log(`📊 Original audio duration: ${duration}s`);
          resolve(duration);
        }
      });
    });

    console.log(
      `📊 Original audio duration: ${durationResult}s, Target: ${targetDuration}s`,
    );

    // If duration is very close to target, return original
    if (Math.abs(durationResult - targetDuration) < 0.1) {
      console.log(
        '✅ Audio duration is already close to target, no adjustment needed',
      );
      return audioBuffer;
    }

    // Calculate speed factor
    const speedFactor = durationResult / targetDuration;
    console.log(`⚡ Speed factor: ${speedFactor.toFixed(3)}`);

    // FFmpeg atempo filter has limits (0.5 to 2.0)
    // For extreme cases, we need to use multiple passes
    let finalSpeedFactor = Math.min(Math.max(speedFactor, 0.5), 2.0);
    let remainingFactor = speedFactor / finalSpeedFactor;
    let audioFilters: string[] = [];

    // Handle cases where speed factor is outside FFmpeg limits
    if (speedFactor < 0.5) {
      // Need to slow down - use multiple atempo filters
      let currentFactor = speedFactor;
      while (currentFactor < 0.5) {
        audioFilters.push('atempo=0.5');
        currentFactor = currentFactor / 0.5;
      }
      if (currentFactor > 1.0) {
        audioFilters.push(`atempo=${currentFactor}`);
      }
    } else if (speedFactor > 2.0) {
      // Need to speed up - use multiple atempo filters
      let currentFactor = speedFactor;
      while (currentFactor > 2.0) {
        audioFilters.push('atempo=2.0');
        currentFactor = currentFactor / 2.0;
      }
      if (currentFactor > 1.0) {
        audioFilters.push(`atempo=${currentFactor}`);
      }
    } else {
      // Within normal range
      audioFilters.push(`atempo=${speedFactor}`);
    }

    console.log(`🎵 Applying audio filters: ${audioFilters.join(',')}`);

    // Adjust audio speed using FFmpeg
    await new Promise<void>((resolve, reject) => {
      const ffmpegCommand = ffmpeg(tempInputPath);

      // Apply all audio filters
      audioFilters.forEach((filter) => {
        ffmpegCommand.audioFilters(filter);
      });

      ffmpegCommand
        .outputOptions(['-c:a', 'mp3', '-b:a', '128k'])
        .on('end', () => {
          console.log('✅ Audio speed adjustment completed');
          resolve();
        })
        .on('error', (err: any) => {
          console.error('❌ Audio speed adjustment error:', err);
          reject(err);
        })
        .save(tempOutputPath);
    });

    // Verify the adjusted duration
    const adjustedDuration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(tempOutputPath, (err: any, metadata: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata.format.duration || 0);
        }
      });
    });

    console.log(
      `✅ Adjusted audio duration: ${adjustedDuration}s (target: ${targetDuration}s)`,
    );

    // Read the adjusted audio
    const adjustedBuffer = fs.readFileSync(tempOutputPath);

    // If the adjustment didn't work well, fall back to original
    if (Math.abs(adjustedDuration - targetDuration) > 0.5) {
      console.warn(
        "⚠️ Audio adjustment didn't achieve target duration, using original",
      );
      return audioBuffer;
    }

    return adjustedBuffer;
  } catch (error) {
    console.error('❌ Error adjusting audio duration:', error);
    console.log('🔄 Falling back to original audio');
    return audioBuffer;
  } finally {
    // Clean up temp files
    try {
      if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
      if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
    } catch (error) {
      console.warn('⚠️ Could not clean up temp files:', error);
    }
  }
}

/**
 * Adjusts word timestamps based on speed factor
 * @param words - Original word timestamps
 * @param speedFactor - Speed factor used for audio adjustment
 * @returns Adjusted word timestamps
 */
function adjustWordTimestamps(
  words: SubtitleWord[],
  speedFactor: number,
): SubtitleWord[] {
  return words.map((word) => ({
    word: word.word,
    start: word.start / speedFactor,
    end: word.end / speedFactor,
  }));
}

/**
 * Estimates the duration of text when spoken at natural pace
 * @param text - The text to estimate duration for
 * @returns Estimated duration in seconds
 */
function estimateTextDuration(text: string): number {
  // Average speaking rate is about 150 words per minute (2.5 words per second)
  const words = text.split(' ').filter((word) => word.length > 0);
  const estimatedSeconds = words.length / 2.5;

  // Add some buffer for natural pauses and emphasis
  return Math.max(estimatedSeconds * 1.1, 1.0);
}

/**
 * Adjusts text to better fit target duration
 * @param text - Original text
 * @param targetDuration - Target duration in seconds
 * @returns Adjusted text that should fit better
 */
function adjustTextForDuration(text: string, targetDuration: number): string {
  const currentDuration = estimateTextDuration(text);

  if (Math.abs(currentDuration - targetDuration) < 0.5) {
    return text; // Close enough
  }

  if (currentDuration > targetDuration) {
    // Text is too long, need to shorten
    const words = text.split(' ');
    const targetWordCount = Math.floor(targetDuration * 2.5 * 0.9); // 90% of target to be safe

    if (words.length <= targetWordCount) {
      return text; // Can't shorten further
    }

    // Remove words from the end while keeping meaning
    const shortenedWords = words.slice(0, targetWordCount);
    return shortenedWords.join(' ').replace(/[,.!?]+$/, '') + '.';
  } else {
    // Text is too short, could add more but keep it natural
    return text;
  }
}

export async function generateNarration(
  scenes: Scene[],
  userId: string,
  timestamp: string,
): Promise<NarrationResult> {
  console.log(
    '🎤 Generating narration from scenes with word-level timestamps...',
  );
  try {
    const audioKeys: string[] = [];
    const subtitles: SubtitleData[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      console.log(`🎤 Generating narration for scene ${i}:`, scene.narration);

      // Generate speech with standard format
      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: scene.narration,
      });

      const originalAudioBuffer = Buffer.from(await response.arrayBuffer());
      console.log(
        `✅ Generated audio for scene ${i}, size: ${originalAudioBuffer.length} bytes`,
      );

      // Adjust audio duration to match target duration
      const adjustedAudioBuffer = await adjustAudioDuration(
        originalAudioBuffer,
        scene.duration,
      );

      // Save to S3 with timestamp prefix
      const audioKey = `${userId}/${timestamp}.scene-${i}.mp3`;
      console.log(
        `☁️ Uploading audio to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${audioKey}`,
      );

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: audioKey,
          Body: adjustedAudioBuffer,
          ContentType: 'audio/mpeg',
        }),
      );
      console.log(`✅ Uploaded audio to S3: ${audioKey}`);

      audioKeys.push(audioKey);

      // Get word-level timestamps using transcription
      console.log(
        `🎤 Transcribing audio for scene ${i} to get word timestamps...`,
      );

      // Write adjusted audio buffer to temporary file for transcription
      const fs = require('fs');
      const os = require('os');
      const path = require('path');

      const tempAudioPath = path.join(os.tmpdir(), `scene-${i}.mp3`);
      fs.writeFileSync(tempAudioPath, adjustedAudioBuffer);

      // Create file object for OpenAI API
      const audioFile = fs.createReadStream(tempAudioPath);

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
      });

      // Clean up temporary file
      fs.unlinkSync(tempAudioPath);

      const subtitleData: SubtitleData = {
        sceneIndex: i,
        words: [],
        fullText: transcription.text,
      };

      // Extract word-level timestamps from the transcription response
      if (transcription.words && Array.isArray(transcription.words)) {
        subtitleData.words = transcription.words.map((word: any) => ({
          word: word.word,
          start: word.start,
          end: word.end,
        }));
        console.log(
          `📝 Extracted ${subtitleData.words.length} word timestamps for scene ${i}`,
        );
      } else {
        console.log(
          `⚠️ No word timestamps available for scene ${i}, using fallback`,
        );
        // Fallback: create a simple word-level breakdown without precise timestamps
        const words = scene.narration
          .split(' ')
          .filter((word) => word.length > 0);
        const estimatedDuration = scene.duration;
        const timePerWord = estimatedDuration / words.length;

        subtitleData.words = words.map((word, index) => ({
          word,
          start: index * timePerWord,
          end: (index + 1) * timePerWord,
        }));
      }

      subtitles.push(subtitleData);
    }

    return { audioKeys, subtitles };
  } catch (error) {
    console.error('❌ Error in generateNarration:', error);
    throw error;
  }
}

export async function generateStoryBreakdown(
  prompt: string,
  sceneCount: number,
  totalDuration: number,
): Promise<Scene[]> {
  console.log('🤖 Calling OpenAI for story breakdown...');
  console.log(
    `📊 Parameters: ${sceneCount} scenes, ${totalDuration} seconds total`,
  );

  const sceneDuration = Math.floor(totalDuration / sceneCount);
  console.log(`⏱️  Each scene will be ${sceneDuration} seconds long`);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a video script writer. Break down the given prompt into ${sceneCount} scenes, each ${sceneDuration} seconds long, for a ${totalDuration}-second vertical video. 
          Each scene should have a clear visual description and narration text. Return as JSON array with objects containing:
          - description: visual scene description for video generation
          - duration: ${sceneDuration} (seconds)
          - narration: text to be spoken in this scene (aim for ${Math.floor(
            sceneDuration * 2.5 * 0.9,
          )} words to fit ${sceneDuration} seconds naturally)
          
          Important: Keep narration concise and natural. Each scene's narration should be approximately ${Math.floor(
            sceneDuration * 2.5 * 0.9,
          )} words to ensure it fits the ${sceneDuration}-second duration when spoken.
          
          If only 1 scene is requested, create a single comprehensive scene that covers the entire duration.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    console.log('📄 OpenAI response content:', content);

    if (!content) {
      console.log('❌ Error: OpenAI did not return content');
      throw new Error('Failed to generate story breakdown');
    }

    const scenes = JSON.parse(content);

    // Post-process scenes to ensure text fits duration
    const adjustedScenes = scenes.map((scene: Scene) => {
      const adjustedNarration = adjustTextForDuration(
        scene.narration,
        scene.duration,
      );
      const originalDuration = estimateTextDuration(scene.narration);
      const adjustedDuration = estimateTextDuration(adjustedNarration);

      console.log(`📝 Scene ${scene.description.substring(0, 50)}...`);
      console.log(
        `   Original: ${originalDuration.toFixed(
          1,
        )}s, Adjusted: ${adjustedDuration.toFixed(1)}s, Target: ${
          scene.duration
        }s`,
      );

      return {
        ...scene,
        narration: adjustedNarration,
      };
    });

    console.log('✅ Story breakdown parsed and adjusted successfully');
    return adjustedScenes;
  } catch (error) {
    console.error('❌ Error in generateStoryBreakdown:', error);
    throw error;
  }
}
