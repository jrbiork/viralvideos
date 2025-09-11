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
        const finalVideoUrl = await (0, videoCombiner_1.combineVideoAndAudio)(userId, timestamp, manifest);
        await (0, manifestUtils_1.updateManifest)(manifest, {
            videoGenerated: true,
            generatedAt: Date.now().toString(),
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1ZpZGVvQ29tYmluZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NWaWRlb0NvbWJpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFrQkEsa0RBbURDO0FBcEVELG1EQUF1RDtBQUN2RCxrRUFBK0Q7QUFDL0QsMERBSWdDO0FBQ2hDLG9EQUEyRDtBQUMzRCxvREFBZ0Q7QUFFaEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFPdEUsS0FBSyxVQUFVLG1CQUFtQixDQUN2QyxPQUE0QixFQUM1QixNQUFrQjtJQUVsQixJQUFJLENBQUM7UUFDSCxNQUFNLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLE9BQU8sQ0FBQztRQUV0QyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDMUIsTUFBTSxJQUFJLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUEsMkJBQVcsRUFBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDdEQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2QsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDO2FBQ3RELENBQUM7UUFDSixDQUFDO1FBRUQsTUFBTSxhQUFhLEdBQUcsTUFBTSxJQUFBLG9DQUFvQixFQUM5QyxNQUFNLEVBQ04sU0FBUyxFQUNULFFBQVEsQ0FDVCxDQUFDO1FBRUYsTUFBTSxJQUFBLDhCQUFjLEVBQUMsUUFBUSxFQUFFO1lBQzdCLGNBQWMsRUFBRSxJQUFJO1lBQ3BCLFdBQVcsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxFQUFFO1NBQ25DLENBQUMsQ0FBQztRQUVILE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxJQUFBLCtCQUFlLEVBQUMsUUFBUSxDQUFDLENBQUM7UUFFekQsTUFBTSxJQUFBLHFDQUFpQixFQUFDLGlCQUFpQixFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUU7WUFDNUQsUUFBUSxFQUFFLGdCQUFnQjtTQUMzQixDQUFDLENBQUM7UUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFFMUMsa0VBQWtFO1FBQ2xFLElBQUksTUFBTSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDMUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxpQ0FBb0IsQ0FBQztnQkFDN0MsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZTtnQkFDckMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxhQUFhO2FBQ3BDLENBQUMsQ0FBQztZQUNILE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSxhQUFhLENBQUMsQ0FBQztJQUM1RCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNRU1JlY29yZCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgY29tYmluZVZpZGVvQW5kQXVkaW8gfSBmcm9tICcuL3ZpZGVvQ29tYmluZXInO1xuaW1wb3J0IHsgYnJvYWRjYXN0UHJvZ3Jlc3MgfSBmcm9tICcuLi91dGlscy9icm9hZGNhc3RQcm9ncmVzcyc7XG5pbXBvcnQge1xuICBnZXRNYW5pZmVzdCxcbiAgaHlkcmF0ZU1hbmlmZXN0LFxuICB1cGRhdGVNYW5pZmVzdCxcbn0gZnJvbSAnLi4vdXRpbHMvbWFuaWZlc3RVdGlscyc7XG5pbXBvcnQgeyBEZWxldGVNZXNzYWdlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuaW1wb3J0IHsgU1FTQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVmlkZW9Db21iaW5lUmVxdWVzdCB7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NWaWRlb0NvbWJpbmUoXG4gIHJlcXVlc3Q6IFZpZGVvQ29tYmluZVJlcXVlc3QsXG4gIHJlY29yZD86IFNRU1JlY29yZCxcbik6IFByb21pc2U8YW55PiB7XG4gIHRyeSB7XG4gICAgY29uc3QgeyB1c2VySWQsIHRpbWVzdGFtcCB9ID0gcmVxdWVzdDtcblxuICAgIGlmICghdXNlcklkIHx8ICF0aW1lc3RhbXApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyB1c2VySWQgb3IgdGltZXN0YW1wJyk7XG4gICAgfVxuXG4gICAgY29uc3QgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdCh1c2VySWQsIHRpbWVzdGFtcCk7XG4gICAgaWYgKCFtYW5pZmVzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWFuaWZlc3Qgbm90IGZvdW5kJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgZmluYWxWaWRlb1VybCA9IGF3YWl0IGNvbWJpbmVWaWRlb0FuZEF1ZGlvKFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgbWFuaWZlc3QsXG4gICAgKTtcblxuICAgIGF3YWl0IHVwZGF0ZU1hbmlmZXN0KG1hbmlmZXN0LCB7XG4gICAgICB2aWRlb0dlbmVyYXRlZDogdHJ1ZSxcbiAgICAgIGdlbmVyYXRlZEF0OiBEYXRlLm5vdygpLnRvU3RyaW5nKCksXG4gICAgfSk7XG5cbiAgICBjb25zdCBoeWRyYXRlZE1hbmlmZXN0ID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKCd2aWRlb19jb21wbGV0ZWQnLCB1c2VySWQsIHRpbWVzdGFtcCwge1xuICAgICAgbWFuaWZlc3Q6IGh5ZHJhdGVkTWFuaWZlc3QsXG4gICAgfSk7XG4gICAgY29uc29sZS5sb2coJ+KchSBWaWRlbyBjb21iaW5lZCBjb21wbGV0ZWQnKTtcblxuICAgIC8vIElmIHRoaXMgd2FzIHRyaWdnZXJlZCBieSBTUVMsIGRlbGV0ZSB0aGUgbWVzc2FnZSBmcm9tIHRoZSBxdWV1ZVxuICAgIGlmIChyZWNvcmQgJiYgcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMKSB7XG4gICAgICBjb25zdCBkZWxldGVDb21tYW5kID0gbmV3IERlbGV0ZU1lc3NhZ2VDb21tYW5kKHtcbiAgICAgICAgUXVldWVVcmw6IHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCxcbiAgICAgICAgUmVjZWlwdEhhbmRsZTogcmVjb3JkLnJlY2VpcHRIYW5kbGUsXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHNxcy5zZW5kKGRlbGV0ZUNvbW1hbmQpO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKCfwn46sIFZpZGVvIGNvbWJpbmVkIGNvbXBsZXRlZCcsIGZpbmFsVmlkZW9VcmwpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGluIHByb2Nlc3NWaWRlb0NvbWJpbmU6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=