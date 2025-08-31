"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImage = generateImage;
const client_s3_1 = require("@aws-sdk/client-s3");
const axios_1 = require("axios");
const sdk_1 = require("@runwayml/sdk");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
async function generateImage(description, sceneIndex, userId, timestamp, seed, sceneId) {
    try {
        // Initialize Runway SDK
        const runway = new sdk_1.RunwayML({
            apiKey: process.env.RUNWAY_API_KEY,
        });
        console.log(`🎨 Calling Runway SDK for image generation in scene ${sceneIndex}...`);
        console.log('📤 Runway SDK request parameters:');
        console.log('- Text-to-image model: gen4_image');
        console.log('- Prompt:', description);
        console.log('- Aspect ratio: 9:16 (vertical)');
        // Generate an image from text using text-to-image API
        console.log('🎨 Generating image from text...');
        // Retry logic for image generation
        let imageResult;
        let imageRetryCount = 0;
        const maxImageRetries = 5;
        while (imageRetryCount < maxImageRetries) {
            try {
                console.log(`🎨 Image generation attempt ${imageRetryCount + 1}/${maxImageRetries} with seed: ${seed}`);
                imageResult = await runway.textToImage
                    .create({
                    model: 'gen4_image',
                    promptText: `${description} - realistic image with good lighting, no text, no logos, clean visual content only`,
                    ratio: '720:1280', // Vertical format (9:16)
                    seed: seed,
                })
                    .waitForTaskOutput();
                console.log('📡 Text-to-image generation completed');
                console.log('🆔 Image Generation ID:', imageResult.id);
                console.log('✅ Image generation completed');
                console.log('📄 Image result:', imageResult);
                // If we get here, the generation was successful
                break;
            }
            catch (error) {
                imageRetryCount++;
                console.error(`❌ Image generation attempt ${imageRetryCount} failed:`, error);
                // Check if it's the specific error we're seeing
                if (error && typeof error === 'object' && 'taskDetails' in error) {
                    const taskDetails = error.taskDetails;
                    console.error('Task details:', taskDetails);
                    if (taskDetails?.failureCode === 'INTERNAL.BAD_OUTPUT.CODE01') {
                        console.log(`🔄 Retrying image generation due to INTERNAL.BAD_OUTPUT.CODE01 error (attempt ${imageRetryCount}/${maxImageRetries})`);
                        if (imageRetryCount < maxImageRetries) {
                            // Wait before retrying (exponential backoff)
                            const waitTime = Math.min(1000 * Math.pow(2, imageRetryCount - 1), 5000);
                            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                            await new Promise((resolve) => setTimeout(resolve, waitTime));
                            continue;
                        }
                    }
                }
                // If we've exhausted retries or it's not the specific error, throw
                if (imageRetryCount >= maxImageRetries) {
                    console.error(`❌ All ${maxImageRetries} image generation attempts failed for scene ${sceneIndex}`);
                    throw error;
                }
            }
        }
        if (!imageResult ||
            !imageResult.output ||
            imageResult.output.length === 0) {
            console.log('❌ Error: Runway SDK did not return an image URL');
            console.log('Full image result:', imageResult);
            throw new Error('Runway SDK did not return an image URL');
        }
        // Access the output property which should contain the images
        const imageUrl = imageResult.output[0];
        console.log('imageResult.output:', imageResult.output);
        console.log('🖼️ Generated image URL:', imageUrl);
        // Save image to S3 for debugging purposes
        console.log('💾 Saving image to S3 for debugging...');
        try {
            const imageBuffer = await downloadImage(imageUrl);
            const imageKey = `${userId}/${timestamp}.scene-${sceneId !== undefined ? sceneId : sceneIndex}.jpg`;
            console.log(`☁️ Uploading image to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${imageKey}`);
            await s3.send(new client_s3_1.PutObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: imageKey,
                Body: imageBuffer,
                ContentType: 'image/jpeg',
            }));
            console.log(`✅ Uploaded image to S3: ${imageKey}`);
        }
        catch (error) {
            console.error('❌ Error saving image to S3:', error);
            // Don't throw here - we want to continue with video generation even if image saving fails
        }
        return imageUrl;
    }
    catch (error) {
        console.error(`❌ Error in generateImage for scene ${sceneIndex}:`, error);
        if (error && typeof error === 'object' && 'message' in error) {
            console.error('Error message:', error.message);
            console.error('Error name:', error.name);
            console.error('Error stack:', error.stack);
        }
        throw error;
    }
}
async function downloadImage(url) {
    console.log(`📥 Downloading image from: ${url}`);
    try {
        const response = await axios_1.default.get(url, { responseType: 'arraybuffer' });
        console.log(`✅ Downloaded image, status: ${response.status}`);
        return Buffer.from(response.data);
    }
    catch (error) {
        console.error('❌ Error downloading image:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbWFnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWFBLHNDQStJQztBQTVKRCxrREFBZ0U7QUFDaEUsaUNBQTBCO0FBQzFCLHVDQUF5QztBQUV6QyxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBU3JELEtBQUssVUFBVSxhQUFhLENBQ2pDLFdBQW1CLEVBQ25CLFVBQWtCLEVBQ2xCLE1BQWMsRUFDZCxTQUFpQixFQUNqQixJQUFZLEVBQ1osT0FBZ0I7SUFFaEIsSUFBSSxDQUFDO1FBQ0gsd0JBQXdCO1FBQ3hCLE1BQU0sTUFBTSxHQUFHLElBQUksY0FBUSxDQUFDO1lBQzFCLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWU7U0FDcEMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxDQUFDLEdBQUcsQ0FDVCx1REFBdUQsVUFBVSxLQUFLLENBQ3ZFLENBQUM7UUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7UUFDakQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO1FBQ2pELE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQztRQUUvQyxzREFBc0Q7UUFDdEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBRWhELG1DQUFtQztRQUNuQyxJQUFJLFdBQVcsQ0FBQztRQUNoQixJQUFJLGVBQWUsR0FBRyxDQUFDLENBQUM7UUFDeEIsTUFBTSxlQUFlLEdBQUcsQ0FBQyxDQUFDO1FBRTFCLE9BQU8sZUFBZSxHQUFHLGVBQWUsRUFBRSxDQUFDO1lBQ3pDLElBQUksQ0FBQztnQkFDSCxPQUFPLENBQUMs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QVMsSUFBSSxLQUFLLEVBQUUsQ0FBQztZQUM3RCxPQUFPLENBQUMsS0FBSyxDQUFDLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUMvQyxPQUFPLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRyxLQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEQsT0FBTyxDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUcsS0FBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RELENBQUM7UUFDRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDO0FBRUQsS0FBSyxVQUFVLGFBQWEsQ0FBQyxHQUFXO0lBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsOEJBQThCLEdBQUcsRUFBRSxDQUFDLENBQUM7SUFDakQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxlQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZFLE9BQU8sQ0FBQyxHQUFHLENBQUMsK0JBQStCLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzlELE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTM0NsaWVudCwgUHV0T2JqZWN0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgYXhpb3MgZnJvbSAnYXhpb3MnO1xuaW1wb3J0IHsgUnVud2F5TUwgfSBmcm9tICdAcnVud2F5bWwvc2RrJztcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlSW1hZ2UoXG4gIGRlc2NyaXB0aW9uOiBzdHJpbmcsXG4gIHNjZW5lSW5kZXg6IG51bWJlcixcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBzZWVkOiBudW1iZXIsXG4gIHNjZW5lSWQ/OiBudW1iZXIsXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICB0cnkge1xuICAgIC8vIEluaXRpYWxpemUgUnVud2F5IFNES1xuICAgIGNvbnN0IHJ1bndheSA9IG5ldyBSdW53YXlNTCh7XG4gICAgICBhcGlLZXk6IHByb2Nlc3MuZW52LlJVTldBWV9BUElfS0VZISxcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYPCfjqggQ2FsbGluZyBSdW53YXkgU0RLIGZvciBpbWFnZSBnZW5lcmF0aW9uIGluIHNjZW5lICR7c2NlbmVJbmRleH0uLi5gLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coJ/Cfk6QgUnVud2F5IFNESyByZXF1ZXN0IHBhcmFtZXRlcnM6Jyk7XG4gICAgY29uc29sZS5sb2coJy0gVGV4dC10by1pbWFnZSBtb2RlbDogZ2VuNF9pbWFnZScpO1xuICAgIGNvbnNvbGUubG9nKCctIFByb21wdDonLCBkZXNjcmlwdGlvbik7XG4gICAgY29uc29sZS5sb2coJy0gQXNwZWN0IHJhdGlvOiA5OjE2ICh2ZXJ0aWNhbCknKTtcblxuICAgIC8vIEdlbmVyYXRlIGFuIGltYWdlIGZyb20gdGV4dCB1c2luZyB0ZXh0LXRvLWltYWdlIEFQSVxuICAgIGNvbnNvbGUubG9nKCfwn46oIEdlbmVyYXRpbmcgaW1hZ2UgZnJvbSB0ZXh0Li4uJyk7XG5cbiAgICAvLyBSZXRyeSBsb2dpYyBmb3IgaW1hZ2UgZ2VuZXJhdGlvblxuICAgIGxldCBpbWFnZVJlc3VsdDtcbiAgICBsZXQgaW1hZ2VSZXRyeUNvdW50ID0gMDtcbiAgICBjb25zdCBtYXhJbWFnZVJldHJpZXMgPSA1O1xuXG4gICAgd2hpbGUgKGltYWdlUmV0cnlDb3VudCA8IG1heEltYWdlUmV0cmllcykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYPCfjqggSW1hZ2UgZ2VuZXJhdGlvbiBhdHRlbXB0ICR7XG4gICAgICAgICAgICBpbWFnZVJldHJ5Q291bnQgKyAxXG4gICAgICAgICAgfS8ke21heEltYWdlUmV0cmllc30gd2l0aCBzZWVkOiAke3NlZWR9YCxcbiAgICAgICAgKTtcblxuICAgICAgICBpbWFnZVJlc3VsdCA9IGF3YWl0IHJ1bndheS50ZXh0VG9JbWFnZVxuICAgICAgICAgIC5jcmVhdGUoe1xuICAgICAgICAgICAgbW9kZWw6ICdnZW40X2ltYWdlJyxcbiAgICAgICAgICAgIHByb21wdFRleHQ6IGAke2Rlc2NyaXB0aW9ufSAtIHJlYWxpc3RpYyBpbWFnZSB3aXRoIGdvb2QgbGlnaHRpbmcsIG5vIHRleHQsIG5vIGxvZ29zLCBjbGVhbiB2aXN1YWwgY29udGVudCBvbmx5YCxcbiAgICAgICAgICAgIHJhdGlvOiAnNzIwOjEyODAnLCAvLyBWZXJ0aWNhbCBmb3JtYXQgKDk6MTYpXG4gICAgICAgICAgICBzZWVkOiBzZWVkLFxuICAgICAgICAgIH0pXG4gICAgICAgICAgLndhaXRGb3JUYXNrT3V0cHV0KCk7XG5cbiAgICAgICAgY29uc29sZS5sb2coJ/Cfk6EgVGV4dC10by1pbWFnZSBnZW5lcmF0aW9uIGNvbXBsZXRlZCcpO1xuICAgICAgICBjb25zb2xlLmxvZygn8J+GlCBJbWFnZSBHZW5lcmF0aW9uIElEOicsIGltYWdlUmVzdWx0LmlkKTtcbiAgICAgICAgY29uc29sZS5sb2coJ+KchSBJbWFnZSBnZW5lcmF0aW9uIGNvbXBsZXRlZCcpO1xuICAgICAgICBjb25zb2xlLmxvZygn8J+ThCBJbWFnZSByZXN1bHQ6JywgaW1hZ2VSZXN1bHQpO1xuXG4gICAgICAgIC8vIElmIHdlIGdldCBoZXJlLCB0aGUgZ2VuZXJhdGlvbiB3YXMgc3VjY2Vzc2Z1bFxuICAgICAgICBicmVhaztcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGltYWdlUmV0cnlDb3VudCsrO1xuICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgIGDinYwgSW1hZ2UgZ2VuZXJhdGlvbiBhdHRlbXB0ICR7aW1hZ2VSZXRyeUNvdW50fSBmYWlsZWQ6YCxcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBDaGVjayBpZiBpdCdzIHRoZSBzcGVjaWZpYyBlcnJvciB3ZSdyZSBzZWVpbmdcbiAgICAgICAgaWYgKGVycm9yICYmIHR5cGVvZiBlcnJvciA9PT0gJ29iamVjdCcgJiYgJ3Rhc2tEZXRhaWxzJyBpbiBlcnJvcikge1xuICAgICAgICAgIGNvbnN0IHRhc2tEZXRhaWxzID0gKGVycm9yIGFzIGFueSkudGFza0RldGFpbHM7XG4gICAgICAgICAgY29uc29sZS5lcnJvcignVGFzayBkZXRhaWxzOicsIHRhc2tEZXRhaWxzKTtcblxuICAgICAgICAgIGlmICh0YXNrRGV0YWlscz8uZmFpbHVyZUNvZGUgPT09ICdJTlRFUk5BTC5CQURfT1VUUFVULkNPREUwMScpIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgICBg8J+UhCBSZXRyeWluZyBpbWFnZSBnZW5lcmF0aW9uIGR1ZSB0byBJTlRFUk5BTC5CQURfT1VUUFVULkNPREUwMSBlcnJvciAoYXR0ZW1wdCAke2ltYWdlUmV0cnlDb3VudH0vJHttYXhJbWFnZVJldHJpZXN9KWAsXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgaWYgKGltYWdlUmV0cnlDb3VudCA8IG1heEltYWdlUmV0cmllcykge1xuICAgICAgICAgICAgICAvLyBXYWl0IGJlZm9yZSByZXRyeWluZyAoZXhwb25lbnRpYWwgYmFja29mZilcbiAgICAgICAgICAgICAgY29uc3Qgd2FpdFRpbWUgPSBNYXRoLm1pbihcbiAgICAgICAgICAgICAgICAxMDAwICogTWF0aC5wb3coMiwgaW1hZ2VSZXRyeUNvdW50IC0gMSksXG4gICAgICAgICAgICAgICAgNTAwMCxcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coYOKPsyBXYWl0aW5nICR7d2FpdFRpbWV9bXMgYmVmb3JlIHJldHJ5Li4uYCk7XG4gICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIHdhaXRUaW1lKSk7XG4gICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHdlJ3ZlIGV4aGF1c3RlZCByZXRyaWVzIG9yIGl0J3Mgbm90IHRoZSBzcGVjaWZpYyBlcnJvciwgdGhyb3dcbiAgICAgICAgaWYgKGltYWdlUmV0cnlDb3VudCA+PSBtYXhJbWFnZVJldHJpZXMpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgYOKdjCBBbGwgJHttYXhJbWFnZVJldHJpZXN9IGltYWdlIGdlbmVyYXRpb24gYXR0ZW1wdHMgZmFpbGVkIGZvciBzY2VuZSAke3NjZW5lSW5kZXh9YCxcbiAgICAgICAgICApO1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgIWltYWdlUmVzdWx0IHx8XG4gICAgICAhaW1hZ2VSZXN1bHQub3V0cHV0IHx8XG4gICAgICBpbWFnZVJlc3VsdC5vdXRwdXQubGVuZ3RoID09PSAwXG4gICAgKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBSdW53YXkgU0RLIGRpZCBub3QgcmV0dXJuIGFuIGltYWdlIFVSTCcpO1xuICAgICAgY29uc29sZS5sb2coJ0Z1bGwgaW1hZ2UgcmVzdWx0OicsIGltYWdlUmVzdWx0KTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignUnVud2F5IFNESyBkaWQgbm90IHJldHVybiBhbiBpbWFnZSBVUkwnKTtcbiAgICB9XG5cbiAgICAvLyBBY2Nlc3MgdGhlIG91dHB1dCBwcm9wZXJ0eSB3aGljaCBzaG91bGQgY29udGFpbiB0aGUgaW1hZ2VzXG4gICAgY29uc3QgaW1hZ2VVcmwgPSBpbWFnZVJlc3VsdC5vdXRwdXRbMF07XG4gICAgY29uc29sZS5sb2coJ2ltYWdlUmVzdWx0Lm91dHB1dDonLCBpbWFnZVJlc3VsdC5vdXRwdXQpO1xuICAgIGNvbnNvbGUubG9nKCfwn5a877iPIEdlbmVyYXRlZCBpbWFnZSBVUkw6JywgaW1hZ2VVcmwpO1xuXG4gICAgLy8gU2F2ZSBpbWFnZSB0byBTMyBmb3IgZGVidWdnaW5nIHB1cnBvc2VzXG4gICAgY29uc29sZS5sb2coJ/Cfkr4gU2F2aW5nIGltYWdlIHRvIFMzIGZvciBkZWJ1Z2dpbmcuLi4nKTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgaW1hZ2VCdWZmZXIgPSBhd2FpdCBkb3dubG9hZEltYWdlKGltYWdlVXJsKTtcbiAgICAgIGNvbnN0IGltYWdlS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtcbiAgICAgICAgc2NlbmVJZCAhPT0gdW5kZWZpbmVkID8gc2NlbmVJZCA6IHNjZW5lSW5kZXhcbiAgICAgIH0uanBnYDtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBg4piB77iPIFVwbG9hZGluZyBpbWFnZSB0byBTMzogJHtwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRX0vJHtpbWFnZUtleX1gLFxuICAgICAgKTtcblxuICAgICAgYXdhaXQgczMuc2VuZChcbiAgICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgS2V5OiBpbWFnZUtleSxcbiAgICAgICAgICBCb2R5OiBpbWFnZUJ1ZmZlcixcbiAgICAgICAgICBDb250ZW50VHlwZTogJ2ltYWdlL2pwZWcnLFxuICAgICAgICB9KSxcbiAgICAgICk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIFVwbG9hZGVkIGltYWdlIHRvIFMzOiAke2ltYWdlS2V5fWApO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3Igc2F2aW5nIGltYWdlIHRvIFMzOicsIGVycm9yKTtcbiAgICAgIC8vIERvbid0IHRocm93IGhlcmUgLSB3ZSB3YW50IHRvIGNvbnRpbnVlIHdpdGggdmlkZW8gZ2VuZXJhdGlvbiBldmVuIGlmIGltYWdlIHNhdmluZyBmYWlsc1xuICAgIH1cblxuICAgIHJldHVybiBpbWFnZVVybDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGDinYwgRXJyb3IgaW4gZ2VuZXJhdGVJbWFnZSBmb3Igc2NlbmUgJHtzY2VuZUluZGV4fTpgLCBlcnJvcik7XG4gICAgaWYgKGVycm9yICYmIHR5cGVvZiBlcnJvciA9PT0gJ29iamVjdCcgJiYgJ21lc3NhZ2UnIGluIGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBtZXNzYWdlOicsIGVycm9yLm1lc3NhZ2UpO1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgbmFtZTonLCAoZXJyb3IgYXMgYW55KS5uYW1lKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHN0YWNrOicsIChlcnJvciBhcyBhbnkpLnN0YWNrKTtcbiAgICB9XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZG93bmxvYWRJbWFnZSh1cmw6IHN0cmluZyk6IFByb21pc2U8QnVmZmVyPiB7XG4gIGNvbnNvbGUubG9nKGDwn5OlIERvd25sb2FkaW5nIGltYWdlIGZyb206ICR7dXJsfWApO1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYXhpb3MuZ2V0KHVybCwgeyByZXNwb25zZVR5cGU6ICdhcnJheWJ1ZmZlcicgfSk7XG4gICAgY29uc29sZS5sb2coYOKchSBEb3dubG9hZGVkIGltYWdlLCBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIHJldHVybiBCdWZmZXIuZnJvbShyZXNwb25zZS5kYXRhKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZG93bmxvYWRpbmcgaW1hZ2U6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=