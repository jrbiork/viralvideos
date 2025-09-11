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
                    let videoSize = 0;
                    if (manifest.videoGenerated) {
                        const videoCommand = new client_s3_1.GetObjectCommand({
                            Bucket: process.env.VIDEO_BUCKET_NAME,
                            Key: manifest.finalVideoUrl,
                        });
                        finalVideoUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, videoCommand, {
                            expiresIn: 36000,
                        });
                        // Get video metadata to fetch its size
                        try {
                            const videoHeadCommand = new client_s3_1.HeadObjectCommand({
                                Bucket: process.env.VIDEO_BUCKET_NAME,
                                Key: manifest.finalVideoUrl,
                            });
                            const videoMetadata = await s3.send(videoHeadCommand);
                            videoSize = videoMetadata.ContentLength || 0;
                            console.log('📊 Video size:', videoSize, 'bytes for video:', manifest.finalVideoUrl);
                        }
                        catch (error) {
                            console.warn('⚠️ Could not fetch video metadata:', error);
                            videoSize = 0;
                        }
                    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxrREFLNEI7QUFDNUIsd0VBQTZEO0FBRzdELE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBTXBFLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFDMUIsS0FBMkIsRUFDSyxFQUFFO0lBQ2xDLElBQUksQ0FBQztRQUNILElBQUksT0FBMkIsQ0FBQztRQUVoQyxpQ0FBaUM7UUFDakMsSUFBSSxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDZiw2Q0FBNkM7WUFDN0MsSUFBSSxPQUFPLEtBQUssQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQ25DLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQyxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sdURBQXVEO2dCQUN2RCxPQUFPLEdBQUcsS0FBSyxDQUFDLElBQTBCLENBQUM7WUFDN0MsQ0FBQztRQUNILENBQUM7YUFBTSxDQUFDO1lBQ04seURBQXlEO1lBQ3pELE9BQU8sR0FBRyxLQUFZLENBQUM7UUFDekIsQ0FBQztRQUVELGtFQUFrRTtRQUNsRSxNQUFNLE1BQU0sR0FDVixLQUFLLENBQUMsY0FBYyxFQUFFLFVBQVUsRUFBRSxNQUFNO1lBQ3hDLE9BQU8sQ0FBQyxNQUFNO1lBQ2QsS0FBSyxDQUFDLHFCQUFxQixFQUFFLE1BQU07WUFDbkMsV0FBVyxDQUFDO1FBRWQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUVwRCxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ25DLE9BQU8sQ0FBQyxHQUFHLENB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QUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBRWpFLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7b0JBQ25CLE1BQU0sRUFBRSxXQUFXO29CQUNuQixPQUFPLEVBQUUsU0FBUyxXQUFXLENBQUMsTUFBTSxTQUFTO2lCQUM5QyxDQUFDO2FBQ0gsQ0FBQztRQUNKLENBQUM7UUFFRCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsTUFBTSxFQUFFLEVBQUU7Z0JBQ1YsT0FBTyxFQUFFLGlCQUFpQjthQUMzQixDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVsRCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsS0FBSyxFQUFFLHdCQUF3QjtnQkFDL0IsT0FBTyxFQUFFLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWU7YUFDbEUsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBdE1XLFFBQUEsT0FBTyxXQXNNbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQge1xuICBTM0NsaWVudCxcbiAgTGlzdE9iamVjdHNWMkNvbW1hbmQsXG4gIEdldE9iamVjdENvbW1hbmQsXG4gIEhlYWRPYmplY3RDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSAnQGF3cy1zZGsvczMtcmVxdWVzdC1wcmVzaWduZXInO1xuaW1wb3J0IHsgTWFuaWZlc3QgfSBmcm9tICcuLi90eXBlcy9zM1R5cGVzJztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmludGVyZmFjZSBGZXRjaFZpZGVvc1JlcXVlc3Qge1xuICB1c2VySWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoXG4gIGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCxcbik6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIHRyeSB7XG4gICAgbGV0IHJlcXVlc3Q6IEZldGNoVmlkZW9zUmVxdWVzdDtcblxuICAgIC8vIEhhbmRsZSBkaWZmZXJlbnQgZXZlbnQgZm9ybWF0c1xuICAgIGlmIChldmVudC5ib2R5KSB7XG4gICAgICAvLyBBUEkgR2F0ZXdheSBmb3JtYXQgLSBib2R5IGlzIGEgSlNPTiBzdHJpbmdcbiAgICAgIGlmICh0eXBlb2YgZXZlbnQuYm9keSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmVxdWVzdCA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEaXJlY3QgTGFtYmRhIGludm9jYXRpb24gLSBib2R5IGlzIGFscmVhZHkgYW4gb2JqZWN0XG4gICAgICAgIHJlcXVlc3QgPSBldmVudC5ib2R5IGFzIEZldGNoVmlkZW9zUmVxdWVzdDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRGlyZWN0IExhbWJkYSBpbnZvY2F0aW9uIC0gcGF5bG9hZCBpcyB0aGUgZW50aXJlIGV2ZW50XG4gICAgICByZXF1ZXN0ID0gZXZlbnQgYXMgYW55O1xuICAgIH1cblxuICAgIC8vIEV4dHJhY3QgdXNlciBpbmZvcm1hdGlvbiBmcm9tIEpXVCBhdXRob3JpemVyIGNvbnRleHQgb3IgcmVxdWVzdFxuICAgIGNvbnN0IHVzZXJJZCA9XG4gICAgICBldmVudC5yZXF1ZXN0Q29udGV4dD8uYXV0aG9yaXplcj8udXNlcklkIHx8XG4gICAgICByZXF1ZXN0LnVzZXJJZCB8fFxuICAgICAgZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzPy51c2VySWQgfHxcbiAgICAgICdkZW1vLXVzZXInO1xuXG4gICAgY29uc29sZS5sb2coJ/CflI0gRmV0Y2hpbmcgdmlkZW9zIGZvciB1c2VyOicsIHVzZXJJZCk7XG5cbiAgICBpZiAoIXByb2Nlc3MuZW52LlZJREVPX0JVQ0tFVF9OQU1FKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBWSURFT19CVUNLRVRfTkFNRSBpcyBub3Qgc2V0Jyk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdTMyBidWNrZXQgbmFtZSBub3QgY29uZmlndXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIExpc3QgYWxsIG1hbmlmZXN0IGZpbGVzIGZvciB0aGUgdXNlclxuICAgIGNvbnNvbGUubG9nKCfwn5OLIEZldGNoaW5nIGFsbCBtYW5pZmVzdHMgZm9yIHVzZXI6JywgdXNlcklkKTtcblxuICAgIGlmICghcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IFZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FIGlzIG5vdCBzZXQnKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGVycm9yOiAnVmlkZW8gcGFydHMgYnVja2V0IG5hbWUgbm90IGNvbmZpZ3VyZWQnLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWFuaWZlc3RMaXN0Q29tbWFuZCA9IG5ldyBMaXN0T2JqZWN0c1YyQ29tbWFuZCh7XG4gICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgUHJlZml4OiBgJHt1c2VySWR9L2AsXG4gICAgICBEZWxpbWl0ZXI6ICcnLFxuICAgIH0pO1xuXG4gICAgY29uc3QgbWFuaWZlc3RMaXN0UmVzcG9uc2UgPSBhd2FpdCBzMy5zZW5kKG1hbmlmZXN0TGlzdENvbW1hbmQpO1xuXG4gICAgLy8gRmlsdGVyIGZvciBtYW5pZmVzdCBmaWxlcyBvbmx5XG4gICAgY29uc3QgbWFuaWZlc3RGaWxlcyA9XG4gICAgICBtYW5pZmVzdExpc3RSZXNwb25zZS5Db250ZW50cz8uZmlsdGVyKChvYmplY3Q6IGFueSkgPT5cbiAgICAgICAgb2JqZWN0LktleT8uZW5kc1dpdGgoJy5tYW5pZmVzdC5qc29uJyksXG4gICAgICApIHx8IFtdO1xuXG4gICAgaWYgKG1hbmlmZXN0RmlsZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgdmlkZW9EYXRhID0gYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICAgIG1hbmlmZXN0RmlsZXMubWFwKGFzeW5jIChtYW5pZmVzdE9iamVjdCkgPT4ge1xuICAgICAgICAgIGlmICghbWFuaWZlc3RPYmplY3QuS2V5KSByZXR1cm4gbnVsbDtcblxuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBFeHRyYWN0IHRpbWVzdGFtcCBmcm9tIG1hbmlmZXN0IGtleTogdXNlcjEyMy8xNzAzMTIzNDU2Nzg5Lm1hbmlmZXN0Lmpzb24gLT4gMTcwMzEyMzQ1Njc4OVxuICAgICAgICAgICAgY29uc3QgdGltZXN0YW1wID1cbiAgICAgICAgICAgICAgbWFuaWZlc3RPYmplY3QuS2V5LnNwbGl0KCcvJylcbiAgICAgICAgICAgICAgICAucG9wKClcbiAgICAgICAgICAgICAgICA/LnJlcGxhY2UoJy5tYW5pZmVzdC5qc29uJywgJycpIHx8ICcnO1xuXG4gICAgICAgICAgICBjb25zb2xlLmxvZygn8J+TiyBQcm9jZXNzaW5nIG1hbmlmZXN0IGZvciB0aW1lc3RhbXA6JywgdGltZXN0YW1wKTtcblxuICAgICAgICAgICAgLy8gRmV0Y2ggdGhlIG1hbmlmZXN0IGNvbnRlbnRcbiAgICAgICAgICAgIGNvbnN0IG1hbmlmZXN0Q29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICAgICAgS2V5OiBtYW5pZmVzdE9iamVjdC5LZXksXG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgbWFuaWZlc3RSZXNwb25zZSA9IGF3YWl0IHMzLnNlbmQobWFuaWZlc3RDb21tYW5kKTtcblxuICAgICAgICAgICAgY29uc3QgbWFuaWZlc3QgPSBKU09OLnBhcnNlKFxuICAgICAgICAgICAgICAoYXdhaXQgbWFuaWZlc3RSZXNwb25zZS5Cb2R5Py50cmFuc2Zvcm1Ub1N0cmluZygpKSB8fCAne30nLFxuICAgICAgICAgICAgKSBhcyBNYW5pZmVzdDtcblxuICAgICAgICAgICAgLy8gR2V0IHRoZSBmaXJzdCBzY2VuZSdzIGltYWdlIGZpbGUgcGF0aCBmcm9tIG1hbmlmZXN0XG4gICAgICAgICAgICBjb25zdCBmaXJzdFNjZW5lID0gbWFuaWZlc3Quc2NlbmVzPy5bMF07XG4gICAgICAgICAgICBpZiAoIWZpcnN0U2NlbmU/LmZpbGVzPy5wbmcpIHtcbiAgICAgICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgICAgIGDimqDvuI8gTm8gZmlyc3Qgc2NlbmUgaW1hZ2UgZm91bmQgZm9yIHRpbWVzdGFtcDogJHt0aW1lc3RhbXB9YCxcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEdlbmVyYXRlIHByZXNpZ25lZCBVUkwgZm9yIHRoZSBmaXJzdCBzY2VuZSdzIGltYWdlXG4gICAgICAgICAgICBjb25zdCB0aHVtYm5haWxDb21tYW5kID0gbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgICAgICBLZXk6IGZpcnN0U2NlbmUuZmlsZXMucG5nLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHRodW1ibmFpbFVybCA9IGF3YWl0IGdldFNpZ25lZFVybChzMywgdGh1bWJuYWlsQ29tbWFuZCwge1xuICAgICAgICAgICAgICBleHBpcmVzSW46IDM2MDAwLFxuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGxldCBmaW5hbFZpZGVvVXJsID0gJyc7XG4gICAgICAgICAgICBsZXQgdmlkZW9TaXplID0gMDtcbiAgICAgICAgICAgIGlmIChtYW5pZmVzdC52aWRlb0dlbmVyYXRlZCkge1xuICAgICAgICAgICAgICBjb25zdCB2aWRlb0NvbW1hbmQgPSBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19CVUNLRVRfTkFNRSxcbiAgICAgICAgICAgICAgICBLZXk6IG1hbmlmZXN0LmZpbmFsVmlkZW9VcmwsXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBmaW5hbFZpZGVvVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKHMzLCB2aWRlb0NvbW1hbmQsIHtcbiAgICAgICAgICAgICAgICBleHBpcmVzSW46IDM2MDAwLFxuICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAvLyBHZXQgdmlkZW8gbWV0YWRhdGEgdG8gZmV0Y2ggaXRzIHNpemVcbiAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBjb25zdCB2aWRlb0hlYWRDb21tYW5kID0gbmV3IEhlYWRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fQlVDS0VUX05BTUUsXG4gICAgICAgICAgICAgICAgICBLZXk6IG1hbmlmZXN0LmZpbmFsVmlkZW9VcmwsXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgY29uc3QgdmlkZW9NZXRhZGF0YSA9IGF3YWl0IHMzLnNlbmQodmlkZW9IZWFkQ29tbWFuZCk7XG4gICAgICAgICAgICAgICAgdmlkZW9TaXplID0gdmlkZW9NZXRhZGF0YS5Db250ZW50TGVuZ3RoIHx8IDA7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICAgICAgICAn8J+TiiBWaWRlbyBzaXplOicsXG4gICAgICAgICAgICAgICAgICB2aWRlb1NpemUsXG4gICAgICAgICAgICAgICAgICAnYnl0ZXMgZm9yIHZpZGVvOicsXG4gICAgICAgICAgICAgICAgICBtYW5pZmVzdC5maW5hbFZpZGVvVXJsLFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKCfimqDvuI8gQ291bGQgbm90IGZldGNoIHZpZGVvIG1ldGFkYXRhOicsIGVycm9yKTtcbiAgICAgICAgICAgICAgICB2aWRlb1NpemUgPSAwO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGtleTogZmlyc3RTY2VuZS5maWxlcy5wbmcsXG4gICAgICAgICAgICAgIHRodW1ibmFpbFVybCxcbiAgICAgICAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICAgICAgICBjcmVhdGVkQXQ6IG1hbmlmZXN0LmdlbmVyYXRlZEF0XG4gICAgICAgICAgICAgICAgPyBuZXcgRGF0ZShwYXJzZUludChtYW5pZmVzdC5nZW5lcmF0ZWRBdCkpLnRvSVNPU3RyaW5nKClcbiAgICAgICAgICAgICAgICA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgbGFzdE1vZGlmaWVkOlxuICAgICAgICAgICAgICAgIG1hbmlmZXN0T2JqZWN0Lkxhc3RNb2RpZmllZD8udG9JU09TdHJpbmcoKSB8fFxuICAgICAgICAgICAgICAgIG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgdG90YWxEdXJhdGlvbjogbWFuaWZlc3QudG90YWxEdXJhdGlvbiB8fCAwLFxuICAgICAgICAgICAgICBzY2VuZUNvdW50OiBtYW5pZmVzdC5zY2VuZUNvdW50IHx8IDAsXG4gICAgICAgICAgICAgIHZpZGVvR2VuZXJhdGVkOiBtYW5pZmVzdC52aWRlb0dlbmVyYXRlZCB8fCBmYWxzZSxcbiAgICAgICAgICAgICAgZmluYWxWaWRlb1VybCxcbiAgICAgICAgICAgICAgc2l6ZTogdmlkZW9TaXplLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgICAgYOKdjCBFcnJvciBwcm9jZXNzaW5nIG1hbmlmZXN0ICR7bWFuaWZlc3RPYmplY3QuS2V5fTpgLFxuICAgICAgICAgICAgICBlcnJvcixcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICB9XG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgICAgLy8gRmlsdGVyIG91dCBudWxsIHZhbHVlcyBhbmQgc29ydCBieSB0aW1lc3RhbXAgKG5ld2VzdCBmaXJzdClcbiAgICAgIGNvbnN0IHZhbGlkVmlkZW9zID0gdmlkZW9EYXRhXG4gICAgICAgIC5maWx0ZXIoKGl0ZW0pOiBpdGVtIGlzIE5vbk51bGxhYmxlPHR5cGVvZiBpdGVtPiA9PiBpdGVtICE9PSBudWxsKVxuICAgICAgICAuc29ydCgoYSwgYikgPT4gcGFyc2VJbnQoYi50aW1lc3RhbXApIC0gcGFyc2VJbnQoYS50aW1lc3RhbXApKTtcblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgdmlkZW9zOiB2YWxpZFZpZGVvcyxcbiAgICAgICAgICBtZXNzYWdlOiBgRm91bmQgJHt2YWxpZFZpZGVvcy5sZW5ndGh9IHZpZGVvc2AsXG4gICAgICAgIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICB2aWRlb3M6IFtdLFxuICAgICAgICBtZXNzYWdlOiAnTm8gdmlkZW9zIGZvdW5kJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign8J+SpSBFcnJvciBpbiBmZXRjaCB2aWRlb3M6JywgZXJyb3IpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZmV0Y2ggdmlkZW9zJyxcbiAgICAgICAgZGV0YWlsczogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICB9KSxcbiAgICB9O1xuICB9XG59O1xuIl19