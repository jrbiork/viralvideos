import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import { RunwayML } from '@runwayml/sdk';

const s3 = new S3Client({ region: process.env.AWS_REGION });

export interface Scene {
  description: string;
  duration: number;
  narration: string;
  id: number;
}

export async function animateImageToVideo(
  description: string,
  duration: 5 | 10,
  scenePosition: number,
  userId: string,
  timestamp: string,
  seed: number,
  imageUrl?: string,
): Promise<string> {
  try {
    // Initialize Runway SDK
    const runway = new RunwayML({
      apiKey: process.env.RUNWAY_API_KEY!,
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
        console.log(
          `🎬 Attempt ${retryCount + 1}/${maxRetries} with seed: ${seed}`,
        );

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
      } catch (error) {
        retryCount++;
        console.error(
          `❌ Video generation attempt ${retryCount} failed:`,
          error,
        );

        // Check if it's the specific error we're seeing
        if (error && typeof error === 'object' && 'taskDetails' in error) {
          const taskDetails = (error as any).taskDetails;
          console.error('Task details:', taskDetails);

          if (taskDetails?.failureCode === 'INTERNAL.BAD_OUTPUT.CODE01') {
            console.log(
              `🔄 Retrying due to INTERNAL.BAD_OUTPUT.CODE01 error (attempt ${retryCount}/${maxRetries})`,
            );
            if (retryCount < maxRetries) {
              // Wait before retrying (exponential backoff)
              const waitTime = Math.min(
                1000 * Math.pow(2, retryCount - 1),
                5000,
              );
              console.log(`⏳ Waiting ${waitTime}ms before retry...`);
              await new Promise((resolve) => setTimeout(resolve, waitTime));
              continue;
            }
          }
        }

        // If we've exhausted retries or it's not the specific error, throw
        if (retryCount >= maxRetries) {
          console.error(
            `❌ All ${maxRetries} attempts failed for scene ${scenePosition}`,
          );
          throw error;
        }
      }
    }

    if (
      !videoResult ||
      !videoResult.output ||
      videoResult.output.length === 0
    ) {
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
      `❌ Error in animateImageToVideo for scene ${scenePosition}:`,
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
