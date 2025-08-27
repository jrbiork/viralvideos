import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { generateNarration } from '../video-generation/audio';
import { generateSubtitleContent } from '../video-generation/subtitles';
import { Scene } from '../video-generation/script';
import { broadcastMessage } from '../websocket-broadcast';
import { broadcastProgress } from '../video-generation';

interface RequestBody {
  scenes: Scene[];
  userId: string;
  timestamp: string;
  voiceToneInstruction?: string;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  console.log('🎤 Audio-Subtitle Lambda handler started');

  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const requestBody: RequestBody = JSON.parse(event.body);
    const { scenes, userId, timestamp, voiceToneInstruction } = requestBody;

    // Validate required fields
    if (!scenes || !Array.isArray(scenes) || scenes.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Scenes array is required and must not be empty',
        }),
      };
    }

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'userId is required' }),
      };
    }

    if (!timestamp) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'timestamp is required' }),
      };
    }

    console.log(
      `🎤 Processing ${scenes.length} scenes for user ${userId}, timestamp ${timestamp}`,
      scenes,
    );

    // Step 3: Generate audio narration with word-level timestamps
    const { subtitles, narrationUrls } = await generateNarration(
      scenes,
      userId,
      timestamp,
      voiceToneInstruction,
    );

    const subtitleContent = await generateSubtitleContent(
      scenes,
      userId,
      timestamp,
      subtitles,
    );

    console.log('📝 Subtitle content generated:', subtitleContent);
    console.log('🎤 Narration URLs generated:', narrationUrls);

    await broadcastProgress(
      'audio_subtitle_created',
      userId,
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

    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Audio and subtitles generated successfully',
      }),
    };
  } catch (error) {
    console.error('❌ Error in audio-subtitle generation:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message:
          error instanceof Error ? error.message : 'Unknown error occurred',
      }),
    };
  }
};
