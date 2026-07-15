"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const imageNanoBanana_1 = require("../utils/imageNanoBanana");
const manifestUtils_1 = require("../utils/manifestUtils");
const quota_1 = require("../utils/quota");
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
        // Mock generation just copies an existing S3 image (no Gemini cost), so
        // it shouldn't burn the user's real image quota.
        const isMockGeneration = process.env.MOCK_IMAGE_GENERATION === 'true';
        const { allowed, used, limit, plan } = isMockGeneration
            ? { allowed: true, used: 0, limit: 0, plan: 'free' }
            : await (0, quota_1.checkAndConsumeImageGenQuota)(userId);
        if (!allowed) {
            console.log(`❌ Image quota exceeded for user ${userId}: ${used}/${limit} (${plan})`);
            return {
                statusCode: 403,
                body: JSON.stringify({
                    error: plan === 'free'
                        ? `You've used all ${limit} additional image generations included with your free plan. Upgrade to Creator or Pro for more image generations every month.`
                        : `You've reached this month's limit of ${limit} image generations. Your limit resets next month.`,
                    imageQuota: { used, limit, plan },
                }),
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
        // get last 4 digits of timestamp
        const seed = Math.floor(Math.random() * 10000);
        const sceneId = Date.now();
        const manifest = await (0, manifestUtils_1.getManifest)(userId, timestamp);
        if (!manifest) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Manifest not found' }),
            };
        }
        const prompt = manifest.template + ': ' + imagePrompt;
        const imageUrl = await (0, imageNanoBanana_1.generateNanoBananaImage)(prompt, sceneId, userId, timestamp, seed, true);
        console.log('🎨 Image generated successfully:', imageUrl);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSw4REFBbUU7QUFFbkUsMERBQXFEO0FBQ3JELDBDQUE4RDtBQU12RCxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQzFCLEtBQTJCLEVBQ0ssRUFBRTtJQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7SUFFMUQsSUFBSSxDQUFDO1FBQ0gscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxDQUFDO2FBQzVELENBQUM7UUFDSixDQUFDO1FBRUQseUNBQXlDO1FBQ3pDLE1BQU0sTUFBTSxHQUFJLEtBQUssQ0FBQyxjQUFzQixDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUM7UUFDckUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ1osT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQzthQUNoRCxDQUFDO1FBQ0osQ0FBQztRQUVELHdFQUF3RTtRQUN4RSxpREFBaUQ7UUFDakQsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixLQUFLLE1BQU0sQ0FBQztRQUV0RSxNQUFNLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEdBQUcsZ0JBQWdCO1lBQ3JELENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFlLEVBQUU7WUFD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LEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLHdCQUF3QjthQUNwRSxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUE5R1csUUFBQSxPQUFPLFdBOEdsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcblxuaW1wb3J0IHsgZ2VuZXJhdGVOYW5vQmFuYW5hSW1hZ2UgfSBmcm9tICcuLi91dGlscy9pbWFnZU5hbm9CYW5hbmEnO1xuXG5pbXBvcnQgeyBnZXRNYW5pZmVzdCB9IGZyb20gJy4uL3V0aWxzL21hbmlmZXN0VXRpbHMnO1xuaW1wb3J0IHsgY2hlY2tBbmRDb25zdW1lSW1hZ2VHZW5RdW90YSB9IGZyb20gJy4uL3V0aWxzL3F1b3RhJztcblxuaW50ZXJmYWNlIFJlcXVlc3RCb2R5IHtcbiAgaW1hZ2VQcm9tcHQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoXG4gIGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCxcbik6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIGNvbnNvbGUubG9nKCfwn46oIEltYWdlIEdlbmVyYXRpb24gTGFtYmRhIGhhbmRsZXIgc3RhcnRlZCcpO1xuXG4gIHRyeSB7XG4gICAgLy8gUGFyc2UgcmVxdWVzdCBib2R5XG4gICAgaWYgKCFldmVudC5ib2R5KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdSZXF1ZXN0IGJvZHkgaXMgcmVxdWlyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBnZXQgdXNlcklkIGZyb20gdGhlIGF1dGhvcml6ZXIgY29udGV4dFxuICAgIGNvbnN0IHVzZXJJZCA9IChldmVudC5yZXF1ZXN0Q29udGV4dCBhcyBhbnkpLmF1dGhvcml6ZXI/LnByaW5jaXBhbElkO1xuICAgIGlmICghdXNlcklkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDEsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdVbmF1dGhvcml6ZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBNb2NrIGdlbmVyYXRpb24ganVzdCBjb3BpZXMgYW4gZXhpc3RpbmcgUzMgaW1hZ2UgKG5vIEdlbWluaSBjb3N0KSwgc29cbiAgICAvLyBpdCBzaG91bGRuJ3QgYnVybiB0aGUgdXNlcidzIHJlYWwgaW1hZ2UgcXVvdGEuXG4gICAgY29uc3QgaXNNb2NrR2VuZXJhdGlvbiA9IHByb2Nlc3MuZW52Lk1PQ0tfSU1BR0VfR0VORVJBVElPTiA9PT0gJ3RydWUnO1xuXG4gICAgY29uc3QgeyBhbGxvd2VkLCB1c2VkLCBsaW1pdCwgcGxhbiB9ID0gaXNNb2NrR2VuZXJhdGlvblxuICAgICAgPyB7IGFsbG93ZWQ6IHRydWUsIHVzZWQ6IDAsIGxpbWl0OiAwLCBwbGFuOiAnZnJlZScgYXMgY29uc3QgfVxuICAgICAgOiBhd2FpdCBjaGVja0FuZENvbnN1bWVJbWFnZUdlblF1b3RhKHVzZXJJZCk7XG4gICAgaWYgKCFhbGxvd2VkKSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYOKdjCBJbWFnZSBxdW90YSBleGNlZWRlZCBmb3IgdXNlciAke3VzZXJJZH06ICR7dXNlZH0vJHtsaW1pdH0gKCR7cGxhbn0pYCxcbiAgICAgICk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjpcbiAgICAgICAgICAgIHBsYW4gPT09ICdmcmVlJ1xuICAgICAgICAgICAgICA/IGBZb3UndmUgdXNlZCBhbGwgJHtsaW1pdH0gYWRkaXRpb25hbCBpbWFnZSBnZW5lcmF0aW9ucyBpbmNsdWRlZCB3aXRoIHlvdXIgZnJlZSBwbGFuLiBVcGdyYWRlIHRvIENyZWF0b3Igb3IgUHJvIGZvciBtb3JlIGltYWdlIGdlbmVyYXRpb25zIGV2ZXJ5IG1vbnRoLmBcbiAgICAgICAgICAgICAgOiBgWW91J3ZlIHJlYWNoZWQgdGhpcyBtb250aCdzIGxpbWl0IG9mICR7bGltaXR9IGltYWdlIGdlbmVyYXRpb25zLiBZb3VyIGxpbWl0IHJlc2V0cyBuZXh0IG1vbnRoLmAsXG4gICAgICAgICAgaW1hZ2VRdW90YTogeyB1c2VkLCBsaW1pdCwgcGxhbiB9LFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gZ2V0IHRpbWVzdGFtcCBmcm9tIHF1ZXJ5IHN0cmluZ1xuICAgIGNvbnN0IHRpbWVzdGFtcCA9IGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycz8uWyd0aW1lc3RhbXAnXTtcbiAgICBpZiAoIXRpbWVzdGFtcCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnVGltZXN0YW1wIGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gZ2V0IHNjZW5lIG9iamVjdCBmcm9tIGJvZHlcbiAgICBjb25zdCB7IGltYWdlUHJvbXB0IH0gPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkpIGFzIFJlcXVlc3RCb2R5O1xuICAgIGlmICghaW1hZ2VQcm9tcHQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGVycm9yOiAnSW1hZ2UgcHJvbXB0IGlzIHJlcXVpcmVkJyxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCBsYXN0IDQgZGlnaXRzIG9mIHRpbWVzdGFtcFxuICAgIGNvbnN0IHNlZWQgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMCk7XG4gICAgY29uc3Qgc2NlbmVJZCA9IERhdGUubm93KCk7XG5cbiAgICBjb25zdCBtYW5pZmVzdCA9IGF3YWl0IGdldE1hbmlmZXN0KHVzZXJJZCwgdGltZXN0YW1wKTtcbiAgICBpZiAoIW1hbmlmZXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNYW5pZmVzdCBub3QgZm91bmQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwcm9tcHQgPSBtYW5pZmVzdC50ZW1wbGF0ZSArICc6ICcgKyBpbWFnZVByb21wdDtcblxuICAgIGNvbnN0IGltYWdlVXJsID0gYXdhaXQgZ2VuZXJhdGVOYW5vQmFuYW5hSW1hZ2UoXG4gICAgICBwcm9tcHQsXG4gICAgICBzY2VuZUlkLFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc2VlZCxcbiAgICAgIHRydWUsXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46oIEltYWdlIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHk6JywgaW1hZ2VVcmwpO1xuXG4gICAgLy8gUmV0dXJuIHN1Y2Nlc3MgcmVzcG9uc2VcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBpbWFnZVVybCxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGltYWdlIGdlbmVyYXRpb246JywgZXJyb3IpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InLFxuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3Igb2NjdXJyZWQnLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxufTtcbiJdfQ==