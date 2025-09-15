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
        const finalVideoUrl = await (0, videoCombiner_1.combineVideoAndAudio)(userId, timestamp, manifest, removedScenes);
        //
        await (0, manifestUtils_1.updateManifest)(manifest, {
            videoGenerated: true,
            scenes: manifest.scenes.map((scene) => ({
                ...scene,
                removed: removedScenes.includes(scene.id),
            })),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1ZpZGVvQ29tYmluZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NWaWRlb0NvbWJpbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFvQkEsa0RBOERDO0FBakZELG1EQUF1RDtBQUN2RCxrRUFBK0Q7QUFDL0QsMERBSWdDO0FBQ2hDLG9EQUEyRDtBQUMzRCxvREFBZ0Q7QUFHaEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFRdEUsS0FBSyxVQUFVLG1CQUFtQixDQUN2QyxPQUE0QixFQUM1QixNQUFrQjtJQUVsQixJQUFJLENBQUM7UUFDSCxNQUFNLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxhQUFhLEdBQUcsRUFBRSxFQUFFLEdBQUcsT0FBTyxDQUFDO1FBRTFELElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUMxQixNQUFNLElBQUksS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFDakQsQ0FBQztRQUVELE9BQU8sQ0FBQyxHQUFHLENBQ1Qsa0RBQWtELEVBQ2xELGFBQWEsQ0FDZCxDQUFDO1FBRUYsTUFBTSxRQUFRLEdBQUcsTUFBTSxJQUFBLDJCQUFXLEVBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNkLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQzthQUN0RCxDQUFDO1FBQ0osQ0FBQztRQUVELE1BQU0sYUFBYSxHQUFHLE1BQU0sSUFBQSxvQ0FBb0IsRUFDOUMsTUFBTSxFQUNOLFNBQVMsRUFDVCxRQUFRLEVBQ1IsYUFBYSxDQUNkLENBQUM7UUFFRixFQUFFO1FBQ0YsTUFBTSxJQUFBLDhCQUFjLEVBQUMsUUFBUSxFQUFFO1lBQzdCLGNBQWMsRUFBRSxJQUFJO1lBQ3BCLE1BQU0sRUFBRSxRQUFRLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQW9CLEVBQUUsRUFBRSxDQUFDLENBQUM7Z0JBQ3JELEdBQUcsS0FBSztnQkFDUixPQUFPLEVBQUUsYUFBYSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2FBQzFDLENBQUMsQ0FBQztZQUNILFdBQVcsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxFQUFFO1NBQ25DLENBQUMsQ0FBQztRQUVILE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxJQUFBLCtCQUFlLEVBQUMsUUFBUSxDQUFDLENBQUM7UUFFekQsTUFBTSxJQUFBLHFDQUFpQixFQUFDLGlCQUFpQixFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUU7WUFDNUQsUUFBUSxFQUFFLGdCQUFnQjtTQUMzQixDQUFDLENBQUM7UUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFFMUMsa0VBQWtFO1FBQ2xFLElBQUksTUFBTSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDMUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxpQ0FBb0IsQ0FBQztnQkFDN0MsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZTtnQkFDckMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxhQUFhO2FBQ3BDLENBQUMsQ0FBQztZQUNILE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSxhQUFhLENBQUMsQ0FBQztJQUM1RCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNRU1JlY29yZCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgY29tYmluZVZpZGVvQW5kQXVkaW8gfSBmcm9tICcuL3ZpZGVvQ29tYmluZXInO1xuaW1wb3J0IHsgYnJvYWRjYXN0UHJvZ3Jlc3MgfSBmcm9tICcuLi91dGlscy9icm9hZGNhc3RQcm9ncmVzcyc7XG5pbXBvcnQge1xuICBnZXRNYW5pZmVzdCxcbiAgaHlkcmF0ZU1hbmlmZXN0LFxuICB1cGRhdGVNYW5pZmVzdCxcbn0gZnJvbSAnLi4vdXRpbHMvbWFuaWZlc3RVdGlscyc7XG5pbXBvcnQgeyBEZWxldGVNZXNzYWdlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuaW1wb3J0IHsgU1FTQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5pbXBvcnQgeyBNYW5pZmVzdFNjZW5lIH0gZnJvbSAnLi4vdHlwZXMvczNUeXBlcyc7XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVmlkZW9Db21iaW5lUmVxdWVzdCB7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgcmVtb3ZlZFNjZW5lcz86IG51bWJlcltdO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1ZpZGVvQ29tYmluZShcbiAgcmVxdWVzdDogVmlkZW9Db21iaW5lUmVxdWVzdCxcbiAgcmVjb3JkPzogU1FTUmVjb3JkLFxuKTogUHJvbWlzZTxhbnk+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB7IHVzZXJJZCwgdGltZXN0YW1wLCByZW1vdmVkU2NlbmVzID0gW10gfSA9IHJlcXVlc3Q7XG5cbiAgICBpZiAoIXVzZXJJZCB8fCAhdGltZXN0YW1wKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgdXNlcklkIG9yIHRpbWVzdGFtcCcpO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgJ/CfjqwgUHJvY2Vzc2luZyB2aWRlbyBjb21iaW5lIHdpdGggcmVtb3ZlZCBzY2VuZXM6JyxcbiAgICAgIHJlbW92ZWRTY2VuZXMsXG4gICAgKTtcblxuICAgIGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgZ2V0TWFuaWZlc3QodXNlcklkLCB0aW1lc3RhbXApO1xuICAgIGlmICghbWFuaWZlc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ01hbmlmZXN0IG5vdCBmb3VuZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IGZpbmFsVmlkZW9VcmwgPSBhd2FpdCBjb21iaW5lVmlkZW9BbmRBdWRpbyhcbiAgICAgIHVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIG1hbmlmZXN0LFxuICAgICAgcmVtb3ZlZFNjZW5lcyxcbiAgICApO1xuXG4gICAgLy9cbiAgICBhd2FpdCB1cGRhdGVNYW5pZmVzdChtYW5pZmVzdCwge1xuICAgICAgdmlkZW9HZW5lcmF0ZWQ6IHRydWUsXG4gICAgICBzY2VuZXM6IG1hbmlmZXN0LnNjZW5lcy5tYXAoKHNjZW5lOiBNYW5pZmVzdFNjZW5lKSA9PiAoe1xuICAgICAgICAuLi5zY2VuZSxcbiAgICAgICAgcmVtb3ZlZDogcmVtb3ZlZFNjZW5lcy5pbmNsdWRlcyhzY2VuZS5pZCksXG4gICAgICB9KSksXG4gICAgICBnZW5lcmF0ZWRBdDogRGF0ZS5ub3coKS50b1N0cmluZygpLFxuICAgIH0pO1xuXG4gICAgY29uc3QgaHlkcmF0ZWRNYW5pZmVzdCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcygndmlkZW9fY29tcGxldGVkJywgdXNlcklkLCB0aW1lc3RhbXAsIHtcbiAgICAgIG1hbmlmZXN0OiBoeWRyYXRlZE1hbmlmZXN0LFxuICAgIH0pO1xuICAgIGNvbnNvbGUubG9nKCfinIUgVmlkZW8gY29tYmluZWQgY29tcGxldGVkJyk7XG5cbiAgICAvLyBJZiB0aGlzIHdhcyB0cmlnZ2VyZWQgYnkgU1FTLCBkZWxldGUgdGhlIG1lc3NhZ2UgZnJvbSB0aGUgcXVldWVcbiAgICBpZiAocmVjb3JkICYmIHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCkge1xuICAgICAgY29uc3QgZGVsZXRlQ29tbWFuZCA9IG5ldyBEZWxldGVNZXNzYWdlQ29tbWFuZCh7XG4gICAgICAgIFF1ZXVlVXJsOiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwsXG4gICAgICAgIFJlY2VpcHRIYW5kbGU6IHJlY29yZC5yZWNlaXB0SGFuZGxlLFxuICAgICAgfSk7XG4gICAgICBhd2FpdCBzcXMuc2VuZChkZWxldGVDb21tYW5kKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZygn8J+OrCBWaWRlbyBjb21iaW5lZCBjb21wbGV0ZWQnLCBmaW5hbFZpZGVvVXJsKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiBwcm9jZXNzVmlkZW9Db21iaW5lOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19