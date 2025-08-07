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
  duration: number;
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
    const timestamp = '08.06.25-14:30:45'; //format(new Date(), 'MM.dd.yy-HH:mm:ss');
    console.log('🕐 Generated timestamp:', timestamp);

    console.log('🎬 Starting video generation for prompt:', request.prompt);
    console.log('⏱️  Video duration:', request.duration, 'seconds');
    console.log('🎬 Number of scenes:', request.sceneCount);

    // Step 1: Generate story breakdown using GPT-4
    console.log('📖 Generating story breakdown...');
    // TODO: Uncomment this once we have a dynamic story breakdown
    // let scenes = await generateStoryBreakdown(
    //   request.prompt,
    //   request.sceneCount,
    //   request.duration,
    // );
    // console.log('✅ Generated scenes:', scenes);

    // Generate dynamic scenes based on parameters
    // const sceneDuration = Math.floor(request.duration / request.sceneCount);
    // TODO: Remove this once we have a dynamic story breakdown
    const sceneDuration = 5;
    // TODO: Remove this once we have a dynamic story breakdown
    let scenes = [
      {
        id: 0,
        description:
          'INT. SPREEGOLD CAFÉ – DUSK\nWarm light floods the café. Vanessa, 34, locks eyes with a mysterious Brazilian stranger across the bar; time seems to stand still.',
        duration: sceneDuration,
        narration:
          'Vanessa fell madly in love at first sight at Spreegold, entranced by his promise of a new life.',
      },
      {
        id: 1,
        description:
          'INT. VANESSA’S BATHROOM – NIGHT\nA single bulb casts harsh shadows. Vanessa’s hand trembles as she holds a positive pregnancy test, heartbreak in her eyes.',
        duration: sceneDuration,
        narration:
          'But those promises were lies, and she found herself carrying his child with no future in sight.',
      },
      {
        id: 2,
        description:
          'INT. NURSERY – MORNING\nSoft sunlight filters through curtains. Vanessa gently rocks baby Maxime, her face alight with purpose and unconditional love.',
        duration: sceneDuration,
        narration:
          'Through all the drama, she discovered her true purpose in raising little Maxime, the light of her world.',
      },
    ];

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
    //       scene.id, // Pass scene.id to the function
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
