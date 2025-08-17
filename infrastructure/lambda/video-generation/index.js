"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const narration_1 = require("./narration");
const subtitles_1 = require("./subtitles");
const videoCombiner_1 = require("./videoCombiner");
const s3Uploader_1 = require("./util/s3Uploader");
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
        const timestamp = '08.07.25-14:30:45';
        request.totalDuration = 30;
        request.sceneCount = 3;
        const sceneDuration = Math.floor(request.totalDuration / request.sceneCount);
        const storyBreakdown = await (0, narration_1.generateStoryBreakdown)(request.prompt, request.sceneCount, sceneDuration, request.totalDuration);
        const { scenes, voiceToneInstruction } = storyBreakdown;
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to generate story breakdown');
            throw new Error('Failed to generate story breakdown');
        }
        const narrationResult = await (0, narration_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction);
        const subtitleKeys = await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, narrationResult.subtitles);
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
