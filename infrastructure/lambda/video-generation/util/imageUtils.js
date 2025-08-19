"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImageUrls = getImageUrls;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
async function getImageUrls(userId, timestamp) {
    const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
    try {
        console.log(`🔍 Fetching images for user: ${userId}, timestamp: ${timestamp}`);
        const listCommand = new client_s3_1.ListObjectsV2Command({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Prefix: `${userId}/${timestamp}.scene-`,
        });
        const response = await s3.send(listCommand);
        if (!response.Contents || response.Contents.length === 0) {
            console.log('📭 No images found for the given timestamp');
            return [];
        }
        const sortedObjects = response.Contents.filter((obj) => obj.Key?.endsWith('.jpg')).sort((a, b) => {
            const sceneA = parseInt(a.Key?.split('scene-')[1]?.split('.')[0] || '0');
            const sceneB = parseInt(b.Key?.split('scene-')[1]?.split('.')[0] || '0');
            return sceneA - sceneB;
        });
        const imageUrls = await Promise.all(sortedObjects.map(async (obj) => {
            if (!obj.Key)
                return '';
            const command = new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: obj.Key,
            });
            return await (0, s3_request_presigner_1.getSignedUrl)(s3, command, { expiresIn: 3600 });
        }));
        console.log(`✅ Found ${imageUrls.length} images:`, imageUrls);
        return imageUrls;
    }
    catch (error) {
        console.error('❌ Error fetching images from S3:', error);
        return [];
    }
}
