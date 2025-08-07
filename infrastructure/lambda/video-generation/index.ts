import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { format } from 'date-fns';
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

    request.totalDuration = 30;
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
    // console.log('✅ Generated scenes:', scenes);

    // Generate dynamic scenes based on parameters
    // const sceneDuration = Math.floor(request.totalDuration / request.sceneCount);
    // TODO: Remove this once we have a dynamic story breakdown

    // TODO: Remove this once we have a dynamic story breakdown
    // let scenes = [
    //   {
    //     id: 0,
    //     description:
    //       'EXT. TOKYO BACKALLEY – NIGHT\nA narrow street bathed in neon pinks and blues. Rain-slick pavement reflects towering LED signs and drifting holo-ads as pedestrians in tech-infused fashion weave past food stalls.',
    //     duration: sceneDuration,
    //     narration:
    //       'Tokyo’s back alleys come alive under neon rain—where ancient izakayas meet holographic billboards in a pulse of cyberpunk energy.',
    //   },
    //   {
    //     id: 1,
    //     description:
    //       'EXT. SHINJUKU SKYLINE – NIGHT\nA panoramic view of glittering skyscrapers. Magnetic lev monorails glide between towers, and giant animated screens project AI-generated art across building facades.',
    //     duration: sceneDuration,
    //     narration:
    //       'Above Shinjuku, magnetic rails hum through sky bridges. Futuristic towers glow with dynamic murals—each pixel a heartbeat in the city’s neon core.',
    //   },
    //   {
    //     id: 2,
    //     description:
    //       'EXT. SHIBUYA CROSSING – NIGHT\nAn ocean of umbrellas surges through the world’s busiest intersection. Neon reflections dance in puddles while floating VTuber avatars advertise robotic sushi bars on every corner.',
    //     duration: sceneDuration,
    //     narration:
    //       'At Shibuya Crossing, human tides meet virtual icons. In this nocturnal sprawl, every step feels like stepping into tomorrow’s dream.',
    //   },
    // ];

    if (!scenes || scenes.length === 0) {
      console.log('❌ Error: Failed to generate story breakdown');
      throw new Error('Failed to generate story breakdown');
    }

    // TODO: Uncomment this once we have a dynamic story breakdown
    // Step 2: Generate video clips for each scene
    // console.log('🎥 Generating video clips...');
    // const videoClips: string[] = [];
    // const seed = Math.floor(Math.random() * 1000000);

    // for (let i = 0; i < scenes.length; i++) {
    //   const scene = scenes[i];
    //   console.log(`🎬 Generating video for scene ${i + 1}:`, scene.description);
    //   try {
    //     const videoClip = await generateVideoClip(
    //       scene.description,
    //       scene.duration,
    //       i,
    //       request.userId,
    //       timestamp,
    //       seed,
    //       scene.id,
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
