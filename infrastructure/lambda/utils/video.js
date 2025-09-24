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
                    console.error(`❌ All ${maxRetries} attempts failed for scene ${scenePosition}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW8uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2aWRlby50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWFBLGtEQTRJQztBQXpKRCxrREFBZ0U7QUFDaEUsaUNBQTBCO0FBQzFCLHVDQUF5QztBQUV6QyxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBU3JELEtBQUssVUFBVSxtQkFBbUIsQ0FDdkMsV0FBbUIsRUFDbkIsUUFBZ0IsRUFDaEIsYUFBcUIsRUFDckIsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLElBQVksRUFDWixRQUFpQjtJQUVqQixJQUFJLENBQUM7UUFDSCx3QkFBd0I7UUFDeEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxjQUFRLENBQUM7WUFDMUIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBZTtTQUNwQyxDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxhQUFhLEtBQUssQ0FBQyxDQUFDO1FBQ25FLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUVoRCw0REFBNEQ7UUFDNUQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDO1FBQ2hFLENBQUM7UUFDRCxPQUFPLENBQUMsR0FBRyxDQUFDLG1EQUFtRCxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRTNFLGlFQUFpRTtRQUNqRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFFakQsbUNBQW1DO1FBQ25DLElBQUksV0FBVyxDQUFDO1FBQ2hCLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztRQUNu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QUFnQixFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMvQyxPQUFPLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRyxLQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEQsT0FBTyxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUcsS0FBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RELENBQUM7UUFDRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDO0FBRUQsS0FBSyxVQUFVLGFBQWEsQ0FBQyxHQUFXO0lBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDakQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxlQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZFLE9BQU8sQ0FBQyxHQUFHLENBQUMsK0JBQStCLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzlELE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTM0NsaWVudCwgUHV0T2JqZWN0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgYXhpb3MgZnJvbSAnYXhpb3MnO1xuaW1wb3J0IHsgUnVud2F5TUwgfSBmcm9tICdAcnVud2F5bWwvc2RrJztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFuaW1hdGVJbWFnZVRvVmlkZW8oXG4gIGRlc2NyaXB0aW9uOiBzdHJpbmcsXG4gIGR1cmF0aW9uOiA1IHwgMTAsXG4gIHNjZW5lUG9zaXRpb246IG51bWJlcixcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBzZWVkOiBudW1iZXIsXG4gIGltYWdlVXJsPzogc3RyaW5nLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgdHJ5IHtcbiAgICAvLyBJbml0aWFsaXplIFJ1bndheSBTREtcbiAgICBjb25zdCBydW53YXkgPSBuZXcgUnVud2F5TUwoe1xuICAgICAgYXBpS2V5OiBwcm9jZXNzLmVudi5SVU5XQVlfQVBJX0tFWSEsXG4gICAgfSk7XG5cbiAgICBjb25zb2xlLmxvZyhg8J+OrCBDYWxsaW5nIFJ1bndheSBTREsgZm9yIHNjZW5lICR7c2NlbmVQb3NpdGlvbn0uLi5gKTtcbiAgICBjb25zb2xlLmxvZygnLSBQcm9tcHQ6JywgZGVzY3JpcHRpb24pO1xuICAgIGNvbnNvbGUubG9nKCctIER1cmF0aW9uOicsIGR1cmF0aW9uLCAnc2Vjb25kcycpO1xuXG4gICAgLy8gVXNlIHRoZSBwcm92aWRlZCBpbWFnZSBVUkwgb3IgdGhyb3cgZXJyb3IgaWYgbm90IHByb3ZpZGVkXG4gICAgaWYgKCFpbWFnZVVybCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdJbWFnZSBVUkwgaXMgcmVxdWlyZWQgZm9yIHZpZGVvIGdlbmVyYXRpb24nKTtcbiAgICB9XG4gICAgY29uc29sZS5sb2coJ/CfjqggVXNpbmcgcHJvdmlkZWQgaW1hZ2UgVVJMIGZvciB2aWRlbyBnZW5lcmF0aW9uOicsIGltYWdlVXJsKTtcblxuICAgIC8vIFN0ZXAgMjogR2VuZXJhdGUgdmlkZW8gZnJvbSB0aGUgaW1hZ2UgdXNpbmcgaW1hZ2UtdG8tdmlkZW8gQVBJXG4gICAgY29uc29sZS5sb2coJ/CfjqwgR2VuZXJhdGluZyB2aWRlbyBmcm9tIGltYWdlLi4uJyk7XG5cbiAgICAvLyBSZXRyeSBsb2dpYyBmb3IgdmlkZW8gZ2VuZXJhdGlvblxuICAgIGxldCB2aWRlb1Jlc3VsdDtcbiAgICBsZXQgcmV0cnlDb3VudCA9IDA7XG4gICAgY29uc3QgbWF4UmV0cmllcyA9IDU7XG5cbiAgICB3aGlsZSAocmV0cnlDb3VudCA8IG1heFJldHJpZXMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGDwn46sIEF0dGVtcHQgJHtyZXRyeUNvdW50ICsgMX0vJHttYXhSZXRyaWVzfSB3aXRoIHNlZWQ6ICR7c2VlZH1gLFxuICAgICAgICApO1xuXG4gICAgICAgIHZpZGVvUmVzdWx0ID0gYXdhaXQgcnVud2F5LmltYWdlVG9WaWRlb1xuICAgICAgICAgIC5jcmVhdGUoe1xuICAgICAgICAgICAgbW9kZWw6ICdnZW40X3R1cmJvJyxcbiAgICAgICAgICAgIHByb21wdEltYWdlOiBpbWFnZVVybCxcbiAgICAgICAgICAgIHJhdGlvOiAnNzIwOjEyODAnLCAvLyBWZXJ0aWNhbCBmb3JtYXQgKDk6MTYpXG4gICAgICAgICAgICBkdXJhdGlvbjogZHVyYXRpb24gPD0gNSA/IDUgOiAxMCwgLy8gUnVud2F5IG9ubHkgc3VwcG9ydHMgNSBvciAxMCBzZWNvbmRzXG4gICAgICAgICAgICBwcm9tcHRUZXh0OiBgJHtkZXNjcmlwdGlvbn1gLFxuICAgICAgICAgICAgc2VlZCxcbiAgICAgICAgICB9KVxuICAgICAgICAgIC53YWl0Rm9yVGFza091dHB1dCgpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5OhIEltYWdlLXRvLXZpZGVvIGdlbmVyYXRpb24gY29tcGxldGVkJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfwn4aUIFZpZGVvIEdlbmVyYXRpb24gSUQ6JywgdmlkZW9SZXN1bHQuaWQpO1xuICAgICAgICBjb25zb2xlLmxvZygn4pyFIFZpZGVvIGdlbmVyYXRpb24gY29tcGxldGVkJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5OEIFZpZGVvIHJlc3VsdDonLCB2aWRlb1Jlc3VsdCk7XG5cbiAgICAgICAgLy8gSWYgd2UgZ2V0IGhlcmUsIHRoZSBnZW5lcmF0aW9uIHdhcyBzdWNjZXNzZnVsXG4gICAgICAgIGJyZWFrO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgcmV0cnlDb3VudCsrO1xuICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgIGDinYwgVmlkZW8gZ2VuZXJhdGlvbiBhdHRlbXB0ICR7cmV0cnlDb3VudH0gZmFpbGVkOmAsXG4gICAgICAgICAgZXJyb3IsXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgaXQncyB0aGUgc3BlY2lmaWMgZXJyb3Igd2UncmUgc2VlaW5nXG4gICAgICAgIGlmIChlcnJvciAmJiB0eXBlb2YgZXJyb3IgPT09ICdvYmplY3QnICYmICd0YXNrRGV0YWlscycgaW4gZXJyb3IpIHtcbiAgICAgICAgICBjb25zdCB0YXNrRGV0YWlscyA9IChlcnJvciBhcyBhbnkpLnRhc2tEZXRhaWxzO1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1Rhc2sgZGV0YWlsczonLCB0YXNrRGV0YWlscyk7XG5cbiAgICAgICAgICBpZiAodGFza0RldGFpbHM/LmZhaWx1cmVDb2RlID09PSAnSU5URVJOQUwuQkFEX09VVFBVVC5DT0RFMDEnKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgICAgYPCflIQgUmV0cnlpbmcgZHVlIHRvIElOVEVSTkFMLkJBRF9PVVRQVVQuQ09ERTAxIGVycm9yIChhdHRlbXB0ICR7cmV0cnlDb3VudH0vJHttYXhSZXRyaWVzfSlgLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmIChyZXRyeUNvdW50IDwgbWF4UmV0cmllcykge1xuICAgICAgICAgICAgICAvLyBXYWl0IGJlZm9yZSByZXRyeWluZyAoZXhwb25lbnRpYWwgYmFja29mZilcbiAgICAgICAgICAgICAgY29uc3Qgd2FpdFRpbWUgPSBNYXRoLm1pbihcbiAgICAgICAgICAgICAgICAxMDAwICogTWF0aC5wb3coMiwgcmV0cnlDb3VudCAtIDEpLFxuICAgICAgICAgICAgICAgIDUwMDAsXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDij7MgV2FpdGluZyAke3dhaXRUaW1lfW1zIGJlZm9yZSByZXRyeS4uLmApO1xuICAgICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCB3YWl0VGltZSkpO1xuICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB3ZSd2ZSBleGhhdXN0ZWQgcmV0cmllcyBvciBpdCdzIG5vdCB0aGUgc3BlY2lmaWMgZXJyb3IsIHRocm93XG4gICAgICAgIGlmIChyZXRyeUNvdW50ID49IG1heFJldHJpZXMpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgYOKdjCBBbGwgJHttYXhSZXRyaWVzfSBhdHRlbXB0cyBmYWlsZWQgZm9yIHNjZW5lICR7c2NlbmVQb3NpdGlvbn1gLFxuICAgICAgICAgICk7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICAhdmlkZW9SZXN1bHQgfHxcbiAgICAgICF2aWRlb1Jlc3VsdC5vdXRwdXQgfHxcbiAgICAgIHZpZGVvUmVzdWx0Lm91dHB1dC5sZW5ndGggPT09IDBcbiAgICApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IFJ1bndheSBTREsgZGlkIG5vdCByZXR1cm4gYSB2aWRlbyBVUkwnKTtcbiAgICAgIGNvbnNvbGUubG9nKCdGdWxsIHZpZGVvIHJlc3VsdDonLCB2aWRlb1Jlc3VsdCk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1J1bndheSBTREsgZGlkIG5vdCByZXR1cm4gYSB2aWRlbyBVUkwnKTtcbiAgICB9XG5cbiAgICBjb25zdCB2aWRlb1VybCA9IHZpZGVvUmVzdWx0Lm91dHB1dFswXTtcbiAgICBjb25zb2xlLmxvZyhg8J+TpSBEb3dubG9hZGluZyB2aWRlbyBmcm9tOiAke3ZpZGVvVXJsfWApO1xuICAgIGNvbnN0IHZpZGVvQnVmZmVyID0gYXdhaXQgZG93bmxvYWRWaWRlbyh2aWRlb1VybCk7XG4gICAgY29uc29sZS5sb2coYOKchSBEb3dubG9hZGVkIHZpZGVvLCBzaXplOiAke3ZpZGVvQnVmZmVyLmxlbmd0aH0gYnl0ZXNgKTtcblxuICAgIC8vIFNhdmUgdmlkZW8gdG8gdmlkZW8tcGFydHMgYnVja2V0IHdpdGggdGltZXN0YW1wIHByZWZpeFxuICAgIGNvbnN0IHZpZGVvS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZVBvc2l0aW9ufS5tcDRgO1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYOKYge+4jyBVcGxvYWRpbmcgdmlkZW8gcGFydCB0byBTMzogJHtwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRX0vJHt2aWRlb0tleX1gLFxuICAgICk7XG5cbiAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IHZpZGVvS2V5LFxuICAgICAgICBCb2R5OiB2aWRlb0J1ZmZlcixcbiAgICAgICAgQ29udGVudFR5cGU6ICd2aWRlby9tcDQnLFxuICAgICAgfSksXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZyhg4pyFIFVwbG9hZGVkIHZpZGVvIHBhcnQgdG8gUzM6ICR7dmlkZW9LZXl9YCk7XG5cbiAgICByZXR1cm4gdmlkZW9LZXk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcbiAgICAgIGDinYwgRXJyb3IgaW4gYW5pbWF0ZUltYWdlVG9WaWRlbyBmb3Igc2NlbmUgJHtzY2VuZVBvc2l0aW9ufTpgLFxuICAgICAgZXJyb3IsXG4gICAgKTtcbiAgICBpZiAoZXJyb3IgJiYgdHlwZW9mIGVycm9yID09PSAnb2JqZWN0JyAmJiAnbWVzc2FnZScgaW4gZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIG1lc3NhZ2U6JywgZXJyb3IubWVzc2FnZSk7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBuYW1lOicsIChlcnJvciBhcyBhbnkpLm5hbWUpO1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igc3RhY2s6JywgKGVycm9yIGFzIGFueSkuc3RhY2spO1xuICAgIH1cbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBkb3dubG9hZFZpZGVvKHVybDogc3RyaW5nKTogUHJvbWlzZTxCdWZmZXI+IHtcbiAgY29uc29sZS5sb2coYPCfk6UgRG93bmxvYWRpbmcgdmlkZW8gZnJvbTogJHt1cmx9YCk7XG4gIHRyeSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBheGlvcy5nZXQodXJsLCB7IHJlc3BvbnNlVHlwZTogJ2FycmF5YnVmZmVyJyB9KTtcbiAgICBjb25zb2xlLmxvZyhg4pyFIERvd25sb2FkZWQgdmlkZW8sIHN0YXR1czogJHtyZXNwb25zZS5zdGF0dXN9YCk7XG4gICAgcmV0dXJuIEJ1ZmZlci5mcm9tKHJlc3BvbnNlLmRhdGEpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBkb3dubG9hZGluZyB2aWRlbzonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==