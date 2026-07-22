import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Manifest, ManifestScene } from '../types/s3Types';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UserItem } from './user';

const ffmpeg = require('fluent-ffmpeg');

// --- Helpers for concat reliability ---
function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err: Error | null, data: any) => {
      if (err) return resolve(0);
      const dur = Number(data?.format?.duration ?? 0);
      resolve(Number.isFinite(dur) ? dur : 0);
    });
  });
}

function probeHasAudio(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err: Error | null, data: any) => {
      if (err) return resolve(false);
      const streams = data?.streams || [];
      resolve(streams.some((s: any) => s.codec_type === 'audio'));
    });
  });
}

// S3 file object interface
export interface S3FileObject {
  Key: string;
}

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
  manifest: Manifest,
  removedScenes: number[] = [],
  user: UserItem | null,
): Promise<{ finalVideoSignedUrl: string; size: string }> {
  console.log(
    '🎬 Combining video, audio, and subtitles scene by scene for user:',
    userId,
  );

  try {
    console.log(
      '🔍 Using manifest for scene ordering:',
      manifest.scenes.length,
      'scenes',
    );
    console.log('🔍 Removed scenes to exclude:', removedScenes);

    if (!manifest.scenes || manifest.scenes.length === 0) {
      throw new Error('No scenes found in manifest');
    }

    // Filter out removed scenes and sort by scenePosition to ensure proper order
    const filteredScenes = manifest.scenes.filter((scene: ManifestScene) => {
      const isRemoved = removedScenes.includes(scene.id);
      if (isRemoved) {
        console.log(
          `🚫 Excluding removed scene ID: ${scene.id} (position: ${scene.scenePosition})`,
        );
      }
      return !isRemoved;
    });

    const sortedScenes = filteredScenes.sort(
      (a: ManifestScene, b: ManifestScene) => a.scenePosition - b.scenePosition,
    );

    console.log(
      '🔍 Sorted scenes by scenePosition:',
      sortedScenes.map((s: ManifestScene) => ({
        scenePosition: s.scenePosition,
        hasVideo: !!s.files?.mp4,
        hasAudio: !!s.files?.mp3,
        hasSubtitle: !!s.files?.ass,
      })),
    );

    // Process all scenes in parallel: combine video + audio + subtitle
    const sceneProcessingPromises = sortedScenes.map(
      async (scene: ManifestScene, i: number) => {
        const scenePosition = scene.scenePosition;

        // Create file objects based on manifest
        // Extract S3 key from URL if it's a full URL, otherwise use as-is
        const extractS3Key = (url: string): string => {
          if (url.startsWith('https://')) {
            // Extract key from S3 URL
            const urlParts = url.split('/');
            return urlParts.slice(3).join('/'); // Remove bucket and domain parts
          }
          return url;
        };

        const videoFile = scene.files?.mp4
          ? { Key: extractS3Key(scene.files.mp4) }
          : null;
        const audioFile = scene.files?.mp3
          ? { Key: extractS3Key(scene.files.mp3) }
          : null;
        const subtitleFile = scene.files?.ass
          ? { Key: extractS3Key(scene.files.ass) }
          : null;

        if (!videoFile?.Key) {
          console.warn(
            `⚠️ No video file found for scene at position ${scenePosition}`,
          );
          return null;
        }

        return await processScene(
          videoFile,
          audioFile,
          subtitleFile,
          scenePosition,
          userId,
          timestamp,
          scene.animated,
        );
      },
    );

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
    const size = finalVideoBuffer.length.toString();
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.VIDEO_BUCKET_NAME,
        Key: finalVideoKey,
        Body: finalVideoBuffer,
        ContentType: 'video/mp4',
        Metadata: {
          size,
          duration: manifest.totalDuration.toString(),
          sceneCount: manifest.sceneCount.toString(),
        },
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

    return { finalVideoSignedUrl, size };
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
  console.log('🎬 Concatenating all combined scenes (filter graph)…');

  if (!combinedScenePaths.length) {
    throw new Error('No combined scene paths provided');
  }
  if (combinedScenePaths.length === 1) {
    console.log('ℹ️ Only one scene — skipping concat.');
    return combinedScenePaths[0];
  }

  // Probe durations and audio presence so we can create consistent streams
  const [durations, audioFlags] = await Promise.all([
    Promise.all(combinedScenePaths.map((p) => probeDuration(p))),
    Promise.all(combinedScenePaths.map((p) => probeHasAudio(p))),
  ]);

  const totalDuration = durations.reduce((a, b) => a + b, 0);
  console.log(
    '⏱️ Concat inputs:',
    combinedScenePaths.map((p, i) => ({
      idx: i,
      path: p,
      duration: Number(durations[i].toFixed(3)),
      hasAudio: audioFlags[i],
    })),
  );

  const finalOutputPath = path.join(os.tmpdir(), 'final-video.mp4');

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error('❌ Timeout concatenating scenes after 10 minutes');
      reject(new Error('Timeout concatenating scenes'));
    }, 10 * 60 * 1000);

    const cmd = ffmpeg();
    combinedScenePaths.forEach((p) => cmd.input(p));

    // Build filter graph: for each input, reset PTS; ensure an audio stream exists by
    // generating per-segment silent audio when missing; then concat decoded streams.
    const vfChains: string[] = [];
    const afChains: string[] = [];

    for (let i = 0; i < combinedScenePaths.length; i++) {
      vfChains.push(`[${i}:v:0]setpts=PTS-STARTPTS[v${i}]`);
      if (audioFlags[i]) {
        afChains.push(
          `[${i}:a:0]asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0[a${i}]`,
        );
      } else {
        const d = Math.max(0, durations[i]);
        afChains.push(
          `anullsrc=r=48000:cl=stereo,atrim=0:${d.toFixed(
            3,
          )},asetpts=PTS-STARTPTS[a${i}]`,
        );
      }
    }

    const concatInputs = [] as string[];
    for (let i = 0; i < combinedScenePaths.length; i++) {
      concatInputs.push(`[v${i}][a${i}]`);
    }

    const filterGraph = [
      ...vfChains,
      ...afChains,
      `${concatInputs.join('')}concat=n=${
        combinedScenePaths.length
      }:v=1:a=1[v][a]`,
    ].join(';');

    console.log('🧩 filter_complex:', filterGraph);

    cmd
      .complexFilter(filterGraph)
      .outputOptions([
        '-map',
        '[v]',
        '-map',
        '[a]',
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
        '192k',
        '-ar',
        '48000',
        '-movflags',
        '+faststart',
        '-vsync',
        '2',
        '-threads',
        '0',
      ])
      // Force output long enough to cover all segments (guard against stray timestamps)
      .outputOptions(['-t', totalDuration.toFixed(3)])
      .output(finalOutputPath)
      .on('end', () => {
        clearTimeout(timeout);
        console.log('✅ All scenes concatenated successfully');
        // Clean up temporary scene files
        combinedScenePaths.forEach((scenePath) => {
          if (fs.existsSync(scenePath)) fs.unlinkSync(scenePath);
        });
        resolve(finalOutputPath);
      })
      .on('error', (err: Error) => {
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
 * @param scenePosition Index of the scene being processed
 * @param userId User ID for S3 operations
 * @param timestamp Timestamp for S3 operations
 * @param isAnimated Whether this scene's video is a fixed-length Runway
 *   animation clip that should loop to cover the full audio duration
 * @returns Path to the combined scene file
 */
export async function processScene(
  videoFile: S3FileObject,
  audioFile: S3FileObject | null,
  subtitleFile: S3FileObject | null,
  scenePosition: number,
  userId: string,
  timestamp: string,
  isAnimated = false,
): Promise<string> {
  // Extract the actual scene ID from the filename
  const sceneIdMatch = videoFile.Key.match(/scene-(\d+)\.mp4/);
  const sceneId = sceneIdMatch ? parseInt(sceneIdMatch[1]) : scenePosition;

  console.log(
    `🎬 Processing scene ${scenePosition} (ID: ${sceneId}): combining video + audio + subtitle`,
  );

  // Download video file
  const videoPath = path.join(os.tmpdir(), `scene-${scenePosition}-video.mp4`);
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
    audioPath = path.join(os.tmpdir(), `scene-${scenePosition}-audio.mp3`);
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
    subtitlePath = path.join(
      os.tmpdir(),
      `scene-${scenePosition}-subtitle.ass`,
    );
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

  // Probe durations to ensure the final mux runs for the longer of the two
  // streams — for animated scenes (looped below) the audio is expected to be
  // longer, so the target duration naturally becomes the audio's length.
  const videoDuration = await probeDuration(videoPath);
  const audioDuration = audioPath ? await probeDuration(audioPath) : 0;
  const targetDuration = Math.max(videoDuration, audioDuration);
  const padVideoSeconds = audioPath
    ? Math.max(0, audioDuration - videoDuration)
    : 0;

  // Combine video + audio + subtitle for this scene
  const combinedScenePath = path.join(
    os.tmpdir(),
    `scene-${scenePosition}-combined.mp4`,
  );

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error(
        `❌ Timeout combining scene ${scenePosition} after 5 minutes`,
      );
      reject(new Error(`Timeout combining scene ${scenePosition}`));
    }, 5 * 60 * 1000); // 5 minute timeout

    const command = ffmpeg().input(videoPath);

    if (isAnimated) {
      // Animated scenes have a fixed-length Runway clip (e.g. 5s) that is
      // often shorter than the narration — loop it indefinitely and rely on
      // the explicit -t below to cut it to exactly the target duration.
      command.inputOptions(['-stream_loop', '-1']);
    }

    if (audioPath) {
      command.input(audioPath);
      command.outputOptions([
        '-map',
        '1:a:0',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-filter:a',
        'apad',
      ]);
    }

    command.outputOptions([
      '-map',
      '0:v:0',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '28',
      '-pix_fmt',
      'yuv420p',
      '-vsync',
      '1',
      '-threads',
      '0',
      '-t',
      targetDuration.toFixed(3),
    ]);

    // Build video filters: subtitles + optional freeze-frame padding when
    // the (non-looped) video is naturally a little shorter than the audio.
    const vfParts: string[] = [];
    if (subtitlePath && fs.existsSync(subtitlePath)) {
      vfParts.push(`ass=${subtitlePath}:fontsdir=/opt/fonts`);
    }
    if (!isAnimated && padVideoSeconds > 0.005) {
      vfParts.push(
        `tpad=stop_mode=clone:stop_duration=${padVideoSeconds.toFixed(3)}`,
      );
    }
    if (vfParts.length > 0) {
      command.outputOptions(['-vf', vfParts.join(',')]);
    }

    command
      .output(combinedScenePath)
      .on('end', async () => {
        clearTimeout(timeout);
        console.log(`✅ Scene ${scenePosition} combined successfully!`);

        // Save combined scene to S3 for testing purposes
        try {
          const combinedSceneBuffer = fs.readFileSync(combinedScenePath);
          const combinedSceneKey = `${userId}/${timestamp}.scene-${scenePosition}-combined.mp4`;

          await s3.send(
            new PutObjectCommand({
              Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
              Key: combinedSceneKey,
              Body: combinedSceneBuffer,
              ContentType: 'video/mp4',
            }),
          );

          console.log(
            `💾 Scene ${scenePosition} (ID: ${sceneId}) combined file saved to S3: ${combinedSceneKey}`,
          );
        } catch (error) {
          console.warn(
            `⚠️ Could not save combined scene ${scenePosition} (ID: ${sceneId}) to S3:`,
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
      .on('error', (err: Error) => {
        clearTimeout(timeout);
        console.error(`❌ Error combining scene ${scenePosition}:`, err);
        reject(err);
      })
      .run();
  });
}
