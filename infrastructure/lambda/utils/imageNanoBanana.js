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
        const prompt = `${description} - photorealistic, film grain, 50mm lens, dramatic rim light, vertical format 9:16, no text, no logos, clean visual content only`;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2VOYW5vQmFuYW5hLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiaW1hZ2VOYW5vQmFuYW5hLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBaUJBLDBEQXdHQztBQXpIRCx5Q0FBNEM7QUFDNUMsa0RBSTRCO0FBQzVCLHdFQUE2RDtBQUU3RCxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVyxFQUFFLENBQUMsQ0FBQztBQVNwRSxLQUFLLFVBQVUsdUJBQXVCLENBQzNDLFdBQW1CLEVBQ25CLFVBQWtCLEVBQ2xCLE1BQWMsRUFDZCxTQUFpQixFQUNqQixJQUFZLEVBQ1osU0FBbUI7SUFFbkIsSUFBSSxDQUFDO1FBQ0gsMEJBQTBCO1FBQzFCLE1BQU0sS0FBSyxHQUFHLElBQUksbUJBQVcsQ0FBQztZQUM1QixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFlO1NBQ3BDLENBQUMsQ0FBQztRQUVILE9BQU8sQ0FBQyxHQUFHLENBQ1Qsd0VBQXdFLFVBQVUsS0FBSyxDQUN4RixDQUFDO1FBQ0YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO1FBQ3ZELE9BQU8sQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2xDLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3ZDLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTdCLDZDQUE2QztRQUM3QyxPQUFPLENBQUMsR0FBRyxDQUFDLDBDQUEwQyxDQUFDLENBQUM7UUFFeEQsTUFBTSxNQUFNLEdBQUcsR0FBRyxXQUFXLGtJQUFrSSxDQUFDO1FBRWhLLE1BQU0sUUFBUSxHQUFH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LFFBQVEsSUFBSSxTQUFTLElBQUksS0FBSyxFQUFFLENBQUM7WUFDN0QsT0FBTyxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdkQsT0FBTyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsRUFBRyxLQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDMUQsT0FBTyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsRUFBRyxLQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUQsQ0FBQztRQUNELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHb29nbGVHZW5BSSB9IGZyb20gJ0Bnb29nbGUvZ2VuYWknO1xuaW1wb3J0IHtcbiAgUzNDbGllbnQsXG4gIFB1dE9iamVjdENvbW1hbmQsXG4gIEdldE9iamVjdENvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgeyBnZXRTaWduZWRVcmwgfSBmcm9tICdAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lcic7XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjZW5lIHtcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgbmFycmF0aW9uOiBzdHJpbmc7XG4gIGlkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZU5hbm9CYW5hbmFJbWFnZShcbiAgZGVzY3JpcHRpb246IHN0cmluZyxcbiAgc2NlbmVJbmRleDogbnVtYmVyLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHNlZWQ6IG51bWJlcixcbiAgc2lnbmVkVXJsPzogYm9vbGVhbixcbik6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICB0cnkge1xuICAgIC8vIEluaXRpYWxpemUgR29vZ2xlIEdlbkFJXG4gICAgY29uc3QgZ2VuQUkgPSBuZXcgR29vZ2xlR2VuQUkoe1xuICAgICAgYXBpS2V5OiBwcm9jZXNzLmVudi5HRU1JTklfQVBJX0tFWSEsXG4gICAgfSk7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGDwn46oICBnZW5haSAtIENhbGxpbmcgR2VtaW5pIE5hbm8gQmFuYW5hIGZvciBpbWFnZSBnZW5lcmF0aW9uIGluIHNjZW5lICR7c2NlbmVJbmRleH0uLi5gLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coJy0gUHJvbXB0OicsIGRlc2NyaXB0aW9uKTtcbiAgICBjb25zb2xlLmxvZygnLSBNb2RlbDogZ2VtaW5pLTIuNS1mbGFzaC1pbWFnZS1wcmV2aWV3Jyk7XG4gICAgY29uc29sZS5sb2coJy0gVXNlciBJRDonLCB1c2VySWQpO1xuICAgIGNvbnNvbGUubG9nKCctIFRpbWVzdGFtcDonLCB0aW1lc3RhbXApO1xuICAgIGNvbnNvbGUubG9nKCctIFNlZWQ6Jywgc2VlZCk7XG5cbiAgICAvLyBHZW5lcmF0ZSBhbiBpbWFnZSB1c2luZyBHZW1pbmkgTmFubyBCYW5hbmFcbiAgICBjb25zb2xlLmxvZygn8J+OqCBnZW5haSAtIEdlbmVyYXRpbmcgaW1hZ2UgZnJvbSB0ZXh0Li4uJyk7XG5cbiAgICBjb25zdCBwcm9tcHQgPSBgJHtkZXNjcmlwdGlvbn0gLSBwaG90b3JlYWxpc3RpYywgZmlsbSBncmFpbiwgNTBtbSBsZW5zLCBkcmFtYXRpYyByaW0gbGlnaHQsIHZlcnRpY2FsIGZvcm1hdCA5OjE2LCBubyB0ZXh0LCBubyBsb2dvcywgY2xlYW4gdmlzdWFsIGNvbnRlbnQgb25seWA7XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGdlbkFJLm1vZGVscy5nZW5lcmF0ZUNvbnRlbnQoe1xuICAgICAgbW9kZWw6ICdnZW1pbmktMi41LWZsYXNoLWltYWdlLXByZXZpZXcnLFxuICAgICAgY29udGVudHM6IHByb21wdCxcbiAgICB9KTtcblxuICAgIGxldCBzM0tleSA9ICcnO1xuXG4gICAgY29uc3QgcGFydHMgPSByZXNwb25zZS5jYW5kaWRhdGVzPy5bMF0/LmNvbnRlbnQ/LnBhcnRzID8/IFtdO1xuXG4gICAgY29uc3QgaGFzSW1hZ2UgPSBwYXJ0cy5zb21lKChwKSA9PiAnaW5saW5lRGF0YScgaW4gcCk7XG4gICAgY29uc29sZS5sb2coJ2dlbmFpIC0gaGFzIGlubGluZSBpbWFnZT8nLCBoYXNJbWFnZSk7XG5cbiAgICBmb3IgKGNvbnN0IHBhcnQgb2YgcmVzcG9uc2UuY2FuZGlkYXRlcz8uWzBdPy5jb250ZW50Py5wYXJ0cyB8fCBbXSkge1xuICAgICAgY29uc29sZS5sb2coJ2dlbmFpIC0gUGFydCcsIHBhcnQpO1xuICAgICAgaWYgKHBhcnQuaW5saW5lRGF0YSkge1xuICAgICAgICBjb25zdCBpbWFnZURhdGEgPSBwYXJ0LmlubGluZURhdGEuZGF0YTtcbiAgICAgICAgY29uc3QgaW1hZ2VCdWZmZXIgPSBCdWZmZXIuZnJvbShpbWFnZURhdGEgfHwgJycsICdiYXNlNjQnKTtcblxuICAgICAgICBjb25zb2xlLmxvZygnZ2VuYWkgLSBJbWFnZSBzYXZlZCBhcyBnZW1pbmktbmF0aXZlLWltYWdlLnBuZycpO1xuXG4gICAgICAgIC8vIGFmdGVyIHlvdSBmaW5kIHRoZSBwYXJ0IHdpdGggaW5saW5lRGF0YTpcbiAgICAgICAgY29uc3QgbWltZSA9IHBhcnQuaW5saW5lRGF0YT8ubWltZVR5cGUgfHwgJ2ltYWdlL3BuZyc7XG4gICAgICAgIGNvbnN0IGV4dCA9IG1pbWUuc3BsaXQoJy8nKVsxXSB8fCAncG5nJztcblxuICAgICAgICAvLyBpZiB5b3Ugd2FudCB0byBhbHdheXMgc3RvcmUgSlBFRywgYWN0dWFsbHkgcmUtZW5jb2RlIHdpdGggYHNoYXJwYC5cbiAgICAgICAgLy8gb3RoZXJ3aXNlIGtlZXAgdGhlIG1vZGVsJ3MgZm9ybWF0OlxuICAgICAgICBzM0tleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmVJbmRleH0uJHtleHR9YDtcblxuICAgICAgICBjb25zb2xlLmxvZygnZ2VuYWkgLSBVcGxvYWRpbmcgaW1hZ2UgdG8gUzMnLCBzM0tleSk7XG5cbiAgICAgICAgYXdhaXQgczMuc2VuZChcbiAgICAgICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FISxcbiAgICAgICAgICAgIEtleTogczNLZXksXG4gICAgICAgICAgICBCb2R5OiBpbWFnZUJ1ZmZlcixcbiAgICAgICAgICAgIENvbnRlbnRUeXBlOiBtaW1lLFxuICAgICAgICAgIH0pLFxuICAgICAgICApO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCdnZW5haSAtIEltYWdlIHVwbG9hZGVkIHRvIFMzJywgczNLZXkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEdlbmVyYXRlIFVSTCBiYXNlZCBvbiBzY2VuZXMgY291bnRcbiAgICBpZiAoc2lnbmVkVXJsKSB7XG4gICAgICAvLyBSZXR1cm4gcHJlc2lnbmVkIFVSTCBmb3Igc2luZ2xlIHNjZW5lXG4gICAgICBjb25zdCBnZXRPYmplY3RDb21tYW5kID0gbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FISxcbiAgICAgICAgS2V5OiBzM0tleSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBwcmVzaWduZWRVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoczMsIGdldE9iamVjdENvbW1hbmQsIHtcbiAgICAgICAgZXhwaXJlc0luOiAzNjAwMCwgLy8gMTAgaG91cnNcbiAgICAgIH0pO1xuXG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CflrzvuI8gZ2VuYWkgLSBHZW5lcmF0ZWQgYW5kIHVwbG9hZGVkIGltYWdlIHdpdGggcHJlc2lnbmVkIFVSTDonLFxuICAgICAgICBwcmVzaWduZWRVcmwsXG4gICAgICApO1xuXG4gICAgICByZXR1cm4gcHJlc2lnbmVkVXJsO1xuICAgIH1cblxuICAgIHJldHVybiAnJztcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKFxuICAgICAgYOKdjCBnZW5haSAtIEVycm9yIGluIGdlbmVyYXRlTmFub0JhbmFuYUltYWdlIGZvciBzY2VuZSAke3NjZW5lSW5kZXh9OmAsXG4gICAgICBlcnJvcixcbiAgICApO1xuICAgIGlmIChlcnJvciAmJiB0eXBlb2YgZXJyb3IgPT09ICdvYmplY3QnICYmICdtZXNzYWdlJyBpbiBlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignZ2VuYWkgLSBFcnJvciBtZXNzYWdlOicsIGVycm9yLm1lc3NhZ2UpO1xuICAgICAgY29uc29sZS5lcnJvcignZ2VuYWkgLSBFcnJvciBuYW1lOicsIChlcnJvciBhcyBhbnkpLm5hbWUpO1xuICAgICAgY29uc29sZS5lcnJvcignZ2VuYWkgLSBFcnJvciBzdGFjazonLCAoZXJyb3IgYXMgYW55KS5zdGFjayk7XG4gICAgfVxuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=