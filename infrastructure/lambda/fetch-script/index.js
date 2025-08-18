"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
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
        const timestamp = request.timestamp || event.queryStringParameters?.timestamp || null;
        console.log('🔍 Fetching script for user:', userId, 'timestamp:', timestamp);
        if (!process.env.VIDEO_PARTS_BUCKET_NAME) {
            console.log('❌ Error: VIDEO_PARTS_BUCKET_NAME is not set');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'S3 bucket name not configured' }),
            };
        }
        console.log('📋 Listing script files for user:', userId);
        const listCommand = new client_s3_1.ListObjectsV2Command({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Prefix: `${userId}/`,
        });
        const listResponse = await s3.send(listCommand);
        console.log('✅ Listed objects:', listResponse.Contents?.length || 0);
        if (!listResponse.Contents || listResponse.Contents.length === 0) {
            console.log('📭 No script files found for user:', userId);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    script: null,
                    message: 'No script files found',
                }),
            };
        }
        let targetScript = null;
        if (timestamp) {
            const specificScriptKey = `${userId}/${timestamp}.script.txt`;
            console.log('🔍 Looking for specific script:', specificScriptKey);
            targetScript = listResponse.Contents.find((object) => object.Key === specificScriptKey);
            if (!targetScript?.Key) {
                console.log('📭 Specific script not found:', specificScriptKey);
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        script: null,
                        message: 'Specific script not found',
                    }),
                };
            }
            console.log('📄 Found specific script:', targetScript.Key);
        }
        else {
            const scriptFiles = listResponse.Contents.filter((object) => object.Key?.endsWith('.script.txt'));
            console.log('scriptFiles:', scriptFiles);
            if (scriptFiles.length === 0) {
                console.log('📭 No script files found for user:', userId);
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        script: null,
                        message: 'No script files found',
                    }),
                };
            }
            targetScript = scriptFiles.sort((a, b) => {
                const aTime = a.LastModified?.getTime() || 0;
                const bTime = b.LastModified?.getTime() || 0;
                return bTime - aTime;
            })[0];
            if (!targetScript?.Key) {
                console.log('📭 No valid script file found for user:', userId);
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        script: null,
                        message: 'No valid script file found',
                    }),
                };
            }
            console.log('📄 Found latest script:', targetScript.Key);
        }
        console.log('📄 Fetching script:', targetScript.Key);
        const getObjectCommand = new client_s3_1.GetObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: targetScript.Key,
        });
        const scriptObject = await s3.send(getObjectCommand);
        const scriptContent = await scriptObject.Body?.transformToString();
        if (!scriptContent) {
            console.log('❌ Error: Could not read script content');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Could not read script content' }),
            };
        }
        const scriptData = JSON.parse(scriptContent);
        console.log('✅ Successfully fetched script with', scriptData.scenes?.length || 0, 'scenes');
        return {
            statusCode: 200,
            body: JSON.stringify({
                script: scriptData,
                message: `Found script with ${scriptData.scenes?.length || 0} scenes`,
                timestamp: targetScript.Key.split('/').pop()?.split('.')[0] || '',
            }),
        };
    }
    catch (error) {
        console.error('💥 Error in fetch script:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to fetch script',
                details: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};
exports.handler = handler;
