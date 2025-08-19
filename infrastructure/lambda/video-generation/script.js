"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateStoryBreakdown = generateStoryBreakdown;
const openai_1 = __importDefault(require("openai"));
const client_s3_1 = require("@aws-sdk/client-s3");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
async function generateStoryBreakdown(prompt, sceneCount, sceneDuration, totalDuration, userId, timestamp) {
    console.log('🤖 Calling OpenAI for story breakdown...');
    console.log(`📊 Parameters: ${sceneCount} scenes, ${totalDuration} seconds total`);
    console.log(`⏱️  Each scene will be ${sceneDuration} seconds long`);
    console.log('prompt:', prompt);
    try {
        const WPS = 4;
        const BREATH_MARGIN = 0.9;
        const maxWordsPerScene = Math.max(6, Math.floor(sceneDuration * WPS * BREATH_MARGIN));
        console.log('maxWordsPerScene:', maxWordsPerScene);
        const maxTotalWords = Math.floor(totalDuration * WPS * BREATH_MARGIN);
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a short-form video scriptwriter for TikTok/Reels/Shorts.
                Break the user's idea into ${sceneCount} scenes for a ${totalDuration}-second, 9:16 vertical video; each scene lasts ${sceneDuration}s.
                Strict rules:
                - Output **JSON only** matching the provided schema; no prose, no backticks.
                - Language: **use the same language as the user's input**.
                - Each **description**: what viewers see. No dialogue. Keep it short and concise.
                - Narration per scene should be around ${maxWordsPerScene} or little less words (hard cap).
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
        const voiceToneInstruction = parsedResponse.voiceToneInstruction ||
            'Speak in a cheerful and positive tone';
        const scenesWithIds = scenes.map((scene, idx) => ({
            ...scene,
            id: idx,
        }));
        console.log('✅ Story breakdown parsed and adjusted successfully');
        console.log('🎤 Voice tone instruction:', voiceToneInstruction);
        const scriptKey = `${userId}/${timestamp}.script.txt`;
        const scriptContent = JSON.stringify({
            prompt,
            sceneCount,
            sceneDuration,
            totalDuration,
            scenes,
            voiceToneInstruction,
            timestamp,
        }, null, 2);
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: scriptKey,
            Body: scriptContent,
            ContentType: 'text/plain',
        }));
        console.log(`💾 Script saved to S3: ${scriptKey}`);
        return { scenes: scenesWithIds, voiceToneInstruction };
    }
    catch (error) {
        console.error('❌ Error in generateStoryBreakdown:', error);
        throw error;
    }
}
