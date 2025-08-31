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

export async function generateImage(
  description: string,
  sceneIndex: number,
  userId: string,
  timestamp: string,
  seed: number,
  sceneId?: number,
): Promise<string> {
  try {
    // Initialize Runway SDK
    const runway = new RunwayML({
      apiKey: process.env.RUNWAY_API_KEY!,
    });

    console.log(
      `🎨 Calling Runway SDK for image generation in scene ${sceneIndex}...`,
    );
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
        console.log(
          `🎨 Image generation attempt ${
            imageRetryCount + 1
          }/${maxImageRetries} with seed: ${seed}`,
        );

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
      } catch (error) {
        imageRetryCount++;
        console.error(
          `❌ Image generation attempt ${imageRetryCount} failed:`,
          error,
        );

        // Check if it's the specific error we're seeing
        if (error && typeof error === 'object' && 'taskDetails' in error) {
          const taskDetails = (error as any).taskDetails;
          console.error('Task details:', taskDetails);

          if (taskDetails?.failureCode === 'INTERNAL.BAD_OUTPUT.CODE01') {
            console.log(
              `🔄 Retrying image generation due to INTERNAL.BAD_OUTPUT.CODE01 error (attempt ${imageRetryCount}/${maxImageRetries})`,
            );
            if (imageRetryCount < maxImageRetries) {
              // Wait before retrying (exponential backoff)
              const waitTime = Math.min(
                1000 * Math.pow(2, imageRetryCount - 1),
                5000,
              );
              console.log(`⏳ Waiting ${waitTime}ms before retry...`);
              await new Promise((resolve) => setTimeout(resolve, waitTime));
              continue;
            }
          }
        }

        // If we've exhausted retries or it's not the specific error, throw
        if (imageRetryCount >= maxImageRetries) {
          console.error(
            `❌ All ${maxImageRetries} image generation attempts failed for scene ${sceneIndex}`,
          );
          throw error;
        }
      }
    }

    if (
      !imageResult ||
      !imageResult.output ||
      imageResult.output.length === 0
    ) {
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
      const imageKey = `${userId}/${timestamp}.scene-${
        sceneId !== undefined ? sceneId : sceneIndex
      }.jpg`;
      console.log(
        `☁️ Uploading image to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${imageKey}`,
      );

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: imageKey,
          Body: imageBuffer,
          ContentType: 'image/jpeg',
        }),
      );
      console.log(`✅ Uploaded image to S3: ${imageKey}`);
    } catch (error) {
      console.error('❌ Error saving image to S3:', error);
      // Don't throw here - we want to continue with video generation even if image saving fails
    }

    return imageUrl;
  } catch (error) {
    console.error(`❌ Error in generateImage for scene ${sceneIndex}:`, error);
    if (error && typeof error === 'object' && 'message' in error) {
      console.error('Error message:', error.message);
      console.error('Error name:', (error as any).name);
      console.error('Error stack:', (error as any).stack);
    }
    throw error;
  }
}

async function downloadImage(url: string): Promise<Buffer> {
  console.log(`📥 Downloading image from: ${url}`);
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    console.log(`✅ Downloaded image, status: ${response.status}`);
    return Buffer.from(response.data);
  } catch (error) {
    console.error('❌ Error downloading image:', error);
    throw error;
  }
}
