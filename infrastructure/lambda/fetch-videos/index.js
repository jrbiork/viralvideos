"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const handler = async (event) => {
    try {
        let request;
        // Handle different event formats
        if (event.body) {
            // API Gateway format - body is a JSON string
            if (typeof event.body === 'string') {
                request = JSON.parse(event.body);
            }
            else {
                // Direct Lambda invocation - body is already an object
                request = event.body;
            }
        }
        else {
            // Direct Lambda invocation - payload is the entire event
            request = event;
        }
        // Extract user information from JWT authorizer context or request
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
        // List all manifest files for the user
        console.log('📋 Fetching all manifests for user:', userId);
        if (!process.env.VIDEO_PARTS_BUCKET_NAME) {
            console.log('❌ Error: VIDEO_PARTS_BUCKET_NAME is not set');
            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: 'Video parts bucket name not configured',
                }),
            };
        }
        const manifestListCommand = new client_s3_1.ListObjectsV2Command({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Prefix: `${userId}/`,
            Delimiter: '',
        });
        const manifestListResponse = await s3.send(manifestListCommand);
        // Filter for manifest files only
        const manifestFiles = manifestListResponse.Contents?.filter((object) => object.Key?.endsWith('.manifest.json')) || [];
        if (manifestFiles.length > 0) {
            const videoData = await Promise.all(manifestFiles.map(async (manifestObject) => {
                if (!manifestObject.Key)
                    return null;
                try {
                    // Extract timestamp from manifest key: user123/1703123456789.manifest.json -> 1703123456789
                    const timestamp = manifestObject.Key.split('/')
                        .pop()
                        ?.replace('.manifest.json', '') || '';
                    console.log('📋 Processing manifest for timestamp:', timestamp);
                    // Fetch the manifest content
                    const manifestCommand = new client_s3_1.GetObjectCommand({
                        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                        Key: manifestObject.Key,
                    });
                    const manifestResponse = await s3.send(manifestCommand);
                    const manifest = JSON.parse((await manifestResponse.Body?.transformToString()) || '{}');
                    // Get the first scene's image file path from manifest
                    const firstScene = manifest.scenes?.[0];
                    if (!firstScene?.files?.png) {
                        console.warn(`⚠️ No first scene image found for timestamp: ${timestamp}`);
                        return null;
                    }
                    // Generate presigned URL for the first scene's image
                    const thumbnailCommand = new client_s3_1.GetObjectCommand({
                        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                        Key: firstScene.files.png,
                    });
                    const thumbnailUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, thumbnailCommand, {
                        expiresIn: 36000,
                    });
                    let finalVideoUrl = '';
                    if (manifest.videoGenerated) {
                        const videoCommand = new client_s3_1.GetObjectCommand({
                            Bucket: process.env.VIDEO_BUCKET_NAME,
                            Key: manifest.finalVideoUrl,
                        });
                        finalVideoUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, videoCommand, {
                            expiresIn: 36000,
                        });
                    }
                    return {
                        key: firstScene.files.png,
                        thumbnailUrl,
                        timestamp,
                        lastModified: manifest.updatedAt,
                        videoGenerated: manifest.videoGenerated || false,
                        finalVideoUrl,
                    };
                }
                catch (error) {
                    console.error(`❌ Error processing manifest ${manifestObject.Key}:`, error);
                    return null;
                }
            }));
            // Filter out null values and sort by timestamp (newest first)
            const validVideos = videoData
                .filter((item) => item !== null)
                .sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp));
            return {
                statusCode: 200,
                body: JSON.stringify({
                    videos: validVideos,
                    message: `Found ${validVideos.length} videos`,
                }),
            };
        }
        return {
            statusCode: 200,
            body: JSON.stringify({
                videos: [],
                message: 'No videos found',
            }),
        };
    }
    catch (error) {
        console.error('💥 Error in fetch videos:', error);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxrREFJNEI7QUFDNUIsd0VBQTZEO0FBRTdELE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBTXBFLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFDMUIsS0FBMkIsRUFDSyxFQUFFO0lBQ2xDLElBQUksQ0FBQztRQUNILElBQUksT0FBMkIsQ0FBQztRQUVoQyxpQ0FBaUM7UUFDakMsSUFBSSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDZiw2Q0FBNkM7WUFDN0MsSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQ25DLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQyxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sdURBQXVEO2dCQUN2RCxPQUFPLEdBQUcsS0FBSyxDQUFDLElBQTBCLENBQUM7WUFDN0MsQ0FBQztRQUNILENBQUM7YUFBTSxDQUFDO1lBQ04seURBQXlEO1lBQ3pELE9BQU8sR0FBRyxLQUFZLENBQUM7UUFDekIsQ0FBQztRQUVELGtFQUFrRTtRQUNsRSxNQUFNLE1BQU0sR0FDVixLQUFLLENBQUMsY0FBYyxFQUFFLFVBQVUsRUFBRSxNQUFNO1lBQ3hDLE9BQU8sQ0FBQyxNQUFNO1lBQ2QsS0FBSyxDQUFDLHFCQUFxQixFQUFFLE1BQU07WUFDbkMsV0FBVyxDQUFDO1FBRWQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUVwRCxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ25DLE9BQU8sQ0FBQyxHQUFHLENB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QUFDLENBQUMsSUFBSSxFQUFvQyxFQUFFLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQztpQkFDakUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFFakUsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDbkIsTUFBTSxFQUFFLFdBQVc7b0JBQ25CLE9BQU8sRUFBRSxTQUFTLFdBQVcsQ0FBQyxNQUFNLFNBQVM7aUJBQzlDLENBQUM7YUFDSCxDQUFDO1FBQ0osQ0FBQztRQUVELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixNQUFNLEVBQUUsRUFBRTtnQkFDVixPQUFPLEVBQUUsaUJBQWlCO2FBQzNCLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDJCQUEyQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRWxELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixLQUFLLEVBQUUsd0JBQXdCO2dCQUMvQixPQUFPLEVBQUUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZTthQUNsRSxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUExS1csUUFBQSxPQUFPLFdBMEtsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7XG4gIFMzQ2xpZW50LFxuICBMaXN0T2JqZWN0c1YyQ29tbWFuZCxcbiAgR2V0T2JqZWN0Q29tbWFuZCxcbn0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcbmltcG9ydCB7IGdldFNpZ25lZFVybCB9IGZyb20gJ0Bhd3Mtc2RrL3MzLXJlcXVlc3QtcHJlc2lnbmVyJztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmludGVyZmFjZSBGZXRjaFZpZGVvc1JlcXVlc3Qge1xuICB1c2VySWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoXG4gIGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCxcbik6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIHRyeSB7XG4gICAgbGV0IHJlcXVlc3Q6IEZldGNoVmlkZW9zUmVxdWVzdDtcblxuICAgIC8vIEhhbmRsZSBkaWZmZXJlbnQgZXZlbnQgZm9ybWF0c1xuICAgIGlmIChldmVudC5ib2R5KSB7XG4gICAgICAvLyBBUEkgR2F0ZXdheSBmb3JtYXQgLSBib2R5IGlzIGEgSlNPTiBzdHJpbmdcbiAgICAgIGlmICh0eXBlb2YgZXZlbnQuYm9keSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmVxdWVzdCA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEaXJlY3QgTGFtYmRhIGludm9jYXRpb24gLSBib2R5IGlzIGFscmVhZHkgYW4gb2JqZWN0XG4gICAgICAgIHJlcXVlc3QgPSBldmVudC5ib2R5IGFzIEZldGNoVmlkZW9zUmVxdWVzdDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRGlyZWN0IExhbWJkYSBpbnZvY2F0aW9uIC0gcGF5bG9hZCBpcyB0aGUgZW50aXJlIGV2ZW50XG4gICAgICByZXF1ZXN0ID0gZXZlbnQgYXMgYW55O1xuICAgIH1cblxuICAgIC8vIEV4dHJhY3QgdXNlciBpbmZvcm1hdGlvbiBmcm9tIEpXVCBhdXRob3JpemVyIGNvbnRleHQgb3IgcmVxdWVzdFxuICAgIGNvbnN0IHVzZXJJZCA9XG4gICAgICBldmVudC5yZXF1ZXN0Q29udGV4dD8uYXV0aG9yaXplcj8udXNlcklkIHx8XG4gICAgICByZXF1ZXN0LnVzZXJJZCB8fFxuICAgICAgZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzPy51c2VySWQgfHxcbiAgICAgICdkZW1vLXVzZXInO1xuXG4gICAgY29uc29sZS5sb2coJ/CflI0gRmV0Y2hpbmcgdmlkZW9zIGZvciB1c2VyOicsIHVzZXJJZCk7XG5cbiAgICBpZiAoIXByb2Nlc3MuZW52LlZJREVPX0JVQ0tFVF9OQU1FKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBWSURFT19CVUNLRVRfTkFNRSBpcyBub3Qgc2V0Jyk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdTMyBidWNrZXQgbmFtZSBub3QgY29uZmlndXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIExpc3QgYWxsIG1hbmlmZXN0IGZpbGVzIGZvciB0aGUgdXNlclxuICAgIGNvbnNvbGUubG9nKCfwn5OLIEZldGNoaW5nIGFsbCBtYW5pZmVzdHMgZm9yIHVzZXI6JywgdXNlcklkKTtcblxuICAgIGlmICghcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FIGlzIG5vdCBzZXQnKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGVycm9yOiAnVmlkZW8gcGFydHMgYnVja2V0IG5hbWUgbm90IGNvbmZpZ3VyZWQnLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWFuaWZlc3RMaXN0Q29tbWFuZCA9IG5ldyBMaXN0T2JqZWN0c1YyQ29tbWFuZCh7XG4gICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgUHJlZml4OiBgJHt1c2VySWR9L2AsXG4gICAgICBEZWxpbWl0ZXI6ICcnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgbWFuaWZlc3RMaXN0UmVzcG9uc2UgPSBhd2FpdCBzMy5zZW5kKG1hbmlmZXN0TGlzdENvbW1hbmQpO1xuXG4gICAgLy8gRmlsdGVyIGZvciBtYW5pZmVzdCBmaWxlcyBvbmx5XG4gICAgY29uc3QgbWFuaWZlc3RGaWxlcyA9XG4gICAgICBtYW5pZmVzdExpc3RSZXNwb25zZS5Db250ZW50cz8uZmlsdGVyKChvYmplY3Q6IGFueSkgPT5cbiAgICAgICAgb2JqZWN0LktleT8uZW5kc1dpdGgoJy5tYW5pZmVzdC5qc29uJyksXG4gICAgICApIHx8IFtdO1xuXG4gICAgaWYgKG1hbmlmZXN0RmlsZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgdmlkZW9EYXRhID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgIG1hbmlmZXN0RmlsZXMubWFwKGFzeW5jIChtYW5pZmVzdE9iamVjdDogYW55KSA9PiB7XG4gICAgICAgICAgaWYgKCFtYW5pZmVzdE9iamVjdC5LZXkpIHJldHVybiBudWxsO1xuXG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIEV4dHJhY3QgdGltZXN0YW1wIGZyb20gbWFuaWZlc3Qga2V5OiB1c2VyMTIzLzE3MDMxMjM0NTY3ODkubWFuaWZlc3QuanNvbiAtPiAxNzAzMTIzNDU2Nzg5XG4gICAgICAgICAgICBjb25zdCB0aW1lc3RhbXAgPVxuICAgICAgICAgICAgICBtYW5pZmVzdE9iamVjdC5LZXkuc3BsaXQoJy8nKVxuICAgICAgICAgICAgICAgIC5wb3AoKVxuICAgICAgICAgICAgICAgID8ucmVwbGFjZSgnLm1hbmlmZXN0Lmpzb24nLCAnJykgfHwgJyc7XG5cbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCfwn5OLIFByb2Nlc3NpbmcgbWFuaWZlc3QgZm9yIHRpbWVzdGFtcDonLCB0aW1lc3RhbXApO1xuXG4gICAgICAgICAgICAvLyBGZXRjaCB0aGUgbWFuaWZlc3QgY29udGVudFxuICAgICAgICAgICAgY29uc3QgbWFuaWZlc3RDb21tYW5kID0gbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgICAgICBLZXk6IG1hbmlmZXN0T2JqZWN0LktleSxcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjb25zdCBtYW5pZmVzdFJlc3BvbnNlID0gYXdhaXQgczMuc2VuZChtYW5pZmVzdENvbW1hbmQpO1xuXG4gICAgICAgICAgICBjb25zdCBtYW5pZmVzdCA9IEpTT04ucGFyc2UoXG4gICAgICAgICAgICAgIChhd2FpdCBtYW5pZmVzdFJlc3BvbnNlLkJvZHk/LnRyYW5zZm9ybVRvU3RyaW5nKCkpIHx8ICd7fScsXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAvLyBHZXQgdGhlIGZpcnN0IHNjZW5lJ3MgaW1hZ2UgZmlsZSBwYXRoIGZyb20gbWFuaWZlc3RcbiAgICAgICAgICAgIGNvbnN0IGZpcnN0U2NlbmUgPSBtYW5pZmVzdC5zY2VuZXM/LlswXTtcbiAgICAgICAgICAgIGlmICghZmlyc3RTY2VuZT8uZmlsZXM/LnBuZykge1xuICAgICAgICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICAgICAgYOKaoO+4jyBObyBmaXJzdCBzY2VuZSBpbWFnZSBmb3VuZCBmb3IgdGltZXN0YW1wOiAke3RpbWVzdGFtcH1gLFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gR2VuZXJhdGUgcHJlc2lnbmVkIFVSTCBmb3IgdGhlIGZpcnN0IHNjZW5lJ3MgaW1hZ2VcbiAgICAgICAgICAgIGNvbnN0IHRodW1ibmFpbENvbW1hbmQgPSBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgICAgIEtleTogZmlyc3RTY2VuZS5maWxlcy5wbmcsXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgdGh1bWJuYWlsVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKHMzLCB0aHVtYm5haWxDb21tYW5kLCB7XG4gICAgICAgICAgICAgIGV4cGlyZXNJbjogMzYwMDAsXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbGV0IGZpbmFsVmlkZW9VcmwgPSAnJztcbiAgICAgICAgICAgIGlmIChtYW5pZmVzdC52aWRlb0dlbmVyYXRlZCkge1xuICAgICAgICAgICAgICBjb25zdCB2aWRlb0NvbW1hbmQgPSBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19CVUNLRVRfTkFNRSxcbiAgICAgICAgICAgICAgICBLZXk6IG1hbmlmZXN0LmZpbmFsVmlkZW9VcmwsXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBmaW5hbFZpZGVvVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKHMzLCB2aWRlb0NvbW1hbmQsIHtcbiAgICAgICAgICAgICAgICBleHBpcmVzSW46IDM2MDAwLFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAga2V5OiBmaXJzdFNjZW5lLmZpbGVzLnBuZyxcbiAgICAgICAgICAgICAgdGh1bWJuYWlsVXJsLFxuICAgICAgICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgICAgICAgIGxhc3RNb2RpZmllZDogbWFuaWZlc3QudXBkYXRlZEF0LFxuICAgICAgICAgICAgICB2aWRlb0dlbmVyYXRlZDogbWFuaWZlc3QudmlkZW9HZW5lcmF0ZWQgfHwgZmFsc2UsXG4gICAgICAgICAgICAgIGZpbmFsVmlkZW9VcmwsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgICBg4p2MIEVycm9yIHByb2Nlc3NpbmcgbWFuaWZlc3QgJHttYW5pZmVzdE9iamVjdC5LZXl9OmAsXG4gICAgICAgICAgICAgIGVycm9yLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgICAvLyBGaWx0ZXIgb3V0IG51bGwgdmFsdWVzIGFuZCBzb3J0IGJ5IHRpbWVzdGFtcCAobmV3ZXN0IGZpcnN0KVxuICAgICAgY29uc3QgdmFsaWRWaWRlb3MgPSB2aWRlb0RhdGFcbiAgICAgICAgLmZpbHRlcigoaXRlbSk6IGl0ZW0gaXMgTm9uTnVsbGFibGU8dHlwZW9mIGl0ZW0+ID0+IGl0ZW0gIT09IG51bGwpXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBwYXJzZUludChiLnRpbWVzdGFtcCkgLSBwYXJzZUludChhLnRpbWVzdGFtcCkpO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICB2aWRlb3M6IHZhbGlkVmlkZW9zLFxuICAgICAgICAgIG1lc3NhZ2U6IGBGb3VuZCAke3ZhbGlkVmlkZW9zLmxlbmd0aH0gdmlkZW9zYCxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHZpZGVvczogW10sXG4gICAgICAgIG1lc3NhZ2U6ICdObyB2aWRlb3MgZm91bmQnLFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfwn5KlIEVycm9yIGluIGZldGNoIHZpZGVvczonLCBlcnJvcik7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBlcnJvcjogJ0ZhaWxlZCB0byBmZXRjaCB2aWRlb3MnLFxuICAgICAgICBkZXRhaWxzOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=