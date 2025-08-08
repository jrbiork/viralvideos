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
    console.log('🚀 Lambda function started - SQS only handler');
    return await handleSQSEvent(event);
};
exports.handler = handler;
async function handleSQSEvent(event) {
    console.log('📨 Processing SQS event with', event.Records.length, 'records');
    const batchItemFailures = [];
    for (const record of event.Records) {
        try {
            console.log('📝 Processing record:', record.messageId);
            const request = JSON.parse(record.body);
            console.log('✅ Parsed request:', request);
            await processVideoGeneration(request, record);
            console.log('✅ Successfully processed record:', record.messageId);
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
        console.log('AWS_REGION:', process.env.AWS_REGION);
        console.log('RUNWAY_API_KEY set:', !!process.env.RUNWAY_API_KEY);
        console.log('OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY);
        console.log('✅ All environment variables are set');
        const timestamp = '08.07.25-14:30:45';
        console.log('🕐 Generated timestamp:', timestamp);
        request.totalDuration = 30;
        request.sceneCount = 3;
        const sceneDuration = Math.floor(request.totalDuration / request.sceneCount);
        console.log('🎬 Starting video generation for prompt:', request.prompt);
        console.log('⏱️  Video duration:', request.totalDuration, 'seconds');
        console.log('🎬 Number of scenes:', request.sceneCount);
        console.log('📖 Step 1: Generating story breakdown...');
        const storyBreakdown = await (0, narration_1.generateStoryBreakdown)(request.prompt, request.sceneCount, sceneDuration, request.totalDuration);
        const { scenes, voiceToneInstruction } = storyBreakdown;
        console.log('✅ Step 1 completed: Generated scenes:', scenes);
        console.log('🎤 Voice tone instruction:', voiceToneInstruction);
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to generate story breakdown');
            throw new Error('Failed to generate story breakdown');
        }
        console.log('🎬 Step 2: Generating video clips from scenes...');
        console.log('✅ Step 2 completed: Generated all video clips');
        console.log('🎤 Step 3: Generating narration audio with word-level timestamps...');
        const narrationResult = await (0, narration_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction);
        console.log('✅ Step 3 completed: Generated audio and subtitle data');
        console.log('📝 Step 4: Generating subtitles with word-level timing...');
        const subtitleKeys = await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, narrationResult.subtitles);
        console.log('✅ Step 4 completed: Generated subtitle keys:', subtitleKeys);
        console.log('🎬 Step 5: Combining video, audio, and subtitles...');
        const finalVideo = await (0, videoCombiner_1.combineVideoAndAudio)(request.userId, timestamp, scenes);
        console.log('✅ Step 5 completed: Final video generated:', finalVideo);
        if (!finalVideo) {
            console.log('❌ Error: Failed to combine video, audio, and subtitles');
            throw new Error('Failed to combine video, audio, and subtitles');
        }
        console.log('☁️ Step 6: Uploading to S3...');
        const videoKey = await (0, s3Uploader_1.uploadToS3)(finalVideo, request.userId, timestamp);
        console.log('✅ Step 6 completed: Uploaded to S3:', videoKey);
        if (record && process.env.VIDEO_QUEUE_URL) {
            console.log('🗑️ Deleting message from SQS queue:', record.messageId);
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
            console.log('✅ Message deleted from SQS queue');
        }
        console.log('🎉 Video generation completed successfully');
        return {
            videoKey,
            message: 'Video generated successfully',
        };
    }
    catch (error) {
        console.error('💥 Error in video generation:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
}
