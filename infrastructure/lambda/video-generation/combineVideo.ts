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

export async function combineVideoAndAudio(userId: string): Promise<string> {
  console.log('🎬 Combining video and audio for user:', userId);

  try {
    // List all video files for the user
    console.log('📋 Listing video files from S3...');
    const videoListResponse = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Prefix: `${userId}/scene-`,
        MaxKeys: 10,
      }),
    );

    // List all audio files for the user
    console.log('📋 Listing audio files from S3...');
    const audioListResponse = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Prefix: `${userId}/scene-`,
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

    console.log(
      `📹 Found ${videoFiles.length} video files:`,
      videoFiles.map((f) => f.Key),
    );
    console.log(
      `🎵 Found ${audioFiles.length} audio files:`,
      audioFiles.map((f) => f.Key),
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

    // Combine video and audio using FFmpeg
    const outputPath = path.join(os.tmpdir(), 'final-video.mp4');
    console.log('🎬 Combining video and audio with FFmpeg...');

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(fileListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .input(concatenatedAudioPath)
        .outputOptions([
          '-c:v',
          'libx264', // Video codec
          '-c:a',
          'aac', // Audio codec
          '-b:a',
          '128k', // Audio bitrate
          '-pix_fmt',
          'yuv420p', // Pixel format for compatibility
          '-vf',
          'scale=1080:1920', // Scale to vertical format
          '-r',
          '30', // Frame rate
          '-shortest', // End when shortest input ends
        ])
        .output(outputPath)
        .on('end', () => {
          console.log('✅ Video processing completed');
          resolve();
        })
        .on('error', (err: any) => {
          console.error('❌ Video processing error:', err);
          reject(err);
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
    if (fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath);
    if (fs.existsSync(concatenatedAudioPath))
      fs.unlinkSync(concatenatedAudioPath);
    console.log('✅ Cleanup completed');

    return outputPath;
  } catch (error) {
    console.error('❌ Error in combineVideoAndAudio:', error);
    throw error;
  }
}

export async function uploadToS3(
  filePath: string,
  userId: string,
): Promise<string> {
  try {
    console.log(`📁 Reading file: ${filePath}`);
    const fileBuffer = fs.readFileSync(filePath);
    console.log(`📊 File size: ${fileBuffer.length} bytes`);

    const timestamp = Date.now();
    const videoKey = `${userId}/final-video-${timestamp}.mp4`;

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
