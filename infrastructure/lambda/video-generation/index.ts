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
  console.log('📄 Event received:', JSON.stringify(event, null, 2));

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
    const timestamp = '12.25.23-14:30:45'; //format(new Date(), 'MM.dd.yy-HH:mm:ss');
    console.log('🕐 Generated timestamp:', timestamp);

    console.log('🎬 Starting video generation for prompt:', request.prompt);
    console.log('⏱️  Video duration:', request.duration, 'seconds');
    console.log('🎬 Number of scenes:', request.sceneCount);

    // Step 1: Generate story breakdown using GPT-4
    console.log('📖 Generating story breakdown...');
    // TODO: Uncomment this once we have a dynamic story breakdown
    let scenes = await generateStoryBreakdown(
      request.prompt,
      request.sceneCount,
      request.duration,
    );
    console.log('✅ Generated scenes:', scenes);

    // Generate dynamic scenes based on parameters
    // const sceneDuration = Math.floor(request.duration / request.sceneCount);
    // TODO: Remove this once we have a dynamic story breakdown
    const sceneDuration = 5;
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
      //   duration: sceneDuration,
      //   narration:
      //     'Focus on the rhythmic ebb and flow of the waves, mirroring the rhythm of your own breath.',
      // },
      {
        description:
          'The camera pulls back to reveal a silhouette of a person meditating on the beach. The sun is now just a glimmer on the horizon.',
        duration: sceneDuration,
        narration:
          'Imagine yourself sitting at the edge of the ocean, grounding yourself in this peaceful moment.',
      },
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

    // TODO: Uncomment this once we have a dynamic story breakdown
    // Step 2: Generate video clips for each scene
    console.log('🎥 Generating video clips...');
    // const videoClips: string[] = [];
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

    // TODO: Remove this once we have a dynamic story breakdown

    // TODO: Uncomment this once we have a dynamic story breakdown
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
    const finalVideo = await combineVideoAndAudio(request.userId, timestamp);
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
