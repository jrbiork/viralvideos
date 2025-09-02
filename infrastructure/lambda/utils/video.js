"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateVideoClip = generateVideoClip;
const client_s3_1 = require("@aws-sdk/client-s3");
const axios_1 = require("axios");
const sdk_1 = require("@runwayml/sdk");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
async function generateVideoClip(description, duration, sceneIndex, userId, timestamp, seed, imageUrl) {
    try {
        // Initialize Runway SDK
        const runway = new sdk_1.RunwayML({
            apiKey: process.env.RUNWAY_API_KEY,
        });
        console.log(`🎬 Calling Runway SDK for scene ${sceneIndex}...`);
        console.log('- Prompt:', description);
        console.log('- Duration:', duration, 'seconds');
        // Use the provided image URL or throw error if not provided
        if (!imageUrl) {
            throw new Error('Image URL is required for video generation');
        }
        console.log('🎨 Using provided image URL for video generation:', imageUrl);
        // Step 2: Generate video from the image using image-to-video API
        console.log('🎬 Generating video from image...');
        // Retry logic for video generation
        let videoResult;
        let retryCount = 0;
        const maxRetries = 5;
        while (retryCount < maxRetries) {
            try {
                console.log(`🎬 Attempt ${retryCount + 1}/${maxRetries} with seed: ${seed}`);
                videoResult = await runway.imageToVideo
                    .create({
                    model: 'gen4_turbo',
                    promptImage: imageUrl,
                    ratio: '720:1280', // Vertical format (9:16)
                    duration: duration <= 5 ? 5 : 10, // Runway only supports 5 or 10 seconds
                    promptText: `${description}`,
                    seed,
                })
                    .waitForTaskOutput();
                console.log('📡 Image-to-video generation completed');
                console.log('🆔 Video Generation ID:', videoResult.id);
                console.log('✅ Video generation completed');
                console.log('📄 Video result:', videoResult);
                // If we get here, the generation was successful
                break;
            }
            catch (error) {
                retryCount++;
                console.error(`❌ Video generation attempt ${retryCount} failed:`, error);
                // Check if it's the specific error we're seeing
                if (error && typeof error === 'object' && 'taskDetails' in error) {
                    const taskDetails = error.taskDetails;
                    console.error('Task details:', taskDetails);
                    if (taskDetails?.failureCode === 'INTERNAL.BAD_OUTPUT.CODE01') {
                        console.log(`🔄 Retrying due to INTERNAL.BAD_OUTPUT.CODE01 error (attempt ${retryCount}/${maxRetries})`);
                        if (retryCount < maxRetries) {
                            // Wait before retrying (exponential backoff)
                            const waitTime = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
                            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                            await new Promise((resolve) => setTimeout(resolve, waitTime));
                            continue;
                        }
                    }
                }
                // If we've exhausted retries or it's not the specific error, throw
                if (retryCount >= maxRetries) {
                    console.error(`❌ All ${maxRetries} attempts failed for scene ${sceneIndex}`);
                    throw error;
                }
            }
        }
        if (!videoResult ||
            !videoResult.output ||
            videoResult.output.length === 0) {
            console.log('❌ Error: Runway SDK did not return a video URL');
            console.log('Full video result:', videoResult);
            throw new Error('Runway SDK did not return a video URL');
        }
        const videoUrl = videoResult.output[0];
        console.log(`📥 Downloading video from: ${videoUrl}`);
        const videoBuffer = await downloadVideo(videoUrl);
        console.log(`✅ Downloaded video, size: ${videoBuffer.length} bytes`);
        // Save video to video-parts bucket with timestamp prefix
        const videoKey = `${userId}/${timestamp}.scene-${sceneIndex}.mp4`;
        console.log(`☁️ Uploading video part to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${videoKey}`);
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: videoKey,
            Body: videoBuffer,
            ContentType: 'video/mp4',
        }));
        console.log(`✅ Uploaded video part to S3: ${videoKey}`);
        return videoKey;
    }
    catch (error) {
        console.error(`❌ Error in generateVideoClip for scene ${sceneIndex}:`, error);
        if (error && typeof error === 'object' && 'message' in error) {
            console.error('Error message:', error.message);
            console.error('Error name:', error.name);
            console.error('Error stack:', error.stack);
        }
        throw error;
    }
}
async function downloadVideo(url) {
    console.log(`📥 Downloading video from: ${url}`);
    try {
        const response = await axios_1.default.get(url, { responseType: 'arraybuffer' });
        console.log(`✅ Downloaded video, status: ${response.status}`);
        return Buffer.from(response.data);
    }
    catch (error) {
        console.error('❌ Error downloading video:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2aWRlby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWFBLDhDQTRJQztBQXpKRCxrREFBZ0U7QUFDaEUsaUNBQTBCO0FBQzFCLHVDQUF5QztBQUV6QyxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBU3JELEtBQUssVUFBVSxpQkFBaUIsQ0FDckMsV0FBbUIsRUFDbkIsUUFBZ0IsRUFDaEIsVUFBa0IsRUFDbEIsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLElBQVksRUFDWixRQUFpQjtJQUVqQixJQUFJLENBQUM7UUFDSCx3QkFBd0I7UUFDeEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxjQUFRLENBQUM7WUFDMUIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBZTtTQUNwQyxDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxVQUFVLEtBQUssQ0FBQyxDQUFDO1FBQ2hFLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUVoRCw0REFBNEQ7UUFDNUQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO1FBQ2hFLENBQUM7UUFDRCxPQUFPLENBQUMsR0FBRyxDQUFDLG1EQUFtRCxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRTNFLGlFQUFpRTtRQUNqRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFFakQsbUNBQW1DO1FBQ25DLElBQUksV0FBVyxDQUFDO1FBQ2hCLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztRQUNu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QUFnQixFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMvQyxPQUFPLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRyxLQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEQsT0FBTyxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUcsS0FBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RELENBQUM7UUFDRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDO0FBRUQsS0FBSyxVQUFVLGFBQWEsQ0FBQyxHQUFXO0lBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDakQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxlQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZFLE9BQU8sQ0FBQyxHQUFHLENBQUMsK0JBQStCLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzlELE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTM0NsaWVudCwgUHV0T2JqZWN0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgYXhpb3MgZnJvbSAnYXhpb3MnO1xuaW1wb3J0IHsgUnVud2F5TUwgfSBmcm9tICdAcnVud2F5bWwvc2RrJztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlVmlkZW9DbGlwKFxuICBkZXNjcmlwdGlvbjogc3RyaW5nLFxuICBkdXJhdGlvbjogNSB8IDEwLFxuICBzY2VuZUluZGV4OiBudW1iZXIsXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgc2VlZDogbnVtYmVyLFxuICBpbWFnZVVybD86IHN0cmluZyxcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIHRyeSB7XG4gICAgLy8gSW5pdGlhbGl6ZSBSdW53YXkgU0RLXG4gICAgY29uc3QgcnVud2F5ID0gbmV3IFJ1bndheU1MKHtcbiAgICAgIGFwaUtleTogcHJvY2Vzcy5lbnYuUlVOV0FZX0FQSV9LRVkhLFxuICAgIH0pO1xuXG4gICAgY29uc29sZS5sb2coYPCfjqwgQ2FsbGluZyBSdW53YXkgU0RLIGZvciBzY2VuZSAke3NjZW5lSW5kZXh9Li4uYCk7XG4gICAgY29uc29sZS5sb2coJy0gUHJvbXB0OicsIGRlc2NyaXB0aW9uKTtcbiAgICBjb25zb2xlLmxvZygnLSBEdXJhdGlvbjonLCBkdXJhdGlvbiwgJ3NlY29uZHMnKTtcblxuICAgIC8vIFVzZSB0aGUgcHJvdmlkZWQgaW1hZ2UgVVJMIG9yIHRocm93IGVycm9yIGlmIG5vdCBwcm92aWRlZFxuICAgIGlmICghaW1hZ2VVcmwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignSW1hZ2UgVVJMIGlzIHJlcXVpcmVkIGZvciB2aWRlbyBnZW5lcmF0aW9uJyk7XG4gICAgfVxuICAgIGNvbnNvbGUubG9nKCfwn46oIFVzaW5nIHByb3ZpZGVkIGltYWdlIFVSTCBmb3IgdmlkZW8gZ2VuZXJhdGlvbjonLCBpbWFnZVVybCk7XG5cbiAgICAvLyBTdGVwIDI6IEdlbmVyYXRlIHZpZGVvIGZyb20gdGhlIGltYWdlIHVzaW5nIGltYWdlLXRvLXZpZGVvIEFQSVxuICAgIGNvbnNvbGUubG9nKCfwn46sIEdlbmVyYXRpbmcgdmlkZW8gZnJvbSBpbWFnZS4uLicpO1xuXG4gICAgLy8gUmV0cnkgbG9naWMgZm9yIHZpZGVvIGdlbmVyYXRpb25cbiAgICBsZXQgdmlkZW9SZXN1bHQ7XG4gICAgbGV0IHJldHJ5Q291bnQgPSAwO1xuICAgIGNvbnN0IG1heFJldHJpZXMgPSA1O1xuXG4gICAgd2hpbGUgKHJldHJ5Q291bnQgPCBtYXhSZXRyaWVzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBg8J+OrCBBdHRlbXB0ICR7cmV0cnlDb3VudCArIDF9LyR7bWF4UmV0cmllc30gd2l0aCBzZWVkOiAke3NlZWR9YCxcbiAgICAgICAgKTtcblxuICAgICAgICB2aWRlb1Jlc3VsdCA9IGF3YWl0IHJ1bndheS5pbWFnZVRvVmlkZW9cbiAgICAgICAgICAuY3JlYXRlKHtcbiAgICAgICAgICAgIG1vZGVsOiAnZ2VuNF90dXJibycsXG4gICAgICAgICAgICBwcm9tcHRJbWFnZTogaW1hZ2VVcmwsXG4gICAgICAgICAgICByYXRpbzogJzcyMDoxMjgwJywgLy8gVmVydGljYWwgZm9ybWF0ICg5OjE2KVxuICAgICAgICAgICAgZHVyYXRpb246IGR1cmF0aW9uIDw9IDUgPyA1IDogMTAsIC8vIFJ1bndheSBvbmx5IHN1cHBvcnRzIDUgb3IgMTAgc2Vjb25kc1xuICAgICAgICAgICAgcHJvbXB0VGV4dDogYCR7ZGVzY3JpcHRpb259YCxcbiAgICAgICAgICAgIHNlZWQsXG4gICAgICAgICAgfSlcbiAgICAgICAgICAud2FpdEZvclRhc2tPdXRwdXQoKTtcblxuICAgICAgICBjb25zb2xlLmxvZygn8J+ToSBJbWFnZS10by12aWRlbyBnZW5lcmF0aW9uIGNvbXBsZXRlZCcpO1xuICAgICAgICBjb25zb2xlLmxvZygn8J+GlCBWaWRlbyBHZW5lcmF0aW9uIElEOicsIHZpZGVvUmVzdWx0LmlkKTtcbiAgICAgICAgY29uc29sZS5sb2coJ+KchSBWaWRlbyBnZW5lcmF0aW9uIGNvbXBsZXRlZCcpO1xuICAgICAgICBjb25zb2xlLmxvZygn8J+ThCBWaWRlbyByZXN1bHQ6JywgdmlkZW9SZXN1bHQpO1xuXG4gICAgICAgIC8vIElmIHdlIGdldCBoZXJlLCB0aGUgZ2VuZXJhdGlvbiB3YXMgc3VjY2Vzc2Z1bFxuICAgICAgICBicmVhaztcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIHJldHJ5Q291bnQrKztcbiAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICBg4p2MIFZpZGVvIGdlbmVyYXRpb24gYXR0ZW1wdCAke3JldHJ5Q291bnR9IGZhaWxlZDpgLFxuICAgICAgICAgIGVycm9yLFxuICAgICAgICApO1xuXG4gICAgICAgIC8vIENoZWNrIGlmIGl0J3MgdGhlIHNwZWNpZmljIGVycm9yIHdlJ3JlIHNlZWluZ1xuICAgICAgICBpZiAoZXJyb3IgJiYgdHlwZW9mIGVycm9yID09PSAnb2JqZWN0JyAmJiAndGFza0RldGFpbHMnIGluIGVycm9yKSB7XG4gICAgICAgICAgY29uc3QgdGFza0RldGFpbHMgPSAoZXJyb3IgYXMgYW55KS50YXNrRGV0YWlscztcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdUYXNrIGRldGFpbHM6JywgdGFza0RldGFpbHMpO1xuXG4gICAgICAgICAgaWYgKHRhc2tEZXRhaWxzPy5mYWlsdXJlQ29kZSA9PT0gJ0lOVEVSTkFMLkJBRF9PVVRQVVQuQ09ERTAxJykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICAgIGDwn5SEIFJldHJ5aW5nIGR1ZSB0byBJTlRFUk5BTC5CQURfT1VUUFVULkNPREUwMSBlcnJvciAoYXR0ZW1wdCAke3JldHJ5Q291bnR9LyR7bWF4UmV0cmllc30pYCxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAocmV0cnlDb3VudCA8IG1heFJldHJpZXMpIHtcbiAgICAgICAgICAgICAgLy8gV2FpdCBiZWZvcmUgcmV0cnlpbmcgKGV4cG9uZW50aWFsIGJhY2tvZmYpXG4gICAgICAgICAgICAgIGNvbnN0IHdhaXRUaW1lID0gTWF0aC5taW4oXG4gICAgICAgICAgICAgICAgMTAwMCAqIE1hdGgucG93KDIsIHJldHJ5Q291bnQgLSAxKSxcbiAgICAgICAgICAgICAgICA1MDAwLFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg4o+zIFdhaXRpbmcgJHt3YWl0VGltZX1tcyBiZWZvcmUgcmV0cnkuLi5gKTtcbiAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgd2FpdFRpbWUpKTtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgd2UndmUgZXhoYXVzdGVkIHJldHJpZXMgb3IgaXQncyBub3QgdGhlIHNwZWNpZmljIGVycm9yLCB0aHJvd1xuICAgICAgICBpZiAocmV0cnlDb3VudCA+PSBtYXhSZXRyaWVzKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgIGDinYwgQWxsICR7bWF4UmV0cmllc30gYXR0ZW1wdHMgZmFpbGVkIGZvciBzY2VuZSAke3NjZW5lSW5kZXh9YCxcbiAgICAgICAgICApO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgIXZpZGVvUmVzdWx0IHx8XG4gICAgICAhdmlkZW9SZXN1bHQub3V0cHV0IHx8XG4gICAgICB2aWRlb1Jlc3VsdC5vdXRwdXQubGVuZ3RoID09PSAwXG4gICAgKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBSdW53YXkgU0RLIGRpZCBub3QgcmV0dXJuIGEgdmlkZW8gVVJMJyk7XG4gICAgICBjb25zb2xlLmxvZygnRnVsbCB2aWRlbyByZXN1bHQ6JywgdmlkZW9SZXN1bHQpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdSdW53YXkgU0RLIGRpZCBub3QgcmV0dXJuIGEgdmlkZW8gVVJMJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdmlkZW9VcmwgPSB2aWRlb1Jlc3VsdC5vdXRwdXRbMF07XG4gICAgY29uc29sZS5sb2coYPCfk6UgRG93bmxvYWRpbmcgdmlkZW8gZnJvbTogJHt2aWRlb1VybH1gKTtcbiAgICBjb25zdCB2aWRlb0J1ZmZlciA9IGF3YWl0IGRvd25sb2FkVmlkZW8odmlkZW9VcmwpO1xuICAgIGNvbnNvbGUubG9nKGDinIUgRG93bmxvYWRlZCB2aWRlbywgc2l6ZTogJHt2aWRlb0J1ZmZlci5sZW5ndGh9IGJ5dGVzYCk7XG5cbiAgICAvLyBTYXZlIHZpZGVvIHRvIHZpZGVvLXBhcnRzIGJ1Y2tldCB3aXRoIHRpbWVzdGFtcCBwcmVmaXhcbiAgICBjb25zdCB2aWRlb0tleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmVJbmRleH0ubXA0YDtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGDimIHvuI8gVXBsb2FkaW5nIHZpZGVvIHBhcnQgdG8gUzM6ICR7cHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUV9LyR7dmlkZW9LZXl9YCxcbiAgICApO1xuXG4gICAgYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiB2aWRlb0tleSxcbiAgICAgICAgQm9keTogdmlkZW9CdWZmZXIsXG4gICAgICAgIENvbnRlbnRUeXBlOiAndmlkZW8vbXA0JyxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coYOKchSBVcGxvYWRlZCB2aWRlbyBwYXJ0IHRvIFMzOiAke3ZpZGVvS2V5fWApO1xuXG4gICAgcmV0dXJuIHZpZGVvS2V5O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICBg4p2MIEVycm9yIGluIGdlbmVyYXRlVmlkZW9DbGlwIGZvciBzY2VuZSAke3NjZW5lSW5kZXh9OmAsXG4gICAgICBlcnJvcixcbiAgICApO1xuICAgIGlmIChlcnJvciAmJiB0eXBlb2YgZXJyb3IgPT09ICdvYmplY3QnICYmICdtZXNzYWdlJyBpbiBlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgbWVzc2FnZTonLCBlcnJvci5tZXNzYWdlKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIG5hbWU6JywgKGVycm9yIGFzIGFueSkubmFtZSk7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBzdGFjazonLCAoZXJyb3IgYXMgYW55KS5zdGFjayk7XG4gICAgfVxuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRvd25sb2FkVmlkZW8odXJsOiBzdHJpbmcpOiBQcm9taXNlPEJ1ZmZlcj4ge1xuICBjb25zb2xlLmxvZyhg8J+TpSBEb3dubG9hZGluZyB2aWRlbyBmcm9tOiAke3VybH1gKTtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGF4aW9zLmdldCh1cmwsIHsgcmVzcG9uc2VUeXBlOiAnYXJyYXlidWZmZXInIH0pO1xuICAgIGNvbnNvbGUubG9nKGDinIUgRG93bmxvYWRlZCB2aWRlbywgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICByZXR1cm4gQnVmZmVyLmZyb20ocmVzcG9uc2UuZGF0YSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGRvd25sb2FkaW5nIHZpZGVvOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19