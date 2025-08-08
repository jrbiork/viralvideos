"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const narration_1 = require("./narration");
const subtitles_1 = require("./subtitles");
const videoCombiner_1 = require("./videoCombiner");
const s3Uploader_1 = require("./util/s3Uploader");
const handler = async (event) => {
    console.log('🚀 Lambda function started');
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
        const timestamp = '08.07.25-14:30:45';
        console.log('🕐 Generated timestamp:', timestamp);
        request.totalDuration = 30;
        request.sceneCount = 3;
        const sceneDuration = Math.floor(request.totalDuration / request.sceneCount);
        console.log('🎬 Starting video generation for prompt:', request.prompt);
        console.log('⏱️  Video duration:', request.totalDuration, 'seconds');
        console.log('🎬 Number of scenes:', request.sceneCount);
        console.log('📖 Generating story breakdown...');
        const storyBreakdown = await (0, narration_1.generateStoryBreakdown)(request.prompt, request.sceneCount, sceneDuration, request.totalDuration);
        const { scenes, voiceToneInstruction } = storyBreakdown;
        console.log('✅ Generated scenes:', scenes);
        console.log('🎤 Voice tone instruction:', voiceToneInstruction);
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to generate story breakdown');
            throw new Error('Failed to generate story breakdown');
        }
        console.log('🎤 Generating narration audio with word-level timestamps...');
        const narrationResult = await (0, narration_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction);
        console.log('✅ narrationResult:', narrationResult);
        console.log('✅ Generated subtitle data with word-level timestamps');
        console.log('📝 Generating subtitles with word-level timing...');
        const subtitleKeys = await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, narrationResult.subtitles);
        console.log('✅ Generated subtitle keys:', subtitleKeys);
        console.log('🎬 Combining video, audio, and subtitles...');
        const finalVideo = await (0, videoCombiner_1.combineVideoAndAudio)(request.userId, timestamp, scenes);
        console.log('✅ Final video generated:', finalVideo);
        if (!finalVideo) {
            console.log('❌ Error: Failed to combine video, audio, and subtitles');
            throw new Error('Failed to combine video, audio, and subtitles');
        }
        console.log('☁️ Uploading to S3...');
        const videoKey = await (0, s3Uploader_1.uploadToS3)(finalVideo, request.userId, timestamp);
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
