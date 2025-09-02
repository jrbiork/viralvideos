"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const s3Uploader_1 = require("../utils/s3Uploader");
const videoEffects_1 = require("../utils/videoEffects");
const manifestUtils_1 = require("../utils/manifestUtils");
const video_generation_1 = require("../video-generation");
const handler = async (event) => {
    console.log('💾 Save Image Lambda handler started');
    try {
        // get userId from the authorizer context
        const userId = event.requestContext.authorizer?.principalId;
        if (!userId) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Unauthorized' }),
            };
        }
        // get timestamp from query string
        const timestamp = event.queryStringParameters?.['timestamp'];
        if (!timestamp) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Timestamp is required' }),
            };
        }
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const { sceneId, generatedImageUrl, duration } = body;
        if (sceneId === undefined || sceneId === null) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing sceneId in request body' }),
            };
        }
        if (!duration) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing duration in request body' }),
            };
        }
        const manifest = await (0, manifestUtils_1.getManifest)(userId, timestamp);
        if (!manifest) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Manifest not found' }),
            };
        }
        // Form the imageKey
        const imageKey = `${userId}/${timestamp}.scene-${sceneId}.jpg`;
        console.log(`🔑 Formed image key: ${imageKey}`);
        await (0, s3Uploader_1.uploadImageToS3)(generatedImageUrl, userId, timestamp, sceneId);
        console.log(`✅ Image replaced successfully`);
        const hydratedManifest = await (0, manifestUtils_1.hydrateManifest)(manifest);
        (0, video_generation_1.broadcastProgress)(userId, timestamp, 'image_created', {
            manifest: hydratedManifest,
        });
        await (0, videoEffects_1.generateVideoEffects)([{ id: sceneId, duration }], userId, timestamp);
        (0, video_generation_1.broadcastProgress)(userId, timestamp, 'video_scene_created', {
            manifest: hydratedManifest,
        });
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Image saved successfully' }),
        };
    }
    catch (error) {
        console.error('❌ Error in save-image lambda:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxvREFBc0Q7QUFDdEQsd0RBQTZEO0FBRzdELDBEQUFzRTtBQUN0RSwwREFBd0Q7QUFTakQsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUMxQixLQUEyQixFQUNLLEVBQUU7SUFDbEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO0lBRXBELElBQUksQ0FBQztRQUNILHlDQUF5QztRQUN6QyxNQUFNLE1BQU0sR0FBSSxLQUFLLENBQUMsY0FBc0IsQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNaLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLENBQUM7YUFDaEQsQ0FBQztRQUNKLENBQUM7UUFFRCxrQ0FBa0M7UUFDbEMsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLHFCQUFxQixFQUFFLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDN0QsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2YsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSx1QkFBdUIsRUFBRSxDQUFDO2FBQ3pELENBQUM7UUFDSixDQUFDO1FBRUQscUJBQXFCO1FBQ3JCLE1BQU0sSUFBSSxHQUFnQixJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLENBQUM7UUFDekQsTUFBTSxFQUFFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxRQUFRLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFFdEQsSUFBSSxPQUFPLEtBQUssU0FBUyxJQUFJLE9BQU8sS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUM5QyxPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLGlDQUFpQyxFQUFFLENBQUM7YUFDbkUsQ0FBQztRQUNKLENBQUM7UUFFRCxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZCxPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLGtDQUFrQyxFQUFFLENBQUM7YUFDcEUsQ0FBQztRQUNKLENBQUM7UUFDRCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsMkJBQVcsRUFBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdEQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2QsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDO2FBQ3RELENBQUM7UUFDSixDQUFDO1FBRUQsb0JBQW9CO1FBQ3BCLE1BQU0sUUFBUSxHQUFHLEdBQUcsTUFBTSxJQUFJLFNBQVMsVUFBVSxPQUFPLE1BQU0sQ0FBQztRQUMvRCxPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBRWhELE1BQU0sSUFBQSw0QkFBZSxFQUFDLGlCQUFpQixFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDckUsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1FBRTdDLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxJQUFBLCtCQUFlLEVBQUMsUUFBUSxDQUFDLENBQUM7UUFFekQsSUFBQSxvQ0FBaUIsRUFBQyxNQUFNLEVBQUUsU0FBUyxFQUFFLGVBQWUsRUFBRTtZQUNwRCxRQUFRLEVBQUUsZ0JBQWdCO1NBQzNCLENBQUMsQ0FBQztRQUVILE1BQU0sSUFBQSxtQ0FBb0IsRUFBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUUzRSxJQUFBLG9DQUFpQixFQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUscUJBQXFCLEVBQUU7WUFDMUQsUUFBUSxFQUFFLGdCQUFnQjtTQUMzQixDQUFDLENBQUM7UUFFSCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxDQUFDO1NBQzlELENBQUM7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQztTQUN6RCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQS9FVyxRQUFBLE9BQU8sV0ErRWxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgdXBsb2FkSW1hZ2VUb1MzIH0gZnJvbSAnLi4vdXRpbHMvczNVcGxvYWRlcic7XG5pbXBvcnQgeyBnZW5lcmF0ZVZpZGVvRWZmZWN0cyB9IGZyb20gJy4uL3V0aWxzL3ZpZGVvRWZmZWN0cyc7XG5pbXBvcnQgeyBicm9hZGNhc3RNZXNzYWdlIH0gZnJvbSAnLi4vd2Vic29ja2V0LWJyb2FkY2FzdCc7XG5cbmltcG9ydCB7IGdldE1hbmlmZXN0LCBoeWRyYXRlTWFuaWZlc3QgfSBmcm9tICcuLi91dGlscy9tYW5pZmVzdFV0aWxzJztcbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi4vdmlkZW8tZ2VuZXJhdGlvbic7XG5cbmludGVyZmFjZSBSZXF1ZXN0Qm9keSB7XG4gIHNjZW5lSWQ6IG51bWJlcjtcbiAgZ2VuZXJhdGVkSW1hZ2VVcmw6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygn8J+SviBTYXZlIEltYWdlIExhbWJkYSBoYW5kbGVyIHN0YXJ0ZWQnKTtcblxuICB0cnkge1xuICAgIC8vIGdldCB1c2VySWQgZnJvbSB0aGUgYXV0aG9yaXplciBjb250ZXh0XG4gICAgY29uc3QgdXNlcklkID0gKGV2ZW50LnJlcXVlc3RDb250ZXh0IGFzIGFueSkuYXV0aG9yaXplcj8ucHJpbmNpcGFsSWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1VuYXV0aG9yaXplZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCB0aW1lc3RhbXAgZnJvbSBxdWVyeSBzdHJpbmdcbiAgICBjb25zdCB0aW1lc3RhbXAgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LlsndGltZXN0YW1wJ107XG4gICAgaWYgKCF0aW1lc3RhbXApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1RpbWVzdGFtcCBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFBhcnNlIHJlcXVlc3QgYm9keVxuICAgIGNvbnN0IGJvZHk6IFJlcXVlc3RCb2R5ID0gSlNPTi5wYXJzZShldmVudC5ib2R5IHx8ICd7fScpO1xuICAgIGNvbnN0IHsgc2NlbmVJZCwgZ2VuZXJhdGVkSW1hZ2VVcmwsIGR1cmF0aW9uIH0gPSBib2R5O1xuXG4gICAgaWYgKHNjZW5lSWQgPT09IHVuZGVmaW5lZCB8fCBzY2VuZUlkID09PSBudWxsKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNaXNzaW5nIHNjZW5lSWQgaW4gcmVxdWVzdCBib2R5JyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCFkdXJhdGlvbikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWlzc2luZyBkdXJhdGlvbiBpbiByZXF1ZXN0IGJvZHknIH0pLFxuICAgICAgfTtcbiAgICB9XG4gICAgY29uc3QgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdCh1c2VySWQsIHRpbWVzdGFtcCk7XG4gICAgaWYgKCFtYW5pZmVzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWFuaWZlc3Qgbm90IGZvdW5kJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gRm9ybSB0aGUgaW1hZ2VLZXlcbiAgICBjb25zdCBpbWFnZUtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmVJZH0uanBnYDtcbiAgICBjb25zb2xlLmxvZyhg8J+UkSBGb3JtZWQgaW1hZ2Uga2V5OiAke2ltYWdlS2V5fWApO1xuXG4gICAgYXdhaXQgdXBsb2FkSW1hZ2VUb1MzKGdlbmVyYXRlZEltYWdlVXJsLCB1c2VySWQsIHRpbWVzdGFtcCwgc2NlbmVJZCk7XG4gICAgY29uc29sZS5sb2coYOKchSBJbWFnZSByZXBsYWNlZCBzdWNjZXNzZnVsbHlgKTtcblxuICAgIGNvbnN0IGh5ZHJhdGVkTWFuaWZlc3QgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuXG4gICAgYnJvYWRjYXN0UHJvZ3Jlc3ModXNlcklkLCB0aW1lc3RhbXAsICdpbWFnZV9jcmVhdGVkJywge1xuICAgICAgbWFuaWZlc3Q6IGh5ZHJhdGVkTWFuaWZlc3QsXG4gICAgfSk7XG5cbiAgICBhd2FpdCBnZW5lcmF0ZVZpZGVvRWZmZWN0cyhbeyBpZDogc2NlbmVJZCwgZHVyYXRpb24gfV0sIHVzZXJJZCwgdGltZXN0YW1wKTtcblxuICAgIGJyb2FkY2FzdFByb2dyZXNzKHVzZXJJZCwgdGltZXN0YW1wLCAndmlkZW9fc2NlbmVfY3JlYXRlZCcsIHtcbiAgICAgIG1hbmlmZXN0OiBoeWRyYXRlZE1hbmlmZXN0LFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZTogJ0ltYWdlIHNhdmVkIHN1Y2Nlc3NmdWxseScgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gc2F2ZS1pbWFnZSBsYW1iZGE6JywgZXJyb3IpO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyB9KSxcbiAgICB9O1xuICB9XG59O1xuIl19