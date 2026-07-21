"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const manifestUtils_1 = require("../utils/manifestUtils");
const quota_1 = require("../utils/quota");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
/**
 * Scene animation via Runway routinely takes longer than API Gateway's hard
 * 29s integration timeout, so this handler only validates the request and
 * quota, then enqueues the actual work to the video-generation SQS queue
 * (processAnimateScene). The frontend is notified of completion via the
 * existing WebSocket broadcast channel ('scene_animated' / 'error'), the
 * same pattern already used for video generation and batch edits.
 */
const handler = async (event) => {
    console.log('🎬 Animate Scene Lambda handler started');
    try {
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
        // Mock generation renders a real clip via ffmpeg but doesn't call
        // Runway, so it shouldn't burn the user's real animation quota.
        const isMockGeneration = process.env.MOCK_IMAGE_GENERATION === 'true';
        const { allowed, used, limit, plan } = isMockGeneration
            ? { allowed: true, used: 0, limit: 0, plan: 'pro' }
            : await (0, quota_1.checkAndConsumeAnimationQuota)(userId);
        if (!allowed) {
            console.log(`❌ Animation quota exceeded for user ${userId}: ${used}/${limit} (${plan})`);
            return {
                statusCode: 403,
                body: JSON.stringify({
                    error: plan === 'free'
                        ? `You've used your ${limit} free scene animation. Upgrade for scene animations every month.`
                        : `You've reached this month's limit of ${limit} scene animations. Your limit resets next month.`,
                    animationQuota: { used, limit, plan },
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
        const { sceneId, animationPrompt } = JSON.parse(event.body);
        if (sceneId === undefined || sceneId === null) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'sceneId is required' }),
            };
        }
        if (!animationPrompt) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'animationPrompt is required' }),
            };
        }
        const manifest = await (0, manifestUtils_1.getManifest)(userId, timestamp);
        if (!manifest) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Manifest not found' }),
            };
        }
        const scene = manifest.scenes.find((s) => s.id === sceneId);
        if (!scene) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Scene not found' }),
            };
        }
        if (!scene.files.png && !scene.files.jpg) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Scene has no generated image to animate',
                }),
            };
        }
        if (!process.env.VIDEO_QUEUE_URL) {
            console.error('❌ VIDEO_QUEUE_URL is not set');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Queue URL not configured' }),
            };
        }
        await sqs.send(new client_sqs_1.SendMessageCommand({
            QueueUrl: process.env.VIDEO_QUEUE_URL,
            MessageBody: JSON.stringify({
                type: 'animate-scene',
                userId,
                timestamp,
                sceneId,
                animationPrompt,
            }),
        }));
        console.log(`🎬 Queued scene ${sceneId} for animation`);
        return {
            statusCode: 200,
            body: JSON.stringify({ status: 'queued' }),
        };
    }
    catch (error) {
        console.error('❌ Error in scene animation:', error);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxvREFBb0U7QUFFcEUsMERBQXFEO0FBQ3JELDBDQUErRDtBQUUvRCxNQUFNLEdBQUcsR0FBRyxJQUFJLHNCQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVyxFQUFFLENBQUMsQ0FBQztBQU83RTs7Ozs7OztHQU9HO0FBQ0ksTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUMxQixLQUEyQixFQUNLLEVBQUU7SUFDbEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO0lBRXZELElBQUksQ0FBQztRQUNILElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSwwQkFBMEIsRUFBRSxDQUFDO2FBQzVELENBQUM7UUFDSixDQUFDO1FBRUQseUNBQXlDO1FBQ3pDLE1BQU0sTUFBTSxHQUFJLEtBQUssQ0FBQyxjQUFzQixDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUM7UUFDckUsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ1osT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQzthQUNoRCxDQUFDO1FBQ0osQ0FBQztRQUVELGtFQUFrRTtRQUNsRSxnRUFBZ0U7UUFDaEUsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixLQUFLLE1BQU0sQ0FBQztRQUV0RSxNQUFNLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEdBQUcsZ0JBQWdC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LHdCQUF3QjthQUNwRSxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUF0SVcsUUFBQSxPQUFPLFdBc0lsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IFNRU0NsaWVudCwgU2VuZE1lc3NhZ2VDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5cbmltcG9ydCB7IGdldE1hbmlmZXN0IH0gZnJvbSAnLi4vdXRpbHMvbWFuaWZlc3RVdGlscyc7XG5pbXBvcnQgeyBjaGVja0FuZENvbnN1bWVBbmltYXRpb25RdW90YSB9IGZyb20gJy4uL3V0aWxzL3F1b3RhJztcblxuY29uc3Qgc3FzID0gbmV3IFNRU0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyB9KTtcblxuaW50ZXJmYWNlIFJlcXVlc3RCb2R5IHtcbiAgc2NlbmVJZDogbnVtYmVyO1xuICBhbmltYXRpb25Qcm9tcHQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBTY2VuZSBhbmltYXRpb24gdmlhIFJ1bndheSByb3V0aW5lbHkgdGFrZXMgbG9uZ2VyIHRoYW4gQVBJIEdhdGV3YXkncyBoYXJkXG4gKiAyOXMgaW50ZWdyYXRpb24gdGltZW91dCwgc28gdGhpcyBoYW5kbGVyIG9ubHkgdmFsaWRhdGVzIHRoZSByZXF1ZXN0IGFuZFxuICogcXVvdGEsIHRoZW4gZW5xdWV1ZXMgdGhlIGFjdHVhbCB3b3JrIHRvIHRoZSB2aWRlby1nZW5lcmF0aW9uIFNRUyBxdWV1ZVxuICogKHByb2Nlc3NBbmltYXRlU2NlbmUpLiBUaGUgZnJvbnRlbmQgaXMgbm90aWZpZWQgb2YgY29tcGxldGlvbiB2aWEgdGhlXG4gKiBleGlzdGluZyBXZWJTb2NrZXQgYnJvYWRjYXN0IGNoYW5uZWwgKCdzY2VuZV9hbmltYXRlZCcgLyAnZXJyb3InKSwgdGhlXG4gKiBzYW1lIHBhdHRlcm4gYWxyZWFkeSB1c2VkIGZvciB2aWRlbyBnZW5lcmF0aW9uIGFuZCBiYXRjaCBlZGl0cy5cbiAqL1xuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoXG4gIGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCxcbik6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIGNvbnNvbGUubG9nKCfwn46sIEFuaW1hdGUgU2NlbmUgTGFtYmRhIGhhbmRsZXIgc3RhcnRlZCcpO1xuXG4gIHRyeSB7XG4gICAgaWYgKCFldmVudC5ib2R5KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdSZXF1ZXN0IGJvZHkgaXMgcmVxdWlyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBnZXQgdXNlcklkIGZyb20gdGhlIGF1dGhvcml6ZXIgY29udGV4dFxuICAgIGNvbnN0IHVzZXJJZCA9IChldmVudC5yZXF1ZXN0Q29udGV4dCBhcyBhbnkpLmF1dGhvcml6ZXI/LnByaW5jaXBhbElkO1xuICAgIGlmICghdXNlcklkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDEsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdVbmF1dGhvcml6ZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBNb2NrIGdlbmVyYXRpb24gcmVuZGVycyBhIHJlYWwgY2xpcCB2aWEgZmZtcGVnIGJ1dCBkb2Vzbid0IGNhbGxcbiAgICAvLyBSdW53YXksIHNvIGl0IHNob3VsZG4ndCBidXJuIHRoZSB1c2VyJ3MgcmVhbCBhbmltYXRpb24gcXVvdGEuXG4gICAgY29uc3QgaXNNb2NrR2VuZXJhdGlvbiA9IHByb2Nlc3MuZW52Lk1PQ0tfSU1BR0VfR0VORVJBVElPTiA9PT0gJ3RydWUnO1xuXG4gICAgY29uc3QgeyBhbGxvd2VkLCB1c2VkLCBsaW1pdCwgcGxhbiB9ID0gaXNNb2NrR2VuZXJhdGlvblxuICAgICAgPyB7IGFsbG93ZWQ6IHRydWUsIHVzZWQ6IDAsIGxpbWl0OiAwLCBwbGFuOiAncHJvJyBhcyBjb25zdCB9XG4gICAgICA6IGF3YWl0IGNoZWNrQW5kQ29uc3VtZUFuaW1hdGlvblF1b3RhKHVzZXJJZCk7XG4gICAgaWYgKCFhbGxvd2VkKSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYOKdjCBBbmltYXRpb24gcXVvdGEgZXhjZWVkZWQgZm9yIHVzZXIgJHt1c2VySWR9OiAke3VzZWR9LyR7bGltaXR9ICgke3BsYW59KWAsXG4gICAgICApO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgZXJyb3I6XG4gICAgICAgICAgICBwbGFuID09PSAnZnJlZSdcbiAgICAgICAgICAgICAgPyBgWW91J3ZlIHVzZWQgeW91ciAke2xpbWl0fSBmcmVlIHNjZW5lIGFuaW1hdGlvbi4gVXBncmFkZSBmb3Igc2NlbmUgYW5pbWF0aW9ucyBldmVyeSBtb250aC5gXG4gICAgICAgICAgICAgIDogYFlvdSd2ZSByZWFjaGVkIHRoaXMgbW9udGgncyBsaW1pdCBvZiAke2xpbWl0fSBzY2VuZSBhbmltYXRpb25zLiBZb3VyIGxpbWl0IHJlc2V0cyBuZXh0IG1vbnRoLmAsXG4gICAgICAgICAgYW5pbWF0aW9uUXVvdGE6IHsgdXNlZCwgbGltaXQsIHBsYW4gfSxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIGdldCB0aW1lc3RhbXAgZnJvbSBxdWVyeSBzdHJpbmdcbiAgICBjb25zdCB0aW1lc3RhbXAgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnM/LlsndGltZXN0YW1wJ107XG4gICAgaWYgKCF0aW1lc3RhbXApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1RpbWVzdGFtcCBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHsgc2NlbmVJZCwgYW5pbWF0aW9uUHJvbXB0IH0gPSBKU09OLnBhcnNlKFxuICAgICAgZXZlbnQuYm9keSxcbiAgICApIGFzIFJlcXVlc3RCb2R5O1xuICAgIGlmIChzY2VuZUlkID09PSB1bmRlZmluZWQgfHwgc2NlbmVJZCA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnc2NlbmVJZCBpcyByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAoIWFuaW1hdGlvblByb21wdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnYW5pbWF0aW9uUHJvbXB0IGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdCh1c2VySWQsIHRpbWVzdGFtcCk7XG4gICAgaWYgKCFtYW5pZmVzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWFuaWZlc3Qgbm90IGZvdW5kJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3Qgc2NlbmUgPSBtYW5pZmVzdC5zY2VuZXMuZmluZCgocykgPT4gcy5pZCA9PT0gc2NlbmVJZCk7XG4gICAgaWYgKCFzY2VuZSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDA0LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnU2NlbmUgbm90IGZvdW5kJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCFzY2VuZS5maWxlcy5wbmcgJiYgIXNjZW5lLmZpbGVzLmpwZykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgZXJyb3I6ICdTY2VuZSBoYXMgbm8gZ2VuZXJhdGVkIGltYWdlIHRvIGFuaW1hdGUnLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCFwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBWSURFT19RVUVVRV9VUkwgaXMgbm90IHNldCcpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUXVldWUgVVJMIG5vdCBjb25maWd1cmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgYXdhaXQgc3FzLnNlbmQoXG4gICAgICBuZXcgU2VuZE1lc3NhZ2VDb21tYW5kKHtcbiAgICAgICAgUXVldWVVcmw6IHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCxcbiAgICAgICAgTWVzc2FnZUJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICB0eXBlOiAnYW5pbWF0ZS1zY2VuZScsXG4gICAgICAgICAgdXNlcklkLFxuICAgICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgICBzY2VuZUlkLFxuICAgICAgICAgIGFuaW1hdGlvblByb21wdCxcbiAgICAgICAgfSksXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coYPCfjqwgUXVldWVkIHNjZW5lICR7c2NlbmVJZH0gZm9yIGFuaW1hdGlvbmApO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgc3RhdHVzOiAncXVldWVkJyB9KSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBzY2VuZSBhbmltYXRpb246JywgZXJyb3IpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InLFxuICAgICAgICBtZXNzYWdlOlxuICAgICAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3Igb2NjdXJyZWQnLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxufTtcbiJdfQ==