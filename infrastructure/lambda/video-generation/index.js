"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const processVideoGeneration_1 = require("./processVideoGeneration");
const processVideoCombine_1 = require("./processVideoCombine");
const processBatchEdit_1 = require("./processBatchEdit");
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
            if (request.type === 'combine-video') {
                await (0, processVideoCombine_1.processVideoCombine)(request, record);
            }
            else if (request.type === 'batch-edit') {
                await (0, processBatchEdit_1.processBatchEdit)(request, record);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSxvREFBc0U7QUFFdEUscUVBR2tDO0FBQ2xDLCtEQUE0RDtBQUM1RCx5REFBc0Q7QUFDdEQsa0VBQStEO0FBRS9ELE1BQU0sR0FBRyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBRXRFLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFBRSxLQUFlLEVBQTZCLEVBQUU7SUFDMUUsT0FBTyxNQUFNLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNyQyxDQUFDLENBQUM7QUFGVyxRQUFBLE9BQU8sV0FFbEI7QUFFRixLQUFLLFVBQVUsY0FBYyxDQUFDLEtBQWU7SUFDM0MsTUFBTSxpQkFBaUIsR0FBaUMsRUFBRSxDQUFDO0lBRTNELEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25DLE1BQU0sT0FBTyxHQUEyQixJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoRSxJQUFJLENBQUM7WUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNwRCxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ2xELE9BQU8sQ0FBQyxHQUFHLENBQUMseUJBQXlCLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXRELDREQUE0RDtZQUM1RCxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssZUFBZSxFQUFFLENBQUM7Z0JBQ3JDLE1BQU0sSUFBQSx5Q0FBbUIsRUFBQyxPQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDcEQsQ0FBQztpQkFBTSxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssWUFBWSxFQUFFLENBQUM7Z0JBQ3pDLE1BQU0sSUFBQSxtQ0FBZ0IsRUFBQyxPQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDakQsQ0FBQztpQkFBTSxDQUFDO2dCQUNOLE1BQU0sSUFBQSwrQ0FBc0IsRUFBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDaEQsQ0FBQztRQUNILENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3JFLGtCQUFrQjtZQUNsQixNQUFNLElBQUEscUNBQWlCLEVBQ3JCLE9BQU8sRUFDUCxPQUFPLENBQUMsTUFBTSxFQUNkLE9BQU8sQ0FBQyxTQUFTLEVBQ2pCLEVBQUUsS0FBSyxFQUFFLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWUsRUFBRSxFQUNuRSxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQ3pELENBQUM7WUFFRiw0QkFBNEI7WUFDNUIsSUFBSSxNQUFNLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDMUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxpQ0FBb0IsQ0FBQztvQkFDN0MsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZTtvQkFDckMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxhQUFhO2lCQUNwQyxDQUFDLENBQUM7Z0JBQ0gsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ2hDLENBQUM7WUFFRCxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxjQUFjLEVBQUUsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDL0QsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPO1FBQ0wsaUJBQWlCO0tBQ2xCLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU1FTRXZlbnQsIFNRU0JhdGNoUmVzcG9uc2UgfSBmcm9tICdhd3MtbGFtYmRhJztcblxuaW1wb3J0IHsgRGVsZXRlTWVzc2FnZUNvbW1hbmQsIFNRU0NsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuXG5pbXBvcnQge1xuICBwcm9jZXNzVmlkZW9HZW5lcmF0aW9uLFxuICBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0LFxufSBmcm9tICcuL3Byb2Nlc3NWaWRlb0dlbmVyYXRpb24nO1xuaW1wb3J0IHsgcHJvY2Vzc1ZpZGVvQ29tYmluZSB9IGZyb20gJy4vcHJvY2Vzc1ZpZGVvQ29tYmluZSc7XG5pbXBvcnQgeyBwcm9jZXNzQmF0Y2hFZGl0IH0gZnJvbSAnLi9wcm9jZXNzQmF0Y2hFZGl0JztcbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi4vdXRpbHMvYnJvYWRjYXN0UHJvZ3Jlc3MnO1xuXG5jb25zdCBzcXMgPSBuZXcgU1FTQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+ID0+IHtcbiAgcmV0dXJuIGF3YWl0IGhhbmRsZVNRU0V2ZW50KGV2ZW50KTtcbn07XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVNRU0V2ZW50KGV2ZW50OiBTUVNFdmVudCk6IFByb21pc2U8U1FTQmF0Y2hSZXNwb25zZT4ge1xuICBjb25zdCBiYXRjaEl0ZW1GYWlsdXJlczogeyBpdGVtSWRlbnRpZmllcjogc3RyaW5nIH1bXSA9IFtdO1xuXG4gIGZvciAoY29uc3QgcmVjb3JkIG9mIGV2ZW50LlJlY29yZHMpIHtcbiAgICBjb25zdCByZXF1ZXN0OiBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0ID0gSlNPTi5wYXJzZShyZWNvcmQuYm9keSk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SNIFJhdyBTUVMgcmVjb3JkIGJvZHk6JywgcmVjb3JkLmJvZHkpO1xuICAgICAgY29uc29sZS5sb2coJ/CflI0gUGFyc2VkIHJlcXVlc3Qgb2JqZWN0OicsIHJlcXVlc3QpO1xuICAgICAgY29uc29sZS5sb2coJ/CflI0gUmVxdWVzdCB2b2ljZSBmaWVsZDonLCByZXF1ZXN0LnZvaWNlKTtcblxuICAgICAgLy8gRGlzcGF0Y2ggYmFzZWQgb24gcmVxdWVzdCB0eXBlOyBkZWZhdWx0IHRvIGdlbmVyYXRlIHZpZGVvXG4gICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnY29tYmluZS12aWRlbycpIHtcbiAgICAgICAgYXdhaXQgcHJvY2Vzc1ZpZGVvQ29tYmluZShyZXF1ZXN0IGFzIGFueSwgcmVjb3JkKTtcbiAgICAgIH0gZWxzZSBpZiAocmVxdWVzdC50eXBlID09PSAnYmF0Y2gtZWRpdCcpIHtcbiAgICAgICAgYXdhaXQgcHJvY2Vzc0JhdGNoRWRpdChyZXF1ZXN0IGFzIGFueSwgcmVjb3JkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHByb2Nlc3NWaWRlb0dlbmVyYXRpb24ocmVxdWVzdCwgcmVjb3JkKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIHByb2Nlc3NpbmcgcmVjb3JkOicsIHJlY29yZC5tZXNzYWdlSWQsIGVycm9yKTtcbiAgICAgIC8vIGJyb2FkY2FzdCBlcnJvclxuICAgICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAgICdlcnJvcicsXG4gICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICByZXF1ZXN0LnRpbWVzdGFtcCxcbiAgICAgICAgeyBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicgfSxcbiAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICApO1xuXG4gICAgICAvLyByZW1vdmUgbWVzc2FnZSBmcm9tIHF1ZXVlXG4gICAgICBpZiAocmVjb3JkICYmIHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCkge1xuICAgICAgICBjb25zdCBkZWxldGVDb21tYW5kID0gbmV3IERlbGV0ZU1lc3NhZ2VDb21tYW5kKHtcbiAgICAgICAgICBRdWV1ZVVybDogcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMLFxuICAgICAgICAgIFJlY2VpcHRIYW5kbGU6IHJlY29yZC5yZWNlaXB0SGFuZGxlLFxuICAgICAgICB9KTtcbiAgICAgICAgYXdhaXQgc3FzLnNlbmQoZGVsZXRlQ29tbWFuZCk7XG4gICAgICB9XG5cbiAgICAgIGJhdGNoSXRlbUZhaWx1cmVzLnB1c2goeyBpdGVtSWRlbnRpZmllcjogcmVjb3JkLm1lc3NhZ2VJZCB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJhdGNoSXRlbUZhaWx1cmVzLFxuICB9O1xufVxuIl19