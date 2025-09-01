"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const s3Uploader_1 = require("../utils/s3Uploader");
const handler = async (event) => {
    console.log('💾 Save Image Lambda handler started');
    try {
        // get userId from the authorizer context
        const userId = event.requestContext.authorizer?.principalId;
        if (!userId) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Unauthorized' }),
            };
        }
        // get timestamp from query string
        const timestamp = event.queryStringParameters?.['timestamp'];
        if (!timestamp) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Timestamp is required' }),
            };
        }
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const { sceneId, generatedImageUrl } = body;
        if (sceneId === undefined || sceneId === null) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Missing sceneId in request body' }),
            };
        }
        // Form the imageKey
        const imageKey = `${userId}/${timestamp}.scene-${sceneId}.jpg`;
        console.log(`🔑 Formed image key: ${imageKey}`);
        await (0, s3Uploader_1.uploadImageToS3)(generatedImageUrl, userId, timestamp, sceneId);
        console.log(`✅ Image replaced successfully`);
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Image key formed successfully',
                imageKey,
                sceneId,
            }),
        };
    }
    catch (error) {
        console.error('❌ Error in save-image lambda:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxvREFBc0Q7QUFRL0MsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUMxQixLQUEyQixFQUNLLEVBQUU7SUFDbEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO0lBRXBELElBQUksQ0FBQztRQUNILHlDQUF5QztRQUN6QyxNQUFNLE1BQU0sR0FBSSxLQUFLLENBQUMsY0FBc0IsQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNaLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLENBQUM7YUFDaEQsQ0FBQztRQUNKLENBQUM7UUFFRCxrQ0FBa0M7UUFDbEMsTUFBTSxTQUFTLEdBQUcsS0FBSyxDQUFDLHFCQUFxQixFQUFFLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDN0QsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2YsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSx1QkFBdUIsRUFBRSxDQUFDO2FBQ3pELENBQUM7UUFDSixDQUFDO1FBRUQscUJBQXFCO1FBQ3JCLE1BQU0sSUFBSSxHQUFnQixJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLENBQUM7UUFDekQsTUFBTSxFQUFFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxHQUFHLElBQUksQ0FBQztRQUU1QyxJQUFJLE9BQU8sS0FBSyxTQUFTLElBQUksT0FBTyxLQUFLLElBQUksRUFBRSxDQUFDO1lBQzlDLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsaUNBQWlDLEVBQUUsQ0FBQzthQUNuRSxDQUFDO1FBQ0osQ0FBQztRQUVELG9CQUFvQjtRQUNwQixNQUFNLFFBQVEsR0FBRyxHQUFHLE1BQU0sSUFBSSxTQUFTLFVBQVUsT0FBTyxNQUFNLENBQUM7UUFDL0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUVoRCxNQUFNLElBQUEsNEJBQWUsRUFBQyxpQkFBaUIsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3JFLE9BQU8sQ0FBQyxHQUFHLENBQUMsK0JBQStCLENBQUMsQ0FBQztRQUU3QyxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsT0FBTyxFQUFFLCtCQUErQjtnQkFDeEMsUUFBUTtnQkFDUixPQUFPO2FBQ1IsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQztTQUN6RCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQXpEVyxRQUFBLE9BQU8sV0F5RGxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgdXBsb2FkSW1hZ2VUb1MzIH0gZnJvbSAnLi4vdXRpbHMvczNVcGxvYWRlcic7XG5cbmludGVyZmFjZSBSZXF1ZXN0Qm9keSB7XG4gIHNjZW5lSWQ6IG51bWJlcjtcbiAgZ2VuZXJhdGVkSW1hZ2VVcmw6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygn8J+SviBTYXZlIEltYWdlIExhbWJkYSBoYW5kbGVyIHN0YXJ0ZWQnKTtcblxuICB0cnkge1xuICAgIC8vIGdldCB1c2VySWQgZnJvbSB0aGUgYXV0aG9yaXplciBjb250ZXh0XG4gICAgY29uc3QgdXNlcklkID0gKGV2ZW50LnJlcXVlc3RDb250ZXh0IGFzIGFueSkuYXV0aG9yaXplcj8ucHJpbmNpcGFsSWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1VuYXV0aG9yaXplZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCB0aW1lc3RhbXAgZnJvbSBxdWVyeSBzdHJpbmdcbiAgICBjb25zdCB0aW1lc3RhbXAgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LlsndGltZXN0YW1wJ107XG4gICAgaWYgKCF0aW1lc3RhbXApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1RpbWVzdGFtcCBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFBhcnNlIHJlcXVlc3QgYm9keVxuICAgIGNvbnN0IGJvZHk6IFJlcXVlc3RCb2R5ID0gSlNPTi5wYXJzZShldmVudC5ib2R5IHx8ICd7fScpO1xuICAgIGNvbnN0IHsgc2NlbmVJZCwgZ2VuZXJhdGVkSW1hZ2VVcmwgfSA9IGJvZHk7XG5cbiAgICBpZiAoc2NlbmVJZCA9PT0gdW5kZWZpbmVkIHx8IHNjZW5lSWQgPT09IG51bGwpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ01pc3Npbmcgc2NlbmVJZCBpbiByZXF1ZXN0IGJvZHknIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBGb3JtIHRoZSBpbWFnZUtleVxuICAgIGNvbnN0IGltYWdlS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZUlkfS5qcGdgO1xuICAgIGNvbnNvbGUubG9nKGDwn5SRIEZvcm1lZCBpbWFnZSBrZXk6ICR7aW1hZ2VLZXl9YCk7XG5cbiAgICBhd2FpdCB1cGxvYWRJbWFnZVRvUzMoZ2VuZXJhdGVkSW1hZ2VVcmwsIHVzZXJJZCwgdGltZXN0YW1wLCBzY2VuZUlkKTtcbiAgICBjb25zb2xlLmxvZyhg4pyFIEltYWdlIHJlcGxhY2VkIHN1Y2Nlc3NmdWxseWApO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgbWVzc2FnZTogJ0ltYWdlIGtleSBmb3JtZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgaW1hZ2VLZXksXG4gICAgICAgIHNjZW5lSWQsXG4gICAgICB9KSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBzYXZlLWltYWdlIGxhbWJkYTonLCBlcnJvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=