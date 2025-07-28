import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import axios from 'axios';
import OpenAI from 'openai';
import { RunwayML } from '@runwayml/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface VideoGenerationRequest {
  prompt: string;
  userId: string;
  timestamp: string;
  duration: number;
  sceneCount: number;
}

interface Scene {
  description: string;
  duration: number;
  narration: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  console.log('🚀 Lambda function started');
  console.log('📄 Event received:', JSON.stringify(event, null, 2));

  try {
    // Log environment variables (without sensitive values)
    console.log('🔍 Environment variables check:');
    console.log('AWS_REGION:', process.env.AWS_REGION);
    console.log('VIDEO_BUCKET_NAME:', process.env.VIDEO_BUCKET_NAME);
    console.log(
      'VIDEO_PARTS_BUCKET_NAME:',
      process.env.VIDEO_PARTS_BUCKET_NAME,
    );
    console.log('RUNWAY_API_KEY set:', !!process.env.RUNWAY_API_KEY);
    console.log('OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY);

    // Validate environment variables
    if (!process.env.RUNWAY_API_KEY) {
      console.error('❌ RUNWAY_API_KEY is not set');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'RUNWAY_API_KEY is not configured' }),
      };
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OPENAI_API_KEY is not set');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }),
      };
    }

    if (!process.env.VIDEO_BUCKET_NAME) {
      console.error('❌ VIDEO_BUCKET_NAME is not set');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'VIDEO_BUCKET_NAME is not configured' }),
      };
    }

    if (!process.env.VIDEO_PARTS_BUCKET_NAME) {
      console.error('❌ VIDEO_PARTS_BUCKET_NAME is not set');
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'VIDEO_PARTS_BUCKET_NAME is not configured',
        }),
      };
    }

    console.log('✅ All environment variables are set');

    let request: VideoGenerationRequest;

    // Handle different event formats
    if (event.body) {
      // API Gateway format - body is a JSON string
      if (typeof event.body === 'string') {
        request = JSON.parse(event.body);
      } else {
        // Direct Lambda invocation - body is already an object
        request = event.body as VideoGenerationRequest;
      }
    } else {
      // Direct Lambda invocation - payload is the entire event
      request = event as any;
    }

    console.log('✅ Request parsed:', {
      prompt: request.prompt?.substring(0, 50) + '...',
      userId: request.userId,
      timestamp: request.timestamp,
    });
    console.log('🔍 Full request object:', request);

    if (!request.prompt) {
      console.log('❌ Error: Prompt is required');
      console.log('🔍 Request object keys:', Object.keys(request));
      console.log('🔍 Request prompt value:', request.prompt);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Prompt is required' }),
      };
    }

    console.log('🎬 Starting video generation for prompt:', request.prompt);
    console.log('⏱️  Video duration:', request.duration, 'seconds');
    console.log('🎬 Number of scenes:', request.sceneCount);

    // Step 1: Generate story breakdown using GPT-4
    console.log('📖 Generating story breakdown...');
    // TODO: Uncomment this once we have a dynamic story breakdown
    let scenes; // = await generateStoryBreakdown(request.prompt, request.sceneCount, request.duration);
    console.log('✅ Generated scenes:', scenes);

    // Generate dynamic scenes based on parameters
    const sceneDuration = Math.floor(request.duration / request.sceneCount);
    // TODO: Remove this once we have a dynamic story breakdown
    scenes = [
      {
        description:
          'A wide shot of the ocean, the camera slowly zooms in on the sun setting in the horizon. The sunlight is reflected on the water.',
        duration: sceneDuration,
        narration:
          'As we begin, take a moment to gaze upon the vast open ocean. Let the warm hues of the setting sun wash over you.',
      },
      // {
      //   description:
      //     'Close up shot of the waves gently lapping against the shore. The sun is now halfway below the horizon, casting long shadows.',
      //   duration: 10,
      //   narration:
      //     'Focus on the rhythmic ebb and flow of the waves, mirroring the rhythm of your own breath.',
      // },
      // {
      //   description:
      //     'The camera pulls back to reveal a silhouette of a person meditating on the beach. The sun is now just a glimmer on the horizon.',
      //   duration: 10,
      //   narration:
      //     'Imagine yourself sitting at the edge of the ocean, grounding yourself in this peaceful moment.',
      // },
      // {
      //   description:
      //     'Aerial view of the meditating person with the twilight colors of the sky and ocean spread out around them.',
      //   duration: 10,
      //   narration:
      //     'From above, see yourself as part of this vast universe, connected with the nature around you.',
      // },
      // {
      //   description:
      //     "Close up shot of the meditating person's face, serene and calm. The last sunlight is reflected in their eyes.",
      //   duration: 10,
      //   narration:
      //     'Feel a sense of peace and calm wash over you. Embrace the tranquility within.',
      // },
      // {
      //   description:
      //     'Fade out to a black screen with the sound of waves continuing in the background.',
      //   duration: 10,
      //   narration:
      //     'As we conclude, keep this serene image in mind. Carry this peace with you throughout your day.',
      // },
    ];

    if (!scenes || scenes.length === 0) {
      console.log('❌ Error: Failed to generate story breakdown');
      throw new Error('Failed to generate story breakdown');
    }

    // Step 2: Generate video clips for each scene
    console.log('🎥 Generating video clips...');
    const videoClips: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      console.log(`🎬 Generating video for scene ${i + 1}:`, scene.description);

      try {
        const videoClip = await generateVideoClip(
          scene.description,
          scene.duration,
          i,
          request.userId,
        );
        videoClips.push(videoClip);
        console.log(`✅ Scene ${i + 1} video generated:`, videoClip);
      } catch (error) {
        console.error(`❌ Failed to generate video for scene ${i + 1}:`, error);
        throw new Error(
          `Failed to generate video for scene ${i + 1}: ${error}`,
        );
      }
    }

    if (videoClips.length === 0) {
      console.log('❌ Error: No video clips were generated');
      throw new Error('No video clips were generated');
    }

    console.log(`✅ Generated ${videoClips.length} video clips`);

    // Step 3: Generate narration audio
    console.log('🎤 Generating narration audio...');
    const narrationAudio = await generateNarration(scenes);
    console.log('✅ Generated narration audio:', narrationAudio);

    // Step 4: Combine video clips and audio
    console.log('🎬 Combining video and audio...');
    const finalVideo = await combineVideoAndAudio(
      videoClips,
      narrationAudio,
      scenes,
    );
    console.log('✅ Final video generated:', finalVideo);

    if (!finalVideo) {
      console.log('❌ Error: Failed to combine video and audio');
      throw new Error('Failed to combine video and audio');
    }

    // Step 5: Upload to S3
    console.log('☁️ Uploading to S3...');
    const videoKey = `videos/${request.userId}/${Date.now()}/final-video.mp4`;
    await uploadToS3(finalVideo, videoKey);
    console.log('✅ Uploaded to S3:', videoKey);

    console.log('🎉 Video generation completed successfully');
    return {
      statusCode: 200,
      body: JSON.stringify({
        videoKey,
        message: 'Video generated successfully',
      }),
    };
  } catch (error) {
    console.error('💥 Error in video generation:', error);
    console.error(
      'Error stack:',
      error instanceof Error ? error.stack : 'No stack trace',
    );
    console.error(
      'Error message:',
      error instanceof Error ? error.message : 'Unknown error',
    );

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to generate video',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

async function generateStoryBreakdown(
  prompt: string,
  sceneCount: number,
  totalDuration: number,
): Promise<Scene[]> {
  console.log('🤖 Calling OpenAI for story breakdown...');
  console.log(
    `📊 Parameters: ${sceneCount} scenes, ${totalDuration} seconds total`,
  );

  const sceneDuration = Math.floor(totalDuration / sceneCount);
  console.log(`⏱️  Each scene will be ${sceneDuration} seconds long`);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a video script writer. Break down the given prompt into ${sceneCount} scenes, each ${sceneDuration} seconds long, for a ${totalDuration}-second vertical video. 
          Each scene should have a clear visual description and narration text. Return as JSON array with objects containing:
          - description: visual scene description for video generation
          - duration: ${sceneDuration} (seconds)
          - narration: text to be spoken in this scene
          
          If only 1 scene is requested, create a single comprehensive scene that covers the entire duration.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    console.log('📄 OpenAI response content:', content);

    if (!content) {
      console.log('❌ Error: OpenAI did not return content');
      throw new Error('Failed to generate story breakdown');
    }

    const scenes = JSON.parse(content);
    console.log('✅ Story breakdown parsed successfully');
    return scenes;
  } catch (error) {
    console.error('❌ Error in generateStoryBreakdown:', error);
    throw error;
  }
}

