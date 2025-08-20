"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const image_1 = require("./image");
const narration_1 = require("./narration");
const subtitles_1 = require("./subtitles");
const videoCombiner_1 = require("./videoCombiner");
const s3Uploader_1 = require("./util/s3Uploader");
const imageUtils_1 = require("./util/imageUtils");
const videoBlurInOut_1 = require("./util/videoBlurInOut");
const audioUtils_1 = require("./util/audioUtils");
const script_1 = require("./script");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const handler = async (event) => {
    return await handleSQSEvent(event);
};
exports.handler = handler;
async function handleSQSEvent(event) {
    const batchItemFailures = [];
    for (const record of event.Records) {
        try {
            const request = JSON.parse(record.body);
            await processVideoGeneration(request, record);
        }
        catch (error) {
            console.error('❌ Error processing record:', record.messageId, error);
            batchItemFailures.push({ itemIdentifier: record.messageId });
        }
    }
    return {
        batchItemFailures,
    };
}
async function processVideoGeneration(request, record) {
    try {
        console.log('processVideoGeneration:', request);
        const timestamp = request.timestamp;
        const sceneDuration = Math.floor(request.totalDuration / request.sceneCount);
        const scriptKey = `${request.userId}/${timestamp}.script.txt`;
        const existingScript = await (0, s3Uploader_1.getObjectFromS3)(scriptKey);
        let scenes, voiceToneInstruction;
        if (existingScript) {
            console.log('🎥 Script already generated for the timestamp, using existing script');
            scenes = (0, script_1.addSceneIds)(existingScript.scenes);
            voiceToneInstruction = existingScript.voiceToneInstruction;
        }
        else {
            console.log('🎥 No existing script found, generating new story breakdown');
            const storyBreakdown = await (0, narration_1.generateStoryBreakdown)(request.prompt, request.sceneCount, sceneDuration, request.totalDuration, request.userId, timestamp);
            scenes = storyBreakdown.scenes;
            voiceToneInstruction = storyBreakdown.voiceToneInstruction;
        }
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to get or generate story breakdown');
            throw new Error('Failed to get or generate story breakdown');
        }
        console.log('🎥 Story breakdown generated:', scenes);
        let imageUrls = await (0, imageUtils_1.getImageUrls)(request.userId, timestamp);
        if (imageUrls.length > 0) {
            console.log('🎥 Images already generated for the timestamp:', imageUrls);
        }
        else {
            const seed = Math.floor(Math.random() * 1000000);
            console.log('🎨 Generating images for each scene...');
            for (let i = 0; i < scenes.length; i++) {
                const scene = scenes[i];
                console.log(`🎨 Generating image for scene ${i + 1}:`, scene.description);
                try {
                    const imageUrl = await (0, image_1.generateImage)(scene.description, i, request.userId, timestamp, seed, scene.id);
                    imageUrls.push(imageUrl);
                    console.log(`✅ Scene ${i + 1} image generated:`, imageUrl);
                }
                catch (error) {
                    console.error(`❌ Failed to generate image for scene ${i + 1}:`, error);
                    throw new Error(`Failed to generate image for scene ${i + 1}: ${error}`);
                }
            }
            if (imageUrls.length === 0) {
                console.log('❌ Error: No images were generated');
                throw new Error('No images were generated');
            }
            console.log('🎥 Images generated:', imageUrls);
        }
        const existingAudioResult = await (0, audioUtils_1.fetchAudioFilesForTimestamp)(request.userId, timestamp);
        let narrationResult;
        if (existingAudioResult.audioKeys.length === scenes.length) {
            console.log('🎥 Audio files already generated for the timestamp, using existing audio');
            narrationResult = existingAudioResult;
        }
        else {
            console.log('🎥 No existing audio files found, generating new narration');
            narrationResult = await (0, narration_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction);
        }
        console.log('🎥 Audio narration generated:', narrationResult);
        const videoBlurInOutKeys = await (0, videoBlurInOut_1.generateVideoBlurInOut)(scenes, request.userId, timestamp);
        console.log('videoBlurInOutKeys:', videoBlurInOutKeys);
        const subtitleKeys = await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, narrationResult.subtitles);
        console.log('🎥 Subtitles generated:', subtitleKeys);
        const finalVideo = await (0, videoCombiner_1.combineVideoAndAudio)(request.userId, timestamp, scenes);
        if (!finalVideo) {
            console.log('❌ Error: Failed to combine video, audio, and subtitles');
            throw new Error('Failed to combine video, audio, and subtitles');
        }
        const videoKey = await (0, s3Uploader_1.uploadToS3)(finalVideo, request.userId, timestamp);
        if (record && process.env.VIDEO_QUEUE_URL) {
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
        }
        return {
            videoKey,
            message: 'Video generated successfully',
        };
    }
    catch (error) {
        console.error('Error in video generation:', error);
        throw error;
    }
}
