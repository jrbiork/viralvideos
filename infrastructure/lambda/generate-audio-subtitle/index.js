"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const narration_1 = require("./common/narration");
const subtitles_1 = require("./common/subtitles");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const handler = async (event) => {
    console.log('🎤 Audio-Subtitle Lambda handler started');
    try {
        if (!event.body) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Request body is required' }),
            };
        }
        const requestBody = JSON.parse(event.body);
        const { scenes, userId, timestamp, voiceToneInstruction } = requestBody;
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
        console.log('🎤 Generating narration...');
        const narrationResult = await (0, narration_1.generateNarration)(scenes, userId, timestamp, voiceToneInstruction || 'Speak in a cheerful and positive tone');
        console.log('🎤 Narration generated successfully:', {
            audioKeys: narrationResult.audioKeys,
            subtitleCount: narrationResult.subtitles.length,
        });
        console.log('📝 Generating subtitles...');
        let subtitleKeys = await (0, subtitles_1.generateSubtitles)(scenes, userId, timestamp, narrationResult.subtitles);
        console.log('📝 Subtitles generated successfully:', subtitleKeys);
        const results = [];
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            const audioKey = narrationResult.audioKeys[i];
            const subtitleKey = subtitleKeys[i];
            const audioCommand = new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: audioKey,
            });
            const audioUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, audioCommand, {
                expiresIn: 3600,
            });
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
