"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const audio_1 = require("../utils/audio");
const subtitles_1 = require("../utils/subtitles");
const video_generation_1 = require("../video-generation");
const credits_1 = require("../utils/credits");
const manifestUtils_1 = require("../video-generation/util/manifestUtils");
const credits_2 = require("../utils/credits");
const handler = async (event) => {
    console.log('🎤 Audio-Subtitle Lambda handler started');
    try {
        // Parse request body
        if (!event.body) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Request body is required' }),
            };
        }
        // get userId from the authorizer context
        const userId = event.requestContext.authorizer?.principalId;
        if (!userId) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Unauthorized' }),
            };
        }
        // get timestamp from query string
        const timestamp = event.queryStringParameters?.['timestamp'];
        if (!timestamp) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Timestamp is required' }),
            };
        }
        // get one scene object from body
        const requestBody = JSON.parse(event.body);
        const scene = requestBody.scene;
        const voice = requestBody.voice || 'alloy';
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
        const manifest = await (0, manifestUtils_1.getManifest)(userId, timestamp);
        if (!manifest) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Manifest not found' }),
            };
        }
        // Step 3: Generate audio narration with word-level timestamps
        const { subtitles, narrationUrls } = await (0, audio_1.generateNarration)([scene], userId, timestamp, 'Speak in a cheerful and positive tone', voice);
        console.log('subtitles generated:', JSON.stringify(subtitles, null, 2));
        const assContentArray = await (0, subtitles_1.generateSubtitles)([scene], userId, timestamp, subtitles);
        console.log('assContentArray:', assContentArray);
        const manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
        console.log('manifestHydrated:', manifestHydrated);
        const newCurrentCredits = await (0, credits_2.updateCreditBalanceByUserId)(userId, credits_1.CREDITS_COST.new_audio_subtitle);
        console.log('new credits after deduction:', newCurrentCredits);
        // update manifest with subtitle content, ass content and audio urls
        // Only update the specific scene that was regenerated (scene.id corresponds to sceneIndex)
        // const updatedScenesWithAudio = manifestHydrated!.scenes.map(
        //   (manifestScene) => {
        //     // Only update the scene that matches the regenerated scene
        //     if (manifestScene.sceneIndex === scene.id) {
        //       const narrationUrlObj = narrationUrls[0]; // Only one scene was processed
        //       const narrationUrl = narrationUrlObj
        //         ? Object.values(narrationUrlObj)[0]
        //         : manifestScene.files.mp3;
        //       // Extract ASS content from the array (first element contains the ASS content)
        //       const assContent = assContentArray[0]
        //         ? Object.values(assContentArray[0])[0]
        //         : '';
        //       return {
        //         ...manifestScene,
        //         files: {
        //           ...manifestScene.files,
        //           mp3: narrationUrl,
        //           ass: assContent,
        //           subtitle: subtitles[0].fullText, // Only one subtitle was generated
        //         },
        //       };
        //     }
        //     // Return unchanged scene for all other scenes
        //     return manifestScene;
        //   },
        // );
        // // update manifestHydrated with updatedScenesWithAudio
        // manifestHydrated!.scenes = updatedScenesWithAudio;
        // console.log('manifestHydrated:', JSON.stringify(manifestHydrated, null, 2));
        await (0, video_generation_1.broadcastProgress)('credit_updated', userId, timestamp, {
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
    catch (error) {
        console.error('❌ Error in audio-subtitle generation:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error occurred',
            }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSwwQ0FBbUQ7QUFDbkQsa0RBQXlFO0FBR3pFLDBEQUF3RDtBQUN4RCw4Q0FBZ0Q7QUFFaEQsMEVBSWdEO0FBRWhELDhDQUkwQjtBQVVuQixNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQzFCLEtBQTJCLEVBQ0ssRUFBRTtJQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLDBDQUEwQyxDQUFDLENBQUM7SUFFeEQsSUFBSSxDQUFDO1FBQ0gscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxDQUFDO2FBQzVELENBQUM7UUFDSixDQUFDO1FBRUQseUNBQXlDO1FBQ3pDLE1BQU0sTUFBTSxHQUFJLEtBQUssQ0FBQyxjQUFzQixDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUM7UUFDckUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ1osT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQzthQUNoRCxDQUFDO1FBQ0osQ0FBQztRQUVELGtDQUFrQztRQUNsQyxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDZixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUM7YUFDekQsQ0FBQztRQUNKLENB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Q2IsV0FBVztRQUNYLFFBQVE7UUFFUixxREFBcUQ7UUFDckQsNEJBQTRCO1FBQzVCLE9BQU87UUFDUCxLQUFLO1FBRUwseURBQXlEO1FBQ3pELHFEQUFxRDtRQUNyRCwrRUFBK0U7UUFFL0UsTUFBTSxJQUFBLG9DQUFpQixFQUFDLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUU7WUFDM0QsY0FBYztTQUNmLENBQUMsQ0FBQztRQUVILDBCQUEwQjtRQUMxQixPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsUUFBUSxFQUFFLGdCQUFnQjthQUMzQixDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUU5RCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsS0FBSyxFQUFFLHVCQUF1QjtnQkFDOUIsT0FBTyxFQUNMLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLHdCQUF3QjthQUNwRSxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUEvSlcsUUFBQSxPQUFPLFdBK0psQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcblxuaW1wb3J0IHsgZ2VuZXJhdGVOYXJyYXRpb24gfSBmcm9tICcuLi91dGlscy9hdWRpbyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVN1YnRpdGxlcywgQVNTQ29udGVudFJlc3VsdCB9IGZyb20gJy4uL3V0aWxzL3N1YnRpdGxlcyc7XG5pbXBvcnQgeyBTY2VuZSB9IGZyb20gJy4uL3V0aWxzL3NjcmlwdCc7XG5cbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi4vdmlkZW8tZ2VuZXJhdGlvbic7XG5pbXBvcnQgeyBDUkVESVRTX0NPU1QgfSBmcm9tICcuLi91dGlscy9jcmVkaXRzJztcblxuaW1wb3J0IHtcbiAgZ2V0TWFuaWZlc3QsXG4gIGh5ZHJhdGVNYW5pZmVzdCxcbiAgdXBkYXRlTWFuaWZlc3QsXG59IGZyb20gJy4uL3ZpZGVvLWdlbmVyYXRpb24vdXRpbC9tYW5pZmVzdFV0aWxzJztcbmltcG9ydCB7IHVwbG9hZEpzb25Ub1MzIH0gZnJvbSAnLi4vdmlkZW8tZ2VuZXJhdGlvbi91dGlsL3MzVXBsb2FkZXInO1xuaW1wb3J0IHtcbiAgZ2V0Q3JlZGl0QmFsYW5jZUJ5VXNlcklkLFxuICBoYXNTdWZmaWNpZW50Q3JlZGl0c0J5VXNlcklkLFxuICB1cGRhdGVDcmVkaXRCYWxhbmNlQnlVc2VySWQsXG59IGZyb20gJy4uL3V0aWxzL2NyZWRpdHMnO1xuXG5pbnRlcmZhY2UgUmVxdWVzdEJvZHkge1xuICBzY2VuZXM6IFNjZW5lW107XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24/OiBzdHJpbmc7XG4gIHZvaWNlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChcbiAgZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50LFxuKTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgY29uc29sZS5sb2coJ/CfjqQgQXVkaW8tU3VidGl0bGUgTGFtYmRhIGhhbmRsZXIgc3RhcnRlZCcpO1xuXG4gIHRyeSB7XG4gICAgLy8gUGFyc2UgcmVxdWVzdCBib2R5XG4gICAgaWYgKCFldmVudC5ib2R5KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdSZXF1ZXN0IGJvZHkgaXMgcmVxdWlyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBnZXQgdXNlcklkIGZyb20gdGhlIGF1dGhvcml6ZXIgY29udGV4dFxuICAgIGNvbnN0IHVzZXJJZCA9IChldmVudC5yZXF1ZXN0Q29udGV4dCBhcyBhbnkpLmF1dGhvcml6ZXI/LnByaW5jaXBhbElkO1xuICAgIGlmICghdXNlcklkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDEsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdVbmF1dGhvcml6ZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBnZXQgdGltZXN0YW1wIGZyb20gcXVlcnkgc3RyaW5nXG4gICAgY29uc3QgdGltZXN0YW1wID0gZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzPy5bJ3RpbWVzdGFtcCddO1xuICAgIGlmICghdGltZXN0YW1wKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdUaW1lc3RhbXAgaXMgcmVxdWlyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBnZXQgb25lIHNjZW5lIG9iamVjdCBmcm9tIGJvZHlcbiAgICBjb25zdCByZXF1ZXN0Qm9keSA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSk7XG4gICAgY29uc3Qgc2NlbmUgPSByZXF1ZXN0Qm9keS5zY2VuZSBhcyBTY2VuZTtcbiAgICBjb25zdCB2b2ljZSA9IHJlcXVlc3RCb2R5LnZvaWNlIHx8ICdhbGxveSc7XG5cbiAgICBpZiAoIXNjZW5lKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ1NjZW5lcyBhcnJheSBpcyByZXF1aXJlZCBhbmQgbXVzdCBub3QgYmUgZW1wdHknLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgeyBoYXNTdWZmaWNpZW50Q3JlZGl0cywgY3VycmVudENyZWRpdHMgfSA9XG4gICAgICBhd2FpdCBoYXNTdWZmaWNpZW50Q3JlZGl0c0J5VXNlcklkKFxuICAgICAgICB1c2VySWQsXG4gICAgICAgIENSRURJVFNfQ09TVC5uZXdfYXVkaW9fc3VidGl0bGUsXG4gICAgICApO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICAnaGFzQ3JlZGl0cyAvIGN1cnJlbnQgY3JlZGl0czonLFxuICAgICAgaGFzU3VmZmljaWVudENyZWRpdHMsXG4gICAgICBjdXJyZW50Q3JlZGl0cyxcbiAgICApO1xuICAgIGlmICghaGFzU3VmZmljaWVudENyZWRpdHMpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0luc3VmZmljaWVudCBjcmVkaXRzJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdCh1c2VySWQsIHRpbWVzdGFtcCk7XG5cbiAgICBpZiAoIW1hbmlmZXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDQsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNYW5pZmVzdCBub3QgZm91bmQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBTdGVwIDM6IEdlbmVyYXRlIGF1ZGlvIG5hcnJhdGlvbiB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wc1xuICAgIGNvbnN0IHsgc3VidGl0bGVzLCBuYXJyYXRpb25VcmxzIH0gPSBhd2FpdCBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgICAgIFtzY2VuZV0sXG4gICAgICB1c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICAnU3BlYWsgaW4gYSBjaGVlcmZ1bCBhbmQgcG9zaXRpdmUgdG9uZScsXG4gICAgICB2b2ljZSxcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKCdzdWJ0aXRsZXMgZ2VuZXJhdGVkOicsIEpTT04uc3RyaW5naWZ5KHN1YnRpdGxlcywgbnVsbCwgMikpO1xuXG4gICAgY29uc3QgYXNzQ29udGVudEFycmF5OiBBU1NDb250ZW50UmVzdWx0W10gPSBhd2FpdCBnZW5lcmF0ZVN1YnRpdGxlcyhcbiAgICAgIFtzY2VuZV0sXG4gICAgICB1c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBzdWJ0aXRsZXMsXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZygnYXNzQ29udGVudEFycmF5OicsIGFzc0NvbnRlbnRBcnJheSk7XG5cbiAgICBjb25zdCBtYW5pZmVzdEh5ZHJhdGVkID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcbiAgICBjb25zb2xlLmxvZygnbWFuaWZlc3RIeWRyYXRlZDonLCBtYW5pZmVzdEh5ZHJhdGVkKTtcblxuICAgIGNvbnN0IG5ld0N1cnJlbnRDcmVkaXRzID0gYXdhaXQgdXBkYXRlQ3JlZGl0QmFsYW5jZUJ5VXNlcklkKFxuICAgICAgdXNlcklkLFxuICAgICAgQ1JFRElUU19DT1NULm5ld19hdWRpb19zdWJ0aXRsZSxcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKCduZXcgY3JlZGl0cyBhZnRlciBkZWR1Y3Rpb246JywgbmV3Q3VycmVudENyZWRpdHMpO1xuXG4gICAgLy8gdXBkYXRlIG1hbmlmZXN0IHdpdGggc3VidGl0bGUgY29udGVudCwgYXNzIGNvbnRlbnQgYW5kIGF1ZGlvIHVybHNcbiAgICAvLyBPbmx5IHVwZGF0ZSB0aGUgc3BlY2lmaWMgc2NlbmUgdGhhdCB3YXMgcmVnZW5lcmF0ZWQgKHNjZW5lLmlkIGNvcnJlc3BvbmRzIHRvIHNjZW5lSW5kZXgpXG4gICAgLy8gY29uc3QgdXBkYXRlZFNjZW5lc1dpdGhBdWRpbyA9IG1hbmlmZXN0SHlkcmF0ZWQhLnNjZW5lcy5tYXAoXG4gICAgLy8gICAobWFuaWZlc3RTY2VuZSkgPT4ge1xuICAgIC8vICAgICAvLyBPbmx5IHVwZGF0ZSB0aGUgc2NlbmUgdGhhdCBtYXRjaGVzIHRoZSByZWdlbmVyYXRlZCBzY2VuZVxuICAgIC8vICAgICBpZiAobWFuaWZlc3RTY2VuZS5zY2VuZUluZGV4ID09PSBzY2VuZS5pZCkge1xuICAgIC8vICAgICAgIGNvbnN0IG5hcnJhdGlvblVybE9iaiA9IG5hcnJhdGlvblVybHNbMF07IC8vIE9ubHkgb25lIHNjZW5lIHdhcyBwcm9jZXNzZWRcbiAgICAvLyAgICAgICBjb25zdCBuYXJyYXRpb25VcmwgPSBuYXJyYXRpb25VcmxPYmpcbiAgICAvLyAgICAgICAgID8gT2JqZWN0LnZhbHVlcyhuYXJyYXRpb25VcmxPYmopWzBdXG4gICAgLy8gICAgICAgICA6IG1hbmlmZXN0U2NlbmUuZmlsZXMubXAzO1xuXG4gICAgLy8gICAgICAgLy8gRXh0cmFjdCBBU1MgY29udGVudCBmcm9tIHRoZSBhcnJheSAoZmlyc3QgZWxlbWVudCBjb250YWlucyB0aGUgQVNTIGNvbnRlbnQpXG4gICAgLy8gICAgICAgY29uc3QgYXNzQ29udGVudCA9IGFzc0NvbnRlbnRBcnJheVswXVxuICAgIC8vICAgICAgICAgPyBPYmplY3QudmFsdWVzKGFzc0NvbnRlbnRBcnJheVswXSlbMF1cbiAgICAvLyAgICAgICAgIDogJyc7XG5cbiAgICAvLyAgICAgICByZXR1cm4ge1xuICAgIC8vICAgICAgICAgLi4ubWFuaWZlc3RTY2VuZSxcbiAgICAvLyAgICAgICAgIGZpbGVzOiB7XG4gICAgLy8gICAgICAgICAgIC4uLm1hbmlmZXN0U2NlbmUuZmlsZXMsXG4gICAgLy8gICAgICAgICAgIG1wMzogbmFycmF0aW9uVXJsLFxuICAgIC8vICAgICAgICAgICBhc3M6IGFzc0NvbnRlbnQsXG4gICAgLy8gICAgICAgICAgIHN1YnRpdGxlOiBzdWJ0aXRsZXNbMF0uZnVsbFRleHQsIC8vIE9ubHkgb25lIHN1YnRpdGxlIHdhcyBnZW5lcmF0ZWRcbiAgICAvLyAgICAgICAgIH0sXG4gICAgLy8gICAgICAgfTtcbiAgICAvLyAgICAgfVxuXG4gICAgLy8gICAgIC8vIFJldHVybiB1bmNoYW5nZWQgc2NlbmUgZm9yIGFsbCBvdGhlciBzY2VuZXNcbiAgICAvLyAgICAgcmV0dXJuIG1hbmlmZXN0U2NlbmU7XG4gICAgLy8gICB9LFxuICAgIC8vICk7XG5cbiAgICAvLyAvLyB1cGRhdGUgbWFuaWZlc3RIeWRyYXRlZCB3aXRoIHVwZGF0ZWRTY2VuZXNXaXRoQXVkaW9cbiAgICAvLyBtYW5pZmVzdEh5ZHJhdGVkIS5zY2VuZXMgPSB1cGRhdGVkU2NlbmVzV2l0aEF1ZGlvO1xuICAgIC8vIGNvbnNvbGUubG9nKCdtYW5pZmVzdEh5ZHJhdGVkOicsIEpTT04uc3RyaW5naWZ5KG1hbmlmZXN0SHlkcmF0ZWQsIG51bGwsIDIpKTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKCdjcmVkaXRfdXBkYXRlZCcsIHVzZXJJZCwgdGltZXN0YW1wLCB7XG4gICAgICBjdXJyZW50Q3JlZGl0cyxcbiAgICB9KTtcblxuICAgIC8vIFJldHVybiBzdWNjZXNzIHJlc3BvbnNlXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQsXG4gICAgICB9KSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBhdWRpby1zdWJ0aXRsZSBnZW5lcmF0aW9uOicsIGVycm9yKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyxcbiAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yIG9jY3VycmVkJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=