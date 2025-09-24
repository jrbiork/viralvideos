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
        if (!animationPrompt) {
            throw new Error('Missing animationPrompt');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc0FuaW1hdGVJbWFnZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NBbmltYXRlSW1hZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUEyQkEsa0RBa0lDO0FBNUpELG9EQUFzRTtBQUN0RSwwREFJZ0M7QUFDaEMsMENBQXFEO0FBQ3JELGtFQUErRDtBQUMvRCw4Q0FJMEI7QUFFMUIsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFZdEUsS0FBSyxVQUFVLG1CQUFtQixDQUN2QyxPQUE0QixFQUM1QixNQUFrQjtJQUVsQixNQUFNLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsR0FDdkUsT0FBTyxDQUFDO0lBRVYsSUFBSSxDQUFDO1FBQ0gsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQzFCLE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBQ0QsSUFBSSxPQUFPLEtBQUssU0FBUyxJQUFJLE9BQU8sS0FBSyxJQUFJLEVBQUUsQ0FBQztZQUM5QyxNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDckMsQ0FBQztRQUNELElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUNyQixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFDN0MsQ0FBQztRQUNELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUN0QyxDQUFDO1FBQ0QsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxD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QU8sQ0FBQyxHQUFHLENBQUMsZUFBZTtnQkFDckMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxhQUFhO2FBQ3BDLENBQUMsQ0FBQztZQUNILE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBRUQsT0FBTyxFQUFFLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxRQUFRLEVBQUUsQ0FBQztJQUM5RCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFdEQsZ0NBQWdDO1FBQ2hDLDRFQUE0RTtRQUM1RSw2Q0FBNkM7UUFDN0MsUUFBUTtRQUNSLDZCQUE2QjtRQUM3QixlQUFlO1FBQ2YsY0FBYztRQUNkLGlCQUFpQjtRQUNqQiwwQkFBMEI7UUFDMUIsZUFBZTtRQUNmLE9BQU87UUFDUCxnQkFBZ0I7UUFDaEIsNkRBQTZEO1FBQzdELElBQUk7UUFFSixNQUFNLEtBQUssQ0FBQywwREFBMEQsQ0FBQyxDQUFDO0lBQzFFLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU1FTUmVjb3JkIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBTUVNDbGllbnQsIERlbGV0ZU1lc3NhZ2VDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5pbXBvcnQge1xuICBnZXRNYW5pZmVzdCxcbiAgaHlkcmF0ZU1hbmlmZXN0LFxuICB1cGRhdGVNYW5pZmVzdCxcbn0gZnJvbSAnLi4vdXRpbHMvbWFuaWZlc3RVdGlscyc7XG5pbXBvcnQgeyBhbmltYXRlSW1hZ2VUb1ZpZGVvIH0gZnJvbSAnLi4vdXRpbHMvdmlkZW8nO1xuaW1wb3J0IHsgYnJvYWRjYXN0UHJvZ3Jlc3MgfSBmcm9tICcuLi91dGlscy9icm9hZGNhc3RQcm9ncmVzcyc7XG5pbXBvcnQge1xuICBDUkVESVRTX0NPU1QsXG4gIGhhc1N1ZmZpY2llbnRDcmVkaXRzQnlVc2VySWQsXG4gIHVwZGF0ZUNyZWRpdEJhbGFuY2VCeVVzZXJJZCxcbn0gZnJvbSAnLi4vdXRpbHMvY3JlZGl0cyc7XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQW5pbWF0ZUltYWdlUmVxdWVzdCB7XG4gIHR5cGU/OiAnYW5pbWF0ZS1pbWFnZSc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgc2NlbmVJZDogbnVtYmVyO1xuICBhbmltYXRpb25Qcm9tcHQ6IHN0cmluZztcbiAgaW1hZ2VVcmw6IHN0cmluZztcbiAgZHVyYXRpb246IDUgfCAxMDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NBbmltYXRlSW1hZ2UoXG4gIHJlcXVlc3Q6IEFuaW1hdGVJbWFnZVJlcXVlc3QsXG4gIHJlY29yZD86IFNRU1JlY29yZCxcbik6IFByb21pc2U8YW55PiB7XG4gIGNvbnN0IHsgdXNlcklkLCB0aW1lc3RhbXAsIHNjZW5lSWQsIGFuaW1hdGlvblByb21wdCwgaW1hZ2VVcmwsIGR1cmF0aW9uIH0gPVxuICAgIHJlcXVlc3Q7XG5cbiAgdHJ5IHtcbiAgICBpZiAoIXVzZXJJZCB8fCAhdGltZXN0YW1wKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgdXNlcklkIG9yIHRpbWVzdGFtcCcpO1xuICAgIH1cbiAgICBpZiAoc2NlbmVJZCA9PT0gdW5kZWZpbmVkIHx8IHNjZW5lSWQgPT09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyBzY2VuZUlkJyk7XG4gICAgfVxuICAgIGlmICghYW5pbWF0aW9uUHJvbXB0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgYW5pbWF0aW9uUHJvbXB0Jyk7XG4gICAgfVxuICAgIGlmICghaW1hZ2VVcmwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTWlzc2luZyBpbWFnZVVybCcpO1xuICAgIH1cbiAgICBpZiAoIWR1cmF0aW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgZHVyYXRpb24nKTtcbiAgICB9XG5cbiAgICBjb25zdCBjcmVkaXRzVG9DaGFyZ2UgPVxuICAgICAgZHVyYXRpb24gPT09IDUgPyBDUkVESVRTX0NPU1QuYWlfdmlkZW9fNXMgOiBDUkVESVRTX0NPU1QuYWlfdmlkZW9fMTBzO1xuXG4gICAgY29uc3QgeyBoYXNTdWZmaWNpZW50Q3JlZGl0cywgY3VycmVudENyZWRpdHMgfSA9XG4gICAgICBhd2FpdCBoYXNTdWZmaWNpZW50Q3JlZGl0c0J5VXNlcklkKHVzZXJJZCwgY3JlZGl0c1RvQ2hhcmdlKTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgJ2hhc0NyZWRpdHMgLyBjdXJyZW50IGNyZWRpdHM6JyxcbiAgICAgIGhhc1N1ZmZpY2llbnRDcmVkaXRzLFxuICAgICAgY3VycmVudENyZWRpdHMsXG4gICAgKTtcblxuICAgIGlmICghaGFzU3VmZmljaWVudENyZWRpdHMpIHtcbiAgICAgIC8vIE5vdGlmeSBmcm9udGVuZCBhYm91dCBpbnN1ZmZpY2llbnQgY3JlZGl0c1xuICAgICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoJ2luc3VmZmljaWVudF9jcmVkaXRzJywgdXNlcklkLCB0aW1lc3RhbXAsIHtcbiAgICAgICAgY3VycmVudENyZWRpdHMsXG4gICAgICB9KTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0luc3VmZmljaWVudCBjcmVkaXRzJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdCh1c2VySWQsIHRpbWVzdGFtcCk7XG4gICAgaWYgKCFtYW5pZmVzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWFuaWZlc3Qgbm90IGZvdW5kJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3Qgc2VlZCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwKTtcblxuICAgIC8vIEdlbmVyYXRlIHZpZGVvIGZyb20gdGhlIHByb3ZpZGVkIGltYWdlXG4gICAgY29uc3QgdmlkZW9LZXkgPSBhd2FpdCBhbmltYXRlSW1hZ2VUb1ZpZGVvKFxuICAgICAgYW5pbWF0aW9uUHJvbXB0LFxuICAgICAgZHVyYXRpb24sXG4gICAgICBzY2VuZUlkLFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc2VlZCxcbiAgICAgIGltYWdlVXJsLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coYOKchSBBbmltYXRlZCB2aWRlbyBjcmVhdGVkIGZvciBzY2VuZSAke3NjZW5lSWR9OiAke3ZpZGVvS2V5fWApO1xuXG4gICAgLy8gQnVpbGQgdGhlIHVwZGF0ZWQgYXJyYXkgb25jZVxuICAgIGNvbnN0IHVwZGF0ZWRTY2VuZXMgPSBtYW5pZmVzdC5zY2VuZXMubWFwKChzY2VuZSkgPT5cbiAgICAgIHNjZW5lLmlkID09PSBzY2VuZUlkID8geyAuLi5zY2VuZSwgZHVyYXRpb24sIGFuaW1hdGVkOiB0cnVlIH0gOiBzY2VuZSxcbiAgICApO1xuXG4gICAgLy8gUmV1c2UgaXQgZm9yIGJvdGggaW4tbWVtb3J5IHN0YXRlIGFuZCBwZXJzaXN0ZW5jZVxuICAgIG1hbmlmZXN0LnNjZW5lcyA9IHVwZGF0ZWRTY2VuZXM7XG5cbiAgICBhd2FpdCB1cGRhdGVNYW5pZmVzdChtYW5pZmVzdCwge1xuICAgICAgc2NlbmVzOiB1cGRhdGVkU2NlbmVzLFxuICAgIH0pO1xuXG4gICAgLy8gRGVkdWN0IGNyZWRpdHNcbiAgICBjb25zdCBuZXdDdXJyZW50Q3JlZGl0cyA9IGF3YWl0IHVwZGF0ZUNyZWRpdEJhbGFuY2VCeVVzZXJJZChcbiAgICAgIHVzZXJJZCxcbiAgICAgIGNyZWRpdHNUb0NoYXJnZSxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ25ldyBjcmVkaXRzIGFmdGVyIGRlZHVjdGlvbjonLCBuZXdDdXJyZW50Q3JlZGl0cyk7XG5cbiAgICBsZXQgaHlkcmF0ZWRNYW5pZmVzdCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG5cbiAgICAvLyBCcm9hZGNhc3QgdGhhdCB0aGUgc2NlbmUgdmlkZW8gaXMgY3JlYXRlZFxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgJ3ByZXZpZXdfY29tcGxldGVkJyxcbiAgICAgIHVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHsgbWFuaWZlc3Q6IGh5ZHJhdGVkTWFuaWZlc3QgfSxcbiAgICAgICdTY2VuZSBhbmltYXRpb24gY29tcGxldGVkJyxcbiAgICApO1xuXG4gICAgLy8gSWYgdGhpcyB3YXMgdHJpZ2dlcmVkIGJ5IFNRUywgZGVsZXRlIHRoZSBtZXNzYWdlIGZyb20gdGhlIHF1ZXVlXG4gICAgaWYgKHJlY29yZCAmJiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwpIHtcbiAgICAgIGNvbnN0IGRlbGV0ZUNvbW1hbmQgPSBuZXcgRGVsZXRlTWVzc2FnZUNvbW1hbmQoe1xuICAgICAgICBRdWV1ZVVybDogcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMLFxuICAgICAgICBSZWNlaXB0SGFuZGxlOiByZWNvcmQucmVjZWlwdEhhbmRsZSxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgc3FzLnNlbmQoZGVsZXRlQ29tbWFuZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgbWVzc2FnZTogJ1NjZW5lIGFuaW1hdGVkIHN1Y2Nlc3NmdWxseScsIHZpZGVvS2V5IH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gYW5pbWF0ZSBpbWFnZSAoU1FTKTonLCBlcnJvcik7XG5cbiAgICAvLyB0b2RvOiBjaGVjayBpZiB0aGlzIGlzIG5lZWRlZFxuICAgIC8vIGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJztcbiAgICAvLyAvLyBQcm9hY3RpdmVseSBicm9hZGNhc3QgZXJyb3IgdG8gZnJvbnRlbmRcbiAgICAvLyB0cnkge1xuICAgIC8vICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgLy8gICAgICdlcnJvcicsXG4gICAgLy8gICAgIHVzZXJJZCxcbiAgICAvLyAgICAgdGltZXN0YW1wLFxuICAgIC8vICAgICB7IGVycm9yOiBtZXNzYWdlIH0sXG4gICAgLy8gICAgIG1lc3NhZ2UsXG4gICAgLy8gICApO1xuICAgIC8vIH0gY2F0Y2ggKGUpIHtcbiAgICAvLyAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBicm9hZGNhc3QgZXJyb3IgcHJvZ3Jlc3M6JywgZSk7XG4gICAgLy8gfVxuXG4gICAgdGhyb3cgRXJyb3IoJ1NjZW5lIGFuaW1hdGlvbiBmYWlsZWQ6IFRyeSBhZ2FpbiB3aXRoIGRpZmZlcmVudCBwcm9tcHQuJyk7XG4gIH1cbn1cbiJdfQ==