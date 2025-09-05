"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNanoBananaImage = generateNanoBananaImage;
const genai_1 = require("@google/genai");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
async function generateNanoBananaImage(description, sceneIndex, userId, timestamp, seed, signedUrl) {
    try {
        // Initialize Google GenAI
        const genAI = new genai_1.GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
        });
        console.log(`🎨  genai - Calling Gemini Nano Banana for image generation in scene ${sceneIndex}...`);
        console.log('- Prompt:', description);
        console.log('- Model: gemini-2.5-flash-image-preview');
        console.log('- User ID:', userId);
        console.log('- Timestamp:', timestamp);
        console.log('- Seed:', seed);
        // Generate an image using Gemini Nano Banana
        console.log('🎨 genai - Generating image from text...');
        const prompt = `${description} - photorealistic, film grain, 50mm lens, dramatic rim light. Aspect ratio: 720:1280, Vertical format (9:16)`;
        const response = await genAI.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: prompt,
        });
        let s3Key = '';
        const parts = response.candidates?.[0]?.content?.parts ?? [];
        const hasImage = parts.some((p) => 'inlineData' in p);
        console.log('genai - has inline image?', hasImage);
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            console.log('genai - Part', part);
            if (part.inlineData) {
                const imageData = part.inlineData.data;
                const imageBuffer = Buffer.from(imageData || '', 'base64');
                console.log('genai - Image saved as gemini-native-image.png');
                // after you find the part with inlineData:
                const mime = part.inlineData?.mimeType || 'image/png';
                const ext = mime.split('/')[1] || 'png';
                // if you want to always store JPEG, actually re-encode with `sharp`.
                // otherwise keep the model's format:
                s3Key = `${userId}/${timestamp}.scene-${sceneIndex}.${ext}`;
                console.log('genai - Uploading image to S3', s3Key);
                await s3.send(new client_s3_1.PutObjectCommand({
                    Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                    Key: s3Key,
                    Body: imageBuffer,
                    ContentType: mime,
                }));
                console.log('genai - Image uploaded to S3', s3Key);
            }
        }
        // Generate URL based on scenes count
        if (signedUrl) {
            // Return presigned URL for single scene
            const getObjectCommand = new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: s3Key,
            });
            const presignedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, getObjectCommand, {
                expiresIn: 36000, // 10 hours
            });
            console.log('🖼️ genai - Generated and uploaded image with presigned URL:', presignedUrl);
            return presignedUrl;
        }
        return '';
    }
    catch (error) {
        console.error(`❌ genai - Error in generateNanoBananaImage for scene ${sceneIndex}:`, error);
        if (error && typeof error === 'object' && 'message' in error) {
            console.error('genai - Error message:', error.message);
            console.error('genai - Error name:', error.name);
            console.error('genai - Error stack:', error.stack);
        }
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2VOYW5vQmFuYW5hLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiaW1hZ2VOYW5vQmFuYW5hLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBaUJBLDBEQXdHQztBQXpIRCx5Q0FBNEM7QUFDNUMsa0RBSTRCO0FBQzVCLHdFQUE2RDtBQUU3RCxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVyxFQUFFLENBQUMsQ0FBQztBQVNwRSxLQUFLLFVBQVUsdUJBQXVCLENBQzNDLFdBQW1CLEVBQ25CLFVBQWtCLEVBQ2xCLE1BQWMsRUFDZCxTQUFpQixFQUNqQixJQUFZLEVBQ1osU0FBbUI7SUFFbkIsSUFBSSxDQUFDO1FBQ0gsMEJBQTBCO1FBQzFCLE1BQU0sS0FBSyxHQUFHLElBQUksbUJBQVcsQ0FBQztZQUM1QixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFlO1NBQ3BDLENBQUMsQ0FBQztRQUVILE9BQU8sQ0FBQyxHQUFHLENBQ1Qsd0VBQXdFLFVBQVUsS0FBSyxDQUN4RixDQUFDO1FBQ0YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO1FBQ3ZELE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3ZDLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTdCLDZDQUE2QztRQUM3QyxPQUFPLENBQUMsR0FBRyxDQUFDLDBDQUEwQyxDQUFDLENBQUM7UUFFeEQsTUFBTSxNQUFNLEdBQUcsR0FBRyxXQUFXLDhHQUE4RyxDQUFDO1FBRTVJLE1BQU0sUUFBUSxHQUFHLE1BQU0sS0FBSyxDQUFDLE1BQU0sQ0FBQyxlQUFlLENBQUM7WUFDbEQsS0FBSyxFQUFFLGdDQUFnQztZQUN2QyxRQUFRLEVBQUUsTUFBTTtTQUNqQixDQUFDLENBQUM7UUFFSCxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7UUFFZixNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssSUFBSSxFQUFFLENBQUM7UUFFN0QsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsWUFBWSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3RELE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFbkQsS0FBSyxNQUFNLElBQUksSUFBSSxRQUFRLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLEtBQUssSUFBSSxFQUFFLEVBQUUsQ0FBQztZQUNsRSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUNsQyxJQUFJLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDcEIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUM7Z0JBQ3ZDLE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxJQUFJLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztnQkFFM0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnREFBZ0QsQ0FBQyxDQUFDO2dCQUU5RCwyQ0FBMkM7Z0JBQzNDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLEVBQUUsUUFBUSxJQUFJLFdBQVcsQ0FBQztnQkFDdEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUM7Z0JBRXhDLHFFQUFxRTtnQkFDckUscUNBQXFDO2dCQUNyQyxLQUFLLEdBQUcsR0FBRyxNQUFNLElBQUksU0FBUyxVQUFVLFVBQVUsSUFBSSxHQUFHLEVBQUUsQ0FBQztnQkFFNUQsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQkFBK0IsRUFBRSxLQUFLLENBQUMsQ0FBQztnQkFFcEQsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUNYLElBQUksNEJBQWdCLENBQUM7b0JBQ25CLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF3QjtvQkFDNUMsR0FBRyxFQUFFLEtBQUs7b0JBQ1YsSUFBSSxFQUFFLFdBQVc7b0JBQ2pCLFdBQVcsRUFBRSxJQUFJO2lCQUNsQixDQUFDLENBQ0gsQ0FBQztnQkFFRixPQUFPLENBQUMsR0FBRyxDQUFDLDhCQUE4QixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3JELENBQUM7UUFDSCxDQUFDO1FBRUQscUNBQXFDO1FBQ3JDLElBQUksU0FBUyxFQUFFLENBQUM7WUFDZCx3Q0FBd0M7WUFDeEMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLDRCQUFnQixDQUFDO2dCQUM1QyxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBd0I7Z0JBQzVDLEdBQUcsRUFBRSxLQUFLO2FBQ1gsQ0FBQyxDQUFDO1lBRUgsTUFBTSxZQUFZLEdBQUcsTUFBTSxJQUFBLG1DQUFZLEVBQUMsRUFBRSxFQUFFLGdCQUFnQixFQUFFO2dCQUM1RCxTQUFTLEVBQUUsS0FBSyxFQUFFLFdBQVc7YUFDOUIsQ0FBQyxDQUFDO1lBRUgsT0FBTyxDQUFDLEdBQUcsQ0FDVCw4REFBOEQsRUFDOUQsWUFBWSxDQUNiLENBQUM7WUFFRixPQUFPLFlBQVksQ0FBQztRQUN0QixDQUFDO1FBRUQsT0FBTyxFQUFFLENBQUM7SUFDWixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQ1gsd0RBQXdELFVBQVUsR0FBRyxFQUNyRSxLQUFLLENBQ04sQ0FBQztRQUNGLElBQUksS0FBSyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxTQUFTLElBQUksS0FBSyxFQUFFLENBQUM7WUFDN0QsT0FBTyxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdkQsT0FBTyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsRUFBRyxLQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDMUQsT0FBTyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsRUFBRyxLQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUQsQ0FBQztRQUNELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHb29nbGVHZW5BSSB9IGZyb20gJ0Bnb29nbGUvZ2VuYWknO1xuaW1wb3J0IHtcbiAgUzNDbGllbnQsXG4gIFB1dE9iamVjdENvbW1hbmQsXG4gIEdldE9iamVjdENvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgeyBnZXRTaWduZWRVcmwgfSBmcm9tICdAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lcic7XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjZW5lIHtcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgbmFycmF0aW9uOiBzdHJpbmc7XG4gIGlkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZU5hbm9CYW5hbmFJbWFnZShcbiAgZGVzY3JpcHRpb246IHN0cmluZyxcbiAgc2NlbmVJbmRleDogbnVtYmVyLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHNlZWQ6IG51bWJlcixcbiAgc2lnbmVkVXJsPzogYm9vbGVhbixcbik6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICB0cnkge1xuICAgIC8vIEluaXRpYWxpemUgR29vZ2xlIEdlbkFJXG4gICAgY29uc3QgZ2VuQUkgPSBuZXcgR29vZ2xlR2VuQUkoe1xuICAgICAgYXBpS2V5OiBwcm9jZXNzLmVudi5HRU1JTklfQVBJX0tFWSEsXG4gICAgfSk7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGDwn46oICBnZW5haSAtIENhbGxpbmcgR2VtaW5pIE5hbm8gQmFuYW5hIGZvciBpbWFnZSBnZW5lcmF0aW9uIGluIHNjZW5lICR7c2NlbmVJbmRleH0uLi5gLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coJy0gUHJvbXB0OicsIGRlc2NyaXB0aW9uKTtcbiAgICBjb25zb2xlLmxvZygnLSBNb2RlbDogZ2VtaW5pLTIuNS1mbGFzaC1pbWFnZS1wcmV2aWV3Jyk7XG4gICAgY29uc29sZS5sb2coJy0gVXNlciBJRDonLCB1c2VySWQpO1xuICAgIGNvbnNvbGUubG9nKCctIFRpbWVzdGFtcDonLCB0aW1lc3RhbXApO1xuICAgIGNvbnNvbGUubG9nKCctIFNlZWQ6Jywgc2VlZCk7XG5cbiAgICAvLyBHZW5lcmF0ZSBhbiBpbWFnZSB1c2luZyBHZW1pbmkgTmFubyBCYW5hbmFcbiAgICBjb25zb2xlLmxvZygn8J+OqCBnZW5haSAtIEdlbmVyYXRpbmcgaW1hZ2UgZnJvbSB0ZXh0Li4uJyk7XG5cbiAgICBjb25zdCBwcm9tcHQgPSBgJHtkZXNjcmlwdGlvbn0gLSBwaG90b3JlYWxpc3RpYywgZmlsbSBncmFpbiwgNTBtbSBsZW5zLCBkcmFtYXRpYyByaW0gbGlnaHQuIEFzcGVjdCByYXRpbzogNzIwOjEyODAsIFZlcnRpY2FsIGZvcm1hdCAoOToxNilgO1xuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZW5BSS5tb2RlbHMuZ2VuZXJhdGVDb250ZW50KHtcbiAgICAgIG1vZGVsOiAnZ2VtaW5pLTIuNS1mbGFzaC1pbWFnZS1wcmV2aWV3JyxcbiAgICAgIGNvbnRlbnRzOiBwcm9tcHQsXG4gICAgfSk7XG5cbiAgICBsZXQgczNLZXkgPSAnJztcblxuICAgIGNvbnN0IHBhcnRzID0gcmVzcG9uc2UuY2FuZGlkYXRlcz8uWzBdPy5jb250ZW50Py5wYXJ0cyA/PyBbXTtcblxuICAgIGNvbnN0IGhhc0ltYWdlID0gcGFydHMuc29tZSgocCkgPT4gJ2lubGluZURhdGEnIGluIHApO1xuICAgIGNvbnNvbGUubG9nKCdnZW5haSAtIGhhcyBpbmxpbmUgaW1hZ2U/JywgaGFzSW1hZ2UpO1xuXG4gICAgZm9yIChjb25zdCBwYXJ0IG9mIHJlc3BvbnNlLmNhbmRpZGF0ZXM/LlswXT8uY29udGVudD8ucGFydHMgfHwgW10pIHtcbiAgICAgIGNvbnNvbGUubG9nKCdnZW5haSAtIFBhcnQnLCBwYXJ0KTtcbiAgICAgIGlmIChwYXJ0LmlubGluZURhdGEpIHtcbiAgICAgICAgY29uc3QgaW1hZ2VEYXRhID0gcGFydC5pbmxpbmVEYXRhLmRhdGE7XG4gICAgICAgIGNvbnN0IGltYWdlQnVmZmVyID0gQnVmZmVyLmZyb20oaW1hZ2VEYXRhIHx8ICcnLCAnYmFzZTY0Jyk7XG5cbiAgICAgICAgY29uc29sZS5sb2coJ2dlbmFpIC0gSW1hZ2Ugc2F2ZWQgYXMgZ2VtaW5pLW5hdGl2ZS1pbWFnZS5wbmcnKTtcblxuICAgICAgICAvLyBhZnRlciB5b3UgZmluZCB0aGUgcGFydCB3aXRoIGlubGluZURhdGE6XG4gICAgICAgIGNvbnN0IG1pbWUgPSBwYXJ0LmlubGluZURhdGE/Lm1pbWVUeXBlIHx8ICdpbWFnZS9wbmcnO1xuICAgICAgICBjb25zdCBleHQgPSBtaW1lLnNwbGl0KCcvJylbMV0gfHwgJ3BuZyc7XG5cbiAgICAgICAgLy8gaWYgeW91IHdhbnQgdG8gYWx3YXlzIHN0b3JlIEpQRUcsIGFjdHVhbGx5IHJlLWVuY29kZSB3aXRoIGBzaGFycGAuXG4gICAgICAgIC8vIG90aGVyd2lzZSBrZWVwIHRoZSBtb2RlbCdzIGZvcm1hdDpcbiAgICAgICAgczNLZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lSW5kZXh9LiR7ZXh0fWA7XG5cbiAgICAgICAgY29uc29sZS5sb2coJ2dlbmFpIC0gVXBsb2FkaW5nIGltYWdlIHRvIFMzJywgczNLZXkpO1xuXG4gICAgICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSEsXG4gICAgICAgICAgICBLZXk6IHMzS2V5LFxuICAgICAgICAgICAgQm9keTogaW1hZ2VCdWZmZXIsXG4gICAgICAgICAgICBDb250ZW50VHlwZTogbWltZSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKTtcblxuICAgICAgICBjb25zb2xlLmxvZygnZ2VuYWkgLSBJbWFnZSB1cGxvYWRlZCB0byBTMycsIHMzS2V5KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBHZW5lcmF0ZSBVUkwgYmFzZWQgb24gc2NlbmVzIGNvdW50XG4gICAgaWYgKHNpZ25lZFVybCkge1xuICAgICAgLy8gUmV0dXJuIHByZXNpZ25lZCBVUkwgZm9yIHNpbmdsZSBzY2VuZVxuICAgICAgY29uc3QgZ2V0T2JqZWN0Q29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSEsXG4gICAgICAgIEtleTogczNLZXksXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgcHJlc2lnbmVkVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKHMzLCBnZXRPYmplY3RDb21tYW5kLCB7XG4gICAgICAgIGV4cGlyZXNJbjogMzYwMDAsIC8vIDEwIGhvdXJzXG4gICAgICB9KTtcblxuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn5a877iPIGdlbmFpIC0gR2VuZXJhdGVkIGFuZCB1cGxvYWRlZCBpbWFnZSB3aXRoIHByZXNpZ25lZCBVUkw6JyxcbiAgICAgICAgcHJlc2lnbmVkVXJsLFxuICAgICAgKTtcblxuICAgICAgcmV0dXJuIHByZXNpZ25lZFVybDtcbiAgICB9XG5cbiAgICByZXR1cm4gJyc7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcbiAgICAgIGDinYwgZ2VuYWkgLSBFcnJvciBpbiBnZW5lcmF0ZU5hbm9CYW5hbmFJbWFnZSBmb3Igc2NlbmUgJHtzY2VuZUluZGV4fTpgLFxuICAgICAgZXJyb3IsXG4gICAgKTtcbiAgICBpZiAoZXJyb3IgJiYgdHlwZW9mIGVycm9yID09PSAnb2JqZWN0JyAmJiAnbWVzc2FnZScgaW4gZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ2dlbmFpIC0gRXJyb3IgbWVzc2FnZTonLCBlcnJvci5tZXNzYWdlKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ2dlbmFpIC0gRXJyb3IgbmFtZTonLCAoZXJyb3IgYXMgYW55KS5uYW1lKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ2dlbmFpIC0gRXJyb3Igc3RhY2s6JywgKGVycm9yIGFzIGFueSkuc3RhY2spO1xuICAgIH1cbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19