"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.animateImageToVideo = animateImageToVideo;
const client_s3_1 = require("@aws-sdk/client-s3");
const axios_1 = require("axios");
const sdk_1 = require("@runwayml/sdk");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
async function animateImageToVideo(description, duration, scenePosition, userId, timestamp, seed, imageUrl) {
    try {
        // Initialize Runway SDK
        const runway = new sdk_1.RunwayML({
            apiKey: process.env.RUNWAY_API_KEY,
        });
        console.log(`🎬 Calling Runway SDK for scene ${scenePosition}...`);
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
                const task = await runway.imageToVideo.create({
                    model: 'gen4_turbo',
                    promptImage: imageUrl,
                    ratio: '720:1280', // Vertical format (9:16)
                    duration: duration <= 5 ? 5 : 10, // Runway only supports 5 or 10 seconds
                    promptText: `${description}`,
                    seed,
                });
                videoResult = await task.waitForTaskOutput();
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
                    console.log(`🔄 Retrying due to ${taskDetails?.failureCode} error (attempt ${retryCount}/${maxRetries})`);
                    if (retryCount < maxRetries) {
                        // Wait before retrying (exponential backoff)
                        const waitTime = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
                        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                        await new Promise((resolve) => setTimeout(resolve, waitTime));
                        continue;
                    }
                }
                // If the error clearly indicates insufficient credits on provider side, do not retry further
                const message = error?.message || '';
                if (typeof message === 'string' &&
                    message.includes('You do not have enough credits')) {
                    throw new Error('Provider credits insufficient');
                }
                // If we've exhausted retries or it's not the specific error, throw
                if (retryCount >= maxRetries) {
                    console.error(`❌ All ${maxRetries} attempts failed for scene ${scenePosition}`);
                    throw new Error('Video generation failed');
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
        const videoKey = `${userId}/${timestamp}.scene-${scenePosition}.mp4`;
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
        console.error(`❌ Error in animateImageToVideo for scene ${scenePosition}:`, error);
        if (error && typeof error === 'object' && 'message' in error) {
            console.error('Error message:', error.message);
            console.error('Error name:', error.name);
            console.error('Error stack:', error.stack);
        }
        const message = error?.message || 'Video generation failed';
        throw new Error(message);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2aWRlby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWFBLGtEQWdKQztBQTdKRCxrREFBZ0U7QUFDaEUsaUNBQTBCO0FBQzFCLHVDQUF5QztBQUV6QyxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBU3JELEtBQUssVUFBVSxtQkFBbUIsQ0FDdkMsV0FBbUIsRUFDbkIsUUFBZ0IsRUFDaEIsYUFBcUIsRUFDckIsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLElBQVksRUFDWixRQUFpQjtJQUVqQixJQUFJLENBQUM7UUFDSCx3QkFBd0I7UUFDeEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxjQUFRLENBQUM7WUFDMUIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBZTtTQUNwQyxDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxhQUFhLEtBQUssQ0FBQyxDQUFDO1FBQ25FLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUVoRCw0REFBNEQ7UUFDNUQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO1FBQ2hFLENBQUM7UUFDRCxPQUFPLENBQUMsR0FBRyxDQUFDLG1EQUFtRCxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRTNFLGlFQUFpRTtRQUNqRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFFakQsbUNBQW1DO1FBQ25DLElBQUksV0FBVyxDQUFDO1FBQ2hCLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztRQUNu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Q25ELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTM0NsaWVudCwgUHV0T2JqZWN0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgYXhpb3MgZnJvbSAnYXhpb3MnO1xuaW1wb3J0IHsgUnVud2F5TUwgfSBmcm9tICdAcnVud2F5bWwvc2RrJztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFuaW1hdGVJbWFnZVRvVmlkZW8oXG4gIGRlc2NyaXB0aW9uOiBzdHJpbmcsXG4gIGR1cmF0aW9uOiA1IHwgMTAsXG4gIHNjZW5lUG9zaXRpb246IG51bWJlcixcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBzZWVkOiBudW1iZXIsXG4gIGltYWdlVXJsPzogc3RyaW5nLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgdHJ5IHtcbiAgICAvLyBJbml0aWFsaXplIFJ1bndheSBTREtcbiAgICBjb25zdCBydW53YXkgPSBuZXcgUnVud2F5TUwoe1xuICAgICAgYXBpS2V5OiBwcm9jZXNzLmVudi5SVU5XQVlfQVBJX0tFWSEsXG4gICAgfSk7XG5cbiAgICBjb25zb2xlLmxvZyhg8J+OrCBDYWxsaW5nIFJ1bndheSBTREsgZm9yIHNjZW5lICR7c2NlbmVQb3NpdGlvbn0uLi5gKTtcbiAgICBjb25zb2xlLmxvZygnLSBQcm9tcHQ6JywgZGVzY3JpcHRpb24pO1xuICAgIGNvbnNvbGUubG9nKCctIER1cmF0aW9uOicsIGR1cmF0aW9uLCAnc2Vjb25kcycpO1xuXG4gICAgLy8gVXNlIHRoZSBwcm92aWRlZCBpbWFnZSBVUkwgb3IgdGhyb3cgZXJyb3IgaWYgbm90IHByb3ZpZGVkXG4gICAgaWYgKCFpbWFnZVVybCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbWFnZSBVUkwgaXMgcmVxdWlyZWQgZm9yIHZpZGVvIGdlbmVyYXRpb24nKTtcbiAgICB9XG4gICAgY29uc29sZS5sb2coJ/CfjqggVXNpbmcgcHJvdmlkZWQgaW1hZ2UgVVJMIGZvciB2aWRlbyBnZW5lcmF0aW9uOicsIGltYWdlVXJsKTtcblxuICAgIC8vIFN0ZXAgMjogR2VuZXJhdGUgdmlkZW8gZnJvbSB0aGUgaW1hZ2UgdXNpbmcgaW1hZ2UtdG8tdmlkZW8gQVBJXG4gICAgY29uc29sZS5sb2coJ/CfjqwgR2VuZXJhdGluZyB2aWRlbyBmcm9tIGltYWdlLi4uJyk7XG5cbiAgICAvLyBSZXRyeSBsb2dpYyBmb3IgdmlkZW8gZ2VuZXJhdGlvblxuICAgIGxldCB2aWRlb1Jlc3VsdDtcbiAgICBsZXQgcmV0cnlDb3VudCA9IDA7XG4gICAgY29uc3QgbWF4UmV0cmllcyA9IDU7XG5cbiAgICB3aGlsZSAocmV0cnlDb3VudCA8IG1heFJldHJpZXMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGDwn46sIEF0dGVtcHQgJHtyZXRyeUNvdW50ICsgMX0vJHttYXhSZXRyaWVzfSB3aXRoIHNlZWQ6ICR7c2VlZH1gLFxuICAgICAgICApO1xuXG4gICAgICAgIGNvbnN0IHRhc2sgPSBhd2FpdCBydW53YXkuaW1hZ2VUb1ZpZGVvLmNyZWF0ZSh7XG4gICAgICAgICAgbW9kZWw6ICdnZW40X3R1cmJvJyxcbiAgICAgICAgICBwcm9tcHRJbWFnZTogaW1hZ2VVcmwsXG4gICAgICAgICAgcmF0aW86ICc3MjA6MTI4MCcsIC8vIFZlcnRpY2FsIGZvcm1hdCAoOToxNilcbiAgICAgICAgICBkdXJhdGlvbjogZHVyYXRpb24gPD0gNSA/IDUgOiAxMCwgLy8gUnVud2F5IG9ubHkgc3VwcG9ydHMgNSBvciAxMCBzZWNvbmRzXG4gICAgICAgICAgcHJvbXB0VGV4dDogYCR7ZGVzY3JpcHRpb259YCxcbiAgICAgICAgICBzZWVkLFxuICAgICAgICB9KTtcbiAgICAgICAgdmlkZW9SZXN1bHQgPSBhd2FpdCAodGFzayBhcyBhbnkpLndhaXRGb3JUYXNrT3V0cHV0KCk7XG5cbiAgICAgICAgY29uc29sZS5sb2coJ/Cfk6EgSW1hZ2UtdG8tdmlkZW8gZ2VuZXJhdGlvbiBjb21wbGV0ZWQnKTtcbiAgICAgICAgY29uc29sZS5sb2coJ/CfhpQgVmlkZW8gR2VuZXJhdGlvbiBJRDonLCB2aWRlb1Jlc3VsdC5pZCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfinIUgVmlkZW8gZ2VuZXJhdGlvbiBjb21wbGV0ZWQnKTtcbiAgICAgICAgY29uc29sZS5sb2coJ/Cfk4QgVmlkZW8gcmVzdWx0OicsIHZpZGVvUmVzdWx0KTtcblxuICAgICAgICAvLyBJZiB3ZSBnZXQgaGVyZSwgdGhlIGdlbmVyYXRpb24gd2FzIHN1Y2Nlc3NmdWxcbiAgICAgICAgYnJlYWs7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICByZXRyeUNvdW50Kys7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgYOKdjCBWaWRlbyBnZW5lcmF0aW9uIGF0dGVtcHQgJHtyZXRyeUNvdW50fSBmYWlsZWQ6YCxcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBDaGVjayBpZiBpdCdzIHRoZSBzcGVjaWZpYyBlcnJvciB3ZSdyZSBzZWVpbmdcbiAgICAgICAgaWYgKGVycm9yICYmIHR5cGVvZiBlcnJvciA9PT0gJ29iamVjdCcgJiYgJ3Rhc2tEZXRhaWxzJyBpbiBlcnJvcikge1xuICAgICAgICAgIGNvbnN0IHRhc2tEZXRhaWxzID0gKGVycm9yIGFzIGFueSkudGFza0RldGFpbHM7XG4gICAgICAgICAgY29uc29sZS5lcnJvcignVGFzayBkZXRhaWxzOicsIHRhc2tEZXRhaWxzKTtcblxuICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYPCflIQgUmV0cnlpbmcgZHVlIHRvICR7dGFza0RldGFpbHM/LmZhaWx1cmVDb2RlfSBlcnJvciAoYXR0ZW1wdCAke3JldHJ5Q291bnR9LyR7bWF4UmV0cmllc30pYCxcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChyZXRyeUNvdW50IDwgbWF4UmV0cmllcykge1xuICAgICAgICAgICAgLy8gV2FpdCBiZWZvcmUgcmV0cnlpbmcgKGV4cG9uZW50aWFsIGJhY2tvZmYpXG4gICAgICAgICAgICBjb25zdCB3YWl0VGltZSA9IE1hdGgubWluKDEwMDAgKiBNYXRoLnBvdygyLCByZXRyeUNvdW50IC0gMSksIDUwMDApO1xuICAgICAgICAgICAgY29uc29sZS5sb2coYOKPsyBXYWl0aW5nICR7d2FpdFRpbWV9bXMgYmVmb3JlIHJldHJ5Li4uYCk7XG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCB3YWl0VGltZSkpO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhlIGVycm9yIGNsZWFybHkgaW5kaWNhdGVzIGluc3VmZmljaWVudCBjcmVkaXRzIG9uIHByb3ZpZGVyIHNpZGUsIGRvIG5vdCByZXRyeSBmdXJ0aGVyXG4gICAgICAgIGNvbnN0IG1lc3NhZ2UgPSAoZXJyb3IgYXMgYW55KT8ubWVzc2FnZSB8fCAnJztcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJyAmJlxuICAgICAgICAgIG1lc3NhZ2UuaW5jbHVkZXMoJ1lvdSBkbyBub3QgaGF2ZSBlbm91Z2ggY3JlZGl0cycpXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUHJvdmlkZXIgY3JlZGl0cyBpbnN1ZmZpY2llbnQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHdlJ3ZlIGV4aGF1c3RlZCByZXRyaWVzIG9yIGl0J3Mgbm90IHRoZSBzcGVjaWZpYyBlcnJvciwgdGhyb3dcbiAgICAgICAgaWYgKHJldHJ5Q291bnQgPj0gbWF4UmV0cmllcykge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICBg4p2MIEFsbCAke21heFJldHJpZXN9IGF0dGVtcHRzIGZhaWxlZCBmb3Igc2NlbmUgJHtzY2VuZVBvc2l0aW9ufWAsXG4gICAgICAgICAgKTtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1ZpZGVvIGdlbmVyYXRpb24gZmFpbGVkJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICAhdmlkZW9SZXN1bHQgfHxcbiAgICAgICF2aWRlb1Jlc3VsdC5vdXRwdXQgfHxcbiAgICAgIHZpZGVvUmVzdWx0Lm91dHB1dC5sZW5ndGggPT09IDBcbiAgICApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IFJ1bndheSBTREsgZGlkIG5vdCByZXR1cm4gYSB2aWRlbyBVUkwnKTtcbiAgICAgIGNvbnNvbGUubG9nKCdGdWxsIHZpZGVvIHJlc3VsdDonLCB2aWRlb1Jlc3VsdCk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1J1bndheSBTREsgZGlkIG5vdCByZXR1cm4gYSB2aWRlbyBVUkwnKTtcbiAgICB9XG5cbiAgICBjb25zdCB2aWRlb1VybCA9IHZpZGVvUmVzdWx0Lm91dHB1dFswXTtcbiAgICBjb25zb2xlLmxvZyhg8J+TpSBEb3dubG9hZGluZyB2aWRlbyBmcm9tOiAke3ZpZGVvVXJsfWApO1xuICAgIGNvbnN0IHZpZGVvQnVmZmVyID0gYXdhaXQgZG93bmxvYWRWaWRlbyh2aWRlb1VybCk7XG4gICAgY29uc29sZS5sb2coYOKchSBEb3dubG9hZGVkIHZpZGVvLCBzaXplOiAke3ZpZGVvQnVmZmVyLmxlbmd0aH0gYnl0ZXNgKTtcblxuICAgIC8vIFNhdmUgdmlkZW8gdG8gdmlkZW8tcGFydHMgYnVja2V0IHdpdGggdGltZXN0YW1wIHByZWZpeFxuICAgIGNvbnN0IHZpZGVvS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZVBvc2l0aW9ufS5tcDRgO1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYOKYge+4jyBVcGxvYWRpbmcgdmlkZW8gcGFydCB0byBTMzogJHtwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRX0vJHt2aWRlb0tleX1gLFxuICAgICk7XG5cbiAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IHZpZGVvS2V5LFxuICAgICAgICBCb2R5OiB2aWRlb0J1ZmZlcixcbiAgICAgICAgQ29udGVudFR5cGU6ICd2aWRlby9tcDQnLFxuICAgICAgfSksXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZyhg4pyFIFVwbG9hZGVkIHZpZGVvIHBhcnQgdG8gUzM6ICR7dmlkZW9LZXl9YCk7XG5cbiAgICByZXR1cm4gdmlkZW9LZXk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcbiAgICAgIGDinYwgRXJyb3IgaW4gYW5pbWF0ZUltYWdlVG9WaWRlbyBmb3Igc2NlbmUgJHtzY2VuZVBvc2l0aW9ufTpgLFxuICAgICAgZXJyb3IsXG4gICAgKTtcbiAgICBpZiAoZXJyb3IgJiYgdHlwZW9mIGVycm9yID09PSAnb2JqZWN0JyAmJiAnbWVzc2FnZScgaW4gZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIG1lc3NhZ2U6JywgKGVycm9yIGFzIGFueSkubWVzc2FnZSk7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBuYW1lOicsIChlcnJvciBhcyBhbnkpLm5hbWUpO1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igc3RhY2s6JywgKGVycm9yIGFzIGFueSkuc3RhY2spO1xuICAgIH1cbiAgICBjb25zdCBtZXNzYWdlID0gKGVycm9yIGFzIGFueSk/Lm1lc3NhZ2UgfHwgJ1ZpZGVvIGdlbmVyYXRpb24gZmFpbGVkJztcbiAgICB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZG93bmxvYWRWaWRlbyh1cmw6IHN0cmluZyk6IFByb21pc2U8QnVmZmVyPiB7XG4gIGNvbnNvbGUubG9nKGDwn5OlIERvd25sb2FkaW5nIHZpZGVvIGZyb206ICR7dXJsfWApO1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYXhpb3MuZ2V0KHVybCwgeyByZXNwb25zZVR5cGU6ICdhcnJheWJ1ZmZlcicgfSk7XG4gICAgY29uc29sZS5sb2coYOKchSBEb3dubG9hZGVkIHZpZGVvLCBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIHJldHVybiBCdWZmZXIuZnJvbShyZXNwb25zZS5kYXRhKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZG93bmxvYWRpbmcgdmlkZW86JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=