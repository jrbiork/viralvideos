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

export async function generateVideoBlurInOut(
  scenes: Scene[],
  userId: string,
  timestamp: string,
): Promise<string[]> {
  try {
    console.log('🎬 Generating video blur in/out effects for scenes...');

    const videoKeys: string[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      console.log(`🎬 Processing scene ${i + 1}: ${scene.description}`);

      try {
        // Get the image URL for this scene
        const imageKey = `${userId}/${timestamp}.scene-${scene.id}.jpg`;
        const imageUrl = await getImageSignedUrl(imageKey);

        if (!imageUrl) {
          console.error(`❌ No image found for scene ${scene.id}`);
          continue;
        }

        // Generate video with blur in/out and camera movement
        const videoKey = await generateSceneVideo(
          imageUrl,
          scene,
          i,
          userId,
          timestamp,
        );

        videoKeys.push(videoKey);
        console.log(`✅ Scene ${i + 1} video generated: ${videoKey}`);
      } catch (error) {
        console.error(`❌ Failed to generate video for scene ${i + 1}:`, error);
        throw new Error(
          `Failed to generate video for scene ${i + 1}: ${error}`,
        );
      }
    }

    if (videoKeys.length === 0) {
      console.log('❌ Error: No videos were generated');
      throw new Error('No videos were generated');
    }

    console.log(
      `✅ Generated ${videoKeys.length} video clips with blur effects`,
    );
    return videoKeys;
  } catch (error) {
    console.error('❌ Error in generateVideoBlurInOut:', error);
    throw error;
  }
}

async function getImageSignedUrl(imageKey: string): Promise<string | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
      Key: imageKey,
    });

    return await getSignedUrl(s3, command, { expiresIn: 3600 });
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

    // Create temporary files
    const tempDir = '/tmp';
    const inputImagePath = path.join(tempDir, `input-${sceneIndex}.jpg`);
    const outputVideoPath = path.join(tempDir, `output-${sceneIndex}.mp4`);

    // Write image to temp file
    fs.writeFileSync(inputImagePath, imageBuffer);

    const frames = Math.floor(scene.duration * 25);
    const blurInDuration = 0.4;
    console.log('blurInDuration3:', blurInDuration);

    const filterComplex =
      `[0:v]scale=720:1280:force_original_aspect_ratio=decrease,` +
      `pad=720:1280:(ow-iw)/2:(oh-ih)/2,` +
      // smooth zoom; cap at ~1.08 to reduce shimmer on long scenes
      `zoompan=z='min(1+0.002*on\\,1.08)':d=${frames}:` +
      // keep perfectly centered but snap to whole pixels
      `x='floor(iw/2-(iw/zoom/2))':y='floor(ih/2-(ih/zoom/2))':s=720x1280,` +
      // lock framerate & use stable resampling
      `fps=25,scale=720:1280:flags=lanczos+accurate_rnd:sws_dither=none,` +
      // blur only at the start
      `boxblur=20:1:enable='lt(t\\,${blurInDuration})'[v]`;

    const ffmpegPath = resolveFfmpegPath();

    const ffmpegArgs = [
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
      'medium',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-t',
      scene.duration.toString(),
      '-y',
      outputVideoPath,
    ];

    console.log(`🎬 Running FFmpeg command for scene ${sceneIndex + 1}:`);
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
