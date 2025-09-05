"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastProgress = exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const processSaveImage_1 = require("./processSaveImage");
const processAnimateImage_1 = require("./processAnimateImage");
const processVideoGeneration_1 = require("./processVideoGeneration");
const processVideoCombine_1 = require("./processVideoCombine");
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
            else if (request.type === 'combine-video') {
                await (0, processVideoCombine_1.processVideoCombine)(request, record);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFHQSxvREFBZ0Q7QUFFaEQseURBQXNEO0FBQ3RELCtEQUE0RDtBQUM1RCxxRUFHa0M7QUFDbEMsK0RBQTREO0FBRTVELE1BQU0sR0FBRyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBRXRFLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFBRSxLQUFlLEVBQTZCLEVBQUU7SUFDMUUsT0FBTyxDQUFDLEdBQUcsQ0FDVCx5RUFBeUUsQ0FDMUUsQ0FBQztJQUNGLE9BQU8sTUFBTSxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDckMsQ0FBQyxDQUFDO0FBTFcsUUFBQSxPQUFPLFdBS2xCO0FBRUYsS0FBSyxVQUFVLGNBQWMsQ0FBQyxLQUFlO0lBQzNDLE1BQU0saUJBQWlCLEdBQWlDLEVBQUUsQ0FBQztJQUUzRCxLQUFLLE1BQU0sTUFBTSxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUM7WUFDSCx5QkFBeUI7WUFDekIsTUFBTSxPQUFPLEdBQTJCLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRWhFLE9BQU8sQ0FBQyxHQUFHLENBQUMseUJBQXlCLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3BELE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFdEQsNERBQTREO1lBQzVELElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxZQUFZLEVBQUUsQ0FBQztnQkFDbEMsTUFBTSxJQUFBLG1DQUFnQixFQUFDLE9BQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNqRCxDQUFDO2lCQUFNLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxlQUFlLEVBQUUsQ0FBQztnQkFDNUMsTUFBTSxJQUFBLHlDQUFtQixFQUFDLE9BQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNwRCxDQUFDO2lCQUFNLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxlQUFlLEVBQUUsQ0FBQztnQkFDNUMsTUFBTSxJQUFBLHlDQUFtQixFQUFDLE9BQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNwRCxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sTUFBTSxJQUFBLCtDQUFzQixFQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNoRCxDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDckUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsY0FBYyxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQy9ELENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTztRQUNMLGlCQUFpQjtLQUNsQixDQUFDO0FBQ0osQ0FBQztBQUVELHNFQUFzRTtBQUN0RSx5REFBd0Q7QUFBL0Msc0hBQUEsaUJBQWlCLE9BQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBVcGRhdGVkOiBBZGRlZCBmbHVlbnQtZmZtcGVnIGRlcGVuZGVuY3kgc3VwcG9ydFxuaW1wb3J0IHsgU1FTRXZlbnQsIFNRU0JhdGNoUmVzcG9uc2UgfSBmcm9tICdhd3MtbGFtYmRhJztcblxuaW1wb3J0IHsgU1FTQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5cbmltcG9ydCB7IHByb2Nlc3NTYXZlSW1hZ2UgfSBmcm9tICcuL3Byb2Nlc3NTYXZlSW1hZ2UnO1xuaW1wb3J0IHsgcHJvY2Vzc0FuaW1hdGVJbWFnZSB9IGZyb20gJy4vcHJvY2Vzc0FuaW1hdGVJbWFnZSc7XG5pbXBvcnQge1xuICBwcm9jZXNzVmlkZW9HZW5lcmF0aW9uLFxuICBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0LFxufSBmcm9tICcuL3Byb2Nlc3NWaWRlb0dlbmVyYXRpb24nO1xuaW1wb3J0IHsgcHJvY2Vzc1ZpZGVvQ29tYmluZSB9IGZyb20gJy4vcHJvY2Vzc1ZpZGVvQ29tYmluZSc7XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBTUVNFdmVudCk6IFByb21pc2U8U1FTQmF0Y2hSZXNwb25zZT4gPT4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+UhCBWaWRlbyBHZW5lcmF0aW9uIExhbWJkYSBzdGFydGVkIC0gVXBkYXRlZCB3aXRoIGZsdWVudC1mZm1wZWcgc3VwcG9ydCcsXG4gICk7XG4gIHJldHVybiBhd2FpdCBoYW5kbGVTUVNFdmVudChldmVudCk7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTUVNFdmVudChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+IHtcbiAgY29uc3QgYmF0Y2hJdGVtRmFpbHVyZXM6IHsgaXRlbUlkZW50aWZpZXI6IHN0cmluZyB9W10gPSBbXTtcblxuICBmb3IgKGNvbnN0IHJlY29yZCBvZiBldmVudC5SZWNvcmRzKSB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIFBhcnNlIHRoZSBtZXNzYWdlIGJvZHlcbiAgICAgIGNvbnN0IHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3QgPSBKU09OLnBhcnNlKHJlY29yZC5ib2R5KTtcblxuICAgICAgY29uc29sZS5sb2coJ/CflI0gUmF3IFNRUyByZWNvcmQgYm9keTonLCByZWNvcmQuYm9keSk7XG4gICAgICBjb25zb2xlLmxvZygn8J+UjSBQYXJzZWQgcmVxdWVzdCBvYmplY3Q6JywgcmVxdWVzdCk7XG4gICAgICBjb25zb2xlLmxvZygn8J+UjSBSZXF1ZXN0IHZvaWNlIGZpZWxkOicsIHJlcXVlc3Qudm9pY2UpO1xuXG4gICAgICAvLyBEaXNwYXRjaCBiYXNlZCBvbiByZXF1ZXN0IHR5cGU7IGRlZmF1bHQgdG8gZ2VuZXJhdGUgdmlkZW9cbiAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdzYXZlLWltYWdlJykge1xuICAgICAgICBhd2FpdCBwcm9jZXNzU2F2ZUltYWdlKHJlcXVlc3QgYXMgYW55LCByZWNvcmQpO1xuICAgICAgfSBlbHNlIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdhbmltYXRlLWltYWdlJykge1xuICAgICAgICBhd2FpdCBwcm9jZXNzQW5pbWF0ZUltYWdlKHJlcXVlc3QgYXMgYW55LCByZWNvcmQpO1xuICAgICAgfSBlbHNlIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdjb21iaW5lLXZpZGVvJykge1xuICAgICAgICBhd2FpdCBwcm9jZXNzVmlkZW9Db21iaW5lKHJlcXVlc3QgYXMgYW55LCByZWNvcmQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgcHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbihyZXF1ZXN0LCByZWNvcmQpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgcHJvY2Vzc2luZyByZWNvcmQ6JywgcmVjb3JkLm1lc3NhZ2VJZCwgZXJyb3IpO1xuICAgICAgYmF0Y2hJdGVtRmFpbHVyZXMucHVzaCh7IGl0ZW1JZGVudGlmaWVyOiByZWNvcmQubWVzc2FnZUlkIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYmF0Y2hJdGVtRmFpbHVyZXMsXG4gIH07XG59XG5cbi8vIFJlLWV4cG9ydCB0aGUgYnJvYWRjYXN0UHJvZ3Jlc3MgZnVuY3Rpb24gZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbmV4cG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi9icm9hZGNhc3RQcm9ncmVzcyc7XG4iXX0=