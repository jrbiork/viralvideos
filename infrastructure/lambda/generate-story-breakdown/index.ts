import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { generateStoryBreakdown, Scene } from './script';

interface StoryBreakdownRequest {
  prompt: string;
  sceneCount?: number;
  totalDuration?: number;
}

interface StoryBreakdownResponse {
  scenes: Scene[];
  voiceToneInstruction: string;
  sceneCount: number;
  totalDuration: number;
  sceneDuration: number;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    // Set CORS headers
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: '',
      };
    }

    // Validate request method
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const request: StoryBreakdownRequest = JSON.parse(event.body);

    // Validate required fields
    if (!request.prompt || request.prompt.trim() === '') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Prompt is required' }),
      };
    }

    // Set default values
    const sceneCount = request.sceneCount || 3;
    const totalDuration = request.totalDuration || 30;
    const sceneDuration = Math.floor(totalDuration / sceneCount);

    // Validate parameters
    if (sceneCount < 1 || sceneCount > 10) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Scene count must be between 1 and 10' }),
      };
    }

    if (totalDuration < 10 || totalDuration > 60) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Total duration must be between 10 and 60 seconds',
        }),
      };
    }

    console.log('🎬 Generating story breakdown...');
    console.log(
      `📊 Parameters: ${sceneCount} scenes, ${totalDuration} seconds total`,
    );
    console.log(`⏱️  Each scene will be ${sceneDuration} seconds long`);

    // Generate story breakdown
    const storyBreakdown = await generateStoryBreakdown(
      request.prompt,
      sceneCount,
      sceneDuration,
      totalDuration,
    );

    const { scenes, voiceToneInstruction } = storyBreakdown;

    if (!scenes || scenes.length === 0) {
      console.log('❌ Error: Failed to generate story breakdown');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to generate story breakdown' }),
      };
    }

    console.log('✅ Story breakdown generated successfully');
    console.log(`📝 Generated ${scenes.length} scenes`);

    const response: StoryBreakdownResponse = {
      scenes,
      voiceToneInstruction,
      sceneCount,
      totalDuration,
      sceneDuration,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('❌ Error in generate-story-breakdown lambda:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
