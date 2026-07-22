import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec, execFile } from 'child_process';
import { UserItem } from './user';
import { resolveFfmpegPath } from './ffmpeg';
import { getObjectFromS3 } from './s3Uploader';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

export interface Scene {
  description: string;
  duration: number;
  narration: string;
  id: number;
}

/**
 * Lists which of a video's per-scene Ken-Burns mp4 objects actually exist in
 * S3 today, keyed by full object Key (e.g. "userId/timestamp.scene-1.mp4").
 * Single existence source of truth reused by getVideoEffectUrls and by
 * hydrateManifest (manifestUtils.ts) so signed URLs are never handed out for
 * scenes whose video hasn't been generated yet.
 */
export async function listExistingSceneMp4Keys(
  userId: string,
  timestamp: string,
): Promise<Set<string>> {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
  });
  const listCommand = new ListObjectsV2Command({
    Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
    Prefix: `${userId}/${timestamp}.scene-`,
  });

  try {
    const listResult = await s3Client.send(listCommand);
    const keys = (listResult.Contents || [])
      .map((obj) => obj.Key)
      .filter((key): key is string => !!key && key.endsWith('.mp4'));
    return new Set(keys);
  } catch (error) {
    console.error('Error listing existing scene mp4 keys:', error);
    return new Set();
  }
}

export async function getVideoEffectUrls(
  userId: string,
  timestamp: string,
  scenes: Omit<Scene, 'description' | 'narration'>[],
  user: UserItem | null,
): Promise<Array<{ [key: string]: string }>> {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
  });

  try {
    const existingKeys = await listExistingSceneMp4Keys(userId, timestamp);

    if (existingKeys.size > 0) {
      console.log(
        '🎥 Video effects already generated for the timestamp:',
        existingKeys.size,
        'files found',
      );

      // Generate signed URLs for existing video files
      const signedUrlPromises = Array.from(existingKeys).map(async (key) => {
        const getObjectCommand = new GetObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: key,
        });

        const signedUrl = await getSignedUrl(s3Client, getObjectCommand, {
          expiresIn: 36000, // 10 hours
        });

        // Extract filename without user prefix (e.g., "1004.scene-1.mp4")
        const filename = key.replace(`${userId}/`, '');

        return { [filename]: signedUrl };
      });

      return await Promise.all(signedUrlPromises);
    } else {
      return await generateVideoEffects(scenes, userId, timestamp, user);
    }
  } catch (error) {
    console.error('Error checking existing video effects:', error);
    // Fallback to generating new video effects
    return await generateVideoEffects(scenes, userId, timestamp, user);
  }
}

export async function generateVideoEffects(
  scenes: Omit<Scene, 'description' | 'narration'>[],
  userId: string,
  timestamp: string,
  user: UserItem | null,
): Promise<Array<{ [key: string]: string }>> {
  // Format: [{ "timestamp.scene-id.mp4": "signed-url" }]
  try {
    console.log('🎬 Generating video effects for scenes...');

    // Process all scenes in parallel
    const videoPromises = scenes.map(async (scene, i) => {
      console.log(`🎬 Processing scene ${i + 1}`);

      // Get the image URL for this scene
      const imageKey = `${userId}/${timestamp}.scene-${scene.id}.png`;
      const imageUrl = await getImageSignedUrl(imageKey);

      if (!imageUrl) {
        throw new Error(`No image found for scene ${scene.id}`);
      }

      // Generate video with blur in/out and camera movement
      const videoSignedUrl = await generateSceneVideo(
        imageUrl,
        scene,
        userId,
        timestamp,
        user,
      );

      // Extract filename without user prefix (e.g., "1004.scene-1.mp4")
      const filename = `${timestamp}.scene-${scene.id}.mp4`;

      console.log(`✅ Scene ${i + 1} video generated: ${filename}`);
      return { [filename]: videoSignedUrl };
    });

    const settled = await Promise.allSettled(videoPromises);

    const failures = settled
      .map((result, i) => ({ result, sceneId: scenes[i].id }))
      .filter(
        (
          entry,
        ): entry is {
          result: PromiseRejectedResult;
          sceneId: number;
        } => entry.result.status === 'rejected',
      );

    if (failures.length > 0) {
      const details = failures
        .map(({ sceneId, result }) => `scene ${sceneId}: ${result.reason}`)
        .join('; ');
      console.error(`❌ Video effects failed for ${failures.length} scene(s): ${details}`);
      throw new Error(
        `Failed to generate video for ${failures.length} scene(s) — ${details}`,
      );
    }

    const videoUrls = settled
      .filter(
        (result): result is PromiseFulfilledResult<{ [key: string]: string }> =>
          result.status === 'fulfilled',
      )
      .map((result) => result.value);

    if (videoUrls.length === 0) {
      console.log('❌ Error: No videos were generated');
      throw new Error('No videos were generated');
    }

    console.log(`✅ Generated ${videoUrls.length} video clips with effects`);
    return videoUrls;
  } catch (error) {
    console.error('❌ Error in generateVideoEffects:', error);
    throw error;
  }
}

