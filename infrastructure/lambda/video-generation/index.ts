import { SQSEvent, SQSRecord, SQSBatchResponse } from 'aws-lambda';
import { format } from 'date-fns';
import { SQSClient, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { generateVideoClip } from './video';
import { generateImage } from './image';
import { generateNarration, generateStoryBreakdown, Scene } from './narration';
import { generateSubtitles } from './subtitles';
import { combineVideoAndAudio } from './videoCombiner';
import { uploadToS3, getObjectFromS3 } from './util/s3Uploader';
import { getImageUrls } from './util/imageUtils';
import { generateVideoEffects } from './util/videoEffects';
import { fetchAudioFilesForTimestamp } from './util/audioUtils';
import { addSceneIds } from './script';

interface VideoGenerationRequest {
  prompt: string;
  userId: string;
  timestamp: string;
  totalDuration: number;
  sceneCount: number;
}

const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
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

    let scenes, voiceToneInstruction;

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

    // Check if there are already images generated in the s3 bucket for the timestamp
    let imageUrls = await getImageUrls(request.userId, timestamp);

    if (imageUrls.length > 0) {
      console.log('🎥 Images already generated for the timestamp:', imageUrls);
    } else {
      const seed = Math.floor(Math.random() * 1000000);

      // Step 2: Generate images for each scene in parallel
      console.log('🎨 Generating images for each scene in parallel...');

      try {
        const imagePromises = scenes.map(async (scene, i) => {
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
        imageUrls = await Promise.all(imagePromises);

        if (imageUrls.length === 0) {
          console.log('❌ Error: No images were generated');
          throw new Error('No images were generated');
        }

        console.log(
          `🎥 Generated ${imageUrls.length} images in parallel:`,
          imageUrls,
        );
      } catch (error) {
        console.error('❌ Failed to generate images:', error);
        throw new Error(`Failed to generate images: ${error}`);
      }
    }

    // console.log(`✅ Generated ${videoClips.length} video clips`);

    // Check if there are already audio files generated in the s3 bucket for the timestamp
    // const existingAudioResult = await fetchAudioFilesForTimestamp(
    //   request.userId,
    //   timestamp,
    // );

    // let narrationResult;
    // if (existingAudioResult.audioKeys.length === scenes.length) {
    //   console.log(
    //     '🎥 Audio files already generated for the timestamp, using existing audio',
    //   );
    //   narrationResult = existingAudioResult;
    // } else {
    console.log('🎥 No existing audio files found, generating new narration');

    // Step 3: Generate audio narration with word-level timestamps
    let narrationResult = await generateNarration(
      scenes,
      request.userId,
      timestamp,
      voiceToneInstruction,
    );
    // }

    console.log(
      '🎥 Audio narration generated:',
      JSON.stringify(narrationResult, null, 2),
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
    const videoEffectsKeys = await generateVideoEffects(
      scenes,
      request.userId,
      timestamp,
    );
    console.log('videoEffectsKeys:', videoEffectsKeys);

    // Step 5: Generate subtitles based on word-level timestamps
    const subtitleKeys = await generateSubtitles(
      scenes,
      request.userId,
      timestamp,
      narrationResult.subtitles,
    );

    // Step 6: Combine video clips, audio, and subtitles
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

    // If this was triggered by SQS, delete the message from the queue
    if (record && process.env.VIDEO_QUEUE_URL) {
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: process.env.VIDEO_QUEUE_URL,
        ReceiptHandle: record.receiptHandle,
      });
      await sqs.send(deleteCommand);
    }

    return {
      videoKey,
      message: 'Video generated successfully',
    };
  } catch (error) {
    console.error('Error in video generation:', error);
    throw error;
  }
}
