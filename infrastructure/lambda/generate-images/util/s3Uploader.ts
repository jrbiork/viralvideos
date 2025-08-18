import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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
