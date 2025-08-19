import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function getImageUrls(
  userId: string,
  timestamp: string,
): Promise<string[]> {
  const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

  try {
    console.log(
      `🔍 Fetching images for user: ${userId}, timestamp: ${timestamp}`,
    );

    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
      Prefix: `${userId}/${timestamp}.scene-`,
    });

    const response = await s3.send(listCommand);

    if (!response.Contents || response.Contents.length === 0) {
      console.log('📭 No images found for the given timestamp');
      return [];
    }

    // Sort by scene number and generate pre-signed URLs
    const sortedObjects = response.Contents.filter((obj) =>
      obj.Key?.endsWith('.jpg'),
    ).sort((a, b) => {
      const sceneA = parseInt(a.Key?.split('scene-')[1]?.split('.')[0] || '0');
      const sceneB = parseInt(b.Key?.split('scene-')[1]?.split('.')[0] || '0');
      return sceneA - sceneB;
    });

    // Generate pre-signed URLs for each image
    const imageUrls = await Promise.all(
      sortedObjects.map(async (obj) => {
        if (!obj.Key) return '';

        const command = new GetObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: obj.Key,
        });

        return await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour expiration
      }),
    );

    console.log(`✅ Found ${imageUrls.length} images:`, imageUrls);
    return imageUrls;
  } catch (error) {
    console.error('❌ Error fetching images from S3:', error);
    return [];
  }
}
