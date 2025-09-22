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
    // Return success response
    return {
        statusCode: 200,
        body: JSON.stringify({
            manifest: manifestHydrated,
        }),
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1JlZ2VuZXJhdGVBdWRpb1NjZW5lLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicHJvY2Vzc1JlZ2VuZXJhdGVBdWRpb1NjZW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBMEJBLGtFQTRHQztBQXJJRCwwQ0FBbUQ7QUFDbkQsMERBQXNFO0FBRXRFLGtEQUF1RDtBQUN2RCx3REFBNkQ7QUFDN0Qsa0VBQStEO0FBQy9ELDhDQUFnRDtBQUNoRCw4Q0FHMEI7QUFHMUIsMERBQXdEO0FBRXhELHdDQUF3QztBQVVqQyxLQUFLLFVBQVUsMkJBQTJCLENBQy9DLE9BQTJDLEVBQzNDLE1BQWtCO0lBRWxCLE9BQU8sQ0FBQyxHQUFHLENBQ1Qsc0NBQXNDLEVBQ3RDLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FDakMsQ0FBQztJQUNGLE1BQU0sRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsT0FBTyxDQUFDO0lBRTlELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNYLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixLQUFLLEVBQUUsZ0RBQWdEO2FBQ3hELENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztJQUVELE1BQU0sRUFBRSxvQkFBb0IsRUFBRSxjQUFjLEVBQUUsR0FDNUMsTUFBTSxJQUFBLHNDQUE0QixFQUFDLE1BQU0sRUFBRSxzQkFBWSxDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFFOUUsT0FBTyxDQUFDLEdBQUcsQ0FDVCwrQkFBK0IsRUFDL0Isb0JBQW9CLEVBQ3BCLGNBQWMsQ0FDZixDQUFDO0lBQ0YsSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFDMUIsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsSUFBSSxFQUFFLElBQUks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LENBQUM7SUFFL0QsTUFBTSxJQUFBLHFDQUFpQixFQUFDLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUU7UUFDM0QsY0FBYztLQUNmLENBQUMsQ0FBQztJQUVILDBCQUEwQjtJQUMxQixPQUFPO1FBQ0wsVUFBVSxFQUFFLEdBQUc7UUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztZQUNuQixRQUFRLEVBQUUsZ0JBQWdCO1NBQzNCLENBQUM7S0FDSCxDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNRU1JlY29yZCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgZ2VuZXJhdGVOYXJyYXRpb24gfSBmcm9tICcuLi91dGlscy9hdWRpbyc7XG5pbXBvcnQgeyBnZXRNYW5pZmVzdCwgaHlkcmF0ZU1hbmlmZXN0IH0gZnJvbSAnLi4vdXRpbHMvbWFuaWZlc3RVdGlscyc7XG5cbmltcG9ydCB7IGdlbmVyYXRlU3VidGl0bGVzIH0gZnJvbSAnLi4vdXRpbHMvc3VidGl0bGVzJztcbmltcG9ydCB7IGdlbmVyYXRlVmlkZW9FZmZlY3RzIH0gZnJvbSAnLi4vdXRpbHMvdmlkZW9FZmZlY3RzJztcbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi4vdXRpbHMvYnJvYWRjYXN0UHJvZ3Jlc3MnO1xuaW1wb3J0IHsgQ1JFRElUU19DT1NUIH0gZnJvbSAnLi4vdXRpbHMvY3JlZGl0cyc7XG5pbXBvcnQge1xuICBoYXNTdWZmaWNpZW50Q3JlZGl0c0J5VXNlcklkLFxuICB1cGRhdGVDcmVkaXRCYWxhbmNlQnlVc2VySWQsXG59IGZyb20gJy4uL3V0aWxzL2NyZWRpdHMnO1xuaW1wb3J0IHsgU2NlbmUgfSBmcm9tICcuLi91dGlscy9zY3JpcHQnO1xuXG5pbXBvcnQgeyB1cGRhdGVNYW5pZmVzdCB9IGZyb20gJy4uL3V0aWxzL21hbmlmZXN0VXRpbHMnO1xuaW1wb3J0IHsgTWFuaWZlc3QgfSBmcm9tICcuLi90eXBlcy9zM1R5cGVzJztcbmltcG9ydCB7IGdldFVzZXIgfSBmcm9tICcuLi91dGlscy91c2VyJztcblxuZXhwb3J0IGludGVyZmFjZSBwcm9jZXNzUmVnZW5lcmF0ZUF1ZGlvU2NlbmVSZXF1ZXN0IHtcbiAgc2NlbmU6IFNjZW5lO1xuICB2b2ljZTogc3RyaW5nO1xuICBsYW5ndWFnZTogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwcm9jZXNzUmVnZW5lcmF0ZUF1ZGlvU2NlbmUoXG4gIHJlcXVlc3Q6IHByb2Nlc3NSZWdlbmVyYXRlQXVkaW9TY2VuZVJlcXVlc3QsXG4gIHJlY29yZD86IFNRU1JlY29yZCxcbikge1xuICBjb25zb2xlLmxvZyhcbiAgICAncmVxdWVzdCBwcm9jZXNzUmVnZW5lcmF0ZUF1ZGlvU2NlbmU6JyxcbiAgICBKU09OLnN0cmluZ2lmeShyZXF1ZXN0LCBudWxsLCAyKSxcbiAgKTtcbiAgY29uc3QgeyBzY2VuZSwgdm9pY2UsIGxhbmd1YWdlLCB1c2VySWQsIHRpbWVzdGFtcCB9ID0gcmVxdWVzdDtcblxuICBpZiAoIXNjZW5lKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdTY2VuZXMgYXJyYXkgaXMgcmVxdWlyZWQgYW5kIG11c3Qgbm90IGJlIGVtcHR5JyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cblxuICBjb25zdCB7IGhhc1N1ZmZpY2llbnRDcmVkaXRzLCBjdXJyZW50Q3JlZGl0cyB9ID1cbiAgICBhd2FpdCBoYXNTdWZmaWNpZW50Q3JlZGl0c0J5VXNlcklkKHVzZXJJZCwgQ1JFRElUU19DT1NULm5ld19hdWRpb19zdWJ0aXRsZSk7XG5cbiAgY29uc29sZS5sb2coXG4gICAgJ2hhc0NyZWRpdHMgLyBjdXJyZW50IGNyZWRpdHM6JyxcbiAgICBoYXNTdWZmaWNpZW50Q3JlZGl0cyxcbiAgICBjdXJyZW50Q3JlZGl0cyxcbiAgKTtcbiAgaWYgKCFoYXNTdWZmaWNpZW50Q3JlZGl0cykge1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW5zdWZmaWNpZW50IGNyZWRpdHMnIH0pLFxuICAgIH07XG4gIH1cblxuICBjb25zb2xlLmxvZygnZ2V0dGluZyBtYW5pZmVzdCcpO1xuICBjb25zb2xlLmxvZygndXNlcklkOicsIHVzZXJJZCk7XG4gIGNvbnNvbGUubG9nKCd0aW1lc3RhbXA6JywgdGltZXN0YW1wKTtcblxuICBsZXQgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdCh1c2VySWQsIHRpbWVzdGFtcCk7XG5cbiAgY29uc29sZS5sb2coJ21hbmlmZXN0OicsIEpTT04uc3RyaW5naWZ5KG1hbmlmZXN0LCBudWxsLCAyKSk7XG5cbiAgaWYgKCFtYW5pZmVzdCkge1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA0MDQsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWFuaWZlc3Qgbm90IGZvdW5kJyB9KSxcbiAgICB9O1xuICB9XG5cbiAgLy8gU3RlcCAzOiBHZW5lcmF0ZSBhdWRpbyBuYXJyYXRpb24gd2l0aCB3b3JkLWxldmVsIHRpbWVzdGFtcHNcbiAgY29uc3QgeyBzdWJ0aXRsZXMgfSA9IGF3YWl0IGdlbmVyYXRlTmFycmF0aW9uKFxuICAgIFtzY2VuZV0sXG4gICAgcmVxdWVzdC51c2VySWQsXG4gICAgdGltZXN0YW1wLFxuICAgIG1hbmlmZXN0LnZvaWNlVG9uZUluc3RydWN0aW9uLFxuICAgIG1hbmlmZXN0LnZvaWNlLFxuICAgIG1hbmlmZXN0Lmxhbmd1YWdlLFxuICApO1xuICBjb25zb2xlLmxvZygnc3VidGl0bGVzIGdlbmVyYXRlZDonLCBKU09OLnN0cmluZ2lmeShzdWJ0aXRsZXMsIG51bGwsIDIpKTtcblxuICBhd2FpdCBnZW5lcmF0ZVN1YnRpdGxlcyhbc2NlbmVdLCB1c2VySWQsIHRpbWVzdGFtcCwgc3VidGl0bGVzKTtcblxuICBtYW5pZmVzdCA9IGF3YWl0IHVwZGF0ZU1hbmlmZXN0KG1hbmlmZXN0LCB7XG4gICAgc2NlbmVzOiBtYW5pZmVzdC5zY2VuZXMubWFwKChtYW5pZmVzdFNjZW5lKSA9PiB7XG4gICAgICAvLyBPbmx5IHVwZGF0ZSB0aGUgZHVyYXRpb24gZm9yIHRoZSBzcGVjaWZpYyBzY2VuZSB0aGF0IHdhcyByZWdlbmVyYXRlZFxuICAgICAgaWYgKG1hbmlmZXN0U2NlbmUuc2NlbmVQb3NpdGlvbiA9PT0gc2NlbmUuc2NlbmVQb3NpdGlvbikge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLm1hbmlmZXN0U2NlbmUsXG4gICAgICAgICAgZmlsZXM6IHtcbiAgICAgICAgICAgIC4uLm1hbmlmZXN0U2NlbmUuZmlsZXMsXG4gICAgICAgICAgICBkdXJhdGlvbjogc3VidGl0bGVzWzBdLmR1cmF0aW9uIHx8IDEwLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gbWFuaWZlc3RTY2VuZTtcbiAgICB9KSxcbiAgfSk7XG5cbiAgY29uc3QgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG5cbiAgY29uc3QgdXNlciA9IGF3YWl0IGdldFVzZXIocmVxdWVzdC51c2VySWQpO1xuXG4gIC8vIGdlbmVyYXRlIHZpZGVvIGVmZmVjdFxuICBpZiAoIXNjZW5lLmFuaW1hdGVkKSB7XG4gICAgYXdhaXQgZ2VuZXJhdGVWaWRlb0VmZmVjdHMoW3NjZW5lXSwgcmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCwgdXNlcik7XG4gIH1cblxuICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcygncHJldmlld19jb21wbGV0ZWQnLCByZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCB7XG4gICAgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQsXG4gIH0pO1xuXG4gIGNvbnN0IG5ld0N1cnJlbnRDcmVkaXRzID0gYXdhaXQgdXBkYXRlQ3JlZGl0QmFsYW5jZUJ5VXNlcklkKFxuICAgIHVzZXJJZCxcbiAgICBDUkVESVRTX0NPU1QubmV3X2F1ZGlvX3N1YnRpdGxlLFxuICApO1xuICBjb25zb2xlLmxvZygnbmV3IGNyZWRpdHMgYWZ0ZXIgZGVkdWN0aW9uOicsIG5ld0N1cnJlbnRDcmVkaXRzKTtcblxuICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcygnY3JlZGl0X3VwZGF0ZWQnLCB1c2VySWQsIHRpbWVzdGFtcCwge1xuICAgIGN1cnJlbnRDcmVkaXRzLFxuICB9KTtcblxuICAvLyBSZXR1cm4gc3VjY2VzcyByZXNwb25zZVxuICByZXR1cm4ge1xuICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCxcbiAgICB9KSxcbiAgfTtcbn1cbiJdfQ==