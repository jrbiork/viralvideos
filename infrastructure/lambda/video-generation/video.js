"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateVideoClip = generateVideoClip;
const client_s3_1 = require("@aws-sdk/client-s3");
const axios_1 = __importDefault(require("axios"));
const sdk_1 = require("@runwayml/sdk");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
async function generateVideoClip(description, duration, sceneIndex, userId, timestamp, seed, sceneId) {
    try {
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
        console.log('🎨 Generating image from text...');
        let imageResult;
        let imageRetryCount = 0;
        const maxImageRetries = 3;
        while (imageRetryCount < maxImageRetries) {
            try {
                const currentImageSeed = imageRetryCount === 0 ? seed : Math.floor(Math.random() * 1000000);
                console.log(`🎨 Image generation attempt ${imageRetryCount + 1}/${maxImageRetries} with seed: ${currentImageSeed}`);
                imageResult = await runway.textToImage
                    .create({
                    model: 'gen4_image',
                    promptText: `${description} - cinematic scene, no text overlays, no graphics, no logos, no watermarks, clean visual content only`,
                    ratio: '720:1280',
                    seed: currentImageSeed,
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
        console.log('🎬 Generating video from image...');
        let videoResult;
        let retryCount = 0;
        const maxRetries = 3;
        while (retryCount < maxRetries) {
            try {
                const currentSeed = retryCount === 0 ? seed : Math.floor(Math.random() * 1000000);
                console.log(`🎬 Attempt ${retryCount + 1}/${maxRetries} with seed: ${currentSeed}`);
                videoResult = await runway.imageToVideo
                    .create({
                    model: 'gen4_turbo',
                    promptImage: imageUrl,
                    ratio: '720:1280',
                    duration: Math.min(duration, 10),
                    promptText: `${description} - cinematic video, no text overlays, no graphics, no logos, no watermarks, clean visual content only`,
                    seed: currentSeed,
                })
                    .waitForTaskOutput();
                console.log('📡 Image-to-video generation completed');
                console.log('🆔 Video Generation ID:', videoResult.id);
                console.log('✅ Video generation completed');
                console.log('📄 Video result:', videoResult);
                break;
            }
            catch (error) {
                retryCount++;
                console.error(`❌ Video generation attempt ${retryCount} failed:`, error);
                if (error && typeof error === 'object' && 'taskDetails' in error) {
                    const taskDetails = error.taskDetails;
                    console.error('Task details:', taskDetails);
                    if (taskDetails?.failureCode === 'INTERNAL.BAD_OUTPUT.CODE01') {
                        console.log(`🔄 Retrying due to INTERNAL.BAD_OUTPUT.CODE01 error (attempt ${retryCount}/${maxRetries})`);
                        if (retryCount < maxRetries) {
                            const waitTime = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
                            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                            await new Promise((resolve) => setTimeout(resolve, waitTime));
                            continue;
                        }
                    }
                }
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
