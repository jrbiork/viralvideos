"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const handler = async (event) => {
    try {
        let request;
        if (event.body) {
            if (typeof event.body === 'string') {
                request = JSON.parse(event.body);
            }
            else {
                request = event.body;
            }
        }
        else {
            request = event;
        }
        const userId = event.requestContext?.authorizer?.userId ||
            request.userId ||
            event.queryStringParameters?.userId ||
            'demo-user';
        console.log('🔍 Fetching videos for user:', userId);
        if (!process.env.VIDEO_BUCKET_NAME) {
            console.log('❌ Error: VIDEO_BUCKET_NAME is not set');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'S3 bucket name not configured' }),
            };
        }
        console.log('📋 Listing videos for user:', userId);
        const listCommand = new client_s3_1.ListObjectsV2Command({
            Bucket: process.env.VIDEO_BUCKET_NAME,
            Prefix: `${userId}/`,
        });
        const listResponse = await s3.send(listCommand);
        console.log('✅ Listed objects:', listResponse.Contents?.length || 0);
        if (!listResponse.Contents || listResponse.Contents.length === 0) {
            console.log('📭 No videos found for user:', userId);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    videos: [],
                    message: 'No videos found',
                }),
            };
        }
        const videos = await Promise.all(listResponse.Contents.filter((object) => object.Key?.endsWith('.mp4')).map(async (object) => {
            if (!object.Key)
                return null;
            console.log('🔗 Generating pre-signed URL for:', object.Key);
            const getObjectCommand = new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_BUCKET_NAME,
                Key: object.Key,
            });
            const videoUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, getObjectCommand, {
                expiresIn: 3600,
            });
            return {
                key: object.Key,
                url: videoUrl,
                size: object.Size,
                lastModified: object.LastModified,
                timestamp: object.Key.split('/').pop()?.split('.')[0] || '',
            };
        }));
        const validVideos = videos.filter((video) => video !== null);
        console.log('✅ Generated URLs for', validVideos.length, 'videos');
        return {
            statusCode: 200,
            body: JSON.stringify({
                videos: validVideos,
                message: `Found ${validVideos.length} videos`,
            }),
        };
    }
    catch (error) {
        console.error('💥 Error in fetch videos:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to fetch videos',
                details: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};
exports.handler = handler;
