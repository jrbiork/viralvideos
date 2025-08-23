import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec, execFile } from 'child_process';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

export interface Scene {
  description: string;
  duration: number;
  narration: string;
  id: number;
}

function isExecutable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveFfmpegPath(): string {
  const candidates = [
    process.env.FFMPEG_PATH,
    '/opt/bin/ffmpeg',
    '/opt/ffmpeg',
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p) && isExecutable(p)) return p;
  }

  throw new Error(
    'FFmpeg binary not found. Expected at one of: ' +
      candidates.join(', ') +
      '. Ensure your Lambda layer provides ffmpeg (common path: /opt/bin/ffmpeg) or set FFMPEG_PATH.',
  );
}

export async function generateVideoEffects(
  scenes: Scene[],
  userId: string,
  timestamp: string,
): Promise<string[]> {
  try {
    console.log('🎬 Generating video effects for scenes...');

    // Process all scenes in parallel
    const videoPromises = scenes.map(async (scene, i) => {
      console.log(`🎬 Processing scene ${i + 1}: ${scene.description}`);

      try {
        // Get the image URL for this scene
        const imageKey = `${userId}/${timestamp}.scene-${scene.id}.jpg`;
        const imageUrl = await getImageSignedUrl(imageKey);

        if (!imageUrl) {
          console.error(`❌ No image found for scene ${scene.id}`);
          return null;
        }

        // Generate video with blur in/out and camera movement
        const videoKey = await generateSceneVideo(
          imageUrl,
          scene,
          i,
          userId,
          timestamp,
        );

        console.log(`✅ Scene ${i + 1} video generated: ${videoKey}`);
        return videoKey;
      } catch (error) {
        console.error(`❌ Failed to generate video for scene ${i + 1}:`, error);
        throw new Error(
          `Failed to generate video for scene ${i + 1}: ${error}`,
        );
      }
    });

    const videoKeys = (await Promise.all(videoPromises)).filter(
      (key): key is string => key !== null,
    );

    if (videoKeys.length === 0) {
      console.log('❌ Error: No videos were generated');
      throw new Error('No videos were generated');
    }

    console.log(`✅ Generated ${videoKeys.length} video clips with effects`);
    return videoKeys;
  } catch (error) {
    console.error('❌ Error in generateVideoEffects:', error);
    throw error;
  }
}

async function getImageSignedUrl(imageKey: string): Promise<string | null> {
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

async function generateSceneVideo(
  imageUrl: string,
  scene: Scene,
  sceneIndex: number,
  userId: string,
  timestamp: string,
): Promise<string> {
  try {
    // Download the image
    console.log(`📥 Downloading image from: ${imageUrl}`);
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
    });
    const imageBuffer = Buffer.from(imageResponse.data);

    // download the watermark.png from viral short parts bucket
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

    // Create temporary files
    const tempDir = '/tmp';
    const inputImagePath = path.join(tempDir, `input-${sceneIndex}.jpg`);
    const outputVideoPath = path.join(tempDir, `output-${sceneIndex}.mp4`);

    // Write image to temp file
    fs.writeFileSync(inputImagePath, imageBuffer);

    // Write watermark to temp file
    const watermarkPath = path.join(tempDir, `watermark-${sceneIndex}.png`);
    fs.writeFileSync(watermarkPath, watermarkBuffer);

    const frames = Math.floor(scene.duration * 25);
    const blurInDuration = 0.2;
    const zoomOutFrames = Math.max(1, Math.floor(blurInDuration * 25));

    // add near your other params
    const moveRadius = 25; // px (more intentional and visible)
    const movePeriod = 180; // frames (~7.2s @25fps) - faster movement

    // deterministically choose one of three motion variants per scene (index-based)
    const variant = sceneIndex % 3; // 0: dramatic pop-out+drift, 1: strong zoom-in, 2: strong zoom-out
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

    const filterComplex =
      `[0:v]zoompan=z='${config.zoom}':d=${frames}:` +
      `x='${config.x}':` +
      `y='${config.y}':` +
      `s=${config.supersample},` +
      `tmix=${config.tmix},` +
      `fps=25,` +
      `${config.scale},` +
      `split[b0][b1];` +
      `[b1]boxblur=8:1[bb];` +
      `[b0][bb]blend=all_expr='A*(1-max(0\\,1 - T/${blurInDuration})) + B*max(0\\,1 - T/${blurInDuration})'[main];` +
      `[1:v]scale=200:-1[watermark];` +
      `[main][watermark]overlay=(W-w)/2:10[v]`;

    const ffmpegPath = resolveFfmpegPath();

    const ffmpegArgs = [
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
    ];

    console.log(`🎬 Running FFmpeg command for scene ${sceneIndex + 1}:`);
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

    // Upload to S3
    const videoKey = `${userId}/${timestamp}.scene-${scene.id}.mp4`;
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

    // Clean up temporary files
    try {
      fs.unlinkSync(inputImagePath);
      fs.unlinkSync(watermarkPath);
      fs.unlinkSync(outputVideoPath);
    } catch (cleanupError) {
      console.warn(
        '⚠️ Warning: Could not clean up temporary files:',
        cleanupError,
      );
    }

    console.log(`✅ Video uploaded to S3: ${videoKey}`);
    return videoKey;
  } catch (error) {
    console.error(
      `❌ Error generating video for scene ${sceneIndex + 1}:`,
      error,
    );
    throw error;
  }
}
