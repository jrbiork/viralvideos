"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSubtitles = generateSubtitles;
const client_s3_1 = require("@aws-sdk/client-s3");
const assUtils_1 = require("./util/assUtils");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VidGl0bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3VidGl0bGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBaUJBLDhDQW1FQztBQXBGRCxrREFJNEI7QUFJNUIsOENBS3lCO0FBRXpCLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFFckQsS0FBSyxVQUFVLGlCQUFpQixDQUNyQyxNQUFlLEVBQ2YsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLFlBQTZCO0lBRTdCLHdEQUF3RDtJQUN4RCxJQUFJLENBQUM7UUFDSCxNQUFNLGVBQWUsR0FBcUMsRUFBRSxDQUFDO1FBQzdELElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztRQUVwQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3ZDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QixJQUFJLFVBQWtCLENBQUM7WUFFdkIsMkRBQTJEO1lBQzNELE1BQU0saUJBQWlCLEdBQUcsWUFBWSxFQUFFLElBQUksQ0FDMUMsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLEtBQUssQ0FBQyxDQUNoQyxDQUFDO1lBRUYsSUFBSSxpQkFBaUIsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUM1RCxrQ0FBa0M7Z0JBQ2xDLG1GQUFtRjtnQkFDbkYsMEVBQTBFO2dCQUMxRSxVQUFVLEdBQUcsSUFBQSw0Q0FBaUMsRUFDNUMsaUJBQWlCLENBQUMsS0FBSyxFQUN2QixDQUFDLENBQ0YsQ0FBQztZQUNKLENBQUM7aUJBQU0sQ0FBQztnQkFDTiw4QkFBOEI7Z0JBQzlCLGlFQUFpRTtnQkFDakUsVUFBVSxHQUFHLHVCQUF1QixDQUNsQyxDQUFDLEdBQUcsQ0FBQyxFQUNMLENBQUMsRUFBRSw4QkFBOEI7Z0JBQ2pDLEtBQUssQ0FBQyxRQUFRLEVBQ2QsS0FBSyxDQUFDLFNBQVMsQ0FDaEIsQ0FBQztZQUNKLENBQUM7WUFFRCwwQkFBMEI7WUFDMUIsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUUzRCxzREFBc0Q7WUFDdEQsTUFBTSxjQUFjLEdBQUcsR0FBRyxNQUFNLElBQUksU0FBUyxVQUFVLEtBQUssQ0FBQyxFQUFFLE1BQU0sQ0FBQztZQUV0RSxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQ1gsSUFBSSw0QkFBZ0IsQ0FBQztnQkFDbkIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCO2dCQUMzQyxHQUFHLEVBQUUsY0FBYztnQkFDbkIsSUFBSSxFQUFFLGlCQUFpQjtnQkFDdkIsV0FBVyxFQUFFLFlBQVk7YUFDMUIsQ0FBQyxDQUNILENBQUM7WUFFRixrRUFBa0U7WUFDbEUsTUFBTSxRQUFRLEdBQUcsY0FBYyxDQUFDLE9BQU8sQ0FBQyxHQUFHLE1BQU0sR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBRTFELGdEQUFnRDtZQUNoRCxlQUFlLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO1lBQ2pELFdBQVcsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDO1FBQ2hDLENBQUM7UUFFRCxPQUFPLGVBQWUsQ0FBQztJQUN6QixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsK0JBQStCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsdUJBQXVCLENBQzlCLEtBQWEsRUFDYixTQUFpQixFQUNqQixRQUFnQixFQUNoQixJQUFZO0lBRVosTUFBTSxVQUFVLEdBQUcsSUFBQSwrQkFBb0IsR0FBRSxDQUFDO0lBRTFDLE1BQU0sa0JBQWtCLEdBQUcsSUFBQSx3QkFBYSxFQUFDLFNBQVMsQ0FBQyxDQUFDO0lBQ3BELE1BQU0sZ0JBQWdCLEdBQUcsSUFBQSx3QkFBYSxFQUFDLFNBQVMsR0FBRyxRQUFRLENBQUMsQ0FBQztJQUU3RCw0REFBNEQ7SUFDNUQsTUFBTSxZQUFZLEdBQUcsSUFBSSxJQUFJLFNBQVMsS0FBSyxHQUFHLENBQUMsRUFBRSxDQUFDO0lBRWxELE9BQU8sQ0FDTCxVQUFVO1FBQ1YsZUFBZSxrQkFBa0IsSUFBSSxnQkFBZ0Isb0JBQW9CLFlBQVksSUFBSSxDQUMxRixDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIFMzQ2xpZW50LFxuICBQdXRPYmplY3RDb21tYW5kLFxuICBHZXRPYmplY3RDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSAnQGF3cy1zZGsvczMtcmVxdWVzdC1wcmVzaWduZXInO1xuaW1wb3J0IHsgU2NlbmUgfSBmcm9tICcuL3NjcmlwdCc7XG5pbXBvcnQgeyBTdWJ0aXRsZURhdGEgfSBmcm9tICcuL2F1ZGlvJztcbmltcG9ydCB7XG4gIGZvcm1hdEFTU1RpbWUsXG4gIGNyZWF0ZUFTU1N0eWxlSGVhZGVyLFxuICBjcmVhdGVXb3JkVGltZWRLYXJhb2tlQVNTU3VidGl0bGUsXG4gIFN1YnRpdGxlV29yZCxcbn0gZnJvbSAnLi91dGlsL2Fzc1V0aWxzJztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVN1YnRpdGxlcyhcbiAgc2NlbmVzOiBTY2VuZVtdLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHN1YnRpdGxlRGF0YT86IFN1YnRpdGxlRGF0YVtdLFxuKTogUHJvbWlzZTxBcnJheTx7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9Pj4ge1xuICAvLyBGb3JtYXQ6IFt7IFwidGltZXN0YW1wLnNjZW5lLWlkLmFzc1wiOiBcImFzcy1jb250ZW50XCIgfV1cbiAgdHJ5IHtcbiAgICBjb25zdCBhc3NDb250ZW50QXJyYXk6IEFycmF5PHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0+ID0gW107XG4gICAgbGV0IGN1cnJlbnRUaW1lID0gMDtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NlbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBzY2VuZSA9IHNjZW5lc1tpXTtcbiAgICAgIGxldCBhc3NDb250ZW50OiBzdHJpbmc7XG5cbiAgICAgIC8vIENoZWNrIGlmIHdlIGhhdmUgd29yZC1sZXZlbCBzdWJ0aXRsZSBkYXRhIGZvciB0aGlzIHNjZW5lXG4gICAgICBjb25zdCBzY2VuZVN1YnRpdGxlRGF0YSA9IHN1YnRpdGxlRGF0YT8uZmluZChcbiAgICAgICAgKGRhdGEpID0+IGRhdGEuc2NlbmVJbmRleCA9PT0gaSxcbiAgICAgICk7XG5cbiAgICAgIGlmIChzY2VuZVN1YnRpdGxlRGF0YSAmJiBzY2VuZVN1YnRpdGxlRGF0YS53b3Jkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIC8vIFVzZSB3b3JkLXRpbWVkIGthcmFva2Ugc3VidGl0bGVcbiAgICAgICAgLy8gRm9yIHNjZW5lLWJ5LXNjZW5lIGNvbWJpbmF0aW9uLCB3ZSBuZWVkIHNjZW5lLXJlbGF0aXZlIHRpbWluZ3MgKHN0YXJ0aW5nIGZyb20gMClcbiAgICAgICAgLy8gaW5zdGVhZCBvZiBhYnNvbHV0ZSB0aW1pbmdzIChyZWxhdGl2ZSB0byB0aGUgc3RhcnQgb2YgdGhlIGVudGlyZSB2aWRlbylcbiAgICAgICAgYXNzQ29udGVudCA9IGNyZWF0ZVdvcmRUaW1lZEthcmFva2VBU1NTdWJ0aXRsZShcbiAgICAgICAgICBzY2VuZVN1YnRpdGxlRGF0YS53b3JkcyxcbiAgICAgICAgICAwLCAvLyBTdGFydCBmcm9tIDAgZm9yIGVhY2ggc2NlbmVcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIHNpbXBsZSBzdWJ0aXRsZVxuICAgICAgICAvLyBGb3Igc2NlbmUtYnktc2NlbmUgY29tYmluYXRpb24sIHdlIG5lZWQgc2NlbmUtcmVsYXRpdmUgdGltaW5nc1xuICAgICAgICBhc3NDb250ZW50ID0gY3JlYXRlU2ltcGxlQVNTU3VidGl0bGUoXG4gICAgICAgICAgaSArIDEsXG4gICAgICAgICAgMCwgLy8gU3RhcnQgZnJvbSAwIGZvciBlYWNoIHNjZW5lXG4gICAgICAgICAgc2NlbmUuZHVyYXRpb24sXG4gICAgICAgICAgc2NlbmUubmFycmF0aW9uLFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICAvLyBVc2UgQVNTIGZvcm1hdCBkaXJlY3RseVxuICAgICAgY29uc3QgYXNzU3VidGl0bGVCdWZmZXIgPSBCdWZmZXIuZnJvbShhc3NDb250ZW50LCAndXRmLTgnKTtcblxuICAgICAgLy8gU2F2ZSBBU1MgdG8gUzMgd2l0aCB0aW1lc3RhbXAgcHJlZml4IHVzaW5nIHNjZW5lLmlkXG4gICAgICBjb25zdCBhc3NTdWJ0aXRsZUtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LmFzc2A7XG5cbiAgICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogYXNzU3VidGl0bGVLZXksXG4gICAgICAgICAgQm9keTogYXNzU3VidGl0bGVCdWZmZXIsXG4gICAgICAgICAgQ29udGVudFR5cGU6ICd0ZXh0L3BsYWluJyxcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgICAvLyBFeHRyYWN0IGZpbGVuYW1lIHdpdGhvdXQgdXNlciBwcmVmaXggKGUuZy4sIFwiMTAwNC5zY2VuZS0xLmFzc1wiKVxuICAgICAgY29uc3QgZmlsZW5hbWUgPSBhc3NTdWJ0aXRsZUtleS5yZXBsYWNlKGAke3VzZXJJZH0vYCwgJycpO1xuXG4gICAgICAvLyBSZXR1cm4gaW5saW5lIGNvbnRlbnQgaW5zdGVhZCBvZiBhIHNpZ25lZCBVUkxcbiAgICAgIGFzc0NvbnRlbnRBcnJheS5wdXNoKHsgW2ZpbGVuYW1lXTogYXNzQ29udGVudCB9KTtcbiAgICAgIGN1cnJlbnRUaW1lICs9IHNjZW5lLmR1cmF0aW9uO1xuICAgIH1cblxuICAgIHJldHVybiBhc3NDb250ZW50QXJyYXk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlU3VidGl0bGVzOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG5mdW5jdGlvbiBjcmVhdGVTaW1wbGVBU1NTdWJ0aXRsZShcbiAgaW5kZXg6IG51bWJlcixcbiAgc3RhcnRUaW1lOiBudW1iZXIsXG4gIGR1cmF0aW9uOiBudW1iZXIsXG4gIHRleHQ6IHN0cmluZyxcbik6IHN0cmluZyB7XG4gIGNvbnN0IGFzc0NvbnRlbnQgPSBjcmVhdGVBU1NTdHlsZUhlYWRlcigpO1xuXG4gIGNvbnN0IHN0YXJ0VGltZUZvcm1hdHRlZCA9IGZvcm1hdEFTU1RpbWUoc3RhcnRUaW1lKTtcbiAgY29uc3QgZW5kVGltZUZvcm1hdHRlZCA9IGZvcm1hdEFTU1RpbWUoc3RhcnRUaW1lICsgZHVyYXRpb24pO1xuXG4gIC8vIFVzZSB0aGUgYWN0dWFsIHNjZW5lIHRleHQgaW5zdGVhZCBvZiBqdXN0IHRoZSBkZXNjcmlwdGlvblxuICBjb25zdCBzdWJ0aXRsZVRleHQgPSB0ZXh0IHx8IGBTY2VuZSAke2luZGV4ICsgMX1gO1xuXG4gIHJldHVybiAoXG4gICAgYXNzQ29udGVudCArXG4gICAgYERpYWxvZ3VlOiAwLCR7c3RhcnRUaW1lRm9ybWF0dGVkfSwke2VuZFRpbWVGb3JtYXR0ZWR9LERlZmF1bHQsLDAsMCwwLCwke3N1YnRpdGxlVGV4dH1cXG5gXG4gICk7XG59XG4iXX0=