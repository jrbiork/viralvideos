"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSxvREFBZ0Q7QUFFaEQseURBQXNEO0FBQ3RELCtEQUE0RDtBQUM1RCxxRUFHa0M7QUFDbEMsK0RBQTREO0FBQzVELDZEQUEwRDtBQUUxRCxNQUFNLEdBQUcsR0FBRyxJQUFJLHNCQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVyxFQUFFLENBQUMsQ0FBQztBQUV0RSxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQUUsS0FBZSxFQUE2QixFQUFFO0lBQzFFLE9BQU8sTUFBTSxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDckMsQ0FBQyxDQUFDO0FBRlcsUUFBQSxPQUFPLFdBRWxCO0FBRUYsS0FBSyxVQUFVLGNBQWMsQ0FBQyxLQUFlO0lBQzNDLE1BQU0saUJBQWlCLEdBQWlDLEVBQUUsQ0FBQztJQUUzRCxLQUFLLE1BQU0sTUFBTSxJQUFJLEtBQUssQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUM7WUFDSCx5QkFBeUI7WUFDekIsTUFBTSxPQUFPLEdBQTJCLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBRWhFLE9BQU8sQ0FBQyxHQUFHLENBQUMseUJBQXlCLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3BELE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDbEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7WUFFdEQsNERBQTREO1lBQzVELElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxZQUFZLEVBQUUsQ0FBQztnQkFDbEMsTUFBTSxJQUFBLG1DQUFnQixFQUFDLE9BQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNqRCxDQUFDO2lCQUFNLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxlQUFlLEVBQUUsQ0FBQztnQkFDNUMsTUFBTSxJQUFBLHlDQUFtQixFQUFDLE9BQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNwRCxDQUFDO2lCQUFNLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxlQUFlLEVBQUUsQ0FBQztnQkFDNUMsTUFBTSxJQUFBLHlDQUFtQixFQUFDLE9BQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNwRCxDQUFDO2lCQUFNLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxjQUFjLEVBQUUsQ0FBQztnQkFDM0MsTUFBTSxJQUFBLHVDQUFrQixFQUFDLE9BQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNuRCxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sTUFBTSxJQUFBLCtDQUFzQixFQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNoRCxDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDckUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsY0FBYyxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQy9ELENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTztRQUNMLGlCQUFpQjtLQUNsQixDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNRU0V2ZW50LCBTUVNCYXRjaFJlc3BvbnNlIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5cbmltcG9ydCB7IFNRU0NsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuXG5pbXBvcnQgeyBwcm9jZXNzU2F2ZUltYWdlIH0gZnJvbSAnLi9wcm9jZXNzU2F2ZUltYWdlJztcbmltcG9ydCB7IHByb2Nlc3NBbmltYXRlSW1hZ2UgfSBmcm9tICcuL3Byb2Nlc3NBbmltYXRlSW1hZ2UnO1xuaW1wb3J0IHtcbiAgcHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbixcbiAgVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCxcbn0gZnJvbSAnLi9wcm9jZXNzVmlkZW9HZW5lcmF0aW9uJztcbmltcG9ydCB7IHByb2Nlc3NWaWRlb0NvbWJpbmUgfSBmcm9tICcuL3Byb2Nlc3NWaWRlb0NvbWJpbmUnO1xuaW1wb3J0IHsgcHJvY2Vzc0NyZWF0ZVNjZW5lIH0gZnJvbSAnLi9wcm9jZXNzQ3JlYXRlU2NlbmUnO1xuXG5jb25zdCBzcXMgPSBuZXcgU1FTQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+ID0+IHtcbiAgcmV0dXJuIGF3YWl0IGhhbmRsZVNRU0V2ZW50KGV2ZW50KTtcbn07XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVNRU0V2ZW50KGV2ZW50OiBTUVNFdmVudCk6IFByb21pc2U8U1FTQmF0Y2hSZXNwb25zZT4ge1xuICBjb25zdCBiYXRjaEl0ZW1GYWlsdXJlczogeyBpdGVtSWRlbnRpZmllcjogc3RyaW5nIH1bXSA9IFtdO1xuXG4gIGZvciAoY29uc3QgcmVjb3JkIG9mIGV2ZW50LlJlY29yZHMpIHtcbiAgICB0cnkge1xuICAgICAgLy8gUGFyc2UgdGhlIG1lc3NhZ2UgYm9keVxuICAgICAgY29uc3QgcmVxdWVzdDogVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCA9IEpTT04ucGFyc2UocmVjb3JkLmJvZHkpO1xuXG4gICAgICBjb25zb2xlLmxvZygn8J+UjSBSYXcgU1FTIHJlY29yZCBib2R5OicsIHJlY29yZC5ib2R5KTtcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SNIFBhcnNlZCByZXF1ZXN0IG9iamVjdDonLCByZXF1ZXN0KTtcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SNIFJlcXVlc3Qgdm9pY2UgZmllbGQ6JywgcmVxdWVzdC52b2ljZSk7XG5cbiAgICAgIC8vIERpc3BhdGNoIGJhc2VkIG9uIHJlcXVlc3QgdHlwZTsgZGVmYXVsdCB0byBnZW5lcmF0ZSB2aWRlb1xuICAgICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ3NhdmUtaW1hZ2UnKSB7XG4gICAgICAgIGF3YWl0IHByb2Nlc3NTYXZlSW1hZ2UocmVxdWVzdCBhcyBhbnksIHJlY29yZCk7XG4gICAgICB9IGVsc2UgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2FuaW1hdGUtaW1hZ2UnKSB7XG4gICAgICAgIGF3YWl0IHByb2Nlc3NBbmltYXRlSW1hZ2UocmVxdWVzdCBhcyBhbnksIHJlY29yZCk7XG4gICAgICB9IGVsc2UgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2NvbWJpbmUtdmlkZW8nKSB7XG4gICAgICAgIGF3YWl0IHByb2Nlc3NWaWRlb0NvbWJpbmUocmVxdWVzdCBhcyBhbnksIHJlY29yZCk7XG4gICAgICB9IGVsc2UgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2NyZWF0ZS1zY2VuZScpIHtcbiAgICAgICAgYXdhaXQgcHJvY2Vzc0NyZWF0ZVNjZW5lKHJlcXVlc3QgYXMgYW55LCByZWNvcmQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYXdhaXQgcHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbihyZXF1ZXN0LCByZWNvcmQpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgcHJvY2Vzc2luZyByZWNvcmQ6JywgcmVjb3JkLm1lc3NhZ2VJZCwgZXJyb3IpO1xuICAgICAgYmF0Y2hJdGVtRmFpbHVyZXMucHVzaCh7IGl0ZW1JZGVudGlmaWVyOiByZWNvcmQubWVzc2FnZUlkIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYmF0Y2hJdGVtRmFpbHVyZXMsXG4gIH07XG59XG4iXX0=