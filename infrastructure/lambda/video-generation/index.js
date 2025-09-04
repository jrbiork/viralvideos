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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFHQSxvREFBZ0Q7QUFFaEQseURBQXNEO0FBQ3RELCtEQUE0RDtBQUM1RCxxRUFHa0M7QUFFbEMsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFdEUsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLEtBQWUsRUFBNkIsRUFBRTtJQUMxRSxPQUFPLENBQUMsR0FBRyxDQUNULHlFQUF5RSxDQUMxRSxDQUFDO0lBQ0YsT0FBTyxNQUFNLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNyQyxDQUFDLENBQUM7QUFMVyxRQUFBLE9BQU8sV0FLbEI7QUFFRixLQUFLLFVBQVUsY0FBYyxDQUFDLEtBQWU7SUFDM0MsTUFBTSxpQkFBaUIsR0FBaUMsRUFBRSxDQUFDO0lBRTNELEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQztZQUNILHlCQUF5QjtZQUN6QixNQUFNLE9BQU8sR0FBMkIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFaEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDcEQsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNsRCxPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUV0RCw0REFBNEQ7WUFDNUQsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLFlBQVksRUFBRSxDQUFDO2dCQUNsQyxNQUFNLElBQUEsbUNBQWdCLEVBQUMsT0FBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ2pELENBQUM7aUJBQU0sSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLGVBQWUsRUFBRSxDQUFDO2dCQUM1QyxNQUFNLElBQUEseUNBQW1CLEVBQUMsT0FBYyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3BELENBQUM7aUJBQU0sQ0FBQztnQkFDTixNQUFNLElBQUEsK0NBQXNCLEVBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ2hELENBQUM7UUFDSCxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsNEJBQTRCLEVBQUUsTUFBTSxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNyRSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxjQUFjLEVBQUUsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDL0QsQ0FBQztJQUNILENBQUM7SUFFRCxPQUFPO1FBQ0wsaUJBQWlCO0tBQ2xCLENBQUM7QUFDSixDQUFDO0FBRUQsc0VBQXNFO0FBQ3RFLHlEQUF3RDtBQUEvQyxzSEFBQSxpQkFBaUIsT0FBQSIsInNvdXJjZXNDb250ZW50IjpbIi8vIFVwZGF0ZWQ6IEFkZGVkIGZsdWVudC1mZm1wZWcgZGVwZW5kZW5jeSBzdXBwb3J0XG5pbXBvcnQgeyBTUVNFdmVudCwgU1FTQmF0Y2hSZXNwb25zZSB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuXG5pbXBvcnQgeyBTUVNDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3FzJztcblxuaW1wb3J0IHsgcHJvY2Vzc1NhdmVJbWFnZSB9IGZyb20gJy4vcHJvY2Vzc1NhdmVJbWFnZSc7XG5pbXBvcnQgeyBwcm9jZXNzQW5pbWF0ZUltYWdlIH0gZnJvbSAnLi9wcm9jZXNzQW5pbWF0ZUltYWdlJztcbmltcG9ydCB7XG4gIHByb2Nlc3NWaWRlb0dlbmVyYXRpb24sXG4gIFZpZGVvR2VuZXJhdGlvblJlcXVlc3QsXG59IGZyb20gJy4vcHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbic7XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBTUVNFdmVudCk6IFByb21pc2U8U1FTQmF0Y2hSZXNwb25zZT4gPT4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+UhCBWaWRlbyBHZW5lcmF0aW9uIExhbWJkYSBzdGFydGVkIC0gVXBkYXRlZCB3aXRoIGZsdWVudC1mZm1wZWcgc3VwcG9ydCcsXG4gICk7XG4gIHJldHVybiBhd2FpdCBoYW5kbGVTUVNFdmVudChldmVudCk7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTUVNFdmVudChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+IHtcbiAgY29uc3QgYmF0Y2hJdGVtRmFpbHVyZXM6IHsgaXRlbUlkZW50aWZpZXI6IHN0cmluZyB9W10gPSBbXTtcblxuICBmb3IgKGNvbnN0IHJlY29yZCBvZiBldmVudC5SZWNvcmRzKSB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIFBhcnNlIHRoZSBtZXNzYWdlIGJvZHlcbiAgICAgIGNvbnN0IHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3QgPSBKU09OLnBhcnNlKHJlY29yZC5ib2R5KTtcbiAgICAgIFxuICAgICAgY29uc29sZS5sb2coJ/CflI0gUmF3IFNRUyByZWNvcmQgYm9keTonLCByZWNvcmQuYm9keSk7XG4gICAgICBjb25zb2xlLmxvZygn8J+UjSBQYXJzZWQgcmVxdWVzdCBvYmplY3Q6JywgcmVxdWVzdCk7XG4gICAgICBjb25zb2xlLmxvZygn8J+UjSBSZXF1ZXN0IHZvaWNlIGZpZWxkOicsIHJlcXVlc3Qudm9pY2UpO1xuXG4gICAgICAvLyBEaXNwYXRjaCBiYXNlZCBvbiByZXF1ZXN0IHR5cGU7IGRlZmF1bHQgdG8gZ2VuZXJhdGUgdmlkZW9cbiAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdzYXZlLWltYWdlJykge1xuICAgICAgICBhd2FpdCBwcm9jZXNzU2F2ZUltYWdlKHJlcXVlc3QgYXMgYW55LCByZWNvcmQpO1xuICAgICAgfSBlbHNlIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdhbmltYXRlLWltYWdlJykge1xuICAgICAgICBhd2FpdCBwcm9jZXNzQW5pbWF0ZUltYWdlKHJlcXVlc3QgYXMgYW55LCByZWNvcmQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgcHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbihyZXF1ZXN0LCByZWNvcmQpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgcHJvY2Vzc2luZyByZWNvcmQ6JywgcmVjb3JkLm1lc3NhZ2VJZCwgZXJyb3IpO1xuICAgICAgYmF0Y2hJdGVtRmFpbHVyZXMucHVzaCh7IGl0ZW1JZGVudGlmaWVyOiByZWNvcmQubWVzc2FnZUlkIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYmF0Y2hJdGVtRmFpbHVyZXMsXG4gIH07XG59XG5cbi8vIFJlLWV4cG9ydCB0aGUgYnJvYWRjYXN0UHJvZ3Jlc3MgZnVuY3Rpb24gZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbmV4cG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi9icm9hZGNhc3RQcm9ncmVzcyc7XG4iXX0=