"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const processVideoGeneration_1 = require("./processVideoGeneration");
const processVideoCombine_1 = require("./processVideoCombine");
const processBatchEdit_1 = require("./processBatchEdit");
const processAnimateScene_1 = require("./processAnimateScene");
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
            else if (request.type === 'animate-scene') {
                await (0, processAnimateScene_1.processAnimateScene)(request, record);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSxvREFBc0U7QUFFdEUscUVBR2tDO0FBQ2xDLCtEQUE0RDtBQUM1RCx5REFBc0Q7QUFDdEQsK0RBQTREO0FBQzVELGtFQUErRDtBQUUvRCxNQUFNLEdBQUcsR0FBRyxJQUFJLHNCQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVyxFQUFFLENBQUMsQ0FBQztBQUV0RSxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQUUsS0FBZSxFQUE2QixFQUFFO0lBQzFFLE9BQU8sTUFBTSxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDckMsQ0FBQyxDQUFDO0FBRlcsUUFBQSxPQUFPLFdBRWxCO0FBRUYsS0FBSyxVQUFVLGNBQWMsQ0FBQyxLQUFlO0lBQzNDLE1BQU0saUJBQWlCLEdBQWlDLEVBQUUsQ0FBQztJQUUzRCxLQUFLLE1BQU0sTUFBTSxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNuQyxNQUFNLE9BQU8sR0FBMkIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEUsSUFBSSxDQUFDO1lBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDcEQsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNsRCxPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUV0RCw0REFBNEQ7WUFDNUQsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLGVBQWUsRUFBRSxDQUFDO2dCQUNyQyxNQUFNLElBQUEseUNBQW1CLEVBQUMsT0FBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3BELENBQUM7aUJBQU0sSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLFlBQVksRUFBRSxDQUFDO2dCQUN6QyxNQUFNLElBQUEsbUNBQWdCLEVBQUMsT0FBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ2pELENBQUM7aUJBQU0sSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLGVBQWUsRUFBRSxDQUFDO2dCQUM1QyxNQUFNLElBQUEseUNBQW1CLEVBQUMsT0FBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3BELENBQUM7aUJBQU0sQ0FBQztnQkFDTixNQUFNLElBQUEsK0NBQXNCLEVBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ2hELENBQUM7UUFDSCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsNEJBQTRCLEVBQUUsTUFBTSxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNyRSxrQkFBa0I7WUFDbEIsTUFBTSxJQUFBLHFDQUFpQixFQUNyQixPQUFPLEVBQ1AsT0FBTyxDQUFDLE1BQU0sRUFDZCxPQUFPLENBQUMsU0FBUyxFQUNqQixFQUFFLEtBQUssRUFBRSxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsRUFDbkUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUN6RCxDQUFDO1lBRUYsNEJBQTRCO1lBQzVCLElBQUksTUFBTSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBQzFDLE1BQU0sYUFBYSxHQUFHLElBQUksaUNBQW9CLENBQUM7b0JBQzdDLFFBQVEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWU7b0JBQ3JDLGFBQWEsRUFBRSxNQUFNLENBQUMsYUFBYTtpQkFDcEMsQ0FBQyxDQUFDO2dCQUNILE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUNoQyxDQUFDO1lBRUQsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsY0FBYyxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQy9ELENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTztRQUNMLGlCQUFpQjtLQUNsQixDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNRU0V2ZW50LCBTUVNCYXRjaFJlc3BvbnNlIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5cbmltcG9ydCB7IERlbGV0ZU1lc3NhZ2VDb21tYW5kLCBTUVNDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3FzJztcblxuaW1wb3J0IHtcbiAgcHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbixcbiAgVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCxcbn0gZnJvbSAnLi9wcm9jZXNzVmlkZW9HZW5lcmF0aW9uJztcbmltcG9ydCB7IHByb2Nlc3NWaWRlb0NvbWJpbmUgfSBmcm9tICcuL3Byb2Nlc3NWaWRlb0NvbWJpbmUnO1xuaW1wb3J0IHsgcHJvY2Vzc0JhdGNoRWRpdCB9IGZyb20gJy4vcHJvY2Vzc0JhdGNoRWRpdCc7XG5pbXBvcnQgeyBwcm9jZXNzQW5pbWF0ZVNjZW5lIH0gZnJvbSAnLi9wcm9jZXNzQW5pbWF0ZVNjZW5lJztcbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi4vdXRpbHMvYnJvYWRjYXN0UHJvZ3Jlc3MnO1xuXG5jb25zdCBzcXMgPSBuZXcgU1FTQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+ID0+IHtcbiAgcmV0dXJuIGF3YWl0IGhhbmRsZVNRU0V2ZW50KGV2ZW50KTtcbn07XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVNRU0V2ZW50KGV2ZW50OiBTUVNFdmVudCk6IFByb21pc2U8U1FTQmF0Y2hSZXNwb25zZT4ge1xuICBjb25zdCBiYXRjaEl0ZW1GYWlsdXJlczogeyBpdGVtSWRlbnRpZmllcjogc3RyaW5nIH1bXSA9IFtdO1xuXG4gIGZvciAoY29uc3QgcmVjb3JkIG9mIGV2ZW50LlJlY29yZHMpIHtcbiAgICBjb25zdCByZXF1ZXN0OiBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0ID0gSlNPTi5wYXJzZShyZWNvcmQuYm9keSk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SNIFJhdyBTUVMgcmVjb3JkIGJvZHk6JywgcmVjb3JkLmJvZHkpO1xuICAgICAgY29uc29sZS5sb2coJ/CflI0gUGFyc2VkIHJlcXVlc3Qgb2JqZWN0OicsIHJlcXVlc3QpO1xuICAgICAgY29uc29sZS5sb2coJ/CflI0gUmVxdWVzdCB2b2ljZSBmaWVsZDonLCByZXF1ZXN0LnZvaWNlKTtcblxuICAgICAgLy8gRGlzcGF0Y2ggYmFzZWQgb24gcmVxdWVzdCB0eXBlOyBkZWZhdWx0IHRvIGdlbmVyYXRlIHZpZGVvXG4gICAgICBpZiAocmVxdWVzdC50eXBlID09PSAnY29tYmluZS12aWRlbycpIHtcbiAgICAgICAgYXdhaXQgcHJvY2Vzc1ZpZGVvQ29tYmluZShyZXF1ZXN0IGFzIGFueSwgcmVjb3JkKTtcbiAgICAgIH0gZWxzZSBpZiAocmVxdWVzdC50eXBlID09PSAnYmF0Y2gtZWRpdCcpIHtcbiAgICAgICAgYXdhaXQgcHJvY2Vzc0JhdGNoRWRpdChyZXF1ZXN0IGFzIGFueSwgcmVjb3JkKTtcbiAgICAgIH0gZWxzZSBpZiAocmVxdWVzdC50eXBlID09PSAnYW5pbWF0ZS1zY2VuZScpIHtcbiAgICAgICAgYXdhaXQgcHJvY2Vzc0FuaW1hdGVTY2VuZShyZXF1ZXN0IGFzIGFueSwgcmVjb3JkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHByb2Nlc3NWaWRlb0dlbmVyYXRpb24ocmVxdWVzdCwgcmVjb3JkKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIHByb2Nlc3NpbmcgcmVjb3JkOicsIHJlY29yZC5tZXNzYWdlSWQsIGVycm9yKTtcbiAgICAgIC8vIGJyb2FkY2FzdCBlcnJvclxuICAgICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAgICdlcnJvcicsXG4gICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICByZXF1ZXN0LnRpbWVzdGFtcCxcbiAgICAgICAgeyBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicgfSxcbiAgICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICApO1xuXG4gICAgICAvLyByZW1vdmUgbWVzc2FnZSBmcm9tIHF1ZXVlXG4gICAgICBpZiAocmVjb3JkICYmIHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCkge1xuICAgICAgICBjb25zdCBkZWxldGVDb21tYW5kID0gbmV3IERlbGV0ZU1lc3NhZ2VDb21tYW5kKHtcbiAgICAgICAgICBRdWV1ZVVybDogcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMLFxuICAgICAgICAgIFJlY2VpcHRIYW5kbGU6IHJlY29yZC5yZWNlaXB0SGFuZGxlLFxuICAgICAgICB9KTtcbiAgICAgICAgYXdhaXQgc3FzLnNlbmQoZGVsZXRlQ29tbWFuZCk7XG4gICAgICB9XG5cbiAgICAgIGJhdGNoSXRlbUZhaWx1cmVzLnB1c2goeyBpdGVtSWRlbnRpZmllcjogcmVjb3JkLm1lc3NhZ2VJZCB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJhdGNoSXRlbUZhaWx1cmVzLFxuICB9O1xufVxuIl19