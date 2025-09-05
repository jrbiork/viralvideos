import { GoogleGenAI } from '@google/genai';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

export interface Scene {
  description: string;
  duration: number;
  narration: string;
  id: number;
}

export async function generateNanoBananaImage(
  description: string,
  sceneIndex: number,
  userId: string,
  timestamp: string,
  seed: number,
  signedUrl?: boolean,
): Promise<string | null> {
  try {
    // Initialize Google GenAI
    const genAI = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!,
    });

    console.log(
      `🎨  genai - Calling Gemini Nano Banana for image generation in scene ${sceneIndex}...`,
    );
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

        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME!,
            Key: s3Key,
            Body: imageBuffer,
            ContentType: mime,
          }),
        );

        console.log('genai - Image uploaded to S3', s3Key);
      }
    }

    // Generate URL based on scenes count
    if (signedUrl) {
      // Return presigned URL for single scene
      const getObjectCommand = new GetObjectCommand({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME!,
        Key: s3Key,
      });

      const presignedUrl = await getSignedUrl(s3, getObjectCommand, {
        expiresIn: 36000, // 10 hours
      });

      console.log(
        '🖼️ genai - Generated and uploaded image with presigned URL:',
        presignedUrl,
      );

      return presignedUrl;
    }

    return '';
  } catch (error) {
    console.error(
      `❌ genai - Error in generateNanoBananaImage for scene ${sceneIndex}:`,
      error,
    );
    if (error && typeof error === 'object' && 'message' in error) {
      console.error('genai - Error message:', error.message);
      console.error('genai - Error name:', (error as any).name);
      console.error('genai - Error stack:', (error as any).stack);
    }
    throw error;
  }
}
