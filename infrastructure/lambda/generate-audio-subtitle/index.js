"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const audio_1 = require("../video-generation/audio");
const subtitles_1 = require("../video-generation/subtitles");
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
        // Step 3: Generate audio narration with word-level timestamps
        const { subtitles, narrationUrls } = await (0, audio_1.generateNarration)([scene], userId, timestamp);
        const assContent = await (0, subtitles_1.generateSubtitles)([scene], userId, timestamp, subtitles);
        // update manifest with subtitle content, ass content and audio urls
        const updatedScenesWithAudio = manifest.scenes.map((manifestScene) => {
            const narrationUrlObj = narrationUrls[manifestScene.sceneIndex];
            const narrationUrl = narrationUrlObj
                ? Object.values(narrationUrlObj)[0]
                : manifestScene.files.mp3;
            const assContentStr = typeof assContent === 'string' ? assContent : '';
            return {
                ...manifestScene,
                files: {
                    ...manifestScene.files,
                    mp3: narrationUrl,
                    ass: assContentStr,
                    subtitle: subtitles[manifestScene.sceneIndex].fullText,
                },
            };
        });
        const manifestUpdated = await (0, manifestUtils_1.updateManifest)(manifest, {
            scenes: updatedScenesWithAudio,
        });
        // Return success response
        return {
            statusCode: 200,
            body: JSON.stringify({
                manifest: manifestUpdated,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSxxREFBOEQ7QUFDOUQsNkRBQWtFO0FBSWxFLDBFQUdnRDtBQVN6QyxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQzFCLEtBQTJCLEVBQ0ssRUFBRTtJQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLDBDQUEwQyxDQUFDLENBQUM7SUFFeEQsSUFBSSxDQUFDO1FBQ0gscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxDQUFDO2FBQzVELENBQUM7UUFDSixDQUFDO1FBRUQseUNBQXlDO1FBQ3pDLE1BQU0sTUFBTSxHQUFJLEtBQUssQ0FBQyxjQUFzQixDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUM7UUFDckUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ1osT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQzthQUNoRCxDQUFDO1FBQ0osQ0FBQztRQUVELGtDQUFrQztRQUNsQyxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDZixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUM7YUFDekQsQ0FBQztRQUNKLENBQUM7UUFFRCxpQ0FBaUM7UUFDakMsTUFBTSxLQUFLLEdBQUcsSUFB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bnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuXG5pbXBvcnQgeyBnZW5lcmF0ZU5hcnJhdGlvbiB9IGZyb20gJy4uL3ZpZGVvLWdlbmVyYXRpb24vYXVkaW8nO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdWJ0aXRsZXMgfSBmcm9tICcuLi92aWRlby1nZW5lcmF0aW9uL3N1YnRpdGxlcyc7XG5pbXBvcnQgeyBTY2VuZSB9IGZyb20gJy4uL3ZpZGVvLWdlbmVyYXRpb24vc2NyaXB0JztcblxuaW1wb3J0IHsgYnJvYWRjYXN0UHJvZ3Jlc3MgfSBmcm9tICcuLi92aWRlby1nZW5lcmF0aW9uJztcbmltcG9ydCB7XG4gIGdldE1hbmlmZXN0LFxuICB1cGRhdGVNYW5pZmVzdCxcbn0gZnJvbSAnLi4vdmlkZW8tZ2VuZXJhdGlvbi91dGlsL21hbmlmZXN0VXRpbHMnO1xuXG5pbnRlcmZhY2UgUmVxdWVzdEJvZHkge1xuICBzY2VuZXM6IFNjZW5lW107XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygn8J+OpCBBdWRpby1TdWJ0aXRsZSBMYW1iZGEgaGFuZGxlciBzdGFydGVkJyk7XG5cbiAgdHJ5IHtcbiAgICAvLyBQYXJzZSByZXF1ZXN0IGJvZHlcbiAgICBpZiAoIWV2ZW50LmJvZHkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1JlcXVlc3QgYm9keSBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCB1c2VySWQgZnJvbSB0aGUgYXV0aG9yaXplciBjb250ZXh0XG4gICAgY29uc3QgdXNlcklkID0gKGV2ZW50LnJlcXVlc3RDb250ZXh0IGFzIGFueSkuYXV0aG9yaXplcj8ucHJpbmNpcGFsSWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1VuYXV0aG9yaXplZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCB0aW1lc3RhbXAgZnJvbSBxdWVyeSBzdHJpbmdcbiAgICBjb25zdCB0aW1lc3RhbXAgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LlsndGltZXN0YW1wJ107XG4gICAgaWYgKCF0aW1lc3RhbXApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1RpbWVzdGFtcCBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCBvbmUgc2NlbmUgb2JqZWN0IGZyb20gYm9keVxuICAgIGNvbnN0IHNjZW5lID0gSlNPTi5wYXJzZShldmVudC5ib2R5KS5zY2VuZSBhcyBTY2VuZTtcbiAgICBpZiAoIXNjZW5lKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ1NjZW5lcyBhcnJheSBpcyByZXF1aXJlZCBhbmQgbXVzdCBub3QgYmUgZW1wdHknLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdCh1c2VySWQsIHRpbWVzdGFtcCk7XG4gICAgaWYgKCFtYW5pZmVzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDA0LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWFuaWZlc3Qgbm90IGZvdW5kJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gU3RlcCAzOiBHZW5lcmF0ZSBhdWRpbyBuYXJyYXRpb24gd2l0aCB3b3JkLWxldmVsIHRpbWVzdGFtcHNcbiAgICBjb25zdCB7IHN1YnRpdGxlcywgbmFycmF0aW9uVXJscyB9ID0gYXdhaXQgZ2VuZXJhdGVOYXJyYXRpb24oXG4gICAgICBbc2NlbmVdLFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICk7XG5cbiAgICBjb25zdCBhc3NDb250ZW50ID0gYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZXMoXG4gICAgICBbc2NlbmVdLFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc3VidGl0bGVzLFxuICAgICk7XG5cbiAgICAvLyB1cGRhdGUgbWFuaWZlc3Qgd2l0aCBzdWJ0aXRsZSBjb250ZW50LCBhc3MgY29udGVudCBhbmQgYXVkaW8gdXJsc1xuICAgIGNvbnN0IHVwZGF0ZWRTY2VuZXNXaXRoQXVkaW8gPSBtYW5pZmVzdCEuc2NlbmVzLm1hcCgobWFuaWZlc3RTY2VuZSkgPT4ge1xuICAgICAgY29uc3QgbmFycmF0aW9uVXJsT2JqID0gbmFycmF0aW9uVXJsc1ttYW5pZmVzdFNjZW5lLnNjZW5lSW5kZXhdO1xuICAgICAgY29uc3QgbmFycmF0aW9uVXJsID0gbmFycmF0aW9uVXJsT2JqXG4gICAgICAgID8gT2JqZWN0LnZhbHVlcyhuYXJyYXRpb25VcmxPYmopWzBdXG4gICAgICAgIDogbWFuaWZlc3RTY2VuZS5maWxlcy5tcDM7XG5cbiAgICAgIGNvbnN0IGFzc0NvbnRlbnRTdHIgPSB0eXBlb2YgYXNzQ29udGVudCA9PT0gJ3N0cmluZycgPyBhc3NDb250ZW50IDogJyc7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIC4uLm1hbmlmZXN0U2NlbmUsXG4gICAgICAgIGZpbGVzOiB7XG4gICAgICAgICAgLi4ubWFuaWZlc3RTY2VuZS5maWxlcyxcbiAgICAgICAgICBtcDM6IG5hcnJhdGlvblVybCxcbiAgICAgICAgICBhc3M6IGFzc0NvbnRlbnRTdHIsXG4gICAgICAgICAgc3VidGl0bGU6IHN1YnRpdGxlc1ttYW5pZmVzdFNjZW5lLnNjZW5lSW5kZXhdLmZ1bGxUZXh0LFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICB9KTtcblxuICAgIGNvbnN0IG1hbmlmZXN0VXBkYXRlZCA9IGF3YWl0IHVwZGF0ZU1hbmlmZXN0KG1hbmlmZXN0ISwge1xuICAgICAgc2NlbmVzOiB1cGRhdGVkU2NlbmVzV2l0aEF1ZGlvLFxuICAgIH0pO1xuXG4gICAgLy8gUmV0dXJuIHN1Y2Nlc3MgcmVzcG9uc2VcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBtYW5pZmVzdDogbWFuaWZlc3RVcGRhdGVkLFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gYXVkaW8tc3VidGl0bGUgZ2VuZXJhdGlvbjonLCBlcnJvcik7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvciBvY2N1cnJlZCcsXG4gICAgICB9KSxcbiAgICB9O1xuICB9XG59O1xuIl19