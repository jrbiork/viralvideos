// Updated: Added fluent-ffmpeg dependency support
import { SQSEvent, SQSRecord, SQSBatchResponse } from 'aws-lambda';

import { SQSClient, DeleteMessageCommand } from '@aws-sdk/client-sqs';

import { generateImage } from './image';
import { generateNarration, generateStoryBreakdown, Scene } from './narration';
import { generateSubtitles, generateSubtitleContent } from './subtitles';
import { addSceneIds } from './script';
import { uploadToS3, getObjectFromS3 } from './util/s3Uploader';
import { getImageUrls } from './util/imageUtils';
import { generateVideoEffects, getVideoEffectUrls } from './util/videoEffects';
import { combineVideoAndAudio } from './videoCombiner';
import { broadcastMessage } from '../websocket-broadcast';

interface VideoGenerationRequest {
  prompt?: string;
  userId: string;
  timestamp: string;
  totalDuration: number;
  sceneCount: number;
  step: number;
}

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  console.log(
    '🔄 Video Generation Lambda started - Updated with fluent-ffmpeg support',
  );
  return await handleSQSEvent(event);
};

async function handleSQSEvent(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      // Parse the message body
      const request: VideoGenerationRequest = JSON.parse(record.body);

      // Process the video generation with ordered steps
      await processVideoGeneration(request, record);
    } catch (error) {
      console.error('❌ Error processing record:', record.messageId, error);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return {
    batchItemFailures,
  };
}

