"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastProgress = exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const processSaveImage_1 = require("./processSaveImage");
const processAnimateImage_1 = require("./processAnimateImage");
const processVideoGeneration_1 = require("./processVideoGeneration");
const processVideoCombine_1 = require("./processVideoCombine");
const processCreateScene_1 = require("./processCreateScene");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const handler = async (event) => {
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
            else if (request.type === 'create-scene') {
                await (0, processCreateScene_1.processCreateScene)(request, record);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSxvREFBZ0Q7QUFFaEQseURBQXNEO0FBQ3RELCtEQUE0RDtBQUM1RCxxRUFHa0M7QUFDbEMsK0RBQTREO0FBQzVELDZEQUEwRDtBQUUxRCxNQUFNLEdBQUcsR0FBRyxJQUFJLHNCQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVyxFQUFFLENBQUMsQ0FBQztBQUV0RSxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQUUsS0FBZSxFQUE2QixFQUFFO0lBQzFFLE9BQU8sTUFBTSxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDckMsQ0FBQyxDQUFDO0FBRlcsUUFBQSxPQUFPLFdBRWxCO0FBRUYsS0FBSyxVQUFVLGNBQWMsQ0FBQyxLQUFlO0lBQzNDLE1BQU0saUJBQWlCLEdBQWlDLEVBQUUsQ0FBQztJQUUzRCxLQUFLLE1BQU0sTUFBTSxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUM7WUFDSCx5QkFBeUI7WUFDekIsTUFBTSxPQUFPLEdBQTJCLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRWhFLE9BQU8sQ0FBQyxHQUFHLENBQUMseUJBQXlCLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3BELE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFdEQsNERBQTREO1lBQzVELElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxZQUFZLEVBQUUsQ0FBQztnQkFDbEMsTUFBTSxJQUFBLG1DQUFnQixFQUFDLE9BQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNqRCxDQUFDO2lCQUFNLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxlQUFlLEVBQUUsQ0FBQztnQkFDNUMsTUFBTSxJQUFBLHlDQUFtQixFQUFDLE9BQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNwRCxDQUFDO2lCQUFNLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxlQUFlLEVBQUUsQ0FBQztnQkFDNUMsTUFBTSxJQUFBLHlDQUFtQixFQUFDLE9BQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNwRCxDQUFDO2lCQUFNLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxjQUFjLEVBQUUsQ0FBQztnQkFDM0MsTUFBTSxJQUFBLHVDQUFrQixFQUFDLE9BQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNuRCxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sTUFBTSxJQUFBLCtDQUFzQixFQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNoRCxDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDckUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsY0FBYyxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQy9ELENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTztRQUNMLGlCQUFpQjtLQUNsQixDQUFDO0FBQ0osQ0FBQztBQUVELHNFQUFzRTtBQUN0RSx5REFBd0Q7QUFBL0Msc0hBQUEsaUJBQWlCLE9BQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTUVNFdmVudCwgU1FTQmF0Y2hSZXNwb25zZSB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuXG5pbXBvcnQgeyBTUVNDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3FzJztcblxuaW1wb3J0IHsgcHJvY2Vzc1NhdmVJbWFnZSB9IGZyb20gJy4vcHJvY2Vzc1NhdmVJbWFnZSc7XG5pbXBvcnQgeyBwcm9jZXNzQW5pbWF0ZUltYWdlIH0gZnJvbSAnLi9wcm9jZXNzQW5pbWF0ZUltYWdlJztcbmltcG9ydCB7XG4gIHByb2Nlc3NWaWRlb0dlbmVyYXRpb24sXG4gIFZpZGVvR2VuZXJhdGlvblJlcXVlc3QsXG59IGZyb20gJy4vcHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbic7XG5pbXBvcnQgeyBwcm9jZXNzVmlkZW9Db21iaW5lIH0gZnJvbSAnLi9wcm9jZXNzVmlkZW9Db21iaW5lJztcbmltcG9ydCB7IHByb2Nlc3NDcmVhdGVTY2VuZSB9IGZyb20gJy4vcHJvY2Vzc0NyZWF0ZVNjZW5lJztcblxuY29uc3Qgc3FzID0gbmV3IFNRU0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyB9KTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IFNRU0V2ZW50KTogUHJvbWlzZTxTUVNCYXRjaFJlc3BvbnNlPiA9PiB7XG4gIHJldHVybiBhd2FpdCBoYW5kbGVTUVNFdmVudChldmVudCk7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTUVNFdmVudChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+IHtcbiAgY29uc3QgYmF0Y2hJdGVtRmFpbHVyZXM6IHsgaXRlbUlkZW50aWZpZXI6IHN0cmluZyB9W10gPSBbXTtcblxuICBmb3IgKGNvbnN0IHJlY29yZCBvZiBldmVudC5SZWNvcmRzKSB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIFBhcnNlIHRoZSBtZXNzYWdlIGJvZHlcbiAgICAgIGNvbnN0IHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3QgPSBKU09OLnBhcnNlKHJlY29yZC5ib2R5KTtcblxuICAgICAgY29uc29sZS5sb2coJ/CflI0gUmF3IFNRUyByZWNvcmQgYm9keTonLCByZWNvcmQuYm9keSk7XG4gICAgICBjb25zb2xlLmxvZygn8J+UjSBQYXJzZWQgcmVxdWVzdCBvYmplY3Q6JywgcmVxdWVzdCk7XG4gICAgICBjb25zb2xlLmxvZygn8J+UjSBSZXF1ZXN0IHZvaWNlIGZpZWxkOicsIHJlcXVlc3Qudm9pY2UpO1xuXG4gICAgICAvLyBEaXNwYXRjaCBiYXNlZCBvbiByZXF1ZXN0IHR5cGU7IGRlZmF1bHQgdG8gZ2VuZXJhdGUgdmlkZW9cbiAgICAgIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdzYXZlLWltYWdlJykge1xuICAgICAgICBhd2FpdCBwcm9jZXNzU2F2ZUltYWdlKHJlcXVlc3QgYXMgYW55LCByZWNvcmQpO1xuICAgICAgfSBlbHNlIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdhbmltYXRlLWltYWdlJykge1xuICAgICAgICBhd2FpdCBwcm9jZXNzQW5pbWF0ZUltYWdlKHJlcXVlc3QgYXMgYW55LCByZWNvcmQpO1xuICAgICAgfSBlbHNlIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdjb21iaW5lLXZpZGVvJykge1xuICAgICAgICBhd2FpdCBwcm9jZXNzVmlkZW9Db21iaW5lKHJlcXVlc3QgYXMgYW55LCByZWNvcmQpO1xuICAgICAgfSBlbHNlIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdjcmVhdGUtc2NlbmUnKSB7XG4gICAgICAgIGF3YWl0IHByb2Nlc3NDcmVhdGVTY2VuZShyZXF1ZXN0IGFzIGFueSwgcmVjb3JkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGF3YWl0IHByb2Nlc3NWaWRlb0dlbmVyYXRpb24ocmVxdWVzdCwgcmVjb3JkKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIHByb2Nlc3NpbmcgcmVjb3JkOicsIHJlY29yZC5tZXNzYWdlSWQsIGVycm9yKTtcbiAgICAgIGJhdGNoSXRlbUZhaWx1cmVzLnB1c2goeyBpdGVtSWRlbnRpZmllcjogcmVjb3JkLm1lc3NhZ2VJZCB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJhdGNoSXRlbUZhaWx1cmVzLFxuICB9O1xufVxuXG4vLyBSZS1leHBvcnQgdGhlIGJyb2FkY2FzdFByb2dyZXNzIGZ1bmN0aW9uIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG5leHBvcnQgeyBicm9hZGNhc3RQcm9ncmVzcyB9IGZyb20gJy4vYnJvYWRjYXN0UHJvZ3Jlc3MnO1xuIl19