async function generateVideoClip(
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
    const imageGeneration = await runway.textToImage.create({
      model: 'gen4_image',
      promptText: description,
      ratio: '1080:1920', // Vertical format (9:16)
      seed: Math.floor(Math.random() * 1000000),
    });

    console.log('📡 Text-to-image generation started');
    console.log('🆔 Image Generation ID:', imageGeneration.id);

    // Wait for the image generation to complete
    console.log('⏳ Waiting for image generation to complete...');
    const imageResult = await (imageGeneration as any).waitForTaskOutput();

    console.log('✅ Image generation completed');
    console.log('📄 Image result:', imageResult);

    if (
      !imageResult.output ||
      !imageResult.output.images ||
      imageResult.output.images.length === 0
    ) {
      console.log('❌ Error: Runway SDK did not return an image');
      console.log('Full image result:', imageResult);
      throw new Error('Runway SDK did not return an image');
    }

    const imageUrl = imageResult.output.images[0].uri;
    console.log('🖼️ Generated image URL:', imageUrl);

    // Step 2: Generate video from the image using image-to-video API
    console.log('🎬 Generating video from image...');
    const videoGeneration = await runway.imageToVideo.create({
      model: 'gen4_turbo',
      promptImage: [
        {
          position: 'first',
          uri: imageUrl,
        },
      ],
      ratio: '720:1280', // Vertical format (9:16)
      duration: Math.min(duration, 10) as 5 | 10, // Runway supports max 10 seconds
      promptText: description,
      seed: Math.floor(Math.random() * 1000000),
    });

    console.log('📡 Image-to-video generation started');
    console.log('🆔 Video Generation ID:', videoGeneration.id);

    // Wait for the video generation to complete
    console.log('⏳ Waiting for video generation to complete...');
    const videoResult = await (videoGeneration as any).waitForTaskOutput();

    console.log('✅ Video generation completed');
    console.log('📄 Video result:', videoResult);

    if (!videoResult.output || !videoResult.output.videoUrl) {
      console.log('❌ Error: Runway SDK did not return a video URL');
      console.log('Full video result:', videoResult);
      throw new Error('Runway SDK did not return a video URL');
    }

    const videoUrl = videoResult.output.videoUrl;
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

    // Also save to temp file for local processing
    const tempPath = path.join(os.tmpdir(), `scene-${sceneIndex}.mp4`);
    fs.writeFileSync(tempPath, videoBuffer);
    console.log(`💾 Saved video to: ${tempPath}`);

    return tempPath;
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

async function generateNarration(scenes: Scene[]): Promise<string> {
  console.log('🎤 Generating narration from scenes...');
  try {
    const fullNarration = scenes.map((scene) => scene.narration).join(' ');
    console.log('📝 Full narration text:', fullNarration);

    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: fullNarration,
    });

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    console.log(`✅ Generated audio, size: ${audioBuffer.length} bytes`);

    const tempPath = path.join(os.tmpdir(), 'narration.mp3');
    fs.writeFileSync(tempPath, audioBuffer);
    console.log(`💾 Saved audio to: ${tempPath}`);

    return tempPath;
  } catch (error) {
    console.error('❌ Error in generateNarration:', error);
    throw error;
  }
}

async function combineVideoAndAudio(
  videoClips: string[],
  audioPath: string,
  scenes: Scene[],
): Promise<string> {
  console.log('🎬 Combining video and audio...');
  console.log('📹 Video clips:', videoClips);
  console.log('🎵 Audio path:', audioPath);

  // This is a simplified version. In production, you'd use FFmpeg to:
  // 1. Concatenate video clips
  // 2. Add audio track
  // 3. Add subtitles
  // 4. Export as 1080x1920 MP4

  // For demo purposes, we'll just return the first video clip
  // In production, implement proper video processing with FFmpeg
  console.log('✅ Using first video clip as final video (simplified)');
  return videoClips[0];
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

async function uploadToS3(filePath: string, key: string): Promise<void> {
  try {
    console.log(`📁 Reading file: ${filePath}`);
    const fileBuffer = fs.readFileSync(filePath);
    console.log(`📊 File size: ${fileBuffer.length} bytes`);

    console.log(`☁️ Uploading to S3: ${process.env.VIDEO_BUCKET_NAME}/${key}`);
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.VIDEO_BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: 'video/mp4',
      }),
    );
    console.log('✅ Upload successful');
  } catch (error) {
    console.error('❌ Error uploading to S3:', error);
    throw error;
  }
}
