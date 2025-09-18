import OpenAI from 'openai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface Scene {
  description: string;
  duration: number;
  narration: string;
  id: number;
  scenePosition: number;
  /** Two short bylines repeated every scene, e.g., ["blonde Swiss woman, green-blue eyes", "muscular Brazilian man with mustache"] */
  charactersBrief?: string[];
}

// Utility function to add IDs to scenes
export function addSceneIds(scenes: Scene[]): Scene[] {
  return scenes.map((scene: Scene, idx: number) => ({
    ...scene,
    id: idx,
    scenePosition: idx,
  }));
}

export async function generateStoryBreakdown(
  prompt: string,
  sceneCount: number,
  sceneDuration: number,
  totalDuration: number,
  userId: string,
  timestamp: string,
): Promise<{ scenes: Scene[]; voiceToneInstruction: string }> {
  console.log('🤖 Calling OpenAI for story breakdown...');
  console.log(
    `📊 Parameters: ${sceneCount} scenes, ${totalDuration} seconds total`,
  );

  console.log(`⏱️  Each scene will be ${sceneDuration} seconds long`);

  console.log('prompt:', prompt);

  try {
    // Guidance for narration pacing and safety caps
    const WPS = 2.2;

    const maxWordsPerScene = Math.floor(sceneDuration * WPS);
    console.log('maxWordsPerScene:', maxWordsPerScene);
    const maxTotalWords = Math.floor(totalDuration * WPS);

    // Build schema programmatically so `required` always matches `properties`
    const sceneItemSchema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        description: { type: 'string' },
        duration: { type: 'number' },
        narration: { type: 'string' },
        charactersBrief: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: { type: 'string', maxLength: 80 },
        },
      },
      required: ['description', 'duration', 'narration', 'charactersBrief'],
    } as const;

    const topLevelProperties = {
      videoScenes: {
        type: 'array',
        minItems: sceneCount,
        maxItems: sceneCount,
        items: sceneItemSchema,
      },
      voiceToneInstruction: { type: 'string', minLength: 1 },
      charactersBylines: {
        type: 'array',
        minItems: 2,
        maxItems: 2,
        items: { type: 'string', maxLength: 80 },
      },
    } as const;

    const jsonSchemaRoot = {
      type: 'object',
      additionalProperties: false,
      properties: topLevelProperties,
      required: Object.keys(topLevelProperties),
    } as const;

    console.log('🧪 Structured Output schema:', JSON.stringify(jsonSchemaRoot));

    const response = await openai.chat.completions.create({
      model: 'gpt-5-nano',
      messages: [
        {
          role: 'system',
          content: `You are a short-form video scriptwriter for TikTok/Reels/Shorts.
Create a ${totalDuration}-second 9:16 vertical video split into exactly ${sceneCount} scenes (each ${sceneDuration}s).

Strict rules:
- **No brands, logos, trademarks, public figures, mascots, or celebrity likenesses.** If the user names any, **rewrite to a generic archetype** (e.g., “an elderly Southern gentleman in a white suit and string tie”)—never use real names or marks.
- **Two concise character bylines at the top level** (<= 10 words each): \`charactersBylines = [female, male]\`.
- **Every scene must:**
  1) Start \`description\` with \`[FL: <female byline>] [ML: <male byline>]\` then the visual.
Output: **JSON only** following the provided schema.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 1,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'VideoScenes',
          strict: true,
          schema: jsonSchemaRoot,
        },
      },
    });

    console.log('🤖 OpenAI response:', response);

    const content = response.choices[0]?.message?.content;
    console.log('📄 OpenAI response content:', content);

    if (!content) {
      console.log('❌ Error: OpenAI did not return content');
      throw new Error('Failed to generate story breakdown');
    }

    const parsedResponse = JSON.parse(content);
    const charactersBylines: string[] = parsedResponse.charactersBylines || [];
    console.log('👥 charactersBylines:', charactersBylines);
    const scenes = parsedResponse.videoScenes || parsedResponse;
    const voiceToneInstruction =
      parsedResponse.voiceToneInstruction ||
      'Speak in a cheerful and positive tone';

    // Add scene IDs to each scene
    const scenesWithIds = addSceneIds(scenes);

    console.log('✅ Story breakdown parsed and adjusted successfully');
    console.log('🎤 Voice tone instruction:', voiceToneInstruction);

    return { scenes: scenesWithIds, voiceToneInstruction };
  } catch (error) {
    console.error('❌ Error in generateStoryBreakdown:', error);
    throw error;
  }
}
