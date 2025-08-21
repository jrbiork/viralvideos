import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import OpenAI from 'openai';
import { adjustAudioDuration } from './util/narrationHelper';
import { Scene } from './script';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

export async function generateNarration(
  scenes: Scene[],
  userId: string,
  timestamp: string,
  instructions: string = 'Speak in a cheerful and positive tone',
): Promise<NarrationResult> {
  console.log(
    '🎤 Generating narration from scenes with word-level timestamps...',
  );
  try {
    const audioKeys: string[] = [];
    const subtitles: SubtitleData[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      console.log(`🎤 Generating narration for scene ${i}:`, scene);

      // Generate speech with standard format
      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'fable',
        instructions: `Speak clearly and keep duration in ${scene.duration}s hard cap. Avoid long pauses.`,
        input: scene.narration,
      });

      const originalAudioBuffer = Buffer.from(await response.arrayBuffer());

      // Save to S3 with timestamp prefix using scene.id
      const audioKey = `${userId}/${timestamp}.scene-${scene.id}.mp3`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: audioKey,
          Body: originalAudioBuffer,
          ContentType: 'audio/mpeg',
        }),
      );

      audioKeys.push(audioKey);

      // Get word-level timestamps using transcription

      // Write adjusted audio buffer to temporary file for transcription
      const fs = require('fs');
      const os = require('os');
      const path = require('path');

      const tempAudioPath = path.join(os.tmpdir(), `scene-${i}.mp3`);
      fs.writeFileSync(tempAudioPath, originalAudioBuffer);

      // Create file object for OpenAI API
      const audioFile = fs.createReadStream(tempAudioPath);

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
        language: 'en',
      });

      // Save transcription to S3
      const transcriptionKey = `${userId}/${timestamp}.scene-${scene.id}.transcription.json`;
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: transcriptionKey,
          Body: JSON.stringify(transcription),
        }),
      );

      // Clean up temporary file
      fs.unlinkSync(tempAudioPath);

      const subtitleData: SubtitleData = {
        sceneIndex: i,
        words: [],
        fullText: scene.narration, // Use original narration text instead of transcribed text
      };

      // Extract word-level timestamps from the transcription response
      if (transcription.words && Array.isArray(transcription.words)) {
        subtitleData.words = transcription.words.map((word: any) => ({
          word: word.word,
          start: word.start,
          end: word.end,
        }));
        // Word timestamps extracted successfully
      } else {
        // Using fallback word timestamps
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

      // Save complete subtitle data to S3 (including fullText)
      const subtitleKey = `${userId}/${timestamp}.scene-${scene.id}.subtitle.json`;
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: subtitleKey,
          Body: JSON.stringify(subtitleData),
        }),
      );

      subtitles.push(subtitleData);
    }

    return { audioKeys, subtitles };
  } catch (error) {
    console.error('❌ Error in generateNarration:', error);
    throw error;
  }
}
