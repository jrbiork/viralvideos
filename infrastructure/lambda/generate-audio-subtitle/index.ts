import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateNarration } from '../video-generation/audio';
import { generateSubtitles } from '../video-generation/subtitles';
import { Scene } from '../video-generation/script';
import { broadcastMessage } from '../websocket-broadcast';

interface RequestBody {
  scenes: Scene[];
  userId: string;
  timestamp: string;
  voiceToneInstruction?: string;
}

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

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
    );

    // Step 1: Generate narration with word-level timestamps
    console.log('🎤 Generating narration...');
    const { subtitles, narrationUrls } = await generateNarration(
      scenes,
      userId,
      timestamp,
      voiceToneInstruction || 'Speak in a cheerful and positive tone',
    );

    console.log('🎤 Narration generated successfully:', {
      subtitleCount: subtitles.length,
      narrationUrls,
    });

    // Step 2: Generate subtitles using the narration result
    console.log('📝 Generating subtitles...');
    let subtitleUrls = await generateSubtitles(
      scenes,
      userId,
      timestamp,
      subtitles,
    );

    console.log('📝 Subtitles generated successfully:', subtitleUrls);

    // Broadcast subtitle files completed event
    await broadcastSubtitleFilesCompleted(userId, timestamp, subtitleUrls);

    // Use the pre-generated signed URLs for each scene
    const results = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const audioKey = 'audio.mp3';
      const subtitleUrlObj = subtitleUrls[i];
      const narrationUrlObj = narrationUrls[i];

      // Extract the signed URLs from the objects
      const subtitleUrl = Object.values(subtitleUrlObj)[0];
      const audioUrl = Object.values(narrationUrlObj)[0];

      // Fetch ASS file content from the signed URL
      const assResponse = await fetch(subtitleUrl);
      const assFileContent = await assResponse.text();

      results.push({
        sceneId: scene.id,
        audioKey: audioKey.replace(`${userId}/`, ''),
        assKey: audioKey.replace(`${userId}/`, '').replace('.mp3', '.ass'),
        audioUrl,
        assFileContent,
      });
    }

    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Audio and subtitles generated successfully',
        data: results,
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
