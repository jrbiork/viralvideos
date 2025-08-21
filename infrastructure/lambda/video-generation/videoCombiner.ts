import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
const ffmpeg = require('fluent-ffmpeg');
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  createASSStyleHeader,
  parseASSTime,
  formatASSTime,
} from './util/assUtils';

const s3 = new S3Client({ region: process.env.AWS_REGION });

// Set FFmpeg paths for Lambda environment
const ffmpegPath = '/opt/bin/ffmpeg';
const ffprobePath = '/opt/bin/ffprobe';

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
  console.log(
    '🎬 Combining video, audio, and subtitles scene by scene for user:',
    userId,
  );

  try {
    // List all files for the user with timestamp prefix
    const listResponse = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Prefix: `${userId}/${timestamp}.scene-`,
        MaxKeys: 30,
      }),
    );

    const objs = listResponse.Contents || [];

    // Filter and sort files by scene id
    const videoFiles = objs
      .filter((obj) => obj.Key?.endsWith('.mp4'))
      .sort((a, b) => {
        const aId = parseInt(a.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
        const bId = parseInt(b.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
        return aId - bId;
      });

    const audioFiles = objs
      .filter((obj) => obj.Key?.endsWith('.mp3'))
      .sort((a, b) => {
        const aId = parseInt(a.Key?.match(/scene-(\d+)\.mp3/)?.[1] || '0');
        const bId = parseInt(b.Key?.match(/scene-(\d+)\.mp3/)?.[1] || '0');
        return aId - bId;
      });

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

    // Process each scene individually: combine video + audio + subtitle
    const combinedScenePaths: string[] = [];

    for (let i = 0; i < videoFiles.length; i++) {
      const videoFile = videoFiles[i];
      const audioFile = audioFiles[i];
      const subtitleFile = subtitleFiles[i];

      if (!videoFile.Key) continue;

      console.log(
        `🎬 Processing scene ${i}: combining video + audio + subtitle`,
      );

      // Download video file
      const videoPath = path.join(os.tmpdir(), `scene-${i}-video.mp4`);
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

      // Download audio file
      let audioPath: string | null = null;
      if (audioFile?.Key) {
        audioPath = path.join(os.tmpdir(), `scene-${i}-audio.mp3`);
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
      }

      // Download subtitle file
      let subtitlePath: string | null = null;
      if (subtitleFile?.Key) {
        subtitlePath = path.join(os.tmpdir(), `scene-${i}-subtitle.ass`);
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
      }

      // Combine video + audio + subtitle for this scene
      const combinedScenePath = path.join(
        os.tmpdir(),
        `scene-${i}-combined.mp4`,
      );

      // Log scene information for debugging
      console.log(
        `🔍 Scene ${i} - Video: ${videoFile.Key}, Audio: ${audioFile?.Key}, Subtitle: ${subtitleFile?.Key}`,
      );
      if (scenes && scenes[i]) {
        console.log(`🔍 Scene ${i} expected duration: ${scenes[i].duration}s`);
      }

      // Check actual file durations using ffprobe
      try {
        const { stdout: videoDuration } = await new Promise<{
          stdout: string;
          stderr: string;
        }>((resolve, reject) => {
          ffmpeg.ffprobe(videoPath, (err: any, metadata: any) => {
            if (err) reject(err);
            else
              resolve({
                stdout: metadata.format.duration?.toString() || '0',
                stderr: '',
              });
          });
        });
        console.log(`🔍 Scene ${i} actual video duration: ${videoDuration}s`);

        if (audioPath) {
          const { stdout: audioDuration } = await new Promise<{
            stdout: string;
            stderr: string;
          }>((resolve, reject) => {
            ffmpeg.ffprobe(audioPath, (err: any, metadata: any) => {
              if (err) reject(err);
              else
                resolve({
                  stdout: metadata.format.duration?.toString() || '0',
                  stderr: '',
                });
            });
          });
          console.log(`🔍 Scene ${i} actual audio duration: ${audioDuration}s`);
        }
      } catch (error) {
        console.warn(
          `⚠️ Could not check file durations for scene ${i}:`,
          error,
        );
      }

      const ffmpegCommand = ffmpeg().input(videoPath);

      if (audioPath) {
        ffmpegCommand.input(audioPath);
      }

      // Add input options to ensure proper synchronization
      ffmpegCommand.inputOptions(['-async', '1', '-itsoffset', '0']); // Audio sync and no time offset

      const outputOptions = [
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-map',
        '0:v:0',
        '-shortest', // Ensure output duration matches the shortest input
        '-vsync',
        '1', // Video sync method
      ];

      if (audioPath) {
        outputOptions.push('-map', '1:a:0');
      }

      // Add subtitle overlay if available
      if (subtitlePath && fs.existsSync(subtitlePath)) {
        const subtitleFilter = `scale=1080:1920,ass=${subtitlePath}:fontsdir=/opt/fonts`;
        outputOptions.push('-vf', subtitleFilter);
      }

      ffmpegCommand.outputOptions(outputOptions);

      await new Promise<void>((resolve, reject) => {
        ffmpegCommand
          .output(combinedScenePath)
          .on('end', () => {
            console.log(`✅ Scene ${i} combined successfully`);
            resolve();
          })
          .on('error', (err: any) => {
            console.error(`❌ Error combining scene ${i}:`, err);
            reject(err);
          })
          .run();
      });

      // Save combined scene to S3 for testing purposes
      try {
        const combinedSceneBuffer = fs.readFileSync(combinedScenePath);
        const combinedSceneKey = `${userId}/${timestamp}.scene-${i}-combined.mp4`;

        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: combinedSceneKey,
            Body: combinedSceneBuffer,
            ContentType: 'video/mp4',
          }),
        );

        console.log(
          `💾 Scene ${i} combined file saved to S3: ${combinedSceneKey}`,
        );
      } catch (error) {
        console.warn(`⚠️ Could not save combined scene ${i} to S3:`, error);
      }

      combinedScenePaths.push(combinedScenePath);

      // Clean up individual scene files
      if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      if (subtitlePath && fs.existsSync(subtitlePath))
        fs.unlinkSync(subtitlePath);
    }

    // Now concatenate all combined scenes
    console.log('🎬 Concatenating all combined scenes...');

    const fileListPath = path.join(os.tmpdir(), 'combined-scenes-filelist.txt');
    const fileListContent = combinedScenePaths
      .map((scenePath) => `file '${scenePath}'`)
      .join('\n');
    fs.writeFileSync(fileListPath, fileListContent);

    const finalOutputPath = path.join(os.tmpdir(), 'final-video.mp4');

    const concatCommand = ffmpeg()
      .input(fileListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
      ])
      .output(finalOutputPath);

    await new Promise<void>((resolve, reject) => {
      concatCommand
        .on('end', () => {
          console.log('✅ All scenes concatenated successfully');
          resolve();
        })
        .on('error', (err: any) => {
          console.error('❌ Error concatenating scenes:', err);
          reject(err);
        })
        .run();
    });

    // Clean up temporary files
    combinedScenePaths.forEach((scenePath) => {
      if (fs.existsSync(scenePath)) fs.unlinkSync(scenePath);
    });
    if (fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath);

    return finalOutputPath;
  } catch (error) {
    console.error('❌ Error in combineVideoAndAudio:', error);
    throw error;
  }
}
