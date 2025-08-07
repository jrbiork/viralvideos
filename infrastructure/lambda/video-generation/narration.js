"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNarration = generateNarration;
exports.generateStoryBreakdown = generateStoryBreakdown;
const client_s3_1 = require("@aws-sdk/client-s3");
const openai_1 = __importDefault(require("openai"));
const narrationHelper_1 = require("./util/narrationHelper");
const ffmpeg = require('fluent-ffmpeg');
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
async function generateNarration(scenes, userId, timestamp) {
    console.log('🎤 Generating narration from scenes with word-level timestamps...');
    try {
        const audioKeys = [];
        const subtitles = [];
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            console.log(`🎤 Generating narration for scene ${i}:`, scene.narration);
            const response = await openai.audio.speech.create({
                model: 'gpt-4o-mini-tts',
                voice: 'alloy',
                input: scene.narration,
            });
            const originalAudioBuffer = Buffer.from(await response.arrayBuffer());
            const adjustedAudioBuffer = await (0, narrationHelper_1.adjustAudioDuration)(originalAudioBuffer, scene.duration);
            const audioKey = `${userId}/${timestamp}.scene-${scene.id}.mp3`;
            await s3.send(new client_s3_1.PutObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: audioKey,
                Body: adjustedAudioBuffer,
                ContentType: 'audio/mpeg',
            }));
            audioKeys.push(audioKey);
            const fs = require('fs');
            const os = require('os');
            const path = require('path');
            const tempAudioPath = path.join(os.tmpdir(), `scene-${i}.mp3`);
            fs.writeFileSync(tempAudioPath, adjustedAudioBuffer);
            const audioFile = fs.createReadStream(tempAudioPath);
            const transcription = await openai.audio.transcriptions.create({
                file: audioFile,
                model: 'whisper-1',
                response_format: 'verbose_json',
                timestamp_granularities: ['word'],
                language: 'en',
            });
            fs.unlinkSync(tempAudioPath);
            const subtitleData = {
                sceneIndex: i,
                words: [],
                fullText: transcription.text,
            };
            if (transcription.words && Array.isArray(transcription.words)) {
                subtitleData.words = transcription.words.map((word) => ({
                    word: word.word,
                    start: word.start,
                    end: word.end,
                }));
            }
            else {
                const words = scene.narration
                    .split(' ')
                    .filter((word) => word.length > 0);
                const estimatedDuration = scene.duration;
                const timePerWord = estimatedDuration / words.length;
                subtitleData.words = words.map((word, index) => ({
                    word,
                    start: index * timePerWord,
                    end: (index + 1) * timePerWord,
                }));
            }
            subtitles.push(subtitleData);
        }
        return { audioKeys, subtitles };
    }
    catch (error) {
        console.error('❌ Error in generateNarration:', error);
        throw error;
    }
}
async function generateStoryBreakdown(prompt, sceneCount, totalDuration) {
    console.log('🤖 Calling OpenAI for story breakdown...');
    console.log(`📊 Parameters: ${sceneCount} scenes, ${totalDuration} seconds total`);
    const sceneDuration = Math.floor(totalDuration / sceneCount);
    console.log(`⏱️  Each scene will be ${sceneDuration} seconds long`);
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a video script writer. Break down the given prompt into ${sceneCount} scenes, each ${sceneDuration} seconds long, for a ${totalDuration}-second vertical video. 
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
        });
        const content = response.choices[0]?.message?.content;
        console.log('📄 OpenAI response content:', content);
        if (!content) {
            console.log('❌ Error: OpenAI did not return content');
            throw new Error('Failed to generate story breakdown');
        }
        const scenes = JSON.parse(content);
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
