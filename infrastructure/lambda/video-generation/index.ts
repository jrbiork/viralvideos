import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { format } from 'date-fns';
import { generateVideoClip } from './video';
import { generateNarration, generateStoryBreakdown, Scene } from './narration';
import { generateSubtitles } from './subtitles';
import { combineVideoAndAudio, uploadToS3 } from './combineVideo';

interface VideoGenerationRequest {
  prompt: string;
  userId: string;
  timestamp: string;
  totalDuration: number;
  sceneCount: number;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  console.log('🚀 Lambda function started');

  try {
    console.log('AWS_REGION:', process.env.AWS_REGION);
    console.log('RUNWAY_API_KEY set:', !!process.env.RUNWAY_API_KEY);
    console.log('OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY);

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

    if (!request.prompt) {
      console.log('❌ Error: Prompt is required');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Prompt is required' }),
      };
    }

    // Create timestamp in format mm.dd.yy.hh.mm.ss using date-fns
    const timestamp = '08.07.25-14:30:45'; //format(new Date(), 'MM.dd.yy-HH:mm:ss');
    console.log('🕐 Generated timestamp:', timestamp);

    request.totalDuration = 15;
    request.sceneCount = 3;

    const sceneDuration = Math.floor(
      request.totalDuration / request.sceneCount,
    );

    console.log('🎬 Starting video generation for prompt:', request.prompt);
    console.log('⏱️  Video duration:', request.totalDuration, 'seconds');
    console.log('🎬 Number of scenes:', request.sceneCount);

    // Step 1: Generate story breakdown using GPT-4
    console.log('📖 Generating story breakdown...');
    // TODO: Uncomment this once we have a dynamic story breakdown
    let scenes = await generateStoryBreakdown(
      request.prompt,
      request.sceneCount,
      sceneDuration,
      request.totalDuration,
    );
    console.log('✅ Generated scenes:', scenes);

    // Generate dynamic scenes based on parameters
    // const sceneDuration = Math.floor(request.totalDuration / request.sceneCount);
    // TODO: Remove this once we have a dynamic story breakdown

    // TODO: Remove this once we have a dynamic story breakdown
    // let scenes = [
    //   {
    //     id: 0,
    //     description:
    //       'INT. ALEXANDRIA PALACE – DAY\nSunlight streams through marble columns as a regal young CLEOPATRA strides into the throne room, citizens bowing in awe.',
    //     duration: sceneDuration,
    //     narration:
    //       'At just eighteen, Cleopatra ascended the throne of Egypt, proving her political acumen and winning the loyalty of her people.',
    //   },
    //   {
    //     id: 1,
    //     description:
    //       'EXT. NILE RIVERBANK – SUNSET\nA grand barge glides on golden waters. Cleopatra stands at the prow beside JULIUS CAESAR, united in power and purpose.',
    //     duration: sceneDuration,
    //     narration:
    //       'She forged a powerful alliance with Rome’s Julius Caesar, securing Egypt’s stability and giving birth to her son, Caesarion.',
    //   },
    //   {
    //     id: 2,
    //     description:
    //       'INT. GRAND LIBRARY OF ALEXANDRIA – MORNING\nScrolls and scholars surround Cleopatra as she gestures toward a glowing map of newly built temples and fleets.',
    //     duration: sceneDuration,
    //     narration:
    //       'A patron of science and the arts, Cleopatra expanded Alexandria’s library, modernized Egypt’s economy, and left an enduring legacy as the last Pharaonic ruler.',
    //   },
    // ];

    if (!scenes || scenes.length === 0) {
      console.log('❌ Error: Failed to generate story breakdown');
      throw new Error('Failed to generate story breakdown');
    }

    // TODO: Uncomment this once we have a dynamic story breakdown
    // Step 2: Generate video clips for each scene
    console.log('🎥 Generating video clips...');
    const videoClips: string[] = [];
    const seed = Math.floor(Math.random() * 1000000);

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      console.log(`🎬 Generating video for scene ${i + 1}:`, scene.description);
      try {
        const videoClip = await generateVideoClip(
          scene.description,
          scene.duration,
          i,
          request.userId,
          timestamp,
          seed,
          scene.id,
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

    // console.log(`✅ Generated ${videoClips.length} video clips`);

    // Step 3: Generate narration audio with word-level timestamps
    console.log('🎤 Generating narration audio with word-level timestamps...');
    const narrationResult = await generateNarration(
      scenes,
      request.userId,
      timestamp,
    );
    console.log('✅ narrationResult:', narrationResult);
    console.log('✅ Generated subtitle data with word-level timestamps');

    // Step 4: Generate subtitles based on word-level timestamps
    console.log('📝 Generating subtitles with word-level timing...');
    const subtitleKeys = await generateSubtitles(
      scenes,
      request.userId,
      timestamp,
      narrationResult.subtitles,
    );
    console.log('✅ Generated subtitle keys:', subtitleKeys);

    // Step 5: Combine video clips, audio, and subtitles
    console.log('🎬 Combining video, audio, and subtitles...');
    const finalVideo = await combineVideoAndAudio(
      request.userId,
      timestamp,
      scenes,
    );
    console.log('✅ Final video generated:', finalVideo);

    if (!finalVideo) {
      console.log('❌ Error: Failed to combine video, audio, and subtitles');
      throw new Error('Failed to combine video, audio, and subtitles');
    }

    // Step 6: Upload to S3
    console.log('☁️ Uploading to S3...');
    const videoKey = await uploadToS3(finalVideo, request.userId, timestamp);
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
