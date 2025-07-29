"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const narration_1 = require("./narration");
const subtitles_1 = require("./subtitles");
const combineVideo_1 = require("./combineVideo");
const handler = async (event) => {
    console.log('🚀 Lambda function started');
    console.log('📄 Event received:', JSON.stringify(event, null, 2));
    try {
        console.log('AWS_REGION:', process.env.AWS_REGION);
        console.log('RUNWAY_API_KEY set:', !!process.env.RUNWAY_API_KEY);
        console.log('OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY);
        console.log('✅ All environment variables are set');
        let request;
        // Handle different event formats
        if (event.body) {
            // API Gateway format - body is a JSON string
            if (typeof event.body === 'string') {
                request = JSON.parse(event.body);
            }
            else {
                // Direct Lambda invocation - body is already an object
                request = event.body;
            }
        }
        else {
            // Direct Lambda invocation - payload is the entire event
            request = event;
        }
        if (!request.prompt) {
            console.log('❌ Error: Prompt is required');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Prompt is required' }),
            };
        }
        // Create timestamp in format mm.dd.yy.hh.mm.ss using date-fns
        const timestamp = '12.25.23-14:30:45'; //format(new Date(), 'MM.dd.yy-HH:mm:ss');
        console.log('🕐 Generated timestamp:', timestamp);
        console.log('🎬 Starting video generation for prompt:', request.prompt);
        console.log('⏱️  Video duration:', request.duration, 'seconds');
        console.log('🎬 Number of scenes:', request.sceneCount);
        // Step 1: Generate story breakdown using GPT-4
        console.log('📖 Generating story breakdown...');
        // TODO: Uncomment this once we have a dynamic story breakdown
        let scenes = await (0, narration_1.generateStoryBreakdown)(request.prompt, request.sceneCount, request.duration);
        console.log('✅ Generated scenes:', scenes);
        // Generate dynamic scenes based on parameters
        // const sceneDuration = Math.floor(request.duration / request.sceneCount);
        // TODO: Remove this once we have a dynamic story breakdown
        const sceneDuration = 5;
        // TODO: Remove this once we have a dynamic story breakdown
        scenes = [
            {
                description: 'A wide shot of the ocean, the camera slowly zooms in on the sun setting in the horizon. The sunlight is reflected on the water.',
                duration: sceneDuration,
                narration: 'As we begin, take a moment to gaze upon the vast open ocean. Let the warm hues of the setting sun wash over you.',
            },
            // {
            //   description:
            //     'Close up shot of the waves gently lapping against the shore. The sun is now halfway below the horizon, casting long shadows.',
            //   duration: sceneDuration,
            //   narration:
            //     'Focus on the rhythmic ebb and flow of the waves, mirroring the rhythm of your own breath.',
            // },
            {
                description: 'The camera pulls back to reveal a silhouette of a person meditating on the beach. The sun is now just a glimmer on the horizon.',
                duration: sceneDuration,
                narration: 'Imagine yourself sitting at the edge of the ocean, grounding yourself in this peaceful moment.',
            },
            // {
            //   description:
            //     'Aerial view of the meditating person with the twilight colors of the sky and ocean spread out around them.',
            //   duration: 10,
            //   narration:
            //     'From above, see yourself as part of this vast universe, connected with the nature around you.',
            // },
            // {
            //   description:
            //     "Close up shot of the meditating person's face, serene and calm. The last sunlight is reflected in their eyes.",
            //   duration: 10,
            //   narration:
            //     'Feel a sense of peace and calm wash over you. Embrace the tranquility within.',
            // },
            // {
            //   description:
            //     'Fade out to a black screen with the sound of waves continuing in the background.',
            //   duration: 10,
            //   narration:
            //     'As we conclude, keep this serene image in mind. Carry this peace with you throughout your day.',
            // },
        ];
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to generate story breakdown');
            throw new Error('Failed to generate story breakdown');
        }
        // TODO: Uncomment this once we have a dynamic story breakdown
        // Step 2: Generate video clips for each scene
        console.log('🎥 Generating video clips...');
        // const videoClips: string[] = [];
        // for (let i = 0; i < scenes.length; i++) {
        //   const scene = scenes[i];
        //   console.log(`🎬 Generating video for scene ${i + 1}:`, scene.description);
        //   try {
        //     const videoClip = await generateVideoClip(
        //       scene.description,
        //       scene.duration,
        //       i,
        //       request.userId,
        //       timestamp,
        //     );
        //     videoClips.push(videoClip);
        //     console.log(`✅ Scene ${i + 1} video generated:`, videoClip);
        //   } catch (error) {
        //     console.error(`❌ Failed to generate video for scene ${i + 1}:`, error);
        //     throw new Error(
        //       `Failed to generate video for scene ${i + 1}: ${error}`,
        //     );
        //   }
        // }
        // if (videoClips.length === 0) {
        //   console.log('❌ Error: No video clips were generated');
        //   throw new Error('No video clips were generated');
        // }
        // console.log(`✅ Generated ${videoClips.length} video clips`);
        // TODO: Remove this once we have a dynamic story breakdown
        // TODO: Uncomment this once we have a dynamic story breakdown
        // Step 3: Generate narration audio with word-level timestamps
        console.log('🎤 Generating narration audio with word-level timestamps...');
        const narrationResult = await (0, narration_1.generateNarration)(scenes, request.userId, timestamp);
        console.log('✅ narrationResult:', narrationResult);
        console.log('✅ Generated subtitle data with word-level timestamps');
        // Step 4: Generate subtitles based on word-level timestamps
        console.log('📝 Generating subtitles with word-level timing...');
        const subtitleKeys = await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, narrationResult.subtitles);
        console.log('✅ Generated subtitle keys:', subtitleKeys);
        // Step 5: Combine video clips, audio, and subtitles
        console.log('🎬 Combining video, audio, and subtitles...');
        const finalVideo = await (0, combineVideo_1.combineVideoAndAudio)(request.userId, timestamp);
        console.log('✅ Final video generated:', finalVideo);
        if (!finalVideo) {
            console.log('❌ Error: Failed to combine video, audio, and subtitles');
            throw new Error('Failed to combine video, audio, and subtitles');
        }
        // Step 6: Upload to S3
        console.log('☁️ Uploading to S3...');
        const videoKey = await (0, combineVideo_1.uploadToS3)(finalVideo, request.userId, timestamp);
        console.log('✅ Uploaded to S3:', videoKey);
        console.log('🎉 Video generation completed successfully');
        return {
            statusCode: 200,
            body: JSON.stringify({
                videoKey,
                message: 'Video generated successfully',
            }),
        };
    }
    catch (error) {
        console.error('💥 Error in video generation:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to generate video',
                details: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFHQSwyQ0FBK0U7QUFDL0UsMkNBQWdEO0FBQ2hELGlEQUFrRTtBQVUzRCxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQzFCLEtBQTJCLEVBQ0ssRUFBRTtJQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixDQUFDLENBQUM7SUFDMUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVsRSxJQUFJLENBQUM7UUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ25ELE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDakUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUVqRSxPQUFPLENBQUMsR0FBRyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7UUFFbkQsSUFBSSxPQUErQixDQUFDO1FBRXBDLGlDQUFpQztRQUNqQyxJQUFJLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNmLDZDQUE2QztZQUM3QyxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDbkMsT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25DLENBQUM7aUJBQU0sQ0FBQztnQkFDTix1REFBdUQ7Z0JBQ3ZELE9BQU8sR0FBRyxLQUFLLENBQUMsSUFBOEIsQ0FBQztZQUNqRCxDQUFDO1FB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RSxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUFoTlcsUUFBQSxPQUFPLFdBZ05sQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IGZvcm1hdCB9IGZyb20gJ2RhdGUtZm5zJztcbmltcG9ydCB7IGdlbmVyYXRlVmlkZW9DbGlwIH0gZnJvbSAnLi92aWRlbyc7XG5pbXBvcnQgeyBnZW5lcmF0ZU5hcnJhdGlvbiwgZ2VuZXJhdGVTdG9yeUJyZWFrZG93biwgU2NlbmUgfSBmcm9tICcuL25hcnJhdGlvbic7XG5pbXBvcnQgeyBnZW5lcmF0ZVN1YnRpdGxlcyB9IGZyb20gJy4vc3VidGl0bGVzJztcbmltcG9ydCB7IGNvbWJpbmVWaWRlb0FuZEF1ZGlvLCB1cGxvYWRUb1MzIH0gZnJvbSAnLi9jb21iaW5lVmlkZW8nO1xuXG5pbnRlcmZhY2UgVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCB7XG4gIHByb21wdDogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIHNjZW5lQ291bnQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoXG4gIGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCxcbik6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIGNvbnNvbGUubG9nKCfwn5qAIExhbWJkYSBmdW5jdGlvbiBzdGFydGVkJyk7XG4gIGNvbnNvbGUubG9nKCfwn5OEIEV2ZW50IHJlY2VpdmVkOicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG5cbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZygnQVdTX1JFR0lPTjonLCBwcm9jZXNzLmVudi5BV1NfUkVHSU9OKTtcbiAgICBjb25zb2xlLmxvZygnUlVOV0FZX0FQSV9LRVkgc2V0OicsICEhcHJvY2Vzcy5lbnYuUlVOV0FZX0FQSV9LRVkpO1xuICAgIGNvbnNvbGUubG9nKCdPUEVOQUlfQVBJX0tFWSBzZXQ6JywgISFwcm9jZXNzLmVudi5PUEVOQUlfQVBJX0tFWSk7XG5cbiAgICBjb25zb2xlLmxvZygn4pyFIEFsbCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgYXJlIHNldCcpO1xuXG4gICAgbGV0IHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3Q7XG5cbiAgICAvLyBIYW5kbGUgZGlmZmVyZW50IGV2ZW50IGZvcm1hdHNcbiAgICBpZiAoZXZlbnQuYm9keSkge1xuICAgICAgLy8gQVBJIEdhdGV3YXkgZm9ybWF0IC0gYm9keSBpcyBhIEpTT04gc3RyaW5nXG4gICAgICBpZiAodHlwZW9mIGV2ZW50LmJvZHkgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJlcXVlc3QgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRGlyZWN0IExhbWJkYSBpbnZvY2F0aW9uIC0gYm9keSBpcyBhbHJlYWR5IGFuIG9iamVjdFxuICAgICAgICByZXF1ZXN0ID0gZXZlbnQuYm9keSBhcyBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBEaXJlY3QgTGFtYmRhIGludm9jYXRpb24gLSBwYXlsb2FkIGlzIHRoZSBlbnRpcmUgZXZlbnRcbiAgICAgIHJlcXVlc3QgPSBldmVudCBhcyBhbnk7XG4gICAgfVxuXG4gICAgaWYgKCFyZXF1ZXN0LnByb21wdCkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogUHJvbXB0IGlzIHJlcXVpcmVkJyk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdQcm9tcHQgaXMgcmVxdWlyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgdGltZXN0YW1wIGluIGZvcm1hdCBtbS5kZC55eS5oaC5tbS5zcyB1c2luZyBkYXRlLWZuc1xuICAgIGNvbnN0IHRpbWVzdGFtcCA9ICcxMi4yNS4yMy0xNDozMDo0NSc7IC8vZm9ybWF0KG5ldyBEYXRlKCksICdNTS5kZC55eS1ISDptbTpzcycpO1xuICAgIGNvbnNvbGUubG9nKCfwn5WQIEdlbmVyYXRlZCB0aW1lc3RhbXA6JywgdGltZXN0YW1wKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46sIFN0YXJ0aW5nIHZpZGVvIGdlbmVyYXRpb24gZm9yIHByb21wdDonLCByZXF1ZXN0LnByb21wdCk7XG4gICAgY29uc29sZS5sb2coJ+KPse+4jyAgVmlkZW8gZHVyYXRpb246JywgcmVxdWVzdC5kdXJhdGlvbiwgJ3NlY29uZHMnKTtcbiAgICBjb25zb2xlLmxvZygn8J+OrCBOdW1iZXIgb2Ygc2NlbmVzOicsIHJlcXVlc3Quc2NlbmVDb3VudCk7XG5cbiAgICAvLyBTdGVwIDE6IEdlbmVyYXRlIHN0b3J5IGJyZWFrZG93biB1c2luZyBHUFQtNFxuICAgIGNvbnNvbGUubG9nKCfwn5OWIEdlbmVyYXRpbmcgc3RvcnkgYnJlYWtkb3duLi4uJyk7XG4gICAgLy8gVE9ETzogVW5jb21tZW50IHRoaXMgb25jZSB3ZSBoYXZlIGEgZHluYW1pYyBzdG9yeSBicmVha2Rvd25cbiAgICBsZXQgc2NlbmVzID0gYXdhaXQgZ2VuZXJhdGVTdG9yeUJyZWFrZG93bihcbiAgICAgIHJlcXVlc3QucHJvbXB0LFxuICAgICAgcmVxdWVzdC5zY2VuZUNvdW50LFxuICAgICAgcmVxdWVzdC5kdXJhdGlvbixcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKCfinIUgR2VuZXJhdGVkIHNjZW5lczonLCBzY2VuZXMpO1xuXG4gICAgLy8gR2VuZXJhdGUgZHluYW1pYyBzY2VuZXMgYmFzZWQgb24gcGFyYW1ldGVyc1xuICAgIC8vIGNvbnN0IHNjZW5lRHVyYXRpb24gPSBNYXRoLmZsb29yKHJlcXVlc3QuZHVyYXRpb24gLyByZXF1ZXN0LnNjZW5lQ291bnQpO1xuICAgIC8vIFRPRE86IFJlbW92ZSB0aGlzIG9uY2Ugd2UgaGF2ZSBhIGR5bmFtaWMgc3RvcnkgYnJlYWtkb3duXG4gICAgY29uc3Qgc2NlbmVEdXJhdGlvbiA9IDU7XG4gICAgLy8gVE9ETzogUmVtb3ZlIHRoaXMgb25jZSB3ZSBoYXZlIGEgZHluYW1pYyBzdG9yeSBicmVha2Rvd25cbiAgICBzY2VuZXMgPSBbXG4gICAgICB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdBIHdpZGUgc2hvdCBvZiB0aGUgb2NlYW4sIHRoZSBjYW1lcmEgc2xvd2x5IHpvb21zIGluIG9uIHRoZSBzdW4gc2V0dGluZyBpbiB0aGUgaG9yaXpvbi4gVGhlIHN1bmxpZ2h0IGlzIHJlZmxlY3RlZCBvbiB0aGUgd2F0ZXIuJyxcbiAgICAgICAgZHVyYXRpb246IHNjZW5lRHVyYXRpb24sXG4gICAgICAgIG5hcnJhdGlvbjpcbiAgICAgICAgICAnQXMgd2UgYmVnaW4sIHRha2UgYSBtb21lbnQgdG8gZ2F6ZSB1cG9uIHRoZSB2YXN0IG9wZW4gb2NlYW4uIExldCB0aGUgd2FybSBodWVzIG9mIHRoZSBzZXR0aW5nIHN1biB3YXNoIG92ZXIgeW91LicsXG4gICAgICB9LFxuICAgICAgLy8ge1xuICAgICAgLy8gICBkZXNjcmlwdGlvbjpcbiAgICAgIC8vICAgICAnQ2xvc2UgdXAgc2hvdCBvZiB0aGUgd2F2ZXMgZ2VudGx5IGxhcHBpbmcgYWdhaW5zdCB0aGUgc2hvcmUuIFRoZSBzdW4gaXMgbm93IGhhbGZ3YXkgYmVsb3cgdGhlIGhvcml6b24sIGNhc3RpbmcgbG9uZyBzaGFkb3dzLicsXG4gICAgICAvLyAgIGR1cmF0aW9uOiBzY2VuZUR1cmF0aW9uLFxuICAgICAgLy8gICBuYXJyYXRpb246XG4gICAgICAvLyAgICAgJ0ZvY3VzIG9uIHRoZSByaHl0aG1pYyBlYmIgYW5kIGZsb3cgb2YgdGhlIHdhdmVzLCBtaXJyb3JpbmcgdGhlIHJoeXRobSBvZiB5b3VyIG93biBicmVhdGguJyxcbiAgICAgIC8vIH0sXG4gICAgICB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdUaGUgY2FtZXJhIHB1bGxzIGJhY2sgdG8gcmV2ZWFsIGEgc2lsaG91ZXR0ZSBvZiBhIHBlcnNvbiBtZWRpdGF0aW5nIG9uIHRoZSBiZWFjaC4gVGhlIHN1biBpcyBub3cganVzdCBhIGdsaW1tZXIgb24gdGhlIGhvcml6b24uJyxcbiAgICAgICAgZHVyYXRpb246IHNjZW5lRHVyYXRpb24sXG4gICAgICAgIG5hcnJhdGlvbjpcbiAgICAgICAgICAnSW1hZ2luZSB5b3Vyc2VsZiBzaXR0aW5nIGF0IHRoZSBlZGdlIG9mIHRoZSBvY2VhbiwgZ3JvdW5kaW5nIHlvdXJzZWxmIGluIHRoaXMgcGVhY2VmdWwgbW9tZW50LicsXG4gICAgICB9LFxuICAgICAgLy8ge1xuICAgICAgLy8gICBkZXNjcmlwdGlvbjpcbiAgICAgIC8vICAgICAnQWVyaWFsIHZpZXcgb2YgdGhlIG1lZGl0YXRpbmcgcGVyc29uIHdpdGggdGhlIHR3aWxpZ2h0IGNvbG9ycyBvZiB0aGUgc2t5IGFuZCBvY2VhbiBzcHJlYWQgb3V0IGFyb3VuZCB0aGVtLicsXG4gICAgICAvLyAgIGR1cmF0aW9uOiAxMCxcbiAgICAgIC8vICAgbmFycmF0aW9uOlxuICAgICAgLy8gICAgICdGcm9tIGFib3ZlLCBzZWUgeW91cnNlbGYgYXMgcGFydCBvZiB0aGlzIHZhc3QgdW5pdmVyc2UsIGNvbm5lY3RlZCB3aXRoIHRoZSBuYXR1cmUgYXJvdW5kIHlvdS4nLFxuICAgICAgLy8gfSxcbiAgICAgIC8vIHtcbiAgICAgIC8vICAgZGVzY3JpcHRpb246XG4gICAgICAvLyAgICAgXCJDbG9zZSB1cCBzaG90IG9mIHRoZSBtZWRpdGF0aW5nIHBlcnNvbidzIGZhY2UsIHNlcmVuZSBhbmQgY2FsbS4gVGhlIGxhc3Qgc3VubGlnaHQgaXMgcmVmbGVjdGVkIGluIHRoZWlyIGV5ZXMuXCIsXG4gICAgICAvLyAgIGR1cmF0aW9uOiAxMCxcbiAgICAgIC8vICAgbmFycmF0aW9uOlxuICAgICAgLy8gICAgICdGZWVsIGEgc2Vuc2Ugb2YgcGVhY2UgYW5kIGNhbG0gd2FzaCBvdmVyIHlvdS4gRW1icmFjZSB0aGUgdHJhbnF1aWxpdHkgd2l0aGluLicsXG4gICAgICAvLyB9LFxuICAgICAgLy8ge1xuICAgICAgLy8gICBkZXNjcmlwdGlvbjpcbiAgICAgIC8vICAgICAnRmFkZSBvdXQgdG8gYSBibGFjayBzY3JlZW4gd2l0aCB0aGUgc291bmQgb2Ygd2F2ZXMgY29udGludWluZyBpbiB0aGUgYmFja2dyb3VuZC4nLFxuICAgICAgLy8gICBkdXJhdGlvbjogMTAsXG4gICAgICAvLyAgIG5hcnJhdGlvbjpcbiAgICAgIC8vICAgICAnQXMgd2UgY29uY2x1ZGUsIGtlZXAgdGhpcyBzZXJlbmUgaW1hZ2UgaW4gbWluZC4gQ2FycnkgdGhpcyBwZWFjZSB3aXRoIHlvdSB0aHJvdWdob3V0IHlvdXIgZGF5LicsXG4gICAgICAvLyB9LFxuICAgIF07XG5cbiAgICBpZiAoIXNjZW5lcyB8fCBzY2VuZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBGYWlsZWQgdG8gZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZW5lcmF0ZSBzdG9yeSBicmVha2Rvd24nKTtcbiAgICB9XG5cbiAgICAvLyBUT0RPOiBVbmNvbW1lbnQgdGhpcyBvbmNlIHdlIGhhdmUgYSBkeW5hbWljIHN0b3J5IGJyZWFrZG93blxuICAgIC8vIFN0ZXAgMjogR2VuZXJhdGUgdmlkZW8gY2xpcHMgZm9yIGVhY2ggc2NlbmVcbiAgICBjb25zb2xlLmxvZygn8J+OpSBHZW5lcmF0aW5nIHZpZGVvIGNsaXBzLi4uJyk7XG4gICAgLy8gY29uc3QgdmlkZW9DbGlwczogc3RyaW5nW10gPSBbXTtcbiAgICAvLyBmb3IgKGxldCBpID0gMDsgaSA8IHNjZW5lcy5sZW5ndGg7IGkrKykge1xuICAgIC8vICAgY29uc3Qgc2NlbmUgPSBzY2VuZXNbaV07XG4gICAgLy8gICBjb25zb2xlLmxvZyhg8J+OrCBHZW5lcmF0aW5nIHZpZGVvIGZvciBzY2VuZSAke2kgKyAxfTpgLCBzY2VuZS5kZXNjcmlwdGlvbik7XG5cbiAgICAvLyAgIHRyeSB7XG4gICAgLy8gICAgIGNvbnN0IHZpZGVvQ2xpcCA9IGF3YWl0IGdlbmVyYXRlVmlkZW9DbGlwKFxuICAgIC8vICAgICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgIC8vICAgICAgIHNjZW5lLmR1cmF0aW9uLFxuICAgIC8vICAgICAgIGksXG4gICAgLy8gICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgLy8gICAgICAgdGltZXN0YW1wLFxuICAgIC8vICAgICApO1xuICAgIC8vICAgICB2aWRlb0NsaXBzLnB1c2godmlkZW9DbGlwKTtcbiAgICAvLyAgICAgY29uc29sZS5sb2coYOKchSBTY2VuZSAke2kgKyAxfSB2aWRlbyBnZW5lcmF0ZWQ6YCwgdmlkZW9DbGlwKTtcbiAgICAvLyAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9OmAsIGVycm9yKTtcbiAgICAvLyAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgIC8vICAgICAgIGBGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9OiAke2Vycm9yfWAsXG4gICAgLy8gICAgICk7XG4gICAgLy8gICB9XG4gICAgLy8gfVxuXG4gICAgLy8gaWYgKHZpZGVvQ2xpcHMubGVuZ3RoID09PSAwKSB7XG4gICAgLy8gICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyB2aWRlbyBjbGlwcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgIC8vICAgdGhyb3cgbmV3IEVycm9yKCdObyB2aWRlbyBjbGlwcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgIC8vIH1cblxuICAgIC8vIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkICR7dmlkZW9DbGlwcy5sZW5ndGh9IHZpZGVvIGNsaXBzYCk7XG5cbiAgICAvLyBUT0RPOiBSZW1vdmUgdGhpcyBvbmNlIHdlIGhhdmUgYSBkeW5hbWljIHN0b3J5IGJyZWFrZG93blxuXG4gICAgLy8gVE9ETzogVW5jb21tZW50IHRoaXMgb25jZSB3ZSBoYXZlIGEgZHluYW1pYyBzdG9yeSBicmVha2Rvd25cbiAgICAvLyBTdGVwIDM6IEdlbmVyYXRlIG5hcnJhdGlvbiBhdWRpbyB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wc1xuICAgIGNvbnNvbGUubG9nKCfwn46kIEdlbmVyYXRpbmcgbmFycmF0aW9uIGF1ZGlvIHdpdGggd29yZC1sZXZlbCB0aW1lc3RhbXBzLi4uJyk7XG4gICAgY29uc3QgbmFycmF0aW9uUmVzdWx0ID0gYXdhaXQgZ2VuZXJhdGVOYXJyYXRpb24oXG4gICAgICBzY2VuZXMsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKCfinIUgbmFycmF0aW9uUmVzdWx0OicsIG5hcnJhdGlvblJlc3VsdCk7XG4gICAgY29uc29sZS5sb2coJ+KchSBHZW5lcmF0ZWQgc3VidGl0bGUgZGF0YSB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wcycpO1xuXG4gICAgLy8gU3RlcCA0OiBHZW5lcmF0ZSBzdWJ0aXRsZXMgYmFzZWQgb24gd29yZC1sZXZlbCB0aW1lc3RhbXBzXG4gICAgY29uc29sZS5sb2coJ/Cfk50gR2VuZXJhdGluZyBzdWJ0aXRsZXMgd2l0aCB3b3JkLWxldmVsIHRpbWluZy4uLicpO1xuICAgIGNvbnN0IHN1YnRpdGxlS2V5cyA9IGF3YWl0IGdlbmVyYXRlU3VidGl0bGVzKFxuICAgICAgc2NlbmVzLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBuYXJyYXRpb25SZXN1bHQuc3VidGl0bGVzLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coJ+KchSBHZW5lcmF0ZWQgc3VidGl0bGUga2V5czonLCBzdWJ0aXRsZUtleXMpO1xuXG4gICAgLy8gU3RlcCA1OiBDb21iaW5lIHZpZGVvIGNsaXBzLCBhdWRpbywgYW5kIHN1YnRpdGxlc1xuICAgIGNvbnNvbGUubG9nKCfwn46sIENvbWJpbmluZyB2aWRlbywgYXVkaW8sIGFuZCBzdWJ0aXRsZXMuLi4nKTtcbiAgICBjb25zdCBmaW5hbFZpZGVvID0gYXdhaXQgY29tYmluZVZpZGVvQW5kQXVkaW8ocmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCk7XG4gICAgY29uc29sZS5sb2coJ+KchSBGaW5hbCB2aWRlbyBnZW5lcmF0ZWQ6JywgZmluYWxWaWRlbyk7XG5cbiAgICBpZiAoIWZpbmFsVmlkZW8pIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IEZhaWxlZCB0byBjb21iaW5lIHZpZGVvLCBhdWRpbywgYW5kIHN1YnRpdGxlcycpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gY29tYmluZSB2aWRlbywgYXVkaW8sIGFuZCBzdWJ0aXRsZXMnKTtcbiAgICB9XG5cbiAgICAvLyBTdGVwIDY6IFVwbG9hZCB0byBTM1xuICAgIGNvbnNvbGUubG9nKCfimIHvuI8gVXBsb2FkaW5nIHRvIFMzLi4uJyk7XG4gICAgY29uc3QgdmlkZW9LZXkgPSBhd2FpdCB1cGxvYWRUb1MzKGZpbmFsVmlkZW8sIHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXApO1xuICAgIGNvbnNvbGUubG9nKCfinIUgVXBsb2FkZWQgdG8gUzM6JywgdmlkZW9LZXkpO1xuXG4gICAgY29uc29sZS5sb2coJ/CfjokgVmlkZW8gZ2VuZXJhdGlvbiBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgdmlkZW9LZXksXG4gICAgICAgIG1lc3NhZ2U6ICdWaWRlbyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign8J+SpSBFcnJvciBpbiB2aWRlbyBnZW5lcmF0aW9uOicsIGVycm9yKTtcbiAgICBjb25zb2xlLmVycm9yKFxuICAgICAgJ0Vycm9yIHN0YWNrOicsXG4gICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3Iuc3RhY2sgOiAnTm8gc3RhY2sgdHJhY2UnLFxuICAgICk7XG4gICAgY29uc29sZS5lcnJvcihcbiAgICAgICdFcnJvciBtZXNzYWdlOicsXG4gICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICApO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8nLFxuICAgICAgICBkZXRhaWxzOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=