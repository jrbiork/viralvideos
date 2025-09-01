"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const image_1 = require("../utils/image");
const credits_1 = require("../utils/credits");
const credits_2 = require("../utils/credits");
const handler = async (event) => {
    console.log('🎨 Image Generation Lambda handler started');
    try {
        // Parse request body
        if (!event.body) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Request body is required' }),
            };
        }
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
        // get scene object from body
        const { imagePrompt } = JSON.parse(event.body);
        if (!imagePrompt) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Image prompt is required',
                }),
            };
        }
        // Check if user has sufficient credits
        const { hasSufficientCredits, currentCredits } = await (0, credits_2.hasSufficientCreditsByUserId)(userId, credits_1.CREDITS_COST.new_image);
        console.log('hasCredits / current credits:', hasSufficientCredits, currentCredits);
        if (!hasSufficientCredits) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Insufficient credits' }),
            };
        }
        const seed = Math.floor(Math.random() * 1000000);
        const sceneId = -1;
        const imageUrl = await (0, image_1.generateImage)(imagePrompt, sceneId, userId, timestamp, seed, sceneId);
        console.log('🎨 Image generated successfully:', imageUrl);
        // Deduct credits
        const newCurrentCredits = await (0, credits_2.updateCreditBalanceByUserId)(userId, credits_1.CREDITS_COST.new_image);
        console.log('new credits after deduction:', newCurrentCredits);
        // Return success response
        return {
            statusCode: 200,
            body: JSON.stringify({
                imageUrl,
            }),
        };
    }
    catch (error) {
        console.error('❌ Error in image generation:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error occurred',
            }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSwwQ0FBK0M7QUFJL0MsOENBQWdEO0FBRWhELDhDQUcwQjtBQU1uQixNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQzFCLEtBQTJCLEVBQ0ssRUFBRTtJQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7SUFFMUQsSUFBSSxDQUFDO1FBQ0gscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxDQUFDO2FBQzVELENBQUM7UUFDSixDQUFDO1FBRUQseUNBQXlDO1FBQ3pDLE1BQU0sTUFBTSxHQUFJLEtBQUssQ0FBQyxjQUFzQixDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUM7UUFDckUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ1osT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQzthQUNoRCxDQUFDO1FBQ0osQ0FBQztRQUVELGtDQUFrQztRQUNsQyxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDZixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUM7YUFDekQsQ0FBQztRQUNKLENBQUM7UUFFRCw2QkFBNkI7UUFDN0IsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBZ0IsQ0FBQztRQUM5RCxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDakIsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztvQkFDbkIsS0FBSyxFQUFFLDBCQUEwQjtpQkFDbEMsQ0FBQzthQUNILENBQUM7UUFDSixDQUFDO1FBRUQsdUNBQXVDO1FBQ3ZDLE1BQU0sRUFBRSxvQkFBb0IsRUFBRSxjQUFjLEVBQUUsR0FDNUMsTUFBTSxJQUFBLHNDQUE0QixFQUFDLE1BQU0sRUFBRSxzQkFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRXJFLE9BQU8sQ0FBQyxHQUFHLENBQ1QsK0JBQStCLEVBQy9CLG9CQUFvQixFQUNwQixjQUFjLENBQ2YsQ0FBQztRQUVGLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQzFCLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsc0JBQXNCLEVBQUUsQ0FBQzthQUN4RCxDQUFDO1FBQ0osQ0FBQztRQUVELE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxDQUFDO1FBQ2pELE1BQU0sT0FBTyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRW5CLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBQSxxQkFBYSxFQUNsQyxXQUFXLEVBQ1gsT0FBTyxFQUNQLE1BQU0sRUFDTixTQUFTLEVBQ1QsSUFBSSxFQUNKLE9BQU8sQ0FDUixDQUFDO1FBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUUxRCxpQkFBaUI7UUFDakIsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLElBQUEscUNBQTJCLEVBQ3pELE1BQU0sRUFDTixzQkFBWSxDQUFDLFNBQVMsQ0FDdkIsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUUvRCwwQkFBMEI7UUFDMUIsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQ25CLFFBQVE7YUFDVCxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw4QkFBOEIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVyRCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsS0FBSyxFQUFFLHVCQUF1QjtnQkFDOUIsT0FBTyxFQUNMLEtBQUssWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLHdCQUF3QjthQUNwRSxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUFyR1csUUFBQSxPQUFPLFdBcUdsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcblxuaW1wb3J0IHsgZ2VuZXJhdGVJbWFnZSB9IGZyb20gJy4uL3V0aWxzL2ltYWdlJztcbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi4vdXRpbHMvc2NyaXB0JztcblxuaW1wb3J0IHsgYnJvYWRjYXN0UHJvZ3Jlc3MgfSBmcm9tICcuLi92aWRlby1nZW5lcmF0aW9uJztcbmltcG9ydCB7IENSRURJVFNfQ09TVCB9IGZyb20gJy4uL3V0aWxzL2NyZWRpdHMnO1xuXG5pbXBvcnQge1xuICBoYXNTdWZmaWNpZW50Q3JlZGl0c0J5VXNlcklkLFxuICB1cGRhdGVDcmVkaXRCYWxhbmNlQnlVc2VySWQsXG59IGZyb20gJy4uL3V0aWxzL2NyZWRpdHMnO1xuXG5pbnRlcmZhY2UgUmVxdWVzdEJvZHkge1xuICBpbWFnZVByb21wdDogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChcbiAgZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50LFxuKTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgY29uc29sZS5sb2coJ/CfjqggSW1hZ2UgR2VuZXJhdGlvbiBMYW1iZGEgaGFuZGxlciBzdGFydGVkJyk7XG5cbiAgdHJ5IHtcbiAgICAvLyBQYXJzZSByZXF1ZXN0IGJvZHlcbiAgICBpZiAoIWV2ZW50LmJvZHkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1JlcXVlc3QgYm9keSBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCB1c2VySWQgZnJvbSB0aGUgYXV0aG9yaXplciBjb250ZXh0XG4gICAgY29uc3QgdXNlcklkID0gKGV2ZW50LnJlcXVlc3RDb250ZXh0IGFzIGFueSkuYXV0aG9yaXplcj8ucHJpbmNpcGFsSWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1VuYXV0aG9yaXplZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCB0aW1lc3RhbXAgZnJvbSBxdWVyeSBzdHJpbmdcbiAgICBjb25zdCB0aW1lc3RhbXAgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LlsndGltZXN0YW1wJ107XG4gICAgaWYgKCF0aW1lc3RhbXApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1RpbWVzdGFtcCBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCBzY2VuZSBvYmplY3QgZnJvbSBib2R5XG4gICAgY29uc3QgeyBpbWFnZVByb21wdCB9ID0gSlNPTi5wYXJzZShldmVudC5ib2R5KSBhcyBSZXF1ZXN0Qm9keTtcbiAgICBpZiAoIWltYWdlUHJvbXB0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ0ltYWdlIHByb21wdCBpcyByZXF1aXJlZCcsXG4gICAgICAgIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiB1c2VyIGhhcyBzdWZmaWNpZW50IGNyZWRpdHNcbiAgICBjb25zdCB7IGhhc1N1ZmZpY2llbnRDcmVkaXRzLCBjdXJyZW50Q3JlZGl0cyB9ID1cbiAgICAgIGF3YWl0IGhhc1N1ZmZpY2llbnRDcmVkaXRzQnlVc2VySWQodXNlcklkLCBDUkVESVRTX0NPU1QubmV3X2ltYWdlKTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgJ2hhc0NyZWRpdHMgLyBjdXJyZW50IGNyZWRpdHM6JyxcbiAgICAgIGhhc1N1ZmZpY2llbnRDcmVkaXRzLFxuICAgICAgY3VycmVudENyZWRpdHMsXG4gICAgKTtcblxuICAgIGlmICghaGFzU3VmZmljaWVudENyZWRpdHMpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0luc3VmZmljaWVudCBjcmVkaXRzJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3Qgc2VlZCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwMDApO1xuICAgIGNvbnN0IHNjZW5lSWQgPSAtMTtcblxuICAgIGNvbnN0IGltYWdlVXJsID0gYXdhaXQgZ2VuZXJhdGVJbWFnZShcbiAgICAgIGltYWdlUHJvbXB0LFxuICAgICAgc2NlbmVJZCxcbiAgICAgIHVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHNlZWQsXG4gICAgICBzY2VuZUlkLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OqCBJbWFnZSBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5OicsIGltYWdlVXJsKTtcblxuICAgIC8vIERlZHVjdCBjcmVkaXRzXG4gICAgY29uc3QgbmV3Q3VycmVudENyZWRpdHMgPSBhd2FpdCB1cGRhdGVDcmVkaXRCYWxhbmNlQnlVc2VySWQoXG4gICAgICB1c2VySWQsXG4gICAgICBDUkVESVRTX0NPU1QubmV3X2ltYWdlLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygnbmV3IGNyZWRpdHMgYWZ0ZXIgZGVkdWN0aW9uOicsIG5ld0N1cnJlbnRDcmVkaXRzKTtcblxuICAgIC8vIFJldHVybiBzdWNjZXNzIHJlc3BvbnNlXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgaW1hZ2VVcmwsXG4gICAgICB9KSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBpbWFnZSBnZW5lcmF0aW9uOicsIGVycm9yKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyxcbiAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yIG9jY3VycmVkJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=