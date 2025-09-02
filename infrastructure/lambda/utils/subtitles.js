"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSubtitles = generateSubtitles;
const client_s3_1 = require("@aws-sdk/client-s3");
const assUtils_1 = require("./assUtils");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
async function generateSubtitles(scenes, userId, timestamp, subtitleData) {
    // Format: [{ "timestamp.scene-id.ass": "ass-content" }]
    try {
        const assContentArray = [];
        let currentTime = 0;
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            let assContent;
            // Check if we have word-level subtitle data for this scene
            // Use scene.id as sceneIndex since that's what we're passing from the lambda
            const sceneSubtitleData = subtitleData?.find((data) => data.sceneIndex === scene.id);
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
            // Extract filename without user prefix (e.g., "1004.scene-1.ass")
            const filename = assSubtitleKey.replace(`${userId}/`, '');
            // Return inline content instead of a signed URL
            assContentArray.push({ [filename]: assContent });
            currentTime += scene.duration;
        }
        return assContentArray;
    }
    catch (error) {
        console.error('❌ Error in generateSubtitles:', error);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VidGl0bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3VidGl0bGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBcUJBLDhDQW9FQztBQXpGRCxrREFJNEI7QUFJNUIseUNBSW9CO0FBRXBCLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFPckQsS0FBSyxVQUFVLGlCQUFpQixDQUNyQyxNQUFlLEVBQ2YsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLFlBQTZCO0lBRTdCLHdEQUF3RDtJQUN4RCxJQUFJLENBQUM7UUFDSCxNQUFNLGVBQWUsR0FBcUMsRUFBRSxDQUFDO1FBQzdELElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztRQUVwQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3ZDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QixJQUFJLFVBQWtCLENBQUM7WUFFdkIsMkRBQTJEO1lBQzNELDZFQUE2RTtZQUM3RSxNQUFNLGlCQUFpQixHQUFHLFlBQVksRUFBRSxJQUFJLENBQzFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxLQUFLLEtBQUssQ0FBQyxFQUFFLENBQ3ZDLENBQUM7WUFFRixJQUFJLGlCQUFpQixJQUFJLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzVELGtDQUFrQztnQkFDbEMsbUZBQW1GO2dCQUNuRiwwRUFBMEU7Z0JBQzFFLFVBQVUsR0FBRyxJQUFBLDRDQUFpQyxFQUM1QyxpQkFBaUIsQ0FBQyxLQUFLLEVBQ3ZCLENBQUMsQ0FDRixDQUFDO1lBQ0osQ0FBQztpQkFBTSxDQUFDO2dCQUNOLDhCQUE4QjtnQkFDOUIsaUVBQWlFO2dCQUNqRSxVQUFVLEdBQUcsdUJBQXVCLENBQ2xDLENBQUMsR0FBRyxDQUFDLEVBQ0wsQ0FBQyxFQUFFLDhCQUE4QjtnQkFDakMsS0FBSyxDQUFDLFFBQVEsRUFDZCxLQUFLLENBQUMsU0FBUyxDQUNoQixDQUFDO1lBQ0osQ0FBQztZQUVELDBCQUEwQjtZQUMxQixNQUFNLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBRTNELHNEQUFzRDtZQUN0RCxNQUFNLGNBQWMsR0FBRyxHQUFHLE1BQU0sSUFBSSxTQUFTLFVBQVUsS0FBSyxDQUFDLEVBQUUsTUFBTSxDQUFDO1lBRXRFLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FDWCxJQUFJLDRCQUFnQixDQUFDO2dCQUNuQixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUI7Z0JBQzNDLEdBQUcsRUFBRSxjQUFjO2dCQUNuQixJQUFJLEVBQUUsaUJBQWlCO2dCQUN2QixXQUFXLEVBQUUsWUFBWTthQUMxQixDQUFDLENBQ0gsQ0FBQztZQUVGLGtFQUFrRTtZQUNsRSxNQUFNLFFBQVEsR0FBRyxjQUFjLENBQUMsT0FBTyxDQUFDLEdBQUcsTUFBTSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFFMUQsZ0RBQWdEO1lBQ2hELGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7WUFDakQsV0FBVyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUM7UUFDaEMsQ0FBQztRQUVELE9BQU8sZUFBZSxDQUFDO0lBQ3pCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0RCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyx1QkFBdUIsQ0FDOUIsS0FBYSxFQUNiLFNBQWlCLEVBQ2pCLFFBQWdCLEVBQ2hCLElBQVk7SUFFWixNQUFNLFVBQVUsR0FBRyxJQUFBLCtCQUFvQixHQUFFLENBQUM7SUFFMUMsTUFBTSxrQkFBa0IsR0FBRyxJQUFBLHdCQUFhLEVBQUMsU0FBUyxDQUFDLENBQUM7SUFDcEQsTUFBTSxnQkFBZ0IsR0FBRyxJQUFBLHdCQUFhLEVBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQyxDQUFDO0lBRTdELDREQUE0RDtJQUM1RCxNQUFNLFlBQVksR0FBRyxJQUFJLElBQUksU0FBUyxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUM7SUFFbEQsT0FBTyxDQUNMLFVBQVU7UUFDVixlQUFlLGtCQUFrQixJQUFJLGdCQUFnQixvQkFBb0IsWUFBWSxJQUFJLENBQzFGLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgUzNDbGllbnQsXG4gIFB1dE9iamVjdENvbW1hbmQsXG4gIEdldE9iamVjdENvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5cbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi9zY3JpcHQnO1xuaW1wb3J0IHsgU3VidGl0bGVEYXRhIH0gZnJvbSAnLi9hdWRpbyc7XG5pbXBvcnQge1xuICBmb3JtYXRBU1NUaW1lLFxuICBjcmVhdGVBU1NTdHlsZUhlYWRlcixcbiAgY3JlYXRlV29yZFRpbWVkS2FyYW9rZUFTU1N1YnRpdGxlLFxufSBmcm9tICcuL2Fzc1V0aWxzJztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5cbi8vIFR5cGUgZm9yIEFTUyBjb250ZW50IHJlc3VsdFxuZXhwb3J0IGludGVyZmFjZSBBU1NDb250ZW50UmVzdWx0IHtcbiAgW2ZpbGVuYW1lOiBzdHJpbmddOiBzdHJpbmc7IC8vIGUuZy4sIHsgXCIxMDA0LnNjZW5lLTEuYXNzXCI6IFwiW1NjcmlwdCBJbmZvXVxcbi4uLlwiIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlU3VidGl0bGVzKFxuICBzY2VuZXM6IFNjZW5lW10sXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgc3VidGl0bGVEYXRhPzogU3VidGl0bGVEYXRhW10sXG4pOiBQcm9taXNlPEFTU0NvbnRlbnRSZXN1bHRbXT4ge1xuICAvLyBGb3JtYXQ6IFt7IFwidGltZXN0YW1wLnNjZW5lLWlkLmFzc1wiOiBcImFzcy1jb250ZW50XCIgfV1cbiAgdHJ5IHtcbiAgICBjb25zdCBhc3NDb250ZW50QXJyYXk6IEFycmF5PHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0+ID0gW107XG4gICAgbGV0IGN1cnJlbnRUaW1lID0gMDtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NlbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBzY2VuZSA9IHNjZW5lc1tpXTtcbiAgICAgIGxldCBhc3NDb250ZW50OiBzdHJpbmc7XG5cbiAgICAgIC8vIENoZWNrIGlmIHdlIGhhdmUgd29yZC1sZXZlbCBzdWJ0aXRsZSBkYXRhIGZvciB0aGlzIHNjZW5lXG4gICAgICAvLyBVc2Ugc2NlbmUuaWQgYXMgc2NlbmVJbmRleCBzaW5jZSB0aGF0J3Mgd2hhdCB3ZSdyZSBwYXNzaW5nIGZyb20gdGhlIGxhbWJkYVxuICAgICAgY29uc3Qgc2NlbmVTdWJ0aXRsZURhdGEgPSBzdWJ0aXRsZURhdGE/LmZpbmQoXG4gICAgICAgIChkYXRhKSA9PiBkYXRhLnNjZW5lSW5kZXggPT09IHNjZW5lLmlkLFxuICAgICAgKTtcblxuICAgICAgaWYgKHNjZW5lU3VidGl0bGVEYXRhICYmIHNjZW5lU3VidGl0bGVEYXRhLndvcmRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgLy8gVXNlIHdvcmQtdGltZWQga2FyYW9rZSBzdWJ0aXRsZVxuICAgICAgICAvLyBGb3Igc2NlbmUtYnktc2NlbmUgY29tYmluYXRpb24sIHdlIG5lZWQgc2NlbmUtcmVsYXRpdmUgdGltaW5ncyAoc3RhcnRpbmcgZnJvbSAwKVxuICAgICAgICAvLyBpbnN0ZWFkIG9mIGFic29sdXRlIHRpbWluZ3MgKHJlbGF0aXZlIHRvIHRoZSBzdGFydCBvZiB0aGUgZW50aXJlIHZpZGVvKVxuICAgICAgICBhc3NDb250ZW50ID0gY3JlYXRlV29yZFRpbWVkS2FyYW9rZUFTU1N1YnRpdGxlKFxuICAgICAgICAgIHNjZW5lU3VidGl0bGVEYXRhLndvcmRzLFxuICAgICAgICAgIDAsIC8vIFN0YXJ0IGZyb20gMCBmb3IgZWFjaCBzY2VuZVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gc2ltcGxlIHN1YnRpdGxlXG4gICAgICAgIC8vIEZvciBzY2VuZS1ieS1zY2VuZSBjb21iaW5hdGlvbiwgd2UgbmVlZCBzY2VuZS1yZWxhdGl2ZSB0aW1pbmdzXG4gICAgICAgIGFzc0NvbnRlbnQgPSBjcmVhdGVTaW1wbGVBU1NTdWJ0aXRsZShcbiAgICAgICAgICBpICsgMSxcbiAgICAgICAgICAwLCAvLyBTdGFydCBmcm9tIDAgZm9yIGVhY2ggc2NlbmVcbiAgICAgICAgICBzY2VuZS5kdXJhdGlvbixcbiAgICAgICAgICBzY2VuZS5uYXJyYXRpb24sXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIC8vIFVzZSBBU1MgZm9ybWF0IGRpcmVjdGx5XG4gICAgICBjb25zdCBhc3NTdWJ0aXRsZUJ1ZmZlciA9IEJ1ZmZlci5mcm9tKGFzc0NvbnRlbnQsICd1dGYtOCcpO1xuXG4gICAgICAvLyBTYXZlIEFTUyB0byBTMyB3aXRoIHRpbWVzdGFtcCBwcmVmaXggdXNpbmcgc2NlbmUuaWRcbiAgICAgIGNvbnN0IGFzc1N1YnRpdGxlS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0uYXNzYDtcblxuICAgICAgYXdhaXQgczMuc2VuZChcbiAgICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgS2V5OiBhc3NTdWJ0aXRsZUtleSxcbiAgICAgICAgICBCb2R5OiBhc3NTdWJ0aXRsZUJ1ZmZlcixcbiAgICAgICAgICBDb250ZW50VHlwZTogJ3RleHQvcGxhaW4nLFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIC8vIEV4dHJhY3QgZmlsZW5hbWUgd2l0aG91dCB1c2VyIHByZWZpeCAoZS5nLiwgXCIxMDA0LnNjZW5lLTEuYXNzXCIpXG4gICAgICBjb25zdCBmaWxlbmFtZSA9IGFzc1N1YnRpdGxlS2V5LnJlcGxhY2UoYCR7dXNlcklkfS9gLCAnJyk7XG5cbiAgICAgIC8vIFJldHVybiBpbmxpbmUgY29udGVudCBpbnN0ZWFkIG9mIGEgc2lnbmVkIFVSTFxuICAgICAgYXNzQ29udGVudEFycmF5LnB1c2goeyBbZmlsZW5hbWVdOiBhc3NDb250ZW50IH0pO1xuICAgICAgY3VycmVudFRpbWUgKz0gc2NlbmUuZHVyYXRpb247XG4gICAgfVxuXG4gICAgcmV0dXJuIGFzc0NvbnRlbnRBcnJheTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZ2VuZXJhdGVTdWJ0aXRsZXM6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVNpbXBsZUFTU1N1YnRpdGxlKFxuICBpbmRleDogbnVtYmVyLFxuICBzdGFydFRpbWU6IG51bWJlcixcbiAgZHVyYXRpb246IG51bWJlcixcbiAgdGV4dDogc3RyaW5nLFxuKTogc3RyaW5nIHtcbiAgY29uc3QgYXNzQ29udGVudCA9IGNyZWF0ZUFTU1N0eWxlSGVhZGVyKCk7XG5cbiAgY29uc3Qgc3RhcnRUaW1lRm9ybWF0dGVkID0gZm9ybWF0QVNTVGltZShzdGFydFRpbWUpO1xuICBjb25zdCBlbmRUaW1lRm9ybWF0dGVkID0gZm9ybWF0QVNTVGltZShzdGFydFRpbWUgKyBkdXJhdGlvbik7XG5cbiAgLy8gVXNlIHRoZSBhY3R1YWwgc2NlbmUgdGV4dCBpbnN0ZWFkIG9mIGp1c3QgdGhlIGRlc2NyaXB0aW9uXG4gIGNvbnN0IHN1YnRpdGxlVGV4dCA9IHRleHQgfHwgYFNjZW5lICR7aW5kZXggKyAxfWA7XG5cbiAgcmV0dXJuIChcbiAgICBhc3NDb250ZW50ICtcbiAgICBgRGlhbG9ndWU6IDAsJHtzdGFydFRpbWVGb3JtYXR0ZWR9LCR7ZW5kVGltZUZvcm1hdHRlZH0sRGVmYXVsdCwsMCwwLDAsLCR7c3VidGl0bGVUZXh0fVxcbmBcbiAgKTtcbn1cbiJdfQ==