import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
const ffmpeg = require('fluent-ffmpeg');

const s3 = new S3Client({ region: process.env.AWS_REGION });

// Configure FFmpeg paths for Lambda environment
const ffmpegPath = '/opt/ffmpeg/ffmpeg';
const ffprobePath = '/opt/ffmpeg/ffprobe';

// Set FFmpeg paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

export interface Scene {
  description: string;
  duration: number;
  narration: string;
}

export async function combineVideoAndAudio(
  userId: string,
  timestamp: string,
): Promise<string> {
  console.log('🎬 Combining video, audio, and subtitles for user:', userId);
  console.log('🕐 Using timestamp prefix:', timestamp);

  try {
    // List all video files for the user with timestamp prefix
    console.log('📋 Listing video files from S3...');
    const videoListResponse = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Prefix: `${userId}/${timestamp}.scene-`,
        MaxKeys: 10,
      }),
    );

    // List all audio files for the user with timestamp prefix
    console.log('📋 Listing audio files from S3...');
    const audioListResponse = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Prefix: `${userId}/${timestamp}.scene-`,
        MaxKeys: 10,
      }),
    );

    // List all subtitle files for the user with timestamp prefix
    console.log('📋 Listing subtitle files from S3...');
    const subtitleListResponse = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Prefix: `${userId}/${timestamp}.scene-`,
        MaxKeys: 10,
      }),
    );

    // Filter and sort video files
    const videoFiles =
      videoListResponse.Contents?.filter((obj) =>
        obj.Key?.endsWith('.mp4'),
      )?.sort((a, b) => {
        const aIndex = parseInt(a.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
        const bIndex = parseInt(b.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
        return aIndex - bIndex;
      }) || [];

    // Filter and sort audio files
    const audioFiles =
      audioListResponse.Contents?.filter((obj) =>
        obj.Key?.endsWith('.mp3'),
      )?.sort((a, b) => {
        const aIndex = parseInt(a.Key?.match(/scene-(\d+)\.mp3/)?.[1] || '0');
        const bIndex = parseInt(b.Key?.match(/scene-(\d+)\.mp3/)?.[1] || '0');
        return aIndex - bIndex;
      }) || [];

    // Filter and sort subtitle files
    const subtitleFiles =
      subtitleListResponse.Contents?.filter((obj) =>
        obj.Key?.endsWith('.ass'),
      )?.sort((a, b) => {
        const aIndex = parseInt(a.Key?.match(/scene-(\d+)\.ass/)?.[1] || '0');
        const bIndex = parseInt(b.Key?.match(/scene-(\d+)\.ass/)?.[1] || '0');
        return aIndex - bIndex;
      }) || [];

    console.log(
      `📹 Found ${videoFiles.length} video files:`,
      videoFiles.map((f) => f.Key),
    );
    console.log(
      `🎵 Found ${audioFiles.length} audio files:`,
      audioFiles.map((f) => f.Key),
    );
    console.log(
      `📝 Found ${subtitleFiles.length} subtitle files:`,
      subtitleFiles.map((f) => f.Key),
    );

    if (videoFiles.length === 0) {
      throw new Error('No video files found for user');
    }

    // Download all video clips from S3
    console.log('📥 Downloading video clips from S3...');
    const videoPaths: string[] = [];
    for (let i = 0; i < videoFiles.length; i++) {
      const videoFile = videoFiles[i];
      if (!videoFile.Key) continue;

      const videoPath = path.join(os.tmpdir(), `video-${i}.mp4`);

      console.log(`📥 Downloading ${videoFile.Key} to ${videoPath}`);
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
      console.log(`✅ Downloaded video ${i + 1}/${videoFiles.length}`);
    }

    // Download all audio files from S3
    console.log('📥 Downloading audio files from S3...');
    const audioPaths: string[] = [];
    for (let i = 0; i < audioFiles.length; i++) {
      const audioFile = audioFiles[i];
      if (!audioFile.Key) continue;

      const audioPath = path.join(os.tmpdir(), `audio-${i}.mp3`);

      console.log(`📥 Downloading ${audioFile.Key} to ${audioPath}`);
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
      console.log(`✅ Downloaded audio ${i + 1}/${audioFiles.length}`);
    }

    // Download all subtitle files from S3
    console.log('📥 Downloading subtitle files from S3...');
    const subtitlePaths: string[] = [];
    for (let i = 0; i < subtitleFiles.length; i++) {
      const subtitleFile = subtitleFiles[i];
      if (!subtitleFile.Key) continue;

      const subtitlePath = path.join(os.tmpdir(), `subtitle-${i}.ass`);

      console.log(`📥 Downloading ${subtitleFile.Key} to ${subtitlePath}`);
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
      console.log(`✅ Downloaded subtitle ${i + 1}/${subtitleFiles.length}`);
    }

    // Create a file list for FFmpeg concatenation
    const fileListPath = path.join(os.tmpdir(), 'filelist.txt');
    const fileListContent = videoPaths
      .map((videoPath) => `file '${videoPath}'`)
      .join('\n');
    fs.writeFileSync(fileListPath, fileListContent);
    console.log('📄 Created file list for concatenation');

    // Create concatenated audio file
    const concatenatedAudioPath = path.join(
      os.tmpdir(),
      'concatenated-audio.mp3',
    );
    console.log('🎵 Concatenating audio files...');

    const audioConcatCommand = ffmpeg();
    audioPaths.forEach((audioPath) => {
      audioConcatCommand.input(audioPath);
    });

    await new Promise<void>((resolve, reject) => {
      audioConcatCommand
        .on('end', () => {
          console.log('✅ Audio concatenation completed');
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
    console.log('📝 Concatenating subtitle files...');

    if (subtitlePaths.length > 0) {
      // For ASS files, we need to concatenate them differently
      // First, get the header and styles from the first file
      const firstSubtitleContent = fs.readFileSync(subtitlePaths[0], 'utf-8');
      const lines = firstSubtitleContent.split('\n');

      let concatenatedSubtitleContent = '';
      let inEvents = false;
      let currentTime = 0;

      // Extract header and styles from first file
      for (const line of lines) {
        if (line.startsWith('[Events]')) {
          concatenatedSubtitleContent += line + '\n';
          concatenatedSubtitleContent +=
            'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
          inEvents = true;
          break;
        }
        concatenatedSubtitleContent += line + '\n';
      }

      // Now process each subtitle file and adjust timestamps
      for (let i = 0; i < subtitlePaths.length; i++) {
        const subtitleContent = fs.readFileSync(subtitlePaths[i], 'utf-8');
        const subtitleLines = subtitleContent.split('\n');
        let inEventsSection = false;

        for (const line of subtitleLines) {
          if (line.startsWith('[Events]')) {
            inEventsSection = true;
            continue;
          }

          if (inEventsSection && line.startsWith('Dialogue:')) {
            // Parse ASS dialogue line: Dialogue: 0,0:00:00.00,0:00:01.42,Default,,0,0,0,,Text
            const dialogueMatch = line.match(
              /Dialogue: 0,([^,]+),([^,]+),([^,]+),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),(.+)/,
            );
            if (dialogueMatch) {
              const originalStart = dialogueMatch[1];
              const originalEnd = dialogueMatch[2];
              const style = dialogueMatch[3];
              const name = dialogueMatch[4];
              const marginL = dialogueMatch[5];
              const marginR = dialogueMatch[6];
              const marginV = dialogueMatch[7];
              const effect = dialogueMatch[8];
              const text = dialogueMatch[9];

              // Convert ASS time format (H:MM:SS.cc) to seconds, add current time, then convert back
              const startSeconds = parseASSTime(originalStart) + currentTime;
              const endSeconds = parseASSTime(originalEnd) + currentTime;

              const adjustedStart = formatASSTime(startSeconds);
              const adjustedEnd = formatASSTime(endSeconds);

              concatenatedSubtitleContent += `Dialogue: 0,${adjustedStart},${adjustedEnd},${style},${name},${marginL},${marginR},${marginV},${effect},${text}\n`;
            }
          }
        }

        // Add scene duration to current time for next scene
        if (videoPaths[i]) {
          // Get video duration using ffprobe
          const videoDuration = await getVideoDuration(videoPaths[i]);
          currentTime += videoDuration;
        }
      }

      fs.writeFileSync(concatenatedSubtitlePath, concatenatedSubtitleContent);
      console.log('✅ Subtitle concatenation completed');
      console.log(
        '📄 Concatenated subtitle content preview:',
        concatenatedSubtitleContent.substring(0, 500),
      );
      console.log(
        '📁 Concatenated subtitle file path:',
        concatenatedSubtitlePath,
      );
      console.log(
        '📊 Concatenated subtitle file size:',
        fs.statSync(concatenatedSubtitlePath).size,
        'bytes',
      );

      // Debug: Check if the file is readable and has valid content
      try {
        const fileContent = fs.readFileSync(concatenatedSubtitlePath, 'utf-8');
        console.log('🔍 Full ASS file content:', fileContent);
        console.log(
          '🔍 File starts with ASS header:',
          fileContent.startsWith('[Script Info]'),
        );
        console.log(
          '🔍 File contains Events section:',
          fileContent.includes('[Events]'),
        );
        console.log(
          '🔍 File contains Dialogue lines:',
          fileContent.includes('Dialogue:'),
        );
      } catch (error) {
        console.error('❌ Error reading ASS file:', error);
      }
    }

    // Combine video, audio, and subtitles using FFmpeg
    const outputPath = path.join(os.tmpdir(), 'final-video.mp4');
    console.log('🎬 Combining video, audio, and subtitles with FFmpeg...');

    // Prepare video filter with scaling and subtitles
    let videoFilter = 'scale=1080:1920'; // Base scaling filter

    // Add subtitle filter if available
    if (subtitlePaths.length > 0 && fs.existsSync(concatenatedSubtitlePath)) {
      console.log('📝 Using ASS subtitle format');
      console.log(
        '📄 ASS subtitle content preview:',
        fs.readFileSync(concatenatedSubtitlePath, 'utf-8').substring(0, 500),
      );

      // Convert ASS to SRT for better compatibility with subtitles filter
      const srtSubtitlePath = concatenatedSubtitlePath.replace('.ass', '.srt');
      const assContent = fs.readFileSync(concatenatedSubtitlePath, 'utf-8');
      const srtContent = convertASStoSRT(assContent);
      fs.writeFileSync(srtSubtitlePath, srtContent);

      console.log('📝 Converted ASS to SRT for subtitle burning');
      console.log(
        '📄 SRT subtitle content preview:',
        srtContent.substring(0, 500),
      );

      // Use subtitles filter with SRT file (more widely supported)
      const absolutePath = srtSubtitlePath.replace(/\\/g, '/');
      videoFilter += `,subtitles='${absolutePath}':force_style='FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,BackColour=&H000000,Bold=1,Outline=2'`;

      console.log('📝 Adding subtitle filter to video:', videoFilter);
    }

    const ffmpegCommand = ffmpeg()
      .input(fileListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .input(concatenatedAudioPath);

    // Add subtitle file as input if available
    if (subtitlePaths.length > 0 && fs.existsSync(concatenatedSubtitlePath)) {
      ffmpegCommand.input(concatenatedSubtitlePath);
    }

    ffmpegCommand.outputOptions([
      '-c:v',
      'libx264', // Video codec
      '-c:a',
      'aac', // Audio codec
      '-b:a',
      '128k', // Audio bitrate
      '-pix_fmt',
      'yuv420p', // Pixel format for compatibility
      '-vf',
      videoFilter, // Combined scaling and subtitle filter
      '-r',
      '30', // Frame rate
      '-shortest', // End when shortest input ends
    ]);

    console.log('🎬 FFmpeg command prepared with video filter:', videoFilter);
    console.log('📝 Subtitle paths found:', subtitlePaths.length);
    console.log(
      '📁 Concatenated subtitle exists:',
      fs.existsSync(concatenatedSubtitlePath),
    );

    await new Promise<void>((resolve, reject) => {
      ffmpegCommand
        .output(outputPath)
        .on('start', (commandLine: string) => {
          console.log('🔧 FFmpeg command being executed:', commandLine);
        })
        .on('end', () => {
          console.log('✅ Video processing completed');
          resolve();
        })
        .on('error', (err: any) => {
          console.error('❌ Video processing error:', err);
          reject(err);
        })
        .on('stderr', (stderrLine: string) => {
          // Only log error messages, not verbose info
          if (
            stderrLine.includes('error') ||
            stderrLine.includes('Error') ||
            stderrLine.includes('failed')
          ) {
            console.log('📝 FFmpeg stderr:', stderrLine);
          }
        })
        .run();
    });

    // Clean up temporary files
    console.log('🧹 Cleaning up temporary files...');
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
    console.log('✅ Cleanup completed');

    return outputPath;
  } catch (error) {
    console.error('❌ Error in combineVideoAndAudio:', error);
    throw error;
  }
}

function parseTimeToSeconds(timeString: string): number {
  const match = timeString.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (match) {
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseInt(match[3]);
    const milliseconds = parseInt(match[4]);
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  }
  return 0;
}

function formatSecondsToTime(seconds: number): string {
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

function parseASSTime(assTime: string): number {
  // Parse ASS time format: HH:MM:SS.mmm (e.g., "00:00:00.000")
  const match = assTime.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (match) {
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseInt(match[3]);
    const milliseconds = parseInt(match[4]);
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
  }
  return 0;
}

function formatASSTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${milliseconds
    .toString()
    .padStart(3, '0')}`;
}

function extractSubtitleText(assContent: string): string {
  const lines = assContent.split('\n');
  let subtitleText = '';
  let inEvents = false;

  for (const line of lines) {
    if (line.startsWith('[Events]')) {
      inEvents = true;
      continue;
    }

    if (inEvents && line.startsWith('Dialogue:')) {
      // Parse ASS dialogue line and extract text
      const dialogueMatch = line.match(
        /Dialogue: 0,[^,]+,[^,]+,[^,]+,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,([^,]+)/,
      );
      if (dialogueMatch) {
        const text = dialogueMatch[1];
        if (subtitleText) subtitleText += ' ';
        subtitleText += text;
      }
    }
  }

  return subtitleText || 'Subtitles Available';
}

function convertASStoSRT(assContent: string): string {
  const lines = assContent.split('\n');
  let srtContent = '';
  let subtitleIndex = 1;
  let inEvents = false;

  for (const line of lines) {
    if (line.startsWith('[Events]')) {
      inEvents = true;
      continue;
    }

    if (inEvents && line.startsWith('Dialogue:')) {
      // Parse ASS dialogue line: Dialogue: 0,0:00:00.00,0:00:01.42,Default,,0,0,0,,Text
      const dialogueMatch = line.match(
        /Dialogue: 0,([^,]+),([^,]+),([^,]+),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),(.+)/,
      );
      if (dialogueMatch) {
        const startTime = dialogueMatch[1];
        const endTime = dialogueMatch[2];
        const text = dialogueMatch[9];

        // Convert ASS time format to SRT format
        const srtStartTime = convertASSTimeToSRT(startTime);
        const srtEndTime = convertASSTimeToSRT(endTime);

        srtContent += `${subtitleIndex}\n`;
        srtContent += `${srtStartTime} --> ${srtEndTime}\n`;
        srtContent += `${text}\n\n`;
        subtitleIndex++;
      }
    }
  }

  return srtContent;
}

function convertASSTimeToSRT(assTime: string): string {
  // Convert ASS time format (HH:MM:SS.mmm) to SRT format (HH:MM:SS,mmm)
  const match = assTime.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
  if (match) {
    const hours = match[1];
    const minutes = match[2];
    const seconds = match[3];
    const milliseconds = match[4];
    return `${hours}:${minutes}:${seconds},${milliseconds}`;
  }
  return assTime; // Return original if no match
}

async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err: any, metadata: any) => {
      if (err) {
        console.warn('⚠️ Could not get video duration, using default:', err);
        resolve(5); // Default duration
      } else {
        resolve(metadata.format.duration || 5);
      }
    });
  });
}

export async function uploadToS3(
  filePath: string,
  userId: string,
  timestamp: string,
): Promise<string> {
  try {
    console.log(`📁 Reading file: ${filePath}`);
    const fileBuffer = fs.readFileSync(filePath);
    console.log(`📊 File size: ${fileBuffer.length} bytes`);

    const videoKey = `${userId}/${timestamp}-final-video.mp4`;

    console.log(
      `☁️ Uploading to S3: ${process.env.VIDEO_BUCKET_NAME}/${videoKey}`,
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.VIDEO_BUCKET_NAME,
        Key: videoKey,
        Body: fileBuffer,
        ContentType: 'video/mp4',
      }),
    );
    console.log('✅ Upload successful');

    return videoKey;
  } catch (error) {
    console.error('❌ Error uploading to S3:', error);
    throw error;
  }
}
