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
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a script writer for social media. Break down the given prompt into ${sceneCount} scenes, each ${sceneDuration} seconds long, for a ${totalDuration}-second vertical video. 
          Each scene should have a clear visual description and narration text. Return as JSON array with objects containing:
          - description: short visual scene description
          - duration: ${sceneDuration} (seconds)
          - narration: text to be spoken in this scene (the narration should fit naturally within the ${sceneDuration}-seconds scene)
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
        return adjustedScenes;
    }
    catch (error) {
        console.error('❌ Error in generateStoryBreakdown:', error);
        throw error;
    }
}
