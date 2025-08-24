"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
function extractSubtitleContent(assContent) {
    const lines = assContent.split('\n');
    const subtitleLines = [];
    for (const line of lines) {
        if (line.startsWith('Dialogue:')) {
            const parts = line.split(',');
            if (parts.length >= 10) {
                const textPart = parts.slice(9).join(',');
                const cleanText = textPart
                    .replace(/\\[^\\]*\\/g, '')
                    .replace(/^\s+|\s+$/g, '')
                    .replace(/\\N/g, ' ');
                if (cleanText && cleanText.length > 0) {
                    subtitleLines.push(cleanText);
                }
            }
        }
    }
    return subtitleLines;
}
const handler = async (event) => {
    try {
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
        const userId = event.requestContext?.authorizer?.userId ||
            request.userId ||
            event.queryStringParameters?.userId ||
            'demo-user';
        const timestamp = event.queryStringParameters?.timestamp || null;
        console.log('🔍 Fetching files for user:', userId, 'timestamp:', timestamp);
        if (!process.env.VIDEO_PARTS_BUCKET_NAME) {
            console.log('❌ Error: VIDEO_PARTS_BUCKET_NAME is not set');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'S3 bucket name not configured' }),
            };
        }
        if (!timestamp) {
            console.log('❌ Error: Timestamp is required');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Timestamp parameter is required' }),
            };
        }
        console.log('📋 Listing files for user:', userId, 'timestamp:', timestamp);
        const prefix = `${userId}/${timestamp}`;
        console.log('🔍 Using prefix:', prefix);
        const listCommand = new client_s3_1.ListObjectsV2Command({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Prefix: prefix,
        });
        const listResponse = await s3.send(listCommand);
        console.log('✅ Listed objects:', listResponse.Contents?.length || 0);
        if (!listResponse.Contents || listResponse.Contents.length === 0) {
            console.log('📭 No files found for user:', userId, 'timestamp:', timestamp);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    assFiles: {},
                    mediaFiles: {},
                    subtitleFiles: [],
                    message: 'No files found',
                }),
            };
        }
        const result = {
            assFiles: {},
            mediaFiles: {},
            subtitleFiles: [],
        };
        for (const object of listResponse.Contents) {
            if (!object.Key)
                continue;
            const fileName = object.Key.split('/').pop() || '';
            console.log('📄 Processing file:', fileName);
            const getObjectCommand = new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: object.Key,
            });
            if (fileName.endsWith('.script.txt')) {
                const scriptObject = await s3.send(getObjectCommand);
                const scriptContent = await scriptObject.Body?.transformToString();
                if (scriptContent) {
                    const scriptData = JSON.parse(scriptContent);
                    result.scenesCount = scriptData.sceneCount || 0;
                }
            }
            if (fileName.endsWith('.subtitle.json')) {
                console.log('📄 Fetching subtitle JSON content:', object.Key);
                const subtitleObject = await s3.send(getObjectCommand);
                const subtitleContent = await subtitleObject.Body?.transformToString();
                if (subtitleContent) {
                    const subtitleData = JSON.parse(subtitleContent);
                    result.subtitleFiles.push({ [fileName]: subtitleData.fullText });
                    console.log('✅ Successfully fetched subtitle JSON file:', fileName);
                }
            }
            else if (fileName.endsWith('.ass')) {
                console.log('📄 Fetching ASS content:', object.Key);
                const assObject = await s3.send(getObjectCommand);
                const assContent = await assObject.Body?.transformToString();
                if (assContent) {
                    result.assFiles[fileName] = assContent;
                    console.log('✅ Successfully fetched ASS file:', fileName);
                }
            }
            else if (fileName.endsWith('.jpg') ||
                fileName.endsWith('.mp3') ||
                fileName.endsWith('.mp4')) {
                console.log('🔗 Generating signed URL for:', object.Key);
                const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, getObjectCommand, {
                    expiresIn: 3600,
                });
                result.mediaFiles[fileName] = signedUrl;
                console.log('✅ Generated signed URL for:', fileName);
            }
        }
        console.log('✅ Successfully processed all files');
        console.log('📄 ASS files:', Object.keys(result.assFiles).length);
        console.log('📄 Media files:', Object.keys(result.mediaFiles).length);
        console.log('📄 Subtitle JSON files:', result.subtitleFiles.length);
        return {
            statusCode: 200,
            body: JSON.stringify({
                scenesCount: result.scenesCount,
                assFiles: result.assFiles,
                mediaFiles: result.mediaFiles,
                subtitleFiles: result.subtitleFiles,
                message: `Found ${Object.keys(result.assFiles).length} ASS files, ${Object.keys(result.mediaFiles).length} media files, and ${result.subtitleFiles.length} subtitle JSON files`,
                timestamp: timestamp,
            }),
        };
    }
    catch (error) {
        console.error('💥 Error in fetch data preview:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to fetch data preview',
                details: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};
exports.handler = handler;
