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
async function processRegenerateAudioScene(request, record) {
    console.log('request processRegenerateAudioScene:', JSON.stringify(request, null, 2));
    const { scene, voice, language, userId, timestamp } = request;
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
    // generate video effect
    await (0, videoEffects_1.generateVideoEffects)([scene], request.userId, timestamp);
    await (0, broadcastProgress_1.broadcastProgress)('preview_completed', request.userId, timestamp, {
        manifest: manifestHydrated,
    });
    const newCurrentCredits = await (0, credits_2.updateCreditBalanceByUserId)(userId, credits_1.CREDITS_COST.new_audio_subtitle);
    console.log('new credits after deduction:', newCurrentCredits);
    await (0, broadcastProgress_1.broadcastProgress)('credit_updated', userId, timestamp, {
        currentCredits,
    });
    // Return success response
    return {
        statusCode: 200,
        body: JSON.stringify({
            manifest: manifestHydrated,
        }),
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1JlZ2VuZXJhdGVBdWRpb1NjZW5lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicHJvY2Vzc1JlZ2VuZXJhdGVBdWRpb1NjZW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBeUJBLGtFQXdHQztBQWhJRCwwQ0FBbUQ7QUFDbkQsMERBQXNFO0FBRXRFLGtEQUF1RDtBQUN2RCx3REFBNkQ7QUFDN0Qsa0VBQStEO0FBQy9ELDhDQUFnRDtBQUNoRCw4Q0FHMEI7QUFHMUIsMERBQXdEO0FBV2pELEtBQUssVUFBVSwyQkFBMkIsQ0FDL0MsT0FBMkMsRUFDM0MsTUFBa0I7SUFFbEIsT0FBTyxDQUFDLEdBQUcsQ0FDVCxzQ0FBc0MsRUFDdEMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUNqQyxDQUFDO0lBQ0YsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxPQUFPLENBQUM7SUFFOUQsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ1gsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQ25CLEtBQUssRUFBRSxnREFBZ0Q7YUFDeEQsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0lBRUQsTUFBTSxFQUFFLG9CQUFvQixFQUFFLGNBQWMsRUFBRSxHQUM1QyxNQUFNLElBQUEsc0NBQTRCLEVBQUMsTUFBTSxFQUFFLHNCQUFZLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUU5RSxPQUFPLENBQUMsR0FBRyxDQUNULCtCQUErQixFQUMvQixvQkFBb0IsRUFDcEIsY0FBYyxDQUNmLENBQUM7SUFDRixJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztRQUMxQixPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FB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SUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDbkIsUUFBUSxFQUFFLGdCQUFnQjtTQUMzQixDQUFDO0tBQ0gsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTUVNSZWNvcmQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IGdlbmVyYXRlTmFycmF0aW9uIH0gZnJvbSAnLi4vdXRpbHMvYXVkaW8nO1xuaW1wb3J0IHsgZ2V0TWFuaWZlc3QsIGh5ZHJhdGVNYW5pZmVzdCB9IGZyb20gJy4uL3V0aWxzL21hbmlmZXN0VXRpbHMnO1xuXG5pbXBvcnQgeyBnZW5lcmF0ZVN1YnRpdGxlcyB9IGZyb20gJy4uL3V0aWxzL3N1YnRpdGxlcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVZpZGVvRWZmZWN0cyB9IGZyb20gJy4uL3V0aWxzL3ZpZGVvRWZmZWN0cyc7XG5pbXBvcnQgeyBicm9hZGNhc3RQcm9ncmVzcyB9IGZyb20gJy4uL3V0aWxzL2Jyb2FkY2FzdFByb2dyZXNzJztcbmltcG9ydCB7IENSRURJVFNfQ09TVCB9IGZyb20gJy4uL3V0aWxzL2NyZWRpdHMnO1xuaW1wb3J0IHtcbiAgaGFzU3VmZmljaWVudENyZWRpdHNCeVVzZXJJZCxcbiAgdXBkYXRlQ3JlZGl0QmFsYW5jZUJ5VXNlcklkLFxufSBmcm9tICcuLi91dGlscy9jcmVkaXRzJztcbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi4vdXRpbHMvc2NyaXB0JztcblxuaW1wb3J0IHsgdXBkYXRlTWFuaWZlc3QgfSBmcm9tICcuLi91dGlscy9tYW5pZmVzdFV0aWxzJztcbmltcG9ydCB7IE1hbmlmZXN0IH0gZnJvbSAnLi4vdHlwZXMvczNUeXBlcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgcHJvY2Vzc1JlZ2VuZXJhdGVBdWRpb1NjZW5lUmVxdWVzdCB7XG4gIHNjZW5lOiBTY2VuZTtcbiAgdm9pY2U6IHN0cmluZztcbiAgbGFuZ3VhZ2U6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1JlZ2VuZXJhdGVBdWRpb1NjZW5lKFxuICByZXF1ZXN0OiBwcm9jZXNzUmVnZW5lcmF0ZUF1ZGlvU2NlbmVSZXF1ZXN0LFxuICByZWNvcmQ/OiBTUVNSZWNvcmQsXG4pIHtcbiAgY29uc29sZS5sb2coXG4gICAgJ3JlcXVlc3QgcHJvY2Vzc1JlZ2VuZXJhdGVBdWRpb1NjZW5lOicsXG4gICAgSlNPTi5zdHJpbmdpZnkocmVxdWVzdCwgbnVsbCwgMiksXG4gICk7XG4gIGNvbnN0IHsgc2NlbmUsIHZvaWNlLCBsYW5ndWFnZSwgdXNlcklkLCB0aW1lc3RhbXAgfSA9IHJlcXVlc3Q7XG5cbiAgaWYgKCFzY2VuZSkge1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGVycm9yOiAnU2NlbmVzIGFycmF5IGlzIHJlcXVpcmVkIGFuZCBtdXN0IG5vdCBiZSBlbXB0eScsXG4gICAgICB9KSxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgeyBoYXNTdWZmaWNpZW50Q3JlZGl0cywgY3VycmVudENyZWRpdHMgfSA9XG4gICAgYXdhaXQgaGFzU3VmZmljaWVudENyZWRpdHNCeVVzZXJJZCh1c2VySWQsIENSRURJVFNfQ09TVC5uZXdfYXVkaW9fc3VidGl0bGUpO1xuXG4gIGNvbnNvbGUubG9nKFxuICAgICdoYXNDcmVkaXRzIC8gY3VycmVudCBjcmVkaXRzOicsXG4gICAgaGFzU3VmZmljaWVudENyZWRpdHMsXG4gICAgY3VycmVudENyZWRpdHMsXG4gICk7XG4gIGlmICghaGFzU3VmZmljaWVudENyZWRpdHMpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0luc3VmZmljaWVudCBjcmVkaXRzJyB9KSxcbiAgICB9O1xuICB9XG5cbiAgY29uc29sZS5sb2coJ2dldHRpbmcgbWFuaWZlc3QnKTtcbiAgY29uc29sZS5sb2coJ3VzZXJJZDonLCB1c2VySWQpO1xuICBjb25zb2xlLmxvZygndGltZXN0YW1wOicsIHRpbWVzdGFtcCk7XG5cbiAgbGV0IG1hbmlmZXN0ID0gYXdhaXQgZ2V0TWFuaWZlc3QodXNlcklkLCB0aW1lc3RhbXApO1xuXG4gIGNvbnNvbGUubG9nKCdtYW5pZmVzdDonLCBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCwgbnVsbCwgMikpO1xuXG4gIGlmICghbWFuaWZlc3QpIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNDA0LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ01hbmlmZXN0IG5vdCBmb3VuZCcgfSksXG4gICAgfTtcbiAgfVxuXG4gIC8vIFN0ZXAgMzogR2VuZXJhdGUgYXVkaW8gbmFycmF0aW9uIHdpdGggd29yZC1sZXZlbCB0aW1lc3RhbXBzXG4gIGNvbnN0IHsgc3VidGl0bGVzIH0gPSBhd2FpdCBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgICBbc2NlbmVdLFxuICAgIHJlcXVlc3QudXNlcklkLFxuICAgIHRpbWVzdGFtcCxcbiAgICBtYW5pZmVzdC52b2ljZVRvbmVJbnN0cnVjdGlvbixcbiAgICBtYW5pZmVzdC52b2ljZSxcbiAgICBtYW5pZmVzdC5sYW5ndWFnZSxcbiAgKTtcbiAgY29uc29sZS5sb2coJ3N1YnRpdGxlcyBnZW5lcmF0ZWQ6JywgSlNPTi5zdHJpbmdpZnkoc3VidGl0bGVzLCBudWxsLCAyKSk7XG5cbiAgYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZXMoW3NjZW5lXSwgdXNlcklkLCB0aW1lc3RhbXAsIHN1YnRpdGxlcyk7XG5cbiAgbWFuaWZlc3QgPSBhd2FpdCB1cGRhdGVNYW5pZmVzdChtYW5pZmVzdCwge1xuICAgIHNjZW5lczogbWFuaWZlc3Quc2NlbmVzLm1hcCgobWFuaWZlc3RTY2VuZSkgPT4ge1xuICAgICAgLy8gT25seSB1cGRhdGUgdGhlIGR1cmF0aW9uIGZvciB0aGUgc3BlY2lmaWMgc2NlbmUgdGhhdCB3YXMgcmVnZW5lcmF0ZWRcbiAgICAgIGlmIChtYW5pZmVzdFNjZW5lLnNjZW5lUG9zaXRpb24gPT09IHNjZW5lLnNjZW5lUG9zaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5tYW5pZmVzdFNjZW5lLFxuICAgICAgICAgIGZpbGVzOiB7XG4gICAgICAgICAgICAuLi5tYW5pZmVzdFNjZW5lLmZpbGVzLFxuICAgICAgICAgICAgZHVyYXRpb246IHN1YnRpdGxlc1swXS5kdXJhdGlvbiB8fCAxMCxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIG1hbmlmZXN0U2NlbmU7XG4gICAgfSksXG4gIH0pO1xuXG4gIGNvbnN0IG1hbmlmZXN0SHlkcmF0ZWQgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuXG4gIC8vIGdlbmVyYXRlIHZpZGVvIGVmZmVjdFxuICBhd2FpdCBnZW5lcmF0ZVZpZGVvRWZmZWN0cyhbc2NlbmVdLCByZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wKTtcblxuICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcygncHJldmlld19jb21wbGV0ZWQnLCByZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCB7XG4gICAgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQsXG4gIH0pO1xuXG4gIGNvbnN0IG5ld0N1cnJlbnRDcmVkaXRzID0gYXdhaXQgdXBkYXRlQ3JlZGl0QmFsYW5jZUJ5VXNlcklkKFxuICAgIHVzZXJJZCxcbiAgICBDUkVESVRTX0NPU1QubmV3X2F1ZGlvX3N1YnRpdGxlLFxuICApO1xuICBjb25zb2xlLmxvZygnbmV3IGNyZWRpdHMgYWZ0ZXIgZGVkdWN0aW9uOicsIG5ld0N1cnJlbnRDcmVkaXRzKTtcblxuICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcygnY3JlZGl0X3VwZGF0ZWQnLCB1c2VySWQsIHRpbWVzdGFtcCwge1xuICAgIGN1cnJlbnRDcmVkaXRzLFxuICB9KTtcblxuICAvLyBSZXR1cm4gc3VjY2VzcyByZXNwb25zZVxuICByZXR1cm4ge1xuICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCxcbiAgICB9KSxcbiAgfTtcbn1cbiJdfQ==