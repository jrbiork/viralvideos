"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const video_1 = require("./video");
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
        const timestamp = '08.06.25-14:30:45';
        console.log('🕐 Generated timestamp:', timestamp);
        console.log('🎬 Starting video generation for prompt:', request.prompt);
        console.log('⏱️  Video duration:', request.duration, 'seconds');
        console.log('🎬 Number of scenes:', request.sceneCount);
        console.log('📖 Generating story breakdown...');
        const sceneDuration = 5;
        const scenes = [
            {
                id: 2,
                description: 'INT. NURSERY – MORNING\nSoft sunlight filters through curtains. Vanessa gently rocks baby Maxime, her face alight with purpose and unconditional love.',
                duration: sceneDuration,
                narration: 'Through all the drama, she discovered her true purpose in raising little Maxime, the light of her world.',
            },
        ];
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to generate story breakdown');
            throw new Error('Failed to generate story breakdown');
        }
        console.log('🎥 Generating video clips...');
        const videoClips = [];
        const seed = Math.floor(Math.random() * 1000000);
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            console.log(`🎬 Generating video for scene ${i + 1}:`, scene.description);
            try {
                const videoClip = await (0, video_1.generateVideoClip)(scene.description, scene.duration, i, request.userId, timestamp, seed, scene.id);
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
