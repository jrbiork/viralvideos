"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSubtitles = generateSubtitles;
const client_s3_1 = require("@aws-sdk/client-s3");
const assUtils_1 = require("../video-generation/util/assUtils");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3VidGl0bGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3VidGl0bGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBcUJBLDhDQW9FQztBQXpGRCxrREFJNEI7QUFJNUIsZ0VBSTJDO0FBRTNDLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFPckQsS0FBSyxVQUFVLGlCQUFpQixDQUNyQyxNQUFlLEVBQ2YsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLFlBQTZCO0lBRTdCLHdEQUF3RDtJQUN4RCxJQUFJLENBQUM7UUFDSCxNQUFNLGVBQWUsR0FBcUMsRUFBRSxDQUFDO1FBQzdELElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztRQUVwQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3ZDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QixJQUFJLFVBQWtCLENBQUM7WUFFdkIsMkRBQTJEO1lBQzNELDZFQUE2RTtZQUM3RSxNQUFNLGlCQUFpQixHQUFHLFlBQVksRUFBRSxJQUFJLENBQzFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxLQUFLLEtBQUssQ0FBQyxFQUFFLENBQ3ZDLENBQUM7WUFFRixJQUFJLGlCQUFpQixJQUFJLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQzVELGtDQUFrQztnQkFDbEMsbUZBQW1GO2dCQUNuRiwwRUFBMEU7Z0JBQzFFLFVBQVUsR0FBRyxJQUFBLDRDQUFpQyxFQUM1QyxpQkFBaUIsQ0FBQyxLQUFLLEVBQ3ZCLENBQUMsQ0FDRixDQUFDO1lBQ0osQ0FBQztpQkFBTSxDQUFDO2dCQUNOLDhCQUE4QjtnQkFDOUIsaUVBQWlFO2dCQUNqRSxVQUFVLEdBQUcsdUJBQXVCLENBQ2xDLENBQUMsR0FBRyxDQUFDLEVBQ0wsQ0FBQyxFQUFFLDhCQUE4QjtnQkFDakMsS0FBSyxDQUFDLFFBQVEsRUFDZCxLQUFLLENBQUMsU0FBUyxDQUNoQixDQUFDO1lBQ0osQ0FBQztZQUVELDBCQUEwQjtZQUMxQixNQUFNLGlCQUFpQixHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBRTNELHNEQUFzRDtZQUN0RCxNQUFNLGNBQWMsR0FBRyxHQUFHLE1BQU0sSUFBSSxTQUFTLFVBQVUsS0FBSyxDQUFDLEVBQUUsTUFBTSxDQUFDO1lBRXRFLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FDWCxJQUFJLDRCQUFnQixDQUFDO2dCQUNuQixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUI7Z0JBQzNDLEdBQUcsRUFBRSxjQUFjO2dCQUNuQixJQUFJLEVBQUUsaUJBQWlCO2dCQUN2QixXQUFXLEVBQUUsWUFBWTthQUMxQixDQUFDLENBQ0gsQ0FBQztZQUVGLGtFQUFrRTtZQUNsRSxNQUFNLFFBQVEsR0FBRyxjQUFjLENBQUMsT0FBTyxDQUFDLEdBQUcsTUFBTSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7WUFFMUQsZ0RBQWdEO1lBQ2hELGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7WUFDakQsV0FBVyxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUM7UUFDaEMsQ0FBQztRQUVELE9BQU8sZUFBZSxDQUFDO0lBQ3pCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0RCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyx1QkFBdUIsQ0FDOUIsS0FBYSxFQUNiLFNBQWlCLEVBQ2pCLFFBQWdCLEVBQ2hCLElBQVk7SUFFWixNQUFNLFVBQVUsR0FBRyxJQUFBLCtCQUFvQixHQUFFLENBQUM7SUFFMUMsTUFBTSxrQkFBa0IsR0FBRyxJQUFBLHdCQUFhLEVBQUMsU0FBUyxDQUFDLENBQUM7SUFDcEQsTUFBTSxnQkFBZ0IsR0FBRyxJQUFBLHdCQUFhLEVBQUMsU0FBUyxHQUFHLFFBQVEsQ0FBQyxDQUFDO0lBRTdELDREQUE0RDtJQUM1RCxNQUFNLFlBQVksR0FBRyxJQUFJLElBQUksU0FBUyxLQUFLLEdBQUcsQ0FBQyxFQUFFLENBQUM7SUFFbEQsT0FBTyxDQUNMLFVBQVU7UUFDVixlQUFlLGtCQUFrQixJQUFJLGdCQUFnQixvQkFBb0IsWUFBWSxJQUFJLENBQzFGLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgUzNDbGllbnQsXG4gIFB1dE9iamVjdENvbW1hbmQsXG4gIEdldE9iamVjdENvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5cbmltcG9ydCB7IFNjZW5lIH0gZnJvbSAnLi9zY3JpcHQnO1xuaW1wb3J0IHsgU3VidGl0bGVEYXRhIH0gZnJvbSAnLi9hdWRpbyc7XG5pbXBvcnQge1xuICBmb3JtYXRBU1NUaW1lLFxuICBjcmVhdGVBU1NTdHlsZUhlYWRlcixcbiAgY3JlYXRlV29yZFRpbWVkS2FyYW9rZUFTU1N1YnRpdGxlLFxufSBmcm9tICcuLi92aWRlby1nZW5lcmF0aW9uL3V0aWwvYXNzVXRpbHMnO1xuXG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcblxuLy8gVHlwZSBmb3IgQVNTIGNvbnRlbnQgcmVzdWx0XG5leHBvcnQgaW50ZXJmYWNlIEFTU0NvbnRlbnRSZXN1bHQge1xuICBbZmlsZW5hbWU6IHN0cmluZ106IHN0cmluZzsgLy8gZS5nLiwgeyBcIjEwMDQuc2NlbmUtMS5hc3NcIjogXCJbU2NyaXB0IEluZm9dXFxuLi4uXCIgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVTdWJ0aXRsZXMoXG4gIHNjZW5lczogU2NlbmVbXSxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBzdWJ0aXRsZURhdGE/OiBTdWJ0aXRsZURhdGFbXSxcbik6IFByb21pc2U8QVNTQ29udGVudFJlc3VsdFtdPiB7XG4gIC8vIEZvcm1hdDogW3sgXCJ0aW1lc3RhbXAuc2NlbmUtaWQuYXNzXCI6IFwiYXNzLWNvbnRlbnRcIiB9XVxuICB0cnkge1xuICAgIGNvbnN0IGFzc0NvbnRlbnRBcnJheTogQXJyYXk8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT4gPSBbXTtcbiAgICBsZXQgY3VycmVudFRpbWUgPSAwO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzY2VuZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHNjZW5lID0gc2NlbmVzW2ldO1xuICAgICAgbGV0IGFzc0NvbnRlbnQ6IHN0cmluZztcblxuICAgICAgLy8gQ2hlY2sgaWYgd2UgaGF2ZSB3b3JkLWxldmVsIHN1YnRpdGxlIGRhdGEgZm9yIHRoaXMgc2NlbmVcbiAgICAgIC8vIFVzZSBzY2VuZS5pZCBhcyBzY2VuZUluZGV4IHNpbmNlIHRoYXQncyB3aGF0IHdlJ3JlIHBhc3NpbmcgZnJvbSB0aGUgbGFtYmRhXG4gICAgICBjb25zdCBzY2VuZVN1YnRpdGxlRGF0YSA9IHN1YnRpdGxlRGF0YT8uZmluZChcbiAgICAgICAgKGRhdGEpID0+IGRhdGEuc2NlbmVJbmRleCA9PT0gc2NlbmUuaWQsXG4gICAgICApO1xuXG4gICAgICBpZiAoc2NlbmVTdWJ0aXRsZURhdGEgJiYgc2NlbmVTdWJ0aXRsZURhdGEud29yZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAvLyBVc2Ugd29yZC10aW1lZCBrYXJhb2tlIHN1YnRpdGxlXG4gICAgICAgIC8vIEZvciBzY2VuZS1ieS1zY2VuZSBjb21iaW5hdGlvbiwgd2UgbmVlZCBzY2VuZS1yZWxhdGl2ZSB0aW1pbmdzIChzdGFydGluZyBmcm9tIDApXG4gICAgICAgIC8vIGluc3RlYWQgb2YgYWJzb2x1dGUgdGltaW5ncyAocmVsYXRpdmUgdG8gdGhlIHN0YXJ0IG9mIHRoZSBlbnRpcmUgdmlkZW8pXG4gICAgICAgIGFzc0NvbnRlbnQgPSBjcmVhdGVXb3JkVGltZWRLYXJhb2tlQVNTU3VidGl0bGUoXG4gICAgICAgICAgc2NlbmVTdWJ0aXRsZURhdGEud29yZHMsXG4gICAgICAgICAgMCwgLy8gU3RhcnQgZnJvbSAwIGZvciBlYWNoIHNjZW5lXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBGYWxsYmFjayB0byBzaW1wbGUgc3VidGl0bGVcbiAgICAgICAgLy8gRm9yIHNjZW5lLWJ5LXNjZW5lIGNvbWJpbmF0aW9uLCB3ZSBuZWVkIHNjZW5lLXJlbGF0aXZlIHRpbWluZ3NcbiAgICAgICAgYXNzQ29udGVudCA9IGNyZWF0ZVNpbXBsZUFTU1N1YnRpdGxlKFxuICAgICAgICAgIGkgKyAxLFxuICAgICAgICAgIDAsIC8vIFN0YXJ0IGZyb20gMCBmb3IgZWFjaCBzY2VuZVxuICAgICAgICAgIHNjZW5lLmR1cmF0aW9uLFxuICAgICAgICAgIHNjZW5lLm5hcnJhdGlvbixcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgLy8gVXNlIEFTUyBmb3JtYXQgZGlyZWN0bHlcbiAgICAgIGNvbnN0IGFzc1N1YnRpdGxlQnVmZmVyID0gQnVmZmVyLmZyb20oYXNzQ29udGVudCwgJ3V0Zi04Jyk7XG5cbiAgICAgIC8vIFNhdmUgQVNTIHRvIFMzIHdpdGggdGltZXN0YW1wIHByZWZpeCB1c2luZyBzY2VuZS5pZFxuICAgICAgY29uc3QgYXNzU3VidGl0bGVLZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5hc3NgO1xuXG4gICAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICBLZXk6IGFzc1N1YnRpdGxlS2V5LFxuICAgICAgICAgIEJvZHk6IGFzc1N1YnRpdGxlQnVmZmVyLFxuICAgICAgICAgIENvbnRlbnRUeXBlOiAndGV4dC9wbGFpbicsXG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgICAgLy8gRXh0cmFjdCBmaWxlbmFtZSB3aXRob3V0IHVzZXIgcHJlZml4IChlLmcuLCBcIjEwMDQuc2NlbmUtMS5hc3NcIilcbiAgICAgIGNvbnN0IGZpbGVuYW1lID0gYXNzU3VidGl0bGVLZXkucmVwbGFjZShgJHt1c2VySWR9L2AsICcnKTtcblxuICAgICAgLy8gUmV0dXJuIGlubGluZSBjb250ZW50IGluc3RlYWQgb2YgYSBzaWduZWQgVVJMXG4gICAgICBhc3NDb250ZW50QXJyYXkucHVzaCh7IFtmaWxlbmFtZV06IGFzc0NvbnRlbnQgfSk7XG4gICAgICBjdXJyZW50VGltZSArPSBzY2VuZS5kdXJhdGlvbjtcbiAgICB9XG5cbiAgICByZXR1cm4gYXNzQ29udGVudEFycmF5O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBnZW5lcmF0ZVN1YnRpdGxlczonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlU2ltcGxlQVNTU3VidGl0bGUoXG4gIGluZGV4OiBudW1iZXIsXG4gIHN0YXJ0VGltZTogbnVtYmVyLFxuICBkdXJhdGlvbjogbnVtYmVyLFxuICB0ZXh0OiBzdHJpbmcsXG4pOiBzdHJpbmcge1xuICBjb25zdCBhc3NDb250ZW50ID0gY3JlYXRlQVNTU3R5bGVIZWFkZXIoKTtcblxuICBjb25zdCBzdGFydFRpbWVGb3JtYXR0ZWQgPSBmb3JtYXRBU1NUaW1lKHN0YXJ0VGltZSk7XG4gIGNvbnN0IGVuZFRpbWVGb3JtYXR0ZWQgPSBmb3JtYXRBU1NUaW1lKHN0YXJ0VGltZSArIGR1cmF0aW9uKTtcblxuICAvLyBVc2UgdGhlIGFjdHVhbCBzY2VuZSB0ZXh0IGluc3RlYWQgb2YganVzdCB0aGUgZGVzY3JpcHRpb25cbiAgY29uc3Qgc3VidGl0bGVUZXh0ID0gdGV4dCB8fCBgU2NlbmUgJHtpbmRleCArIDF9YDtcblxuICByZXR1cm4gKFxuICAgIGFzc0NvbnRlbnQgK1xuICAgIGBEaWFsb2d1ZTogMCwke3N0YXJ0VGltZUZvcm1hdHRlZH0sJHtlbmRUaW1lRm9ybWF0dGVkfSxEZWZhdWx0LCwwLDAsMCwsJHtzdWJ0aXRsZVRleHR9XFxuYFxuICApO1xufVxuIl19