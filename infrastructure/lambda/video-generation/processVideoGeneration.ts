import { SQSRecord } from 'aws-lambda';
import { SQSClient, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { generateImage } from '../utils/image';
import { generateNarration } from '../utils/audio';
import { generateSubtitles } from '../utils/subtitles';
import { addSceneIds } from '../utils/script';
import { generateStoryBreakdown, Scene } from '../utils/script';
import { uploadToS3, getObjectFromS3 } from '../utils/s3Uploader';
import { checkAudioCaptionExists } from './util/audioUtils';
import { getImageUrls } from '../utils/imageUtils';
import { generateNanoBananaImage } from '../utils/imageNanoBanana';

// Constants
const DEFAULT_VOICE = 'ash';
const DEFAULT_LANGUAGE = 'en';
import { getVideoEffectUrls } from '../utils/videoEffects';
import {
  createManifest,
  getManifest,
  hydrateManifest,
} from '../utils/manifestUtils';
import { broadcastProgress } from '../utils/broadcastProgress';

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export interface VideoGenerationRequest {
  type?:
    | 'generate-video'
    | 'save-image'
    | 'animate-image'
    | 'combine-video'
    | 'create-scene'
    | 'regenerate-scene';
  prompt?: string;
  userId: string;
  timestamp: string;
  totalDuration: number;
  sceneCount: number;
  step: number;
  voice?: string;
  language?: string;
}

export async function processVideoGeneration(
  request: VideoGenerationRequest,
  record?: SQSRecord,
): Promise<any> {
  try {
    console.log('processVideoGeneration:', request);

    console.log('request.voice:', request.voice);

    // Use timestamp
    const timestamp = request.timestamp;

    const sceneDuration = Math.floor(
      request.totalDuration / request.sceneCount,
    );

    let scenes: Scene[] = [];
    let voiceToneInstruction: string = '';

    // check if the video is already generated
    let manifest = await getManifest(request.userId, request.timestamp);

    if (manifest) {
      console.log('🎥 Video already generated, skipping video generation');
      const manifestHydrated = await hydrateManifest(manifest);
      await broadcastProgress(
        'preview_completed',
        request.userId,
        request.timestamp,
        { manifest: manifestHydrated },
        'Video generated successfully',
      );
      return {
        message: 'Video already generated',
        manifest: manifestHydrated,
      };
    }

    // Check if there is already script generated in the s3 bucket for the timestamp
    const scriptKey = `${request.userId}/${timestamp}.script.txt`;
    const existingScript = await getObjectFromS3(scriptKey);

    // Step 1: Generate script/story breakdown using GPT-4
    if (existingScript) {
      console.log(
        '🎥 Script already generated for the timestamp, using existing script',
      );
      scenes = addSceneIds(existingScript.scenes);
      voiceToneInstruction = existingScript.voiceToneInstruction;
    } else {
      console.log(
        '🎥 No existing script found, generating new story breakdown',
      );

      if (!request.prompt) {
        console.log('❌ Error: No prompt provided');
        throw new Error('No prompt provided');
      }

      const storyBreakdown = await generateStoryBreakdown(
        request.prompt!,
        request.sceneCount,
        sceneDuration,
        request.totalDuration,
        request.userId,
        timestamp,
      );
      scenes = storyBreakdown.scenes;
      voiceToneInstruction = storyBreakdown.voiceToneInstruction;
    }

    if (!scenes || scenes.length === 0) {
      console.log('❌ Error: Failed to get or generate story breakdown');
      throw new Error('Failed to get or generate story breakdown');
    }

    console.log('🎥 Story breakdown generated:', scenes);

    // Step 2: Generate images for each scene in parallel
    // Check if there are already images generated in the s3 bucket for the timestamp
    let imageUrls = await getImageUrls(request.userId, timestamp);

    if (imageUrls.length > 0) {
      console.log('🎥 Images already generated for the timestamp:', imageUrls);
    } else {
      const seed = Math.floor(Math.random() * 1000000);

      console.log('🎨 Generating images for each scene in parallel...');

      try {
        const imagePromises = scenes.map(async (scene: any, i: number) => {
          console.log(
            `🎨 Generating image for scene ${i + 1}:`,
            scene.description,
          );

          const result = await generateNanoBananaImage(
            scene.description,
            scene.id,
            request.userId,
            timestamp,
            seed,
          );

          console.log(`✅ Scene ${i + 1} image generated: done`);
          return result;
        });

        // Wait for all images to be generated using allSettled for better error handling
        console.log('⏳ Waiting for all image generation to complete...');
        const results = await Promise.allSettled(imagePromises);

        // Log results and handle failures
        const successful = results.filter(
          (result) => result.status === 'fulfilled',
        );
        const failed = results.filter((result) => result.status === 'rejected');

        console.log(
          `✅ Image generation results: ${successful.length} successful, ${failed.length} failed`,
        );

        // Log failed promises with detailed error info
        failed.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.error(
              `❌ Scene ${index} image generation failed:`,
              result.reason,
            );
          }
        });

        // Continue processing even if some images failed
        if (successful.length === 0) {
          throw new Error('All image generation attempts failed');
        }

        console.log(
          `🎨 Successfully generated ${successful.length} out of ${results.length} images`,
        );

        // if (generatedImageUrls.length === 0) {
        //   console.log('❌ Error: No images were generated');
        //   throw new Error('No images were generated');
        // }

        // // upload imageUrls to s3 using uploadImageToS3
        // const uploadPromises = generatedImageUrls.map((imageUrl, i) =>
        //   uploadImageToS3(imageUrl, request.userId, timestamp, scenes[i].id),
        // );
        // await Promise.all(imagePromises);

        console.log('🖼️ Images uploaded to S3');
      } catch (error) {
        console.error('❌ Failed to generate images:', error);
      }
    }

    // check if all together if .mp3, .subtitle.json, .ass files are already exists in the s3 bucket and return boolean
    const audioCaptionFilesExist = await checkAudioCaptionExists(
      request.userId,
      timestamp,
    );
    if (audioCaptionFilesExist) {
      console.log(
        '🎥 Audio, subtitle, and ass files already generated for the timestamp:',
        audioCaptionFilesExist,
      );
    } else {
      console.log(
        '🎥 No existing audio, subtitle, and ass files found, generating new narration',
      );

      // Step 3: Generate audio files with word-level timestamps
      const { subtitles } = await generateNarration(
        scenes,
        request.userId,
        timestamp,
        voiceToneInstruction,
        request.voice || DEFAULT_VOICE,
        request.language || DEFAULT_LANGUAGE,
      );

      // update scenes duration
      scenes.forEach((scene, i) => {
        scene.duration = subtitles[i].duration || 10;
        console.log('subtitles[i].duration:', subtitles[i].duration);
      });

      // Step 4: Generate subtitle file
      await generateSubtitles(scenes, request.userId, timestamp, subtitles);
    }

    console.log(
      '🎥 Scenes before creating manifest:',
      JSON.stringify(scenes, null, 2),
    );

    // Create manifest and upload to s3
    await createManifest(
      request.userId,
      timestamp,
      scenes,
      request.totalDuration,
      voiceToneInstruction,
      request.voice || DEFAULT_VOICE,
      request.language || DEFAULT_LANGUAGE,
    );

    manifest = await getManifest(request.userId, request.timestamp);

    let manifestHydrated = await hydrateManifest(manifest);

    await broadcastProgress(
      'audio_subtitle_created',
      request.userId,
      timestamp,
      {
        manifest: manifestHydrated,
      },
      'Audio and Subtitles completed',
    );

    // Step 4: Generate camera movements from image
    // check if there are already all the video effects generated in the s3 bucket for the timestamp
    await getVideoEffectUrls(request.userId, timestamp, scenes);

    console.log('🎬 Video effects URLs generated:');
    console.log(
      '🎬 Manifest preview completed:',
      JSON.stringify(manifest, null, 2),
    );

    manifestHydrated = await hydrateManifest(manifest);

    await broadcastProgress(
      'preview_completed',
      request.userId,
      timestamp,
      { manifest: manifestHydrated },
      'Video generated successfully',
    );

    // If this was triggered by SQS, delete the message from the queue
    if (record && process.env.VIDEO_QUEUE_URL) {
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: process.env.VIDEO_QUEUE_URL,
        ReceiptHandle: record.receiptHandle,
      });
      await sqs.send(deleteCommand);
    }

    return {
      message: 'Preview generated successfully',
    };
  } catch (error) {
    console.error('Error in video generation:', error);
    throw error;
  }
}
