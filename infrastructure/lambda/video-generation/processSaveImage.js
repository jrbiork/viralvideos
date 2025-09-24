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
        (0, broadcastProgress_1.broadcastProgress)('preview_completed', userId, timestamp, {
            manifest: hydratedManifest,
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1NhdmVJbWFnZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NTYXZlSW1hZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFvQkEsNENBNkVDO0FBaEdELG9EQUFzRTtBQUN0RSwwREFBc0U7QUFDdEUsb0RBQXNEO0FBQ3RELHdEQUE2RDtBQUM3RCxrRUFBK0Q7QUFDL0Qsd0NBQXdDO0FBRXhDLE1BQU0sR0FBRyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBWXRFLEtBQUssVUFBVSxnQkFBZ0IsQ0FDcEMsT0FBeUIsRUFDekIsTUFBa0I7SUFFbEIsSUFBSSxDQUFDO1FBQ0gsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDMUMsTUFBTSxJQUFJLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFDRCxJQUFJLE9BQU8sQ0FBQyxPQUFPLEtBQUssU0FBUyxJQUFJLE9BQU8sQ0FBQyxPQUFPLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDOUQsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3JDLENBQUM7UUFDRCxJQUFJLENBQUMsT0FBTyxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1FBQy9DLENBQUM7UUFDRCxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3RCLE1BQU0sSUFBSSxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUN0QyxDQUFDO1FBRUQsTUFBTSxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFFBQVEsRUFBRSxHQUFHLE9BQU8sQ0FBQztRQUU1RSxvQkFBb0I7UUFDcEIsTUFBTSxRQUFRLEdBQUcsR0FBRyxNQUFNLElBQUksU0FBUyxVQUFVLE9BQU8sTUFBTSxDQUFDO1FBQy9ELE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFFaEQsTUFBTSxJQUFBLDRCQUFlLEVBQUMsaUJBQWlCLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUNyRSxPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixDQUFDLENBQUM7UUFFN0Msa0NBQWtDO1FBQ2xDLElBQUksT0FBTyxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDOUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0REFBNEQsQ0FBQyxDQUFDO1lBQzFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsQ0FBQztRQUNqRCxDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLDJCQUFXLEVBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNkLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQzthQUN0RCxDQUFDO1FBQ0osQ0FBQztRQUVELE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBQSxjQUFPLEVBQUMsTUFBTSxDQUFDLENBQUM7UUFFbkMsSUFBSSxnQkFBZ0IsR0FBRyxNQUFNLElBQUEsK0JBQWUsRUFBQyxRQUFRLENBQUMsQ0FBQztRQUV2RCxJQUFBLHFDQUFpQixFQUFDLGVBQWUsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFO1lBQ3BELFFBQVEsRUFBRSxnQkFBZ0I7U0FDM0IsQ0FBQyxDQUFDO1FBRUgsTUFBTSxJQUFBLG1DQUFvQixFQUN4QixDQUFDLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsQ0FBQyxFQUMzQixNQUFNLEVBQ04sU0FBUyxFQUNULElBQUksQ0FDTCxDQUFDO1FBRUYsZ0JBQWdCLEdBQUcsTUFBTSxJQUFBLCtCQUFlLEVBQUMsUUFBUSxDQUFDLENBQUM7UUFFbkQsSUFBQSxxQ0FBaUIsRUFBQyxtQkFBbUIsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFO1lBQ3hELFFBQVEsRUFBRSxnQkFBZ0I7U0FDM0IsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFakUsa0VBQWtFO1FBQ2xFLElBQUksTUFBTSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDMUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxpQ0FBb0IsQ0FBQztnQkFDN0MsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZTtnQkFDckMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxhQUFhO2FBQ3BDLENBQUMsQ0FBQztZQUNILE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBRUQsT0FBTyxFQUFFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxDQUFDO0lBQ2pELENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNuRCxNQUFNLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0lBQ25DLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU1FTUmVjb3JkIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBTUVNDbGllbnQsIERlbGV0ZU1lc3NhZ2VDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5pbXBvcnQgeyBnZXRNYW5pZmVzdCwgaHlkcmF0ZU1hbmlmZXN0IH0gZnJvbSAnLi4vdXRpbHMvbWFuaWZlc3RVdGlscyc7XG5pbXBvcnQgeyB1cGxvYWRJbWFnZVRvUzMgfSBmcm9tICcuLi91dGlscy9zM1VwbG9hZGVyJztcbmltcG9ydCB7IGdlbmVyYXRlVmlkZW9FZmZlY3RzIH0gZnJvbSAnLi4vdXRpbHMvdmlkZW9FZmZlY3RzJztcbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi4vdXRpbHMvYnJvYWRjYXN0UHJvZ3Jlc3MnO1xuaW1wb3J0IHsgZ2V0VXNlciB9IGZyb20gJy4uL3V0aWxzL3VzZXInO1xuXG5jb25zdCBzcXMgPSBuZXcgU1FTQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNhdmVJbWFnZVJlcXVlc3Qge1xuICB0eXBlPzogJ3NhdmUtaW1hZ2UnO1xuICB1c2VySWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG4gIHNjZW5lSWQ6IG51bWJlcjtcbiAgZ2VuZXJhdGVkSW1hZ2VVcmw6IHN0cmluZztcbiAgZHVyYXRpb24/OiBudW1iZXI7XG4gIGluTWVtb3J5RWRpdFNjZW5lPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NTYXZlSW1hZ2UoXG4gIHJlcXVlc3Q6IFNhdmVJbWFnZVJlcXVlc3QsXG4gIHJlY29yZD86IFNRU1JlY29yZCxcbik6IFByb21pc2U8YW55PiB7XG4gIHRyeSB7XG4gICAgaWYgKCFyZXF1ZXN0LnVzZXJJZCB8fCAhcmVxdWVzdC50aW1lc3RhbXApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyB1c2VySWQgb3IgdGltZXN0YW1wJyk7XG4gICAgfVxuICAgIGlmIChyZXF1ZXN0LnNjZW5lSWQgPT09IHVuZGVmaW5lZCB8fCByZXF1ZXN0LnNjZW5lSWQgPT09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyBzY2VuZUlkJyk7XG4gICAgfVxuICAgIGlmICghcmVxdWVzdC5nZW5lcmF0ZWRJbWFnZVVybCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIGdlbmVyYXRlZEltYWdlVXJsJyk7XG4gICAgfVxuICAgIGlmICghcmVxdWVzdC5kdXJhdGlvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIGR1cmF0aW9uJyk7XG4gICAgfVxuXG4gICAgY29uc3QgeyB1c2VySWQsIHRpbWVzdGFtcCwgc2NlbmVJZCwgZ2VuZXJhdGVkSW1hZ2VVcmwsIGR1cmF0aW9uIH0gPSByZXF1ZXN0O1xuXG4gICAgLy8gRm9ybSB0aGUgaW1hZ2VLZXlcbiAgICBjb25zdCBpbWFnZUtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmVJZH0ucG5nYDtcbiAgICBjb25zb2xlLmxvZyhg8J+UkSBGb3JtZWQgaW1hZ2Uga2V5OiAke2ltYWdlS2V5fWApO1xuXG4gICAgYXdhaXQgdXBsb2FkSW1hZ2VUb1MzKGdlbmVyYXRlZEltYWdlVXJsLCB1c2VySWQsIHRpbWVzdGFtcCwgc2NlbmVJZCk7XG4gICAgY29uc29sZS5sb2coYOKchSBJbWFnZSB1cGxvYWRlZCBzdWNjZXNzZnVsbHlgKTtcblxuICAgIC8vIHdoZW4gaXRzIGEgaW4gbWVtb3J5IGVkaXQgc2NlbmVcbiAgICBpZiAocmVxdWVzdC5pbk1lbW9yeUVkaXRTY2VuZSkge1xuICAgICAgY29uc29sZS5sb2coJ/CflJEgSW4gbWVtb3J5IGVkaXQgc2NlbmUsIHNraXBwaW5nIHZpZGVvIGVmZmVjdHMgZ2VuZXJhdGlvbicpO1xuICAgICAgcmV0dXJuIHsgbWVzc2FnZTogJ0ltYWdlIHNhdmVkIHN1Y2Nlc3NmdWxseScgfTtcbiAgICB9XG5cbiAgICBjb25zdCBtYW5pZmVzdCA9IGF3YWl0IGdldE1hbmlmZXN0KHVzZXJJZCwgdGltZXN0YW1wKTtcbiAgICBpZiAoIW1hbmlmZXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNYW5pZmVzdCBub3QgZm91bmQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyID0gYXdhaXQgZ2V0VXNlcih1c2VySWQpO1xuXG4gICAgbGV0IGh5ZHJhdGVkTWFuaWZlc3QgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuXG4gICAgYnJvYWRjYXN0UHJvZ3Jlc3MoJ2ltYWdlX2NyZWF0ZWQnLCB1c2VySWQsIHRpbWVzdGFtcCwge1xuICAgICAgbWFuaWZlc3Q6IGh5ZHJhdGVkTWFuaWZlc3QsXG4gICAgfSk7XG5cbiAgICBhd2FpdCBnZW5lcmF0ZVZpZGVvRWZmZWN0cyhcbiAgICAgIFt7IGlkOiBzY2VuZUlkLCBkdXJhdGlvbiB9XSxcbiAgICAgIHVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHVzZXIsXG4gICAgKTtcblxuICAgIGh5ZHJhdGVkTWFuaWZlc3QgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuXG4gICAgYnJvYWRjYXN0UHJvZ3Jlc3MoJ3ByZXZpZXdfY29tcGxldGVkJywgdXNlcklkLCB0aW1lc3RhbXAsIHtcbiAgICAgIG1hbmlmZXN0OiBoeWRyYXRlZE1hbmlmZXN0LFxuICAgIH0pO1xuICAgIGNvbnNvbGUubG9nKCfinIUgSW1hZ2Ugc2F2ZWQgdmlhIFNRUyBmb3Igc2NlbmU6JywgcmVxdWVzdC5zY2VuZUlkKTtcblxuICAgIC8vIElmIHRoaXMgd2FzIHRyaWdnZXJlZCBieSBTUVMsIGRlbGV0ZSB0aGUgbWVzc2FnZSBmcm9tIHRoZSBxdWV1ZVxuICAgIGlmIChyZWNvcmQgJiYgcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMKSB7XG4gICAgICBjb25zdCBkZWxldGVDb21tYW5kID0gbmV3IERlbGV0ZU1lc3NhZ2VDb21tYW5kKHtcbiAgICAgICAgUXVldWVVcmw6IHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCxcbiAgICAgICAgUmVjZWlwdEhhbmRsZTogcmVjb3JkLnJlY2VpcHRIYW5kbGUsXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHNxcy5zZW5kKGRlbGV0ZUNvbW1hbmQpO1xuICAgIH1cblxuICAgIHJldHVybiB7IG1lc3NhZ2U6ICdJbWFnZSBzYXZlZCBzdWNjZXNzZnVsbHknIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gc2F2ZSBpbWFnZSAoU1FTKTonLCBlcnJvcik7XG4gICAgdGhyb3cgRXJyb3IoJ0ltYWdlIHNhdmUgZmFpbGVkJyk7XG4gIH1cbn1cbiJdfQ==