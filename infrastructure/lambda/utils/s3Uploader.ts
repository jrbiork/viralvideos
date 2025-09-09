import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';
import axios from 'axios';

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function uploadToS3(
  filePath: string,
  userId: string,
  timestamp: string,
): Promise<string> {
  try {
    const fileBuffer = fs.readFileSync(filePath);

    const videoKey = `${userId}/${timestamp}-final-video.mp4`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.VIDEO_BUCKET_NAME,
        Key: videoKey,
        Body: fileBuffer,
        ContentType: 'video/mp4',
      }),
    );

    return videoKey;
  } catch (error) {
    console.error('❌ Error uploading to S3:', error);
    throw error;
  }
}

export async function uploadJsonToS3(
  jsonContent: string,
  key: string,
  bucketName?: string,
): Promise<string> {
  try {
    const bucket = bucketName || process.env.VIDEO_PARTS_BUCKET_NAME;

    if (!bucket) {
      throw new Error(
        'Bucket name not provided and VIDEO_PARTS_BUCKET_NAME not set',
      );
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: jsonContent,
        ContentType: 'application/json',
      }),
    );

    return key;
  } catch (error) {
    console.error('❌ Error uploading JSON to S3:', error);
    throw error;
  }
}

export async function getObjectFromS3(
  key: string,
  bucketName?: string,
): Promise<any | null> {
  try {
    const bucket = bucketName || process.env.VIDEO_PARTS_BUCKET_NAME;

    if (!bucket) {
      throw new Error(
        'Bucket name not provided and VIDEO_PARTS_BUCKET_NAME not set',
      );
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await s3.send(command);

    if (!response.Body) {
      return null;
    }

    // Convert the readable stream to string
    const streamReader = response.Body.transformToString();
    const content = await streamReader;

    // Try to parse as JSON, if it fails return as string
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  } catch (error) {
    // If the object doesn't exist, return null instead of throwing
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'NoSuchKey'
    ) {
      return null;
    }
    console.error(`❌ Error getting object from S3 (${key}):`, error);
    return null;
  }
}

/**
 * Download an image from a URL and upload it to S3
 * @param imageUrl - The URL of the image to download
 * @param userId - The user ID for the S3 key
 * @param timestamp - The timestamp for the S3 key
 * @param sceneId - The scene ID (optional, falls back to scenePosition)
 * @param scenePosition - The scene index (optional, falls back to sceneId)
 * @returns Promise<string> - The S3 key where the image was uploaded
 */
export async function uploadImageToS3(
  imageUrl: string,
  userId: string,
  timestamp: string,
  sceneId?: number,
): Promise<string> {
  try {
    // Download the image from the URL
    console.log(`📥 Downloading image from: ${imageUrl}`);
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    console.log(`✅ Downloaded image, status: ${response.status}`);

    const imageBuffer = Buffer.from(response.data);

    // Generate the S3 key
    const imageKey = `${userId}/${timestamp}.scene-${sceneId}.png`;

    console.log(
      `☁️ Uploading image to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${imageKey}`,
    );

    // Upload to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Key: imageKey,
        Body: imageBuffer,
        ContentType: 'image/jpeg',
      }),
    );

    console.log(`✅ Uploaded image to S3: ${imageKey}`);
    return imageKey;
  } catch (error) {
    console.error('❌ Error uploading image to S3:', error);
    throw error;
  }
}