export async function getImageSignedUrl(
  imageKey: string,
): Promise<string | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
      Key: imageKey,
    });

    return await getSignedUrl(s3, command, { expiresIn: 36000 });
  } catch (error) {
    console.error(`❌ Error getting signed URL for ${imageKey}:`, error);
    return null;
  }
}

export async function generateSceneVideo(
  imageUrl: string,
  scene: Omit<Scene, 'description' | 'narration'>,
  userId: string,
  timestamp: string,
  user: UserItem | null,
): Promise<string> {
  try {
    // Download the image
    console.log(`📥 Downloading image from: ${imageUrl}`);
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    });
    const imageBuffer = Buffer.from(imageResponse.data);

    // Create temporary files
    const tempDir = '/tmp';
    const inputImagePath = path.join(tempDir, `input-${scene.id}.png`);
    const outputVideoPath = path.join(tempDir, `output-${scene.id}.mp4`);

    let watermarkPath = '';
    // download the watermark.png from viral short parts bucket
    if (
      user?.subscription?.mode === 'free' ||
      user?.subscription?.status === 'cancelled' ||
      user?.subscription?.status === 'expired'
    ) {
      try {
        const watermarkKey = 'watermark.png';
        const watermarkUrl = await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: watermarkKey,
          }),
        );

        const watermarkResponse = await axios.get(watermarkUrl, {
          responseType: 'arraybuffer',
        });
        const watermarkBuffer = Buffer.from(watermarkResponse.data);

        // Write watermark to temp file
        watermarkPath = path.join(tempDir, `watermark-${scene.id}.png`);
        fs.writeFileSync(watermarkPath, watermarkBuffer);
      } catch (watermarkError) {
        console.error(
          '⚠️ Failed to fetch watermark, continuing without it:',
          watermarkError,
        );
        watermarkPath = '';
      }
    }

    // Write image to temp file
    fs.writeFileSync(inputImagePath, imageBuffer);

    const frames = Math.floor(scene.duration * 25);
    const blurInDuration = 0.2;
    const zoomOutFrames = Math.max(1, Math.floor(blurInDuration * 25));

    // add near your other params
    const moveRadius = 25; // px (more intentional and visible)
    const movePeriod = 180; // frames (~7.2s @25fps) - faster movement

    // deterministically choose one of three motion variants per scene (index-based)
    const variant = scene.id % 3; // 0: dramatic pop-out+drift, 1: strong zoom-in, 2: strong zoom-out
    console.log(`🎨 Motion variant selected (index-based): ${variant}`);

    // Motion variant configurations
    const motionVariants = {
      0: {
        // Variant 0: dramatic zoom-out pop then hold zoom + pronounced circular drift
        zoom: `if(lte(on\\,${zoomOutFrames})\\,1.15-(0.08*on/${zoomOutFrames})\\,1.08)`,
        x: `iw/2-(iw/zoom/2) + if(gte(on\\,${zoomOutFrames})\\, ${moveRadius}*cos(2*PI*(on-${zoomOutFrames})/${movePeriod})\\, 0)`,
        y: `ih/2-(ih/zoom/2) + if(gte(on\\,${zoomOutFrames})\\, ${moveRadius}*sin(2*PI*(on-${zoomOutFrames})/${movePeriod})\\, 0)`,
        supersample: '1440x2560',
        tmix: "frames=2:weights='1 1'",
        scale: 'scale=720:1280:flags=spline:sws_dither=none',
      },
      1: {
        // Variant 1: strong continuous zoom-in (Ken Burns) + pronounced circular drift
        zoom: 'min(pow(1.0012\\,on)\\,1.15)',
        x: `iw/2-(iw/zoom/2) + ${moveRadius}*cos(2*PI*on/${movePeriod})`,
        y: `ih/2-(ih/zoom/2) + ${moveRadius}*sin(2*PI*on/${movePeriod})`,
        supersample: '1440x2560',
        tmix: "frames=2:weights='1 1'",
        scale: 'scale=720:1280:flags=lanczos:sws_dither=none',
      },
      2: {
        // Variant 2: strong continuous zoom-out + pronounced elliptical drift
        zoom: `max(1.05\\, 1.12 - 0.07*on/${frames})`,
        x: `iw/2-(iw/zoom/2) + ${moveRadius}*cos(2*PI*on/${movePeriod})`,
        y: `ih/2-(ih/zoom/2) + (${moveRadius}/1.2)*sin(2*PI*on/${movePeriod})`,
        supersample: '1440x2560',
        tmix: "frames=2:weights='1 1'",
        scale: 'scale=720:1280:flags=lanczos:sws_dither=none',
      },
    };

    const config = motionVariants[variant as keyof typeof motionVariants];

    // Build filter graph conditionally depending on watermark availability
    const hasWatermark = Boolean(
      watermarkPath && watermarkPath.trim().length > 0,
    );

    const filterComplex = hasWatermark
      ? `[0:v]zoompan=z='${config.zoom}':d=${frames}:` +
        `x='${config.x}':` +
        `y='${config.y}':` +
        `s=${config.supersample},` +
        `tmix=${config.tmix},` +
        `fps=25,` +
        `${config.scale},` +
        `split[b0][b1];` +
        `[b1]boxblur=8:1[bb];` +
        `[b0][bb]blend=all_expr='A*(1-max(0\,1 - T/${blurInDuration})) + B*max(0\,1 - T/${blurInDuration})'[main];` +
        `[1:v]scale=200:-1[watermark];` +
        `[main][watermark]overlay=(W-w)/2:12[v]`
      : `[0:v]zoompan=z='${config.zoom}':d=${frames}:` +
        `x='${config.x}':` +
        `y='${config.y}':` +
        `s=${config.supersample},` +
        `tmix=${config.tmix},` +
        `fps=25,` +
        `${config.scale},` +
        `split[b0][b1];` +
        `[b1]boxblur=8:1[bb];` +
        `[b0][bb]blend=all_expr='A*(1-max(0\,1 - T/${blurInDuration})) + B*max(0\,1 - T/${blurInDuration})'[v]`;

    const ffmpegPath = resolveFfmpegPath();

    const ffmpegArgs = hasWatermark
      ? [
          '-loop',
          '1',
          '-i',
          inputImagePath,
          '-loop',
          '1',
          '-i',
          watermarkPath,
          '-filter_complex',
          filterComplex,
          '-map',
          '[v]',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-pix_fmt',
          'yuv420p',
          '-threads',
          '0',
          '-t',
          scene.duration.toString(),
          '-y',
          outputVideoPath,
        ]
      : [
          '-loop',
          '1',
          '-i',
          inputImagePath,
          '-filter_complex',
          filterComplex,
          '-map',
          '[v]',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-pix_fmt',
          'yuv420p',
          '-threads',
          '0',
          '-t',
          scene.duration.toString(),
          '-y',
          outputVideoPath,
        ];

    console.log(`🎬 Running FFmpeg command for scene ${scene.id + 1}:`);
    console.log(`🎬 Scene duration: ${scene.duration}s`);
    console.log(ffmpegPath, ffmpegArgs.join(' '));

    const { stdout, stderr } = await execFileAsync(ffmpegPath, ffmpegArgs, {
      maxBuffer: 1024 * 1024 * 10,
    });

    if (stderr) {
      console.log('FFmpeg stderr:', stderr);
    }

    if (stdout) {
      console.log('FFmpeg stdout:', stdout);
    }

    // Check if output file exists
    if (!fs.existsSync(outputVideoPath)) {
      throw new Error('FFmpeg did not generate output video file');
    }

    const cleanupTempFiles = () => {
      try {
        fs.unlinkSync(inputImagePath);
        if (hasWatermark && fs.existsSync(watermarkPath)) {
          fs.unlinkSync(watermarkPath);
        }
        fs.unlinkSync(outputVideoPath);
      } catch (cleanupError) {
        console.warn(
          '⚠️ Warning: Could not clean up temporary files:',
          cleanupError,
        );
      }
    };

    const videoKey = `${userId}/${timestamp}.scene-${scene.id}.mp4`;

    // Runway's animate-scene flow uploads its clip to this exact same key,
    // and can complete while this Ken-Burns render (kicked off at video
    // creation time) is still in flight. Re-check the manifest right before
    // uploading so the slower writer never clobbers the animated clip.
    const manifest = await getObjectFromS3(
      `${userId}/${timestamp}.manifest.json`,
    ).catch(() => null);
    const manifestScene = manifest?.scenes?.find(
      (s: { id: number; animated?: boolean }) => s.id === scene.id,
    );
    if (manifestScene?.animated) {
      console.warn(
        `⚠️ Scene ${scene.id} was animated while its Ken-Burns clip was rendering — skipping upload to avoid overwriting the animation.`,
      );
      cleanupTempFiles();
      return await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: videoKey,
        }),
        { expiresIn: 36000 },
      );
    }

    // Upload to S3
    const videoBuffer = fs.readFileSync(outputVideoPath);

    console.log(
      `☁️ Uploading video to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${videoKey}`,
    );

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Key: videoKey,
        Body: videoBuffer,
        ContentType: 'video/mp4',
      }),
    );

    cleanupTempFiles();

    console.log(`✅ Video uploaded to S3: ${videoKey}`);

    // Generate signed URL for the uploaded video
    const videoSignedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Key: videoKey,
      }),
      { expiresIn: 36000 }, // 10 hours expiration
    );

    console.log(`✅ Video signed URL generated for scene ${scene.id + 1}`);
    return videoSignedUrl;
  } catch (error) {
    console.error(
      `❌ Error generating video for scene ${scene.id + 1}:`,
      error,
    );
    throw error;
  }
}
