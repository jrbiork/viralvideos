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
    const narrationResult = await generateNarration(
      scenes,
      userId,
      timestamp,
      voiceToneInstruction || 'Speak in a cheerful and positive tone',
    );

    console.log('🎤 Narration generated successfully:', {
      audioKeys: narrationResult.audioKeys,
      subtitleCount: narrationResult.subtitles.length,
    });

    // Step 2: Generate subtitles using the narration result
    console.log('📝 Generating subtitles...');
    let subtitleKeys = await generateSubtitles(
      scenes,
      userId,
      timestamp,
      narrationResult.subtitles,
    );

    console.log('📝 Subtitles generated successfully:', subtitleKeys);

    // Broadcast subtitle files completed event
    await broadcastSubtitleFilesCompleted(userId, timestamp, subtitleKeys);

    // Generate pre-signed URLs for each scene
    const results = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const audioKey = narrationResult.audioKeys[i];
      const subtitleKey = subtitleKeys[i];

      // Generate pre-signed URL for audio
      const audioCommand = new GetObjectCommand({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Key: audioKey,
      });
      const audioUrl = await getSignedUrl(s3, audioCommand, {
        expiresIn: 3600,
      }); // 1 hour

      // Fetch ASS file content
      const subtitleCommand = new GetObjectCommand({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Key: subtitleKey,
      });
      const assObject = await s3.send(subtitleCommand);
      const assFileContent = await assObject.Body?.transformToString();

      results.push({
        sceneId: scene.id,
        audioKey: audioKey.replace(`${userId}/`, ''),
        assKey: subtitleKey.replace(`${userId}/`, ''),
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
  subtitleKeys: string[],
): Promise<void> {
  try {
    const subtitleMessage = {
      action: 'subtitle_files_completed',
      data: {
        userId,
        timestamp,
        subtitleFiles: subtitleKeys,
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
