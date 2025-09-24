"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processRegenerateAudioScene = processRegenerateAudioScene;
const audio_1 = require("../utils/audio");
const manifestUtils_1 = require("../utils/manifestUtils");
const subtitles_1 = require("../utils/subtitles");
const videoEffects_1 = require("../utils/videoEffects");
const broadcastProgress_1 = require("../utils/broadcastProgress");
const credits_1 = require("../utils/credits");
const credits_2 = require("../utils/credits");
const manifestUtils_2 = require("../utils/manifestUtils");
const user_1 = require("../utils/user");
const client_sqs_1 = require("@aws-sdk/client-sqs");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
async function processRegenerateAudioScene(request, record) {
    console.log('request processRegenerateAudioScene:', JSON.stringify(request, null, 2));
    const { scene, voice, language, userId, timestamp } = request;
    try {
        if (!scene) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Scenes array is required and must not be empty',
                }),
            };
        }
        const { hasSufficientCredits, currentCredits } = await (0, credits_2.hasSufficientCreditsByUserId)(userId, credits_1.CREDITS_COST.new_audio_subtitle);
        console.log('hasCredits / current credits:', hasSufficientCredits, currentCredits);
        if (!hasSufficientCredits) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Insufficient credits' }),
            };
        }
        console.log('getting manifest');
        console.log('userId:', userId);
        console.log('timestamp:', timestamp);
        let manifest = await (0, manifestUtils_1.getManifest)(userId, timestamp);
        console.log('manifest:', JSON.stringify(manifest, null, 2));
        if (!manifest) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Manifest not found' }),
            };
        }
        // Step 3: Generate audio narration with word-level timestamps
        const { subtitles } = await (0, audio_1.generateNarration)([scene], request.userId, timestamp, manifest.voiceToneInstruction, manifest.voice, manifest.language);
        console.log('subtitles generated:', JSON.stringify(subtitles, null, 2));
        await (0, subtitles_1.generateSubtitles)([scene], userId, timestamp, subtitles);
        manifest = await (0, manifestUtils_2.updateManifest)(manifest, {
            scenes: manifest.scenes.map((manifestScene) => {
                // Only update the duration for the specific scene that was regenerated
                if (manifestScene.scenePosition === scene.scenePosition) {
                    return {
                        ...manifestScene,
                        files: {
                            ...manifestScene.files,
                            duration: subtitles[0].duration || 10,
                        },
                    };
                }
                return manifestScene;
            }),
        });
        const manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
        const user = await (0, user_1.getUser)(request.userId);
        // generate video effect
        if (!scene.animated) {
            await (0, videoEffects_1.generateVideoEffects)([scene], request.userId, timestamp, user);
        }
        await (0, broadcastProgress_1.broadcastProgress)('preview_completed', request.userId, timestamp, {
            manifest: manifestHydrated,
        });
        const newCurrentCredits = await (0, credits_2.updateCreditBalanceByUserId)(userId, credits_1.CREDITS_COST.new_audio_subtitle);
        console.log('new credits after deduction:', newCurrentCredits);
        await (0, broadcastProgress_1.broadcastProgress)('credit_updated', userId, timestamp, {
            currentCredits,
        });
        // If this was triggered by SQS, delete the message from the queue
        if (record && process.env.VIDEO_QUEUE_URL) {
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
        }
        // Return success response
        return {
            statusCode: 200,
            body: JSON.stringify({
                manifest: manifestHydrated,
            }),
        };
    }
    catch (error) {
        console.error('Error in regenerate audio scene (SQS):', error);
        throw Error('Scene regeneration failed');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1JlZ2VuZXJhdGVBdWRpb1NjZW5lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicHJvY2Vzc1JlZ2VuZXJhdGVBdWRpb1NjZW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBNkJBLGtFQTZIQztBQXpKRCwwQ0FBbUQ7QUFDbkQsMERBQXNFO0FBRXRFLGtEQUF1RDtBQUN2RCx3REFBNkQ7QUFDN0Qsa0VBQStEO0FBQy9ELDhDQUFnRDtBQUNoRCw4Q0FHMEI7QUFHMUIsMERBQXdEO0FBRXhELHdDQUF3QztBQUN4QyxvREFBc0U7QUFFdEUsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFVdEUsS0FBSyxVQUFVLDJCQUEyQixDQUMvQyxPQUEyQyxFQUMzQyxNQUFrQjtJQUVsQixPQUFPLENBQUMsR0FBRyxDQUNULHNDQUFzQyxFQUN0QyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQ2pDLENBQUM7SUFDRixNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLE9BQU8sQ0FBQztJQUU5RCxJQUFJLENBQUM7UUFDSCxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWCxPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO29CQUNuQixLQUFLLEVBQUUsZ0RBQWdEO2lCQUN4RCxDQUFDO2FBQ0gsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLEVBQUUsb0JBQW9CLEVBQUUsY0FBYyxFQUFFLEdBQzVDLE1BQU0sSUFBQSxzQ0FBNEIsRUFDaEMsTUFBTSxFQUNOLHNCQUFZLENBQUMsa0JBQWtCLENBQ2hDLENBQUM7UUFFSixPQUFPLENBQUMs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Q0FBQyxDQUFDO1FBRUgsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLElBQUEscUNBQTJCLEVBQ3pELE1BQU0sRUFDTixzQkFBWSxDQUFDLGtCQUFrQixDQUNoQyxDQUFDO1FBQ0YsT0FBTyxDQUFDLEdBQUcsQ0FBQyw4QkFBOEIsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBRS9ELE1BQU0sSUFBQSxxQ0FBaUIsRUFBQyxnQkFBZ0IsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFO1lBQzNELGNBQWM7U0FDZixDQUFDLENBQUM7UUFFSCxrRUFBa0U7UUFDbEUsSUFBSSxNQUFNLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUMxQyxNQUFNLGFBQWEsR0FBRyxJQUFJLGlDQUFvQixDQUFDO2dCQUM3QyxRQUFRLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlO2dCQUNyQyxhQUFhLEVBQUUsTUFBTSxDQUFDLGFBQWE7YUFDcEMsQ0FBQyxDQUFDO1lBQ0gsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ2hDLENBQUM7UUFFRCwwQkFBMEI7UUFDMUIsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQ25CLFFBQVEsRUFBRSxnQkFBZ0I7YUFDM0IsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsd0NBQXdDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDL0QsTUFBTSxLQUFLLENBQUMsMkJBQTJCLENBQUMsQ0FBQztJQUMzQyxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNRU1JlY29yZCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgZ2VuZXJhdGVOYXJyYXRpb24gfSBmcm9tICcuLi91dGlscy9hdWRpbyc7XG5pbXBvcnQgeyBnZXRNYW5pZmVzdCwgaHlkcmF0ZU1hbmlmZXN0IH0gZnJvbSAnLi4vdXRpbHMvbWFuaWZlc3RVdGlscyc7XG5cbmltcG9ydCB7IGdlbmVyYXRlU3VidGl0bGVzIH0gZnJvbSAnLi4vdXRpbHMvc3VidGl0bGVzJztcbmltcG9ydCB7IGdlbmVyYXRlVmlkZW9FZmZlY3RzIH0gZnJvbSAnLi4vdXRpbHMvdmlkZW9FZmZlY3RzJztcbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi4vdXRpbHMvYnJvYWRjYXN0UHJvZ3Jlc3MnO1xuaW1wb3J0IHsgQ1JFRElUU19DT1NUIH0gZnJvbSAnLi4vdXRpbHMvY3JlZGl0cyc7XG5pbXBvcnQge1xuICBoYXNTdWZmaWNpZW50Q3JlZGl0c0J5VXNlcklkLFxuICB1cGRhdGVDcmVkaXRCYWxhbmNlQnlVc2VySWQsXG59IGZyb20gJy4uL3V0aWxzL2NyZWRpdHMnO1xuaW1wb3J0IHsgU2NlbmUgfSBmcm9tICcuLi91dGlscy9zY3JpcHQnO1xuXG5pbXBvcnQgeyB1cGRhdGVNYW5pZmVzdCB9IGZyb20gJy4uL3V0aWxzL21hbmlmZXN0VXRpbHMnO1xuXG5pbXBvcnQgeyBnZXRVc2VyIH0gZnJvbSAnLi4vdXRpbHMvdXNlcic7XG5pbXBvcnQgeyBEZWxldGVNZXNzYWdlQ29tbWFuZCwgU1FTQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgcHJvY2Vzc1JlZ2VuZXJhdGVBdWRpb1NjZW5lUmVxdWVzdCB7XG4gIHNjZW5lOiBTY2VuZTtcbiAgdm9pY2U6IHN0cmluZztcbiAgbGFuZ3VhZ2U6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1JlZ2VuZXJhdGVBdWRpb1NjZW5lKFxuICByZXF1ZXN0OiBwcm9jZXNzUmVnZW5lcmF0ZUF1ZGlvU2NlbmVSZXF1ZXN0LFxuICByZWNvcmQ/OiBTUVNSZWNvcmQsXG4pIHtcbiAgY29uc29sZS5sb2coXG4gICAgJ3JlcXVlc3QgcHJvY2Vzc1JlZ2VuZXJhdGVBdWRpb1NjZW5lOicsXG4gICAgSlNPTi5zdHJpbmdpZnkocmVxdWVzdCwgbnVsbCwgMiksXG4gICk7XG4gIGNvbnN0IHsgc2NlbmUsIHZvaWNlLCBsYW5ndWFnZSwgdXNlcklkLCB0aW1lc3RhbXAgfSA9IHJlcXVlc3Q7XG5cbiAgdHJ5IHtcbiAgICBpZiAoIXNjZW5lKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ1NjZW5lcyBhcnJheSBpcyByZXF1aXJlZCBhbmQgbXVzdCBub3QgYmUgZW1wdHknLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgeyBoYXNTdWZmaWNpZW50Q3JlZGl0cywgY3VycmVudENyZWRpdHMgfSA9XG4gICAgICBhd2FpdCBoYXNTdWZmaWNpZW50Q3JlZGl0c0J5VXNlcklkKFxuICAgICAgICB1c2VySWQsXG4gICAgICAgIENSRURJVFNfQ09TVC5uZXdfYXVkaW9fc3VidGl0bGUsXG4gICAgICApO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICAnaGFzQ3JlZGl0cyAvIGN1cnJlbnQgY3JlZGl0czonLFxuICAgICAgaGFzU3VmZmljaWVudENyZWRpdHMsXG4gICAgICBjdXJyZW50Q3JlZGl0cyxcbiAgICApO1xuICAgIGlmICghaGFzU3VmZmljaWVudENyZWRpdHMpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0luc3VmZmljaWVudCBjcmVkaXRzJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ2dldHRpbmcgbWFuaWZlc3QnKTtcbiAgICBjb25zb2xlLmxvZygndXNlcklkOicsIHVzZXJJZCk7XG4gICAgY29uc29sZS5sb2coJ3RpbWVzdGFtcDonLCB0aW1lc3RhbXApO1xuXG4gICAgbGV0IG1hbmlmZXN0ID0gYXdhaXQgZ2V0TWFuaWZlc3QodXNlcklkLCB0aW1lc3RhbXApO1xuXG4gICAgY29uc29sZS5sb2coJ21hbmlmZXN0OicsIEpTT04uc3RyaW5naWZ5KG1hbmlmZXN0LCBudWxsLCAyKSk7XG5cbiAgICBpZiAoIW1hbmlmZXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDQsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNYW5pZmVzdCBub3QgZm91bmQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBTdGVwIDM6IEdlbmVyYXRlIGF1ZGlvIG5hcnJhdGlvbiB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wc1xuICAgIGNvbnN0IHsgc3VidGl0bGVzIH0gPSBhd2FpdCBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgICAgIFtzY2VuZV0sXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIG1hbmlmZXN0LnZvaWNlVG9uZUluc3RydWN0aW9uLFxuICAgICAgbWFuaWZlc3Qudm9pY2UsXG4gICAgICBtYW5pZmVzdC5sYW5ndWFnZSxcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKCdzdWJ0aXRsZXMgZ2VuZXJhdGVkOicsIEpTT04uc3RyaW5naWZ5KHN1YnRpdGxlcywgbnVsbCwgMikpO1xuXG4gICAgYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZXMoW3NjZW5lXSwgdXNlcklkLCB0aW1lc3RhbXAsIHN1YnRpdGxlcyk7XG5cbiAgICBtYW5pZmVzdCA9IGF3YWl0IHVwZGF0ZU1hbmlmZXN0KG1hbmlmZXN0LCB7XG4gICAgICBzY2VuZXM6IG1hbmlmZXN0LnNjZW5lcy5tYXAoKG1hbmlmZXN0U2NlbmUpID0+IHtcbiAgICAgICAgLy8gT25seSB1cGRhdGUgdGhlIGR1cmF0aW9uIGZvciB0aGUgc3BlY2lmaWMgc2NlbmUgdGhhdCB3YXMgcmVnZW5lcmF0ZWRcbiAgICAgICAgaWYgKG1hbmlmZXN0U2NlbmUuc2NlbmVQb3NpdGlvbiA9PT0gc2NlbmUuc2NlbmVQb3NpdGlvbikge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAuLi5tYW5pZmVzdFNjZW5lLFxuICAgICAgICAgICAgZmlsZXM6IHtcbiAgICAgICAgICAgICAgLi4ubWFuaWZlc3RTY2VuZS5maWxlcyxcbiAgICAgICAgICAgICAgZHVyYXRpb246IHN1YnRpdGxlc1swXS5kdXJhdGlvbiB8fCAxMCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWFuaWZlc3RTY2VuZTtcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgY29uc3QgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG5cbiAgICBjb25zdCB1c2VyID0gYXdhaXQgZ2V0VXNlcihyZXF1ZXN0LnVzZXJJZCk7XG5cbiAgICAvLyBnZW5lcmF0ZSB2aWRlbyBlZmZlY3RcbiAgICBpZiAoIXNjZW5lLmFuaW1hdGVkKSB7XG4gICAgICBhd2FpdCBnZW5lcmF0ZVZpZGVvRWZmZWN0cyhbc2NlbmVdLCByZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCB1c2VyKTtcbiAgICB9XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcygncHJldmlld19jb21wbGV0ZWQnLCByZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCB7XG4gICAgICBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCxcbiAgICB9KTtcblxuICAgIGNvbnN0IG5ld0N1cnJlbnRDcmVkaXRzID0gYXdhaXQgdXBkYXRlQ3JlZGl0QmFsYW5jZUJ5VXNlcklkKFxuICAgICAgdXNlcklkLFxuICAgICAgQ1JFRElUU19DT1NULm5ld19hdWRpb19zdWJ0aXRsZSxcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKCduZXcgY3JlZGl0cyBhZnRlciBkZWR1Y3Rpb246JywgbmV3Q3VycmVudENyZWRpdHMpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoJ2NyZWRpdF91cGRhdGVkJywgdXNlcklkLCB0aW1lc3RhbXAsIHtcbiAgICAgIGN1cnJlbnRDcmVkaXRzLFxuICAgIH0pO1xuXG4gICAgLy8gSWYgdGhpcyB3YXMgdHJpZ2dlcmVkIGJ5IFNRUywgZGVsZXRlIHRoZSBtZXNzYWdlIGZyb20gdGhlIHF1ZXVlXG4gICAgaWYgKHJlY29yZCAmJiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwpIHtcbiAgICAgIGNvbnN0IGRlbGV0ZUNvbW1hbmQgPSBuZXcgRGVsZXRlTWVzc2FnZUNvbW1hbmQoe1xuICAgICAgICBRdWV1ZVVybDogcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMLFxuICAgICAgICBSZWNlaXB0SGFuZGxlOiByZWNvcmQucmVjZWlwdEhhbmRsZSxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgc3FzLnNlbmQoZGVsZXRlQ29tbWFuZCk7XG4gICAgfVxuXG4gICAgLy8gUmV0dXJuIHN1Y2Nlc3MgcmVzcG9uc2VcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gcmVnZW5lcmF0ZSBhdWRpbyBzY2VuZSAoU1FTKTonLCBlcnJvcik7XG4gICAgdGhyb3cgRXJyb3IoJ1NjZW5lIHJlZ2VuZXJhdGlvbiBmYWlsZWQnKTtcbiAgfVxufVxuIl19