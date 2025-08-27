"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const audio_1 = require("../video-generation/audio");
const subtitles_1 = require("../video-generation/subtitles");
const video_generation_1 = require("../video-generation");
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
        const subtitleContent = await (0, subtitles_1.generateSubtitleContent)(scenes, userId, timestamp, subtitles);
        console.log('📝 Subtitle content generated:', subtitleContent);
        console.log('🎤 Narration URLs generated:', narrationUrls);
        await (0, video_generation_1.broadcastProgress)('audio_subtitle_created', userId, timestamp, {
            subtitles: subtitles.map((subtitle) => ({
                [`${timestamp}.scene-${subtitle.sceneIndex}.subtitle`]: {
                    text: subtitle.fullText,
                },
            })),
            subtitleContent,
            narrationUrls,
        }, 'Audio and Subtitles completed');
        // Return success response
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Audio and subtitles generated successfully',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSxxREFBOEQ7QUFDOUQsNkRBQXdFO0FBR3hFLDBEQUF3RDtBQVNqRCxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQzFCLEtBQTJCLEVBQ0ssRUFBRTtJQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLDBDQUEwQyxDQUFDLENBQUM7SUFFeEQsSUFBSSxDQUFDO1FBQ0gscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxDQUFDO2FBQzVELENBQUM7UUFDSixDQUFDO1FBRUQsTUFBTSxXQUFXLEdBQWdCLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3hELE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxvQkFBb0IsRUFBRSxHQUFHLFdBQVcsQ0FBQztRQUV4RSwyQkFBMkI7UUFDM0IsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUM3RCxPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO29CQUNuQixLQUFLLEVBQUUsZ0RBQWdEO2lCQUN4RCxDQUFDO2FBQ0gsQ0FBQztRQUNKLENBQUM7UUFFRCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDWixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLG9CQUFvQixFQUFFLENBQUM7YUFDdEQsQ0FBQztRQUNKLENBQUM7UUFFRCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDZixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUM7YUFDekQsQ0FBQztRQUNKLENBQUM7UUFFRCxPQUFPLENBQUMsR0FBRyxDQUNULGlCQUFpQixNQUFNLENBQUMsTUFBTSxvQkFBb0IsTUFBTSxlQUFlLFNBQVMsRUFBRSxFQUNsRixNQUFNLENBQ1AsQ0FBQztRQUVGLDhEQUE4RDtRQUM5RCxNQUFNLEVBQUUsU0FBUyxFQUFFLGFBQWEsRUFBRSxHQUFHLE1BQU0sSUFBQSx5QkFBaUIsRUFDMUQsTUFBTSxFQUNOLE1BQU0sRUFDTixTQUFTLEVBQ1Qsb0JBQW9CLENBQ3JCLENBQUM7UUFFRixNQUFNLGVBQWUsR0FBRyxNQUFNLElBQUEsbUNBQXVCLEVBQ25ELE1BQU0sRUFDTixNQUFNLEVBQ04sU0FBUyxFQUNULFNBQVMsQ0FDVixDQUFDO1FBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQ0FBZ0MsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUMvRCxPQUFPLENBQUMsR0FBRyxDQUFDLDhCQUE4QixFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBRTNELE1BQU0sSUFBQSxvQ0FBaUIsRUFDckIsd0JBQXdCLEVBQ3hCLE1BQU0sRUFDTixTQUFTLEVBQ1Q7WUFDRSxTQUFTLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDdEMsQ0FBQyxHQUFHLFNBQVMsVUFBVSxRQUFRLENBQUMsVUFBVSxXQUFXLENBQUMsRUFBRTtvQkFDdEQsSUFBSSxFQUFFLFFBQVEsQ0FBQyxRQUFRO2lCQUN4QjthQUNGLENBQUMsQ0FBQztZQUNILGVBQWU7WUFDZixhQUFhO1NBQ2QsRUFDRCwrQkFBK0IsQ0FDaEMsQ0FBQztRQUVGLDBCQUEwQjtRQUMxQixPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsT0FBTyxFQUFFLDRDQUE0QzthQUN0RCxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyx1Q0FBdUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUU5RCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsS0FBSyxFQUFFLHVCQUF1QjtnQkFDOUIsT0FBTyxFQUNMLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLHdCQUF3QjthQUNwRSxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUFuR1csUUFBQSxPQUFPLFdBbUdsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcblxuaW1wb3J0IHsgZ2VuZXJhdGVOYXJyYXRpb24gfSBmcm9tICcuLi92aWRlby1nZW5lcmF0aW9uL2F1ZGlvJztcbmltcG9ydCB7IGdlbmVyYXRlU3VidGl0bGVDb250ZW50IH0gZnJvbSAnLi4vdmlkZW8tZ2VuZXJhdGlvbi9zdWJ0aXRsZXMnO1xuaW1wb3J0IHsgU2NlbmUgfSBmcm9tICcuLi92aWRlby1nZW5lcmF0aW9uL3NjcmlwdCc7XG5pbXBvcnQgeyBicm9hZGNhc3RNZXNzYWdlIH0gZnJvbSAnLi4vd2Vic29ja2V0LWJyb2FkY2FzdCc7XG5pbXBvcnQgeyBicm9hZGNhc3RQcm9ncmVzcyB9IGZyb20gJy4uL3ZpZGVvLWdlbmVyYXRpb24nO1xuXG5pbnRlcmZhY2UgUmVxdWVzdEJvZHkge1xuICBzY2VuZXM6IFNjZW5lW107XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygn8J+OpCBBdWRpby1TdWJ0aXRsZSBMYW1iZGEgaGFuZGxlciBzdGFydGVkJyk7XG5cbiAgdHJ5IHtcbiAgICAvLyBQYXJzZSByZXF1ZXN0IGJvZHlcbiAgICBpZiAoIWV2ZW50LmJvZHkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1JlcXVlc3QgYm9keSBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHJlcXVlc3RCb2R5OiBSZXF1ZXN0Qm9keSA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSk7XG4gICAgY29uc3QgeyBzY2VuZXMsIHVzZXJJZCwgdGltZXN0YW1wLCB2b2ljZVRvbmVJbnN0cnVjdGlvbiB9ID0gcmVxdWVzdEJvZHk7XG5cbiAgICAvLyBWYWxpZGF0ZSByZXF1aXJlZCBmaWVsZHNcbiAgICBpZiAoIXNjZW5lcyB8fCAhQXJyYXkuaXNBcnJheShzY2VuZXMpIHx8IHNjZW5lcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGVycm9yOiAnU2NlbmVzIGFycmF5IGlzIHJlcXVpcmVkIGFuZCBtdXN0IG5vdCBiZSBlbXB0eScsXG4gICAgICAgIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAndXNlcklkIGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCF0aW1lc3RhbXApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ3RpbWVzdGFtcCBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYPCfjqQgUHJvY2Vzc2luZyAke3NjZW5lcy5sZW5ndGh9IHNjZW5lcyBmb3IgdXNlciAke3VzZXJJZH0sIHRpbWVzdGFtcCAke3RpbWVzdGFtcH1gLFxuICAgICAgc2NlbmVzLFxuICAgICk7XG5cbiAgICAvLyBTdGVwIDM6IEdlbmVyYXRlIGF1ZGlvIG5hcnJhdGlvbiB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wc1xuICAgIGNvbnN0IHsgc3VidGl0bGVzLCBuYXJyYXRpb25VcmxzIH0gPSBhd2FpdCBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgICAgIHNjZW5lcyxcbiAgICAgIHVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uLFxuICAgICk7XG5cbiAgICBjb25zdCBzdWJ0aXRsZUNvbnRlbnQgPSBhd2FpdCBnZW5lcmF0ZVN1YnRpdGxlQ29udGVudChcbiAgICAgIHNjZW5lcyxcbiAgICAgIHVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHN1YnRpdGxlcyxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/Cfk50gU3VidGl0bGUgY29udGVudCBnZW5lcmF0ZWQ6Jywgc3VidGl0bGVDb250ZW50KTtcbiAgICBjb25zb2xlLmxvZygn8J+OpCBOYXJyYXRpb24gVVJMcyBnZW5lcmF0ZWQ6JywgbmFycmF0aW9uVXJscyk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICdhdWRpb19zdWJ0aXRsZV9jcmVhdGVkJyxcbiAgICAgIHVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHtcbiAgICAgICAgc3VidGl0bGVzOiBzdWJ0aXRsZXMubWFwKChzdWJ0aXRsZSkgPT4gKHtcbiAgICAgICAgICBbYCR7dGltZXN0YW1wfS5zY2VuZS0ke3N1YnRpdGxlLnNjZW5lSW5kZXh9LnN1YnRpdGxlYF06IHtcbiAgICAgICAgICAgIHRleHQ6IHN1YnRpdGxlLmZ1bGxUZXh0LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pKSxcbiAgICAgICAgc3VidGl0bGVDb250ZW50LFxuICAgICAgICBuYXJyYXRpb25VcmxzLFxuICAgICAgfSxcbiAgICAgICdBdWRpbyBhbmQgU3VidGl0bGVzIGNvbXBsZXRlZCcsXG4gICAgKTtcblxuICAgIC8vIFJldHVybiBzdWNjZXNzIHJlc3BvbnNlXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgbWVzc2FnZTogJ0F1ZGlvIGFuZCBzdWJ0aXRsZXMgZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICB9KSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBhdWRpby1zdWJ0aXRsZSBnZW5lcmF0aW9uOicsIGVycm9yKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyxcbiAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yIG9jY3VycmVkJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=