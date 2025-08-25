"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const audio_1 = require("../video-generation/audio");
const subtitles_1 = require("../video-generation/subtitles");
const websocket_broadcast_1 = require("../websocket-broadcast");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
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
        console.log(`🎤 Processing ${scenes.length} scenes for user ${userId}, timestamp ${timestamp}`);
        // Step 1: Generate narration with word-level timestamps
        console.log('🎤 Generating narration...');
        const { subtitles, narrationUrls } = await (0, audio_1.generateNarration)(scenes, userId, timestamp, voiceToneInstruction || 'Speak in a cheerful and positive tone');
        console.log('🎤 Narration generated successfully:', {
            subtitleCount: subtitles.length,
            narrationUrls,
        });
        // Step 2: Generate subtitles using the narration result
        console.log('📝 Generating subtitles...');
        let subtitleUrls = await (0, subtitles_1.generateSubtitles)(scenes, userId, timestamp, subtitles);
        console.log('📝 Subtitles generated successfully:', subtitleUrls);
        // Broadcast subtitle files completed event
        await broadcastSubtitleFilesCompleted(userId, timestamp, subtitleUrls);
        // Use the pre-generated signed URLs for each scene
        const results = [];
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            const audioKey = 'audio.mp3';
            const subtitleUrlObj = subtitleUrls[i];
            const narrationUrlObj = narrationUrls[i];
            // Extract the signed URLs from the objects
            const subtitleUrl = Object.values(subtitleUrlObj)[0];
            const audioUrl = Object.values(narrationUrlObj)[0];
            // Fetch ASS file content from the signed URL
            const assResponse = await fetch(subtitleUrl);
            const assFileContent = await assResponse.text();
            results.push({
                sceneId: scene.id,
                audioKey: audioKey.replace(`${userId}/`, ''),
                assKey: audioKey.replace(`${userId}/`, '').replace('.mp3', '.ass'),
                audioUrl,
                assFileContent,
            });
        }
        // Return success response
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'Audio and subtitles generated successfully',
                data: results,
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
// Helper function to broadcast subtitle files completed event
async function broadcastSubtitleFilesCompleted(userId, timestamp, subtitleUrls) {
    try {
        const subtitleMessage = {
            action: 'subtitle_files_completed',
            data: {
                userId,
                timestamp,
                subtitleFiles: subtitleUrls,
            },
        };
        const domainName = process.env.WEBSOCKET_DOMAIN_NAME;
        const stage = process.env.WEBSOCKET_STAGE || 'prod';
        if (domainName) {
            await (0, websocket_broadcast_1.broadcastMessage)(subtitleMessage, domainName, stage, userId);
            console.log(`📡 WebSocket subtitle files completed broadcast`);
        }
        else {
            console.log(`📡 WebSocket not configured, skipping subtitle broadcast`);
        }
    }
    catch (error) {
        console.error('Error broadcasting subtitle files completed:', error);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxrREFBZ0U7QUFFaEUscURBQThEO0FBQzlELDZEQUFrRTtBQUVsRSxnRUFBMEQ7QUFTMUQsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFcEUsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUMxQixLQUEyQixFQUNLLEVBQUU7SUFDbEMsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQ0FBMEMsQ0FBQyxDQUFDO0lBRXhELElBQUksQ0FBQztRQUNILHFCQUFxQjtRQUNyQixJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2hCLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsMEJBQTBCLEVBQUUsQ0FBQzthQUM1RCxDQUFDO1FBQ0osQ0FBQztRQUVELE1BQU0sV0FBVyxHQUFnQixJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN4RCxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsb0JBQW9CLEVBQUUsR0FBRyxXQUFXLENBQUM7UUFFeEUsMkJBQTJCO1FBQzNCLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDN0QsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDbkIsS0FBSyxFQUFFLGdEQUFnRDtpQkFDeEQsQ0FBQzthQUNILENBQUM7UUFD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R0FBRyxDQUFDLGlEQUFpRCxDQUFDLENBQUM7UUFDakUsQ0FBQzthQUFNLENBQUM7WUFDTixPQUFPLENBQUMsR0FBRyxDQUFDLDBEQUEwRCxDQUFDLENBQUM7UUFDMUUsQ0FBQztJQUNILENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw4Q0FBOEMsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN2RSxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IFMzQ2xpZW50LCBHZXRPYmplY3RDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcbmltcG9ydCB7IGdldFNpZ25lZFVybCB9IGZyb20gJ0Bhd3Mtc2RrL3MzLXJlcXVlc3QtcHJlc2lnbmVyJztcbmltcG9ydCB7IGdlbmVyYXRlTmFycmF0aW9uIH0gZnJvbSAnLi4vdmlkZW8tZ2VuZXJhdGlvbi9hdWRpbyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVN1YnRpdGxlcyB9IGZyb20gJy4uL3ZpZGVvLWdlbmVyYXRpb24vc3VidGl0bGVzJztcbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi4vdmlkZW8tZ2VuZXJhdGlvbi9zY3JpcHQnO1xuaW1wb3J0IHsgYnJvYWRjYXN0TWVzc2FnZSB9IGZyb20gJy4uL3dlYnNvY2tldC1icm9hZGNhc3QnO1xuXG5pbnRlcmZhY2UgUmVxdWVzdEJvZHkge1xuICBzY2VuZXM6IFNjZW5lW107XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24/OiBzdHJpbmc7XG59XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChcbiAgZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50LFxuKTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgY29uc29sZS5sb2coJ/CfjqQgQXVkaW8tU3VidGl0bGUgTGFtYmRhIGhhbmRsZXIgc3RhcnRlZCcpO1xuXG4gIHRyeSB7XG4gICAgLy8gUGFyc2UgcmVxdWVzdCBib2R5XG4gICAgaWYgKCFldmVudC5ib2R5KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdSZXF1ZXN0IGJvZHkgaXMgcmVxdWlyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCByZXF1ZXN0Qm9keTogUmVxdWVzdEJvZHkgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkpO1xuICAgIGNvbnN0IHsgc2NlbmVzLCB1c2VySWQsIHRpbWVzdGFtcCwgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gfSA9IHJlcXVlc3RCb2R5O1xuXG4gICAgLy8gVmFsaWRhdGUgcmVxdWlyZWQgZmllbGRzXG4gICAgaWYgKCFzY2VuZXMgfHwgIUFycmF5LmlzQXJyYXkoc2NlbmVzKSB8fCBzY2VuZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ1NjZW5lcyBhcnJheSBpcyByZXF1aXJlZCBhbmQgbXVzdCBub3QgYmUgZW1wdHknLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ3VzZXJJZCBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGlmICghdGltZXN0YW1wKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICd0aW1lc3RhbXAgaXMgcmVxdWlyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGDwn46kIFByb2Nlc3NpbmcgJHtzY2VuZXMubGVuZ3RofSBzY2VuZXMgZm9yIHVzZXIgJHt1c2VySWR9LCB0aW1lc3RhbXAgJHt0aW1lc3RhbXB9YCxcbiAgICApO1xuXG4gICAgLy8gU3RlcCAxOiBHZW5lcmF0ZSBuYXJyYXRpb24gd2l0aCB3b3JkLWxldmVsIHRpbWVzdGFtcHNcbiAgICBjb25zb2xlLmxvZygn8J+OpCBHZW5lcmF0aW5nIG5hcnJhdGlvbi4uLicpO1xuICAgIGNvbnN0IHsgc3VidGl0bGVzLCBuYXJyYXRpb25VcmxzIH0gPSBhd2FpdCBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgICAgIHNjZW5lcyxcbiAgICAgIHVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uIHx8ICdTcGVhayBpbiBhIGNoZWVyZnVsIGFuZCBwb3NpdGl2ZSB0b25lJyxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/CfjqQgTmFycmF0aW9uIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHk6Jywge1xuICAgICAgc3VidGl0bGVDb3VudDogc3VidGl0bGVzLmxlbmd0aCxcbiAgICAgIG5hcnJhdGlvblVybHMsXG4gICAgfSk7XG5cbiAgICAvLyBTdGVwIDI6IEdlbmVyYXRlIHN1YnRpdGxlcyB1c2luZyB0aGUgbmFycmF0aW9uIHJlc3VsdFxuICAgIGNvbnNvbGUubG9nKCfwn5OdIEdlbmVyYXRpbmcgc3VidGl0bGVzLi4uJyk7XG4gICAgbGV0IHN1YnRpdGxlVXJscyA9IGF3YWl0IGdlbmVyYXRlU3VidGl0bGVzKFxuICAgICAgc2NlbmVzLFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc3VidGl0bGVzLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+TnSBTdWJ0aXRsZXMgZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseTonLCBzdWJ0aXRsZVVybHMpO1xuXG4gICAgLy8gQnJvYWRjYXN0IHN1YnRpdGxlIGZpbGVzIGNvbXBsZXRlZCBldmVudFxuICAgIGF3YWl0IGJyb2FkY2FzdFN1YnRpdGxlRmlsZXNDb21wbGV0ZWQodXNlcklkLCB0aW1lc3RhbXAsIHN1YnRpdGxlVXJscyk7XG5cbiAgICAvLyBVc2UgdGhlIHByZS1nZW5lcmF0ZWQgc2lnbmVkIFVSTHMgZm9yIGVhY2ggc2NlbmVcbiAgICBjb25zdCByZXN1bHRzID0gW107XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzY2VuZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHNjZW5lID0gc2NlbmVzW2ldO1xuICAgICAgY29uc3QgYXVkaW9LZXkgPSAnYXVkaW8ubXAzJztcbiAgICAgIGNvbnN0IHN1YnRpdGxlVXJsT2JqID0gc3VidGl0bGVVcmxzW2ldO1xuICAgICAgY29uc3QgbmFycmF0aW9uVXJsT2JqID0gbmFycmF0aW9uVXJsc1tpXTtcblxuICAgICAgLy8gRXh0cmFjdCB0aGUgc2lnbmVkIFVSTHMgZnJvbSB0aGUgb2JqZWN0c1xuICAgICAgY29uc3Qgc3VidGl0bGVVcmwgPSBPYmplY3QudmFsdWVzKHN1YnRpdGxlVXJsT2JqKVswXTtcbiAgICAgIGNvbnN0IGF1ZGlvVXJsID0gT2JqZWN0LnZhbHVlcyhuYXJyYXRpb25VcmxPYmopWzBdO1xuXG4gICAgICAvLyBGZXRjaCBBU1MgZmlsZSBjb250ZW50IGZyb20gdGhlIHNpZ25lZCBVUkxcbiAgICAgIGNvbnN0IGFzc1Jlc3BvbnNlID0gYXdhaXQgZmV0Y2goc3VidGl0bGVVcmwpO1xuICAgICAgY29uc3QgYXNzRmlsZUNvbnRlbnQgPSBhd2FpdCBhc3NSZXNwb25zZS50ZXh0KCk7XG5cbiAgICAgIHJlc3VsdHMucHVzaCh7XG4gICAgICAgIHNjZW5lSWQ6IHNjZW5lLmlkLFxuICAgICAgICBhdWRpb0tleTogYXVkaW9LZXkucmVwbGFjZShgJHt1c2VySWR9L2AsICcnKSxcbiAgICAgICAgYXNzS2V5OiBhdWRpb0tleS5yZXBsYWNlKGAke3VzZXJJZH0vYCwgJycpLnJlcGxhY2UoJy5tcDMnLCAnLmFzcycpLFxuICAgICAgICBhdWRpb1VybCxcbiAgICAgICAgYXNzRmlsZUNvbnRlbnQsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBSZXR1cm4gc3VjY2VzcyByZXNwb25zZVxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHN1Y2Nlc3M6IHRydWUsXG4gICAgICAgIG1lc3NhZ2U6ICdBdWRpbyBhbmQgc3VidGl0bGVzIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICBkYXRhOiByZXN1bHRzLFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gYXVkaW8tc3VidGl0bGUgZ2VuZXJhdGlvbjonLCBlcnJvcik7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicsXG4gICAgICAgIG1lc3NhZ2U6XG4gICAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvciBvY2N1cnJlZCcsXG4gICAgICB9KSxcbiAgICB9O1xuICB9XG59O1xuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gYnJvYWRjYXN0IHN1YnRpdGxlIGZpbGVzIGNvbXBsZXRlZCBldmVudFxuYXN5bmMgZnVuY3Rpb24gYnJvYWRjYXN0U3VidGl0bGVGaWxlc0NvbXBsZXRlZChcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBzdWJ0aXRsZVVybHM6IEFycmF5PHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0+LFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3Qgc3VidGl0bGVNZXNzYWdlID0ge1xuICAgICAgYWN0aW9uOiAnc3VidGl0bGVfZmlsZXNfY29tcGxldGVkJyxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgdXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgIHN1YnRpdGxlRmlsZXM6IHN1YnRpdGxlVXJscyxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIGNvbnN0IGRvbWFpbk5hbWUgPSBwcm9jZXNzLmVudi5XRUJTT0NLRVRfRE9NQUlOX05BTUU7XG4gICAgY29uc3Qgc3RhZ2UgPSBwcm9jZXNzLmVudi5XRUJTT0NLRVRfU1RBR0UgfHwgJ3Byb2QnO1xuXG4gICAgaWYgKGRvbWFpbk5hbWUpIHtcbiAgICAgIGF3YWl0IGJyb2FkY2FzdE1lc3NhZ2Uoc3VidGl0bGVNZXNzYWdlLCBkb21haW5OYW1lLCBzdGFnZSwgdXNlcklkKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OhIFdlYlNvY2tldCBzdWJ0aXRsZSBmaWxlcyBjb21wbGV0ZWQgYnJvYWRjYXN0YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OhIFdlYlNvY2tldCBub3QgY29uZmlndXJlZCwgc2tpcHBpbmcgc3VidGl0bGUgYnJvYWRjYXN0YCk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGJyb2FkY2FzdGluZyBzdWJ0aXRsZSBmaWxlcyBjb21wbGV0ZWQ6JywgZXJyb3IpO1xuICB9XG59XG4iXX0=