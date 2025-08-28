import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
const ffmpeg = require('fluent-ffmpeg');
import {
  createASSStyleHeader,
  parseASSTime,
  formatASSTime,
} from './util/assUtils';

const s3 = new S3Client({ region: process.env.AWS_REGION });

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
        MaxKeys: 100,
      }),
    );

    const objs = listResponse.Contents || [];

    // Filter and sort files by scene id
    const videoFiles = objs
      .filter(
        (obj) => obj.Key?.endsWith('.mp4') && !obj.Key?.includes('-combined'),
      )
      .sort((a, b) => {
        const aId = parseInt(a.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
        const bId = parseInt(b.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
        return aId - bId;
      });

    console.log(
      '🔍 Found video files:',
      videoFiles.map((f) => f.Key),
    );

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

    console.log('🔍 videoFiles start:', videoFiles);

    // Process all scenes in parallel: combine video + audio + subtitle
    const sceneProcessingPromises = videoFiles.map(async (videoFile, i) => {
      const audioFile = audioFiles[i];
      const subtitleFile = subtitleFiles[i];

      if (!videoFile.Key) return null;

      return await processScene(
        videoFile,
        audioFile,
        subtitleFile,
        i,
        userId,
        timestamp,
      );
    });

    const combinedScenePaths = (
      await Promise.all(sceneProcessingPromises)
    ).filter((path): path is string => path !== null);

    console.log('🔍 sceneProcessingPromises finished:', combinedScenePaths);

    // Now concatenate all combined scenes
    const finalOutputPath = await concatenateScenes(combinedScenePaths);

    console.log('🔍 finalOutputPath start:', finalOutputPath);

    // Upload final video to S3
    const finalVideoBuffer = fs.readFileSync(finalOutputPath);
    const finalVideoKey = `${userId}/${timestamp}-final-video.mp4`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.VIDEO_BUCKET_NAME,
        Key: finalVideoKey,
        Body: finalVideoBuffer,
        ContentType: 'video/mp4',
      }),
    );

    console.log('💾 Final video uploaded to S3:', finalVideoKey);

    // Generate pre-signed URL for the final video
    const finalVideoSignedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: process.env.VIDEO_BUCKET_NAME,
        Key: finalVideoKey,
      }),
      { expiresIn: 36000 }, // 10 hours expiration
    );

    console.log('🔗 Final video pre-signed URL generated');

    // Clean up the temporary final video file
    if (fs.existsSync(finalOutputPath)) {
      fs.unlinkSync(finalOutputPath);
    }

    return finalVideoSignedUrl;
  } catch (error) {
    console.error('❌ Error in combineVideoAndAudio:', error);
    throw error;
  }
}

/**
 * Concatenates multiple video scene files into a single final video
 * @param combinedScenePaths Array of paths to combined scene video files
 * @returns Path to the final concatenated video file
 */
async function concatenateScenes(
  combinedScenePaths: string[],
): Promise<string> {
  console.log('🎬 Concatenating all combined scenes...');

  const fileListPath = path.join(os.tmpdir(), 'combined-scenes-filelist.txt');
  const fileListContent = combinedScenePaths
    .map((scenePath) => `file '${scenePath}'`)
    .join('\n');
  fs.writeFileSync(fileListPath, fileListContent);

  const finalOutputPath = path.join(os.tmpdir(), 'final-video.mp4');

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error('❌ Timeout concatenating scenes after 10 minutes');
      reject(new Error('Timeout concatenating scenes'));
    }, 10 * 60 * 1000); // 10 minute timeout

    ffmpeg()
      .input(fileListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-threads',
        '0',
      ])
      .output(finalOutputPath)
      .on('end', () => {
        clearTimeout(timeout);
        console.log('✅ All scenes concatenated successfully');

        // Clean up temporary files
        combinedScenePaths.forEach((scenePath) => {
          if (fs.existsSync(scenePath)) fs.unlinkSync(scenePath);
        });
        if (fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath);

        resolve(finalOutputPath);
      })
      .on('error', (err: any) => {
        clearTimeout(timeout);
        console.error('❌ Error concatenating scenes:', err);
        reject(err);
      })
      .run();
  });
}

