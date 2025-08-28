"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const audio_1 = require("../video-generation/audio");
const subtitles_1 = require("../video-generation/subtitles");
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
        const requestBody = JSON.parse(event.body);
        const { scenes, userId, timestamp, voiceToneInstruction } = requestBody;
        // Validate required fields
        if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Scenes array is required and must not be empty',
                }),
            };
        }
        if (!userId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'userId is required' }),
            };
        }
        if (!timestamp) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'timestamp is required' }),
            };
        }
        console.log(`🎤 Processing ${scenes.length} scenes for user ${userId}, timestamp ${timestamp}`, scenes);
        // Step 3: Generate audio narration with word-level timestamps
        const { subtitles, narrationUrls } = await (0, audio_1.generateNarration)(scenes, userId, timestamp, voiceToneInstruction);
        const subtitleUrls = await (0, subtitles_1.generateSubtitles)(scenes, userId, timestamp, subtitles);
        console.log('📝 Subtitle URLs generated:', subtitleUrls);
        console.log('🎤 Narration URLs generated:', narrationUrls);
        // Return success response
        return {
            statusCode: 200,
            body: JSON.stringify({
                subtitles: subtitles.map((subtitle) => ({
                    [`${timestamp}.scene-${subtitle.sceneIndex}.subtitle`]: {
                        text: subtitle.fullText,
                    },
                })),
                subtitleUrls,
                narrationUrls,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSxxREFBOEQ7QUFDOUQsNkRBQWtFO0FBWTNELE1BQU0sT0FBTyxHQUFHLEtBQUssRUFDMUIsS0FBMkIsRUFDSyxFQUFFO0lBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUV4RCxJQUFJLENBQUM7UUFDSCxxQkFBcUI7UUFDckIsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoQixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLDBCQUEwQixFQUFFLENBQUM7YUFDNUQsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLFdBQVcsR0FBZ0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDeEQsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLG9CQUFvQixFQUFFLEdBQUcsV0FBVyxDQUFDO1FBRXhFLDJCQUEyQjtRQUMzQixJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzdELE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7b0JBQ25CLEtBQUssRUFBRSxnREFBZ0Q7aUJBQ3hELENBQUM7YUFDSCxDQUFDO1FBQ0osQ0FBQztRQUVELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNaLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsb0JBQW9CLEVBQUUsQ0FBQzthQUN0RCxDQUFDO1FBQ0osQ0FBQztRQUVELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNmLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQzthQUN6RCxDQUFDO1FBQ0osQ0FBQztRQUVELE9BQU8sQ0FBQyxHQUFHLENBQ1QsaUJBQWlCLE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixNQUFNLGVBQWUsU0FBUyxFQUFFLEVBQ2xGLE1BQU0sQ0FDUCxDQUFDO1FBRUYsOERBQThEO1FBQzlELE1BQU0sRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFLEdBQUcsTUFBTSxJQUFBLHlCQUFpQixFQUMxRCxNQUFNLEVBQ04sTUFBTSxFQUNOLFNBQVMsRUFDVCxvQkFBb0IsQ0FDckIsQ0FBQztRQUVGLE1BQU0sWUFBWSxHQUFHLE1BQU0sSUFBQSw2QkFBaUIsRUFDMUMsTUFBTSxFQUNOLE1BQU0sRUFDTixTQUFTLEVBQ1QsU0FBUyxDQUNWLENBQUM7UUFFRixPQUFPLENBQUMsR0FBRyxDQUFDLDZCQUE2QixFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQ3pELE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFFM0QsMEJBQTBCO1FBQzFCLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixTQUFTLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDdEMsQ0FBQyxHQUFHLFNBQVMsVUFBVSxRQUFRLENBQUMsVUFBVSxXQUFXLENBQUMsRUFBRTt3QkFDdEQsSUFBSSxFQUFFLFFBQVEsQ0FBQyxRQUFRO3FCQUN4QjtpQkFDRixDQUFDLENBQUM7Z0JBQ0gsWUFBWTtnQkFDWixhQUFhO2FBQ2QsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsdUNBQXVDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFOUQsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQ25CLEtBQUssRUFBRSx1QkFBdUI7Z0JBQzlCLE9BQU8sRUFDTCxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyx3QkFBd0I7YUFDcEUsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBekZXLFFBQUEsT0FBTyxXQXlGbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5cbmltcG9ydCB7IGdlbmVyYXRlTmFycmF0aW9uIH0gZnJvbSAnLi4vdmlkZW8tZ2VuZXJhdGlvbi9hdWRpbyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVN1YnRpdGxlcyB9IGZyb20gJy4uL3ZpZGVvLWdlbmVyYXRpb24vc3VidGl0bGVzJztcbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi4vdmlkZW8tZ2VuZXJhdGlvbi9zY3JpcHQnO1xuXG5pbXBvcnQgeyBicm9hZGNhc3RQcm9ncmVzcyB9IGZyb20gJy4uL3ZpZGVvLWdlbmVyYXRpb24nO1xuXG5pbnRlcmZhY2UgUmVxdWVzdEJvZHkge1xuICBzY2VuZXM6IFNjZW5lW107XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygn8J+OpCBBdWRpby1TdWJ0aXRsZSBMYW1iZGEgaGFuZGxlciBzdGFydGVkJyk7XG5cbiAgdHJ5IHtcbiAgICAvLyBQYXJzZSByZXF1ZXN0IGJvZHlcbiAgICBpZiAoIWV2ZW50LmJvZHkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1JlcXVlc3QgYm9keSBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHJlcXVlc3RCb2R5OiBSZXF1ZXN0Qm9keSA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSk7XG4gICAgY29uc3QgeyBzY2VuZXMsIHVzZXJJZCwgdGltZXN0YW1wLCB2b2ljZVRvbmVJbnN0cnVjdGlvbiB9ID0gcmVxdWVzdEJvZHk7XG5cbiAgICAvLyBWYWxpZGF0ZSByZXF1aXJlZCBmaWVsZHNcbiAgICBpZiAoIXNjZW5lcyB8fCAhQXJyYXkuaXNBcnJheShzY2VuZXMpIHx8IHNjZW5lcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGVycm9yOiAnU2NlbmVzIGFycmF5IGlzIHJlcXVpcmVkIGFuZCBtdXN0IG5vdCBiZSBlbXB0eScsXG4gICAgICAgIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAndXNlcklkIGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCF0aW1lc3RhbXApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ3RpbWVzdGFtcCBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYPCfjqQgUHJvY2Vzc2luZyAke3NjZW5lcy5sZW5ndGh9IHNjZW5lcyBmb3IgdXNlciAke3VzZXJJZH0sIHRpbWVzdGFtcCAke3RpbWVzdGFtcH1gLFxuICAgICAgc2NlbmVzLFxuICAgICk7XG5cbiAgICAvLyBTdGVwIDM6IEdlbmVyYXRlIGF1ZGlvIG5hcnJhdGlvbiB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wc1xuICAgIGNvbnN0IHsgc3VidGl0bGVzLCBuYXJyYXRpb25VcmxzIH0gPSBhd2FpdCBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgICAgIHNjZW5lcyxcbiAgICAgIHVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uLFxuICAgICk7XG5cbiAgICBjb25zdCBzdWJ0aXRsZVVybHMgPSBhd2FpdCBnZW5lcmF0ZVN1YnRpdGxlcyhcbiAgICAgIHNjZW5lcyxcbiAgICAgIHVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHN1YnRpdGxlcyxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/Cfk50gU3VidGl0bGUgVVJMcyBnZW5lcmF0ZWQ6Jywgc3VidGl0bGVVcmxzKTtcbiAgICBjb25zb2xlLmxvZygn8J+OpCBOYXJyYXRpb24gVVJMcyBnZW5lcmF0ZWQ6JywgbmFycmF0aW9uVXJscyk7XG5cbiAgICAvLyBSZXR1cm4gc3VjY2VzcyByZXNwb25zZVxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHN1YnRpdGxlczogc3VidGl0bGVzLm1hcCgoc3VidGl0bGUpID0+ICh7XG4gICAgICAgICAgW2Ake3RpbWVzdGFtcH0uc2NlbmUtJHtzdWJ0aXRsZS5zY2VuZUluZGV4fS5zdWJ0aXRsZWBdOiB7XG4gICAgICAgICAgICB0ZXh0OiBzdWJ0aXRsZS5mdWxsVGV4dCxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSksXG4gICAgICAgIHN1YnRpdGxlVXJscyxcbiAgICAgICAgbmFycmF0aW9uVXJscyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGF1ZGlvLXN1YnRpdGxlIGdlbmVyYXRpb246JywgZXJyb3IpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InLFxuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3Igb2NjdXJyZWQnLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxufTtcbiJdfQ==