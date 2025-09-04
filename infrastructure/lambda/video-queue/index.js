"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const handler = async (event) => {
    try {
        let request;
        // Handle different event formats
        if (event.body) {
            // API Gateway format - body is a JSON string
            if (typeof event.body === 'string') {
                request = JSON.parse(event.body);
            }
            else {
                // Direct Lambda invocation - body is already an object
                request = event.body;
            }
        }
        else {
            // Direct Lambda invocation - payload is the entire event
            request = event;
        }
        if (!request.prompt) {
            console.log('❌ Error: Prompt is required');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Prompt is required' }),
            };
        }
        // Extract user information from JWT authorizer context or request body
        const userId = event.requestContext?.authorizer?.userId || request.userId || 'demo-user';
        if (!process.env.VIDEO_QUEUE_URL) {
            console.log('❌ Error: VIDEO_QUEUE_URL is not set');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Queue URL not configured' }),
            };
        }
        // Prepare message for SQS
        const messageBody = {
            type: 'generate-video',
            prompt: request.prompt,
            userId: userId || request.userId || 'demo-user',
            voice: request.voice || 'alloy',
            timestamp: request.timestamp || new Date().toISOString(),
            totalDuration: request.totalDuration || 30,
            sceneCount: request.sceneCount || 3,
            step: 1,
        };
        console.log('🎤 Video Queue - Request voice:', request.voice);
        console.log('🎤 Video Queue - MessageBody voice:', messageBody.voice);
        console.log('🚀 Video Queue - Full messageBody:', messageBody);
        // Send message to SQS
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxvREFBb0U7QUFFcEUsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFXdEUsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUMxQixLQUEyQixFQUNLLEVBQUU7SUFDbEMsSUFBSSxDQUFDO1FBQ0gsSUFBSSxPQUErQixDQUFDO1FBRXBDLGlDQUFpQztRQUNqQyxJQUFJLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNmLDZDQUE2QztZQUM3QyxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDbkMsT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25DLENBQUM7aUJBQU0sQ0FBQztnQkFDTix1REFBdUQ7Z0JBQ3ZELE9BQU8sR0FBRyxLQUFLLENBQUMsSUFBOEIsQ0FBQztZQUNqRCxDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7WUFDTix5REFBeUQ7WUFDekQsT0FBTyxHQUFHLEtBQVksQ0FBQztRQUN6QixDQUFDO1FBRUQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNwQixPQUFPLENBQUMsR0FBRyxDQUFDLDZCQUE2QixDQUFDLENBQUM7WUFDM0MsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDO2FBQ3RELENBQUM7UUFDSixDQUFDO1FBRUQsdUVBQXVFO1FBQ3ZFLE1BQU0sTUFBTSxHQUNWLEtBQUssQ0FBQyxjQUFjLEVBQUUsVUFBVSxFQUFFLE1BQU0sSUFBSSxP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LENBQUMsQ0FBQyxlQUFlO2FBQ2xFLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQXJHVyxRQUFBLE9BQU8sV0FxR2xCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgU1FTQ2xpZW50LCBTZW5kTWVzc2FnZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3FzJztcblxuY29uc3Qgc3FzID0gbmV3IFNRU0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyB9KTtcblxuaW50ZXJmYWNlIFZpZGVvR2VuZXJhdGlvblJlcXVlc3Qge1xuICBwcm9tcHQ6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIHZvaWNlPzogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyO1xuICBzY2VuZUNvdW50OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICB0cnkge1xuICAgIGxldCByZXF1ZXN0OiBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0O1xuXG4gICAgLy8gSGFuZGxlIGRpZmZlcmVudCBldmVudCBmb3JtYXRzXG4gICAgaWYgKGV2ZW50LmJvZHkpIHtcbiAgICAgIC8vIEFQSSBHYXRld2F5IGZvcm1hdCAtIGJvZHkgaXMgYSBKU09OIHN0cmluZ1xuICAgICAgaWYgKHR5cGVvZiBldmVudC5ib2R5ID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXF1ZXN0ID0gSlNPTi5wYXJzZShldmVudC5ib2R5KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIERpcmVjdCBMYW1iZGEgaW52b2NhdGlvbiAtIGJvZHkgaXMgYWxyZWFkeSBhbiBvYmplY3RcbiAgICAgICAgcmVxdWVzdCA9IGV2ZW50LmJvZHkgYXMgVmlkZW9HZW5lcmF0aW9uUmVxdWVzdDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRGlyZWN0IExhbWJkYSBpbnZvY2F0aW9uIC0gcGF5bG9hZCBpcyB0aGUgZW50aXJlIGV2ZW50XG4gICAgICByZXF1ZXN0ID0gZXZlbnQgYXMgYW55O1xuICAgIH1cblxuICAgIGlmICghcmVxdWVzdC5wcm9tcHQpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IFByb21wdCBpcyByZXF1aXJlZCcpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUHJvbXB0IGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gRXh0cmFjdCB1c2VyIGluZm9ybWF0aW9uIGZyb20gSldUIGF1dGhvcml6ZXIgY29udGV4dCBvciByZXF1ZXN0IGJvZHlcbiAgICBjb25zdCB1c2VySWQgPVxuICAgICAgZXZlbnQucmVxdWVzdENvbnRleHQ/LmF1dGhvcml6ZXI/LnVzZXJJZCB8fCByZXF1ZXN0LnVzZXJJZCB8fCAnZGVtby11c2VyJztcblxuICAgIGlmICghcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBWSURFT19RVUVVRV9VUkwgaXMgbm90IHNldCcpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUXVldWUgVVJMIG5vdCBjb25maWd1cmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gUHJlcGFyZSBtZXNzYWdlIGZvciBTUVNcbiAgICBjb25zdCBtZXNzYWdlQm9keSA9IHtcbiAgICAgIHR5cGU6ICdnZW5lcmF0ZS12aWRlbycgYXMgY29uc3QsXG4gICAgICBwcm9tcHQ6IHJlcXVlc3QucHJvbXB0LFxuICAgICAgdXNlcklkOiB1c2VySWQgfHwgcmVxdWVzdC51c2VySWQgfHwgJ2RlbW8tdXNlcicsXG4gICAgICB2b2ljZTogcmVxdWVzdC52b2ljZSB8fCAnYWxsb3knLFxuICAgICAgdGltZXN0YW1wOiByZXF1ZXN0LnRpbWVzdGFtcCB8fCBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICB0b3RhbER1cmF0aW9uOiByZXF1ZXN0LnRvdGFsRHVyYXRpb24gfHwgMzAsXG4gICAgICBzY2VuZUNvdW50OiByZXF1ZXN0LnNjZW5lQ291bnQgfHwgMyxcbiAgICAgIHN0ZXA6IDEsXG4gICAgfTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46kIFZpZGVvIFF1ZXVlIC0gUmVxdWVzdCB2b2ljZTonLCByZXF1ZXN0LnZvaWNlKTtcbiAgICBjb25zb2xlLmxvZygn8J+OpCBWaWRlbyBRdWV1ZSAtIE1lc3NhZ2VCb2R5IHZvaWNlOicsIG1lc3NhZ2VCb2R5LnZvaWNlKTtcbiAgICBjb25zb2xlLmxvZygn8J+agCBWaWRlbyBRdWV1ZSAtIEZ1bGwgbWVzc2FnZUJvZHk6JywgbWVzc2FnZUJvZHkpO1xuXG4gICAgLy8gU2VuZCBtZXNzYWdlIHRvIFNRU1xuICAgIGNvbnN0IHNlbmRNZXNzYWdlQ29tbWFuZCA9IG5ldyBTZW5kTWVzc2FnZUNvbW1hbmQoe1xuICAgICAgUXVldWVVcmw6IHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCxcbiAgICAgIE1lc3NhZ2VCb2R5OiBKU09OLnN0cmluZ2lmeShtZXNzYWdlQm9keSksXG4gICAgICBNZXNzYWdlQXR0cmlidXRlczoge1xuICAgICAgICBSZXF1ZXN0VHlwZToge1xuICAgICAgICAgIERhdGFUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICBTdHJpbmdWYWx1ZTogJ1ZpZGVvR2VuZXJhdGlvbicsXG4gICAgICAgIH0sXG4gICAgICAgIFVzZXJJZDoge1xuICAgICAgICAgIERhdGFUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICBTdHJpbmdWYWx1ZTogbWVzc2FnZUJvZHkudXNlcklkLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHNxc1Jlc3BvbnNlID0gYXdhaXQgc3FzLnNlbmQoc2VuZE1lc3NhZ2VDb21tYW5kKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIG1lc3NhZ2VJZDogc3FzUmVzcG9uc2UuTWVzc2FnZUlkLFxuICAgICAgICBtZXNzYWdlOiAnVmlkZW8gZ2VuZXJhdGlvbiByZXF1ZXN0IHF1ZXVlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICBzdGF0dXM6ICdxdWV1ZWQnLFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfwn5KlIEVycm9yIGluIHF1ZXVlIG1hbmFnZXI6JywgZXJyb3IpO1xuICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAnRXJyb3Igc3RhY2s6JyxcbiAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5zdGFjayA6ICdObyBzdGFjayB0cmFjZScsXG4gICAgKTtcbiAgICBjb25zb2xlLmVycm9yKFxuICAgICAgJ0Vycm9yIG1lc3NhZ2U6JyxcbiAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InLFxuICAgICk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBlcnJvcjogJ0ZhaWxlZCB0byBxdWV1ZSB2aWRlbyBnZW5lcmF0aW9uIHJlcXVlc3QnLFxuICAgICAgICBkZXRhaWxzOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=