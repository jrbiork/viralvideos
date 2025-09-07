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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxrREFJNEI7QUFDNUIsd0VBQTZEO0FBRTdELE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBTXBFLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFDMUIsS0FBMkIsRUFDSyxFQUFFO0lBQ2xDLElBQUksQ0FBQztRQUNILElBQUksT0FBMkIsQ0FBQztRQUVoQyxpQ0FBaUM7UUFDakMsSUFBSSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDZiw2Q0FBNkM7WUFDN0MsSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQ25DLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQyxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sdURBQXVEO2dCQUN2RCxPQUFPLEdBQUcsS0FBSyxDQUFDLElBQTBCLENBQUM7WUFDN0MsQ0FBQztRQUNILENBQUM7YUFBTSxDQUFDO1lBQ04seURBQXlEO1lBQ3pELE9BQU8sR0FBRyxLQUFZLENBQUM7UUFDekIsQ0FBQztRQUVELGtFQUFrRTtRQUNsRSxNQUFNLE1BQU0sR0FDVixLQUFLLENBQUMsY0FBYyxFQUFFLFVBQVUsRUFBRSxNQUFNO1lBQ3hDLE9BQU8sQ0FBQyxNQUFNO1lBQ2QsS0FBSyxDQUFDLHFCQUFxQixFQUFFLE1BQU07WUFDbkMsV0FBVyxDQUFDO1FBRWQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUVwRCxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ25DLE9BQU8sQ0FBQyxHQUFHLENB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QUksS0FBSyxJQUFJLENBQUM7aUJBQ2pFLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBRWpFLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7b0JBQ25CLE1BQU0sRUFBRSxXQUFXO29CQUNuQixPQUFPLEVBQUUsU0FBUyxXQUFXLENBQUMsTUFBTSxTQUFTO2lCQUM5QyxDQUFDO2FBQ0gsQ0FBQztRQUNKLENBQUM7UUFFRCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsTUFBTSxFQUFFLEVBQUU7Z0JBQ1YsT0FBTyxFQUFFLGlCQUFpQjthQUMzQixDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVsRCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsS0FBSyxFQUFFLHdCQUF3QjtnQkFDL0IsT0FBTyxFQUFFLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWU7YUFDbEUsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBektXLFFBQUEsT0FBTyxXQXlLbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQge1xuICBTM0NsaWVudCxcbiAgTGlzdE9iamVjdHNWMkNvbW1hbmQsXG4gIEdldE9iamVjdENvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgeyBnZXRTaWduZWRVcmwgfSBmcm9tICdAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lcic7XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5pbnRlcmZhY2UgRmV0Y2hWaWRlb3NSZXF1ZXN0IHtcbiAgdXNlcklkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICB0cnkge1xuICAgIGxldCByZXF1ZXN0OiBGZXRjaFZpZGVvc1JlcXVlc3Q7XG5cbiAgICAvLyBIYW5kbGUgZGlmZmVyZW50IGV2ZW50IGZvcm1hdHNcbiAgICBpZiAoZXZlbnQuYm9keSkge1xuICAgICAgLy8gQVBJIEdhdGV3YXkgZm9ybWF0IC0gYm9keSBpcyBhIEpTT04gc3RyaW5nXG4gICAgICBpZiAodHlwZW9mIGV2ZW50LmJvZHkgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJlcXVlc3QgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRGlyZWN0IExhbWJkYSBpbnZvY2F0aW9uIC0gYm9keSBpcyBhbHJlYWR5IGFuIG9iamVjdFxuICAgICAgICByZXF1ZXN0ID0gZXZlbnQuYm9keSBhcyBGZXRjaFZpZGVvc1JlcXVlc3Q7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIERpcmVjdCBMYW1iZGEgaW52b2NhdGlvbiAtIHBheWxvYWQgaXMgdGhlIGVudGlyZSBldmVudFxuICAgICAgcmVxdWVzdCA9IGV2ZW50IGFzIGFueTtcbiAgICB9XG5cbiAgICAvLyBFeHRyYWN0IHVzZXIgaW5mb3JtYXRpb24gZnJvbSBKV1QgYXV0aG9yaXplciBjb250ZXh0IG9yIHJlcXVlc3RcbiAgICBjb25zdCB1c2VySWQgPVxuICAgICAgZXZlbnQucmVxdWVzdENvbnRleHQ/LmF1dGhvcml6ZXI/LnVzZXJJZCB8fFxuICAgICAgcmVxdWVzdC51c2VySWQgfHxcbiAgICAgIGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycz8udXNlcklkIHx8XG4gICAgICAnZGVtby11c2VyJztcblxuICAgIGNvbnNvbGUubG9nKCfwn5SNIEZldGNoaW5nIHZpZGVvcyBmb3IgdXNlcjonLCB1c2VySWQpO1xuXG4gICAgaWYgKCFwcm9jZXNzLmVudi5WSURFT19CVUNLRVRfTkFNRSkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogVklERU9fQlVDS0VUX05BTUUgaXMgbm90IHNldCcpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUzMgYnVja2V0IG5hbWUgbm90IGNvbmZpZ3VyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBMaXN0IGFsbCBtYW5pZmVzdCBmaWxlcyBmb3IgdGhlIHVzZXJcbiAgICBjb25zb2xlLmxvZygn8J+TiyBGZXRjaGluZyBhbGwgbWFuaWZlc3RzIGZvciB1c2VyOicsIHVzZXJJZCk7XG5cbiAgICBpZiAoIXByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBWSURFT19QQVJUU19CVUNLRVRfTkFNRSBpcyBub3Qgc2V0Jyk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ1ZpZGVvIHBhcnRzIGJ1Y2tldCBuYW1lIG5vdCBjb25maWd1cmVkJyxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IG1hbmlmZXN0TGlzdENvbW1hbmQgPSBuZXcgTGlzdE9iamVjdHNWMkNvbW1hbmQoe1xuICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgIFByZWZpeDogYCR7dXNlcklkfS9gLFxuICAgICAgRGVsaW1pdGVyOiAnJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IG1hbmlmZXN0TGlzdFJlc3BvbnNlID0gYXdhaXQgczMuc2VuZChtYW5pZmVzdExpc3RDb21tYW5kKTtcblxuICAgIC8vIEZpbHRlciBmb3IgbWFuaWZlc3QgZmlsZXMgb25seVxuICAgIGNvbnN0IG1hbmlmZXN0RmlsZXMgPVxuICAgICAgbWFuaWZlc3RMaXN0UmVzcG9uc2UuQ29udGVudHM/LmZpbHRlcigob2JqZWN0OiBhbnkpID0+XG4gICAgICAgIG9iamVjdC5LZXk/LmVuZHNXaXRoKCcubWFuaWZlc3QuanNvbicpLFxuICAgICAgKSB8fCBbXTtcblxuICAgIGlmIChtYW5pZmVzdEZpbGVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IHZpZGVvRGF0YSA9IGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgICBtYW5pZmVzdEZpbGVzLm1hcChhc3luYyAobWFuaWZlc3RPYmplY3Q6IGFueSkgPT4ge1xuICAgICAgICAgIGlmICghbWFuaWZlc3RPYmplY3QuS2V5KSByZXR1cm4gbnVsbDtcblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBFeHRyYWN0IHRpbWVzdGFtcCBmcm9tIG1hbmlmZXN0IGtleTogdXNlcjEyMy8xNzAzMTIzNDU2Nzg5Lm1hbmlmZXN0Lmpzb24gLT4gMTcwMzEyMzQ1Njc4OVxuICAgICAgICAgICAgY29uc3QgdGltZXN0YW1wID1cbiAgICAgICAgICAgICAgbWFuaWZlc3RPYmplY3QuS2V5LnNwbGl0KCcvJylcbiAgICAgICAgICAgICAgICAucG9wKClcbiAgICAgICAgICAgICAgICA/LnJlcGxhY2UoJy5tYW5pZmVzdC5qc29uJywgJycpIHx8ICcnO1xuXG4gICAgICAgICAgICBjb25zb2xlLmxvZygn8J+TiyBQcm9jZXNzaW5nIG1hbmlmZXN0IGZvciB0aW1lc3RhbXA6JywgdGltZXN0YW1wKTtcblxuICAgICAgICAgICAgLy8gRmV0Y2ggdGhlIG1hbmlmZXN0IGNvbnRlbnRcbiAgICAgICAgICAgIGNvbnN0IG1hbmlmZXN0Q29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICAgICAgS2V5OiBtYW5pZmVzdE9iamVjdC5LZXksXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgbWFuaWZlc3RSZXNwb25zZSA9IGF3YWl0IHMzLnNlbmQobWFuaWZlc3RDb21tYW5kKTtcblxuICAgICAgICAgICAgY29uc3QgbWFuaWZlc3QgPSBKU09OLnBhcnNlKFxuICAgICAgICAgICAgICAoYXdhaXQgbWFuaWZlc3RSZXNwb25zZS5Cb2R5Py50cmFuc2Zvcm1Ub1N0cmluZygpKSB8fCAne30nLFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgLy8gR2V0IHRoZSBmaXJzdCBzY2VuZSdzIGltYWdlIGZpbGUgcGF0aCBmcm9tIG1hbmlmZXN0XG4gICAgICAgICAgICBjb25zdCBmaXJzdFNjZW5lID0gbWFuaWZlc3Quc2NlbmVzPy5bMF07XG4gICAgICAgICAgICBpZiAoIWZpcnN0U2NlbmU/LmZpbGVzPy5wbmcpIHtcbiAgICAgICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgICAgIGDimqDvuI8gTm8gZmlyc3Qgc2NlbmUgaW1hZ2UgZm91bmQgZm9yIHRpbWVzdGFtcDogJHt0aW1lc3RhbXB9YCxcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEdlbmVyYXRlIHByZXNpZ25lZCBVUkwgZm9yIHRoZSBmaXJzdCBzY2VuZSdzIGltYWdlXG4gICAgICAgICAgICBjb25zdCB0aHVtYm5haWxDb21tYW5kID0gbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgICAgICBLZXk6IGZpcnN0U2NlbmUuZmlsZXMucG5nLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHRodW1ibmFpbFVybCA9IGF3YWl0IGdldFNpZ25lZFVybChzMywgdGh1bWJuYWlsQ29tbWFuZCwge1xuICAgICAgICAgICAgICBleHBpcmVzSW46IDM2MDAwLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxldCBmaW5hbFZpZGVvVXJsID0gJyc7XG4gICAgICAgICAgICBpZiAobWFuaWZlc3QudmlkZW9HZW5lcmF0ZWQpIHtcbiAgICAgICAgICAgICAgY29uc3QgdmlkZW9Db21tYW5kID0gbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fQlVDS0VUX05BTUUsXG4gICAgICAgICAgICAgICAgS2V5OiBtYW5pZmVzdC5maW5hbFZpZGVvVXJsLFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgZmluYWxWaWRlb1VybCA9IGF3YWl0IGdldFNpZ25lZFVybChzMywgdmlkZW9Db21tYW5kLCB7XG4gICAgICAgICAgICAgICAgZXhwaXJlc0luOiAzNjAwMCxcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGtleTogZmlyc3RTY2VuZS5maWxlcy5wbmcsXG4gICAgICAgICAgICAgIHRodW1ibmFpbFVybCxcbiAgICAgICAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICAgICAgICB2aWRlb0dlbmVyYXRlZDogbWFuaWZlc3QudmlkZW9HZW5lcmF0ZWQgfHwgZmFsc2UsXG4gICAgICAgICAgICAgIGZpbmFsVmlkZW9VcmwsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgICBg4p2MIEVycm9yIHByb2Nlc3NpbmcgbWFuaWZlc3QgJHttYW5pZmVzdE9iamVjdC5LZXl9OmAsXG4gICAgICAgICAgICAgIGVycm9yLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgICAvLyBGaWx0ZXIgb3V0IG51bGwgdmFsdWVzIGFuZCBzb3J0IGJ5IHRpbWVzdGFtcCAobmV3ZXN0IGZpcnN0KVxuICAgICAgY29uc3QgdmFsaWRWaWRlb3MgPSB2aWRlb0RhdGFcbiAgICAgICAgLmZpbHRlcigoaXRlbSk6IGl0ZW0gaXMgTm9uTnVsbGFibGU8dHlwZW9mIGl0ZW0+ID0+IGl0ZW0gIT09IG51bGwpXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBwYXJzZUludChiLnRpbWVzdGFtcCkgLSBwYXJzZUludChhLnRpbWVzdGFtcCkpO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICB2aWRlb3M6IHZhbGlkVmlkZW9zLFxuICAgICAgICAgIG1lc3NhZ2U6IGBGb3VuZCAke3ZhbGlkVmlkZW9zLmxlbmd0aH0gdmlkZW9zYCxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHZpZGVvczogW10sXG4gICAgICAgIG1lc3NhZ2U6ICdObyB2aWRlb3MgZm91bmQnLFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfwn5KlIEVycm9yIGluIGZldGNoIHZpZGVvczonLCBlcnJvcik7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBlcnJvcjogJ0ZhaWxlZCB0byBmZXRjaCB2aWRlb3MnLFxuICAgICAgICBkZXRhaWxzOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=