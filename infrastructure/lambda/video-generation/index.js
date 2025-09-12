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
            else if (request.type === 'regenerate-scene') {
                await (0, processRegenerateAudioScene_1.processRegenerateAudioScene)(request, record);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSxvREFBZ0Q7QUFFaEQseURBQXNEO0FBQ3RELCtEQUE0RDtBQUM1RCxxRUFHa0M7QUFDbEMsK0RBQTREO0FBQzVELDZEQUEwRDtBQUMxRCwrRUFBNEU7QUFFNUUsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFdEUsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLEtBQWUsRUFBNkIsRUFBRTtJQUMxRSxPQUFPLE1BQU0sY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3JDLENBQUMsQ0FBQztBQUZXLFFBQUEsT0FBTyxXQUVsQjtBQUVGLEtBQUssVUFBVSxjQUFjLENBQUMsS0FBZTtJQUMzQyxNQUFNLGlCQUFpQixHQUFpQyxFQUFFLENBQUM7SUFFM0QsS0FBSyxNQUFNLE1BQU0sSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbkMsSUFBSSxDQUFDO1lBQ0gseUJBQXlCO1lBQ3pCLE1BQU0sT0FBTyxHQUEyQixJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVoRSxPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNwRCxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ2xELE9BQU8sQ0FBQyxHQUFHLENBQUMseUJBQXlCLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRXRELDREQUE0RDtZQUM1RCxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssWUFBWSxFQUFFLENBQUM7Z0JBQ2xDLE1BQU0sSUFBQSxtQ0FBZ0IsRUFBQyxPQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDakQsQ0FBQztpQkFBTSxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssZUFBZSxFQUFFLENBQUM7Z0JBQzVDLE1BQU0sSUFBQSx5Q0FBbUIsRUFBQyxPQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDcEQsQ0FBQztpQkFBTSxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssZUFBZSxFQUFFLENBQUM7Z0JBQzVDLE1BQU0sSUFBQSx5Q0FBbUIsRUFBQyxPQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDcEQsQ0FBQztpQkFBTSxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssY0FBYyxFQUFFLENBQUM7Z0JBQzNDLE1BQU0sSUFBQSx1Q0FBa0IsRUFBQyxPQUFjLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDbkQsQ0FBQztpQkFBTSxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssa0JBQWtCLEVBQUUsQ0FBQztnQkFDL0MsTUFBTSxJQUFBLHlEQUEyQixFQUFDLE9BQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztZQUM1RCxDQUFDO2lCQUFNLENBQUM7Z0JBQ04sTUFBTSxJQUFBLCtDQUFzQixFQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNoRCxDQUFDO1FBQ0gsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDckUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLEVBQUUsY0FBYyxFQUFFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQy9ELENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTztRQUNMLGlCQUFpQjtLQUNsQixDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNRU0V2ZW50LCBTUVNCYXRjaFJlc3BvbnNlIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5cbmltcG9ydCB7IFNRU0NsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuXG5pbXBvcnQgeyBwcm9jZXNzU2F2ZUltYWdlIH0gZnJvbSAnLi9wcm9jZXNzU2F2ZUltYWdlJztcbmltcG9ydCB7IHByb2Nlc3NBbmltYXRlSW1hZ2UgfSBmcm9tICcuL3Byb2Nlc3NBbmltYXRlSW1hZ2UnO1xuaW1wb3J0IHtcbiAgcHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbixcbiAgVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCxcbn0gZnJvbSAnLi9wcm9jZXNzVmlkZW9HZW5lcmF0aW9uJztcbmltcG9ydCB7IHByb2Nlc3NWaWRlb0NvbWJpbmUgfSBmcm9tICcuL3Byb2Nlc3NWaWRlb0NvbWJpbmUnO1xuaW1wb3J0IHsgcHJvY2Vzc0NyZWF0ZVNjZW5lIH0gZnJvbSAnLi9wcm9jZXNzQ3JlYXRlU2NlbmUnO1xuaW1wb3J0IHsgcHJvY2Vzc1JlZ2VuZXJhdGVBdWRpb1NjZW5lIH0gZnJvbSAnLi9wcm9jZXNzUmVnZW5lcmF0ZUF1ZGlvU2NlbmUnO1xuXG5jb25zdCBzcXMgPSBuZXcgU1FTQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+ID0+IHtcbiAgcmV0dXJuIGF3YWl0IGhhbmRsZVNRU0V2ZW50KGV2ZW50KTtcbn07XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVNRU0V2ZW50KGV2ZW50OiBTUVNFdmVudCk6IFByb21pc2U8U1FTQmF0Y2hSZXNwb25zZT4ge1xuICBjb25zdCBiYXRjaEl0ZW1GYWlsdXJlczogeyBpdGVtSWRlbnRpZmllcjogc3RyaW5nIH1bXSA9IFtdO1xuXG4gIGZvciAoY29uc3QgcmVjb3JkIG9mIGV2ZW50LlJlY29yZHMpIHtcbiAgICB0cnkge1xuICAgICAgLy8gUGFyc2UgdGhlIG1lc3NhZ2UgYm9keVxuICAgICAgY29uc3QgcmVxdWVzdDogVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCA9IEpTT04ucGFyc2UocmVjb3JkLmJvZHkpO1xuXG4gICAgICBjb25zb2xlLmxvZygn8J+UjSBSYXcgU1FTIHJlY29yZCBib2R5OicsIHJlY29yZC5ib2R5KTtcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SNIFBhcnNlZCByZXF1ZXN0IG9iamVjdDonLCByZXF1ZXN0KTtcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SNIFJlcXVlc3Qgdm9pY2UgZmllbGQ6JywgcmVxdWVzdC52b2ljZSk7XG5cbiAgICAgIC8vIERpc3BhdGNoIGJhc2VkIG9uIHJlcXVlc3QgdHlwZTsgZGVmYXVsdCB0byBnZW5lcmF0ZSB2aWRlb1xuICAgICAgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ3NhdmUtaW1hZ2UnKSB7XG4gICAgICAgIGF3YWl0IHByb2Nlc3NTYXZlSW1hZ2UocmVxdWVzdCBhcyBhbnksIHJlY29yZCk7XG4gICAgICB9IGVsc2UgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2FuaW1hdGUtaW1hZ2UnKSB7XG4gICAgICAgIGF3YWl0IHByb2Nlc3NBbmltYXRlSW1hZ2UocmVxdWVzdCBhcyBhbnksIHJlY29yZCk7XG4gICAgICB9IGVsc2UgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2NvbWJpbmUtdmlkZW8nKSB7XG4gICAgICAgIGF3YWl0IHByb2Nlc3NWaWRlb0NvbWJpbmUocmVxdWVzdCBhcyBhbnksIHJlY29yZCk7XG4gICAgICB9IGVsc2UgaWYgKHJlcXVlc3QudHlwZSA9PT0gJ2NyZWF0ZS1zY2VuZScpIHtcbiAgICAgICAgYXdhaXQgcHJvY2Vzc0NyZWF0ZVNjZW5lKHJlcXVlc3QgYXMgYW55LCByZWNvcmQpO1xuICAgICAgfSBlbHNlIGlmIChyZXF1ZXN0LnR5cGUgPT09ICdyZWdlbmVyYXRlLXNjZW5lJykge1xuICAgICAgICBhd2FpdCBwcm9jZXNzUmVnZW5lcmF0ZUF1ZGlvU2NlbmUocmVxdWVzdCBhcyBhbnksIHJlY29yZCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhd2FpdCBwcm9jZXNzVmlkZW9HZW5lcmF0aW9uKHJlcXVlc3QsIHJlY29yZCk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBwcm9jZXNzaW5nIHJlY29yZDonLCByZWNvcmQubWVzc2FnZUlkLCBlcnJvcik7XG4gICAgICBiYXRjaEl0ZW1GYWlsdXJlcy5wdXNoKHsgaXRlbUlkZW50aWZpZXI6IHJlY29yZC5tZXNzYWdlSWQgfSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBiYXRjaEl0ZW1GYWlsdXJlcyxcbiAgfTtcbn1cbiJdfQ==