"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCreateScene = processCreateScene;
const audio_1 = require("../utils/audio");
const manifestUtils_1 = require("../utils/manifestUtils");
const subtitles_1 = require("../utils/subtitles");
const videoEffects_1 = require("../utils/videoEffects");
const broadcastProgress_1 = require("../utils/broadcastProgress");
const user_1 = require("../utils/user");
const client_sqs_1 = require("@aws-sdk/client-sqs");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
async function processCreateScene(request, record) {
    const { sceneId, scenePosition, captionText, userId, timestamp } = request;
    try {
        console.log('request:', JSON.stringify(request, null, 2));
        const scenes = [
            {
                id: sceneId,
                scenePosition: scenePosition || 0,
                description: '',
                duration: 10,
                narration: captionText,
                animated: false,
            },
        ];
        const manifest = await (0, manifestUtils_1.getManifest)(userId, timestamp);
        if (!manifest) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Manifest not found' }),
            };
        }
        // generate audio and transcription
        const { subtitles } = await (0, audio_1.generateNarration)(scenes, request.userId, timestamp, manifest.voiceToneInstruction, manifest.voice, manifest.language);
        console.log('subtitles:', subtitles);
        // update scenes duration
        scenes[0].duration = subtitles[0].duration || 10;
        console.log('subtitles[0].duration:', subtitles[0].duration);
        // Step 4: Generate subtitle file
        await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, subtitles);
        const user = await (0, user_1.getUser)(request.userId);
        // generate video effect
        await (0, videoEffects_1.generateVideoEffects)(scenes, request.userId, timestamp, user);
        const manifestScene = (0, manifestUtils_1.createManifestScene)(scenes[0], request.userId, timestamp, scenePosition || 0);
        // update manifest
        const updatedManifest = await (0, manifestUtils_1.addSceneToManifest)(manifest, manifestScene);
        // hydrate manifest
        const manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(updatedManifest);
        await (0, broadcastProgress_1.broadcastProgress)('preview_completed', request.userId, timestamp, {
            manifest: manifestHydrated,
        });
        // If this was triggered by SQS, delete the message from the queue
        if (record && process.env.VIDEO_QUEUE_URL) {
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
        }
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Scene created successfully',
            }),
        };
    }
    catch (error) {
        console.error('Error in create scene (SQS):', error);
        throw Error('Scene creation failed');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc0NyZWF0ZVNjZW5lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicHJvY2Vzc0NyZWF0ZVNjZW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBMEJBLGdEQXlGQztBQWxIRCwwQ0FBbUQ7QUFDbkQsMERBS2dDO0FBRWhDLGtEQUF1RDtBQUN2RCx3REFBNkQ7QUFDN0Qsa0VBQStEO0FBQy9ELHdDQUF3QztBQUN4QyxvREFBc0U7QUFFdEUsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFXdEUsS0FBSyxVQUFVLGtCQUFrQixDQUN0QyxPQUEyQixFQUMzQixNQUFrQjtJQUVsQixNQUFNLEVBQUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLE9BQU8sQ0FBQztJQUUzRSxJQUFJLENBQUM7UUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUUxRCxNQUFNLE1BQU0sR0FBRztZQUNiO2dCQUNFLEVBQUUsRUFBRSxPQUFPO2dCQUNYLGFBQWEsRUFBRSxhQUFhLElBQUksQ0FBQztnQkFDakMsV0FBVyxFQUFFLEVBQUU7Z0JBQ2YsUUFBUSxFQUFFLEVBQUU7Z0JBQ1osU0FBUyxFQUFFLFdBQVc7Z0JBQ3RCLFFBQVEsRUFBRSxLQUFLO2FBQ2hCO1NBQ0YsQ0FBQztRQUVGLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSwyQkFBVyxFQUFDLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN0RCxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZCxPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLENBQUM7YUFDdEQsQ0FBQztRQUNKLENBQUM7UUFFRCxtQ0FBbUM7UUFDbkMsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLE1BQU0sSUFBQSx5QkFBaUIsRUFDM0MsTUFBTSxFQUNOLE9BQU8sQ0FBQyxNQUFNLEVBQ2QsU0FBUyxFQUNULFFBQVEsQ0FBQyxvQkFBb0IsRUFDN0IsUUFBUSxDQUFDLEtBQUssRUFDZCxRQUFRLENBQUMsUUFBUSxDQUNsQixDQUFDO1FBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFckMseUJBQXlCO1FBQ3pCLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsSUFBSSxFQUFFLENBQUM7UUFDakQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFN0QsaUNBQWlDO1FBQ2pDLE1BQU0sSUFBQSw2QkFBaUIsRUFBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFdEUsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFBLGNBQU8sRUFBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFM0Msd0JBQXdCO1FBQ3hCLE1BQU0sSUFBQSxtQ0FBb0IsRUFBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFcEUsTUFBTSxhQUFhLEdBQUcsSUFBQSxtQ0FBbUIsRUFDdkMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUNULE9BQU8sQ0FBQyxNQUFNLEVBQ2QsU0FBUyxFQUNULGFBQWEsSUFBSSxDQUFDLENBQ25CLENBQUM7UUFFRixrQkFBa0I7UUFDbEIsTUFBTSxlQUFlLEdBQUcsTUFBTSxJQUFBLGtDQUFrQixFQUFDLFFBQVEsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUUxRSxtQkFBbUI7UUFDbkIsTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLElBQUEsK0JBQWUsRUFBQyxlQUFlLENBQUMsQ0FBQztRQUVoRSxNQUFNLElBQUEscUNBQWlCLEVBQUMsbUJBQW1CLEVBQUUsT0FBTyxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUU7WUFDdEUsUUFBUSxFQUFFLGdCQUFnQjtTQUMzQixDQUFDLENBQUM7UUFFSCxrRUFBa0U7UUFDbEUsSUFBSSxNQUFNLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUMxQyxNQUFNLGFBQWEsR0FBRyxJQUFJLGlDQUFvQixDQUFDO2dCQUM3QyxRQUFRLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlO2dCQUNyQyxhQUFhLEVBQUUsTUFBTSxDQUFDLGFBQWE7YUFDcEMsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ2hDLENBQUM7UUFFRCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsT0FBTyxFQUFFLDRCQUE0QjthQUN0QyxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw4QkFBOEIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVyRCxNQUFNLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU1FTUmVjb3JkIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBnZW5lcmF0ZU5hcnJhdGlvbiB9IGZyb20gJy4uL3V0aWxzL2F1ZGlvJztcbmltcG9ydCB7XG4gIGdldE1hbmlmZXN0LFxuICBoeWRyYXRlTWFuaWZlc3QsXG4gIGFkZFNjZW5lVG9NYW5pZmVzdCxcbiAgY3JlYXRlTWFuaWZlc3RTY2VuZSxcbn0gZnJvbSAnLi4vdXRpbHMvbWFuaWZlc3RVdGlscyc7XG5cbmltcG9ydCB7IGdlbmVyYXRlU3VidGl0bGVzIH0gZnJvbSAnLi4vdXRpbHMvc3VidGl0bGVzJztcbmltcG9ydCB7IGdlbmVyYXRlVmlkZW9FZmZlY3RzIH0gZnJvbSAnLi4vdXRpbHMvdmlkZW9FZmZlY3RzJztcbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi4vdXRpbHMvYnJvYWRjYXN0UHJvZ3Jlc3MnO1xuaW1wb3J0IHsgZ2V0VXNlciB9IGZyb20gJy4uL3V0aWxzL3VzZXInO1xuaW1wb3J0IHsgRGVsZXRlTWVzc2FnZUNvbW1hbmQsIFNRU0NsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuXG5jb25zdCBzcXMgPSBuZXcgU1FTQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIENyZWF0ZVNjZW5lUmVxdWVzdCB7XG4gIGltYWdlVXJsOiBzdHJpbmc7XG4gIHNjZW5lSWQ6IG51bWJlcjtcbiAgc2NlbmVQb3NpdGlvbj86IG51bWJlcjtcbiAgdXNlcklkOiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogc3RyaW5nO1xuICBjYXB0aW9uVGV4dDogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc0NyZWF0ZVNjZW5lKFxuICByZXF1ZXN0OiBDcmVhdGVTY2VuZVJlcXVlc3QsXG4gIHJlY29yZD86IFNRU1JlY29yZCxcbikge1xuICBjb25zdCB7IHNjZW5lSWQsIHNjZW5lUG9zaXRpb24sIGNhcHRpb25UZXh0LCB1c2VySWQsIHRpbWVzdGFtcCB9ID0gcmVxdWVzdDtcblxuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKCdyZXF1ZXN0OicsIEpTT04uc3RyaW5naWZ5KHJlcXVlc3QsIG51bGwsIDIpKTtcblxuICAgIGNvbnN0IHNjZW5lcyA9IFtcbiAgICAgIHtcbiAgICAgICAgaWQ6IHNjZW5lSWQsXG4gICAgICAgIHNjZW5lUG9zaXRpb246IHNjZW5lUG9zaXRpb24gfHwgMCxcbiAgICAgICAgZGVzY3JpcHRpb246ICcnLFxuICAgICAgICBkdXJhdGlvbjogMTAsXG4gICAgICAgIG5hcnJhdGlvbjogY2FwdGlvblRleHQsXG4gICAgICAgIGFuaW1hdGVkOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgXTtcblxuICAgIGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgZ2V0TWFuaWZlc3QodXNlcklkLCB0aW1lc3RhbXApO1xuICAgIGlmICghbWFuaWZlc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ01hbmlmZXN0IG5vdCBmb3VuZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdlbmVyYXRlIGF1ZGlvIGFuZCB0cmFuc2NyaXB0aW9uXG4gICAgY29uc3QgeyBzdWJ0aXRsZXMgfSA9IGF3YWl0IGdlbmVyYXRlTmFycmF0aW9uKFxuICAgICAgc2NlbmVzLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBtYW5pZmVzdC52b2ljZVRvbmVJbnN0cnVjdGlvbixcbiAgICAgIG1hbmlmZXN0LnZvaWNlLFxuICAgICAgbWFuaWZlc3QubGFuZ3VhZ2UsXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKCdzdWJ0aXRsZXM6Jywgc3VidGl0bGVzKTtcblxuICAgIC8vIHVwZGF0ZSBzY2VuZXMgZHVyYXRpb25cbiAgICBzY2VuZXNbMF0uZHVyYXRpb24gPSBzdWJ0aXRsZXNbMF0uZHVyYXRpb24gfHwgMTA7XG4gICAgY29uc29sZS5sb2coJ3N1YnRpdGxlc1swXS5kdXJhdGlvbjonLCBzdWJ0aXRsZXNbMF0uZHVyYXRpb24pO1xuXG4gICAgLy8gU3RlcCA0OiBHZW5lcmF0ZSBzdWJ0aXRsZSBmaWxlXG4gICAgYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZXMoc2NlbmVzLCByZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCBzdWJ0aXRsZXMpO1xuXG4gICAgY29uc3QgdXNlciA9IGF3YWl0IGdldFVzZXIocmVxdWVzdC51c2VySWQpO1xuXG4gICAgLy8gZ2VuZXJhdGUgdmlkZW8gZWZmZWN0XG4gICAgYXdhaXQgZ2VuZXJhdGVWaWRlb0VmZmVjdHMoc2NlbmVzLCByZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCB1c2VyKTtcblxuICAgIGNvbnN0IG1hbmlmZXN0U2NlbmUgPSBjcmVhdGVNYW5pZmVzdFNjZW5lKFxuICAgICAgc2NlbmVzWzBdLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBzY2VuZVBvc2l0aW9uIHx8IDAsXG4gICAgKTtcblxuICAgIC8vIHVwZGF0ZSBtYW5pZmVzdFxuICAgIGNvbnN0IHVwZGF0ZWRNYW5pZmVzdCA9IGF3YWl0IGFkZFNjZW5lVG9NYW5pZmVzdChtYW5pZmVzdCwgbWFuaWZlc3RTY2VuZSk7XG5cbiAgICAvLyBoeWRyYXRlIG1hbmlmZXN0XG4gICAgY29uc3QgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdCh1cGRhdGVkTWFuaWZlc3QpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoJ3ByZXZpZXdfY29tcGxldGVkJywgcmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCwge1xuICAgICAgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQsXG4gICAgfSk7XG5cbiAgICAvLyBJZiB0aGlzIHdhcyB0cmlnZ2VyZWQgYnkgU1FTLCBkZWxldGUgdGhlIG1lc3NhZ2UgZnJvbSB0aGUgcXVldWVcbiAgICBpZiAocmVjb3JkICYmIHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCkge1xuICAgICAgY29uc3QgZGVsZXRlQ29tbWFuZCA9IG5ldyBEZWxldGVNZXNzYWdlQ29tbWFuZCh7XG4gICAgICAgIFF1ZXVlVXJsOiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwsXG4gICAgICAgIFJlY2VpcHRIYW5kbGU6IHJlY29yZC5yZWNlaXB0SGFuZGxlLFxuICAgICAgfSk7XG4gICAgICBhd2FpdCBzcXMuc2VuZChkZWxldGVDb21tYW5kKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBtZXNzYWdlOiAnU2NlbmUgY3JlYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiBjcmVhdGUgc2NlbmUgKFNRUyk6JywgZXJyb3IpO1xuXG4gICAgdGhyb3cgRXJyb3IoJ1NjZW5lIGNyZWF0aW9uIGZhaWxlZCcpO1xuICB9XG59XG4iXX0=