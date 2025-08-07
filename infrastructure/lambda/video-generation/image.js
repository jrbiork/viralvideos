"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImage = generateImage;
const client_s3_1 = require("@aws-sdk/client-s3");
const axios_1 = __importDefault(require("axios"));
const sdk_1 = require("@runwayml/sdk");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
async function generateImage(description, sceneIndex, userId, timestamp, seed, sceneId) {
    try {
        const runway = new sdk_1.RunwayML({
            apiKey: process.env.RUNWAY_API_KEY,
        });
        console.log(`🎨 Calling Runway SDK for image generation in scene ${sceneIndex}...`);
        console.log('📤 Runway SDK request parameters:');
        console.log('- Text-to-image model: gen4_image');
        console.log('- Prompt:', description);
        console.log('- Aspect ratio: 9:16 (vertical)');
        console.log('🎨 Generating image from text...');
        let imageResult;
        let imageRetryCount = 0;
        const maxImageRetries = 5;
        while (imageRetryCount < maxImageRetries) {
            try {
                console.log(`🎨 Image generation attempt ${imageRetryCount + 1}/${maxImageRetries} with seed: ${seed}`);
                imageResult = await runway.textToImage
                    .create({
                    model: 'gen4_image',
                    promptText: `${description} - no text overlays, no graphics, no logos, no watermarks, clean visual content only`,
                    ratio: '720:1280',
                    seed: seed,
                })
                    .waitForTaskOutput();
                console.log('📡 Text-to-image generation completed');
                console.log('🆔 Image Generation ID:', imageResult.id);
                console.log('✅ Image generation completed');
                console.log('📄 Image result:', imageResult);
                break;
            }
            catch (error) {
                imageRetryCount++;
                console.error(`❌ Image generation attempt ${imageRetryCount} failed:`, error);
                if (error && typeof error === 'object' && 'taskDetails' in error) {
                    const taskDetails = error.taskDetails;
                    console.error('Task details:', taskDetails);
                    if (taskDetails?.failureCode === 'INTERNAL.BAD_OUTPUT.CODE01') {
                        console.log(`🔄 Retrying image generation due to INTERNAL.BAD_OUTPUT.CODE01 error (attempt ${imageRetryCount}/${maxImageRetries})`);
                        if (imageRetryCount < maxImageRetries) {
                            const waitTime = Math.min(1000 * Math.pow(2, imageRetryCount - 1), 5000);
                            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                            await new Promise((resolve) => setTimeout(resolve, waitTime));
                            continue;
                        }
                    }
                }
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
        const imageUrl = imageResult.output[0];
        console.log('imageResult.output:', imageResult.output);
        console.log('🖼️ Generated image URL:', imageUrl);
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
