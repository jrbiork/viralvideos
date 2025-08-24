"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
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
        // Extract user information from JWT authorizer context or request
        const userId = event.requestContext?.authorizer?.userId ||
            request.userId ||
            event.queryStringParameters?.userId ||
            'demo-user';
        // Extract timestamp from query parameters or request body
        const timestamp = event.queryStringParameters?.timestamp ||
            request.timestamp ||
            event.pathParameters?.timestamp;
        if (!timestamp) {
            console.log('❌ Error: timestamp is required');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'timestamp is required' }),
            };
        }
        console.log('🗑️ Deleting video for user:', userId, 'timestamp:', timestamp);
        if (!process.env.VIDEO_BUCKET_NAME) {
            console.log('❌ Error: VIDEO_BUCKET_NAME is not set');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'S3 bucket name not configured' }),
            };
        }
        // Construct the video key based on the timestamp
        const videoKey = `${userId}/${timestamp}-final-video.mp4`;
        console.log('🗑️ Deleting video with key:', videoKey);
        // Delete the video from S3
        const deleteCommand = new client_s3_1.DeleteObjectCommand({
            Bucket: process.env.VIDEO_BUCKET_NAME,
            Key: videoKey,
        });
        await s3.send(deleteCommand);
        console.log('✅ Video deleted successfully:', videoKey);
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Video deleted successfully',
                deletedKey: videoKey,
            }),
        };
    }
    catch (error) {
        console.error('💥 Error in delete video:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to delete video',
                details: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxrREFBbUU7QUFFbkUsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFPcEUsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUMxQixLQUEyQixFQUNLLEVBQUU7SUFDbEMsSUFBSSxDQUFDO1FBQ0gsSUFBSSxPQUEyQixDQUFDO1FBRWhDLGlDQUFpQztRQUNqQyxJQUFJLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNmLDZDQUE2QztZQUM3QyxJQUFJLE9BQU8sS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDbkMsT0FBTyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ25DLENBQUM7aUJBQU0sQ0FBQztnQkFDTix1REFBdUQ7Z0JBQ3ZELE9BQU8sR0FBRyxLQUFLLENBQUMsSUFBMEIsQ0FBQztZQUM3QyxDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7WUFDTix5REFBeUQ7WUFDekQsT0FBTyxHQUFHLEtBQVksQ0FBQztRQUN6QixDQUFDO1FBRUQsa0VBQWtFO1FBQ2xFLE1BQU0sTUFBTSxHQUNWLEtBQUssQ0FBQyxjQUFjLEVBQUUsVUFBVSxFQUFFLE1BQU07WUFDeEMsT0FBTyxDQUFDLE1BQU07WUFDZCxLQUFLLENBQUMscUJBQXFCLEVBQUUsTUFBTTtZQUNuQyxXQUFXLENBQUM7UUFFZCwwREFBMEQ7UUFDMUQsTUFBTSxTQUFTLEdBQ2IsS0FBSyxDQUFDLHFCQUFxQixFQUFFLFNBQVM7WUFDdEMsT0FBTyxDQUFDLFNBQVM7WUFDakIsS0FBSyxDQUFDLGNBQWMsRUFBRSxTQUFTLENBQUM7UUFFbEMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO1lBQzlDLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQzthQUN6RCxDQUFDO1FBQ0osQ0FBQztRQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxTQUFTLENBQUMsQ0FBQztRQUU3RSxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ25DLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUNBQXVDLENBQUMsQ0FBQztZQUNyRCxPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLCtCQUErQixFQUFFLENBQUM7YUFDakUsQ0FBQztRQUNKLENBQUM7UUFFRCxpREFBaUQ7UUFDakQsTUFBTSxRQUFRLEdBQUcsR0FBRyxNQUFNLElBQUksU0FBUyxrQkFBa0IsQ0FBQztRQUUxRCxPQUFPLENBQUMsR0FBRyxDQUFDLDhCQUE4QixFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRXRELDJCQUEyQjtRQUMzQixNQUFNLGFBQWEsR0FBRyxJQUFJLCtCQUFtQixDQUFDO1lBQzVDLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQjtZQUNyQyxHQUFHLEVBQUUsUUFBUTtTQUNkLENBQUMsQ0FBQztRQUVILE1BQU0sRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUU3QixPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRXZELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixPQUFPLEVBQUUsNEJBQTRCO2dCQUNyQyxVQUFVLEVBQUUsUUFBUTthQUNyQixDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNsRCxPQUFPLENBQUMsS0FBSyxDQUNYLGNBQWMsRUFDZCxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsQ0FDeEQsQ0FBQztRQUNGLE9BQU8sQ0FBQyxLQUFLLENBQ1gsZ0JBQWdCLEVBQ2hCLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FDekQsQ0FBQztRQUVGLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixLQUFLLEVBQUUsd0JBQXdCO2dCQUMvQixPQUFPLEVBQUUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZTthQUNsRSxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUE1RlcsUUFBQSxPQUFPLFdBNEZsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IFMzQ2xpZW50LCBEZWxldGVPYmplY3RDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmludGVyZmFjZSBEZWxldGVWaWRlb1JlcXVlc3Qge1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICB0cnkge1xuICAgIGxldCByZXF1ZXN0OiBEZWxldGVWaWRlb1JlcXVlc3Q7XG5cbiAgICAvLyBIYW5kbGUgZGlmZmVyZW50IGV2ZW50IGZvcm1hdHNcbiAgICBpZiAoZXZlbnQuYm9keSkge1xuICAgICAgLy8gQVBJIEdhdGV3YXkgZm9ybWF0IC0gYm9keSBpcyBhIEpTT04gc3RyaW5nXG4gICAgICBpZiAodHlwZW9mIGV2ZW50LmJvZHkgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJlcXVlc3QgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRGlyZWN0IExhbWJkYSBpbnZvY2F0aW9uIC0gYm9keSBpcyBhbHJlYWR5IGFuIG9iamVjdFxuICAgICAgICByZXF1ZXN0ID0gZXZlbnQuYm9keSBhcyBEZWxldGVWaWRlb1JlcXVlc3Q7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIERpcmVjdCBMYW1iZGEgaW52b2NhdGlvbiAtIHBheWxvYWQgaXMgdGhlIGVudGlyZSBldmVudFxuICAgICAgcmVxdWVzdCA9IGV2ZW50IGFzIGFueTtcbiAgICB9XG5cbiAgICAvLyBFeHRyYWN0IHVzZXIgaW5mb3JtYXRpb24gZnJvbSBKV1QgYXV0aG9yaXplciBjb250ZXh0IG9yIHJlcXVlc3RcbiAgICBjb25zdCB1c2VySWQgPVxuICAgICAgZXZlbnQucmVxdWVzdENvbnRleHQ/LmF1dGhvcml6ZXI/LnVzZXJJZCB8fFxuICAgICAgcmVxdWVzdC51c2VySWQgfHxcbiAgICAgIGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycz8udXNlcklkIHx8XG4gICAgICAnZGVtby11c2VyJztcblxuICAgIC8vIEV4dHJhY3QgdGltZXN0YW1wIGZyb20gcXVlcnkgcGFyYW1ldGVycyBvciByZXF1ZXN0IGJvZHlcbiAgICBjb25zdCB0aW1lc3RhbXAgPVxuICAgICAgZXZlbnQucXVlcnlTdHJpbmdQYXJhbWV0ZXJzPy50aW1lc3RhbXAgfHxcbiAgICAgIHJlcXVlc3QudGltZXN0YW1wIHx8XG4gICAgICBldmVudC5wYXRoUGFyYW1ldGVycz8udGltZXN0YW1wO1xuXG4gICAgaWYgKCF0aW1lc3RhbXApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IHRpbWVzdGFtcCBpcyByZXF1aXJlZCcpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAndGltZXN0YW1wIGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/Cfl5HvuI8gRGVsZXRpbmcgdmlkZW8gZm9yIHVzZXI6JywgdXNlcklkLCAndGltZXN0YW1wOicsIHRpbWVzdGFtcCk7XG5cbiAgICBpZiAoIXByb2Nlc3MuZW52LlZJREVPX0JVQ0tFVF9OQU1FKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBWSURFT19CVUNLRVRfTkFNRSBpcyBub3Qgc2V0Jyk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdTMyBidWNrZXQgbmFtZSBub3QgY29uZmlndXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIENvbnN0cnVjdCB0aGUgdmlkZW8ga2V5IGJhc2VkIG9uIHRoZSB0aW1lc3RhbXBcbiAgICBjb25zdCB2aWRlb0tleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LWZpbmFsLXZpZGVvLm1wNGA7XG5cbiAgICBjb25zb2xlLmxvZygn8J+Xke+4jyBEZWxldGluZyB2aWRlbyB3aXRoIGtleTonLCB2aWRlb0tleSk7XG5cbiAgICAvLyBEZWxldGUgdGhlIHZpZGVvIGZyb20gUzNcbiAgICBjb25zdCBkZWxldGVDb21tYW5kID0gbmV3IERlbGV0ZU9iamVjdENvbW1hbmQoe1xuICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19CVUNLRVRfTkFNRSxcbiAgICAgIEtleTogdmlkZW9LZXksXG4gICAgfSk7XG5cbiAgICBhd2FpdCBzMy5zZW5kKGRlbGV0ZUNvbW1hbmQpO1xuXG4gICAgY29uc29sZS5sb2coJ+KchSBWaWRlbyBkZWxldGVkIHN1Y2Nlc3NmdWxseTonLCB2aWRlb0tleSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBtZXNzYWdlOiAnVmlkZW8gZGVsZXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICBkZWxldGVkS2V5OiB2aWRlb0tleSxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign8J+SpSBFcnJvciBpbiBkZWxldGUgdmlkZW86JywgZXJyb3IpO1xuICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAnRXJyb3Igc3RhY2s6JyxcbiAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5zdGFjayA6ICdObyBzdGFjayB0cmFjZScsXG4gICAgKTtcbiAgICBjb25zb2xlLmVycm9yKFxuICAgICAgJ0Vycm9yIG1lc3NhZ2U6JyxcbiAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InLFxuICAgICk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBlcnJvcjogJ0ZhaWxlZCB0byBkZWxldGUgdmlkZW8nLFxuICAgICAgICBkZXRhaWxzOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=