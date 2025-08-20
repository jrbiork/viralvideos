import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import * as fs from 'fs';

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
