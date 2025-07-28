import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import { RunwayML } from '@runwayml/sdk';

const s3 = new S3Client({ region: process.env.AWS_REGION });

export interface Scene {
  description: string;
  duration: number;
  narration: string;
}

export async function generateVideoClip(
  description: string,
  duration: number,
  sceneIndex: number,
  userId: string,
): Promise<string> {
  try {
    console.log(`🎬 Calling Runway SDK for scene ${sceneIndex}...`);
    console.log(`📝 Scene description: ${description}`);
    console.log(`⏱️  Scene duration: ${duration} seconds`);

    // Initialize Runway SDK
    const runway = new RunwayML({
      apiKey: process.env.RUNWAY_API_KEY!,
    });

    console.log('📤 Runway SDK request parameters:');
    console.log('- Text-to-image model: gen4_image');
    console.log('- Image-to-video model: gen4_turbo');
    console.log('- Prompt:', description);
    console.log('- Duration:', duration, 'seconds');
    console.log('- Aspect ratio: 9:16 (vertical)');

    // Step 1: Generate an image from text using text-to-image API
    console.log('🎨 Generating image from text...');
    const imageResult = await runway.textToImage
      .create({
        model: 'gen4_image',
        promptText: description,
        ratio: '1080:1920', // Vertical format (9:16)
        seed: Math.floor(Math.random() * 1000000),
      })
      .waitForTaskOutput();

    console.log('📡 Text-to-image generation completed');
    console.log('🆔 Image Generation ID:', imageResult.id);

    console.log('✅ Image generation completed');
    console.log('📄 Image result:', imageResult);

    // Access the output property which should contain the images
    const imageUrl = imageResult.output![0];
    console.log('imageResult.output:', imageResult.output);

    console.log('🖼️ Generated image URL:', imageUrl);

    // Step 2: Generate video from the image using image-to-video API
    console.log('🎬 Generating video from image...');
    const videoResult = await runway.imageToVideo
      .create({
        model: 'gen4_turbo',
        promptImage: imageUrl,
        ratio: '720:1280', // Vertical format (9:16)
        duration: Math.min(duration, 10) as 5 | 10, // Runway supports max 10 seconds
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

    // Save video to video-parts bucket
    const videoKey = `${userId}/scene-${sceneIndex}.mp4`;
    console.log(
      `☁️ Uploading video part to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${videoKey}`,
    );

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Key: videoKey,
        Body: videoBuffer,
        ContentType: 'video/mp4',
      }),
    );
    console.log(`✅ Uploaded video part to S3: ${videoKey}`);

    return videoKey;
  } catch (error) {
    console.error(
      `❌ Error in generateVideoClip for scene ${sceneIndex}:`,
      error,
    );
    if (error && typeof error === 'object' && 'message' in error) {
      console.error('Error message:', error.message);
      console.error('Error name:', (error as any).name);
      console.error('Error stack:', (error as any).stack);
    }
    throw error;
  }
}

async function downloadVideo(url: string): Promise<Buffer> {
  console.log(`📥 Downloading video from: ${url}`);
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    console.log(`✅ Downloaded video, status: ${response.status}`);
    return Buffer.from(response.data);
  } catch (error) {
    console.error('❌ Error downloading video:', error);
    throw error;
  }
}
