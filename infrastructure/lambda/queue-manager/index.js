"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
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
        if (!request.prompt) {
            console.log('❌ Error: Prompt is required');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Prompt is required' }),
            };
        }
        const userId = event.requestContext?.authorizer?.userId || request.userId || 'demo-user';
        const userEmail = event.requestContext?.authorizer?.email || request.userEmail || '';
        if (!process.env.VIDEO_QUEUE_URL) {
            console.log('❌ Error: VIDEO_QUEUE_URL is not set');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Queue URL not configured' }),
            };
        }
        const messageBody = {
            prompt: request.prompt,
            userId: userId || request.userId || 'demo-user',
            timestamp: request.timestamp || new Date().toISOString(),
            totalDuration: request.totalDuration || 30,
            sceneCount: request.sceneCount || 3,
        };
        const sendMessageCommand = new client_sqs_1.SendMessageCommand({
            QueueUrl: process.env.VIDEO_QUEUE_URL,
            MessageBody: JSON.stringify(messageBody),
            MessageAttributes: {
                RequestType: {
                    DataType: 'String',
                    StringValue: 'VideoGeneration',
                },
                UserId: {
                    DataType: 'String',
                    StringValue: messageBody.userId,
                },
            },
        });
        const sqsResponse = await sqs.send(sendMessageCommand);
        return {
            statusCode: 200,
            body: JSON.stringify({
                messageId: sqsResponse.MessageId,
                message: 'Video generation request queued successfully',
                status: 'queued',
            }),
        };
    }
    catch (error) {
        console.error('💥 Error in queue manager:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to queue video generation request',
                details: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};
exports.handler = handler;
