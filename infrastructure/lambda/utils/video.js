"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateVideoClip = generateVideoClip;
const client_s3_1 = require("@aws-sdk/client-s3");
const axios_1 = require("axios");
const sdk_1 = require("@runwayml/sdk");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
async function generateVideoClip(description, duration, sceneIndex, userId, timestamp, seed, sceneId, imageUrl) {
    try {
        // Initialize Runway SDK
        const runway = new sdk_1.RunwayML({
            apiKey: process.env.RUNWAY_API_KEY,
        });
        console.log(`🎬 Calling Runway SDK for scene ${sceneIndex}...`);
        console.log('📤 Runway SDK request parameters:');
        console.log('- Text-to-image model: gen4_image');
        console.log('- Image-to-video model: gen4_turbo');
        console.log('- Prompt:', description);
        console.log('- Duration:', duration, 'seconds');
        console.log('- Aspect ratio: 9:16 (vertical)');
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
        const videoKey = `${userId}/${timestamp}.scene-${sceneId !== undefined ? sceneId : sceneIndex}.mp4`;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2aWRlby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWFBLDhDQW1KQztBQWhLRCxrREFBZ0U7QUFDaEUsaUNBQTBCO0FBQzFCLHVDQUF5QztBQUV6QyxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBU3JELEtBQUssVUFBVSxpQkFBaUIsQ0FDckMsV0FBbUIsRUFDbkIsUUFBZ0IsRUFDaEIsVUFBa0IsRUFDbEIsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLElBQVksRUFDWixPQUFnQixFQUNoQixRQUFpQjtJQUVqQixJQUFJLENBQUM7UUFDSCx3QkFBd0I7UUFDeEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxjQUFRLENBQUM7WUFDMUIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBZTtTQUNwQyxDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxVQUFVLEtBQUssQ0FBQyxDQUFDO1FBQ2hFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUNqRCxPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFDakQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO1FBQ2xELE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNoRCxPQUFPLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7UUFFL0MsNERBQTREO1FBQzVELElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNkLE1BQU0sSUFBSSxLQUFLLENBQUMsNENBQTRDLENBQUMsQ0FBQztRQUNo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aW1wb3J0IHsgUzNDbGllbnQsIFB1dE9iamVjdENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IGF4aW9zIGZyb20gJ2F4aW9zJztcbmltcG9ydCB7IFJ1bndheU1MIH0gZnJvbSAnQHJ1bndheW1sL3Nkayc7XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjZW5lIHtcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgbmFycmF0aW9uOiBzdHJpbmc7XG4gIGlkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVZpZGVvQ2xpcChcbiAgZGVzY3JpcHRpb246IHN0cmluZyxcbiAgZHVyYXRpb246IG51bWJlcixcbiAgc2NlbmVJbmRleDogbnVtYmVyLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHNlZWQ6IG51bWJlcixcbiAgc2NlbmVJZD86IG51bWJlcixcbiAgaW1hZ2VVcmw/OiBzdHJpbmcsXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICB0cnkge1xuICAgIC8vIEluaXRpYWxpemUgUnVud2F5IFNES1xuICAgIGNvbnN0IHJ1bndheSA9IG5ldyBSdW53YXlNTCh7XG4gICAgICBhcGlLZXk6IHByb2Nlc3MuZW52LlJVTldBWV9BUElfS0VZISxcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKGDwn46sIENhbGxpbmcgUnVud2F5IFNESyBmb3Igc2NlbmUgJHtzY2VuZUluZGV4fS4uLmApO1xuICAgIGNvbnNvbGUubG9nKCfwn5OkIFJ1bndheSBTREsgcmVxdWVzdCBwYXJhbWV0ZXJzOicpO1xuICAgIGNvbnNvbGUubG9nKCctIFRleHQtdG8taW1hZ2UgbW9kZWw6IGdlbjRfaW1hZ2UnKTtcbiAgICBjb25zb2xlLmxvZygnLSBJbWFnZS10by12aWRlbyBtb2RlbDogZ2VuNF90dXJibycpO1xuICAgIGNvbnNvbGUubG9nKCctIFByb21wdDonLCBkZXNjcmlwdGlvbik7XG4gICAgY29uc29sZS5sb2coJy0gRHVyYXRpb246JywgZHVyYXRpb24sICdzZWNvbmRzJyk7XG4gICAgY29uc29sZS5sb2coJy0gQXNwZWN0IHJhdGlvOiA5OjE2ICh2ZXJ0aWNhbCknKTtcblxuICAgIC8vIFVzZSB0aGUgcHJvdmlkZWQgaW1hZ2UgVVJMIG9yIHRocm93IGVycm9yIGlmIG5vdCBwcm92aWRlZFxuICAgIGlmICghaW1hZ2VVcmwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignSW1hZ2UgVVJMIGlzIHJlcXVpcmVkIGZvciB2aWRlbyBnZW5lcmF0aW9uJyk7XG4gICAgfVxuICAgIGNvbnNvbGUubG9nKCfwn46oIFVzaW5nIHByb3ZpZGVkIGltYWdlIFVSTCBmb3IgdmlkZW8gZ2VuZXJhdGlvbjonLCBpbWFnZVVybCk7XG5cbiAgICAvLyBTdGVwIDI6IEdlbmVyYXRlIHZpZGVvIGZyb20gdGhlIGltYWdlIHVzaW5nIGltYWdlLXRvLXZpZGVvIEFQSVxuICAgIGNvbnNvbGUubG9nKCfwn46sIEdlbmVyYXRpbmcgdmlkZW8gZnJvbSBpbWFnZS4uLicpO1xuXG4gICAgLy8gUmV0cnkgbG9naWMgZm9yIHZpZGVvIGdlbmVyYXRpb25cbiAgICBsZXQgdmlkZW9SZXN1bHQ7XG4gICAgbGV0IHJldHJ5Q291bnQgPSAwO1xuICAgIGNvbnN0IG1heFJldHJpZXMgPSA1O1xuXG4gICAgd2hpbGUgKHJldHJ5Q291bnQgPCBtYXhSZXRyaWVzKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBg8J+OrCBBdHRlbXB0ICR7cmV0cnlDb3VudCArIDF9LyR7bWF4UmV0cmllc30gd2l0aCBzZWVkOiAke3NlZWR9YCxcbiAgICAgICAgKTtcblxuICAgICAgICB2aWRlb1Jlc3VsdCA9IGF3YWl0IHJ1bndheS5pbWFnZVRvVmlkZW9cbiAgICAgICAgICAuY3JlYXRlKHtcbiAgICAgICAgICAgIG1vZGVsOiAnZ2VuNF90dXJibycsXG4gICAgICAgICAgICBwcm9tcHRJbWFnZTogaW1hZ2VVcmwsXG4gICAgICAgICAgICByYXRpbzogJzcyMDoxMjgwJywgLy8gVmVydGljYWwgZm9ybWF0ICg5OjE2KVxuICAgICAgICAgICAgZHVyYXRpb246IGR1cmF0aW9uIDw9IDUgPyA1IDogMTAsIC8vIFJ1bndheSBvbmx5IHN1cHBvcnRzIDUgb3IgMTAgc2Vjb25kc1xuICAgICAgICAgICAgcHJvbXB0VGV4dDogYCR7ZGVzY3JpcHRpb259YCxcbiAgICAgICAgICAgIHNlZWQsXG4gICAgICAgICAgfSlcbiAgICAgICAgICAud2FpdEZvclRhc2tPdXRwdXQoKTtcblxuICAgICAgICBjb25zb2xlLmxvZygn8J+ToSBJbWFnZS10by12aWRlbyBnZW5lcmF0aW9uIGNvbXBsZXRlZCcpO1xuICAgICAgICBjb25zb2xlLmxvZygn8J+GlCBWaWRlbyBHZW5lcmF0aW9uIElEOicsIHZpZGVvUmVzdWx0LmlkKTtcbiAgICAgICAgY29uc29sZS5sb2coJ+KchSBWaWRlbyBnZW5lcmF0aW9uIGNvbXBsZXRlZCcpO1xuICAgICAgICBjb25zb2xlLmxvZygn8J+ThCBWaWRlbyByZXN1bHQ6JywgdmlkZW9SZXN1bHQpO1xuXG4gICAgICAgIC8vIElmIHdlIGdldCBoZXJlLCB0aGUgZ2VuZXJhdGlvbiB3YXMgc3VjY2Vzc2Z1bFxuICAgICAgICBicmVhaztcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIHJldHJ5Q291bnQrKztcbiAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICBg4p2MIFZpZGVvIGdlbmVyYXRpb24gYXR0ZW1wdCAke3JldHJ5Q291bnR9IGZhaWxlZDpgLFxuICAgICAgICAgIGVycm9yLFxuICAgICAgICApO1xuXG4gICAgICAgIC8vIENoZWNrIGlmIGl0J3MgdGhlIHNwZWNpZmljIGVycm9yIHdlJ3JlIHNlZWluZ1xuICAgICAgICBpZiAoZXJyb3IgJiYgdHlwZW9mIGVycm9yID09PSAnb2JqZWN0JyAmJiAndGFza0RldGFpbHMnIGluIGVycm9yKSB7XG4gICAgICAgICAgY29uc3QgdGFza0RldGFpbHMgPSAoZXJyb3IgYXMgYW55KS50YXNrRGV0YWlscztcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCdUYXNrIGRldGFpbHM6JywgdGFza0RldGFpbHMpO1xuXG4gICAgICAgICAgaWYgKHRhc2tEZXRhaWxzPy5mYWlsdXJlQ29kZSA9PT0gJ0lOVEVSTkFMLkJBRF9PVVRQVVQuQ09ERTAxJykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICAgIGDwn5SEIFJldHJ5aW5nIGR1ZSB0byBJTlRFUk5BTC5CQURfT1VUUFVULkNPREUwMSBlcnJvciAoYXR0ZW1wdCAke3JldHJ5Q291bnR9LyR7bWF4UmV0cmllc30pYCxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAocmV0cnlDb3VudCA8IG1heFJldHJpZXMpIHtcbiAgICAgICAgICAgICAgLy8gV2FpdCBiZWZvcmUgcmV0cnlpbmcgKGV4cG9uZW50aWFsIGJhY2tvZmYpXG4gICAgICAgICAgICAgIGNvbnN0IHdhaXRUaW1lID0gTWF0aC5taW4oXG4gICAgICAgICAgICAgICAgMTAwMCAqIE1hdGgucG93KDIsIHJldHJ5Q291bnQgLSAxKSxcbiAgICAgICAgICAgICAgICA1MDAwLFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg4o+zIFdhaXRpbmcgJHt3YWl0VGltZX1tcyBiZWZvcmUgcmV0cnkuLi5gKTtcbiAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgd2FpdFRpbWUpKTtcbiAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgd2UndmUgZXhoYXVzdGVkIHJldHJpZXMgb3IgaXQncyBub3QgdGhlIHNwZWNpZmljIGVycm9yLCB0aHJvd1xuICAgICAgICBpZiAocmV0cnlDb3VudCA+PSBtYXhSZXRyaWVzKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgIGDinYwgQWxsICR7bWF4UmV0cmllc30gYXR0ZW1wdHMgZmFpbGVkIGZvciBzY2VuZSAke3NjZW5lSW5kZXh9YCxcbiAgICAgICAgICApO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgIXZpZGVvUmVzdWx0IHx8XG4gICAgICAhdmlkZW9SZXN1bHQub3V0cHV0IHx8XG4gICAgICB2aWRlb1Jlc3VsdC5vdXRwdXQubGVuZ3RoID09PSAwXG4gICAgKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBSdW53YXkgU0RLIGRpZCBub3QgcmV0dXJuIGEgdmlkZW8gVVJMJyk7XG4gICAgICBjb25zb2xlLmxvZygnRnVsbCB2aWRlbyByZXN1bHQ6JywgdmlkZW9SZXN1bHQpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdSdW53YXkgU0RLIGRpZCBub3QgcmV0dXJuIGEgdmlkZW8gVVJMJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdmlkZW9VcmwgPSB2aWRlb1Jlc3VsdC5vdXRwdXRbMF07XG4gICAgY29uc29sZS5sb2coYPCfk6UgRG93bmxvYWRpbmcgdmlkZW8gZnJvbTogJHt2aWRlb1VybH1gKTtcbiAgICBjb25zdCB2aWRlb0J1ZmZlciA9IGF3YWl0IGRvd25sb2FkVmlkZW8odmlkZW9VcmwpO1xuICAgIGNvbnNvbGUubG9nKGDinIUgRG93bmxvYWRlZCB2aWRlbywgc2l6ZTogJHt2aWRlb0J1ZmZlci5sZW5ndGh9IGJ5dGVzYCk7XG5cbiAgICAvLyBTYXZlIHZpZGVvIHRvIHZpZGVvLXBhcnRzIGJ1Y2tldCB3aXRoIHRpbWVzdGFtcCBwcmVmaXhcbiAgICBjb25zdCB2aWRlb0tleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7XG4gICAgICBzY2VuZUlkICE9PSB1bmRlZmluZWQgPyBzY2VuZUlkIDogc2NlbmVJbmRleFxuICAgIH0ubXA0YDtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGDimIHvuI8gVXBsb2FkaW5nIHZpZGVvIHBhcnQgdG8gUzM6ICR7cHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUV9LyR7dmlkZW9LZXl9YCxcbiAgICApO1xuXG4gICAgYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiB2aWRlb0tleSxcbiAgICAgICAgQm9keTogdmlkZW9CdWZmZXIsXG4gICAgICAgIENvbnRlbnRUeXBlOiAndmlkZW8vbXA0JyxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coYOKchSBVcGxvYWRlZCB2aWRlbyBwYXJ0IHRvIFMzOiAke3ZpZGVvS2V5fWApO1xuXG4gICAgcmV0dXJuIHZpZGVvS2V5O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICBg4p2MIEVycm9yIGluIGdlbmVyYXRlVmlkZW9DbGlwIGZvciBzY2VuZSAke3NjZW5lSW5kZXh9OmAsXG4gICAgICBlcnJvcixcbiAgICApO1xuICAgIGlmIChlcnJvciAmJiB0eXBlb2YgZXJyb3IgPT09ICdvYmplY3QnICYmICdtZXNzYWdlJyBpbiBlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgbWVzc2FnZTonLCBlcnJvci5tZXNzYWdlKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIG5hbWU6JywgKGVycm9yIGFzIGFueSkubmFtZSk7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBzdGFjazonLCAoZXJyb3IgYXMgYW55KS5zdGFjayk7XG4gICAgfVxuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRvd25sb2FkVmlkZW8odXJsOiBzdHJpbmcpOiBQcm9taXNlPEJ1ZmZlcj4ge1xuICBjb25zb2xlLmxvZyhg8J+TpSBEb3dubG9hZGluZyB2aWRlbyBmcm9tOiAke3VybH1gKTtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGF4aW9zLmdldCh1cmwsIHsgcmVzcG9uc2VUeXBlOiAnYXJyYXlidWZmZXInIH0pO1xuICAgIGNvbnNvbGUubG9nKGDinIUgRG93bmxvYWRlZCB2aWRlbywgc3RhdHVzOiAke3Jlc3BvbnNlLnN0YXR1c31gKTtcbiAgICByZXR1cm4gQnVmZmVyLmZyb20ocmVzcG9uc2UuZGF0YSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGRvd25sb2FkaW5nIHZpZGVvOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19