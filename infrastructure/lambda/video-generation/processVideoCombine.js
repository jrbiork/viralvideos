"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVideoCombine = processVideoCombine;
const videoCombiner_1 = require("./videoCombiner");
const broadcastProgress_1 = require("./broadcastProgress");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1ZpZGVvQ29tYmluZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NWaWRlb0NvbWJpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFtQkEsa0RBNENDO0FBOURELG1EQUF1RDtBQUV2RCwyREFBd0Q7QUFDeEQsMERBSWdDO0FBQ2hDLG9EQUEyRDtBQUMzRCxvREFBZ0Q7QUFFaEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFPdEUsS0FBSyxVQUFVLG1CQUFtQixDQUN2QyxPQUE0QixFQUM1QixNQUFrQjtJQUVsQixJQUFJLENBQUM7UUFDSCxNQUFNLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLE9BQU8sQ0FBQztRQUV0QyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDMUIsTUFBTSxJQUFJLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsMkJBQVcsRUFBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdEQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2QsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDO2FBQ3RELENBQUM7UUFDSixDQUFDO1FBRUQsTUFBTSxhQUFhLEdBQUcsTUFBTSxJQUFBLG9DQUFvQixFQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUVwRSxNQUFNLElBQUEsOEJBQWMsRUFBQyxRQUFRLEVBQUUsRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUV6RCxNQUFNLGdCQUFnQixHQUFHLE1BQU0sSUFBQSwrQkFBZSxFQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRXpELE1BQU0sSUFBQSxxQ0FBaUIsRUFBQyxpQkFBaUIsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFO1lBQzVELFFBQVEsRUFBRSxnQkFBZ0I7U0FDM0IsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1FBRTFDLGtFQUFrRTtRQUNsRSxJQUFJLE1BQU0sSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzFDLE1BQU0sYUFBYSxHQUFHLElBQUksaUNBQW9CLENBQUM7Z0JBQzdDLFFBQVEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWU7Z0JBQ3JDLGFBQWEsRUFBRSxNQUFNLENBQUMsYUFBYTthQUNwQyxDQUFDLENBQUM7WUFDSCxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDaEMsQ0FBQztRQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDNUQsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLCtCQUErQixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3RELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTUVNSZWNvcmQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IGNvbWJpbmVWaWRlb0FuZEF1ZGlvIH0gZnJvbSAnLi92aWRlb0NvbWJpbmVyJztcbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi92aWRlb0NvbWJpbmVyJztcbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi9icm9hZGNhc3RQcm9ncmVzcyc7XG5pbXBvcnQge1xuICBnZXRNYW5pZmVzdCxcbiAgaHlkcmF0ZU1hbmlmZXN0LFxuICB1cGRhdGVNYW5pZmVzdCxcbn0gZnJvbSAnLi4vdXRpbHMvbWFuaWZlc3RVdGlscyc7XG5pbXBvcnQgeyBEZWxldGVNZXNzYWdlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuaW1wb3J0IHsgU1FTQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVmlkZW9Db21iaW5lUmVxdWVzdCB7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NWaWRlb0NvbWJpbmUoXG4gIHJlcXVlc3Q6IFZpZGVvQ29tYmluZVJlcXVlc3QsXG4gIHJlY29yZD86IFNRU1JlY29yZCxcbik6IFByb21pc2U8YW55PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgeyB1c2VySWQsIHRpbWVzdGFtcCB9ID0gcmVxdWVzdDtcblxuICAgIGlmICghdXNlcklkIHx8ICF0aW1lc3RhbXApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyB1c2VySWQgb3IgdGltZXN0YW1wJyk7XG4gICAgfVxuXG4gICAgY29uc3QgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdCh1c2VySWQsIHRpbWVzdGFtcCk7XG4gICAgaWYgKCFtYW5pZmVzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWFuaWZlc3Qgbm90IGZvdW5kJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgZmluYWxWaWRlb1VybCA9IGF3YWl0IGNvbWJpbmVWaWRlb0FuZEF1ZGlvKHVzZXJJZCwgdGltZXN0YW1wKTtcblxuICAgIGF3YWl0IHVwZGF0ZU1hbmlmZXN0KG1hbmlmZXN0LCB7IHZpZGVvR2VuZXJhdGVkOiB0cnVlIH0pO1xuXG4gICAgY29uc3QgaHlkcmF0ZWRNYW5pZmVzdCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcygndmlkZW9fY29tcGxldGVkJywgdXNlcklkLCB0aW1lc3RhbXAsIHtcbiAgICAgIG1hbmlmZXN0OiBoeWRyYXRlZE1hbmlmZXN0LFxuICAgIH0pO1xuICAgIGNvbnNvbGUubG9nKCfinIUgVmlkZW8gY29tYmluZWQgY29tcGxldGVkJyk7XG5cbiAgICAvLyBJZiB0aGlzIHdhcyB0cmlnZ2VyZWQgYnkgU1FTLCBkZWxldGUgdGhlIG1lc3NhZ2UgZnJvbSB0aGUgcXVldWVcbiAgICBpZiAocmVjb3JkICYmIHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCkge1xuICAgICAgY29uc3QgZGVsZXRlQ29tbWFuZCA9IG5ldyBEZWxldGVNZXNzYWdlQ29tbWFuZCh7XG4gICAgICAgIFF1ZXVlVXJsOiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwsXG4gICAgICAgIFJlY2VpcHRIYW5kbGU6IHJlY29yZC5yZWNlaXB0SGFuZGxlLFxuICAgICAgfSk7XG4gICAgICBhd2FpdCBzcXMuc2VuZChkZWxldGVDb21tYW5kKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZygn8J+OrCBWaWRlbyBjb21iaW5lZCBjb21wbGV0ZWQnLCBmaW5hbFZpZGVvVXJsKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiBwcm9jZXNzVmlkZW9Db21iaW5lOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19