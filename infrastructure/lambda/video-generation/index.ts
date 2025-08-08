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
  console.log('🚀 Lambda function started - SQS only handler');

  return await handleSQSEvent(event);
};

async function handleSQSEvent(event: SQSEvent): Promise<SQSBatchResponse> {
  console.log('📨 Processing SQS event with', event.Records.length, 'records');

  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      console.log('📝 Processing record:', record.messageId);

      // Parse the message body
      const request: VideoGenerationRequest = JSON.parse(record.body);
      console.log('✅ Parsed request:', request);

      // Process the video generation with ordered steps
      await processVideoGeneration(request, record);

      console.log('✅ Successfully processed record:', record.messageId);
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
    console.log('AWS_REGION:', process.env.AWS_REGION);
    console.log('RUNWAY_API_KEY set:', !!process.env.RUNWAY_API_KEY);
    console.log('OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY);

    console.log('✅ All environment variables are set');

    // Create timestamp in format mm.dd.yy.hh.mm.ss using date-fns
    const timestamp = '08.07.25-14:30:45'; //format(new Date(), 'MM.dd.yy-HH:mm:ss');
    console.log('🕐 Generated timestamp:', timestamp);

    request.totalDuration = 30;
    request.sceneCount = 3;

    const sceneDuration = Math.floor(
      request.totalDuration / request.sceneCount,
    );

    console.log('🎬 Starting video generation for prompt:', request.prompt);
    console.log('⏱️  Video duration:', request.totalDuration, 'seconds');
    console.log('🎬 Number of scenes:', request.sceneCount);

    // Step 1: Generate script/story breakdown using GPT-4
    console.log('📖 Step 1: Generating story breakdown...');
    const storyBreakdown = await generateStoryBreakdown(
      request.prompt,
      request.sceneCount,
      sceneDuration,
      request.totalDuration,
    );
    const { scenes, voiceToneInstruction } = storyBreakdown;
    console.log('✅ Step 1 completed: Generated scenes:', scenes);
    console.log('🎤 Voice tone instruction:', voiceToneInstruction);

    if (!scenes || scenes.length === 0) {
      console.log('❌ Error: Failed to generate story breakdown');
      throw new Error('Failed to generate story breakdown');
    }

    // Step 2: Generate video clips (includes image generation)
    console.log('🎬 Step 2: Generating video clips from scenes...');
    // const videoKeys: string[] = [];
    // for (let i = 0; i < scenes.length; i++) {
    //   const scene = scenes[i];
    //   console.log(`🎬 Generating video for scene ${i}: ${scene.description}`);

    //   const videoKey = await generateVideoClip(
    //     scene.description,
    //     scene.duration,
    //     i,
    //     request.userId,
    //     timestamp,
    //     Math.floor(Math.random() * 1000000), // Random seed
    //     scene.id,
    //   );
    //   videoKeys.push(videoKey);
    //   console.log(`✅ Generated video for scene ${i}: ${videoKey}`);
    // }
    console.log('✅ Step 2 completed: Generated all video clips');

    // Step 3: Generate audio narration with word-level timestamps
    console.log(
      '🎤 Step 3: Generating narration audio with word-level timestamps...',
    );
    const narrationResult = await generateNarration(
      scenes,
      request.userId,
      timestamp,
      voiceToneInstruction,
    );
    console.log('✅ Step 3 completed: Generated audio and subtitle data');

    // Step 4: Generate subtitles based on word-level timestamps
    console.log('📝 Step 4: Generating subtitles with word-level timing...');
    const subtitleKeys = await generateSubtitles(
      scenes,
      request.userId,
      timestamp,
      narrationResult.subtitles,
    );
    console.log('✅ Step 4 completed: Generated subtitle keys:', subtitleKeys);

    // Step 5: Combine video clips, audio, and subtitles
    console.log('🎬 Step 5: Combining video, audio, and subtitles...');
    const finalVideo = await combineVideoAndAudio(
      request.userId,
      timestamp,
      scenes,
    );
    console.log('✅ Step 5 completed: Final video generated:', finalVideo);

    if (!finalVideo) {
      console.log('❌ Error: Failed to combine video, audio, and subtitles');
      throw new Error('Failed to combine video, audio, and subtitles');
    }

    // Step 6: Upload to S3
    console.log('☁️ Step 6: Uploading to S3...');
    const videoKey = await uploadToS3(finalVideo, request.userId, timestamp);
    console.log('✅ Step 6 completed: Uploaded to S3:', videoKey);

    // If this was triggered by SQS, delete the message from the queue
    if (record && process.env.VIDEO_QUEUE_URL) {
      console.log('🗑️ Deleting message from SQS queue:', record.messageId);
      const deleteCommand = new DeleteMessageCommand({
        QueueUrl: process.env.VIDEO_QUEUE_URL,
        ReceiptHandle: record.receiptHandle,
      });
      await sqs.send(deleteCommand);
      console.log('✅ Message deleted from SQS queue');
    }

    console.log('🎉 Video generation completed successfully');
    return {
      videoKey,
      message: 'Video generated successfully',
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

    throw error;
  }
}
