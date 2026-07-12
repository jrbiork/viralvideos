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
                        ? `You've used all ${limit} additional image generations included with your free plan. Upgrade to Pro for ${quota_1.PRO_IMAGE_GEN_MONTHLY_LIMIT} image generations per month.`
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSw4REFBbUU7QUFFbkUsMERBQXFEO0FBQ3JELDBDQUd3QjtBQU1qQixNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQzFCLEtBQTJCLEVBQ0ssRUFBRTtJQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7SUFFMUQsSUFBSSxDQUFDO1FBQ0gscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxDQUFDO2FBQzVELENBQUM7UUFDSixDQUFDO1FBRUQseUNBQXlDO1FBQ3pDLE1BQU0sTUFBTSxHQUFJLEtBQUssQ0FBQyxjQUFzQixDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUM7UUFDckUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ1osT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQzthQUNoRCxDQUFDO1FBQ0osQ0FBQztRQUVELHdFQUF3RTtRQUN4RSxpREFBaUQ7UUFDakQsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixLQUFLLE1BQU0sQ0FBQztRQUV0RSxNQUFNLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEdBQUcsZ0JBQWdCO1lBQ3JELENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFlLEVBQUU7WUFD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Q0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsd0JBQXdCO2FBQ3BFLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQTlHVyxRQUFBLE9BQU8sV0E4R2xCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuXG5pbXBvcnQgeyBnZW5lcmF0ZU5hbm9CYW5hbmFJbWFnZSB9IGZyb20gJy4uL3V0aWxzL2ltYWdlTmFub0JhbmFuYSc7XG5cbmltcG9ydCB7IGdldE1hbmlmZXN0IH0gZnJvbSAnLi4vdXRpbHMvbWFuaWZlc3RVdGlscyc7XG5pbXBvcnQge1xuICBjaGVja0FuZENvbnN1bWVJbWFnZUdlblF1b3RhLFxuICBQUk9fSU1BR0VfR0VOX01PTlRITFlfTElNSVQsXG59IGZyb20gJy4uL3V0aWxzL3F1b3RhJztcblxuaW50ZXJmYWNlIFJlcXVlc3RCb2R5IHtcbiAgaW1hZ2VQcm9tcHQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoXG4gIGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCxcbik6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIGNvbnNvbGUubG9nKCfwn46oIEltYWdlIEdlbmVyYXRpb24gTGFtYmRhIGhhbmRsZXIgc3RhcnRlZCcpO1xuXG4gIHRyeSB7XG4gICAgLy8gUGFyc2UgcmVxdWVzdCBib2R5XG4gICAgaWYgKCFldmVudC5ib2R5KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdSZXF1ZXN0IGJvZHkgaXMgcmVxdWlyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBnZXQgdXNlcklkIGZyb20gdGhlIGF1dGhvcml6ZXIgY29udGV4dFxuICAgIGNvbnN0IHVzZXJJZCA9IChldmVudC5yZXF1ZXN0Q29udGV4dCBhcyBhbnkpLmF1dGhvcml6ZXI/LnByaW5jaXBhbElkO1xuICAgIGlmICghdXNlcklkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDEsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdVbmF1dGhvcml6ZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBNb2NrIGdlbmVyYXRpb24ganVzdCBjb3BpZXMgYW4gZXhpc3RpbmcgUzMgaW1hZ2UgKG5vIEdlbWluaSBjb3N0KSwgc29cbiAgICAvLyBpdCBzaG91bGRuJ3QgYnVybiB0aGUgdXNlcidzIHJlYWwgaW1hZ2UgcXVvdGEuXG4gICAgY29uc3QgaXNNb2NrR2VuZXJhdGlvbiA9IHByb2Nlc3MuZW52Lk1PQ0tfSU1BR0VfR0VORVJBVElPTiA9PT0gJ3RydWUnO1xuXG4gICAgY29uc3QgeyBhbGxvd2VkLCB1c2VkLCBsaW1pdCwgcGxhbiB9ID0gaXNNb2NrR2VuZXJhdGlvblxuICAgICAgPyB7IGFsbG93ZWQ6IHRydWUsIHVzZWQ6IDAsIGxpbWl0OiAwLCBwbGFuOiAnZnJlZScgYXMgY29uc3QgfVxuICAgICAgOiBhd2FpdCBjaGVja0FuZENvbnN1bWVJbWFnZUdlblF1b3RhKHVzZXJJZCk7XG4gICAgaWYgKCFhbGxvd2VkKSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYOKdjCBJbWFnZSBxdW90YSBleGNlZWRlZCBmb3IgdXNlciAke3VzZXJJZH06ICR7dXNlZH0vJHtsaW1pdH0gKCR7cGxhbn0pYCxcbiAgICAgICk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjpcbiAgICAgICAgICAgIHBsYW4gPT09ICdmcmVlJ1xuICAgICAgICAgICAgICA/IGBZb3UndmUgdXNlZCBhbGwgJHtsaW1pdH0gYWRkaXRpb25hbCBpbWFnZSBnZW5lcmF0aW9ucyBpbmNsdWRlZCB3aXRoIHlvdXIgZnJlZSBwbGFuLiBVcGdyYWRlIHRvIFBybyBmb3IgJHtQUk9fSU1BR0VfR0VOX01PTlRITFlfTElNSVR9IGltYWdlIGdlbmVyYXRpb25zIHBlciBtb250aC5gXG4gICAgICAgICAgICAgIDogYFlvdSd2ZSByZWFjaGVkIHRoaXMgbW9udGgncyBsaW1pdCBvZiAke2xpbWl0fSBpbWFnZSBnZW5lcmF0aW9ucy4gWW91ciBsaW1pdCByZXNldHMgbmV4dCBtb250aC5gLFxuICAgICAgICAgIGltYWdlUXVvdGE6IHsgdXNlZCwgbGltaXQsIHBsYW4gfSxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCB0aW1lc3RhbXAgZnJvbSBxdWVyeSBzdHJpbmdcbiAgICBjb25zdCB0aW1lc3RhbXAgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LlsndGltZXN0YW1wJ107XG4gICAgaWYgKCF0aW1lc3RhbXApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1RpbWVzdGFtcCBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCBzY2VuZSBvYmplY3QgZnJvbSBib2R5XG4gICAgY29uc3QgeyBpbWFnZVByb21wdCB9ID0gSlNPTi5wYXJzZShldmVudC5ib2R5KSBhcyBSZXF1ZXN0Qm9keTtcbiAgICBpZiAoIWltYWdlUHJvbXB0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ0ltYWdlIHByb21wdCBpcyByZXF1aXJlZCcsXG4gICAgICAgIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBnZXQgbGFzdCA0IGRpZ2l0cyBvZiB0aW1lc3RhbXBcbiAgICBjb25zdCBzZWVkID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMDApO1xuICAgIGNvbnN0IHNjZW5lSWQgPSBEYXRlLm5vdygpO1xuXG4gICAgY29uc3QgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdCh1c2VySWQsIHRpbWVzdGFtcCk7XG4gICAgaWYgKCFtYW5pZmVzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWFuaWZlc3Qgbm90IGZvdW5kJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgcHJvbXB0ID0gbWFuaWZlc3QudGVtcGxhdGUgKyAnOiAnICsgaW1hZ2VQcm9tcHQ7XG5cbiAgICBjb25zdCBpbWFnZVVybCA9IGF3YWl0IGdlbmVyYXRlTmFub0JhbmFuYUltYWdlKFxuICAgICAgcHJvbXB0LFxuICAgICAgc2NlbmVJZCxcbiAgICAgIHVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHNlZWQsXG4gICAgICB0cnVlLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OqCBJbWFnZSBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5OicsIGltYWdlVXJsKTtcblxuICAgIC8vIFJldHVybiBzdWNjZXNzIHJlc3BvbnNlXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgaW1hZ2VVcmwsXG4gICAgICB9KSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBpbWFnZSBnZW5lcmF0aW9uOicsIGVycm9yKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyxcbiAgICAgICAgbWVzc2FnZTpcbiAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yIG9jY3VycmVkJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=