/**
 * Processes a single scene by combining video, audio, and subtitle files
 * @param videoFile S3 object containing video file info
 * @param audioFile S3 object containing audio file info (optional)
 * @param subtitleFile S3 object containing subtitle file info (optional)
 * @param sceneIndex Index of the scene being processed
 * @param userId User ID for S3 operations
 * @param timestamp Timestamp for S3 operations
 * @returns Path to the combined scene file
 */
async function processScene(
  videoFile: any,
  audioFile: any,
  subtitleFile: any,
  sceneIndex: number,
  userId: string,
  timestamp: string,
): Promise<string> {
  // Extract the actual scene ID from the filename
  const sceneIdMatch = videoFile.Key.match(/scene-(\d+)\.mp4/);
  const sceneId = sceneIdMatch ? parseInt(sceneIdMatch[1]) : sceneIndex;

  console.log(
    `🎬 Processing scene ${sceneIndex} (ID: ${sceneId}): combining video + audio + subtitle`,
  );

  // Download video file
  const videoPath = path.join(os.tmpdir(), `scene-${sceneIndex}-video.mp4`);
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
    audioPath = path.join(os.tmpdir(), `scene-${sceneIndex}-audio.mp3`);
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
    subtitlePath = path.join(os.tmpdir(), `scene-${sceneIndex}-subtitle.ass`);
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
    `scene-${sceneIndex}-combined.mp4`,
  );

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error(`❌ Timeout combining scene ${sceneIndex} after 5 minutes`);
      reject(new Error(`Timeout combining scene ${sceneIndex}`));
    }, 5 * 60 * 1000); // 5 minute timeout

    const command = ffmpeg()
      .input(videoPath)
      .inputOptions(['-async', '1', '-itsoffset', '0']);

    if (audioPath) {
      command.input(audioPath);
    }

    command.outputOptions([
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '28',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-map',
      '0:v:0',
      '-shortest',
      '-vsync',
      '1',
      '-threads',
      '0',
    ]);

    if (audioPath) {
      command.outputOptions(['-map', '1:a:0']);
    }

    // Add subtitle overlay if available
    if (subtitlePath && fs.existsSync(subtitlePath)) {
      const subtitleFilter = `ass=${subtitlePath}:fontsdir=/opt/fonts`;
      command.outputOptions(['-vf', subtitleFilter]);
    }

    command
      .output(combinedScenePath)
      .on('end', async () => {
        clearTimeout(timeout);
        console.log(`✅ Scene ${sceneIndex} combined successfully`);

        // Save combined scene to S3 for testing purposes
        try {
          const combinedSceneBuffer = fs.readFileSync(combinedScenePath);
          const combinedSceneKey = `${userId}/${timestamp}.scene-${sceneIndex}-combined.mp4`;

          await s3.send(
            new PutObjectCommand({
              Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
              Key: combinedSceneKey,
              Body: combinedSceneBuffer,
              ContentType: 'video/mp4',
            }),
          );

          console.log(
            `💾 Scene ${sceneIndex} (ID: ${sceneId}) combined file saved to S3: ${combinedSceneKey}`,
          );
        } catch (error) {
          console.warn(
            `⚠️ Could not save combined scene ${sceneIndex} (ID: ${sceneId}) to S3:`,
            error,
          );
        }

        // Clean up individual scene files
        if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
        if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        if (subtitlePath && fs.existsSync(subtitlePath))
          fs.unlinkSync(subtitlePath);

        resolve(combinedScenePath);
      })
      .on('error', (err: any) => {
        clearTimeout(timeout);
        console.error(`❌ Error combining scene ${sceneIndex}:`, err);
        reject(err);
      })
      .run();
  });
}
