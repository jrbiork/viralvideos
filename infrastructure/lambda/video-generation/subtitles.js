"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSubtitles = generateSubtitles;
const client_s3_1 = require("@aws-sdk/client-s3");
const assUtils_1 = require("./util/assUtils");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
async function generateSubtitles(scenes, userId, timestamp, subtitleData) {
    try {
        const subtitleKeys = [];
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
            subtitleKeys.push(assSubtitleKey);
            currentTime += scene.duration;
        }
        return subtitleKeys;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VidGl0bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3VidGl0bGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBWUEsOENBOERDO0FBMUVELGtEQUFnRTtBQUdoRSw4Q0FLeUI7QUFFekIsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUVyRCxLQUFLLFVBQVUsaUJBQWlCLENBQ3JDLE1BQWUsRUFDZixNQUFjLEVBQ2QsU0FBaUIsRUFDakIsWUFBNkI7SUFFN0IsSUFBSSxDQUFDO1FBQ0gsTUFBTSxZQUFZLEdBQWEsRUFBRSxDQUFDO1FBQ2xDLElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztRQUVwQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3ZDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QixJQUFJLFVBQWtCLENBQUM7WUFFdkIsMkRBQTJEO1lBQzNELE1BQU0saUJBQWlCLEdBQUcsWUFBWSxFQUFFLElBQUksQ0FDMUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLEtBQUssQ0FBQyxDQUNoQyxDQUFDO1lBRUYsSUFBSSxpQkFBaUIsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUM1RCxrQ0FBa0M7Z0JBQ2xDLG1GQUFtRjtnQkFDbkYsMEVBQTBFO2dCQUMxRSxVQUFVLEdBQUcsSUFBQSw0Q0FBaUMsRUFDNUMsaUJBQWlCLENBQUMsS0FBSyxFQUN2QixDQUFDLENBQ0YsQ0FBQztZQUNKLENBQUM7aUJBQU0sQ0FBQztnQkFDTiw4QkFBOEI7Z0JBQzlCLGlFQUFpRTtnQkFDakUsVUFBVSxHQUFHLHVCQUF1QixDQUNsQyxDQUFDLEdBQUcsQ0FBQyxFQUNMLENBQUMsRUFBRSw4QkFBOEI7Z0JBQ2pDLEtBQUssQ0FBQyxRQUFRLEVBQ2QsS0FBSyxDQUFDLFNBQVMsQ0FDaEIsQ0FBQztZQUNKLENBQUM7WUFFRCwwQkFBMEI7WUFDMUIsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUUzRCxzREFBc0Q7WUFDdEQsTUFBTSxjQUFjLEdBQUcsR0FBRyxNQUFNLElBQUksU0FBUyxVQUFVLEtBQUssQ0FBQyxFQUFFLE1BQU0sQ0FBQztZQUV0RSxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQ1gsSUFBSSw0QkFBZ0IsQ0FBQztnQkFDbkIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCO2dCQUMzQyxHQUFHLEVBQUUsY0FBYztnQkFDbkIsSUFBSSxFQUFFLGlCQUFpQjtnQkFDdkIsV0FBVyxFQUFFLFlBQVk7YUFDMUIsQ0FBQyxDQUNILENBQUM7WUFFRixZQUFZLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQ2xDLFdBQVcsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDO1FBQ2hDLENBQUM7UUFFRCxPQUFPLFlBQVksQ0FBQztJQUN0QixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsdUJBQXVCLENBQzlCLEtBQWEsRUFDYixTQUFpQixFQUNqQixRQUFnQixFQUNoQixJQUFZO0lBRVosTUFBTSxVQUFVLEdBQUcsSUFBQSwrQkFBb0IsR0FBRSxDQUFDO0lBRTFDLE1BQU0sa0JBQWtCLEdBQUcsSUFBQSx3QkFBYSxFQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3BELE1BQU0sZ0JBQWdCLEdBQUcsSUFBQSx3QkFBYSxFQUFDLFNBQVMsR0FBRyxRQUFRLENBQUMsQ0FBQztJQUU3RCw0REFBNEQ7SUFDNUQsTUFBTSxZQUFZLEdBQUcsSUFBSSxJQUFJLFNBQVMsS0FBSyxHQUFHLENBQUMsRUFBRSxDQUFDO0lBRWxELE9BQU8sQ0FDTCxVQUFVO1FBQ1YsZUFBZSxrQkFBa0IsSUFBSSxnQkFBZ0Isb0JBQW9CLFlBQVksSUFBSSxDQUMxRixDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi9zY3JpcHQnO1xuaW1wb3J0IHsgU3VidGl0bGVEYXRhIH0gZnJvbSAnLi9hdWRpbyc7XG5pbXBvcnQge1xuICBmb3JtYXRBU1NUaW1lLFxuICBjcmVhdGVBU1NTdHlsZUhlYWRlcixcbiAgY3JlYXRlV29yZFRpbWVkS2FyYW9rZUFTU1N1YnRpdGxlLFxuICBTdWJ0aXRsZVdvcmQsXG59IGZyb20gJy4vdXRpbC9hc3NVdGlscyc7XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIH0pO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVTdWJ0aXRsZXMoXG4gIHNjZW5lczogU2NlbmVbXSxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBzdWJ0aXRsZURhdGE/OiBTdWJ0aXRsZURhdGFbXSxcbik6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBzdWJ0aXRsZUtleXM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IGN1cnJlbnRUaW1lID0gMDtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NlbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBzY2VuZSA9IHNjZW5lc1tpXTtcbiAgICAgIGxldCBhc3NDb250ZW50OiBzdHJpbmc7XG5cbiAgICAgIC8vIENoZWNrIGlmIHdlIGhhdmUgd29yZC1sZXZlbCBzdWJ0aXRsZSBkYXRhIGZvciB0aGlzIHNjZW5lXG4gICAgICBjb25zdCBzY2VuZVN1YnRpdGxlRGF0YSA9IHN1YnRpdGxlRGF0YT8uZmluZChcbiAgICAgICAgKGRhdGEpID0+IGRhdGEuc2NlbmVJbmRleCA9PT0gaSxcbiAgICAgICk7XG5cbiAgICAgIGlmIChzY2VuZVN1YnRpdGxlRGF0YSAmJiBzY2VuZVN1YnRpdGxlRGF0YS53b3Jkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIC8vIFVzZSB3b3JkLXRpbWVkIGthcmFva2Ugc3VidGl0bGVcbiAgICAgICAgLy8gRm9yIHNjZW5lLWJ5LXNjZW5lIGNvbWJpbmF0aW9uLCB3ZSBuZWVkIHNjZW5lLXJlbGF0aXZlIHRpbWluZ3MgKHN0YXJ0aW5nIGZyb20gMClcbiAgICAgICAgLy8gaW5zdGVhZCBvZiBhYnNvbHV0ZSB0aW1pbmdzIChyZWxhdGl2ZSB0byB0aGUgc3RhcnQgb2YgdGhlIGVudGlyZSB2aWRlbylcbiAgICAgICAgYXNzQ29udGVudCA9IGNyZWF0ZVdvcmRUaW1lZEthcmFva2VBU1NTdWJ0aXRsZShcbiAgICAgICAgICBzY2VuZVN1YnRpdGxlRGF0YS53b3JkcyxcbiAgICAgICAgICAwLCAvLyBTdGFydCBmcm9tIDAgZm9yIGVhY2ggc2NlbmVcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIHNpbXBsZSBzdWJ0aXRsZVxuICAgICAgICAvLyBGb3Igc2NlbmUtYnktc2NlbmUgY29tYmluYXRpb24sIHdlIG5lZWQgc2NlbmUtcmVsYXRpdmUgdGltaW5nc1xuICAgICAgICBhc3NDb250ZW50ID0gY3JlYXRlU2ltcGxlQVNTU3VidGl0bGUoXG4gICAgICAgICAgaSArIDEsXG4gICAgICAgICAgMCwgLy8gU3RhcnQgZnJvbSAwIGZvciBlYWNoIHNjZW5lXG4gICAgICAgICAgc2NlbmUuZHVyYXRpb24sXG4gICAgICAgICAgc2NlbmUubmFycmF0aW9uLFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICAvLyBVc2UgQVNTIGZvcm1hdCBkaXJlY3RseVxuICAgICAgY29uc3QgYXNzU3VidGl0bGVCdWZmZXIgPSBCdWZmZXIuZnJvbShhc3NDb250ZW50LCAndXRmLTgnKTtcblxuICAgICAgLy8gU2F2ZSBBU1MgdG8gUzMgd2l0aCB0aW1lc3RhbXAgcHJlZml4IHVzaW5nIHNjZW5lLmlkXG4gICAgICBjb25zdCBhc3NTdWJ0aXRsZUtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LmFzc2A7XG5cbiAgICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogYXNzU3VidGl0bGVLZXksXG4gICAgICAgICAgQm9keTogYXNzU3VidGl0bGVCdWZmZXIsXG4gICAgICAgICAgQ29udGVudFR5cGU6ICd0ZXh0L3BsYWluJyxcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgICBzdWJ0aXRsZUtleXMucHVzaChhc3NTdWJ0aXRsZUtleSk7XG4gICAgICBjdXJyZW50VGltZSArPSBzY2VuZS5kdXJhdGlvbjtcbiAgICB9XG5cbiAgICByZXR1cm4gc3VidGl0bGVLZXlzO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBnZW5lcmF0ZVN1YnRpdGxlczonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlU2ltcGxlQVNTU3VidGl0bGUoXG4gIGluZGV4OiBudW1iZXIsXG4gIHN0YXJ0VGltZTogbnVtYmVyLFxuICBkdXJhdGlvbjogbnVtYmVyLFxuICB0ZXh0OiBzdHJpbmcsXG4pOiBzdHJpbmcge1xuICBjb25zdCBhc3NDb250ZW50ID0gY3JlYXRlQVNTU3R5bGVIZWFkZXIoKTtcblxuICBjb25zdCBzdGFydFRpbWVGb3JtYXR0ZWQgPSBmb3JtYXRBU1NUaW1lKHN0YXJ0VGltZSk7XG4gIGNvbnN0IGVuZFRpbWVGb3JtYXR0ZWQgPSBmb3JtYXRBU1NUaW1lKHN0YXJ0VGltZSArIGR1cmF0aW9uKTtcblxuICAvLyBVc2UgdGhlIGFjdHVhbCBzY2VuZSB0ZXh0IGluc3RlYWQgb2YganVzdCB0aGUgZGVzY3JpcHRpb25cbiAgY29uc3Qgc3VidGl0bGVUZXh0ID0gdGV4dCB8fCBgU2NlbmUgJHtpbmRleCArIDF9YDtcblxuICByZXR1cm4gKFxuICAgIGFzc0NvbnRlbnQgK1xuICAgIGBEaWFsb2d1ZTogMCwke3N0YXJ0VGltZUZvcm1hdHRlZH0sJHtlbmRUaW1lRm9ybWF0dGVkfSxEZWZhdWx0LCwwLDAsMCwsJHtzdWJ0aXRsZVRleHR9XFxuYFxuICApO1xufVxuIl19