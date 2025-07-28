import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import OpenAI from 'openai';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface Scene {
  description: string;
  duration: number;
  narration: string;
}

export async function generateNarration(
  scenes: Scene[],
  userId: string,
): Promise<string[]> {
  console.log('🎤 Generating narration from scenes...');
  try {
    const audioKeys: string[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      console.log(`🎤 Generating narration for scene ${i}:`, scene.narration);

      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: scene.narration,
      });

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      console.log(
        `✅ Generated audio for scene ${i}, size: ${audioBuffer.length} bytes`,
      );

      // Save to S3 with consistent naming
      const audioKey = `${userId}/scene-${i}.mp3`;
      console.log(
        `☁️ Uploading audio to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${audioKey}`,
      );

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
          Key: audioKey,
          Body: audioBuffer,
          ContentType: 'audio/mpeg',
        }),
      );
      console.log(`✅ Uploaded audio to S3: ${audioKey}`);

      audioKeys.push(audioKey);
    }

    return audioKeys;
  } catch (error) {
    console.error('❌ Error in generateNarration:', error);
    throw error;
  }
}

export async function generateStoryBreakdown(
  prompt: string,
  sceneCount: number,
  totalDuration: number,
): Promise<Scene[]> {
  console.log('🤖 Calling OpenAI for story breakdown...');
  console.log(
    `📊 Parameters: ${sceneCount} scenes, ${totalDuration} seconds total`,
  );

  const sceneDuration = Math.floor(totalDuration / sceneCount);
  console.log(`⏱️  Each scene will be ${sceneDuration} seconds long`);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a video script writer. Break down the given prompt into ${sceneCount} scenes, each ${sceneDuration} seconds long, for a ${totalDuration}-second vertical video. 
          Each scene should have a clear visual description and narration text. Return as JSON array with objects containing:
          - description: visual scene description for video generation
          - duration: ${sceneDuration} (seconds)
          - narration: text to be spoken in this scene
          
          If only 1 scene is requested, create a single comprehensive scene that covers the entire duration.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    console.log('📄 OpenAI response content:', content);

    if (!content) {
      console.log('❌ Error: OpenAI did not return content');
      throw new Error('Failed to generate story breakdown');
    }

    const scenes = JSON.parse(content);
    console.log('✅ Story breakdown parsed successfully');
    return scenes;
  } catch (error) {
    console.error('❌ Error in generateStoryBreakdown:', error);
    throw error;
  }
}
