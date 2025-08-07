import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import OpenAI from 'openai';
import {
  adjustAudioDuration,
  estimateTextDuration,
  adjustTextForDuration,
} from './util/narrationHelper';
const ffmpeg = require('fluent-ffmpeg');

const s3 = new S3Client({ region: process.env.AWS_REGION });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface Scene {
  description: string;
  duration: number;
  narration: string;
  id: number; // Add id property
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
        model: 'gpt-4o-mini-tts',
        voice: 'alloy',
        input: scene.narration,
      });

      const originalAudioBuffer = Buffer.from(await response.arrayBuffer());

      // Adjust audio duration to match target duration
      const adjustedAudioBuffer = await adjustAudioDuration(
        originalAudioBuffer,
        scene.duration,
      );

      // Save to S3 with timestamp prefix using scene.id
      const audioKey = `${userId}/${timestamp}.scene-${scene.id}.mp3`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: audioKey,
          Body: adjustedAudioBuffer,
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
      fs.writeFileSync(tempAudioPath, adjustedAudioBuffer);

      // Create file object for OpenAI API
      const audioFile = fs.createReadStream(tempAudioPath);

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
        language: 'en',
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
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a video script writer. Break down the given prompt into ${sceneCount} scenes, each ${sceneDuration} seconds long, for a ${totalDuration}-second vertical video. 
          Each scene should have a clear visual description and narration text. Return as JSON array with objects containing:
          - description: short visual scene description
          - duration: ${sceneDuration} (seconds)
          - narration: text to be spoken in this scene (the narration should fit naturally within the ${sceneDuration}-seconds scene)
          `,
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
    const adjustedScenes = scenes.map((scene: Scene, idx: number) => {
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
        id: idx,
      };
    });

    console.log('✅ Story breakdown parsed and adjusted successfully');
    return adjustedScenes;
  } catch (error) {
    console.error('❌ Error in generateStoryBreakdown:', error);
    throw error;
  }
}
