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
async function generateVideoClip(description, duration, sceneIndex, userId, timestamp) {
    try {
        console.log(`🎬 Calling Runway SDK for scene ${sceneIndex}...`);
        console.log(`📝 Scene description: ${description}`);
        console.log(`⏱️  Scene duration: ${duration} seconds`);
        const runway = new sdk_1.RunwayML({
            apiKey: process.env.RUNWAY_API_KEY,
        });
        console.log('📤 Runway SDK request parameters:');
        console.log('- Text-to-image model: gen4_image');
        console.log('- Image-to-video model: gen4_turbo');
        console.log('- Prompt:', description);
        console.log('- Duration:', duration, 'seconds');
        console.log('- Aspect ratio: 9:16 (vertical)');
        console.log('🎨 Generating image from text...');
        const imageResult = await runway.textToImage
            .create({
            model: 'gen4_image',
            promptText: description,
            ratio: '1080:1920',
            seed: Math.floor(Math.random() * 1000000),
        })
            .waitForTaskOutput();
        console.log('📡 Text-to-image generation completed');
        console.log('🆔 Image Generation ID:', imageResult.id);
        console.log('✅ Image generation completed');
        console.log('📄 Image result:', imageResult);
        const imageUrl = imageResult.output[0];
        console.log('imageResult.output:', imageResult.output);
        console.log('🖼️ Generated image URL:', imageUrl);
        console.log('🎬 Generating video from image...');
        const videoResult = await runway.imageToVideo
            .create({
            model: 'gen4_turbo',
            promptImage: imageUrl,
            ratio: '720:1280',
            duration: Math.min(duration, 10),
            promptText: description,
            seed: Math.floor(Math.random() * 1000000),
        })
            .waitForTaskOutput();
        console.log('📡 Image-to-video generation started');
        console.log('🆔 Video Generation ID:', videoResult.id);
        console.log('✅ Video generation completed');
        console.log('📄 Video result:', videoResult);
        if (!videoResult.output || videoResult.output.length === 0) {
            console.log('❌ Error: Runway SDK did not return a video URL');
            console.log('Full video result:', videoResult);
            throw new Error('Runway SDK did not return a video URL');
        }
        const videoUrl = videoResult.output[0];
        console.log(`📥 Downloading video from: ${videoUrl}`);
        const videoBuffer = await downloadVideo(videoUrl);
        console.log(`✅ Downloaded video, size: ${videoBuffer.length} bytes`);
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
