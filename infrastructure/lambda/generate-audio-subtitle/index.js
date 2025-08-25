"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
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
        const narrationResult = await (0, audio_1.generateNarration)(scenes, userId, timestamp, voiceToneInstruction || 'Speak in a cheerful and positive tone');
        console.log('🎤 Narration generated successfully:', {
            audioKeys: narrationResult.audioKeys,
            subtitleCount: narrationResult.subtitles.length,
        });
        // Step 2: Generate subtitles using the narration result
        console.log('📝 Generating subtitles...');
        let subtitleKeys = await (0, subtitles_1.generateSubtitles)(scenes, userId, timestamp, narrationResult.subtitles);
        console.log('📝 Subtitles generated successfully:', subtitleKeys);
        // Broadcast subtitle files completed event
        await broadcastSubtitleFilesCompleted(userId, timestamp, subtitleKeys);
        // Generate pre-signed URLs for each scene
        const results = [];
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            const audioKey = narrationResult.audioKeys[i];
            const subtitleKey = subtitleKeys[i];
            // Generate pre-signed URL for audio
            const audioCommand = new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: audioKey,
            });
            const audioUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, audioCommand, {
                expiresIn: 3600,
            }); // 1 hour
            // Fetch ASS file content
            const subtitleCommand = new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: subtitleKey,
            });
            const assObject = await s3.send(subtitleCommand);
            const assFileContent = await assObject.Body?.transformToString();
            results.push({
                sceneId: scene.id,
                audioKey: audioKey.replace(`${userId}/`, ''),
                assKey: subtitleKey.replace(`${userId}/`, ''),
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
async function broadcastSubtitleFilesCompleted(userId, timestamp, subtitleKeys) {
    try {
        const subtitleMessage = {
            action: 'subtitle_files_completed',
            data: {
                userId,
                timestamp,
                subtitleFiles: subtitleKeys,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxrREFBZ0U7QUFDaEUsd0VBQTZEO0FBQzdELHFEQUE4RDtBQUM5RCw2REFBa0U7QUFFbEUsZ0VBQTBEO0FBUzFELE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBRXBFLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFDMUIsS0FBMkIsRUFDSyxFQUFFO0lBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsQ0FBQztJQUV4RCxJQUFJLENBQUM7UUFDSCxxQkFBcUI7UUFDckIsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNoQixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLDBCQUEwQixFQUFFLENBQUM7YUFDNUQsQ0FBQztRQUNKLENBQUM7UUFFRCxNQUFNLFdBQVcsR0FBZ0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDeEQsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLG9CQUFvQixFQUFFLEdBQUcsV0FBVyxDQUFDO1FBRXhFLDJCQUEyQjtRQUMzQixJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzdELE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7b0JBQ25CLEtBQUssRUFBRSxnREFBZ0Q7aUJBQ3hELENBQUM7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QU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUM7UUFDckQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLElBQUksTUFBTSxDQUFDO1FBRXBELElBQUksVUFBVSxFQUFFLENBQUM7WUFDZixNQUFNLElBQUEsc0NBQWdCLEVBQUMsZUFBZSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDbkUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpREFBaUQsQ0FBQyxDQUFDO1FBQ2pFLENBQUM7YUFBTSxDQUFDO1lBQ04sT0FBTyxDQUFDLEdBQUcsQ0FBQywwREFBMEQsQ0FBQyxDQUFDO1FBQzFFLENBQUM7SUFDSCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsOENBQThDLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDdkUsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBTM0NsaWVudCwgR2V0T2JqZWN0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgeyBnZXRTaWduZWRVcmwgfSBmcm9tICdAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lcic7XG5pbXBvcnQgeyBnZW5lcmF0ZU5hcnJhdGlvbiB9IGZyb20gJy4uL3ZpZGVvLWdlbmVyYXRpb24vYXVkaW8nO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdWJ0aXRsZXMgfSBmcm9tICcuLi92aWRlby1nZW5lcmF0aW9uL3N1YnRpdGxlcyc7XG5pbXBvcnQgeyBTY2VuZSB9IGZyb20gJy4uL3ZpZGVvLWdlbmVyYXRpb24vc2NyaXB0JztcbmltcG9ydCB7IGJyb2FkY2FzdE1lc3NhZ2UgfSBmcm9tICcuLi93ZWJzb2NrZXQtYnJvYWRjYXN0JztcblxuaW50ZXJmYWNlIFJlcXVlc3RCb2R5IHtcbiAgc2NlbmVzOiBTY2VuZVtdO1xuICB1c2VySWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG4gIHZvaWNlVG9uZUluc3RydWN0aW9uPzogc3RyaW5nO1xufVxuXG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyB9KTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoXG4gIGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCxcbik6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIGNvbnNvbGUubG9nKCfwn46kIEF1ZGlvLVN1YnRpdGxlIExhbWJkYSBoYW5kbGVyIHN0YXJ0ZWQnKTtcblxuICB0cnkge1xuICAgIC8vIFBhcnNlIHJlcXVlc3QgYm9keVxuICAgIGlmICghZXZlbnQuYm9keSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUmVxdWVzdCBib2R5IGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgcmVxdWVzdEJvZHk6IFJlcXVlc3RCb2R5ID0gSlNPTi5wYXJzZShldmVudC5ib2R5KTtcbiAgICBjb25zdCB7IHNjZW5lcywgdXNlcklkLCB0aW1lc3RhbXAsIHZvaWNlVG9uZUluc3RydWN0aW9uIH0gPSByZXF1ZXN0Qm9keTtcblxuICAgIC8vIFZhbGlkYXRlIHJlcXVpcmVkIGZpZWxkc1xuICAgIGlmICghc2NlbmVzIHx8ICFBcnJheS5pc0FycmF5KHNjZW5lcykgfHwgc2NlbmVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgZXJyb3I6ICdTY2VuZXMgYXJyYXkgaXMgcmVxdWlyZWQgYW5kIG11c3Qgbm90IGJlIGVtcHR5JyxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGlmICghdXNlcklkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICd1c2VySWQgaXMgcmVxdWlyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAoIXRpbWVzdGFtcCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAndGltZXN0YW1wIGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBg8J+OpCBQcm9jZXNzaW5nICR7c2NlbmVzLmxlbmd0aH0gc2NlbmVzIGZvciB1c2VyICR7dXNlcklkfSwgdGltZXN0YW1wICR7dGltZXN0YW1wfWAsXG4gICAgKTtcblxuICAgIC8vIFN0ZXAgMTogR2VuZXJhdGUgbmFycmF0aW9uIHdpdGggd29yZC1sZXZlbCB0aW1lc3RhbXBzXG4gICAgY29uc29sZS5sb2coJ/CfjqQgR2VuZXJhdGluZyBuYXJyYXRpb24uLi4nKTtcbiAgICBjb25zdCBuYXJyYXRpb25SZXN1bHQgPSBhd2FpdCBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgICAgIHNjZW5lcyxcbiAgICAgIHVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uIHx8ICdTcGVhayBpbiBhIGNoZWVyZnVsIGFuZCBwb3NpdGl2ZSB0b25lJyxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/CfjqQgTmFycmF0aW9uIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHk6Jywge1xuICAgICAgYXVkaW9LZXlzOiBuYXJyYXRpb25SZXN1bHQuYXVkaW9LZXlzLFxuICAgICAgc3VidGl0bGVDb3VudDogbmFycmF0aW9uUmVzdWx0LnN1YnRpdGxlcy5sZW5ndGgsXG4gICAgfSk7XG5cbiAgICAvLyBTdGVwIDI6IEdlbmVyYXRlIHN1YnRpdGxlcyB1c2luZyB0aGUgbmFycmF0aW9uIHJlc3VsdFxuICAgIGNvbnNvbGUubG9nKCfwn5OdIEdlbmVyYXRpbmcgc3VidGl0bGVzLi4uJyk7XG4gICAgbGV0IHN1YnRpdGxlS2V5cyA9IGF3YWl0IGdlbmVyYXRlU3VidGl0bGVzKFxuICAgICAgc2NlbmVzLFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgbmFycmF0aW9uUmVzdWx0LnN1YnRpdGxlcyxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/Cfk50gU3VidGl0bGVzIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHk6Jywgc3VidGl0bGVLZXlzKTtcblxuICAgIC8vIEJyb2FkY2FzdCBzdWJ0aXRsZSBmaWxlcyBjb21wbGV0ZWQgZXZlbnRcbiAgICBhd2FpdCBicm9hZGNhc3RTdWJ0aXRsZUZpbGVzQ29tcGxldGVkKHVzZXJJZCwgdGltZXN0YW1wLCBzdWJ0aXRsZUtleXMpO1xuXG4gICAgLy8gR2VuZXJhdGUgcHJlLXNpZ25lZCBVUkxzIGZvciBlYWNoIHNjZW5lXG4gICAgY29uc3QgcmVzdWx0cyA9IFtdO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NlbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBzY2VuZSA9IHNjZW5lc1tpXTtcbiAgICAgIGNvbnN0IGF1ZGlvS2V5ID0gbmFycmF0aW9uUmVzdWx0LmF1ZGlvS2V5c1tpXTtcbiAgICAgIGNvbnN0IHN1YnRpdGxlS2V5ID0gc3VidGl0bGVLZXlzW2ldO1xuXG4gICAgICAvLyBHZW5lcmF0ZSBwcmUtc2lnbmVkIFVSTCBmb3IgYXVkaW9cbiAgICAgIGNvbnN0IGF1ZGlvQ29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiBhdWRpb0tleSxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgYXVkaW9VcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoczMsIGF1ZGlvQ29tbWFuZCwge1xuICAgICAgICBleHBpcmVzSW46IDM2MDAsXG4gICAgICB9KTsgLy8gMSBob3VyXG5cbiAgICAgIC8vIEZldGNoIEFTUyBmaWxlIGNvbnRlbnRcbiAgICAgIGNvbnN0IHN1YnRpdGxlQ29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiBzdWJ0aXRsZUtleSxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgYXNzT2JqZWN0ID0gYXdhaXQgczMuc2VuZChzdWJ0aXRsZUNvbW1hbmQpO1xuICAgICAgY29uc3QgYXNzRmlsZUNvbnRlbnQgPSBhd2FpdCBhc3NPYmplY3QuQm9keT8udHJhbnNmb3JtVG9TdHJpbmcoKTtcblxuICAgICAgcmVzdWx0cy5wdXNoKHtcbiAgICAgICAgc2NlbmVJZDogc2NlbmUuaWQsXG4gICAgICAgIGF1ZGlvS2V5OiBhdWRpb0tleS5yZXBsYWNlKGAke3VzZXJJZH0vYCwgJycpLFxuICAgICAgICBhc3NLZXk6IHN1YnRpdGxlS2V5LnJlcGxhY2UoYCR7dXNlcklkfS9gLCAnJyksXG4gICAgICAgIGF1ZGlvVXJsLFxuICAgICAgICBhc3NGaWxlQ29udGVudCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFJldHVybiBzdWNjZXNzIHJlc3BvbnNlXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgc3VjY2VzczogdHJ1ZSxcbiAgICAgICAgbWVzc2FnZTogJ0F1ZGlvIGFuZCBzdWJ0aXRsZXMgZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgIGRhdGE6IHJlc3VsdHMsXG4gICAgICB9KSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBhdWRpby1zdWJ0aXRsZSBnZW5lcmF0aW9uOicsIGVycm9yKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyxcbiAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yIG9jY3VycmVkJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn07XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBicm9hZGNhc3Qgc3VidGl0bGUgZmlsZXMgY29tcGxldGVkIGV2ZW50XG5hc3luYyBmdW5jdGlvbiBicm9hZGNhc3RTdWJ0aXRsZUZpbGVzQ29tcGxldGVkKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHN1YnRpdGxlS2V5czogc3RyaW5nW10sXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBzdWJ0aXRsZU1lc3NhZ2UgPSB7XG4gICAgICBhY3Rpb246ICdzdWJ0aXRsZV9maWxlc19jb21wbGV0ZWQnLFxuICAgICAgZGF0YToge1xuICAgICAgICB1c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgc3VidGl0bGVGaWxlczogc3VidGl0bGVLZXlzLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgY29uc3QgZG9tYWluTmFtZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9ET01BSU5fTkFNRTtcbiAgICBjb25zdCBzdGFnZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9TVEFHRSB8fCAncHJvZCc7XG5cbiAgICBpZiAoZG9tYWluTmFtZSkge1xuICAgICAgYXdhaXQgYnJvYWRjYXN0TWVzc2FnZShzdWJ0aXRsZU1lc3NhZ2UsIGRvbWFpbk5hbWUsIHN0YWdlLCB1c2VySWQpO1xuICAgICAgY29uc29sZS5sb2coYPCfk6EgV2ViU29ja2V0IHN1YnRpdGxlIGZpbGVzIGNvbXBsZXRlZCBicm9hZGNhc3RgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coYPCfk6EgV2ViU29ja2V0IG5vdCBjb25maWd1cmVkLCBza2lwcGluZyBzdWJ0aXRsZSBicm9hZGNhc3RgKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgYnJvYWRjYXN0aW5nIHN1YnRpdGxlIGZpbGVzIGNvbXBsZXRlZDonLCBlcnJvcik7XG4gIH1cbn1cbiJdfQ==