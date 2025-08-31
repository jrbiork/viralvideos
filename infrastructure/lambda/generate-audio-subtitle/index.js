"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const audio_1 = require("../utils/audio");
const subtitles_1 = require("../utils/subtitles");
const manifestUtils_1 = require("../video-generation/util/manifestUtils");
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
        const manifest = await (0, manifestUtils_1.getManifest)(userId, timestamp);
        if (!manifest) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Manifest not found' }),
            };
        }
        const manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
        console.log('manifestHydrated:', manifestHydrated);
        // Step 3: Generate audio narration with word-level timestamps
        const { subtitles, narrationUrls } = await (0, audio_1.generateNarration)([scene], userId, timestamp);
        console.log('subtitles generated:', JSON.stringify(subtitles, null, 2));
        const assContentArray = await (0, subtitles_1.generateSubtitles)([scene], userId, timestamp, subtitles);
        console.log('assContentArray:', assContentArray);
        // update manifest with subtitle content, ass content and audio urls
        // Only update the specific scene that was regenerated (scene.id corresponds to sceneIndex)
        const updatedScenesWithAudio = manifestHydrated.scenes.map((manifestScene) => {
            // Only update the scene that matches the regenerated scene
            if (manifestScene.sceneIndex === scene.id) {
                const narrationUrlObj = narrationUrls[0]; // Only one scene was processed
                const narrationUrl = narrationUrlObj
                    ? Object.values(narrationUrlObj)[0]
                    : manifestScene.files.mp3;
                // Extract ASS content from the array (first element contains the ASS content)
                const assContent = assContentArray[0]
                    ? Object.values(assContentArray[0])[0]
                    : '';
                return {
                    ...manifestScene,
                    files: {
                        ...manifestScene.files,
                        mp3: narrationUrl,
                        ass: assContent,
                        subtitle: subtitles[0].fullText, // Only one subtitle was generated
                    },
                };
            }
            // Return unchanged scene for all other scenes
            return manifestScene;
        });
        // update manifestHydrated with updatedScenesWithAudio
        manifestHydrated.scenes = updatedScenesWithAudio;
        console.log('manifestHydrated:', JSON.stringify(manifestHydrated, null, 2));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSwwQ0FBbUQ7QUFDbkQsa0RBQXlFO0FBS3pFLDBFQUlnRDtBQVV6QyxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQzFCLEtBQTJCLEVBQ0ssRUFBRTtJQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLDBDQUEwQyxDQUFDLENBQUM7SUFFeEQsSUFBSSxDQUFDO1FBQ0gscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxDQUFDO2FBQzVELENBQUM7UUFDSixDQUFDO1FBRUQseUNBQXlDO1FBQ3pDLE1BQU0sTUFBTSxHQUFJLEtBQUssQ0FBQyxjQUFzQixDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUM7UUFDckUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ1osT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQzthQUNoRCxDQUFDO1FBQ0osQ0FBQztRQUVELGtDQUFrQztRQUNsQyxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDZixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUM7YUFDekQsQ0FBQztRQUNKLENBQUM7UUFFRCxpQ0FBaUM7UUFDakMsTUFBTSxLQUFLLEdBQUcsSUFB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QWdCLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFNUUsMEJBQTBCO1FBQzFCLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixRQUFRLEVBQUUsZ0JBQWdCO2FBQzNCLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLHVDQUF1QyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRTlELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixLQUFLLEVBQUUsdUJBQXVCO2dCQUM5QixPQUFPLEVBQ0wsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsd0JBQXdCO2FBQ3BFLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQTdIVyxRQUFBLE9BQU8sV0E2SGxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuXG5pbXBvcnQgeyBnZW5lcmF0ZU5hcnJhdGlvbiB9IGZyb20gJy4uL3V0aWxzL2F1ZGlvJztcbmltcG9ydCB7IGdlbmVyYXRlU3VidGl0bGVzLCBBU1NDb250ZW50UmVzdWx0IH0gZnJvbSAnLi4vdXRpbHMvc3VidGl0bGVzJztcbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi4vdXRpbHMvc2NyaXB0JztcblxuaW1wb3J0IHsgYnJvYWRjYXN0UHJvZ3Jlc3MgfSBmcm9tICcuLi92aWRlby1nZW5lcmF0aW9uJztcblxuaW1wb3J0IHtcbiAgZ2V0TWFuaWZlc3QsXG4gIGh5ZHJhdGVNYW5pZmVzdCxcbiAgdXBkYXRlTWFuaWZlc3QsXG59IGZyb20gJy4uL3ZpZGVvLWdlbmVyYXRpb24vdXRpbC9tYW5pZmVzdFV0aWxzJztcbmltcG9ydCB7IHVwbG9hZEpzb25Ub1MzIH0gZnJvbSAnLi4vdmlkZW8tZ2VuZXJhdGlvbi91dGlsL3MzVXBsb2FkZXInO1xuXG5pbnRlcmZhY2UgUmVxdWVzdEJvZHkge1xuICBzY2VuZXM6IFNjZW5lW107XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygn8J+OpCBBdWRpby1TdWJ0aXRsZSBMYW1iZGEgaGFuZGxlciBzdGFydGVkJyk7XG5cbiAgdHJ5IHtcbiAgICAvLyBQYXJzZSByZXF1ZXN0IGJvZHlcbiAgICBpZiAoIWV2ZW50LmJvZHkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1JlcXVlc3QgYm9keSBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCB1c2VySWQgZnJvbSB0aGUgYXV0aG9yaXplciBjb250ZXh0XG4gICAgY29uc3QgdXNlcklkID0gKGV2ZW50LnJlcXVlc3RDb250ZXh0IGFzIGFueSkuYXV0aG9yaXplcj8ucHJpbmNpcGFsSWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1VuYXV0aG9yaXplZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCB0aW1lc3RhbXAgZnJvbSBxdWVyeSBzdHJpbmdcbiAgICBjb25zdCB0aW1lc3RhbXAgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LlsndGltZXN0YW1wJ107XG4gICAgaWYgKCF0aW1lc3RhbXApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1RpbWVzdGFtcCBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCBvbmUgc2NlbmUgb2JqZWN0IGZyb20gYm9keVxuICAgIGNvbnN0IHNjZW5lID0gSlNPTi5wYXJzZShldmVudC5ib2R5KS5zY2VuZSBhcyBTY2VuZTtcbiAgICBpZiAoIXNjZW5lKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ1NjZW5lcyBhcnJheSBpcyByZXF1aXJlZCBhbmQgbXVzdCBub3QgYmUgZW1wdHknLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdCh1c2VySWQsIHRpbWVzdGFtcCk7XG4gICAgaWYgKCFtYW5pZmVzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDA0LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWFuaWZlc3Qgbm90IGZvdW5kJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG4gICAgY29uc29sZS5sb2coJ21hbmlmZXN0SHlkcmF0ZWQ6JywgbWFuaWZlc3RIeWRyYXRlZCk7XG5cbiAgICAvLyBTdGVwIDM6IEdlbmVyYXRlIGF1ZGlvIG5hcnJhdGlvbiB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wc1xuICAgIGNvbnN0IHsgc3VidGl0bGVzLCBuYXJyYXRpb25VcmxzIH0gPSBhd2FpdCBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgICAgIFtzY2VuZV0sXG4gICAgICB1c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZygnc3VidGl0bGVzIGdlbmVyYXRlZDonLCBKU09OLnN0cmluZ2lmeShzdWJ0aXRsZXMsIG51bGwsIDIpKTtcblxuICAgIGNvbnN0IGFzc0NvbnRlbnRBcnJheTogQVNTQ29udGVudFJlc3VsdFtdID0gYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZXMoXG4gICAgICBbc2NlbmVdLFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc3VidGl0bGVzLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coJ2Fzc0NvbnRlbnRBcnJheTonLCBhc3NDb250ZW50QXJyYXkpO1xuXG4gICAgLy8gdXBkYXRlIG1hbmlmZXN0IHdpdGggc3VidGl0bGUgY29udGVudCwgYXNzIGNvbnRlbnQgYW5kIGF1ZGlvIHVybHNcbiAgICAvLyBPbmx5IHVwZGF0ZSB0aGUgc3BlY2lmaWMgc2NlbmUgdGhhdCB3YXMgcmVnZW5lcmF0ZWQgKHNjZW5lLmlkIGNvcnJlc3BvbmRzIHRvIHNjZW5lSW5kZXgpXG4gICAgY29uc3QgdXBkYXRlZFNjZW5lc1dpdGhBdWRpbyA9IG1hbmlmZXN0SHlkcmF0ZWQhLnNjZW5lcy5tYXAoXG4gICAgICAobWFuaWZlc3RTY2VuZSkgPT4ge1xuICAgICAgICAvLyBPbmx5IHVwZGF0ZSB0aGUgc2NlbmUgdGhhdCBtYXRjaGVzIHRoZSByZWdlbmVyYXRlZCBzY2VuZVxuICAgICAgICBpZiAobWFuaWZlc3RTY2VuZS5zY2VuZUluZGV4ID09PSBzY2VuZS5pZCkge1xuICAgICAgICAgIGNvbnN0IG5hcnJhdGlvblVybE9iaiA9IG5hcnJhdGlvblVybHNbMF07IC8vIE9ubHkgb25lIHNjZW5lIHdhcyBwcm9jZXNzZWRcbiAgICAgICAgICBjb25zdCBuYXJyYXRpb25VcmwgPSBuYXJyYXRpb25VcmxPYmpcbiAgICAgICAgICAgID8gT2JqZWN0LnZhbHVlcyhuYXJyYXRpb25VcmxPYmopWzBdXG4gICAgICAgICAgICA6IG1hbmlmZXN0U2NlbmUuZmlsZXMubXAzO1xuXG4gICAgICAgICAgLy8gRXh0cmFjdCBBU1MgY29udGVudCBmcm9tIHRoZSBhcnJheSAoZmlyc3QgZWxlbWVudCBjb250YWlucyB0aGUgQVNTIGNvbnRlbnQpXG4gICAgICAgICAgY29uc3QgYXNzQ29udGVudCA9IGFzc0NvbnRlbnRBcnJheVswXVxuICAgICAgICAgICAgPyBPYmplY3QudmFsdWVzKGFzc0NvbnRlbnRBcnJheVswXSlbMF1cbiAgICAgICAgICAgIDogJyc7XG5cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4ubWFuaWZlc3RTY2VuZSxcbiAgICAgICAgICAgIGZpbGVzOiB7XG4gICAgICAgICAgICAgIC4uLm1hbmlmZXN0U2NlbmUuZmlsZXMsXG4gICAgICAgICAgICAgIG1wMzogbmFycmF0aW9uVXJsLFxuICAgICAgICAgICAgICBhc3M6IGFzc0NvbnRlbnQsXG4gICAgICAgICAgICAgIHN1YnRpdGxlOiBzdWJ0aXRsZXNbMF0uZnVsbFRleHQsIC8vIE9ubHkgb25lIHN1YnRpdGxlIHdhcyBnZW5lcmF0ZWRcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJldHVybiB1bmNoYW5nZWQgc2NlbmUgZm9yIGFsbCBvdGhlciBzY2VuZXNcbiAgICAgICAgcmV0dXJuIG1hbmlmZXN0U2NlbmU7XG4gICAgICB9LFxuICAgICk7XG5cbiAgICAvLyB1cGRhdGUgbWFuaWZlc3RIeWRyYXRlZCB3aXRoIHVwZGF0ZWRTY2VuZXNXaXRoQXVkaW9cbiAgICBtYW5pZmVzdEh5ZHJhdGVkIS5zY2VuZXMgPSB1cGRhdGVkU2NlbmVzV2l0aEF1ZGlvO1xuICAgIGNvbnNvbGUubG9nKCdtYW5pZmVzdEh5ZHJhdGVkOicsIEpTT04uc3RyaW5naWZ5KG1hbmlmZXN0SHlkcmF0ZWQsIG51bGwsIDIpKTtcblxuICAgIC8vIFJldHVybiBzdWNjZXNzIHJlc3BvbnNlXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQsXG4gICAgICB9KSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBhdWRpby1zdWJ0aXRsZSBnZW5lcmF0aW9uOicsIGVycm9yKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyxcbiAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yIG9jY3VycmVkJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=