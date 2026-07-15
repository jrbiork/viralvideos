import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { execFile } from 'child_process';
import { promisify } from 'util';

import OpenAI from 'openai';

import { Scene } from './script';
import { resolveFfmpegPath } from './ffmpeg';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const execFileAsync = promisify(execFile);

export interface SubtitleWord {
  word: string;
  start: number;
  end: number;
}

export interface SubtitleData {
  scenePosition: number;
  words: SubtitleWord[];
  fullText: string;
  duration?: number;
}

export interface NarrationResult {
  subtitles: SubtitleData[];
}

export interface TranscriptionResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  words: SubtitleWord[];
  usage: {
    type: string;
    seconds: number;
  };
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
  voice: string = 'alloy',
  language: string = 'en',
): Promise<NarrationResult> {
  console.log(
    '🎤 Generating narration from scenes with word-level timestamps...',
  );
  try {
    // Process all scenes in parallel
    const scenePromises = scenes.map(async (scene, i) => {
      console.log(`🎤 Generating narration for scene ${i}:`, scene);

      // Generate speech with standard format
      const response = await openai.audio.speech.create({
        model: 'gpt-4o-mini-tts',
        voice: voice,
        instructions: `Speak clearly and keep duration in ${scene.duration}s hard cap. Avoid long pauses.`,
        input: scene.narration,
      });
      // Check if response has duration metadata
      console.log('Response audio data:', JSON.stringify(response, null, 2));

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

      // Get word-level timestamps using transcription

      // Write adjusted audio buffer to temporary file for transcription
      const fs = require('fs');
      const os = require('os');
      const path = require('path');

      const tempAudioPath = path.join(
        os.tmpdir(),
        `scene-${i}-${timestamp}.mp3`,
      );
      fs.writeFileSync(tempAudioPath, originalAudioBuffer);

      // Create file object for OpenAI API
      const audioFile = fs.createReadStream(tempAudioPath);

      const transcription = (await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
        language: language,
      })) as TranscriptionResponse;

      // Save transcription to S3
      // const transcriptionKey = `${userId}/${timestamp}.scene-${scene.id}.transcription.json`;
      // await s3.send(
      //   new PutObjectCommand({
      //     Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
      //     Key: transcriptionKey,
      //     Body: JSON.stringify(transcription),
      //   }),
      // );

      const subtitleData: SubtitleData = {
        scenePosition: scene.id,
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
        subtitleData.duration = transcription.usage.seconds;
        console.log(`🔍 Scene ${i}: Word timestamps extracted successfully`);
        // Word timestamps extracted successfully
      } else {
        console.log(`🔍 Scene ${i}: No word timestamps found, using fallback`);
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

      // Animated scenes have a fixed-length Runway video — if the TTS
      // narration came out longer than that, hard-trim the audio (the
      // "Speak clearly and keep duration..." instruction above is only a
      // soft hint to the TTS model, not an enforced cap) and drop any
      // subtitle words that fall past the cut.
      if (
        scene.hardCapSeconds !== undefined &&
        (subtitleData.duration || 0) > scene.hardCapSeconds
      ) {
        const cap = scene.hardCapSeconds;
        console.log(
          `✂️ Scene ${i}: narration (${subtitleData.duration}s) exceeds the ${cap}s animated-scene cap, trimming audio`,
        );

        const trimmedAudioPath = path.join(
          os.tmpdir(),
          `scene-${i}-${timestamp}-trimmed.mp3`,
        );
        const ffmpegPath = resolveFfmpegPath();
        await execFileAsync(ffmpegPath, [
          '-i',
          tempAudioPath,
          '-t',
          cap.toString(),
          '-y',
          trimmedAudioPath,
        ]);

        const trimmedAudioBuffer = fs.readFileSync(trimmedAudioPath);
        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: audioKey,
            Body: trimmedAudioBuffer,
            ContentType: 'audio/mpeg',
          }),
        );
        fs.unlinkSync(trimmedAudioPath);

        subtitleData.words = subtitleData.words.filter(
          (word) => word.start < cap,
        );
        subtitleData.duration = cap;
      }

      // Clean up temporary file
      fs.unlinkSync(tempAudioPath);

      // Save complete subtitle data to S3 (including fullText)
      const subtitleKey = `${userId}/${timestamp}.scene-${scene.id}.subtitle.json`;
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: subtitleKey,
          Body: JSON.stringify(subtitleData),
        }),
      );

      return {
        audioKey,
        subtitleData,
      };
    });

    // Wait for all scenes to complete
    const results = await Promise.all(scenePromises);

    // Extract results in the correct order
    const audioKeys = results.map((result) => result.audioKey);
    const subtitles = results.map((result) => result.subtitleData);

    console.log(
      `✅ Generated narration for ${results.length} scenes in parallel`,
    );
    return { subtitles };
  } catch (error) {
    console.error('❌ Error in generateNarration:', error);
    throw error;
  }
}
