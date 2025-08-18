"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateStoryBreakdown = generateStoryBreakdown;
const openai_1 = __importDefault(require("openai"));
const narrationHelper_1 = require("./util/narrationHelper");
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
async function generateStoryBreakdown(prompt, sceneCount, sceneDuration, totalDuration) {
    console.log('🤖 Calling OpenAI for story breakdown...');
    console.log(`📊 Parameters: ${sceneCount} scenes, ${totalDuration} seconds total`);
    console.log(`⏱️  Each scene will be ${sceneDuration} seconds long`);
    try {
        const wordsPerSecond = 2.2;
        const wordsPerMinute = Math.round(wordsPerSecond * 60);
        const maxWordsPerScene = Math.max(8, Math.round(sceneDuration * wordsPerSecond));
        const maxTotalWords = Math.round(totalDuration * wordsPerSecond);
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
- **Scene 1 must include a strong curiosity hook** in the narration (one sentence).
- Each **description**: what viewers see (subject, action, framing/camera, motion, lighting). No dialogue.
- Each **narration**: spoken VO, conversational, **no hashtags, emojis, or scene labels**.
- **Timing**: narration per scene ≤ ${maxWordsPerScene} words; total narration must fit ${totalDuration}s at ~${wordsPerMinute} wpm.
- Tone: energetic and clear; keep actions **safe and realistic**; brand-neutral (no logos, trademarks, or celebrity names).
- End with a satisfying visual beat (rest, reveal, or resolution), not a hard sales CTA unless implied by the idea.
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
        const adjustedScenes = scenes.map((scene, idx) => {
            const adjustedNarration = (0, narrationHelper_1.adjustTextForDuration)(scene.narration, scene.duration);
            const originalDuration = (0, narrationHelper_1.estimateTextDuration)(scene.narration);
            const adjustedDuration = (0, narrationHelper_1.estimateTextDuration)(adjustedNarration);
            console.log(`📝 Scene ${scene.description.substring(0, 50)}...`);
            console.log(`   Original: ${originalDuration.toFixed(1)}s, Adjusted: ${adjustedDuration.toFixed(1)}s, Target: ${scene.duration}s`);
            return {
                ...scene,
                narration: adjustedNarration,
                id: idx,
            };
        });
        console.log('✅ Story breakdown parsed and adjusted successfully');
        console.log('🎤 Voice tone instruction:', voiceToneInstruction);
        return { scenes: adjustedScenes, voiceToneInstruction };
    }
    catch (error) {
        console.error('❌ Error in generateStoryBreakdown:', error);
        throw error;
    }
}
