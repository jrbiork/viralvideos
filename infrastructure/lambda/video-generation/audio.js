"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNarration = generateNarration;
const client_s3_1 = require("@aws-sdk/client-s3");
const openai_1 = __importDefault(require("openai"));
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
async function generateNarration(scenes, userId, timestamp, instructions = 'Speak in a cheerful and positive tone') {
    console.log('🎤 Generating narration from scenes with word-level timestamps...');
    try {
        const audioKeys = [];
        const subtitles = [];
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            console.log(`🎤 Generating narration for scene ${i}:`, scene);
            const response = await openai.audio.speech.create({
                model: 'tts-1',
                voice: 'fable',
                instructions: `Speak clearly and keep duration around or less than ${scene.duration}s. Avoid long pauses.`,
                input: scene.narration,
            });
            const originalAudioBuffer = Buffer.from(await response.arrayBuffer());
            const audioKey = `${userId}/${timestamp}.scene-${scene.id}.mp3`;
            await s3.send(new client_s3_1.PutObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: audioKey,
                Body: originalAudioBuffer,
                ContentType: 'audio/mpeg',
            }));
            audioKeys.push(audioKey);
            const fs = require('fs');
            const os = require('os');
            const path = require('path');
            const tempAudioPath = path.join(os.tmpdir(), `scene-${i}.mp3`);
            fs.writeFileSync(tempAudioPath, originalAudioBuffer);
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
                fullText: scene.narration,
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
