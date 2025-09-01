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
        const scene = JSON.parse(event.body).scene;
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
        const { subtitles, narrationUrls } = await (0, audio_1.generateNarration)([scene], userId, timestamp);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSwwQ0FBbUQ7QUFDbkQsa0RBQXlFO0FBR3pFLDBEQUF3RDtBQUN4RCw4Q0FBZ0Q7QUFFaEQsMEVBSWdEO0FBRWhELDhDQUkwQjtBQVNuQixNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQzFCLEtBQTJCLEVBQ0ssRUFBRTtJQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLDBDQUEwQyxDQUFDLENBQUM7SUFFeEQsSUFBSSxDQUFDO1FBQ0gscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxDQUFDO2FBQzVELENBQUM7UUFDSixDQUFDO1FBRUQseUNBQXlDO1FBQ3pDLE1BQU0sTUFBTSxHQUFJLEtBQUssQ0FBQyxjQUFzQixDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUM7UUFDckUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ1osT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQzthQUNoRCxDQUFDO1FBQ0osQ0FBQztRQUVELGtDQUFrQztRQUNsQyxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDZixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUM7YUFDekQsQ0FBQztRQUNKLENB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L0UsTUFBTSxJQUFBLG9DQUFpQixFQUFDLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUU7WUFDM0QsY0FBYztTQUNmLENBQUMsQ0FBQztRQUVILDBCQUEwQjtRQUMxQixPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsUUFBUSxFQUFFLGdCQUFnQjthQUMzQixDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUU5RCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsS0FBSyxFQUFFLHVCQUF1QjtnQkFDOUIsT0FBTyxFQUNMLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLHdCQUF3QjthQUNwRSxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUExSlcsUUFBQSxPQUFPLFdBMEpsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcblxuaW1wb3J0IHsgZ2VuZXJhdGVOYXJyYXRpb24gfSBmcm9tICcuLi91dGlscy9hdWRpbyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVN1YnRpdGxlcywgQVNTQ29udGVudFJlc3VsdCB9IGZyb20gJy4uL3V0aWxzL3N1YnRpdGxlcyc7XG5pbXBvcnQgeyBTY2VuZSB9IGZyb20gJy4uL3V0aWxzL3NjcmlwdCc7XG5cbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi4vdmlkZW8tZ2VuZXJhdGlvbic7XG5pbXBvcnQgeyBDUkVESVRTX0NPU1QgfSBmcm9tICcuLi91dGlscy9jcmVkaXRzJztcblxuaW1wb3J0IHtcbiAgZ2V0TWFuaWZlc3QsXG4gIGh5ZHJhdGVNYW5pZmVzdCxcbiAgdXBkYXRlTWFuaWZlc3QsXG59IGZyb20gJy4uL3ZpZGVvLWdlbmVyYXRpb24vdXRpbC9tYW5pZmVzdFV0aWxzJztcbmltcG9ydCB7IHVwbG9hZEpzb25Ub1MzIH0gZnJvbSAnLi4vdmlkZW8tZ2VuZXJhdGlvbi91dGlsL3MzVXBsb2FkZXInO1xuaW1wb3J0IHtcbiAgZ2V0Q3JlZGl0QmFsYW5jZUJ5VXNlcklkLFxuICBoYXNTdWZmaWNpZW50Q3JlZGl0c0J5VXNlcklkLFxuICB1cGRhdGVDcmVkaXRCYWxhbmNlQnlVc2VySWQsXG59IGZyb20gJy4uL3V0aWxzL2NyZWRpdHMnO1xuXG5pbnRlcmZhY2UgUmVxdWVzdEJvZHkge1xuICBzY2VuZXM6IFNjZW5lW107XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygn8J+OpCBBdWRpby1TdWJ0aXRsZSBMYW1iZGEgaGFuZGxlciBzdGFydGVkJyk7XG5cbiAgdHJ5IHtcbiAgICAvLyBQYXJzZSByZXF1ZXN0IGJvZHlcbiAgICBpZiAoIWV2ZW50LmJvZHkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1JlcXVlc3QgYm9keSBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCB1c2VySWQgZnJvbSB0aGUgYXV0aG9yaXplciBjb250ZXh0XG4gICAgY29uc3QgdXNlcklkID0gKGV2ZW50LnJlcXVlc3RDb250ZXh0IGFzIGFueSkuYXV0aG9yaXplcj8ucHJpbmNpcGFsSWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1VuYXV0aG9yaXplZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCB0aW1lc3RhbXAgZnJvbSBxdWVyeSBzdHJpbmdcbiAgICBjb25zdCB0aW1lc3RhbXAgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LlsndGltZXN0YW1wJ107XG4gICAgaWYgKCF0aW1lc3RhbXApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1RpbWVzdGFtcCBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCBvbmUgc2NlbmUgb2JqZWN0IGZyb20gYm9keVxuICAgIGNvbnN0IHNjZW5lID0gSlNPTi5wYXJzZShldmVudC5ib2R5KS5zY2VuZSBhcyBTY2VuZTtcbiAgICBpZiAoIXNjZW5lKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ1NjZW5lcyBhcnJheSBpcyByZXF1aXJlZCBhbmQgbXVzdCBub3QgYmUgZW1wdHknLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgeyBoYXNTdWZmaWNpZW50Q3JlZGl0cywgY3VycmVudENyZWRpdHMgfSA9XG4gICAgICBhd2FpdCBoYXNTdWZmaWNpZW50Q3JlZGl0c0J5VXNlcklkKFxuICAgICAgICB1c2VySWQsXG4gICAgICAgIENSRURJVFNfQ09TVC5uZXdfYXVkaW9fc3VidGl0bGUsXG4gICAgICApO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICAnaGFzQ3JlZGl0cyAvIGN1cnJlbnQgY3JlZGl0czonLFxuICAgICAgaGFzU3VmZmljaWVudENyZWRpdHMsXG4gICAgICBjdXJyZW50Q3JlZGl0cyxcbiAgICApO1xuICAgIGlmICghaGFzU3VmZmljaWVudENyZWRpdHMpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0luc3VmZmljaWVudCBjcmVkaXRzJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdCh1c2VySWQsIHRpbWVzdGFtcCk7XG5cbiAgICBpZiAoIW1hbmlmZXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDQsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNYW5pZmVzdCBub3QgZm91bmQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBTdGVwIDM6IEdlbmVyYXRlIGF1ZGlvIG5hcnJhdGlvbiB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wc1xuICAgIGNvbnN0IHsgc3VidGl0bGVzLCBuYXJyYXRpb25VcmxzIH0gPSBhd2FpdCBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgICAgIFtzY2VuZV0sXG4gICAgICB1c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZygnc3VidGl0bGVzIGdlbmVyYXRlZDonLCBKU09OLnN0cmluZ2lmeShzdWJ0aXRsZXMsIG51bGwsIDIpKTtcblxuICAgIGNvbnN0IGFzc0NvbnRlbnRBcnJheTogQVNTQ29udGVudFJlc3VsdFtdID0gYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZXMoXG4gICAgICBbc2NlbmVdLFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc3VidGl0bGVzLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coJ2Fzc0NvbnRlbnRBcnJheTonLCBhc3NDb250ZW50QXJyYXkpO1xuXG4gICAgY29uc3QgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG4gICAgY29uc29sZS5sb2coJ21hbmlmZXN0SHlkcmF0ZWQ6JywgbWFuaWZlc3RIeWRyYXRlZCk7XG5cbiAgICBjb25zdCBuZXdDdXJyZW50Q3JlZGl0cyA9IGF3YWl0IHVwZGF0ZUNyZWRpdEJhbGFuY2VCeVVzZXJJZChcbiAgICAgIHVzZXJJZCxcbiAgICAgIENSRURJVFNfQ09TVC5uZXdfYXVkaW9fc3VidGl0bGUsXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZygnbmV3IGNyZWRpdHMgYWZ0ZXIgZGVkdWN0aW9uOicsIG5ld0N1cnJlbnRDcmVkaXRzKTtcblxuICAgIC8vIHVwZGF0ZSBtYW5pZmVzdCB3aXRoIHN1YnRpdGxlIGNvbnRlbnQsIGFzcyBjb250ZW50IGFuZCBhdWRpbyB1cmxzXG4gICAgLy8gT25seSB1cGRhdGUgdGhlIHNwZWNpZmljIHNjZW5lIHRoYXQgd2FzIHJlZ2VuZXJhdGVkIChzY2VuZS5pZCBjb3JyZXNwb25kcyB0byBzY2VuZUluZGV4KVxuICAgIC8vIGNvbnN0IHVwZGF0ZWRTY2VuZXNXaXRoQXVkaW8gPSBtYW5pZmVzdEh5ZHJhdGVkIS5zY2VuZXMubWFwKFxuICAgIC8vICAgKG1hbmlmZXN0U2NlbmUpID0+IHtcbiAgICAvLyAgICAgLy8gT25seSB1cGRhdGUgdGhlIHNjZW5lIHRoYXQgbWF0Y2hlcyB0aGUgcmVnZW5lcmF0ZWQgc2NlbmVcbiAgICAvLyAgICAgaWYgKG1hbmlmZXN0U2NlbmUuc2NlbmVJbmRleCA9PT0gc2NlbmUuaWQpIHtcbiAgICAvLyAgICAgICBjb25zdCBuYXJyYXRpb25VcmxPYmogPSBuYXJyYXRpb25VcmxzWzBdOyAvLyBPbmx5IG9uZSBzY2VuZSB3YXMgcHJvY2Vzc2VkXG4gICAgLy8gICAgICAgY29uc3QgbmFycmF0aW9uVXJsID0gbmFycmF0aW9uVXJsT2JqXG4gICAgLy8gICAgICAgICA/IE9iamVjdC52YWx1ZXMobmFycmF0aW9uVXJsT2JqKVswXVxuICAgIC8vICAgICAgICAgOiBtYW5pZmVzdFNjZW5lLmZpbGVzLm1wMztcblxuICAgIC8vICAgICAgIC8vIEV4dHJhY3QgQVNTIGNvbnRlbnQgZnJvbSB0aGUgYXJyYXkgKGZpcnN0IGVsZW1lbnQgY29udGFpbnMgdGhlIEFTUyBjb250ZW50KVxuICAgIC8vICAgICAgIGNvbnN0IGFzc0NvbnRlbnQgPSBhc3NDb250ZW50QXJyYXlbMF1cbiAgICAvLyAgICAgICAgID8gT2JqZWN0LnZhbHVlcyhhc3NDb250ZW50QXJyYXlbMF0pWzBdXG4gICAgLy8gICAgICAgICA6ICcnO1xuXG4gICAgLy8gICAgICAgcmV0dXJuIHtcbiAgICAvLyAgICAgICAgIC4uLm1hbmlmZXN0U2NlbmUsXG4gICAgLy8gICAgICAgICBmaWxlczoge1xuICAgIC8vICAgICAgICAgICAuLi5tYW5pZmVzdFNjZW5lLmZpbGVzLFxuICAgIC8vICAgICAgICAgICBtcDM6IG5hcnJhdGlvblVybCxcbiAgICAvLyAgICAgICAgICAgYXNzOiBhc3NDb250ZW50LFxuICAgIC8vICAgICAgICAgICBzdWJ0aXRsZTogc3VidGl0bGVzWzBdLmZ1bGxUZXh0LCAvLyBPbmx5IG9uZSBzdWJ0aXRsZSB3YXMgZ2VuZXJhdGVkXG4gICAgLy8gICAgICAgICB9LFxuICAgIC8vICAgICAgIH07XG4gICAgLy8gICAgIH1cblxuICAgIC8vICAgICAvLyBSZXR1cm4gdW5jaGFuZ2VkIHNjZW5lIGZvciBhbGwgb3RoZXIgc2NlbmVzXG4gICAgLy8gICAgIHJldHVybiBtYW5pZmVzdFNjZW5lO1xuICAgIC8vICAgfSxcbiAgICAvLyApO1xuXG4gICAgLy8gLy8gdXBkYXRlIG1hbmlmZXN0SHlkcmF0ZWQgd2l0aCB1cGRhdGVkU2NlbmVzV2l0aEF1ZGlvXG4gICAgLy8gbWFuaWZlc3RIeWRyYXRlZCEuc2NlbmVzID0gdXBkYXRlZFNjZW5lc1dpdGhBdWRpbztcbiAgICAvLyBjb25zb2xlLmxvZygnbWFuaWZlc3RIeWRyYXRlZDonLCBKU09OLnN0cmluZ2lmeShtYW5pZmVzdEh5ZHJhdGVkLCBudWxsLCAyKSk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcygnY3JlZGl0X3VwZGF0ZWQnLCB1c2VySWQsIHRpbWVzdGFtcCwge1xuICAgICAgY3VycmVudENyZWRpdHMsXG4gICAgfSk7XG5cbiAgICAvLyBSZXR1cm4gc3VjY2VzcyByZXNwb25zZVxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkLFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gYXVkaW8tc3VidGl0bGUgZ2VuZXJhdGlvbjonLCBlcnJvcik7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvciBvY2N1cnJlZCcsXG4gICAgICB9KSxcbiAgICB9O1xuICB9XG59O1xuIl19