async function processVideoGeneration(
  request: VideoGenerationRequest,
  record?: SQSRecord,
): Promise<any> {
  try {
    console.log('processVideoGeneration:', request);

    // Use timestamp from request body
    const timestamp = request.timestamp;

    const sceneDuration = Math.floor(
      request.totalDuration / request.sceneCount,
    );

    // Check if there is already script generated in the s3 bucket for the timestamp
    const scriptKey = `${request.userId}/${timestamp}.script.txt`;
    const existingScript = await getObjectFromS3(scriptKey);

    let scenes: Scene[] = [];
    let voiceToneInstruction: string = '';

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

      // Step 1: Generate script/story breakdown using GPT-4

      const storyBreakdown = await generateStoryBreakdown(
        request.prompt,
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

    await broadcastProgress(
      'script_created',
      request.userId,
      timestamp,
      {
        scenes,
      },
      'Story breakdown completed',
    );

    // Check if there are already images generated in the s3 bucket for the timestamp
    let imageUrls = await getImageUrls(request.userId, timestamp);

    if (imageUrls.length > 0) {
      console.log('🎥 Images already generated for the timestamp:', imageUrls);
    } else {
      const seed = Math.floor(Math.random() * 1000000);

      // Step 2: Generate images for each scene in parallel
      console.log('🎨 Generating images for each scene in parallel...');

      try {
        const imagePromises = scenes.map(async (scene: any, i: number) => {
          console.log(
            `🎨 Generating image for scene ${i + 1}:`,
            scene.description,
          );

          const imageUrl = await generateImage(
            scene.description,
            i,
            request.userId,
            timestamp,
            seed,
            scene.id,
          );

          console.log(`✅ Scene ${i + 1} image generated:`, imageUrl);
          return imageUrl;
        });

        // Wait for all images to be generated
        const generatedImageUrls = await Promise.all(imagePromises);

        if (generatedImageUrls.length === 0) {
          console.log('❌ Error: No images were generated');
          throw new Error('No images were generated');
        }

        // Convert generated image URLs to the new format
        imageUrls = generatedImageUrls.map((imageUrl, index) => {
          const filename = `${timestamp}.scene-${scenes[index].id}.jpg`;
          return { [filename]: imageUrl };
        });

        console.log(
          `🎥 Generated ${imageUrls.length} images in parallel:`,
          imageUrls,
        );
      } catch (error) {
        console.error('❌ Failed to generate images:', error);
        throw new Error(`Failed to generate images: ${error}`);
      }
    }

    console.log('🖼️ Image URLs generated:', imageUrls);

    await broadcastProgress(
      'image_created',
      request.userId,
      timestamp,
      imageUrls,
      'Images generated',
    );

    console.log('🎥 No existing audio files found, generating new narration');

    // Step 3: Generate audio narration with word-level timestamps
    const { subtitles, narrationUrls } = await generateNarration(
      scenes,
      request.userId,
      timestamp,
      voiceToneInstruction,
    );

    const subtitleContent = await generateSubtitleContent(
      scenes,
      request.userId,
      timestamp,
      subtitles,
    );

    console.log('📝 Subtitle content generated:', subtitleContent);
    console.log('🎤 Narration URLs generated:', narrationUrls);

    await broadcastProgress(
      'audio_subtitle_created',
      request.userId,
      timestamp,
      {
        subtitles: subtitles.map((subtitle) => ({
          [`${timestamp}.scene-${subtitle.sceneIndex}.subtitle`]: {
            text: subtitle.fullText,
          },
        })),
        subtitleContent,
        narrationUrls,
      },
      'Audio and Subtitles completed',
    );

    // Step 4: Generate video clips from images
    // console.log('🎥 Generating video clips from images...');
    // const videoClips: string[] = [];

    // for (let i = 0; i < scenes.length; i++) {
    //   const scene = scenes[i];
    //   const imageUrl = imageUrls[i];
    //   console.log(
    //     `🎬 Generating video for scene ${i + 1} from image:`,
    //     scene.description,
    //   );
    //   try {
    //     const videoClip = await generateVideoClip(
    //       scene.description,
    //       scene.duration,
    //       i,
    //       request.userId,
    //       timestamp,
    //       seed,
    //       scene.id,
    //       imageUrl,
    //     );
    //     videoClips.push(videoClip);
    //     console.log(`✅ Scene ${i + 1} video generated:`, videoClip);
    //   } catch (error) {
    //     console.error(`❌ Failed to generate video for scene ${i + 1}:`, error);
    //     throw new Error(
    //       `Failed to generate video for scene ${i + 1}: ${error}`,
    //     );
    //   }
    // }

    // if (videoClips.length === 0) {
    //   console.log('❌ Error: No video clips were generated');
    //   throw new Error('No video clips were generated');
    // }

    // console.log(`✅ Generated ${videoClips.length} video clips`);

    // Step 4: Generate video effects and camera movement using the images

    // check if there are already all the video effects generated in the s3 bucket for the timestamp
    let videoEffectsUrls = [];

    videoEffectsUrls = await getVideoEffectUrls(
      request.userId,
      timestamp,
      scenes,
    );

    await broadcastProgress(
      'video_scene_created',
      request.userId,
      timestamp,
      {
        videoEffectsUrls,
      },
      'Video effects completed',
    );

    console.log('🎬 Video effects URLs generated:', videoEffectsUrls);

    // Step 6: Combine video clips, audio, and subtitles
    // lets add a request.step param that will only run this combineVideoAudio if step === 3
    if (request.step === 3) {
      const finalVideo = await combineVideoAndAudio(
        request.userId,
        timestamp,
        scenes,
      );

      if (!finalVideo) {
        throw new Error('Failed to combine video, audio, and subtitles');
      }

      // Step 6: Upload to S3
      const videoKey = await uploadToS3(finalVideo, request.userId, timestamp);
    }

    // If this was triggered by SQS, delete the message from the queue
    if (record && process.env.VIDEO_QUEUE_URL) {
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: process.env.VIDEO_QUEUE_URL,
        ReceiptHandle: record.receiptHandle,
      });
      await sqs.send(deleteCommand);
    }

    // Broadcast video generation completed event
    await broadcastProgress(
      'video_completed',
      request.userId,
      timestamp,
      null,
      'Video generation completed',
    );

    return {
      message: 'Video generated successfully',
    };
  } catch (error) {
    console.error('Error in video generation:', error);
    throw error;
  }
}

// Helper function to broadcast video generation progress via WebSocket
async function broadcastProgress(
  action:
    | 'script_created'
    | 'image_created'
    | 'audio_subtitle_created'
    | 'video_scene_created'
    | 'video_completed',
  userId: string,
  timestamp: string,
  data?: any,
  message?: string,
): Promise<void> {
  try {
    const progressMessage = {
      action,
      data: {
        userId,
        timestamp,
        message,
        ...data,
      },
    };

    // Get the WebSocket domain and stage from environment variables
    const domainName = process.env.WEBSOCKET_DOMAIN_NAME;
    const stage = process.env.WEBSOCKET_STAGE || 'prod';

    if (domainName) {
      await broadcastMessage(progressMessage, domainName, stage, userId);
      console.log(`📡 WebSocket progress broadcast: ${action} - ${message}`);
    } else {
      console.log(
        `📡 WebSocket not configured, skipping broadcast: ${action} - ${message}`,
      );
    }
  } catch (error) {
    console.error('Error broadcasting video progress:', error);
    // Don't throw error to avoid breaking the main process
  }
}
