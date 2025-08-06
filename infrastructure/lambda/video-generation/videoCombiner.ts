import {
  S3Client,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseASSTime,
  formatASSTime,
  createASSStyleHeader,
} from './util/assUtils';
const ffmpeg = require('fluent-ffmpeg');

const s3 = new S3Client({ region: process.env.AWS_REGION });

// Configure FFmpeg paths for Lambda environment
const ffmpegPath = '/opt/bin/ffmpeg';
const ffprobePath = '/opt/bin/ffprobe';

// Set FFmpeg paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

export interface Scene {
  description: string;
  duration: number;
  narration: string;
  id: number; // Add id property
}

export async function combineVideoAndAudio(
  userId: string,
  timestamp: string,
  scenes?: Scene[],
): Promise<string> {
  console.log('🎬 Combining video, audio, and subtitles for user:', userId);

  try {
    // List all files for the user with timestamp prefix
    const listResponse = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Prefix: `${userId}/${timestamp}.scene-`,
        MaxKeys: 30, // Increased to accommodate all file types
      }),
    );

    const objs = listResponse.Contents || [];

    // Filter and sort video files by scene id
    const videoFiles = objs
      .filter((obj) => obj.Key?.endsWith('.mp4'))
      .sort((a, b) => {
        const aId = parseInt(a.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
        const bId = parseInt(b.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
        return aId - bId;
      });

    // Filter and sort audio files by scene id
    const audioFiles = objs
      .filter((obj) => obj.Key?.endsWith('.mp3'))
      .sort((a, b) => {
        const aId = parseInt(a.Key?.match(/scene-(\d+)\.mp3/)?.[1] || '0');
        const bId = parseInt(b.Key?.match(/scene-(\d+)\.mp3/)?.[1] || '0');
        return aId - bId;
      });

    // Filter and sort subtitle files by scene id
    const subtitleFiles = objs
      .filter((obj) => obj.Key?.endsWith('.ass'))
      .sort((a, b) => {
        const aId = parseInt(a.Key?.match(/scene-(\d+)\.ass/)?.[1] || '0');
        const bId = parseInt(b.Key?.match(/scene-(\d+)\.ass/)?.[1] || '0');
        return aId - bId;
      });

    console.log(
      `📹 Found ${videoFiles.length} video files, ${audioFiles.length} audio files, ${subtitleFiles.length} subtitle files`,
    );

    if (videoFiles.length === 0) {
      throw new Error('No video files found for user');
    }

    // Download all video clips from S3
    const videoPaths: string[] = [];
    for (let i = 0; i < videoFiles.length; i++) {
      const videoFile = videoFiles[i];
      if (!videoFile.Key) continue;

      const videoPath = path.join(os.tmpdir(), `video-${i}.mp4`);

      const videoObject = await s3.send(
        new GetObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: videoFile.Key,
        }),
      );

      const videoBuffer = Buffer.from(
        await videoObject.Body!.transformToByteArray(),
      );
      fs.writeFileSync(videoPath, videoBuffer);
      videoPaths.push(videoPath);
    }

    // Download all audio files from S3
    const audioPaths: string[] = [];
    for (let i = 0; i < audioFiles.length; i++) {
      const audioFile = audioFiles[i];
      if (!audioFile.Key) continue;

      const audioPath = path.join(os.tmpdir(), `audio-${i}.mp3`);

      const audioObject = await s3.send(
        new GetObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: audioFile.Key,
        }),
      );

      const audioBuffer = Buffer.from(
        await audioObject.Body!.transformToByteArray(),
      );
      fs.writeFileSync(audioPath, audioBuffer);
      audioPaths.push(audioPath);
    }

    // Download all subtitle files from S3
    const subtitlePaths: string[] = [];
    for (let i = 0; i < subtitleFiles.length; i++) {
      const subtitleFile = subtitleFiles[i];
      if (!subtitleFile.Key) continue;

      const subtitlePath = path.join(os.tmpdir(), `subtitle-${i}.ass`);

      const subtitleObject = await s3.send(
        new GetObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: subtitleFile.Key,
        }),
      );

      const subtitleBuffer = Buffer.from(
        await subtitleObject.Body!.transformToByteArray(),
      );
      fs.writeFileSync(subtitlePath, subtitleBuffer);
      subtitlePaths.push(subtitlePath);
    }

    // Create a file list for FFmpeg concatenation
    const fileListPath = path.join(os.tmpdir(), 'filelist.txt');
    const fileListContent = videoPaths
      .map((videoPath) => `file '${videoPath}'`)
      .join('\n');
    fs.writeFileSync(fileListPath, fileListContent);

    // Create concatenated audio file
    const concatenatedAudioPath = path.join(
      os.tmpdir(),
      'concatenated-audio.mp3',
    );

    const audioConcatCommand = ffmpeg();
    audioPaths.forEach((audioPath) => {
      audioConcatCommand.input(audioPath);
    });

    await new Promise<void>((resolve, reject) => {
      audioConcatCommand
        .on('end', () => {
          resolve();
        })
        .on('error', (err: any) => {
          console.error('❌ Audio concatenation error:', err);
          reject(err);
        })
        .mergeToFile(concatenatedAudioPath, os.tmpdir());
    });

    // Create concatenated subtitle file
    const concatenatedSubtitlePath = path.join(
      os.tmpdir(),
      'concatenated-subtitles.ass',
    );

    if (subtitlePaths.length > 0) {
      let concatenatedSubtitleContent = createASSStyleHeader();
      let currentTime = 0;

      // Process each subtitle file and adjust timestamps
      for (let i = 0; i < subtitlePaths.length; i++) {
        const subtitleContent = fs.readFileSync(subtitlePaths[i], 'utf-8');
        const subtitleLines = subtitleContent.split('\n');

        // Find the Events section in ASS file
        let inEventsSection = false;
        for (const line of subtitleLines) {
          if (line.trim() === '[Events]') {
            inEventsSection = true;
            continue;
          }

          if (inEventsSection && line.startsWith('Dialogue:')) {
            const parts = line.split(',');
            // parts[0] = "Dialogue: 0"
            // parts[1]=start, [2]=end, …, parts[8]=Effect, parts.slice(9).join(',') = Text
            if (parts.length >= 10) {
              const startTime = parts[1];
              const endTime = parts[2];
              const text = parts.slice(9).join(',');

              // The subtitle timing in each ASS file is already absolute (not relative to the scene)
              // So we don't need to add currentTime to it
              const startSeconds = parseASSTime(startTime);
              const endSeconds = parseASSTime(endTime);

              const adjustedStart = formatASSTime(startSeconds);
              const adjustedEnd = formatASSTime(endSeconds);

              concatenatedSubtitleContent += `Dialogue: 0,${adjustedStart},${adjustedEnd},Default,,0,0,0,,${text}\n`;
            }
          }
        }

        // Use scene duration instead of subtitle duration for timing
        const sceneDuration = scenes && scenes[i] ? scenes[i].duration : 5;
        currentTime += sceneDuration;
      }

      fs.writeFileSync(concatenatedSubtitlePath, concatenatedSubtitleContent);
    }

    // Combine video, audio, and subtitles using FFmpeg
    const outputPath = path.join(os.tmpdir(), 'final-video.mp4');

    // Prepare video filter - no drawtext, will use subtitle file directly
    let videoFilter = ''; // No filter needed when using subtitle file

    if (subtitlePaths.length > 0 && fs.existsSync(concatenatedSubtitlePath)) {
      // Using .ass subtitle file directly
    }

    const ffmpegCommand = ffmpeg()
      .input(fileListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .input(concatenatedAudioPath);

    // Note: For ASS subtitles, we don't add them as input files
    // They are handled through the subtitle filter only

    // Prepare output options
    const outputOptions = [
      '-c:v',
      'libx264', // Video codec
      '-pix_fmt',
      'yuv420p', // Pixel format for compatibility
      '-c:a',
      'aac', // Audio codec
      '-b:a',
      '128k', // Audio bitrate
      '-shortest', // End when shortest input ends
    ];

    // Add subtitle overlay if subtitle file is available
    if (subtitlePaths.length > 0 && fs.existsSync(concatenatedSubtitlePath)) {
      const subtitleFilter = `scale=1080:1920,ass=${concatenatedSubtitlePath}:fontsdir=/opt/fonts`;
      outputOptions.push('-vf', subtitleFilter);
    } else if (videoFilter) {
      outputOptions.push('-vf', videoFilter);
    }

    ffmpegCommand.outputOptions(outputOptions);

    await new Promise<void>((resolve, reject) => {
      ffmpegCommand
        .output(outputPath)
        .on('end', () => {
          resolve();
        })
        .on('error', (err: any) => {
          console.error('❌ Video processing error:', err);
          reject(err);
        })
        .run();
    });

    // Clean up temporary files
    videoPaths.forEach((videoPath) => {
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    });
    audioPaths.forEach((audioPath) => {
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    });
    subtitlePaths.forEach((subtitlePath) => {
      if (fs.existsSync(subtitlePath)) fs.unlinkSync(subtitlePath);
    });
    if (fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath);
    if (fs.existsSync(concatenatedAudioPath))
      fs.unlinkSync(concatenatedAudioPath);
    if (fs.existsSync(concatenatedSubtitlePath))
      fs.unlinkSync(concatenatedSubtitlePath);

    return outputPath;
  } catch (error) {
    console.error('❌ Error in combineVideoAndAudio:', error);
    throw error;
  }
}
