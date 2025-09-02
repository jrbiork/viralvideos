"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastProgress = exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const processSaveImage_1 = require("./processSaveImage");
const processAnimateImage_1 = require("./processAnimateImage");
const processVideoGeneration_1 = require("./processVideoGeneration");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const handler = async (event) => {
    console.log('🔄 Video Generation Lambda started - Updated with fluent-ffmpeg support');
    return await handleSQSEvent(event);
};
exports.handler = handler;
async function handleSQSEvent(event) {
    const batchItemFailures = [];
    for (const record of event.Records) {
        try {
            // Parse the message body
            const request = JSON.parse(record.body);
            // Dispatch based on request type; default to generate video
            if (request.type === 'save-image') {
                await (0, processSaveImage_1.processSaveImage)(request, record);
            }
            else if (request.type === 'animate-image') {
                await (0, processAnimateImage_1.processAnimateImage)(request, record);
            }
            else {
                await (0, processVideoGeneration_1.processVideoGeneration)(request, record);
            }
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
// Re-export the broadcastProgress function for backward compatibility
var broadcastProgress_1 = require("./broadcastProgress");
Object.defineProperty(exports, "broadcastProgress", { enumerable: true, get: function () { return broadcastProgress_1.broadcastProgress; } });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFHQSxvREFBZ0Q7QUFFaEQseURBQXNEO0FBQ3RELCtEQUE0RDtBQUM1RCxxRUFHa0M7QUFFbEMsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFdEUsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLEtBQWUsRUFBNkIsRUFBRTtJQUMxRSxPQUFPLENBQUMsR0FBRyxDQUNULHlFQUF5RSxDQUMxRSxDQUFDO0lBQ0YsT0FBTyxNQUFNLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNyQyxDQUFDLENBQUM7QUFMVyxRQUFBLE9BQU8sV0FLbEI7QUFFRixLQUFLLFVBQVUsY0FBYyxDQUFDLEtBQWU7SUFDM0MsTUFBTSxpQkFBaUIsR0FBaUMsRUFBRSxDQUFDO0lBRTNELEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQztZQUNILHlCQUF5QjtZQUN6QixNQUFNLE9BQU8sR0FBMkIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFaEUsNERBQTREO1lBQzVELElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxZQUFZLEVBQUUsQ0FBQztnQkFDbEMsTUFBTSxJQUFBLG1DQUFnQixFQUFDLE9BQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNqRCxDQUFDO2lCQUFNLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxlQUFlLEVBQUUsQ0FBQztnQkFDNUMsTUFBTSxJQUFBLHlDQUFtQixFQUFDLE9BQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNwRCxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sTUFBTSxJQUFBLCtDQUFzQixFQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNoRCxDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDckUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsY0FBYyxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQy9ELENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTztRQUNMLGlCQUFpQjtLQUNsQixDQUFDO0FBQ0osQ0FBQztBQUVELHNFQUFzRTtBQUN0RSx5REFBd0Q7QUFBL0Msc0hBQUEsaUJBQWlCLE9BQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBVcGRhdGVkOiBBZGRlZCBmbHVlbnQtZmZtcGVnIGRlcGVuZGVuY3kgc3VwcG9ydFxuaW1wb3J0IHsgU1FTRXZlbnQsIFNRU0JhdGNoUmVzcG9uc2UgfSBmcm9tICdhd3MtbGFtYmRhJztcblxuaW1wb3J0IHsgU1FTQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5cbmltcG9ydCB7IHByb2Nlc3NTYXZlSW1hZ2UgfSBmcm9tICcuL3Byb2Nlc3NTYXZlSW1hZ2UnO1xuaW1wb3J0IHsgcHJvY2Vzc0FuaW1hdGVJbWFnZSB9IGZyb20gJy4vcHJvY2Vzc0FuaW1hdGVJbWFnZSc7XG5pbXBvcnQge1xuICBwcm9jZXNzVmlkZW9HZW5lcmF0aW9uLFxuICBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0LFxufSBmcm9tICcuL3Byb2Nlc3NWaWRlb0dlbmVyYXRpb24nO1xuXG5jb25zdCBzcXMgPSBuZXcgU1FTQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+ID0+IHtcbiAgY29uc29sZS5sb2coXG4gICAgJ/CflIQgVmlkZW8gR2VuZXJhdGlvbiBMYW1iZGEgc3RhcnRlZCAtIFVwZGF0ZWQgd2l0aCBmbHVlbnQtZmZtcGVnIHN1cHBvcnQnLFxuICApO1xuICByZXR1cm4gYXdhaXQgaGFuZGxlU1FTRXZlbnQoZXZlbnQpO1xufTtcblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlU1FTRXZlbnQoZXZlbnQ6IFNRU0V2ZW50KTogUHJvbWlzZTxTUVNCYXRjaFJlc3BvbnNlPiB7XG4gIGNvbnN0IGJhdGNoSXRlbUZhaWx1cmVzOiB7IGl0ZW1JZGVudGlmaWVyOiBzdHJpbmcgfVtdID0gW107XG5cbiAgZm9yIChjb25zdCByZWNvcmQgb2YgZXZlbnQuUmVjb3Jkcykge1xuICAgIHRyeSB7XG4gICAgICAvLyBQYXJzZSB0aGUgbWVzc2FnZSBib2R5XG4gICAgICBjb25zdCByZXF1ZXN0OiBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0ID0gSlNPTi5wYXJzZShyZWNvcmQuYm9keSk7XG5cbiAgICAgIC8vIERpc3BhdGNoIGJhc2VkIG9uIHJlcXVlc3QgdHlwZTsgZGVmYXVsdCB0byBnZW5lcmF0ZSB2aWRlb1xuICAgICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ3NhdmUtaW1hZ2UnKSB7XG4gICAgICAgIGF3YWl0IHByb2Nlc3NTYXZlSW1hZ2UocmVxdWVzdCBhcyBhbnksIHJlY29yZCk7XG4gICAgICB9IGVsc2UgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2FuaW1hdGUtaW1hZ2UnKSB7XG4gICAgICAgIGF3YWl0IHByb2Nlc3NBbmltYXRlSW1hZ2UocmVxdWVzdCBhcyBhbnksIHJlY29yZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCBwcm9jZXNzVmlkZW9HZW5lcmF0aW9uKHJlcXVlc3QsIHJlY29yZCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBwcm9jZXNzaW5nIHJlY29yZDonLCByZWNvcmQubWVzc2FnZUlkLCBlcnJvcik7XG4gICAgICBiYXRjaEl0ZW1GYWlsdXJlcy5wdXNoKHsgaXRlbUlkZW50aWZpZXI6IHJlY29yZC5tZXNzYWdlSWQgfSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBiYXRjaEl0ZW1GYWlsdXJlcyxcbiAgfTtcbn1cblxuLy8gUmUtZXhwb3J0IHRoZSBicm9hZGNhc3RQcm9ncmVzcyBmdW5jdGlvbiBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuZXhwb3J0IHsgYnJvYWRjYXN0UHJvZ3Jlc3MgfSBmcm9tICcuL2Jyb2FkY2FzdFByb2dyZXNzJztcbiJdfQ==