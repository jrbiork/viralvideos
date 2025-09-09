"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const audio_1 = require("../utils/audio");
const subtitles_1 = require("../utils/subtitles");
const broadcastProgress_1 = require("../utils/broadcastProgress");
const credits_1 = require("../utils/credits");
const manifestUtils_1 = require("../utils/manifestUtils");
const credits_2 = require("../utils/credits");
// Constants
const DEFAULT_LANGUAGE = 'en';
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
        const language = requestBody.language || DEFAULT_LANGUAGE;
        const broadcast = requestBody.broadcastProgress;
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
        const manifest = await (0, manifestUtils_1.getManifest)(userId, timestamp);
        console.log('manifest:', JSON.stringify(manifest, null, 2));
        if (!manifest) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Manifest not found' }),
            };
        }
        // Step 3: Generate audio narration with word-level timestamps
        const { subtitles } = await (0, audio_1.generateNarration)([scene], userId, timestamp, 'Speak in a cheerful and positive tone', voice, language);
        console.log('subtitles generated:', JSON.stringify(subtitles, null, 2));
        const assContentArray = await (0, subtitles_1.generateSubtitles)([scene], userId, timestamp, subtitles);
        console.log('assContentArray:', assContentArray);
        const manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
        console.log('manifestHydrated:', manifestHydrated);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSwwQ0FBbUQ7QUFDbkQsa0RBQXlFO0FBR3pFLGtFQUErRDtBQUMvRCw4Q0FBZ0Q7QUFFaEQsMERBQXNFO0FBQ3RFLDhDQUcwQjtBQUUxQixZQUFZO0FBQ1osTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7QUFZdkIsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUMxQixLQUEyQixFQUNLLEVBQUU7SUFDbEMsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO0lBRXhELElBQUksQ0FBQztRQUNILHFCQUFxQjtRQUNyQixJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2hCLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsMEJBQTBCLEVBQUUsQ0FBQzthQUM1RCxDQUFDO1FBQ0osQ0FBQztRQUVELHlDQUF5QztRQUN6QyxNQUFNLE1BQU0sR0FBSSxLQUFLLENBQUMsY0FBc0IsQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNaLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLENBQUM7YUFDaEQsQ0FBQztRQUNKLENBQUM7UUFFRCxrQ0FBa0M7UUFDbEMsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLHFCQUFxQixFQUFFLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDN0QsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2YsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtB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RCxNQUFNLEVBQ04sc0JBQVksQ0FBQyxrQkFBa0IsQ0FDaEMsQ0FBQztRQUNGLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUUvRCxNQUFNLElBQUEscUNBQWlCLEVBQUMsZ0JBQWdCLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRTtZQUMzRCxjQUFjO1NBQ2YsQ0FBQyxDQUFDO1FBRUgsMEJBQTBCO1FBQzFCLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixRQUFRLEVBQUUsZ0JBQWdCO2FBQzNCLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLHVDQUF1QyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRTlELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixLQUFLLEVBQUUsdUJBQXVCO2dCQUM5QixPQUFPLEVBQ0wsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsd0JBQXdCO2FBQ3BFLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQXBJVyxRQUFBLE9BQU8sV0FvSWxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuXG5pbXBvcnQgeyBnZW5lcmF0ZU5hcnJhdGlvbiB9IGZyb20gJy4uL3V0aWxzL2F1ZGlvJztcbmltcG9ydCB7IGdlbmVyYXRlU3VidGl0bGVzLCBBU1NDb250ZW50UmVzdWx0IH0gZnJvbSAnLi4vdXRpbHMvc3VidGl0bGVzJztcbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi4vdXRpbHMvc2NyaXB0JztcblxuaW1wb3J0IHsgYnJvYWRjYXN0UHJvZ3Jlc3MgfSBmcm9tICcuLi91dGlscy9icm9hZGNhc3RQcm9ncmVzcyc7XG5pbXBvcnQgeyBDUkVESVRTX0NPU1QgfSBmcm9tICcuLi91dGlscy9jcmVkaXRzJztcblxuaW1wb3J0IHsgZ2V0TWFuaWZlc3QsIGh5ZHJhdGVNYW5pZmVzdCB9IGZyb20gJy4uL3V0aWxzL21hbmlmZXN0VXRpbHMnO1xuaW1wb3J0IHtcbiAgaGFzU3VmZmljaWVudENyZWRpdHNCeVVzZXJJZCxcbiAgdXBkYXRlQ3JlZGl0QmFsYW5jZUJ5VXNlcklkLFxufSBmcm9tICcuLi91dGlscy9jcmVkaXRzJztcblxuLy8gQ29uc3RhbnRzXG5jb25zdCBERUZBVUxUX0xBTkdVQUdFID0gJ2VuJztcblxuaW50ZXJmYWNlIFJlcXVlc3RCb2R5IHtcbiAgc2NlbmU6IFNjZW5lO1xuICB1c2VySWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG4gIGxhbmd1YWdlPzogc3RyaW5nO1xuICB2b2ljZVRvbmVJbnN0cnVjdGlvbj86IHN0cmluZztcbiAgdm9pY2U/OiBzdHJpbmc7XG4gIGJyb2FkY2FzdFByb2dyZXNzPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoXG4gIGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCxcbik6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIGNvbnNvbGUubG9nKCfwn46kIEF1ZGlvLVN1YnRpdGxlIExhbWJkYSBoYW5kbGVyIHN0YXJ0ZWQnKTtcblxuICB0cnkge1xuICAgIC8vIFBhcnNlIHJlcXVlc3QgYm9keVxuICAgIGlmICghZXZlbnQuYm9keSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUmVxdWVzdCBib2R5IGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gZ2V0IHVzZXJJZCBmcm9tIHRoZSBhdXRob3JpemVyIGNvbnRleHRcbiAgICBjb25zdCB1c2VySWQgPSAoZXZlbnQucmVxdWVzdENvbnRleHQgYXMgYW55KS5hdXRob3JpemVyPy5wcmluY2lwYWxJZDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAxLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnVW5hdXRob3JpemVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gZ2V0IHRpbWVzdGFtcCBmcm9tIHF1ZXJ5IHN0cmluZ1xuICAgIGNvbnN0IHRpbWVzdGFtcCA9IGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycz8uWyd0aW1lc3RhbXAnXTtcbiAgICBpZiAoIXRpbWVzdGFtcCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnVGltZXN0YW1wIGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gZ2V0IG9uZSBzY2VuZSBvYmplY3QgZnJvbSBib2R5XG4gICAgY29uc3QgcmVxdWVzdEJvZHkgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkpIGFzIFJlcXVlc3RCb2R5O1xuICAgIGNvbnN0IHNjZW5lID0gcmVxdWVzdEJvZHkuc2NlbmU7XG4gICAgY29uc3Qgdm9pY2UgPSByZXF1ZXN0Qm9keS52b2ljZSB8fCAnYWxsb3knO1xuICAgIGNvbnN0IGxhbmd1YWdlID0gcmVxdWVzdEJvZHkubGFuZ3VhZ2UgfHwgREVGQVVMVF9MQU5HVUFHRTtcbiAgICBjb25zdCBicm9hZGNhc3QgPSByZXF1ZXN0Qm9keS5icm9hZGNhc3RQcm9ncmVzcztcblxuICAgIGlmICghc2NlbmUpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGVycm9yOiAnU2NlbmVzIGFycmF5IGlzIHJlcXVpcmVkIGFuZCBtdXN0IG5vdCBiZSBlbXB0eScsXG4gICAgICAgIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCB7IGhhc1N1ZmZpY2llbnRDcmVkaXRzLCBjdXJyZW50Q3JlZGl0cyB9ID1cbiAgICAgIGF3YWl0IGhhc1N1ZmZpY2llbnRDcmVkaXRzQnlVc2VySWQoXG4gICAgICAgIHVzZXJJZCxcbiAgICAgICAgQ1JFRElUU19DT1NULm5ld19hdWRpb19zdWJ0aXRsZSxcbiAgICAgICk7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICdoYXNDcmVkaXRzIC8gY3VycmVudCBjcmVkaXRzOicsXG4gICAgICBoYXNTdWZmaWNpZW50Q3JlZGl0cyxcbiAgICAgIGN1cnJlbnRDcmVkaXRzLFxuICAgICk7XG4gICAgaWYgKCFoYXNTdWZmaWNpZW50Q3JlZGl0cykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW5zdWZmaWNpZW50IGNyZWRpdHMnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZygnZ2V0dGluZyBtYW5pZmVzdCcpO1xuICAgIGNvbnNvbGUubG9nKCd1c2VySWQ6JywgdXNlcklkKTtcbiAgICBjb25zb2xlLmxvZygndGltZXN0YW1wOicsIHRpbWVzdGFtcCk7XG5cbiAgICBjb25zdCBtYW5pZmVzdCA9IGF3YWl0IGdldE1hbmlmZXN0KHVzZXJJZCwgdGltZXN0YW1wKTtcblxuICAgIGNvbnNvbGUubG9nKCdtYW5pZmVzdDonLCBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCwgbnVsbCwgMikpO1xuXG4gICAgaWYgKCFtYW5pZmVzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDA0LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWFuaWZlc3Qgbm90IGZvdW5kJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gU3RlcCAzOiBHZW5lcmF0ZSBhdWRpbyBuYXJyYXRpb24gd2l0aCB3b3JkLWxldmVsIHRpbWVzdGFtcHNcbiAgICBjb25zdCB7IHN1YnRpdGxlcyB9ID0gYXdhaXQgZ2VuZXJhdGVOYXJyYXRpb24oXG4gICAgICBbc2NlbmVdLFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgJ1NwZWFrIGluIGEgY2hlZXJmdWwgYW5kIHBvc2l0aXZlIHRvbmUnLFxuICAgICAgdm9pY2UsXG4gICAgICBsYW5ndWFnZSxcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKCdzdWJ0aXRsZXMgZ2VuZXJhdGVkOicsIEpTT04uc3RyaW5naWZ5KHN1YnRpdGxlcywgbnVsbCwgMikpO1xuXG4gICAgY29uc3QgYXNzQ29udGVudEFycmF5OiBBU1NDb250ZW50UmVzdWx0W10gPSBhd2FpdCBnZW5lcmF0ZVN1YnRpdGxlcyhcbiAgICAgIFtzY2VuZV0sXG4gICAgICB1c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBzdWJ0aXRsZXMsXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZygnYXNzQ29udGVudEFycmF5OicsIGFzc0NvbnRlbnRBcnJheSk7XG5cbiAgICBjb25zdCBtYW5pZmVzdEh5ZHJhdGVkID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcbiAgICBjb25zb2xlLmxvZygnbWFuaWZlc3RIeWRyYXRlZDonLCBtYW5pZmVzdEh5ZHJhdGVkKTtcblxuICAgIGNvbnN0IG5ld0N1cnJlbnRDcmVkaXRzID0gYXdhaXQgdXBkYXRlQ3JlZGl0QmFsYW5jZUJ5VXNlcklkKFxuICAgICAgdXNlcklkLFxuICAgICAgQ1JFRElUU19DT1NULm5ld19hdWRpb19zdWJ0aXRsZSxcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKCduZXcgY3JlZGl0cyBhZnRlciBkZWR1Y3Rpb246JywgbmV3Q3VycmVudENyZWRpdHMpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoJ2NyZWRpdF91cGRhdGVkJywgdXNlcklkLCB0aW1lc3RhbXAsIHtcbiAgICAgIGN1cnJlbnRDcmVkaXRzLFxuICAgIH0pO1xuXG4gICAgLy8gUmV0dXJuIHN1Y2Nlc3MgcmVzcG9uc2VcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGF1ZGlvLXN1YnRpdGxlIGdlbmVyYXRpb246JywgZXJyb3IpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InLFxuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3Igb2NjdXJyZWQnLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxufTtcbiJdfQ==