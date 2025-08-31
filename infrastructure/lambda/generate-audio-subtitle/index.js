"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const audio_1 = require("../utils/audio");
const subtitles_1 = require("../utils/subtitles");
const video_generation_1 = require("../video-generation");
const manifestUtils_1 = require("../video-generation/util/manifestUtils");
const credits_1 = require("../utils/credits");
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
        const hasCredits = await (0, credits_1.hasSufficientCreditsByUserId)(userId, 1);
        console.log('hasCredits:', hasCredits);
        if (!hasCredits) {
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
        const currentCredits = await (0, credits_1.updateCreditBalanceByUserId)(userId, 1);
        console.log('currentCredits:', currentCredits);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSwwQ0FBbUQ7QUFDbkQsa0RBQXlFO0FBR3pFLDBEQUF3RDtBQUd4RCwwRUFJZ0Q7QUFFaEQsOENBSTBCO0FBU25CLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFDMUIsS0FBMkIsRUFDSyxFQUFFO0lBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUV4RCxJQUFJLENBQUM7UUFDSCxxQkFBcUI7UUFDckIsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoQixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLDBCQUEwQixFQUFFLENBQUM7YUFDNUQsQ0FBQztRQUNKLENBQUM7UUFFRCx5Q0FBeUM7UUFDekMsTUFBTSxNQUFNLEdBQUksS0FBSyxDQUFDLGNBQXNCLENBQUMsVUFBVSxFQUFFLFdBQVcsQ0FBQztRQUNyRSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDWixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxDQUFDO2FBQ2hELENBQUM7UUFDSixDQUFDO1FBRUQsa0NBQWtDO1FBQ2xDLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzdELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNmLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQzthQUN6RCxDQUFDO1FBQ0osQ0FBQztRQUVELGlDQUFp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RUgsMEJBQTBCO1FBQzFCLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixRQUFRLEVBQUUsZ0JBQWdCO2FBQzNCLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLHVDQUF1QyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRTlELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixLQUFLLEVBQUUsdUJBQXVCO2dCQUM5QixPQUFPLEVBQ0wsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsd0JBQXdCO2FBQ3BFLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQTlJVyxRQUFBLE9BQU8sV0E4SWxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuXG5pbXBvcnQgeyBnZW5lcmF0ZU5hcnJhdGlvbiB9IGZyb20gJy4uL3V0aWxzL2F1ZGlvJztcbmltcG9ydCB7IGdlbmVyYXRlU3VidGl0bGVzLCBBU1NDb250ZW50UmVzdWx0IH0gZnJvbSAnLi4vdXRpbHMvc3VidGl0bGVzJztcbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi4vdXRpbHMvc2NyaXB0JztcblxuaW1wb3J0IHsgYnJvYWRjYXN0UHJvZ3Jlc3MgfSBmcm9tICcuLi92aWRlby1nZW5lcmF0aW9uJztcbmltcG9ydCB7IGJyb2FkY2FzdE1lc3NhZ2UgfSBmcm9tICcuLi93ZWJzb2NrZXQtYnJvYWRjYXN0JztcblxuaW1wb3J0IHtcbiAgZ2V0TWFuaWZlc3QsXG4gIGh5ZHJhdGVNYW5pZmVzdCxcbiAgdXBkYXRlTWFuaWZlc3QsXG59IGZyb20gJy4uL3ZpZGVvLWdlbmVyYXRpb24vdXRpbC9tYW5pZmVzdFV0aWxzJztcbmltcG9ydCB7IHVwbG9hZEpzb25Ub1MzIH0gZnJvbSAnLi4vdmlkZW8tZ2VuZXJhdGlvbi91dGlsL3MzVXBsb2FkZXInO1xuaW1wb3J0IHtcbiAgZ2V0Q3JlZGl0QmFsYW5jZUJ5VXNlcklkLFxuICBoYXNTdWZmaWNpZW50Q3JlZGl0c0J5VXNlcklkLFxuICB1cGRhdGVDcmVkaXRCYWxhbmNlQnlVc2VySWQsXG59IGZyb20gJy4uL3V0aWxzL2NyZWRpdHMnO1xuXG5pbnRlcmZhY2UgUmVxdWVzdEJvZHkge1xuICBzY2VuZXM6IFNjZW5lW107XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygn8J+OpCBBdWRpby1TdWJ0aXRsZSBMYW1iZGEgaGFuZGxlciBzdGFydGVkJyk7XG5cbiAgdHJ5IHtcbiAgICAvLyBQYXJzZSByZXF1ZXN0IGJvZHlcbiAgICBpZiAoIWV2ZW50LmJvZHkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1JlcXVlc3QgYm9keSBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCB1c2VySWQgZnJvbSB0aGUgYXV0aG9yaXplciBjb250ZXh0XG4gICAgY29uc3QgdXNlcklkID0gKGV2ZW50LnJlcXVlc3RDb250ZXh0IGFzIGFueSkuYXV0aG9yaXplcj8ucHJpbmNpcGFsSWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1VuYXV0aG9yaXplZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCB0aW1lc3RhbXAgZnJvbSBxdWVyeSBzdHJpbmdcbiAgICBjb25zdCB0aW1lc3RhbXAgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LlsndGltZXN0YW1wJ107XG4gICAgaWYgKCF0aW1lc3RhbXApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1RpbWVzdGFtcCBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCBvbmUgc2NlbmUgb2JqZWN0IGZyb20gYm9keVxuICAgIGNvbnN0IHNjZW5lID0gSlNPTi5wYXJzZShldmVudC5ib2R5KS5zY2VuZSBhcyBTY2VuZTtcbiAgICBpZiAoIXNjZW5lKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ1NjZW5lcyBhcnJheSBpcyByZXF1aXJlZCBhbmQgbXVzdCBub3QgYmUgZW1wdHknLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgaGFzQ3JlZGl0cyA9IGF3YWl0IGhhc1N1ZmZpY2llbnRDcmVkaXRzQnlVc2VySWQodXNlcklkLCAxKTtcbiAgICBjb25zb2xlLmxvZygnaGFzQ3JlZGl0czonLCBoYXNDcmVkaXRzKTtcbiAgICBpZiAoIWhhc0NyZWRpdHMpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0luc3VmZmljaWVudCBjcmVkaXRzJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdCh1c2VySWQsIHRpbWVzdGFtcCk7XG5cbiAgICBpZiAoIW1hbmlmZXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDQsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNYW5pZmVzdCBub3QgZm91bmQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBTdGVwIDM6IEdlbmVyYXRlIGF1ZGlvIG5hcnJhdGlvbiB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wc1xuICAgIGNvbnN0IHsgc3VidGl0bGVzLCBuYXJyYXRpb25VcmxzIH0gPSBhd2FpdCBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgICAgIFtzY2VuZV0sXG4gICAgICB1c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZygnc3VidGl0bGVzIGdlbmVyYXRlZDonLCBKU09OLnN0cmluZ2lmeShzdWJ0aXRsZXMsIG51bGwsIDIpKTtcblxuICAgIGNvbnN0IGFzc0NvbnRlbnRBcnJheTogQVNTQ29udGVudFJlc3VsdFtdID0gYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZXMoXG4gICAgICBbc2NlbmVdLFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc3VidGl0bGVzLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coJ2Fzc0NvbnRlbnRBcnJheTonLCBhc3NDb250ZW50QXJyYXkpO1xuXG4gICAgY29uc3QgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG4gICAgY29uc29sZS5sb2coJ21hbmlmZXN0SHlkcmF0ZWQ6JywgbWFuaWZlc3RIeWRyYXRlZCk7XG5cbiAgICBjb25zdCBjdXJyZW50Q3JlZGl0cyA9IGF3YWl0IHVwZGF0ZUNyZWRpdEJhbGFuY2VCeVVzZXJJZCh1c2VySWQsIDEpO1xuICAgIGNvbnNvbGUubG9nKCdjdXJyZW50Q3JlZGl0czonLCBjdXJyZW50Q3JlZGl0cyk7XG5cbiAgICAvLyB1cGRhdGUgbWFuaWZlc3Qgd2l0aCBzdWJ0aXRsZSBjb250ZW50LCBhc3MgY29udGVudCBhbmQgYXVkaW8gdXJsc1xuICAgIC8vIE9ubHkgdXBkYXRlIHRoZSBzcGVjaWZpYyBzY2VuZSB0aGF0IHdhcyByZWdlbmVyYXRlZCAoc2NlbmUuaWQgY29ycmVzcG9uZHMgdG8gc2NlbmVJbmRleClcbiAgICAvLyBjb25zdCB1cGRhdGVkU2NlbmVzV2l0aEF1ZGlvID0gbWFuaWZlc3RIeWRyYXRlZCEuc2NlbmVzLm1hcChcbiAgICAvLyAgIChtYW5pZmVzdFNjZW5lKSA9PiB7XG4gICAgLy8gICAgIC8vIE9ubHkgdXBkYXRlIHRoZSBzY2VuZSB0aGF0IG1hdGNoZXMgdGhlIHJlZ2VuZXJhdGVkIHNjZW5lXG4gICAgLy8gICAgIGlmIChtYW5pZmVzdFNjZW5lLnNjZW5lSW5kZXggPT09IHNjZW5lLmlkKSB7XG4gICAgLy8gICAgICAgY29uc3QgbmFycmF0aW9uVXJsT2JqID0gbmFycmF0aW9uVXJsc1swXTsgLy8gT25seSBvbmUgc2NlbmUgd2FzIHByb2Nlc3NlZFxuICAgIC8vICAgICAgIGNvbnN0IG5hcnJhdGlvblVybCA9IG5hcnJhdGlvblVybE9ialxuICAgIC8vICAgICAgICAgPyBPYmplY3QudmFsdWVzKG5hcnJhdGlvblVybE9iailbMF1cbiAgICAvLyAgICAgICAgIDogbWFuaWZlc3RTY2VuZS5maWxlcy5tcDM7XG5cbiAgICAvLyAgICAgICAvLyBFeHRyYWN0IEFTUyBjb250ZW50IGZyb20gdGhlIGFycmF5IChmaXJzdCBlbGVtZW50IGNvbnRhaW5zIHRoZSBBU1MgY29udGVudClcbiAgICAvLyAgICAgICBjb25zdCBhc3NDb250ZW50ID0gYXNzQ29udGVudEFycmF5WzBdXG4gICAgLy8gICAgICAgICA/IE9iamVjdC52YWx1ZXMoYXNzQ29udGVudEFycmF5WzBdKVswXVxuICAgIC8vICAgICAgICAgOiAnJztcblxuICAgIC8vICAgICAgIHJldHVybiB7XG4gICAgLy8gICAgICAgICAuLi5tYW5pZmVzdFNjZW5lLFxuICAgIC8vICAgICAgICAgZmlsZXM6IHtcbiAgICAvLyAgICAgICAgICAgLi4ubWFuaWZlc3RTY2VuZS5maWxlcyxcbiAgICAvLyAgICAgICAgICAgbXAzOiBuYXJyYXRpb25VcmwsXG4gICAgLy8gICAgICAgICAgIGFzczogYXNzQ29udGVudCxcbiAgICAvLyAgICAgICAgICAgc3VidGl0bGU6IHN1YnRpdGxlc1swXS5mdWxsVGV4dCwgLy8gT25seSBvbmUgc3VidGl0bGUgd2FzIGdlbmVyYXRlZFxuICAgIC8vICAgICAgICAgfSxcbiAgICAvLyAgICAgICB9O1xuICAgIC8vICAgICB9XG5cbiAgICAvLyAgICAgLy8gUmV0dXJuIHVuY2hhbmdlZCBzY2VuZSBmb3IgYWxsIG90aGVyIHNjZW5lc1xuICAgIC8vICAgICByZXR1cm4gbWFuaWZlc3RTY2VuZTtcbiAgICAvLyAgIH0sXG4gICAgLy8gKTtcblxuICAgIC8vIC8vIHVwZGF0ZSBtYW5pZmVzdEh5ZHJhdGVkIHdpdGggdXBkYXRlZFNjZW5lc1dpdGhBdWRpb1xuICAgIC8vIG1hbmlmZXN0SHlkcmF0ZWQhLnNjZW5lcyA9IHVwZGF0ZWRTY2VuZXNXaXRoQXVkaW87XG4gICAgLy8gY29uc29sZS5sb2coJ21hbmlmZXN0SHlkcmF0ZWQ6JywgSlNPTi5zdHJpbmdpZnkobWFuaWZlc3RIeWRyYXRlZCwgbnVsbCwgMikpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoJ2NyZWRpdF91cGRhdGVkJywgdXNlcklkLCB0aW1lc3RhbXAsIHtcbiAgICAgIGN1cnJlbnRDcmVkaXRzLFxuICAgIH0pO1xuXG4gICAgLy8gUmV0dXJuIHN1Y2Nlc3MgcmVzcG9uc2VcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGF1ZGlvLXN1YnRpdGxlIGdlbmVyYXRpb246JywgZXJyb3IpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InLFxuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3Igb2NjdXJyZWQnLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxufTtcbiJdfQ==