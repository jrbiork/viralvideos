"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const narration_1 = require("./narration");
const subtitles_1 = require("./subtitles");
const combineVideo_1 = require("./combineVideo");
const handler = async (event) => {
    console.log('🚀 Lambda function started');
    console.log('📄   ', JSON.stringify(event, null, 2));
    try {
        console.log('AWS_REGION:', process.env.AWS_REGION);
        console.log('RUNWAY_API_KEY set:', !!process.env.RUNWAY_API_KEY);
        console.log('OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY);
        console.log('✅ All environment variables are set');
        let request;
        if (event.body) {
            if (typeof event.body === 'string') {
                request = JSON.parse(event.body);
            }
            else {
                request = event.body;
            }
        }
        else {
            request = event;
        }
        if (!request.prompt) {
            console.log('❌ Error: Prompt is required');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Prompt is required' }),
            };
        }
        const timestamp = '12.25.23-14:30:45';
        console.log('🕐 Generated timestamp:', timestamp);
        console.log('🎬 Starting video generation for prompt:', request.prompt);
        console.log('⏱️  Video duration:', request.duration, 'seconds');
        console.log('🎬 Number of scenes:', request.sceneCount);
        console.log('📖 Generating story breakdown...');
        let scenes = await (0, narration_1.generateStoryBreakdown)(request.prompt, request.sceneCount, request.duration);
        console.log('✅ Generated scenes:', scenes);
        const sceneDuration = 5;
        scenes = [
            {
                description: 'A wide shot of the ocean, the camera slowly zooms in on the sun setting in the horizon. The sunlight is reflected on the water.',
                duration: sceneDuration,
                narration: 'Take a moment to gaze upon the vast open ocean. Let the warm hues of the setting sun wash over you.',
            },
            {
                description: 'The camera pulls back to reveal a silhouette of a person meditating on the beach. The sun is now just a glimmer on the horizon.',
                duration: sceneDuration,
                narration: 'Imagine yourself sitting at the edge of the ocean, grounding yourself in this peaceful moment.',
            },
        ];
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to generate story breakdown');
            throw new Error('Failed to generate story breakdown');
        }
        console.log('🎥 Generating video clips...');
        console.log('🎤 Generating narration audio with word-level timestamps...');
        const narrationResult = await (0, narration_1.generateNarration)(scenes, request.userId, timestamp);
        console.log('✅ narrationResult:', narrationResult);
        console.log('✅ Generated subtitle data with word-level timestamps');
        console.log('📝 Generating subtitles with word-level timing...');
        const subtitleKeys = await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, narrationResult.subtitles);
        console.log('✅ Generated subtitle keys:', subtitleKeys);
        console.log('🎬 Combining video, audio, and subtitles...');
        const finalVideo = await (0, combineVideo_1.combineVideoAndAudio)(request.userId, timestamp, scenes);
        console.log('✅ Final video generated:', finalVideo);
        if (!finalVideo) {
            console.log('❌ Error: Failed to combine video, audio, and subtitles');
            throw new Error('Failed to combine video, audio, and subtitles');
        }
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
