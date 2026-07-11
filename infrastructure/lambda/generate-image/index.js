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
                        ? `You've used all ${limit} additional image generations included with your free plan. Upgrade to Pro for ${quota_1.PRO_IMAGE_GEN_DAILY_LIMIT} image generations per day.`
                        : `You've reached today's limit of ${limit} image generations. Your limit resets tomorrow.`,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFFQSw4REFBbUU7QUFFbkUsMERBQXFEO0FBQ3JELDBDQUd3QjtBQU1qQixNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQzFCLEtBQTJCLEVBQ0ssRUFBRTtJQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7SUFFMUQsSUFBSSxDQUFDO1FBQ0gscUJBQXFCO1FBQ3JCLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxDQUFDO2FBQzVELENBQUM7UUFDSixDQUFDO1FBRUQseUNBQXlDO1FBQ3pDLE1BQU0sTUFBTSxHQUFJLEtBQUssQ0FBQyxjQUFzQixDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUM7UUFDckUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ1osT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQzthQUNoRCxDQUFDO1FBQ0osQ0FBQztRQUVELHdFQUF3RTtRQUN4RSxpREFBaUQ7UUFDakQsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixLQUFLLE1BQU0sQ0FBQztRQUV0RSxNQUFNLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEdBQUcsZ0JBQWdCO1lBQ3JELENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFlLEVBQUU7WUFD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Q0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsd0JBQXdCO2FBQ3BFLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQTlHVyxRQUFBLE9BQU8sV0E4R2xCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuXG5pbXBvcnQgeyBnZW5lcmF0ZU5hbm9CYW5hbmFJbWFnZSB9IGZyb20gJy4uL3V0aWxzL2ltYWdlTmFub0JhbmFuYSc7XG5cbmltcG9ydCB7IGdldE1hbmlmZXN0IH0gZnJvbSAnLi4vdXRpbHMvbWFuaWZlc3RVdGlscyc7XG5pbXBvcnQge1xuICBjaGVja0FuZENvbnN1bWVJbWFnZUdlblF1b3RhLFxuICBQUk9fSU1BR0VfR0VOX0RBSUxZX0xJTUlULFxufSBmcm9tICcuLi91dGlscy9xdW90YSc7XG5cbmludGVyZmFjZSBSZXF1ZXN0Qm9keSB7XG4gIGltYWdlUHJvbXB0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygn8J+OqCBJbWFnZSBHZW5lcmF0aW9uIExhbWJkYSBoYW5kbGVyIHN0YXJ0ZWQnKTtcblxuICB0cnkge1xuICAgIC8vIFBhcnNlIHJlcXVlc3QgYm9keVxuICAgIGlmICghZXZlbnQuYm9keSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUmVxdWVzdCBib2R5IGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gZ2V0IHVzZXJJZCBmcm9tIHRoZSBhdXRob3JpemVyIGNvbnRleHRcbiAgICBjb25zdCB1c2VySWQgPSAoZXZlbnQucmVxdWVzdENvbnRleHQgYXMgYW55KS5hdXRob3JpemVyPy5wcmluY2lwYWxJZDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAxLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnVW5hdXRob3JpemVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gTW9jayBnZW5lcmF0aW9uIGp1c3QgY29waWVzIGFuIGV4aXN0aW5nIFMzIGltYWdlIChubyBHZW1pbmkgY29zdCksIHNvXG4gICAgLy8gaXQgc2hvdWxkbid0IGJ1cm4gdGhlIHVzZXIncyByZWFsIGltYWdlIHF1b3RhLlxuICAgIGNvbnN0IGlzTW9ja0dlbmVyYXRpb24gPSBwcm9jZXNzLmVudi5NT0NLX0lNQUdFX0dFTkVSQVRJT04gPT09ICd0cnVlJztcblxuICAgIGNvbnN0IHsgYWxsb3dlZCwgdXNlZCwgbGltaXQsIHBsYW4gfSA9IGlzTW9ja0dlbmVyYXRpb25cbiAgICAgID8geyBhbGxvd2VkOiB0cnVlLCB1c2VkOiAwLCBsaW1pdDogMCwgcGxhbjogJ2ZyZWUnIGFzIGNvbnN0IH1cbiAgICAgIDogYXdhaXQgY2hlY2tBbmRDb25zdW1lSW1hZ2VHZW5RdW90YSh1c2VySWQpO1xuICAgIGlmICghYWxsb3dlZCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGDinYwgSW1hZ2UgcXVvdGEgZXhjZWVkZWQgZm9yIHVzZXIgJHt1c2VySWR9OiAke3VzZWR9LyR7bGltaXR9ICgke3BsYW59KWAsXG4gICAgICApO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgZXJyb3I6XG4gICAgICAgICAgICBwbGFuID09PSAnZnJlZSdcbiAgICAgICAgICAgICAgPyBgWW91J3ZlIHVzZWQgYWxsICR7bGltaXR9IGFkZGl0aW9uYWwgaW1hZ2UgZ2VuZXJhdGlvbnMgaW5jbHVkZWQgd2l0aCB5b3VyIGZyZWUgcGxhbi4gVXBncmFkZSB0byBQcm8gZm9yICR7UFJPX0lNQUdFX0dFTl9EQUlMWV9MSU1JVH0gaW1hZ2UgZ2VuZXJhdGlvbnMgcGVyIGRheS5gXG4gICAgICAgICAgICAgIDogYFlvdSd2ZSByZWFjaGVkIHRvZGF5J3MgbGltaXQgb2YgJHtsaW1pdH0gaW1hZ2UgZ2VuZXJhdGlvbnMuIFlvdXIgbGltaXQgcmVzZXRzIHRvbW9ycm93LmAsXG4gICAgICAgICAgaW1hZ2VRdW90YTogeyB1c2VkLCBsaW1pdCwgcGxhbiB9LFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gZ2V0IHRpbWVzdGFtcCBmcm9tIHF1ZXJ5IHN0cmluZ1xuICAgIGNvbnN0IHRpbWVzdGFtcCA9IGV2ZW50LnF1ZXJ5U3RyaW5nUGFyYW1ldGVycz8uWyd0aW1lc3RhbXAnXTtcbiAgICBpZiAoIXRpbWVzdGFtcCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnVGltZXN0YW1wIGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gZ2V0IHNjZW5lIG9iamVjdCBmcm9tIGJvZHlcbiAgICBjb25zdCB7IGltYWdlUHJvbXB0IH0gPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkpIGFzIFJlcXVlc3RCb2R5O1xuICAgIGlmICghaW1hZ2VQcm9tcHQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGVycm9yOiAnSW1hZ2UgcHJvbXB0IGlzIHJlcXVpcmVkJyxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCBsYXN0IDQgZGlnaXRzIG9mIHRpbWVzdGFtcFxuICAgIGNvbnN0IHNlZWQgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMCk7XG4gICAgY29uc3Qgc2NlbmVJZCA9IERhdGUubm93KCk7XG5cbiAgICBjb25zdCBtYW5pZmVzdCA9IGF3YWl0IGdldE1hbmlmZXN0KHVzZXJJZCwgdGltZXN0YW1wKTtcbiAgICBpZiAoIW1hbmlmZXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNYW5pZmVzdCBub3QgZm91bmQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCBwcm9tcHQgPSBtYW5pZmVzdC50ZW1wbGF0ZSArICc6ICcgKyBpbWFnZVByb21wdDtcblxuICAgIGNvbnN0IGltYWdlVXJsID0gYXdhaXQgZ2VuZXJhdGVOYW5vQmFuYW5hSW1hZ2UoXG4gICAgICBwcm9tcHQsXG4gICAgICBzY2VuZUlkLFxuICAgICAgdXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc2VlZCxcbiAgICAgIHRydWUsXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46oIEltYWdlIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHk6JywgaW1hZ2VVcmwpO1xuXG4gICAgLy8gUmV0dXJuIHN1Y2Nlc3MgcmVzcG9uc2VcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBpbWFnZVVybCxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGltYWdlIGdlbmVyYXRpb246JywgZXJyb3IpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InLFxuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3Igb2NjdXJyZWQnLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxufTtcbiJdfQ==