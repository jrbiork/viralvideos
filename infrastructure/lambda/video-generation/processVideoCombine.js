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
        const { userId, timestamp } = request;
        if (!userId || !timestamp) {
            throw new Error('Missing userId or timestamp');
        }
        const manifest = await (0, manifestUtils_1.getManifest)(userId, timestamp);
        if (!manifest) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Manifest not found' }),
            };
        }
        const finalVideoUrl = await (0, videoCombiner_1.combineVideoAndAudio)(userId, timestamp);
        await (0, manifestUtils_1.updateManifest)(manifest, { videoGenerated: true });
        const hydratedManifest = await (0, manifestUtils_1.hydrateManifest)(manifest);
        await (0, broadcastProgress_1.broadcastProgress)('video_completed', userId, timestamp, {
            manifest: hydratedManifest,
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
        console.log('🎬 Video combined completed', finalVideoUrl);
    }
    catch (error) {
        console.error('Error in processVideoCombine:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1ZpZGVvQ29tYmluZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NWaWRlb0NvbWJpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFrQkEsa0RBNENDO0FBN0RELG1EQUF1RDtBQUN2RCxrRUFBK0Q7QUFDL0QsMERBSWdDO0FBQ2hDLG9EQUEyRDtBQUMzRCxvREFBZ0Q7QUFFaEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFPdEUsS0FBSyxVQUFVLG1CQUFtQixDQUN2QyxPQUE0QixFQUM1QixNQUFrQjtJQUVsQixJQUFJLENBQUM7UUFDSCxNQUFNLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLE9BQU8sQ0FBQztRQUV0QyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDMUIsTUFBTSxJQUFJLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsMkJBQVcsRUFBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdEQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2QsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDO2FBQ3RELENBQUM7UUFDSixDQUFDO1FBRUQsTUFBTSxhQUFhLEdBQUcsTUFBTSxJQUFBLG9DQUFvQixFQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUVwRSxNQUFNLElBQUEsOEJBQWMsRUFBQyxRQUFRLEVBQUUsRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUV6RCxNQUFNLGdCQUFnQixHQUFHLE1BQU0sSUFBQSwrQkFBZSxFQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRXpELE1BQU0sSUFBQSxxQ0FBaUIsRUFBQyxpQkFBaUIsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFO1lBQzVELFFBQVEsRUFBRSxnQkFBZ0I7U0FDM0IsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1FBRTFDLGtFQUFrRTtRQUNsRSxJQUFJLE1BQU0sSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzFDLE1BQU0sYUFBYSxHQUFHLElBQUksaUNBQW9CLENBQUM7Z0JBQzdDLFFBQVEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWU7Z0JBQ3JDLGFBQWEsRUFBRSxNQUFNLENBQUMsYUFBYTthQUNwQyxDQUFDLENBQUM7WUFDSCxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDaEMsQ0FBQztRQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDNUQsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLCtCQUErQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3RELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTUVNSZWNvcmQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IGNvbWJpbmVWaWRlb0FuZEF1ZGlvIH0gZnJvbSAnLi92aWRlb0NvbWJpbmVyJztcbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi4vdXRpbHMvYnJvYWRjYXN0UHJvZ3Jlc3MnO1xuaW1wb3J0IHtcbiAgZ2V0TWFuaWZlc3QsXG4gIGh5ZHJhdGVNYW5pZmVzdCxcbiAgdXBkYXRlTWFuaWZlc3QsXG59IGZyb20gJy4uL3V0aWxzL21hbmlmZXN0VXRpbHMnO1xuaW1wb3J0IHsgRGVsZXRlTWVzc2FnZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3FzJztcbmltcG9ydCB7IFNRU0NsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuXG5jb25zdCBzcXMgPSBuZXcgU1FTQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZpZGVvQ29tYmluZVJlcXVlc3Qge1xuICB1c2VySWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwcm9jZXNzVmlkZW9Db21iaW5lKFxuICByZXF1ZXN0OiBWaWRlb0NvbWJpbmVSZXF1ZXN0LFxuICByZWNvcmQ/OiBTUVNSZWNvcmQsXG4pOiBQcm9taXNlPGFueT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHsgdXNlcklkLCB0aW1lc3RhbXAgfSA9IHJlcXVlc3Q7XG5cbiAgICBpZiAoIXVzZXJJZCB8fCAhdGltZXN0YW1wKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgdXNlcklkIG9yIHRpbWVzdGFtcCcpO1xuICAgIH1cblxuICAgIGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgZ2V0TWFuaWZlc3QodXNlcklkLCB0aW1lc3RhbXApO1xuICAgIGlmICghbWFuaWZlc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ01hbmlmZXN0IG5vdCBmb3VuZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IGZpbmFsVmlkZW9VcmwgPSBhd2FpdCBjb21iaW5lVmlkZW9BbmRBdWRpbyh1c2VySWQsIHRpbWVzdGFtcCk7XG5cbiAgICBhd2FpdCB1cGRhdGVNYW5pZmVzdChtYW5pZmVzdCwgeyB2aWRlb0dlbmVyYXRlZDogdHJ1ZSB9KTtcblxuICAgIGNvbnN0IGh5ZHJhdGVkTWFuaWZlc3QgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoJ3ZpZGVvX2NvbXBsZXRlZCcsIHVzZXJJZCwgdGltZXN0YW1wLCB7XG4gICAgICBtYW5pZmVzdDogaHlkcmF0ZWRNYW5pZmVzdCxcbiAgICB9KTtcbiAgICBjb25zb2xlLmxvZygn4pyFIFZpZGVvIGNvbWJpbmVkIGNvbXBsZXRlZCcpO1xuXG4gICAgLy8gSWYgdGhpcyB3YXMgdHJpZ2dlcmVkIGJ5IFNRUywgZGVsZXRlIHRoZSBtZXNzYWdlIGZyb20gdGhlIHF1ZXVlXG4gICAgaWYgKHJlY29yZCAmJiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwpIHtcbiAgICAgIGNvbnN0IGRlbGV0ZUNvbW1hbmQgPSBuZXcgRGVsZXRlTWVzc2FnZUNvbW1hbmQoe1xuICAgICAgICBRdWV1ZVVybDogcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMLFxuICAgICAgICBSZWNlaXB0SGFuZGxlOiByZWNvcmQucmVjZWlwdEhhbmRsZSxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgc3FzLnNlbmQoZGVsZXRlQ29tbWFuZCk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CfjqwgVmlkZW8gY29tYmluZWQgY29tcGxldGVkJywgZmluYWxWaWRlb1VybCk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gcHJvY2Vzc1ZpZGVvQ29tYmluZTonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==