import OpenAI from 'openai';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface Scene {
  description: string;
  duration: number;
  narration: string;
  id: number;
}

// Utility function to add IDs to scenes
export function addSceneIds(scenes: Scene[]): Scene[] {
  return scenes.map((scene: Scene, idx: number) => ({
    ...scene,
    id: idx,
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
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a short-form video scriptwriter for TikTok/Reels/Shorts.
                Break the user's idea into ${sceneCount} scenes for a ${totalDuration}-second, 9:16 vertical video; each scene lasts ${sceneDuration}s.
                Strict rules:
                - Narration per scene should have ${maxWordsPerScene} words (hard cap) and total words should be less than ${maxTotalWords}.
                - Language: **use the same language as the user's input**.
                - Each **description**: what viewers see. No dialogue. Keep it short and concise.
                - Avoid filler and long pauses: max 1 comma per sentence, no parentheses, no ellipses.
                - Prefer active voice and simple clauses.
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

    // Add scene IDs to each scene
    const scenesWithIds = addSceneIds(scenes);

    console.log('✅ Story breakdown parsed and adjusted successfully');
    console.log('🎤 Voice tone instruction:', voiceToneInstruction);

    // Save script response to S3
    const scriptKey = `${userId}/${timestamp}.script.txt`;
    const scriptContent = JSON.stringify(
      {
        prompt,
        sceneCount,
        sceneDuration,
        totalDuration,
        scenes: scenesWithIds,
        voiceToneInstruction,
        timestamp,
      },
      null,
      2,
    );

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Key: scriptKey,
        Body: scriptContent,
        ContentType: 'text/plain',
      }),
    );

    console.log(`💾 Script saved to S3: ${scriptKey}`);

    return { scenes: scenesWithIds, voiceToneInstruction };
  } catch (error) {
    console.error('❌ Error in generateStoryBreakdown:', error);
    throw error;
  }
}
