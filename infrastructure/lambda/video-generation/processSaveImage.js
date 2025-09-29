"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processSaveImage = processSaveImage;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const manifestUtils_1 = require("../utils/manifestUtils");
const s3Uploader_1 = require("../utils/s3Uploader");
const videoEffects_1 = require("../utils/videoEffects");
const broadcastProgress_1 = require("../utils/broadcastProgress");
const user_1 = require("../utils/user");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
async function processSaveImage(request, record) {
    try {
        if (!request.userId || !request.timestamp) {
            throw new Error('Missing userId or timestamp');
        }
        if (request.sceneId === undefined || request.sceneId === null) {
            throw new Error('Missing sceneId');
        }
        if (!request.generatedImageUrl) {
            throw new Error('Missing generatedImageUrl');
        }
        if (!request.duration) {
            throw new Error('Missing duration');
        }
        const { userId, timestamp, sceneId, generatedImageUrl, duration } = request;
        // Form the imageKey
        const imageKey = `${userId}/${timestamp}.scene-${sceneId}.png`;
        console.log(`🔑 Formed image key: ${imageKey}`);
        await (0, s3Uploader_1.uploadImageToS3)(generatedImageUrl, userId, timestamp, sceneId);
        console.log(`✅ Image uploaded successfully`);
        // when its a in memory edit scene
        if (request.inMemoryEditScene) {
            console.log('🔑 In memory edit scene, skipping video effects generation');
            return { message: 'Image saved successfully' };
        }
        const manifest = await (0, manifestUtils_1.getManifest)(userId, timestamp);
        if (!manifest) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Manifest not found' }),
            };
        }
        const user = await (0, user_1.getUser)(userId);
        let hydratedManifest = await (0, manifestUtils_1.hydrateManifest)(manifest);
        (0, broadcastProgress_1.broadcastProgress)('image_created', userId, timestamp, {
            manifest: hydratedManifest,
        });
        await (0, videoEffects_1.generateVideoEffects)([{ id: sceneId, duration }], userId, timestamp, user);
        hydratedManifest = await (0, manifestUtils_1.hydrateManifest)(manifest);
        // Note: Removed 'preview_completed' broadcast to prevent isLoadingVideoScenes from being affected
        // when saving an image. The 'image_created' broadcast is sufficient for updating the manifest.
        console.log('✅ Image saved via SQS for scene:', request.sceneId);
        // If this was triggered by SQS, delete the message from the queue
        if (record && process.env.VIDEO_QUEUE_URL) {
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
        }
        return { message: 'Image saved successfully' };
    }
    catch (error) {
        console.error('Error in save image (SQS):', error);
        throw Error('Image save failed');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1NhdmVJbWFnZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NTYXZlSW1hZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFvQkEsNENBNEVDO0FBL0ZELG9EQUFzRTtBQUN0RSwwREFBc0U7QUFDdEUsb0RBQXNEO0FBQ3RELHdEQUE2RDtBQUM3RCxrRUFBK0Q7QUFDL0Qsd0NBQXdDO0FBRXhDLE1BQU0sR0FBRyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBWXRFLEtBQUssVUFBVSxnQkFBZ0IsQ0FDcEMsT0FBeUIsRUFDekIsTUFBa0I7SUFFbEIsSUFBSSxDQUFDO1FBQ0gsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDMUMsTUFBTSxJQUFJLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFDRCxJQUFJLE9BQU8sQ0FBQyxPQUFPLEtBQUssU0FBUyxJQUFJLE9BQU8sQ0FBQyxPQUFPLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDOUQsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3JDLENBQUM7UUFDRCxJQUFJLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1FBQy9DLENBQUM7UUFDRCxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3RCLE1BQU0sSUFBSSxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUN0QyxDQUFDO1FBRUQsTUFBTSxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFFBQVEsRUFBRSxHQUFHLE9BQU8sQ0FBQztRQUU1RSxvQkFBb0I7UUFDcEIsTUFBTSxRQUFRLEdBQUcsR0FBRyxNQUFNLElBQUksU0FBUyxVQUFVLE9BQU8sTUFBTSxDQUFDO1FBQy9ELE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFFaEQsTUFBTSxJQUFBLDRCQUFlLEVBQUMsaUJBQWlCLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUNyRSxPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixDQUFDLENBQUM7UUFFN0Msa0NBQWtDO1FBQ2xDLElBQUksT0FBTyxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDOUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0REFBNEQsQ0FBQyxDQUFDO1lBQzFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsQ0FBQztRQUNqRCxDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLDJCQUFXLEVBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNkLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQzthQUN0RCxDQUFDO1FBQ0osQ0FBQztRQUVELE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBQSxjQUFPLEVBQUMsTUFBTSxDQUFDLENBQUM7UUFFbkMsSUFBSSxnQkFBZ0IsR0FBRyxNQUFNLElBQUEsK0JBQWUsRUFBQyxRQUFRLENBQUMsQ0FBQztRQUV2RCxJQUFBLHFDQUFpQixFQUFDLGVBQWUsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFO1lBQ3BELFFBQVEsRUFBRSxnQkFBZ0I7U0FDM0IsQ0FBQyxDQUFDO1FBRUgsTUFBTSxJQUFBLG1DQUFvQixFQUN4QixDQUFDLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsQ0FBQyxFQUMzQixNQUFNLEVBQ04sU0FBUyxFQUNULElBQUksQ0FDTCxDQUFDO1FBRUYsZ0JBQWdCLEdBQUcsTUFBTSxJQUFBLCtCQUFlLEVBQUMsUUFBUSxDQUFDLENBQUM7UUFFbkQsa0dBQWtHO1FBQ2xHLCtGQUErRjtRQUMvRixPQUFPLENBQUMsR0FBRyxDQUFDLGtDQUFrQyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUVqRSxrRUFBa0U7UUFDbEUsSUFBSSxNQUFNLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUMxQyxNQUFNLGFBQWEsR0FBRyxJQUFJLGlDQUFvQixDQUFDO2dCQUM3QyxRQUFRLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlO2dCQUNyQyxhQUFhLEVBQUUsTUFBTSxDQUFDLGFBQWE7YUFDcEMsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ2hDLENBQUM7UUFFRCxPQUFPLEVBQUUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLENBQUM7SUFDakQsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE1BQU0sS0FBSyxDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFDbkMsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTUVNSZWNvcmQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IFNRU0NsaWVudCwgRGVsZXRlTWVzc2FnZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3FzJztcbmltcG9ydCB7IGdldE1hbmlmZXN0LCBoeWRyYXRlTWFuaWZlc3QgfSBmcm9tICcuLi91dGlscy9tYW5pZmVzdFV0aWxzJztcbmltcG9ydCB7IHVwbG9hZEltYWdlVG9TMyB9IGZyb20gJy4uL3V0aWxzL3MzVXBsb2FkZXInO1xuaW1wb3J0IHsgZ2VuZXJhdGVWaWRlb0VmZmVjdHMgfSBmcm9tICcuLi91dGlscy92aWRlb0VmZmVjdHMnO1xuaW1wb3J0IHsgYnJvYWRjYXN0UHJvZ3Jlc3MgfSBmcm9tICcuLi91dGlscy9icm9hZGNhc3RQcm9ncmVzcyc7XG5pbXBvcnQgeyBnZXRVc2VyIH0gZnJvbSAnLi4vdXRpbHMvdXNlcic7XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2F2ZUltYWdlUmVxdWVzdCB7XG4gIHR5cGU/OiAnc2F2ZS1pbWFnZSc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgc2NlbmVJZDogbnVtYmVyO1xuICBnZW5lcmF0ZWRJbWFnZVVybDogc3RyaW5nO1xuICBkdXJhdGlvbj86IG51bWJlcjtcbiAgaW5NZW1vcnlFZGl0U2NlbmU/OiBib29sZWFuO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1NhdmVJbWFnZShcbiAgcmVxdWVzdDogU2F2ZUltYWdlUmVxdWVzdCxcbiAgcmVjb3JkPzogU1FTUmVjb3JkLFxuKTogUHJvbWlzZTxhbnk+IHtcbiAgdHJ5IHtcbiAgICBpZiAoIXJlcXVlc3QudXNlcklkIHx8ICFyZXF1ZXN0LnRpbWVzdGFtcCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHVzZXJJZCBvciB0aW1lc3RhbXAnKTtcbiAgICB9XG4gICAgaWYgKHJlcXVlc3Quc2NlbmVJZCA9PT0gdW5kZWZpbmVkIHx8IHJlcXVlc3Quc2NlbmVJZCA9PT0gbnVsbCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHNjZW5lSWQnKTtcbiAgICB9XG4gICAgaWYgKCFyZXF1ZXN0LmdlbmVyYXRlZEltYWdlVXJsKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgZ2VuZXJhdGVkSW1hZ2VVcmwnKTtcbiAgICB9XG4gICAgaWYgKCFyZXF1ZXN0LmR1cmF0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgZHVyYXRpb24nKTtcbiAgICB9XG5cbiAgICBjb25zdCB7IHVzZXJJZCwgdGltZXN0YW1wLCBzY2VuZUlkLCBnZW5lcmF0ZWRJbWFnZVVybCwgZHVyYXRpb24gfSA9IHJlcXVlc3Q7XG5cbiAgICAvLyBGb3JtIHRoZSBpbWFnZUtleVxuICAgIGNvbnN0IGltYWdlS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZUlkfS5wbmdgO1xuICAgIGNvbnNvbGUubG9nKGDwn5SRIEZvcm1lZCBpbWFnZSBrZXk6ICR7aW1hZ2VLZXl9YCk7XG5cbiAgICBhd2FpdCB1cGxvYWRJbWFnZVRvUzMoZ2VuZXJhdGVkSW1hZ2VVcmwsIHVzZXJJZCwgdGltZXN0YW1wLCBzY2VuZUlkKTtcbiAgICBjb25zb2xlLmxvZyhg4pyFIEltYWdlIHVwbG9hZGVkIHN1Y2Nlc3NmdWxseWApO1xuXG4gICAgLy8gd2hlbiBpdHMgYSBpbiBtZW1vcnkgZWRpdCBzY2VuZVxuICAgIGlmIChyZXF1ZXN0LmluTWVtb3J5RWRpdFNjZW5lKSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+UkSBJbiBtZW1vcnkgZWRpdCBzY2VuZSwgc2tpcHBpbmcgdmlkZW8gZWZmZWN0cyBnZW5lcmF0aW9uJyk7XG4gICAgICByZXR1cm4geyBtZXNzYWdlOiAnSW1hZ2Ugc2F2ZWQgc3VjY2Vzc2Z1bGx5JyB9O1xuICAgIH1cblxuICAgIGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgZ2V0TWFuaWZlc3QodXNlcklkLCB0aW1lc3RhbXApO1xuICAgIGlmICghbWFuaWZlc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ01hbmlmZXN0IG5vdCBmb3VuZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXIgPSBhd2FpdCBnZXRVc2VyKHVzZXJJZCk7XG5cbiAgICBsZXQgaHlkcmF0ZWRNYW5pZmVzdCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG5cbiAgICBicm9hZGNhc3RQcm9ncmVzcygnaW1hZ2VfY3JlYXRlZCcsIHVzZXJJZCwgdGltZXN0YW1wLCB7XG4gICAgICBtYW5pZmVzdDogaHlkcmF0ZWRNYW5pZmVzdCxcbiAgICB9KTtcblxuICAgIGF3YWl0IGdlbmVyYXRlVmlkZW9FZmZlY3RzKFxuICAgICAgW3sgaWQ6IHNjZW5lSWQsIGR1cmF0aW9uIH1dLFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgdXNlcixcbiAgICApO1xuXG4gICAgaHlkcmF0ZWRNYW5pZmVzdCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG5cbiAgICAvLyBOb3RlOiBSZW1vdmVkICdwcmV2aWV3X2NvbXBsZXRlZCcgYnJvYWRjYXN0IHRvIHByZXZlbnQgaXNMb2FkaW5nVmlkZW9TY2VuZXMgZnJvbSBiZWluZyBhZmZlY3RlZFxuICAgIC8vIHdoZW4gc2F2aW5nIGFuIGltYWdlLiBUaGUgJ2ltYWdlX2NyZWF0ZWQnIGJyb2FkY2FzdCBpcyBzdWZmaWNpZW50IGZvciB1cGRhdGluZyB0aGUgbWFuaWZlc3QuXG4gICAgY29uc29sZS5sb2coJ+KchSBJbWFnZSBzYXZlZCB2aWEgU1FTIGZvciBzY2VuZTonLCByZXF1ZXN0LnNjZW5lSWQpO1xuXG4gICAgLy8gSWYgdGhpcyB3YXMgdHJpZ2dlcmVkIGJ5IFNRUywgZGVsZXRlIHRoZSBtZXNzYWdlIGZyb20gdGhlIHF1ZXVlXG4gICAgaWYgKHJlY29yZCAmJiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwpIHtcbiAgICAgIGNvbnN0IGRlbGV0ZUNvbW1hbmQgPSBuZXcgRGVsZXRlTWVzc2FnZUNvbW1hbmQoe1xuICAgICAgICBRdWV1ZVVybDogcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMLFxuICAgICAgICBSZWNlaXB0SGFuZGxlOiByZWNvcmQucmVjZWlwdEhhbmRsZSxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgc3FzLnNlbmQoZGVsZXRlQ29tbWFuZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgbWVzc2FnZTogJ0ltYWdlIHNhdmVkIHN1Y2Nlc3NmdWxseScgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiBzYXZlIGltYWdlIChTUVMpOicsIGVycm9yKTtcbiAgICB0aHJvdyBFcnJvcignSW1hZ2Ugc2F2ZSBmYWlsZWQnKTtcbiAgfVxufVxuIl19