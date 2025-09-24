"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const processSaveImage_1 = require("./processSaveImage");
const processAnimateImage_1 = require("./processAnimateImage");
const processVideoGeneration_1 = require("./processVideoGeneration");
const processVideoCombine_1 = require("./processVideoCombine");
const processCreateScene_1 = require("./processCreateScene");
const processRegenerateAudioScene_1 = require("./processRegenerateAudioScene");
const broadcastProgress_1 = require("../utils/broadcastProgress");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const handler = async (event) => {
    return await handleSQSEvent(event);
};
exports.handler = handler;
async function handleSQSEvent(event) {
    const batchItemFailures = [];
    for (const record of event.Records) {
        const request = JSON.parse(record.body);
        try {
            console.log('🔍 Raw SQS record body:', record.body);
            console.log('🔍 Parsed request object:', request);
            console.log('🔍 Request voice field:', request.voice);
            // Dispatch based on request type; default to generate video
            if (request.type === 'save-image') {
                await (0, processSaveImage_1.processSaveImage)(request, record);
            }
            else if (request.type === 'animate-image') {
                await (0, processAnimateImage_1.processAnimateImage)(request, record);
            }
            else if (request.type === 'combine-video') {
                await (0, processVideoCombine_1.processVideoCombine)(request, record);
            }
            else if (request.type === 'create-scene') {
                await (0, processCreateScene_1.processCreateScene)(request, record);
            }
            else if (request.type === 'regenerate-scene') {
                await (0, processRegenerateAudioScene_1.processRegenerateAudioScene)(request, record);
            }
            else {
                await (0, processVideoGeneration_1.processVideoGeneration)(request, record);
            }
        }
        catch (error) {
            console.error('❌ Error processing record:', record.messageId, error);
            // broadcast error
            await (0, broadcastProgress_1.broadcastProgress)('error', request.userId, request.timestamp, { error: error instanceof Error ? error.message : 'Unknown error' }, error instanceof Error ? error.message : 'Unknown error');
            // remove message from queue
            if (record && process.env.VIDEO_QUEUE_URL) {
                const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                    QueueUrl: process.env.VIDEO_QUEUE_URL,
                    ReceiptHandle: record.receiptHandle,
                });
                await sqs.send(deleteCommand);
            }
            batchItemFailures.push({ itemIdentifier: record.messageId });
        }
    }
    return {
        batchItemFailures,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSxvREFBc0U7QUFFdEUseURBQXNEO0FBQ3RELCtEQUE0RDtBQUM1RCxxRUFHa0M7QUFDbEMsK0RBQTREO0FBQzVELDZEQUEwRDtBQUMxRCwrRUFBNEU7QUFDNUUsa0VBQStEO0FBRS9ELE1BQU0sR0FBRyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBRXRFLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFBRSxLQUFlLEVBQTZCLEVBQUU7SUFDMUUsT0FBTyxNQUFNLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNyQyxDQUFDLENBQUM7QUFGVyxRQUFBLE9BQU8sV0FFbEI7QUFFRixLQUFLLFVBQVUsY0FBYyxDQUFDLEtBQWU7SUFDM0MsTUFBTSxpQkFBaUIsR0FBaUMsRUFBRSxDQUFDO0lBRTNELEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25DLE1BQU0sT0FBTyxHQUEyQixJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoRSxJQUFJLENBQUM7WUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNwRCxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ2xELE9BQU8sQ0FBQyxHQUFHLENBQUMseUJBQXlCLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXRELDREQUE0RDtZQUM1RCxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssWUFBWSxFQUFFLENBQUM7Z0JBQ2xDLE1BQU0sSUFBQSxtQ0FBZ0IsRUFBQyxPQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDakQsQ0FBQztpQkFBTSxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssZUFBZSxFQUFFLENBQUM7Z0JBQzVDLE1BQU0sSUFBQSx5Q0FBbUIsRUFBQyxPQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDcEQsQ0FBQztpQkFBTSxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssZUFBZSxFQUFFLENBQUM7Z0JBQzVDLE1BQU0sSUFBQSx5Q0FBbUIsRUFBQyxPQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDcEQsQ0FBQztpQkFBTSxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssY0FBYyxFQUFFLENBQUM7Z0JBQzNDLE1BQU0sSUFBQSx1Q0FBa0IsRUFBQyxPQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDbkQsQ0FBQztpQkFBTSxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssa0JBQWtCLEVBQUUsQ0FBQztnQkFDL0MsTUFBTSxJQUFBLHlEQUEyQixFQUFDLE9BQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUM1RCxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sTUFBTSxJQUFBLCtDQUFzQixFQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNoRCxDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDckUsa0JBQWtCO1lBQ2xCLE1BQU0sSUFBQSxxQ0FBaUIsRUFDckIsT0FBTyxFQUNQLE9BQU8sQ0FBQyxNQUFNLEVBQ2QsT0FBTyxDQUFDLFNBQVMsRUFDakIsRUFBRSxLQUFLLEVBQUUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxFQUFFLEVBQ25FLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FDekQsQ0FBQztZQUVGLDRCQUE0QjtZQUM1QixJQUFJLE1BQU0sSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUMxQyxNQUFNLGFBQWEsR0FBRyxJQUFJLGlDQUFvQixDQUFDO29CQUM3QyxRQUFRLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlO29CQUNyQyxhQUFhLEVBQUUsTUFBTSxDQUFDLGFBQWE7aUJBQ3BDLENBQUMsQ0FBQztnQkFDSCxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7WUFDaEMsQ0FBQztZQUVELGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUFFLGNBQWMsRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUMvRCxDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU87UUFDTCxpQkFBaUI7S0FDbEIsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTUVNFdmVudCwgU1FTQmF0Y2hSZXNwb25zZSB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuXG5pbXBvcnQgeyBEZWxldGVNZXNzYWdlQ29tbWFuZCwgU1FTQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5cbmltcG9ydCB7IHByb2Nlc3NTYXZlSW1hZ2UgfSBmcm9tICcuL3Byb2Nlc3NTYXZlSW1hZ2UnO1xuaW1wb3J0IHsgcHJvY2Vzc0FuaW1hdGVJbWFnZSB9IGZyb20gJy4vcHJvY2Vzc0FuaW1hdGVJbWFnZSc7XG5pbXBvcnQge1xuICBwcm9jZXNzVmlkZW9HZW5lcmF0aW9uLFxuICBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0LFxufSBmcm9tICcuL3Byb2Nlc3NWaWRlb0dlbmVyYXRpb24nO1xuaW1wb3J0IHsgcHJvY2Vzc1ZpZGVvQ29tYmluZSB9IGZyb20gJy4vcHJvY2Vzc1ZpZGVvQ29tYmluZSc7XG5pbXBvcnQgeyBwcm9jZXNzQ3JlYXRlU2NlbmUgfSBmcm9tICcuL3Byb2Nlc3NDcmVhdGVTY2VuZSc7XG5pbXBvcnQgeyBwcm9jZXNzUmVnZW5lcmF0ZUF1ZGlvU2NlbmUgfSBmcm9tICcuL3Byb2Nlc3NSZWdlbmVyYXRlQXVkaW9TY2VuZSc7XG5pbXBvcnQgeyBicm9hZGNhc3RQcm9ncmVzcyB9IGZyb20gJy4uL3V0aWxzL2Jyb2FkY2FzdFByb2dyZXNzJztcblxuY29uc3Qgc3FzID0gbmV3IFNRU0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyB9KTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IFNRU0V2ZW50KTogUHJvbWlzZTxTUVNCYXRjaFJlc3BvbnNlPiA9PiB7XG4gIHJldHVybiBhd2FpdCBoYW5kbGVTUVNFdmVudChldmVudCk7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTUVNFdmVudChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+IHtcbiAgY29uc3QgYmF0Y2hJdGVtRmFpbHVyZXM6IHsgaXRlbUlkZW50aWZpZXI6IHN0cmluZyB9W10gPSBbXTtcblxuICBmb3IgKGNvbnN0IHJlY29yZCBvZiBldmVudC5SZWNvcmRzKSB7XG4gICAgY29uc3QgcmVxdWVzdDogVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCA9IEpTT04ucGFyc2UocmVjb3JkLmJvZHkpO1xuICAgIHRyeSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+UjSBSYXcgU1FTIHJlY29yZCBib2R5OicsIHJlY29yZC5ib2R5KTtcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SNIFBhcnNlZCByZXF1ZXN0IG9iamVjdDonLCByZXF1ZXN0KTtcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SNIFJlcXVlc3Qgdm9pY2UgZmllbGQ6JywgcmVxdWVzdC52b2ljZSk7XG5cbiAgICAgIC8vIERpc3BhdGNoIGJhc2VkIG9uIHJlcXVlc3QgdHlwZTsgZGVmYXVsdCB0byBnZW5lcmF0ZSB2aWRlb1xuICAgICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ3NhdmUtaW1hZ2UnKSB7XG4gICAgICAgIGF3YWl0IHByb2Nlc3NTYXZlSW1hZ2UocmVxdWVzdCBhcyBhbnksIHJlY29yZCk7XG4gICAgICB9IGVsc2UgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2FuaW1hdGUtaW1hZ2UnKSB7XG4gICAgICAgIGF3YWl0IHByb2Nlc3NBbmltYXRlSW1hZ2UocmVxdWVzdCBhcyBhbnksIHJlY29yZCk7XG4gICAgICB9IGVsc2UgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2NvbWJpbmUtdmlkZW8nKSB7XG4gICAgICAgIGF3YWl0IHByb2Nlc3NWaWRlb0NvbWJpbmUocmVxdWVzdCBhcyBhbnksIHJlY29yZCk7XG4gICAgICB9IGVsc2UgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2NyZWF0ZS1zY2VuZScpIHtcbiAgICAgICAgYXdhaXQgcHJvY2Vzc0NyZWF0ZVNjZW5lKHJlcXVlc3QgYXMgYW55LCByZWNvcmQpO1xuICAgICAgfSBlbHNlIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdyZWdlbmVyYXRlLXNjZW5lJykge1xuICAgICAgICBhd2FpdCBwcm9jZXNzUmVnZW5lcmF0ZUF1ZGlvU2NlbmUocmVxdWVzdCBhcyBhbnksIHJlY29yZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCBwcm9jZXNzVmlkZW9HZW5lcmF0aW9uKHJlcXVlc3QsIHJlY29yZCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBwcm9jZXNzaW5nIHJlY29yZDonLCByZWNvcmQubWVzc2FnZUlkLCBlcnJvcik7XG4gICAgICAvLyBicm9hZGNhc3QgZXJyb3JcbiAgICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgICAnZXJyb3InLFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgcmVxdWVzdC50aW1lc3RhbXAsXG4gICAgICAgIHsgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InIH0sXG4gICAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InLFxuICAgICAgKTtcblxuICAgICAgLy8gcmVtb3ZlIG1lc3NhZ2UgZnJvbSBxdWV1ZVxuICAgICAgaWYgKHJlY29yZCAmJiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwpIHtcbiAgICAgICAgY29uc3QgZGVsZXRlQ29tbWFuZCA9IG5ldyBEZWxldGVNZXNzYWdlQ29tbWFuZCh7XG4gICAgICAgICAgUXVldWVVcmw6IHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCxcbiAgICAgICAgICBSZWNlaXB0SGFuZGxlOiByZWNvcmQucmVjZWlwdEhhbmRsZSxcbiAgICAgICAgfSk7XG4gICAgICAgIGF3YWl0IHNxcy5zZW5kKGRlbGV0ZUNvbW1hbmQpO1xuICAgICAgfVxuXG4gICAgICBiYXRjaEl0ZW1GYWlsdXJlcy5wdXNoKHsgaXRlbUlkZW50aWZpZXI6IHJlY29yZC5tZXNzYWdlSWQgfSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBiYXRjaEl0ZW1GYWlsdXJlcyxcbiAgfTtcbn1cbiJdfQ==