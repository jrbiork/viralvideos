import { SQSEvent, SQSRecord, SQSBatchResponse } from 'aws-lambda';
import { format } from 'date-fns';
import { SQSClient, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { generateVideoClip } from './video';
import { generateNarration, generateStoryBreakdown, Scene } from './narration';
import { generateSubtitles } from './subtitles';
import { combineVideoAndAudio } from './videoCombiner';
import { uploadToS3 } from './util/s3Uploader';

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
    // Create timestamp in format mm.dd.yy.hh.mm.ss using date-fns
    const timestamp = '08.07.25-14:30:45'; //format(new Date(), 'MM.dd.yy-HH:mm:ss');

    request.totalDuration = 30;
    request.sceneCount = 3;

    const sceneDuration = Math.floor(
      request.totalDuration / request.sceneCount,
    );

    // Step 1: Generate script/story breakdown using GPT-4
    const storyBreakdown = await generateStoryBreakdown(
      request.prompt,
      request.sceneCount,
      sceneDuration,
      request.totalDuration,
    );
    const { scenes, voiceToneInstruction } = storyBreakdown;

    if (!scenes || scenes.length === 0) {
      console.log('❌ Error: Failed to generate story breakdown');
      throw new Error('Failed to generate story breakdown');
    }

    // Step 2: Generate video clips (includes image generation)
    // Video generation is currently disabled for testing

    // Step 3: Generate audio narration with word-level timestamps
    const narrationResult = await generateNarration(
      scenes,
      request.userId,
      timestamp,
      voiceToneInstruction,
    );

    // Step 4: Generate subtitles based on word-level timestamps
    const subtitleKeys = await generateSubtitles(
      scenes,
      request.userId,
      timestamp,
      narrationResult.subtitles,
    );

    // Step 5: Combine video clips, audio, and subtitles
    const finalVideo = await combineVideoAndAudio(
      request.userId,
      timestamp,
      scenes,
    );

    if (!finalVideo) {
      console.log('❌ Error: Failed to combine video, audio, and subtitles');
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
