"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSubtitles = generateSubtitles;
exports.generateSubtitleContent = generateSubtitleContent;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const assUtils_1 = require("./util/assUtils");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
async function generateSubtitles(scenes, userId, timestamp, subtitleData) {
    // Format: [{ "timestamp.scene-id.ass": "signed-url" }]
    try {
        const subtitleUrls = [];
        let currentTime = 0;
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            let assContent;
            // Check if we have word-level subtitle data for this scene
            const sceneSubtitleData = subtitleData?.find((data) => data.sceneIndex === i);
            if (sceneSubtitleData && sceneSubtitleData.words.length > 0) {
                // Use word-timed karaoke subtitle
                // For scene-by-scene combination, we need scene-relative timings (starting from 0)
                // instead of absolute timings (relative to the start of the entire video)
                assContent = (0, assUtils_1.createWordTimedKaraokeASSSubtitle)(sceneSubtitleData.words, 0);
            }
            else {
                // Fallback to simple subtitle
                // For scene-by-scene combination, we need scene-relative timings
                assContent = createSimpleASSSubtitle(i + 1, 0, // Start from 0 for each scene
                scene.duration, scene.narration);
            }
            // Use ASS format directly
            const assSubtitleBuffer = Buffer.from(assContent, 'utf-8');
            // Save ASS to S3 with timestamp prefix using scene.id
            const assSubtitleKey = `${userId}/${timestamp}.scene-${scene.id}.ass`;
            await s3.send(new client_s3_1.PutObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: assSubtitleKey,
                Body: assSubtitleBuffer,
                ContentType: 'text/plain',
            }));
            // Generate signed URL for the uploaded subtitle file
            const subtitleSignedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: assSubtitleKey,
            }), { expiresIn: 36000 });
            // Extract filename without user prefix (e.g., "1004.scene-1.ass")
            const filename = assSubtitleKey.replace(`${userId}/`, '');
            subtitleUrls.push({ [filename]: subtitleSignedUrl });
            currentTime += scene.duration;
        }
        return subtitleUrls;
    }
    catch (error) {
        console.error('❌ Error in generateSubtitles:', error);
        throw error;
    }
}
async function generateSubtitleContent(scenes, userId, timestamp, subtitleData) {
    // Format: [{ "timestamp.scene-id.ass": "ass-content" }]
    try {
        const subtitleContent = [];
        let currentTime = 0;
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            let assContent;
            // Check if we have word-level subtitle data for this scene
            const sceneSubtitleData = subtitleData?.find((data) => data.sceneIndex === i);
            if (sceneSubtitleData && sceneSubtitleData.words.length > 0) {
                // Use word-timed karaoke subtitle
                assContent = (0, assUtils_1.createWordTimedKaraokeASSSubtitle)(sceneSubtitleData.words, 0);
            }
            else {
                // Fallback to simple subtitle
                assContent = createSimpleASSSubtitle(i + 1, 0, // Start from 0 for each scene
                scene.duration, scene.narration);
            }
            // Extract filename (e.g., "1004.scene-1.ass")
            const filename = `${timestamp}.scene-${scene.id}.ass`;
            subtitleContent.push({ [filename]: assContent });
            currentTime += scene.duration;
        }
        return subtitleContent;
    }
    catch (error) {
        console.error('❌ Error in generateSubtitleContent:', error);
        throw error;
    }
}
function createSimpleASSSubtitle(index, startTime, duration, text) {
    const assContent = (0, assUtils_1.createASSStyleHeader)();
    const startTimeFormatted = (0, assUtils_1.formatASSTime)(startTime);
    const endTimeFormatted = (0, assUtils_1.formatASSTime)(startTime + duration);
    // Use the actual scene text instead of just the description
    const subtitleText = text || `Scene ${index + 1}`;
    return (assContent +
        `Dialogue: 0,${startTimeFormatted},${endTimeFormatted},Default,,0,0,0,,${subtitleText}\n`);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VidGl0bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3VidGl0bGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBaUJBLDhDQTRFQztBQUVELDBEQWdEQztBQS9JRCxrREFJNEI7QUFDNUIsd0VBQTZEO0FBRzdELDhDQUt5QjtBQUV6QixNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBRXJELEtBQUssVUFBVSxpQkFBaUIsQ0FDckMsTUFBZSxFQUNmLE1BQWMsRUFDZCxTQUFpQixFQUNqQixZQUE2QjtJQUU3Qix1REFBdUQ7SUFDdkQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxZQUFZLEdBQXFDLEVBQUUsQ0FBQztRQUMxRCxJQUFJLFdBQVcsR0FBRyxDQUFDLENBQUM7UUFFcEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN2QyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEIsSUFBSSxVQUFrQixDQUFDO1lBRXZCLDJEQUEyRDtZQUMzRCxNQUFNLGlCQUFpQixHQUFHLFlBQVksRUFBRSxJQUFJLENBQzFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxLQUFLLENBQUMsQ0FDaEMsQ0FBQztZQUVGLElBQUksaUJBQWlCLElBQUksaUJBQWlCLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDNUQsa0NBQWtDO2dCQUNsQyxtRkFBbUY7Z0JBQ25GLDBFQUEwRTtnQkFDMUUsVUFBVSxHQUFHLElBQUEsNENBQWlDLEVBQzVDLGlCQUFpQixDQUFDLEtBQUssRUFDdkIsQ0FBQyxDQUNGLENBQUM7WUFDSixDQUFDO2lCQUFNLENBQUM7Z0JBQ04sOEJBQThCO2dCQUM5QixpRUFBaUU7Z0JBQ2pFLFVBQVUsR0FBRyx1QkFBdUIsQ0FDbEMsQ0FBQyxHQUFHLENBQUMsRUFDTCxDQUFDLEVBQUUsOEJBQThCO2dCQUNqQyxLQUFLLENBQUMsUUFBUSxFQUNkLEtBQUssQ0FBQyxTQUFTLENBQ2hCLENBQUM7WUFDSixDQUFDO1lBRUQsMEJBQTBCO1lBQzFCLE1BQU0saUJBQWlCLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFFM0Qsc0RBQXNEO1lBQ3RELE1BQU0sY0FBYyxHQUFHLEdBQUcsTUFBTSxJQUFJLFNBQVMsVUFBVSxLQUFLLENBQUMsRUFBRSxNQUFNLENBQUM7WUFFdEUsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUNYLElBQUksNEJBQWdCLENBQUM7Z0JBQ25CLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QjtnQkFDM0MsR0FBRyxFQUFFLGNBQWM7Z0JBQ25CLElBQUksRUFBRSxpQkFBaUI7Z0JBQ3ZCLFdBQVcsRUFBRSxZQUFZO2FBQzFCLENBQUMsQ0FDSCxDQUFDO1lBRUYscURBQXFEO1lBQ3JELE1BQU0saUJBQWlCLEdBQUcsTUFBTSxJQUFBLG1DQUFZLEVBQzFDLEVBQUUsRUFDRixJQUFJLDRCQUFnQixDQUFDO2dCQUNuQixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUI7Z0JBQzNDLEdBQUcsRUFBRSxjQUFjO2FBQ3BCLENBQUMsRUFDRixFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FDckIsQ0FBQztZQUVGLGtFQUFrRTtZQUNsRSxNQUFNLFFBQVEsR0FBRyxjQUFjLENBQUMsT0FBTyxDQUFDLEdBQUcsTUFBTSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFFMUQsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1lBQ3JELFdBQVcsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDO1FBQ2hDLENBQUM7UUFFRCxPQUFPLFlBQVksQ0FBQztJQUN0QixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQztBQUVNLEtBQUssVUFBVSx1QkFBdUIsQ0FDM0MsTUFBZSxFQUNmLE1BQWMsRUFDZCxTQUFpQixFQUNqQixZQUE2QjtJQUU3Qix3REFBd0Q7SUFDeEQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxlQUFlLEdBQXFDLEVBQUUsQ0FBQztRQUM3RCxJQUFJLFdBQVcsR0FBRyxDQUFDLENBQUM7UUFFcEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN2QyxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEIsSUFBSSxVQUFrQixDQUFDO1lBRXZCLDJEQUEyRDtZQUMzRCxNQUFNLGlCQUFpQixHQUFHLFlBQVksRUFBRSxJQUFJLENBQzFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxLQUFLLENBQUMsQ0FDaEMsQ0FBQztZQUVGLElBQUksaUJBQWlCLElBQUksaUJBQWlCLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDNUQsa0NBQWtDO2dCQUNsQyxVQUFVLEdBQUcsSUFBQSw0Q0FBaUMsRUFDNUMsaUJBQWlCLENBQUMsS0FBSyxFQUN2QixDQUFDLENBQ0YsQ0FBQztZQUNKLENBQUM7aUJBQU0sQ0FBQztnQkFDTiw4QkFBOEI7Z0JBQzlCLFVBQVUsR0FBRyx1QkFBdUIsQ0FDbEMsQ0FBQyxHQUFHLENBQUMsRUFDTCxDQUFDLEVBQUUsOEJBQThCO2dCQUNqQyxLQUFLLENBQUMsUUFBUSxFQUNkLEtBQUssQ0FBQyxTQUFTLENBQ2hCLENBQUM7WUFDSixDQUFDO1lBRUQsOENBQThDO1lBQzlDLE1BQU0sUUFBUSxHQUFHLEdBQUcsU0FBUyxVQUFVLEtBQUssQ0FBQyxFQUFFLE1BQU0sQ0FBQztZQUV0RCxlQUFlLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1lBQ2pELFdBQVcsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDO1FBQ2hDLENBQUM7UUFFRCxPQUFPLGVBQWUsQ0FBQztJQUN6QixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMscUNBQXFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDNUQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsdUJBQXVCLENBQzlCLEtBQWEsRUFDYixTQUFpQixFQUNqQixRQUFnQixFQUNoQixJQUFZO0lBRVosTUFBTSxVQUFVLEdBQUcsSUFBQSwrQkFBb0IsR0FBRSxDQUFDO0lBRTFDLE1BQU0sa0JBQWtCLEdBQUcsSUFBQSx3QkFBYSxFQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3BELE1BQU0sZ0JBQWdCLEdBQUcsSUFBQSx3QkFBYSxFQUFDLFNBQVMsR0FBRyxRQUFRLENBQUMsQ0FBQztJQUU3RCw0REFBNEQ7SUFDNUQsTUFBTSxZQUFZLEdBQUcsSUFBSSxJQUFJLFNBQVMsS0FBSyxHQUFHLENBQUMsRUFBRSxDQUFDO0lBRWxELE9BQU8sQ0FDTCxVQUFVO1FBQ1YsZUFBZSxrQkFBa0IsSUFBSSxnQkFBZ0Isb0JBQW9CLFlBQVksSUFBSSxDQUMxRixDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIFMzQ2xpZW50LFxuICBQdXRPYmplY3RDb21tYW5kLFxuICBHZXRPYmplY3RDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSAnQGF3cy1zZGsvczMtcmVxdWVzdC1wcmVzaWduZXInO1xuaW1wb3J0IHsgU2NlbmUgfSBmcm9tICcuL3NjcmlwdCc7XG5pbXBvcnQgeyBTdWJ0aXRsZURhdGEgfSBmcm9tICcuL2F1ZGlvJztcbmltcG9ydCB7XG4gIGZvcm1hdEFTU1RpbWUsXG4gIGNyZWF0ZUFTU1N0eWxlSGVhZGVyLFxuICBjcmVhdGVXb3JkVGltZWRLYXJhb2tlQVNTU3VidGl0bGUsXG4gIFN1YnRpdGxlV29yZCxcbn0gZnJvbSAnLi91dGlsL2Fzc1V0aWxzJztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVN1YnRpdGxlcyhcbiAgc2NlbmVzOiBTY2VuZVtdLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHN1YnRpdGxlRGF0YT86IFN1YnRpdGxlRGF0YVtdLFxuKTogUHJvbWlzZTxBcnJheTx7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9Pj4ge1xuICAvLyBGb3JtYXQ6IFt7IFwidGltZXN0YW1wLnNjZW5lLWlkLmFzc1wiOiBcInNpZ25lZC11cmxcIiB9XVxuICB0cnkge1xuICAgIGNvbnN0IHN1YnRpdGxlVXJsczogQXJyYXk8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT4gPSBbXTtcbiAgICBsZXQgY3VycmVudFRpbWUgPSAwO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzY2VuZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHNjZW5lID0gc2NlbmVzW2ldO1xuICAgICAgbGV0IGFzc0NvbnRlbnQ6IHN0cmluZztcblxuICAgICAgLy8gQ2hlY2sgaWYgd2UgaGF2ZSB3b3JkLWxldmVsIHN1YnRpdGxlIGRhdGEgZm9yIHRoaXMgc2NlbmVcbiAgICAgIGNvbnN0IHNjZW5lU3VidGl0bGVEYXRhID0gc3VidGl0bGVEYXRhPy5maW5kKFxuICAgICAgICAoZGF0YSkgPT4gZGF0YS5zY2VuZUluZGV4ID09PSBpLFxuICAgICAgKTtcblxuICAgICAgaWYgKHNjZW5lU3VidGl0bGVEYXRhICYmIHNjZW5lU3VidGl0bGVEYXRhLndvcmRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgLy8gVXNlIHdvcmQtdGltZWQga2FyYW9rZSBzdWJ0aXRsZVxuICAgICAgICAvLyBGb3Igc2NlbmUtYnktc2NlbmUgY29tYmluYXRpb24sIHdlIG5lZWQgc2NlbmUtcmVsYXRpdmUgdGltaW5ncyAoc3RhcnRpbmcgZnJvbSAwKVxuICAgICAgICAvLyBpbnN0ZWFkIG9mIGFic29sdXRlIHRpbWluZ3MgKHJlbGF0aXZlIHRvIHRoZSBzdGFydCBvZiB0aGUgZW50aXJlIHZpZGVvKVxuICAgICAgICBhc3NDb250ZW50ID0gY3JlYXRlV29yZFRpbWVkS2FyYW9rZUFTU1N1YnRpdGxlKFxuICAgICAgICAgIHNjZW5lU3VidGl0bGVEYXRhLndvcmRzLFxuICAgICAgICAgIDAsIC8vIFN0YXJ0IGZyb20gMCBmb3IgZWFjaCBzY2VuZVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gc2ltcGxlIHN1YnRpdGxlXG4gICAgICAgIC8vIEZvciBzY2VuZS1ieS1zY2VuZSBjb21iaW5hdGlvbiwgd2UgbmVlZCBzY2VuZS1yZWxhdGl2ZSB0aW1pbmdzXG4gICAgICAgIGFzc0NvbnRlbnQgPSBjcmVhdGVTaW1wbGVBU1NTdWJ0aXRsZShcbiAgICAgICAgICBpICsgMSxcbiAgICAgICAgICAwLCAvLyBTdGFydCBmcm9tIDAgZm9yIGVhY2ggc2NlbmVcbiAgICAgICAgICBzY2VuZS5kdXJhdGlvbixcbiAgICAgICAgICBzY2VuZS5uYXJyYXRpb24sXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIC8vIFVzZSBBU1MgZm9ybWF0IGRpcmVjdGx5XG4gICAgICBjb25zdCBhc3NTdWJ0aXRsZUJ1ZmZlciA9IEJ1ZmZlci5mcm9tKGFzc0NvbnRlbnQsICd1dGYtOCcpO1xuXG4gICAgICAvLyBTYXZlIEFTUyB0byBTMyB3aXRoIHRpbWVzdGFtcCBwcmVmaXggdXNpbmcgc2NlbmUuaWRcbiAgICAgIGNvbnN0IGFzc1N1YnRpdGxlS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0uYXNzYDtcblxuICAgICAgYXdhaXQgczMuc2VuZChcbiAgICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgS2V5OiBhc3NTdWJ0aXRsZUtleSxcbiAgICAgICAgICBCb2R5OiBhc3NTdWJ0aXRsZUJ1ZmZlcixcbiAgICAgICAgICBDb250ZW50VHlwZTogJ3RleHQvcGxhaW4nLFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIC8vIEdlbmVyYXRlIHNpZ25lZCBVUkwgZm9yIHRoZSB1cGxvYWRlZCBzdWJ0aXRsZSBmaWxlXG4gICAgICBjb25zdCBzdWJ0aXRsZVNpZ25lZFVybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgICAgczMsXG4gICAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogYXNzU3VidGl0bGVLZXksXG4gICAgICAgIH0pLFxuICAgICAgICB7IGV4cGlyZXNJbjogMzYwMDAgfSwgLy8gMTAgaG91cnMgZXhwaXJhdGlvblxuICAgICAgKTtcblxuICAgICAgLy8gRXh0cmFjdCBmaWxlbmFtZSB3aXRob3V0IHVzZXIgcHJlZml4IChlLmcuLCBcIjEwMDQuc2NlbmUtMS5hc3NcIilcbiAgICAgIGNvbnN0IGZpbGVuYW1lID0gYXNzU3VidGl0bGVLZXkucmVwbGFjZShgJHt1c2VySWR9L2AsICcnKTtcblxuICAgICAgc3VidGl0bGVVcmxzLnB1c2goeyBbZmlsZW5hbWVdOiBzdWJ0aXRsZVNpZ25lZFVybCB9KTtcbiAgICAgIGN1cnJlbnRUaW1lICs9IHNjZW5lLmR1cmF0aW9uO1xuICAgIH1cblxuICAgIHJldHVybiBzdWJ0aXRsZVVybHM7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlU3VidGl0bGVzOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVTdWJ0aXRsZUNvbnRlbnQoXG4gIHNjZW5lczogU2NlbmVbXSxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBzdWJ0aXRsZURhdGE/OiBTdWJ0aXRsZURhdGFbXSxcbik6IFByb21pc2U8QXJyYXk8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT4+IHtcbiAgLy8gRm9ybWF0OiBbeyBcInRpbWVzdGFtcC5zY2VuZS1pZC5hc3NcIjogXCJhc3MtY29udGVudFwiIH1dXG4gIHRyeSB7XG4gICAgY29uc3Qgc3VidGl0bGVDb250ZW50OiBBcnJheTx7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9PiA9IFtdO1xuICAgIGxldCBjdXJyZW50VGltZSA9IDA7XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjZW5lcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgc2NlbmUgPSBzY2VuZXNbaV07XG4gICAgICBsZXQgYXNzQ29udGVudDogc3RyaW5nO1xuXG4gICAgICAvLyBDaGVjayBpZiB3ZSBoYXZlIHdvcmQtbGV2ZWwgc3VidGl0bGUgZGF0YSBmb3IgdGhpcyBzY2VuZVxuICAgICAgY29uc3Qgc2NlbmVTdWJ0aXRsZURhdGEgPSBzdWJ0aXRsZURhdGE/LmZpbmQoXG4gICAgICAgIChkYXRhKSA9PiBkYXRhLnNjZW5lSW5kZXggPT09IGksXG4gICAgICApO1xuXG4gICAgICBpZiAoc2NlbmVTdWJ0aXRsZURhdGEgJiYgc2NlbmVTdWJ0aXRsZURhdGEud29yZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAvLyBVc2Ugd29yZC10aW1lZCBrYXJhb2tlIHN1YnRpdGxlXG4gICAgICAgIGFzc0NvbnRlbnQgPSBjcmVhdGVXb3JkVGltZWRLYXJhb2tlQVNTU3VidGl0bGUoXG4gICAgICAgICAgc2NlbmVTdWJ0aXRsZURhdGEud29yZHMsXG4gICAgICAgICAgMCwgLy8gU3RhcnQgZnJvbSAwIGZvciBlYWNoIHNjZW5lXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBGYWxsYmFjayB0byBzaW1wbGUgc3VidGl0bGVcbiAgICAgICAgYXNzQ29udGVudCA9IGNyZWF0ZVNpbXBsZUFTU1N1YnRpdGxlKFxuICAgICAgICAgIGkgKyAxLFxuICAgICAgICAgIDAsIC8vIFN0YXJ0IGZyb20gMCBmb3IgZWFjaCBzY2VuZVxuICAgICAgICAgIHNjZW5lLmR1cmF0aW9uLFxuICAgICAgICAgIHNjZW5lLm5hcnJhdGlvbixcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgLy8gRXh0cmFjdCBmaWxlbmFtZSAoZS5nLiwgXCIxMDA0LnNjZW5lLTEuYXNzXCIpXG4gICAgICBjb25zdCBmaWxlbmFtZSA9IGAke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0uYXNzYDtcblxuICAgICAgc3VidGl0bGVDb250ZW50LnB1c2goeyBbZmlsZW5hbWVdOiBhc3NDb250ZW50IH0pO1xuICAgICAgY3VycmVudFRpbWUgKz0gc2NlbmUuZHVyYXRpb247XG4gICAgfVxuXG4gICAgcmV0dXJuIHN1YnRpdGxlQ29udGVudDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZ2VuZXJhdGVTdWJ0aXRsZUNvbnRlbnQ6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVNpbXBsZUFTU1N1YnRpdGxlKFxuICBpbmRleDogbnVtYmVyLFxuICBzdGFydFRpbWU6IG51bWJlcixcbiAgZHVyYXRpb246IG51bWJlcixcbiAgdGV4dDogc3RyaW5nLFxuKTogc3RyaW5nIHtcbiAgY29uc3QgYXNzQ29udGVudCA9IGNyZWF0ZUFTU1N0eWxlSGVhZGVyKCk7XG5cbiAgY29uc3Qgc3RhcnRUaW1lRm9ybWF0dGVkID0gZm9ybWF0QVNTVGltZShzdGFydFRpbWUpO1xuICBjb25zdCBlbmRUaW1lRm9ybWF0dGVkID0gZm9ybWF0QVNTVGltZShzdGFydFRpbWUgKyBkdXJhdGlvbik7XG5cbiAgLy8gVXNlIHRoZSBhY3R1YWwgc2NlbmUgdGV4dCBpbnN0ZWFkIG9mIGp1c3QgdGhlIGRlc2NyaXB0aW9uXG4gIGNvbnN0IHN1YnRpdGxlVGV4dCA9IHRleHQgfHwgYFNjZW5lICR7aW5kZXggKyAxfWA7XG5cbiAgcmV0dXJuIChcbiAgICBhc3NDb250ZW50ICtcbiAgICBgRGlhbG9ndWU6IDAsJHtzdGFydFRpbWVGb3JtYXR0ZWR9LCR7ZW5kVGltZUZvcm1hdHRlZH0sRGVmYXVsdCwsMCwwLDAsLCR7c3VidGl0bGVUZXh0fVxcbmBcbiAgKTtcbn1cbiJdfQ==