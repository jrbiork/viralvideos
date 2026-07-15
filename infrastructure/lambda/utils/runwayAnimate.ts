import RunwayML from '@runwayml/sdk';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

export const ANIMATION_DURATION_SECONDS = 5;

// A real Runway output clip, captured once and reused for every mock call
// so local/dev testing never spends real Runway credits.
const MOCK_ANIMATION_ASSET_PATH = path.join(
  __dirname,
  'assets',
  'mock-animation.mp4',
);

/**
 * Mock path for local/dev and automated tests — never spends real Runway
 * credits. Uploads a real, previously-captured Runway clip instead of
 * calling the API again.
 */
async function mockAnimateSceneImage(
  sceneId: number,
  userId: string,
  timestamp: string,
): Promise<string> {
  console.log(
    `🎭 MOCK - reusing captured Runway clip for scene ${sceneId} instead of calling Runway`,
  );

  const videoKey = `${userId}/${timestamp}.scene-${sceneId}.mp4`;
  const videoBuffer = fs.readFileSync(MOCK_ANIMATION_ASSET_PATH);

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
      Key: videoKey,
      Body: videoBuffer,
      ContentType: 'video/mp4',
    }),
  );

  return await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
      Key: videoKey,
    }),
    { expiresIn: 36000 },
  );
}

async function copyRemoteVideoToS3(
  sourceUrl: string,
  destKey: string,
): Promise<void> {
  const response = await axios.get(sourceUrl, { responseType: 'arraybuffer' });
  const videoBuffer = Buffer.from(response.data);

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
      Key: destKey,
      Body: videoBuffer,
      ContentType: 'video/mp4',
    }),
  );
}

/**
 * Animates a scene's existing image into a fixed 5s video via Runway's
 * gen4_turbo image-to-video model, uploading the result to the same S3 key
 * the Ken-Burns effect would otherwise occupy
 * (`${userId}/${timestamp}.scene-${sceneId}.mp4`), then returns a presigned
 * URL to the uploaded clip.
 */
export async function animateSceneImage(
  imageUrl: string,
  prompt: string,
  sceneId: number,
  userId: string,
  timestamp: string,
): Promise<string> {
  if (process.env.MOCK_IMAGE_GENERATION === 'true') {
    return await mockAnimateSceneImage(sceneId, userId, timestamp);
  }

  try {
    const client = new RunwayML({ apiKey: process.env.RUNWAY_API_KEY });

    console.log(
      `🎬 Runway - Animating scene ${sceneId} with gen4_turbo image-to-video...`,
    );
    console.log('- Prompt:', prompt);

    const task = await client.imageToVideo
      .create({
        model: 'gen4_turbo',
        promptImage: imageUrl,
        promptText: prompt,
        ratio: '720:1280',
        duration: ANIMATION_DURATION_SECONDS,
      })
      .waitForTaskOutput({ timeout: 4 * 60 * 1000 });

    const outputUrl = task.output?.[0];
    if (!outputUrl) {
      throw new Error('Runway task succeeded but returned no output URL');
    }

    console.log(`✅ Runway - Animation ready for scene ${sceneId}:`, outputUrl);

    const videoKey = `${userId}/${timestamp}.scene-${sceneId}.mp4`;
    await copyRemoteVideoToS3(outputUrl, videoKey);

    return await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Key: videoKey,
      }),
      { expiresIn: 36000 },
    );
  } catch (error) {
    console.error(`❌ Runway - Error animating scene ${sceneId}:`, error);
    throw error;
  }
}
