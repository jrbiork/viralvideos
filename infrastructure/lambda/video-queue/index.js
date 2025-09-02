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
            timestamp: request.timestamp || new Date().toISOString(),
            totalDuration: request.totalDuration || 30,
            sceneCount: request.sceneCount || 3,
        };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxvREFBb0U7QUFFcEUsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFVdEUsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUMxQixLQUEyQixFQUNLLEVBQUU7SUFDbEMsSUFBSSxDQUFDO1FBQ0gsSUFBSSxPQUErQixDQUFDO1FBRXBDLGlDQUFpQztRQUNqQyxJQUFJLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNmLDZDQUE2QztZQUM3QyxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDbkMsT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25DLENBQUM7aUJBQU0sQ0FBQztnQkFDTix1REFBdUQ7Z0JBQ3ZELE9BQU8sR0FBRyxLQUFLLENBQUMsSUFBOEIsQ0FBQztZQUNqRCxDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7WUFDTix5REFBeUQ7WUFDekQsT0FBTyxHQUFHLEtBQVksQ0FBQztRQUN6QixDQUFDO1FBRUQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNwQixPQUFPLENBQUMsR0FBRyxDQUFDLDZCQUE2QixDQUFDLENBQUM7WUFDM0MsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDO2FBQ3RELENBQUM7UUFDSixDQUFDO1FBRUQsdUVBQXVFO1FBQ3ZFLE1BQU0sTUFBTSxHQUNWLEtBQUssQ0FBQyxjQUFjLEVBQUUsVUFBVSxFQUFFLE1BQU0sSUFBSSxPQUFPLENBQUMsTUFBTSxJQUFJLFdBQVcsQ0FBQztRQUU1RSxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUNqQyxPQUFPLENBQUMsR0FBRyxDQUFDLHFDQUFxQyxDQUFDLENBQUM7WUFDbkQsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxDQUFDO2FBQzVELENBQUM7UUFDSixDQUFDO1FBRUQsMEJBQTBCO1FBQzFCLE1BQU0sV0FBVyxHQUFHO1lBQ2xCLElBQUksRUFBRSxnQkFBeUI7WUFDL0IsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNO1lBQ3RCLE1BQU0sRUFBRSxNQUFNLElBQUksT0FBTyxDQUFDLE1BQU0sSUFBSSxXQUFXO1lBQy9DLFNBQVMsRUFBRSxPQUFPLENBQUMsU0FBUyxJQUFJLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO1lBQ3hELGFBQWEsRUFBRSxPQUFPLENBQUMsYUFBYSxJQUFJLEVBQUU7WUFDMUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxVQUFVLElBQUksQ0FBQztTQUNwQyxDQUFDO1FBRUYsc0JBQXNCO1FBQ3RCLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSwrQkFBa0IsQ0FBQztZQUNoRCxRQUFRLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlO1lBQ3JDLFdBQVcsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQztZQUN4QyxpQkFBaUIsRUFBRTtnQkFDakIsV0FBVyxFQUFFO29CQUNYLFFBQVEsRUFBRSxRQUFRO29CQUNsQixXQUFXLEVBQUUsaUJBQWlCO2lCQUMvQjtnQkFDRCxNQUFNLEVBQUU7b0JBQ04sUUFBUSxFQUFFLFFBQVE7b0JBQ2xCLFdBQVcsRUFBRSxXQUFXLENBQUMsTUFBTTtpQkFDaEM7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILE1BQU0sV0FBVyxHQUFHLE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRXZELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixTQUFTLEVBQUUsV0FBVyxDQUFDLFNBQVM7Z0JBQ2hDLE9BQU8sRUFBRSw4Q0FBOEM7Z0JBQ3ZELE1BQU0sRUFBRSxRQUFRO2FBQ2pCLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE9BQU8sQ0FBQyxLQUFLLENBQ1gsY0FBYyxFQUNkLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUN4RCxDQUFDO1FBQ0YsT0FBTyxDQUFDLEtBQUssQ0FDWCxnQkFBZ0IsRUFDaEIsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUN6RCxDQUFDO1FBRUYsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQ25CLEtBQUssRUFBRSwwQ0FBMEM7Z0JBQ2pELE9BQU8sRUFBRSxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlO2FBQ2xFLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQS9GVyxRQUFBLE9BQU8sV0ErRmxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgU1FTQ2xpZW50LCBTZW5kTWVzc2FnZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3FzJztcblxuY29uc3Qgc3FzID0gbmV3IFNRU0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyB9KTtcblxuaW50ZXJmYWNlIFZpZGVvR2VuZXJhdGlvblJlcXVlc3Qge1xuICBwcm9tcHQ6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogc3RyaW5nO1xuICB0b3RhbER1cmF0aW9uOiBudW1iZXI7XG4gIHNjZW5lQ291bnQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoXG4gIGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCxcbik6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIHRyeSB7XG4gICAgbGV0IHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3Q7XG5cbiAgICAvLyBIYW5kbGUgZGlmZmVyZW50IGV2ZW50IGZvcm1hdHNcbiAgICBpZiAoZXZlbnQuYm9keSkge1xuICAgICAgLy8gQVBJIEdhdGV3YXkgZm9ybWF0IC0gYm9keSBpcyBhIEpTT04gc3RyaW5nXG4gICAgICBpZiAodHlwZW9mIGV2ZW50LmJvZHkgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJlcXVlc3QgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRGlyZWN0IExhbWJkYSBpbnZvY2F0aW9uIC0gYm9keSBpcyBhbHJlYWR5IGFuIG9iamVjdFxuICAgICAgICByZXF1ZXN0ID0gZXZlbnQuYm9keSBhcyBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0O1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBEaXJlY3QgTGFtYmRhIGludm9jYXRpb24gLSBwYXlsb2FkIGlzIHRoZSBlbnRpcmUgZXZlbnRcbiAgICAgIHJlcXVlc3QgPSBldmVudCBhcyBhbnk7XG4gICAgfVxuXG4gICAgaWYgKCFyZXF1ZXN0LnByb21wdCkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogUHJvbXB0IGlzIHJlcXVpcmVkJyk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdQcm9tcHQgaXMgcmVxdWlyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBFeHRyYWN0IHVzZXIgaW5mb3JtYXRpb24gZnJvbSBKV1QgYXV0aG9yaXplciBjb250ZXh0IG9yIHJlcXVlc3QgYm9keVxuICAgIGNvbnN0IHVzZXJJZCA9XG4gICAgICBldmVudC5yZXF1ZXN0Q29udGV4dD8uYXV0aG9yaXplcj8udXNlcklkIHx8IHJlcXVlc3QudXNlcklkIHx8ICdkZW1vLXVzZXInO1xuXG4gICAgaWYgKCFwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IFZJREVPX1FVRVVFX1VSTCBpcyBub3Qgc2V0Jyk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdRdWV1ZSBVUkwgbm90IGNvbmZpZ3VyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBQcmVwYXJlIG1lc3NhZ2UgZm9yIFNRU1xuICAgIGNvbnN0IG1lc3NhZ2VCb2R5ID0ge1xuICAgICAgdHlwZTogJ2dlbmVyYXRlLXZpZGVvJyBhcyBjb25zdCxcbiAgICAgIHByb21wdDogcmVxdWVzdC5wcm9tcHQsXG4gICAgICB1c2VySWQ6IHVzZXJJZCB8fCByZXF1ZXN0LnVzZXJJZCB8fCAnZGVtby11c2VyJyxcbiAgICAgIHRpbWVzdGFtcDogcmVxdWVzdC50aW1lc3RhbXAgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgdG90YWxEdXJhdGlvbjogcmVxdWVzdC50b3RhbER1cmF0aW9uIHx8IDMwLFxuICAgICAgc2NlbmVDb3VudDogcmVxdWVzdC5zY2VuZUNvdW50IHx8IDMsXG4gICAgfTtcblxuICAgIC8vIFNlbmQgbWVzc2FnZSB0byBTUVNcbiAgICBjb25zdCBzZW5kTWVzc2FnZUNvbW1hbmQgPSBuZXcgU2VuZE1lc3NhZ2VDb21tYW5kKHtcbiAgICAgIFF1ZXVlVXJsOiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwsXG4gICAgICBNZXNzYWdlQm9keTogSlNPTi5zdHJpbmdpZnkobWVzc2FnZUJvZHkpLFxuICAgICAgTWVzc2FnZUF0dHJpYnV0ZXM6IHtcbiAgICAgICAgUmVxdWVzdFR5cGU6IHtcbiAgICAgICAgICBEYXRhVHlwZTogJ1N0cmluZycsXG4gICAgICAgICAgU3RyaW5nVmFsdWU6ICdWaWRlb0dlbmVyYXRpb24nLFxuICAgICAgICB9LFxuICAgICAgICBVc2VySWQ6IHtcbiAgICAgICAgICBEYXRhVHlwZTogJ1N0cmluZycsXG4gICAgICAgICAgU3RyaW5nVmFsdWU6IG1lc3NhZ2VCb2R5LnVzZXJJZCxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBzcXNSZXNwb25zZSA9IGF3YWl0IHNxcy5zZW5kKHNlbmRNZXNzYWdlQ29tbWFuZCk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBtZXNzYWdlSWQ6IHNxc1Jlc3BvbnNlLk1lc3NhZ2VJZCxcbiAgICAgICAgbWVzc2FnZTogJ1ZpZGVvIGdlbmVyYXRpb24gcmVxdWVzdCBxdWV1ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgc3RhdHVzOiAncXVldWVkJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign8J+SpSBFcnJvciBpbiBxdWV1ZSBtYW5hZ2VyOicsIGVycm9yKTtcbiAgICBjb25zb2xlLmVycm9yKFxuICAgICAgJ0Vycm9yIHN0YWNrOicsXG4gICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3Iuc3RhY2sgOiAnTm8gc3RhY2sgdHJhY2UnLFxuICAgICk7XG4gICAgY29uc29sZS5lcnJvcihcbiAgICAgICdFcnJvciBtZXNzYWdlOicsXG4gICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICApO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdGYWlsZWQgdG8gcXVldWUgdmlkZW8gZ2VuZXJhdGlvbiByZXF1ZXN0JyxcbiAgICAgICAgZGV0YWlsczogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICB9KSxcbiAgICB9O1xuICB9XG59O1xuIl19