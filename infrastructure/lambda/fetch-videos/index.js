"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
// Helper function to get video size with error handling
async function getVideoSize(bucket, key) {
    try {
        const videoHeadCommand = new client_s3_1.HeadObjectCommand({
            Bucket: bucket,
            Key: key,
        });
        const videoMetadata = await s3.send(videoHeadCommand);
        return videoMetadata.ContentLength || 0;
    }
    catch (error) {
        console.warn('⚠️ Could not fetch video metadata for:', key, error);
        return 0;
    }
}
const handler = async (event) => {
    const startTime = Date.now();
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
            console.log(`🚀 Processing ${manifestFiles.length} manifests in parallel...`);
            const videoData = await Promise.all(manifestFiles.map(async (manifestObject) => {
                if (!manifestObject.Key)
                    return null;
                try {
                    // Extract timestamp from manifest key: user123/1703123456789.manifest.json -> 1703123456789
                    const timestamp = manifestObject.Key.split('/')
                        .pop()
                        ?.replace('.manifest.json', '') || '';
                    console.log('📋 Processing manifest for timestamp:', timestamp);
                    const manifestStartTime = Date.now();
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
                    // 🚀 PARALLEL PROCESSING: Run all S3 operations concurrently
                    const thumbnailUrlPromise = (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({
                        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                        Key: firstScene.files.png,
                    }), { expiresIn: 36000 });
                    let finalVideoUrlPromise = Promise.resolve('');
                    let videoSizePromise = Promise.resolve(0);
                    // Add video operations only if video is generated
                    if (manifest.videoGenerated) {
                        finalVideoUrlPromise = (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({
                            Bucket: process.env.VIDEO_BUCKET_NAME,
                            Key: manifest.finalVideoUrl,
                        }), { expiresIn: 36000 });
                        videoSizePromise = getVideoSize(process.env.VIDEO_BUCKET_NAME, manifest.finalVideoUrl);
                    }
                    // Execute all operations in parallel
                    const [thumbnailUrl, finalVideoUrl, videoSize] = await Promise.all([
                        thumbnailUrlPromise,
                        finalVideoUrlPromise,
                        videoSizePromise,
                    ]);
                    if (videoSize > 0) {
                        console.log('📊 Video size:', videoSize, 'bytes for video:', manifest.finalVideoUrl);
                    }
                    const manifestDuration = Date.now() - manifestStartTime;
                    console.log(`⚡ Processed manifest ${timestamp} in ${manifestDuration}ms`);
                    return {
                        key: firstScene.files.png,
                        thumbnailUrl,
                        timestamp,
                        createdAt: manifest.generatedAt
                            ? new Date(parseInt(manifest.generatedAt)).toISOString()
                            : new Date().toISOString(),
                        lastModified: manifestObject.LastModified?.toISOString() ||
                            new Date().toISOString(),
                        totalDuration: manifest.totalDuration || 0,
                        sceneCount: manifest.sceneCount || 0,
                        videoGenerated: manifest.videoGenerated || false,
                        finalVideoUrl,
                        size: videoSize,
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
            const duration = Date.now() - startTime;
            console.log(`✅ Processed ${validVideos.length} videos in ${duration}ms (${manifestFiles.length} manifests)`);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    videos: validVideos,
                    message: `Found ${validVideos.length} videos`,
                    processingTimeMs: duration,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxrREFLNEI7QUFDNUIsd0VBQTZEO0FBRzdELE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBTTNFLHdEQUF3RDtBQUN4RCxLQUFLLFVBQVUsWUFBWSxDQUFDLE1BQWMsRUFBRSxHQUFXO0lBQ3JELElBQUksQ0FBQztRQUNILE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSw2QkFBaUIsQ0FBQztZQUM3QyxNQUFNLEVBQUUsTUFBTTtZQUNkLEdBQUcsRUFBRSxHQUFHO1NBQ1QsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxhQUFhLEdBQUcsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDdEQsT0FBTyxhQUFhLENBQUMsYUFBYSxJQUFJLENBQUMsQ0FBQztJQUMxQyxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxJQUFJLENBQUMsd0NBQXdDLEVBQUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25FLE9BQU8sQ0FBQyxDQUFDO0lBQ1gsQ0FBQztBQUNILENBQUM7QUFFTSxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQzFCLEtBQTJCLEVBQ0ssRUFBRTtJQUNsQyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFFN0IsSUFBSSxDQUFDO1FBQ0gsSUFBSSxPQUEyQixDQUFDO1FBRWhDLGlDQUFpQztRQUNqQyxJQUFJLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNmLDZDQUE2QztZQUM3QyxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDbkMsT0FBTyxHQUFHLElBQUksQ0FBQyxL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b0JBQ25CLE1BQU0sRUFBRSxXQUFXO29CQUNuQixPQUFPLEVBQUUsU0FBUyxXQUFXLENBQUMsTUFBTSxTQUFTO29CQUM3QyxnQkFBZ0IsRUFBRSxRQUFRO2lCQUMzQixDQUFDO2FBQ0gsQ0FBQztRQUNKLENBQUM7UUFFRCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsTUFBTSxFQUFFLEVBQUU7Z0JBQ1YsT0FBTyxFQUFFLGlCQUFpQjthQUMzQixDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVsRCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsS0FBSyxFQUFFLHdCQUF3QjtnQkFDL0IsT0FBTyxFQUFFLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWU7YUFDbEUsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBNU5XLFFBQUEsT0FBTyxXQTRObEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQge1xuICBTM0NsaWVudCxcbiAgTGlzdE9iamVjdHNWMkNvbW1hbmQsXG4gIEdldE9iamVjdENvbW1hbmQsXG4gIEhlYWRPYmplY3RDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSAnQGF3cy1zZGsvczMtcmVxdWVzdC1wcmVzaWduZXInO1xuaW1wb3J0IHsgTWFuaWZlc3QgfSBmcm9tICcuLi90eXBlcy9zM1R5cGVzJztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmludGVyZmFjZSBGZXRjaFZpZGVvc1JlcXVlc3Qge1xuICB1c2VySWQ6IHN0cmluZztcbn1cblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGdldCB2aWRlbyBzaXplIHdpdGggZXJyb3IgaGFuZGxpbmdcbmFzeW5jIGZ1bmN0aW9uIGdldFZpZGVvU2l6ZShidWNrZXQ6IHN0cmluZywga2V5OiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xuICB0cnkge1xuICAgIGNvbnN0IHZpZGVvSGVhZENvbW1hbmQgPSBuZXcgSGVhZE9iamVjdENvbW1hbmQoe1xuICAgICAgQnVja2V0OiBidWNrZXQsXG4gICAgICBLZXk6IGtleSxcbiAgICB9KTtcbiAgICBjb25zdCB2aWRlb01ldGFkYXRhID0gYXdhaXQgczMuc2VuZCh2aWRlb0hlYWRDb21tYW5kKTtcbiAgICByZXR1cm4gdmlkZW9NZXRhZGF0YS5Db250ZW50TGVuZ3RoIHx8IDA7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS53YXJuKCfimqDvuI8gQ291bGQgbm90IGZldGNoIHZpZGVvIG1ldGFkYXRhIGZvcjonLCBrZXksIGVycm9yKTtcbiAgICByZXR1cm4gMDtcbiAgfVxufVxuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChcbiAgZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50LFxuKTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblxuICB0cnkge1xuICAgIGxldCByZXF1ZXN0OiBGZXRjaFZpZGVvc1JlcXVlc3Q7XG5cbiAgICAvLyBIYW5kbGUgZGlmZmVyZW50IGV2ZW50IGZvcm1hdHNcbiAgICBpZiAoZXZlbnQuYm9keSkge1xuICAgICAgLy8gQVBJIEdhdGV3YXkgZm9ybWF0IC0gYm9keSBpcyBhIEpTT04gc3RyaW5nXG4gICAgICBpZiAodHlwZW9mIGV2ZW50LmJvZHkgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJlcXVlc3QgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRGlyZWN0IExhbWJkYSBpbnZvY2F0aW9uIC0gYm9keSBpcyBhbHJlYWR5IGFuIG9iamVjdFxuICAgICAgICByZXF1ZXN0ID0gZXZlbnQuYm9keSBhcyBGZXRjaFZpZGVvc1JlcXVlc3Q7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIERpcmVjdCBMYW1iZGEgaW52b2NhdGlvbiAtIHBheWxvYWQgaXMgdGhlIGVudGlyZSBldmVudFxuICAgICAgcmVxdWVzdCA9IGV2ZW50IGFzIGFueTtcbiAgICB9XG5cbiAgICAvLyBFeHRyYWN0IHVzZXIgaW5mb3JtYXRpb24gZnJvbSBKV1QgYXV0aG9yaXplciBjb250ZXh0IG9yIHJlcXVlc3RcbiAgICBjb25zdCB1c2VySWQgPVxuICAgICAgZXZlbnQucmVxdWVzdENvbnRleHQ/LmF1dGhvcml6ZXI/LnVzZXJJZCB8fFxuICAgICAgcmVxdWVzdC51c2VySWQgfHxcbiAgICAgIGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycz8udXNlcklkIHx8XG4gICAgICAnZGVtby11c2VyJztcblxuICAgIGNvbnNvbGUubG9nKCfwn5SNIEZldGNoaW5nIHZpZGVvcyBmb3IgdXNlcjonLCB1c2VySWQpO1xuXG4gICAgaWYgKCFwcm9jZXNzLmVudi5WSURFT19CVUNLRVRfTkFNRSkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogVklERU9fQlVDS0VUX05BTUUgaXMgbm90IHNldCcpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUzMgYnVja2V0IG5hbWUgbm90IGNvbmZpZ3VyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBMaXN0IGFsbCBtYW5pZmVzdCBmaWxlcyBmb3IgdGhlIHVzZXJcbiAgICBjb25zb2xlLmxvZygn8J+TiyBGZXRjaGluZyBhbGwgbWFuaWZlc3RzIGZvciB1c2VyOicsIHVzZXJJZCk7XG5cbiAgICBpZiAoIXByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBWSURFT19QQVJUU19CVUNLRVRfTkFNRSBpcyBub3Qgc2V0Jyk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ1ZpZGVvIHBhcnRzIGJ1Y2tldCBuYW1lIG5vdCBjb25maWd1cmVkJyxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IG1hbmlmZXN0TGlzdENvbW1hbmQgPSBuZXcgTGlzdE9iamVjdHNWMkNvbW1hbmQoe1xuICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgIFByZWZpeDogYCR7dXNlcklkfS9gLFxuICAgICAgRGVsaW1pdGVyOiAnJyxcbiAgICB9KTtcblxuICAgIGNvbnN0IG1hbmlmZXN0TGlzdFJlc3BvbnNlID0gYXdhaXQgczMuc2VuZChtYW5pZmVzdExpc3RDb21tYW5kKTtcblxuICAgIC8vIEZpbHRlciBmb3IgbWFuaWZlc3QgZmlsZXMgb25seVxuICAgIGNvbnN0IG1hbmlmZXN0RmlsZXMgPVxuICAgICAgbWFuaWZlc3RMaXN0UmVzcG9uc2UuQ29udGVudHM/LmZpbHRlcigob2JqZWN0OiBhbnkpID0+XG4gICAgICAgIG9iamVjdC5LZXk/LmVuZHNXaXRoKCcubWFuaWZlc3QuanNvbicpLFxuICAgICAgKSB8fCBbXTtcblxuICAgIGlmIChtYW5pZmVzdEZpbGVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBg8J+agCBQcm9jZXNzaW5nICR7bWFuaWZlc3RGaWxlcy5sZW5ndGh9IG1hbmlmZXN0cyBpbiBwYXJhbGxlbC4uLmAsXG4gICAgICApO1xuICAgICAgY29uc3QgdmlkZW9EYXRhID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgIG1hbmlmZXN0RmlsZXMubWFwKGFzeW5jIChtYW5pZmVzdE9iamVjdCkgPT4ge1xuICAgICAgICAgIGlmICghbWFuaWZlc3RPYmplY3QuS2V5KSByZXR1cm4gbnVsbDtcblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBFeHRyYWN0IHRpbWVzdGFtcCBmcm9tIG1hbmlmZXN0IGtleTogdXNlcjEyMy8xNzAzMTIzNDU2Nzg5Lm1hbmlmZXN0Lmpzb24gLT4gMTcwMzEyMzQ1Njc4OVxuICAgICAgICAgICAgY29uc3QgdGltZXN0YW1wID1cbiAgICAgICAgICAgICAgbWFuaWZlc3RPYmplY3QuS2V5LnNwbGl0KCcvJylcbiAgICAgICAgICAgICAgICAucG9wKClcbiAgICAgICAgICAgICAgICA/LnJlcGxhY2UoJy5tYW5pZmVzdC5qc29uJywgJycpIHx8ICcnO1xuXG4gICAgICAgICAgICBjb25zb2xlLmxvZygn8J+TiyBQcm9jZXNzaW5nIG1hbmlmZXN0IGZvciB0aW1lc3RhbXA6JywgdGltZXN0YW1wKTtcbiAgICAgICAgICAgIGNvbnN0IG1hbmlmZXN0U3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblxuICAgICAgICAgICAgLy8gRmV0Y2ggdGhlIG1hbmlmZXN0IGNvbnRlbnRcbiAgICAgICAgICAgIGNvbnN0IG1hbmlmZXN0Q29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICAgICAgS2V5OiBtYW5pZmVzdE9iamVjdC5LZXksXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgbWFuaWZlc3RSZXNwb25zZSA9IGF3YWl0IHMzLnNlbmQobWFuaWZlc3RDb21tYW5kKTtcblxuICAgICAgICAgICAgY29uc3QgbWFuaWZlc3QgPSBKU09OLnBhcnNlKFxuICAgICAgICAgICAgICAoYXdhaXQgbWFuaWZlc3RSZXNwb25zZS5Cb2R5Py50cmFuc2Zvcm1Ub1N0cmluZygpKSB8fCAne30nLFxuICAgICAgICAgICAgKSBhcyBNYW5pZmVzdDtcblxuICAgICAgICAgICAgLy8gR2V0IHRoZSBmaXJzdCBzY2VuZSdzIGltYWdlIGZpbGUgcGF0aCBmcm9tIG1hbmlmZXN0XG4gICAgICAgICAgICBjb25zdCBmaXJzdFNjZW5lID0gbWFuaWZlc3Quc2NlbmVzPy5bMF07XG4gICAgICAgICAgICBpZiAoIWZpcnN0U2NlbmU/LmZpbGVzPy5wbmcpIHtcbiAgICAgICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgICAgIGDimqDvuI8gTm8gZmlyc3Qgc2NlbmUgaW1hZ2UgZm91bmQgZm9yIHRpbWVzdGFtcDogJHt0aW1lc3RhbXB9YCxcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIPCfmoAgUEFSQUxMRUwgUFJPQ0VTU0lORzogUnVuIGFsbCBTMyBvcGVyYXRpb25zIGNvbmN1cnJlbnRseVxuICAgICAgICAgICAgY29uc3QgdGh1bWJuYWlsVXJsUHJvbWlzZSA9IGdldFNpZ25lZFVybChcbiAgICAgICAgICAgICAgczMsXG4gICAgICAgICAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgICAgICAgIEtleTogZmlyc3RTY2VuZS5maWxlcy5wbmcsXG4gICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICB7IGV4cGlyZXNJbjogMzYwMDAgfSxcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGxldCBmaW5hbFZpZGVvVXJsUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgnJyk7XG4gICAgICAgICAgICBsZXQgdmlkZW9TaXplUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgwKTtcblxuICAgICAgICAgICAgLy8gQWRkIHZpZGVvIG9wZXJhdGlvbnMgb25seSBpZiB2aWRlbyBpcyBnZW5lcmF0ZWRcbiAgICAgICAgICAgIGlmIChtYW5pZmVzdC52aWRlb0dlbmVyYXRlZCkge1xuICAgICAgICAgICAgICBmaW5hbFZpZGVvVXJsUHJvbWlzZSA9IGdldFNpZ25lZFVybChcbiAgICAgICAgICAgICAgICBzMyxcbiAgICAgICAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgICAgICAgICAgS2V5OiBtYW5pZmVzdC5maW5hbFZpZGVvVXJsLFxuICAgICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICAgIHsgZXhwaXJlc0luOiAzNjAwMCB9LFxuICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgIHZpZGVvU2l6ZVByb21pc2UgPSBnZXRWaWRlb1NpemUoXG4gICAgICAgICAgICAgICAgcHJvY2Vzcy5lbnYuVklERU9fQlVDS0VUX05BTUUhLFxuICAgICAgICAgICAgICAgIG1hbmlmZXN0LmZpbmFsVmlkZW9VcmwsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEV4ZWN1dGUgYWxsIG9wZXJhdGlvbnMgaW4gcGFyYWxsZWxcbiAgICAgICAgICAgIGNvbnN0IFt0aHVtYm5haWxVcmwsIGZpbmFsVmlkZW9VcmwsIHZpZGVvU2l6ZV0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICAgIHRodW1ibmFpbFVybFByb21pc2UsXG4gICAgICAgICAgICAgIGZpbmFsVmlkZW9VcmxQcm9taXNlLFxuICAgICAgICAgICAgICB2aWRlb1NpemVQcm9taXNlLFxuICAgICAgICAgICAgXSk7XG5cbiAgICAgICAgICAgIGlmICh2aWRlb1NpemUgPiAwKSB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgICAgICfwn5OKIFZpZGVvIHNpemU6JyxcbiAgICAgICAgICAgICAgICB2aWRlb1NpemUsXG4gICAgICAgICAgICAgICAgJ2J5dGVzIGZvciB2aWRlbzonLFxuICAgICAgICAgICAgICAgIG1hbmlmZXN0LmZpbmFsVmlkZW9VcmwsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG1hbmlmZXN0RHVyYXRpb24gPSBEYXRlLm5vdygpIC0gbWFuaWZlc3RTdGFydFRpbWU7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgICAgYOKaoSBQcm9jZXNzZWQgbWFuaWZlc3QgJHt0aW1lc3RhbXB9IGluICR7bWFuaWZlc3REdXJhdGlvbn1tc2AsXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBrZXk6IGZpcnN0U2NlbmUuZmlsZXMucG5nLFxuICAgICAgICAgICAgICB0aHVtYm5haWxVcmwsXG4gICAgICAgICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgICAgICAgY3JlYXRlZEF0OiBtYW5pZmVzdC5nZW5lcmF0ZWRBdFxuICAgICAgICAgICAgICAgID8gbmV3IERhdGUocGFyc2VJbnQobWFuaWZlc3QuZ2VuZXJhdGVkQXQpKS50b0lTT1N0cmluZygpXG4gICAgICAgICAgICAgICAgOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgIGxhc3RNb2RpZmllZDpcbiAgICAgICAgICAgICAgICBtYW5pZmVzdE9iamVjdC5MYXN0TW9kaWZpZWQ/LnRvSVNPU3RyaW5nKCkgfHxcbiAgICAgICAgICAgICAgICBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgIHRvdGFsRHVyYXRpb246IG1hbmlmZXN0LnRvdGFsRHVyYXRpb24gfHwgMCxcbiAgICAgICAgICAgICAgc2NlbmVDb3VudDogbWFuaWZlc3Quc2NlbmVDb3VudCB8fCAwLFxuICAgICAgICAgICAgICB2aWRlb0dlbmVyYXRlZDogbWFuaWZlc3QudmlkZW9HZW5lcmF0ZWQgfHwgZmFsc2UsXG4gICAgICAgICAgICAgIGZpbmFsVmlkZW9VcmwsXG4gICAgICAgICAgICAgIHNpemU6IHZpZGVvU2l6ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICAgIGDinYwgRXJyb3IgcHJvY2Vzc2luZyBtYW5pZmVzdCAke21hbmlmZXN0T2JqZWN0LktleX06YCxcbiAgICAgICAgICAgICAgZXJyb3IsXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgfVxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIC8vIEZpbHRlciBvdXQgbnVsbCB2YWx1ZXMgYW5kIHNvcnQgYnkgdGltZXN0YW1wIChuZXdlc3QgZmlyc3QpXG4gICAgICBjb25zdCB2YWxpZFZpZGVvcyA9IHZpZGVvRGF0YVxuICAgICAgICAuZmlsdGVyKChpdGVtKTogaXRlbSBpcyBOb25OdWxsYWJsZTx0eXBlb2YgaXRlbT4gPT4gaXRlbSAhPT0gbnVsbClcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IHBhcnNlSW50KGIudGltZXN0YW1wKSAtIHBhcnNlSW50KGEudGltZXN0YW1wKSk7XG5cbiAgICAgIGNvbnN0IGR1cmF0aW9uID0gRGF0ZS5ub3coKSAtIHN0YXJ0VGltZTtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBg4pyFIFByb2Nlc3NlZCAke3ZhbGlkVmlkZW9zLmxlbmd0aH0gdmlkZW9zIGluICR7ZHVyYXRpb259bXMgKCR7bWFuaWZlc3RGaWxlcy5sZW5ndGh9IG1hbmlmZXN0cylgLFxuICAgICAgKTtcblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgdmlkZW9zOiB2YWxpZFZpZGVvcyxcbiAgICAgICAgICBtZXNzYWdlOiBgRm91bmQgJHt2YWxpZFZpZGVvcy5sZW5ndGh9IHZpZGVvc2AsXG4gICAgICAgICAgcHJvY2Vzc2luZ1RpbWVNczogZHVyYXRpb24sXG4gICAgICAgIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICB2aWRlb3M6IFtdLFxuICAgICAgICBtZXNzYWdlOiAnTm8gdmlkZW9zIGZvdW5kJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign8J+SpSBFcnJvciBpbiBmZXRjaCB2aWRlb3M6JywgZXJyb3IpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZmV0Y2ggdmlkZW9zJyxcbiAgICAgICAgZGV0YWlsczogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICB9KSxcbiAgICB9O1xuICB9XG59O1xuIl19