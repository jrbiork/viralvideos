import OpenAI from 'openai';
import {
  estimateTextDuration,
  adjustTextForDuration,
} from './util/narrationHelper';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface Scene {
  description: string;
  duration: number;
  narration: string;
  id: number;
}

export async function generateStoryBreakdown(
  prompt: string,
  sceneCount: number,
  sceneDuration: number,
  totalDuration: number,
): Promise<{ scenes: Scene[]; voiceToneInstruction: string }> {
  console.log('🤖 Calling OpenAI for story breakdown...');
  console.log(
    `📊 Parameters: ${sceneCount} scenes, ${totalDuration} seconds total`,
  );

  console.log(`⏱️  Each scene will be ${sceneDuration} seconds long`);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a script writer for social media. Break down the given prompt into ${sceneCount} scenes, each ${sceneDuration} seconds long, for a ${totalDuration}-second vertical video. 
          Each scene should have a clear visual description and narration text. Also provide a voice tone instruction for the narration.
          Return as JSON with:
          - videoScenes: array of scene objects containing:
            - description: short visual scene description
            - duration: ${sceneDuration} (seconds)
            - narration: text to be spoken in this scene (the narration should fit naturally within the ${sceneDuration}-seconds scene)
          - voiceToneInstruction: a brief instruction for the voice tone (e.g., "Speak in a cheerful and positive tone", "Speak in a dramatic and suspenseful tone")
          `,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'VideoScenes',
          schema: {
            type: 'object',
            properties: {
              videoScenes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    description: { type: 'string' },
                    duration: { type: 'number' },
                    narration: { type: 'string' },
                  },
                },
              },
              voiceToneInstruction: { type: 'string' },
            },
          },
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
    const scenes = parsedResponse.videoScenes || parsedResponse;
    const voiceToneInstruction =
      parsedResponse.voiceToneInstruction ||
      'Speak in a cheerful and positive tone';

    // Post-process scenes to ensure text fits duration
    const adjustedScenes = scenes.map((scene: Scene, idx: number) => {
      const adjustedNarration = adjustTextForDuration(
        scene.narration,
        scene.duration,
      );
      const originalDuration = estimateTextDuration(scene.narration);
      const adjustedDuration = estimateTextDuration(adjustedNarration);

      console.log(`📝 Scene ${scene.description.substring(0, 50)}...`);
      console.log(
        `   Original: ${originalDuration.toFixed(
          1,
        )}s, Adjusted: ${adjustedDuration.toFixed(1)}s, Target: ${
          scene.duration
        }s`,
      );

      return {
        ...scene,
        narration: adjustedNarration,
        id: idx,
      };
    });

    console.log('✅ Story breakdown parsed and adjusted successfully');
    console.log('🎤 Voice tone instruction:', voiceToneInstruction);
    return { scenes: adjustedScenes, voiceToneInstruction };
  } catch (error) {
    console.error('❌ Error in generateStoryBreakdown:', error);
    throw error;
  }
}
