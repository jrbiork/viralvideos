"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVideoCombine = processVideoCombine;
const videoCombiner_1 = require("./videoCombiner");
const broadcastProgress_1 = require("../utils/broadcastProgress");
const manifestUtils_1 = require("../utils/manifestUtils");
const client_sqs_1 = require("@aws-sdk/client-sqs");
const client_sqs_2 = require("@aws-sdk/client-sqs");
const sqs = new client_sqs_2.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
async function processVideoCombine(request, record) {
    try {
        const { userId, timestamp, removedScenes = [] } = request;
        if (!userId || !timestamp) {
            throw new Error('Missing userId or timestamp');
        }
        console.log('🎬 Processing video combine with removed scenes:', removedScenes);
        const manifest = await (0, manifestUtils_1.getManifest)(userId, timestamp);
        if (!manifest) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Manifest not found' }),
            };
        }
        const { finalVideoSignedUrl, size } = await (0, videoCombiner_1.combineVideoAndAudio)(userId, timestamp, manifest, removedScenes);
        //
        await (0, manifestUtils_1.updateManifest)(manifest, {
            videoGenerated: true,
            finalVideoUrl: `${userId}/${timestamp}-final-video.mp4`,
            scenes: manifest.scenes.map((scene) => ({
                ...scene,
                removed: removedScenes.includes(scene.id),
            })),
            generatedAt: Date.now().toString(),
        });
        const hydratedManifest = await (0, manifestUtils_1.hydrateManifest)(manifest);
        await (0, broadcastProgress_1.broadcastProgress)('video_completed', userId, timestamp, {
            manifest: {
                ...hydratedManifest,
                finalVideoUrl: finalVideoSignedUrl,
                size: size,
            },
        });
        console.log('✅ Video combined completed');
        // If this was triggered by SQS, delete the message from the queue
        if (record && process.env.VIDEO_QUEUE_URL) {
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
        }
        console.log('🎬 Video combined completed', finalVideoSignedUrl);
    }
    catch (error) {
        console.error('Error in processVideoCombine:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1ZpZGVvQ29tYmluZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NWaWRlb0NvbWJpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFvQkEsa0RBbUVDO0FBdEZELG1EQUF1RDtBQUN2RCxrRUFBK0Q7QUFDL0QsMERBSWdDO0FBQ2hDLG9EQUEyRDtBQUMzRCxvREFBZ0Q7QUFHaEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFRdEUsS0FBSyxVQUFVLG1CQUFtQixDQUN2QyxPQUE0QixFQUM1QixNQUFrQjtJQUVsQixJQUFJLENBQUM7UUFDSCxNQUFNLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxhQUFhLEdBQUcsRUFBRSxFQUFFLEdBQUcsT0FBTyxDQUFDO1FBRTFELElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUMxQixNQUFNLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFDakQsQ0FBQztRQUVELE9BQU8sQ0FBQyxHQUFHLENBQ1Qsa0RBQWtELEVBQ2xELGFBQWEsQ0FDZCxDQUFDO1FBRUYsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLDJCQUFXLEVBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNkLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQzthQUN0RCxDQUFDO1FBQ0osQ0FBQztRQUVELE1BQU0sRUFBRSxtQkFBbUIsRUFBRSxJQUFJLEVBQUUsR0FBRyxNQUFNLElBQUEsb0NBQW9CLEVBQzlELE1BQU0sRUFDTixTQUFTLEVBQ1QsUUFBUSxFQUNSLGFBQWEsQ0FDZCxDQUFDO1FBRUYsRUFBRTtRQUNGLE1BQU0sSUFBQSw4QkFBYyxFQUFDLFFBQVEsRUFBRTtZQUM3QixjQUFjLEVBQUUsSUFBSTtZQUNwQixhQUFhLEVBQUUsR0FBRyxNQUFNLElBQUksU0FBUyxrQkFBa0I7WUFDdkQsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBb0IsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDckQsR0FBRyxLQUFLO2dCQUNSLE9BQU8sRUFBRSxhQUFhLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7YUFDMUMsQ0FBQyxDQUFDO1lBQ0gsV0FBVyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLEVBQUU7U0FDbkMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLElBQUEsK0JBQWUsRUFBQyxRQUFRLENBQUMsQ0FBQztRQUV6RCxNQUFNLElBQUEscUNBQWlCLEVBQUMsaUJBQWlCLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRTtZQUM1RCxRQUFRLEVBQUU7Z0JBQ1IsR0FBRyxnQkFBZ0I7Z0JBQ25CLGFBQWEsRUFBRSxtQkFBbUI7Z0JBQ2xDLElBQUksRUFBRSxJQUFJO2FBQ1g7U0FDRixDQUFDLENBQUM7UUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFFMUMsa0VBQWtFO1FBQ2xFLElBQUksTUFBTSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDMUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxpQ0FBb0IsQ0FBQztnQkFDN0MsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZTtnQkFDckMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxhQUFhO2FBQ3BDLENBQUMsQ0FBQztZQUNILE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO0lBQ2xFLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0RCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU1FTUmVjb3JkIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBjb21iaW5lVmlkZW9BbmRBdWRpbyB9IGZyb20gJy4vdmlkZW9Db21iaW5lcic7XG5pbXBvcnQgeyBicm9hZGNhc3RQcm9ncmVzcyB9IGZyb20gJy4uL3V0aWxzL2Jyb2FkY2FzdFByb2dyZXNzJztcbmltcG9ydCB7XG4gIGdldE1hbmlmZXN0LFxuICBoeWRyYXRlTWFuaWZlc3QsXG4gIHVwZGF0ZU1hbmlmZXN0LFxufSBmcm9tICcuLi91dGlscy9tYW5pZmVzdFV0aWxzJztcbmltcG9ydCB7IERlbGV0ZU1lc3NhZ2VDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5pbXBvcnQgeyBTUVNDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3FzJztcbmltcG9ydCB7IE1hbmlmZXN0U2NlbmUgfSBmcm9tICcuLi90eXBlcy9zM1R5cGVzJztcblxuY29uc3Qgc3FzID0gbmV3IFNRU0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyB9KTtcblxuZXhwb3J0IGludGVyZmFjZSBWaWRlb0NvbWJpbmVSZXF1ZXN0IHtcbiAgdXNlcklkOiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogc3RyaW5nO1xuICByZW1vdmVkU2NlbmVzPzogbnVtYmVyW107XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwcm9jZXNzVmlkZW9Db21iaW5lKFxuICByZXF1ZXN0OiBWaWRlb0NvbWJpbmVSZXF1ZXN0LFxuICByZWNvcmQ/OiBTUVNSZWNvcmQsXG4pOiBQcm9taXNlPGFueT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsgdXNlcklkLCB0aW1lc3RhbXAsIHJlbW92ZWRTY2VuZXMgPSBbXSB9ID0gcmVxdWVzdDtcblxuICAgIGlmICghdXNlcklkIHx8ICF0aW1lc3RhbXApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyB1c2VySWQgb3IgdGltZXN0YW1wJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coXG4gICAgICAn8J+OrCBQcm9jZXNzaW5nIHZpZGVvIGNvbWJpbmUgd2l0aCByZW1vdmVkIHNjZW5lczonLFxuICAgICAgcmVtb3ZlZFNjZW5lcyxcbiAgICApO1xuXG4gICAgY29uc3QgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdCh1c2VySWQsIHRpbWVzdGFtcCk7XG4gICAgaWYgKCFtYW5pZmVzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWFuaWZlc3Qgbm90IGZvdW5kJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgeyBmaW5hbFZpZGVvU2lnbmVkVXJsLCBzaXplIH0gPSBhd2FpdCBjb21iaW5lVmlkZW9BbmRBdWRpbyhcbiAgICAgIHVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIG1hbmlmZXN0LFxuICAgICAgcmVtb3ZlZFNjZW5lcyxcbiAgICApO1xuXG4gICAgLy9cbiAgICBhd2FpdCB1cGRhdGVNYW5pZmVzdChtYW5pZmVzdCwge1xuICAgICAgdmlkZW9HZW5lcmF0ZWQ6IHRydWUsXG4gICAgICBmaW5hbFZpZGVvVXJsOiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS1maW5hbC12aWRlby5tcDRgLFxuICAgICAgc2NlbmVzOiBtYW5pZmVzdC5zY2VuZXMubWFwKChzY2VuZTogTWFuaWZlc3RTY2VuZSkgPT4gKHtcbiAgICAgICAgLi4uc2NlbmUsXG4gICAgICAgIHJlbW92ZWQ6IHJlbW92ZWRTY2VuZXMuaW5jbHVkZXMoc2NlbmUuaWQpLFxuICAgICAgfSkpLFxuICAgICAgZ2VuZXJhdGVkQXQ6IERhdGUubm93KCkudG9TdHJpbmcoKSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGh5ZHJhdGVkTWFuaWZlc3QgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoJ3ZpZGVvX2NvbXBsZXRlZCcsIHVzZXJJZCwgdGltZXN0YW1wLCB7XG4gICAgICBtYW5pZmVzdDoge1xuICAgICAgICAuLi5oeWRyYXRlZE1hbmlmZXN0LFxuICAgICAgICBmaW5hbFZpZGVvVXJsOiBmaW5hbFZpZGVvU2lnbmVkVXJsLFxuICAgICAgICBzaXplOiBzaXplLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBjb25zb2xlLmxvZygn4pyFIFZpZGVvIGNvbWJpbmVkIGNvbXBsZXRlZCcpO1xuXG4gICAgLy8gSWYgdGhpcyB3YXMgdHJpZ2dlcmVkIGJ5IFNRUywgZGVsZXRlIHRoZSBtZXNzYWdlIGZyb20gdGhlIHF1ZXVlXG4gICAgaWYgKHJlY29yZCAmJiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwpIHtcbiAgICAgIGNvbnN0IGRlbGV0ZUNvbW1hbmQgPSBuZXcgRGVsZXRlTWVzc2FnZUNvbW1hbmQoe1xuICAgICAgICBRdWV1ZVVybDogcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMLFxuICAgICAgICBSZWNlaXB0SGFuZGxlOiByZWNvcmQucmVjZWlwdEhhbmRsZSxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgc3FzLnNlbmQoZGVsZXRlQ29tbWFuZCk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CfjqwgVmlkZW8gY29tYmluZWQgY29tcGxldGVkJywgZmluYWxWaWRlb1NpZ25lZFVybCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gcHJvY2Vzc1ZpZGVvQ29tYmluZTonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==