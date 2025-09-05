import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function getImageUrls(
  userId: string,
  timestamp: string,
): Promise<Array<{ [key: string]: string }>> {
  // Format: [{ "timestamp.scene-id.png": "signed-url" }]
  // Returns an array of objects where each object maps filename to signed URL
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
      obj.Key?.endsWith('.png'),
    ).sort((a, b) => {
      const sceneA = parseInt(a.Key?.split('scene-')[1]?.split('.')[0] || '0');
      const sceneB = parseInt(b.Key?.split('scene-')[1]?.split('.')[0] || '0');
      return sceneA - sceneB;
    });

    // Generate pre-signed URLs for each image with filename mapping
    const imageUrls = await Promise.all(
      sortedObjects.map(async (obj) => {
        if (!obj.Key) return {};

        const command = new GetObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: obj.Key,
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 36000 }); // 1 hour expiration

        // Extract filename without user prefix (e.g., "1004.scene-1.png")
        const filename = obj.Key.replace(`${userId}/`, '');

        return { [filename]: signedUrl };
      }),
    );

    console.log(`✅ Found ${imageUrls.length} images:`, imageUrls);
    return imageUrls;
  } catch (error) {
    console.error('❌ Error fetching images from S3:', error);
    return [];
  }
}
