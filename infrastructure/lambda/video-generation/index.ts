// Updated: Added fluent-ffmpeg dependency support
import { SQSEvent, SQSRecord, SQSBatchResponse } from 'aws-lambda';

import { SQSClient, DeleteMessageCommand } from '@aws-sdk/client-sqs';

import { generateImage } from './image';
import { generateNarration, generateStoryBreakdown, Scene } from './narration';
import { generateSubtitles } from './subtitles';
import { addSceneIds } from './script';
import { uploadToS3, getObjectFromS3 } from './util/s3Uploader';
import { getImageUrls } from './util/imageUtils';
import { generateVideoEffects } from './util/videoEffects';
import { combineVideoAndAudio } from './videoCombiner';
import { broadcastMessage } from '../websocket-broadcast';

interface VideoGenerationRequest {
  prompt: string;
  userId: string;
  timestamp: string;
  totalDuration: number;
  sceneCount: number;
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

    // Send initial progress update
    await broadcastVideoProgress(
      request.userId,
      timestamp,
      'Video generation started',
    );

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

    await broadcastVideoProgress(
      request.userId,
      timestamp,
      'Story breakdown completed',
      {
        scenes,
      },
    );

    broadcastVideoProgress(request.userId, timestamp, 'Generating images');

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

    await broadcastVideoProgress(
      request.userId,
      timestamp,
      'Images generated',
      imageUrls,
    );

    console.log('🎥 No existing audio files found, generating new narration');

    // Step 3: Generate audio narration with word-level timestamps
    await broadcastVideoProgress(
      request.userId,
      timestamp,
      'Generating subtitles and audio',
    );

    const { subtitles, narrationUrls } = await generateNarration(
      scenes,
      request.userId,
      timestamp,
      voiceToneInstruction,
    );

    const subtitleUrls = await generateSubtitles(
      scenes,
      request.userId,
      timestamp,
      subtitles,
    );

    console.log('📝 Subtitle URLs generated:', subtitleUrls);
    console.log('🎤 Narration URLs generated:', narrationUrls);

    await broadcastVideoProgress(
      request.userId,
      timestamp,
      'Audio and Subtitles completed',
      {
        imageUrls,
        subtitleUrls,
        narrationUrls,
      },
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
    await broadcastVideoProgress(
      request.userId,
      timestamp,
      'Generating video effects',
    );

    const videoEffectsUrls = await generateVideoEffects(
      scenes,
      request.userId,
      timestamp,
    );

    await broadcastVideoProgress(
      request.userId,
      timestamp,
      'Video effects completed',
      {
        imageUrls,
        videoEffectsUrls,
      },
    );

    console.log('🎬 Video effects URLs generated:', videoEffectsUrls);

    // Step 6: Combine video clips, audio, and subtitles
    await broadcastVideoProgress(
      request.userId,
      timestamp,
      'Combining final video started',
    );

    const finalVideo = await combineVideoAndAudio(
      request.userId,
      timestamp,
      scenes,
    );

    await broadcastVideoProgress(
      request.userId,
      timestamp,
      'Final video combined',
    );

    if (!finalVideo) {
      throw new Error('Failed to combine video, audio, and subtitles');
    }

    // Step 6: Upload to S3
    const videoKey = await uploadToS3(finalVideo, request.userId, timestamp);

    // If this was triggered by SQS, delete the message from the queue
    if (record && process.env.VIDEO_QUEUE_URL) {
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: process.env.VIDEO_QUEUE_URL,
        ReceiptHandle: record.receiptHandle,
      });
      await sqs.send(deleteCommand);
    }

    // Broadcast video generation completed event
    await broadcastVideoGenerationCompleted(
      request.userId,
      timestamp,
      videoKey,
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
async function broadcastVideoProgress(
  userId: string,
  timestamp: string,
  message: string,
  data?: any,
): Promise<void> {
  try {
    const progressMessage = {
      action: 'video_generation_progress',
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
      console.log(`📡 WebSocket progress broadcast: ${message}`);
    } else {
      console.log(
        `📡 WebSocket not configured, skipping broadcast: ${message}`,
      );
    }
  } catch (error) {
    console.error('Error broadcasting video progress:', error);
    // Don't throw error to avoid breaking the main process
  }
}

// Helper function to broadcast subtitle files completed event
async function broadcastSubtitleFilesCompleted(
  userId: string,
  timestamp: string,
  subtitleUrls: Array<{ [key: string]: string }>,
): Promise<void> {
  try {
    const subtitleMessage = {
      action: 'subtitle_files_completed',
      data: {
        userId,
        timestamp,
        subtitleFiles: subtitleUrls,
      },
    };

    const domainName = process.env.WEBSOCKET_DOMAIN_NAME;
    const stage = process.env.WEBSOCKET_STAGE || 'prod';

    if (domainName) {
      await broadcastMessage(subtitleMessage, domainName, stage, userId);
      console.log(`📡 WebSocket subtitle files completed broadcast`);
    } else {
      console.log(`📡 WebSocket not configured, skipping subtitle broadcast`);
    }
  } catch (error) {
    console.error('Error broadcasting subtitle files completed:', error);
  }
}

// Helper function to broadcast media files completed event
async function broadcastMediaFilesCompleted(
  userId: string,
  timestamp: string,
  videoEffectsUrls: Array<{ [key: string]: string }>,
  imageUrls: Array<{ [key: string]: string }>,
): Promise<void> {
  try {
    const mediaMessage = {
      action: 'media_files_completed',
      data: {
        userId,
        timestamp,
        mediaFiles: {
          videoEffects: videoEffectsUrls,
          images: imageUrls,
        },
        assFiles: {}, // This will be populated by the frontend when needed
      },
    };

    const domainName = process.env.WEBSOCKET_DOMAIN_NAME;
    const stage = process.env.WEBSOCKET_STAGE || 'prod';

    if (domainName) {
      await broadcastMessage(mediaMessage, domainName, stage, userId);
      console.log(`📡 WebSocket media files completed broadcast`);
    } else {
      console.log(`📡 WebSocket not configured, skipping media broadcast`);
    }
  } catch (error) {
    console.error('Error broadcasting media files completed:', error);
  }
}

// Helper function to broadcast video generation completed event
async function broadcastVideoGenerationCompleted(
  userId: string,
  timestamp: string,
  videoKey: string,
): Promise<void> {
  try {
    const completionMessage = {
      action: 'video_generation_completed',
      data: {
        userId,
        timestamp,
        videoKey,
        message: 'Video generation completed successfully',
      },
    };

    const domainName = process.env.WEBSOCKET_DOMAIN_NAME;
    const stage = process.env.WEBSOCKET_STAGE || 'prod';

    if (domainName) {
      await broadcastMessage(completionMessage, domainName, stage, userId);
      console.log(`📡 WebSocket video generation completed broadcast`);
    } else {
      console.log(`📡 WebSocket not configured, skipping completion broadcast`);
    }
  } catch (error) {
    console.error('Error broadcasting video generation completed:', error);
  }
}
