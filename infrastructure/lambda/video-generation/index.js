"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const video_1 = require("./video");
const narration_1 = require("./narration");
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
        console.log('🎬 Starting video generation for prompt:', request.prompt);
        console.log('⏱️  Video duration:', request.duration, 'seconds');
        console.log('🎬 Number of scenes:', request.sceneCount);
        // Step 1: Generate story breakdown using GPT-4
        console.log('📖 Generating story breakdown...');
        // TODO: Uncomment this once we have a dynamic story breakdown
        let scenes; // = await generateStoryBreakdown(request.prompt, request.sceneCount, request.duration);
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
        // Step 2: Generate video clips for each scene
        console.log('🎥 Generating video clips...');
        const videoClips = [];
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            console.log(`🎬 Generating video for scene ${i + 1}:`, scene.description);
            try {
                const videoClip = await (0, video_1.generateVideoClip)(scene.description, scene.duration, i, request.userId);
                videoClips.push(videoClip);
                console.log(`✅ Scene ${i + 1} video generated:`, videoClip);
            }
            catch (error) {
                console.error(`❌ Failed to generate video for scene ${i + 1}:`, error);
                throw new Error(`Failed to generate video for scene ${i + 1}: ${error}`);
            }
        }
        if (videoClips.length === 0) {
            console.log('❌ Error: No video clips were generated');
            throw new Error('No video clips were generated');
        }
        console.log(`✅ Generated ${videoClips.length} video clips`);
        // TODO: Remove this once we have a dynamic story breakdown
        let audioScenes = [
            {
                description: 'A wide shot of the ocean, the camera slowly zooms in on the sun setting in the horizon. The sunlight is reflected on the water.',
                duration: sceneDuration,
                narration: 'As we begin, take a moment to gaze upon the vast open ocean. Let the warm hues of the setting sun wash over you.',
            },
            {
                description: 'The camera pulls back to reveal a silhouette of a person meditating on the beach. The sun is now just a glimmer on the horizon.',
                duration: sceneDuration,
                narration: 'Imagine yourself sitting at the edge of the ocean, grounding yourself in this peaceful moment.',
            },
        ];
        // Step 3: Generate narration audio
        console.log('🎤 Generating narration audio...');
        const narrationAudioKeys = await (0, narration_1.generateNarration)(audioScenes, request.userId);
        console.log('✅ Generated narration audio keys:', narrationAudioKeys);
        // Step 4: Combine video clips and audio
        console.log('🎬 Combining video and audio...');
        const finalVideo = await (0, combineVideo_1.combineVideoAndAudio)(request.userId);
        console.log('✅ Final video generated:', finalVideo);
        if (!finalVideo) {
            console.log('❌ Error: Failed to combine video and audio');
            throw new Error('Failed to combine video and audio');
        }
        // Step 5: Upload to S3
        console.log('☁️ Uploading to S3...');
        const videoKey = await (0, combineVideo_1.uploadToS3)(finalVideo, request.userId);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxtQ0FBNEM7QUFDNUMsMkNBQStFO0FBQy9FLGlEQUFrRTtBQVUzRCxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQzFCLEtBQTJCLEVBQ0ssRUFBRTtJQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixDQUFDLENBQUM7SUFDMUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVsRSxJQUFJLENBQUM7UUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ25ELE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDakUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUVqRSxPQUFPLENBQUMsR0FBRyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7UUFFbkQsSUFBSSxPQUErQixDQUFDO1FBRXBDLGlDQUFpQztRQUNqQyxJQUFJLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNmLDZDQUE2QztZQUM3QyxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDbkMsT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25DLENBQUM7aUJBQU0sQ0FBQztnQkFDTix1REFBdUQ7Z0JBQ3ZELE9BQU8sR0FBRyxLQUFLLENBQUMsSUFBOEIsQ0FBQztZQUNqRCxDQUFDO1FB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QyxLQUFLLENBQ1gsZ0JBQWdCLEVBQ2hCLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FDekQsQ0FBQztRQUVGLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixLQUFLLEVBQUUsMEJBQTBCO2dCQUNqQyxPQUFPLEVBQUUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZTthQUNsRSxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUF6TVcsUUFBQSxPQUFPLFdBeU1sQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IGdlbmVyYXRlVmlkZW9DbGlwIH0gZnJvbSAnLi92aWRlbyc7XG5pbXBvcnQgeyBnZW5lcmF0ZU5hcnJhdGlvbiwgZ2VuZXJhdGVTdG9yeUJyZWFrZG93biwgU2NlbmUgfSBmcm9tICcuL25hcnJhdGlvbic7XG5pbXBvcnQgeyBjb21iaW5lVmlkZW9BbmRBdWRpbywgdXBsb2FkVG9TMyB9IGZyb20gJy4vY29tYmluZVZpZGVvJztcblxuaW50ZXJmYWNlIFZpZGVvR2VuZXJhdGlvblJlcXVlc3Qge1xuICBwcm9tcHQ6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBzY2VuZUNvdW50OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygn8J+agCBMYW1iZGEgZnVuY3Rpb24gc3RhcnRlZCcpO1xuICBjb25zb2xlLmxvZygn8J+ThCBFdmVudCByZWNlaXZlZDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xuXG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ0FXU19SRUdJT046JywgcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTik7XG4gICAgY29uc29sZS5sb2coJ1JVTldBWV9BUElfS0VZIHNldDonLCAhIXByb2Nlc3MuZW52LlJVTldBWV9BUElfS0VZKTtcbiAgICBjb25zb2xlLmxvZygnT1BFTkFJX0FQSV9LRVkgc2V0OicsICEhcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVkpO1xuXG4gICAgY29uc29sZS5sb2coJ+KchSBBbGwgZW52aXJvbm1lbnQgdmFyaWFibGVzIGFyZSBzZXQnKTtcblxuICAgIGxldCByZXF1ZXN0OiBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0O1xuXG4gICAgLy8gSGFuZGxlIGRpZmZlcmVudCBldmVudCBmb3JtYXRzXG4gICAgaWYgKGV2ZW50LmJvZHkpIHtcbiAgICAgIC8vIEFQSSBHYXRld2F5IGZvcm1hdCAtIGJvZHkgaXMgYSBKU09OIHN0cmluZ1xuICAgICAgaWYgKHR5cGVvZiBldmVudC5ib2R5ID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXF1ZXN0ID0gSlNPTi5wYXJzZShldmVudC5ib2R5KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIERpcmVjdCBMYW1iZGEgaW52b2NhdGlvbiAtIGJvZHkgaXMgYWxyZWFkeSBhbiBvYmplY3RcbiAgICAgICAgcmVxdWVzdCA9IGV2ZW50LmJvZHkgYXMgVmlkZW9HZW5lcmF0aW9uUmVxdWVzdDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRGlyZWN0IExhbWJkYSBpbnZvY2F0aW9uIC0gcGF5bG9hZCBpcyB0aGUgZW50aXJlIGV2ZW50XG4gICAgICByZXF1ZXN0ID0gZXZlbnQgYXMgYW55O1xuICAgIH1cblxuICAgIGlmICghcmVxdWVzdC5wcm9tcHQpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IFByb21wdCBpcyByZXF1aXJlZCcpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUHJvbXB0IGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CfjqwgU3RhcnRpbmcgdmlkZW8gZ2VuZXJhdGlvbiBmb3IgcHJvbXB0OicsIHJlcXVlc3QucHJvbXB0KTtcbiAgICBjb25zb2xlLmxvZygn4o+x77iPICBWaWRlbyBkdXJhdGlvbjonLCByZXF1ZXN0LmR1cmF0aW9uLCAnc2Vjb25kcycpO1xuICAgIGNvbnNvbGUubG9nKCfwn46sIE51bWJlciBvZiBzY2VuZXM6JywgcmVxdWVzdC5zY2VuZUNvdW50KTtcblxuICAgIC8vIFN0ZXAgMTogR2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duIHVzaW5nIEdQVC00XG4gICAgY29uc29sZS5sb2coJ/Cfk5YgR2VuZXJhdGluZyBzdG9yeSBicmVha2Rvd24uLi4nKTtcbiAgICAvLyBUT0RPOiBVbmNvbW1lbnQgdGhpcyBvbmNlIHdlIGhhdmUgYSBkeW5hbWljIHN0b3J5IGJyZWFrZG93blxuICAgIGxldCBzY2VuZXM7IC8vID0gYXdhaXQgZ2VuZXJhdGVTdG9yeUJyZWFrZG93bihyZXF1ZXN0LnByb21wdCwgcmVxdWVzdC5zY2VuZUNvdW50LCByZXF1ZXN0LmR1cmF0aW9uKTtcbiAgICBjb25zb2xlLmxvZygn4pyFIEdlbmVyYXRlZCBzY2VuZXM6Jywgc2NlbmVzKTtcblxuICAgIC8vIEdlbmVyYXRlIGR5bmFtaWMgc2NlbmVzIGJhc2VkIG9uIHBhcmFtZXRlcnNcbiAgICAvLyBjb25zdCBzY2VuZUR1cmF0aW9uID0gTWF0aC5mbG9vcihyZXF1ZXN0LmR1cmF0aW9uIC8gcmVxdWVzdC5zY2VuZUNvdW50KTtcbiAgICAvLyBUT0RPOiBSZW1vdmUgdGhpcyBvbmNlIHdlIGhhdmUgYSBkeW5hbWljIHN0b3J5IGJyZWFrZG93blxuICAgIGNvbnN0IHNjZW5lRHVyYXRpb24gPSA1O1xuICAgIC8vIFRPRE86IFJlbW92ZSB0aGlzIG9uY2Ugd2UgaGF2ZSBhIGR5bmFtaWMgc3RvcnkgYnJlYWtkb3duXG4gICAgc2NlbmVzID0gW1xuICAgICAge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnQSB3aWRlIHNob3Qgb2YgdGhlIG9jZWFuLCB0aGUgY2FtZXJhIHNsb3dseSB6b29tcyBpbiBvbiB0aGUgc3VuIHNldHRpbmcgaW4gdGhlIGhvcml6b24uIFRoZSBzdW5saWdodCBpcyByZWZsZWN0ZWQgb24gdGhlIHdhdGVyLicsXG4gICAgICAgIGR1cmF0aW9uOiBzY2VuZUR1cmF0aW9uLFxuICAgICAgICBuYXJyYXRpb246XG4gICAgICAgICAgJ0FzIHdlIGJlZ2luLCB0YWtlIGEgbW9tZW50IHRvIGdhemUgdXBvbiB0aGUgdmFzdCBvcGVuIG9jZWFuLiBMZXQgdGhlIHdhcm0gaHVlcyBvZiB0aGUgc2V0dGluZyBzdW4gd2FzaCBvdmVyIHlvdS4nLFxuICAgICAgfSxcbiAgICAgIC8vIHtcbiAgICAgIC8vICAgZGVzY3JpcHRpb246XG4gICAgICAvLyAgICAgJ0Nsb3NlIHVwIHNob3Qgb2YgdGhlIHdhdmVzIGdlbnRseSBsYXBwaW5nIGFnYWluc3QgdGhlIHNob3JlLiBUaGUgc3VuIGlzIG5vdyBoYWxmd2F5IGJlbG93IHRoZSBob3Jpem9uLCBjYXN0aW5nIGxvbmcgc2hhZG93cy4nLFxuICAgICAgLy8gICBkdXJhdGlvbjogc2NlbmVEdXJhdGlvbixcbiAgICAgIC8vICAgbmFycmF0aW9uOlxuICAgICAgLy8gICAgICdGb2N1cyBvbiB0aGUgcmh5dGhtaWMgZWJiIGFuZCBmbG93IG9mIHRoZSB3YXZlcywgbWlycm9yaW5nIHRoZSByaHl0aG0gb2YgeW91ciBvd24gYnJlYXRoLicsXG4gICAgICAvLyB9LFxuICAgICAge1xuICAgICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgICAnVGhlIGNhbWVyYSBwdWxscyBiYWNrIHRvIHJldmVhbCBhIHNpbGhvdWV0dGUgb2YgYSBwZXJzb24gbWVkaXRhdGluZyBvbiB0aGUgYmVhY2guIFRoZSBzdW4gaXMgbm93IGp1c3QgYSBnbGltbWVyIG9uIHRoZSBob3Jpem9uLicsXG4gICAgICAgIGR1cmF0aW9uOiBzY2VuZUR1cmF0aW9uLFxuICAgICAgICBuYXJyYXRpb246XG4gICAgICAgICAgJ0ltYWdpbmUgeW91cnNlbGYgc2l0dGluZyBhdCB0aGUgZWRnZSBvZiB0aGUgb2NlYW4sIGdyb3VuZGluZyB5b3Vyc2VsZiBpbiB0aGlzIHBlYWNlZnVsIG1vbWVudC4nLFxuICAgICAgfSxcbiAgICAgIC8vIHtcbiAgICAgIC8vICAgZGVzY3JpcHRpb246XG4gICAgICAvLyAgICAgJ0FlcmlhbCB2aWV3IG9mIHRoZSBtZWRpdGF0aW5nIHBlcnNvbiB3aXRoIHRoZSB0d2lsaWdodCBjb2xvcnMgb2YgdGhlIHNreSBhbmQgb2NlYW4gc3ByZWFkIG91dCBhcm91bmQgdGhlbS4nLFxuICAgICAgLy8gICBkdXJhdGlvbjogMTAsXG4gICAgICAvLyAgIG5hcnJhdGlvbjpcbiAgICAgIC8vICAgICAnRnJvbSBhYm92ZSwgc2VlIHlvdXJzZWxmIGFzIHBhcnQgb2YgdGhpcyB2YXN0IHVuaXZlcnNlLCBjb25uZWN0ZWQgd2l0aCB0aGUgbmF0dXJlIGFyb3VuZCB5b3UuJyxcbiAgICAgIC8vIH0sXG4gICAgICAvLyB7XG4gICAgICAvLyAgIGRlc2NyaXB0aW9uOlxuICAgICAgLy8gICAgIFwiQ2xvc2UgdXAgc2hvdCBvZiB0aGUgbWVkaXRhdGluZyBwZXJzb24ncyBmYWNlLCBzZXJlbmUgYW5kIGNhbG0uIFRoZSBsYXN0IHN1bmxpZ2h0IGlzIHJlZmxlY3RlZCBpbiB0aGVpciBleWVzLlwiLFxuICAgICAgLy8gICBkdXJhdGlvbjogMTAsXG4gICAgICAvLyAgIG5hcnJhdGlvbjpcbiAgICAgIC8vICAgICAnRmVlbCBhIHNlbnNlIG9mIHBlYWNlIGFuZCBjYWxtIHdhc2ggb3ZlciB5b3UuIEVtYnJhY2UgdGhlIHRyYW5xdWlsaXR5IHdpdGhpbi4nLFxuICAgICAgLy8gfSxcbiAgICAgIC8vIHtcbiAgICAgIC8vICAgZGVzY3JpcHRpb246XG4gICAgICAvLyAgICAgJ0ZhZGUgb3V0IHRvIGEgYmxhY2sgc2NyZWVuIHdpdGggdGhlIHNvdW5kIG9mIHdhdmVzIGNvbnRpbnVpbmcgaW4gdGhlIGJhY2tncm91bmQuJyxcbiAgICAgIC8vICAgZHVyYXRpb246IDEwLFxuICAgICAgLy8gICBuYXJyYXRpb246XG4gICAgICAvLyAgICAgJ0FzIHdlIGNvbmNsdWRlLCBrZWVwIHRoaXMgc2VyZW5lIGltYWdlIGluIG1pbmQuIENhcnJ5IHRoaXMgcGVhY2Ugd2l0aCB5b3UgdGhyb3VnaG91dCB5b3VyIGRheS4nLFxuICAgICAgLy8gfSxcbiAgICBdO1xuXG4gICAgaWYgKCFzY2VuZXMgfHwgc2NlbmVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogRmFpbGVkIHRvIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgLy8gU3RlcCAyOiBHZW5lcmF0ZSB2aWRlbyBjbGlwcyBmb3IgZWFjaCBzY2VuZVxuICAgIGNvbnNvbGUubG9nKCfwn46lIEdlbmVyYXRpbmcgdmlkZW8gY2xpcHMuLi4nKTtcbiAgICBjb25zdCB2aWRlb0NsaXBzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NlbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBzY2VuZSA9IHNjZW5lc1tpXTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn46sIEdlbmVyYXRpbmcgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9OmAsIHNjZW5lLmRlc2NyaXB0aW9uKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdmlkZW9DbGlwID0gYXdhaXQgZ2VuZXJhdGVWaWRlb0NsaXAoXG4gICAgICAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgICAgICAgc2NlbmUuZHVyYXRpb24sXG4gICAgICAgICAgaSxcbiAgICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgKTtcbiAgICAgICAgdmlkZW9DbGlwcy5wdXNoKHZpZGVvQ2xpcCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtpICsgMX0gdmlkZW8gZ2VuZXJhdGVkOmAsIHZpZGVvQ2xpcCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIGdlbmVyYXRlIHZpZGVvIGZvciBzY2VuZSAke2kgKyAxfTpgLCBlcnJvcik7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgRmFpbGVkIHRvIGdlbmVyYXRlIHZpZGVvIGZvciBzY2VuZSAke2kgKyAxfTogJHtlcnJvcn1gLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICh2aWRlb0NsaXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogTm8gdmlkZW8gY2xpcHMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gdmlkZW8gY2xpcHMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCAke3ZpZGVvQ2xpcHMubGVuZ3RofSB2aWRlbyBjbGlwc2ApO1xuXG4gICAgLy8gVE9ETzogUmVtb3ZlIHRoaXMgb25jZSB3ZSBoYXZlIGEgZHluYW1pYyBzdG9yeSBicmVha2Rvd25cbiAgICBsZXQgYXVkaW9TY2VuZXMgPSBbXG4gICAgICB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdBIHdpZGUgc2hvdCBvZiB0aGUgb2NlYW4sIHRoZSBjYW1lcmEgc2xvd2x5IHpvb21zIGluIG9uIHRoZSBzdW4gc2V0dGluZyBpbiB0aGUgaG9yaXpvbi4gVGhlIHN1bmxpZ2h0IGlzIHJlZmxlY3RlZCBvbiB0aGUgd2F0ZXIuJyxcbiAgICAgICAgZHVyYXRpb246IHNjZW5lRHVyYXRpb24sXG4gICAgICAgIG5hcnJhdGlvbjpcbiAgICAgICAgICAnQXMgd2UgYmVnaW4sIHRha2UgYSBtb21lbnQgdG8gZ2F6ZSB1cG9uIHRoZSB2YXN0IG9wZW4gb2NlYW4uIExldCB0aGUgd2FybSBodWVzIG9mIHRoZSBzZXR0aW5nIHN1biB3YXNoIG92ZXIgeW91LicsXG4gICAgICB9LFxuXG4gICAgICB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdUaGUgY2FtZXJhIHB1bGxzIGJhY2sgdG8gcmV2ZWFsIGEgc2lsaG91ZXR0ZSBvZiBhIHBlcnNvbiBtZWRpdGF0aW5nIG9uIHRoZSBiZWFjaC4gVGhlIHN1biBpcyBub3cganVzdCBhIGdsaW1tZXIgb24gdGhlIGhvcml6b24uJyxcbiAgICAgICAgZHVyYXRpb246IHNjZW5lRHVyYXRpb24sXG4gICAgICAgIG5hcnJhdGlvbjpcbiAgICAgICAgICAnSW1hZ2luZSB5b3Vyc2VsZiBzaXR0aW5nIGF0IHRoZSBlZGdlIG9mIHRoZSBvY2VhbiwgZ3JvdW5kaW5nIHlvdXJzZWxmIGluIHRoaXMgcGVhY2VmdWwgbW9tZW50LicsXG4gICAgICB9LFxuICAgIF07XG4gICAgLy8gU3RlcCAzOiBHZW5lcmF0ZSBuYXJyYXRpb24gYXVkaW9cbiAgICBjb25zb2xlLmxvZygn8J+OpCBHZW5lcmF0aW5nIG5hcnJhdGlvbiBhdWRpby4uLicpO1xuICAgIGNvbnN0IG5hcnJhdGlvbkF1ZGlvS2V5cyA9IGF3YWl0IGdlbmVyYXRlTmFycmF0aW9uKFxuICAgICAgYXVkaW9TY2VuZXMsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKCfinIUgR2VuZXJhdGVkIG5hcnJhdGlvbiBhdWRpbyBrZXlzOicsIG5hcnJhdGlvbkF1ZGlvS2V5cyk7XG5cbiAgICAvLyBTdGVwIDQ6IENvbWJpbmUgdmlkZW8gY2xpcHMgYW5kIGF1ZGlvXG4gICAgY29uc29sZS5sb2coJ/CfjqwgQ29tYmluaW5nIHZpZGVvIGFuZCBhdWRpby4uLicpO1xuICAgIGNvbnN0IGZpbmFsVmlkZW8gPSBhd2FpdCBjb21iaW5lVmlkZW9BbmRBdWRpbyhyZXF1ZXN0LnVzZXJJZCk7XG4gICAgY29uc29sZS5sb2coJ+KchSBGaW5hbCB2aWRlbyBnZW5lcmF0ZWQ6JywgZmluYWxWaWRlbyk7XG5cbiAgICBpZiAoIWZpbmFsVmlkZW8pIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IEZhaWxlZCB0byBjb21iaW5lIHZpZGVvIGFuZCBhdWRpbycpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gY29tYmluZSB2aWRlbyBhbmQgYXVkaW8nKTtcbiAgICB9XG5cbiAgICAvLyBTdGVwIDU6IFVwbG9hZCB0byBTM1xuICAgIGNvbnNvbGUubG9nKCfimIHvuI8gVXBsb2FkaW5nIHRvIFMzLi4uJyk7XG4gICAgY29uc3QgdmlkZW9LZXkgPSBhd2FpdCB1cGxvYWRUb1MzKGZpbmFsVmlkZW8sIHJlcXVlc3QudXNlcklkKTtcbiAgICBjb25zb2xlLmxvZygn4pyFIFVwbG9hZGVkIHRvIFMzOicsIHZpZGVvS2V5KTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46JIFZpZGVvIGdlbmVyYXRpb24gY29tcGxldGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHZpZGVvS2V5LFxuICAgICAgICBtZXNzYWdlOiAnVmlkZW8gZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICB9KSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ/CfkqUgRXJyb3IgaW4gdmlkZW8gZ2VuZXJhdGlvbjonLCBlcnJvcik7XG4gICAgY29uc29sZS5lcnJvcihcbiAgICAgICdFcnJvciBzdGFjazonLFxuICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLnN0YWNrIDogJ05vIHN0YWNrIHRyYWNlJyxcbiAgICApO1xuICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAnRXJyb3IgbWVzc2FnZTonLFxuICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGVycm9yOiAnRmFpbGVkIHRvIGdlbmVyYXRlIHZpZGVvJyxcbiAgICAgICAgZGV0YWlsczogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICB9KSxcbiAgICB9O1xuICB9XG59O1xuIl19