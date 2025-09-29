"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processAnimateImage = processAnimateImage;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const manifestUtils_1 = require("../utils/manifestUtils");
const video_1 = require("../utils/video");
const broadcastProgress_1 = require("../utils/broadcastProgress");
const credits_1 = require("../utils/credits");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
async function processAnimateImage(request, record) {
    const { userId, timestamp, sceneId, animationPrompt, imageUrl, duration } = request;
    try {
        if (!userId || !timestamp) {
            throw new Error('Missing userId or timestamp');
        }
        if (sceneId === undefined || sceneId === null) {
            throw new Error('Missing sceneId');
        }
        if (!imageUrl) {
            throw new Error('Missing imageUrl');
        }
        if (!duration) {
            throw new Error('Missing duration');
        }
        const creditsToCharge = duration === 5 ? credits_1.CREDITS_COST.ai_video_5s : credits_1.CREDITS_COST.ai_video_10s;
        const { hasSufficientCredits, currentCredits } = await (0, credits_1.hasSufficientCreditsByUserId)(userId, creditsToCharge);
        console.log('hasCredits / current credits:', hasSufficientCredits, currentCredits);
        if (!hasSufficientCredits) {
            // Notify frontend about insufficient credits
            await (0, broadcastProgress_1.broadcastProgress)('insufficient_credits', userId, timestamp, {
                currentCredits,
            });
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Insufficient credits' }),
            };
        }
        const manifest = await (0, manifestUtils_1.getManifest)(userId, timestamp);
        if (!manifest) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Manifest not found' }),
            };
        }
        const seed = Math.floor(Math.random() * 10000);
        // Generate video from the provided image
        const videoKey = await (0, video_1.animateImageToVideo)(animationPrompt, duration, sceneId, userId, timestamp, seed, imageUrl);
        console.log(`✅ Animated video created for scene ${sceneId}: ${videoKey}`);
        // Build the updated array once
        const updatedScenes = manifest.scenes.map((scene) => scene.id === sceneId ? { ...scene, duration, animated: true } : scene);
        // Reuse it for both in-memory state and persistence
        manifest.scenes = updatedScenes;
        await (0, manifestUtils_1.updateManifest)(manifest, {
            scenes: updatedScenes,
        });
        // Deduct credits
        const newCurrentCredits = await (0, credits_1.updateCreditBalanceByUserId)(userId, creditsToCharge);
        console.log('new credits after deduction:', newCurrentCredits);
        let hydratedManifest = await (0, manifestUtils_1.hydrateManifest)(manifest);
        // Broadcast that the scene video is created
        await (0, broadcastProgress_1.broadcastProgress)('preview_completed', userId, timestamp, { manifest: hydratedManifest }, 'Scene animation completed');
        // If this was triggered by SQS, delete the message from the queue
        if (record && process.env.VIDEO_QUEUE_URL) {
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
        }
        return { message: 'Scene animated successfully', videoKey };
    }
    catch (error) {
        console.error('Error in animate image (SQS):', error);
        // todo: check if this is needed
        // const message = error instanceof Error ? error.message : 'Unknown error';
        // // Proactively broadcast error to frontend
        // try {
        //   await broadcastProgress(
        //     'error',
        //     userId,
        //     timestamp,
        //     { error: message },
        //     message,
        //   );
        // } catch (e) {
        //   console.error('Failed to broadcast error progress:', e);
        // }
        throw Error('Scene animation failed: Try again with different prompt.');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc0FuaW1hdGVJbWFnZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NBbmltYXRlSW1hZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUEyQkEsa0RBZ0lDO0FBMUpELG9EQUFzRTtBQUN0RSwwREFJZ0M7QUFDaEMsMENBQXFEO0FBQ3JELGtFQUErRDtBQUMvRCw4Q0FJMEI7QUFFMUIsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFZdEUsS0FBSyxVQUFVLG1CQUFtQixDQUN2QyxPQUE0QixFQUM1QixNQUFrQjtJQUVsQixNQUFNLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsR0FDdkUsT0FBTyxDQUFDO0lBRVYsSUFBSSxDQUFDO1FBQ0gsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQzFCLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBQ0QsSUFBSSxPQUFPLEtBQUssU0FBUyxJQUFJLE9BQU8sS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUM5QyxNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDckMsQ0FBQztRQUVELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUN0QyxDQUFDO1FBQ0QsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3RDLENBQUM7UUFFRCxNQUFNLGVBQWUsR0FDbkIsUUFBUSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsc0JBQVksQ0FBQyxXQUFXLENB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RyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBRUQsT0FBTyxFQUFFLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxRQUFRLEVBQUUsQ0FBQztJQUM5RCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFdEQsZ0NBQWdDO1FBQ2hDLDRFQUE0RTtRQUM1RSw2Q0FBNkM7UUFDN0MsUUFBUTtRQUNSLDZCQUE2QjtRQUM3QixlQUFlO1FBQ2YsY0FBYztRQUNkLGlCQUFpQjtRQUNqQiwwQkFBMEI7UUFDMUIsZUFBZTtRQUNmLE9BQU87UUFDUCxnQkFBZ0I7UUFDaEIsNkRBQTZEO1FBQzdELElBQUk7UUFFSixNQUFNLEtBQUssQ0FBQywwREFBMEQsQ0FBQyxDQUFDO0lBQzFFLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU1FTUmVjb3JkIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBTUVNDbGllbnQsIERlbGV0ZU1lc3NhZ2VDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5pbXBvcnQge1xuICBnZXRNYW5pZmVzdCxcbiAgaHlkcmF0ZU1hbmlmZXN0LFxuICB1cGRhdGVNYW5pZmVzdCxcbn0gZnJvbSAnLi4vdXRpbHMvbWFuaWZlc3RVdGlscyc7XG5pbXBvcnQgeyBhbmltYXRlSW1hZ2VUb1ZpZGVvIH0gZnJvbSAnLi4vdXRpbHMvdmlkZW8nO1xuaW1wb3J0IHsgYnJvYWRjYXN0UHJvZ3Jlc3MgfSBmcm9tICcuLi91dGlscy9icm9hZGNhc3RQcm9ncmVzcyc7XG5pbXBvcnQge1xuICBDUkVESVRTX0NPU1QsXG4gIGhhc1N1ZmZpY2llbnRDcmVkaXRzQnlVc2VySWQsXG4gIHVwZGF0ZUNyZWRpdEJhbGFuY2VCeVVzZXJJZCxcbn0gZnJvbSAnLi4vdXRpbHMvY3JlZGl0cyc7XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQW5pbWF0ZUltYWdlUmVxdWVzdCB7XG4gIHR5cGU/OiAnYW5pbWF0ZS1pbWFnZSc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgc2NlbmVJZDogbnVtYmVyO1xuICBhbmltYXRpb25Qcm9tcHQ6IHN0cmluZztcbiAgaW1hZ2VVcmw6IHN0cmluZztcbiAgZHVyYXRpb246IDUgfCAxMDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NBbmltYXRlSW1hZ2UoXG4gIHJlcXVlc3Q6IEFuaW1hdGVJbWFnZVJlcXVlc3QsXG4gIHJlY29yZD86IFNRU1JlY29yZCxcbik6IFByb21pc2U8YW55PiB7XG4gIGNvbnN0IHsgdXNlcklkLCB0aW1lc3RhbXAsIHNjZW5lSWQsIGFuaW1hdGlvblByb21wdCwgaW1hZ2VVcmwsIGR1cmF0aW9uIH0gPVxuICAgIHJlcXVlc3Q7XG5cbiAgdHJ5IHtcbiAgICBpZiAoIXVzZXJJZCB8fCAhdGltZXN0YW1wKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgdXNlcklkIG9yIHRpbWVzdGFtcCcpO1xuICAgIH1cbiAgICBpZiAoc2NlbmVJZCA9PT0gdW5kZWZpbmVkIHx8IHNjZW5lSWQgPT09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyBzY2VuZUlkJyk7XG4gICAgfVxuXG4gICAgaWYgKCFpbWFnZVVybCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIGltYWdlVXJsJyk7XG4gICAgfVxuICAgIGlmICghZHVyYXRpb24pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyBkdXJhdGlvbicpO1xuICAgIH1cblxuICAgIGNvbnN0IGNyZWRpdHNUb0NoYXJnZSA9XG4gICAgICBkdXJhdGlvbiA9PT0gNSA/IENSRURJVFNfQ09TVC5haV92aWRlb181cyA6IENSRURJVFNfQ09TVC5haV92aWRlb18xMHM7XG5cbiAgICBjb25zdCB7IGhhc1N1ZmZpY2llbnRDcmVkaXRzLCBjdXJyZW50Q3JlZGl0cyB9ID1cbiAgICAgIGF3YWl0IGhhc1N1ZmZpY2llbnRDcmVkaXRzQnlVc2VySWQodXNlcklkLCBjcmVkaXRzVG9DaGFyZ2UpO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICAnaGFzQ3JlZGl0cyAvIGN1cnJlbnQgY3JlZGl0czonLFxuICAgICAgaGFzU3VmZmljaWVudENyZWRpdHMsXG4gICAgICBjdXJyZW50Q3JlZGl0cyxcbiAgICApO1xuXG4gICAgaWYgKCFoYXNTdWZmaWNpZW50Q3JlZGl0cykge1xuICAgICAgLy8gTm90aWZ5IGZyb250ZW5kIGFib3V0IGluc3VmZmljaWVudCBjcmVkaXRzXG4gICAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcygnaW5zdWZmaWNpZW50X2NyZWRpdHMnLCB1c2VySWQsIHRpbWVzdGFtcCwge1xuICAgICAgICBjdXJyZW50Q3JlZGl0cyxcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW5zdWZmaWNpZW50IGNyZWRpdHMnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBtYW5pZmVzdCA9IGF3YWl0IGdldE1hbmlmZXN0KHVzZXJJZCwgdGltZXN0YW1wKTtcbiAgICBpZiAoIW1hbmlmZXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNYW5pZmVzdCBub3QgZm91bmQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBzZWVkID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMDApO1xuXG4gICAgLy8gR2VuZXJhdGUgdmlkZW8gZnJvbSB0aGUgcHJvdmlkZWQgaW1hZ2VcbiAgICBjb25zdCB2aWRlb0tleSA9IGF3YWl0IGFuaW1hdGVJbWFnZVRvVmlkZW8oXG4gICAgICBhbmltYXRpb25Qcm9tcHQsXG4gICAgICBkdXJhdGlvbixcbiAgICAgIHNjZW5lSWQsXG4gICAgICB1c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBzZWVkLFxuICAgICAgaW1hZ2VVcmwsXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZyhg4pyFIEFuaW1hdGVkIHZpZGVvIGNyZWF0ZWQgZm9yIHNjZW5lICR7c2NlbmVJZH06ICR7dmlkZW9LZXl9YCk7XG5cbiAgICAvLyBCdWlsZCB0aGUgdXBkYXRlZCBhcnJheSBvbmNlXG4gICAgY29uc3QgdXBkYXRlZFNjZW5lcyA9IG1hbmlmZXN0LnNjZW5lcy5tYXAoKHNjZW5lKSA9PlxuICAgICAgc2NlbmUuaWQgPT09IHNjZW5lSWQgPyB7IC4uLnNjZW5lLCBkdXJhdGlvbiwgYW5pbWF0ZWQ6IHRydWUgfSA6IHNjZW5lLFxuICAgICk7XG5cbiAgICAvLyBSZXVzZSBpdCBmb3IgYm90aCBpbi1tZW1vcnkgc3RhdGUgYW5kIHBlcnNpc3RlbmNlXG4gICAgbWFuaWZlc3Quc2NlbmVzID0gdXBkYXRlZFNjZW5lcztcblxuICAgIGF3YWl0IHVwZGF0ZU1hbmlmZXN0KG1hbmlmZXN0LCB7XG4gICAgICBzY2VuZXM6IHVwZGF0ZWRTY2VuZXMsXG4gICAgfSk7XG5cbiAgICAvLyBEZWR1Y3QgY3JlZGl0c1xuICAgIGNvbnN0IG5ld0N1cnJlbnRDcmVkaXRzID0gYXdhaXQgdXBkYXRlQ3JlZGl0QmFsYW5jZUJ5VXNlcklkKFxuICAgICAgdXNlcklkLFxuICAgICAgY3JlZGl0c1RvQ2hhcmdlLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygnbmV3IGNyZWRpdHMgYWZ0ZXIgZGVkdWN0aW9uOicsIG5ld0N1cnJlbnRDcmVkaXRzKTtcblxuICAgIGxldCBoeWRyYXRlZE1hbmlmZXN0ID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcblxuICAgIC8vIEJyb2FkY2FzdCB0aGF0IHRoZSBzY2VuZSB2aWRlbyBpcyBjcmVhdGVkXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAncHJldmlld19jb21wbGV0ZWQnLFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgeyBtYW5pZmVzdDogaHlkcmF0ZWRNYW5pZmVzdCB9LFxuICAgICAgJ1NjZW5lIGFuaW1hdGlvbiBjb21wbGV0ZWQnLFxuICAgICk7XG5cbiAgICAvLyBJZiB0aGlzIHdhcyB0cmlnZ2VyZWQgYnkgU1FTLCBkZWxldGUgdGhlIG1lc3NhZ2UgZnJvbSB0aGUgcXVldWVcbiAgICBpZiAocmVjb3JkICYmIHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCkge1xuICAgICAgY29uc3QgZGVsZXRlQ29tbWFuZCA9IG5ldyBEZWxldGVNZXNzYWdlQ29tbWFuZCh7XG4gICAgICAgIFF1ZXVlVXJsOiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwsXG4gICAgICAgIFJlY2VpcHRIYW5kbGU6IHJlY29yZC5yZWNlaXB0SGFuZGxlLFxuICAgICAgfSk7XG4gICAgICBhd2FpdCBzcXMuc2VuZChkZWxldGVDb21tYW5kKTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBtZXNzYWdlOiAnU2NlbmUgYW5pbWF0ZWQgc3VjY2Vzc2Z1bGx5JywgdmlkZW9LZXkgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiBhbmltYXRlIGltYWdlIChTUVMpOicsIGVycm9yKTtcblxuICAgIC8vIHRvZG86IGNoZWNrIGlmIHRoaXMgaXMgbmVlZGVkXG4gICAgLy8gY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InO1xuICAgIC8vIC8vIFByb2FjdGl2ZWx5IGJyb2FkY2FzdCBlcnJvciB0byBmcm9udGVuZFxuICAgIC8vIHRyeSB7XG4gICAgLy8gICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAvLyAgICAgJ2Vycm9yJyxcbiAgICAvLyAgICAgdXNlcklkLFxuICAgIC8vICAgICB0aW1lc3RhbXAsXG4gICAgLy8gICAgIHsgZXJyb3I6IG1lc3NhZ2UgfSxcbiAgICAvLyAgICAgbWVzc2FnZSxcbiAgICAvLyAgICk7XG4gICAgLy8gfSBjYXRjaCAoZSkge1xuICAgIC8vICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGJyb2FkY2FzdCBlcnJvciBwcm9ncmVzczonLCBlKTtcbiAgICAvLyB9XG5cbiAgICB0aHJvdyBFcnJvcignU2NlbmUgYW5pbWF0aW9uIGZhaWxlZDogVHJ5IGFnYWluIHdpdGggZGlmZmVyZW50IHByb21wdC4nKTtcbiAgfVxufVxuIl19