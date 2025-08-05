"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNarration = generateNarration;
exports.generateStoryBreakdown = generateStoryBreakdown;
const client_s3_1 = require("@aws-sdk/client-s3");
const openai_1 = __importDefault(require("openai"));
const ffmpeg = require('fluent-ffmpeg');
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
async function adjustAudioDuration(audioBuffer, targetDuration) {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tempInputPath = path.join(os.tmpdir(), `original-audio-${Date.now()}.mp3`);
    const tempOutputPath = path.join(os.tmpdir(), `adjusted-audio-${Date.now()}.mp3`);
    fs.writeFileSync(tempInputPath, audioBuffer);
    try {
        const durationResult = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(tempInputPath, (err, metadata) => {
                if (err) {
                    console.error('❌ Error getting audio duration:', err);
                    reject(err);
                }
                else {
                    const duration = metadata.format.duration || 0;
                    console.log(`📊 Original audio duration: ${duration}s`);
                    resolve(duration);
                }
            });
        });
        console.log(`📊 Original audio duration: ${durationResult}s, Target: ${targetDuration}s`);
        if (Math.abs(durationResult - targetDuration) < 0.1) {
            console.log('✅ Audio duration is already close to target, no adjustment needed');
            return audioBuffer;
        }
        const speedFactor = durationResult / targetDuration;
        console.log(`⚡ Speed factor: ${speedFactor.toFixed(3)}`);
        let finalSpeedFactor = Math.min(Math.max(speedFactor, 0.5), 2.0);
        let remainingFactor = speedFactor / finalSpeedFactor;
        let audioFilters = [];
        if (speedFactor < 0.5) {
            let currentFactor = speedFactor;
            while (currentFactor < 0.5) {
                audioFilters.push('atempo=0.5');
                currentFactor = currentFactor / 0.5;
            }
            if (currentFactor > 1.0) {
                audioFilters.push(`atempo=${currentFactor}`);
            }
        }
        else if (speedFactor > 2.0) {
            let currentFactor = speedFactor;
            while (currentFactor > 2.0) {
                audioFilters.push('atempo=2.0');
                currentFactor = currentFactor / 2.0;
            }
            if (currentFactor > 1.0) {
                audioFilters.push(`atempo=${currentFactor}`);
            }
        }
        else {
            audioFilters.push(`atempo=${speedFactor}`);
        }
        console.log(`🎵 Applying audio filters: ${audioFilters.join(',')}`);
        await new Promise((resolve, reject) => {
            const ffmpegCommand = ffmpeg(tempInputPath);
            audioFilters.forEach((filter) => {
                ffmpegCommand.audioFilters(filter);
            });
            ffmpegCommand
                .outputOptions(['-c:a', 'mp3', '-b:a', '128k'])
                .on('end', () => {
                console.log('✅ Audio speed adjustment completed');
                resolve();
            })
                .on('error', (err) => {
                console.error('❌ Audio speed adjustment error:', err);
                reject(err);
            })
                .save(tempOutputPath);
        });
        const adjustedDuration = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(tempOutputPath, (err, metadata) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(metadata.format.duration || 0);
                }
            });
        });
        console.log(`✅ Adjusted audio duration: ${adjustedDuration}s (target: ${targetDuration}s)`);
        const adjustedBuffer = fs.readFileSync(tempOutputPath);
        if (Math.abs(adjustedDuration - targetDuration) > 0.5) {
            console.warn("⚠️ Audio adjustment didn't achieve target duration, using original");
            return audioBuffer;
        }
        return adjustedBuffer;
    }
    catch (error) {
        console.error('❌ Error adjusting audio duration:', error);
        console.log('🔄 Falling back to original audio');
        return audioBuffer;
    }
    finally {
        try {
            if (fs.existsSync(tempInputPath))
                fs.unlinkSync(tempInputPath);
            if (fs.existsSync(tempOutputPath))
                fs.unlinkSync(tempOutputPath);
        }
        catch (error) {
            console.warn('⚠️ Could not clean up temp files:', error);
        }
    }
}
function adjustWordTimestamps(words, speedFactor) {
    return words.map((word) => ({
        word: word.word,
        start: word.start / speedFactor,
        end: word.end / speedFactor,
    }));
}
function estimateTextDuration(text) {
    const words = text.split(' ').filter((word) => word.length > 0);
    const estimatedSeconds = words.length / 2.5;
    return Math.max(estimatedSeconds * 1.1, 1.0);
}
function adjustTextForDuration(text, targetDuration) {
    const currentDuration = estimateTextDuration(text);
    if (Math.abs(currentDuration - targetDuration) < 0.5) {
        return text;
    }
    if (currentDuration > targetDuration) {
        const words = text.split(' ');
        const targetWordCount = Math.floor(targetDuration * 2.5 * 0.9);
        if (words.length <= targetWordCount) {
            return text;
        }
        const shortenedWords = words.slice(0, targetWordCount);
        return shortenedWords.join(' ').replace(/[,.!?]+$/, '') + '.';
    }
    else {
        return text;
    }
}
async function generateNarration(scenes, userId, timestamp) {
    console.log('🎤 Generating narration from scenes with word-level timestamps...');
    try {
        const audioKeys = [];
        const subtitles = [];
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            console.log(`🎤 Generating narration for scene ${i}:`, scene.narration);
            const response = await openai.audio.speech.create({
                model: 'tts-1',
                voice: 'alloy',
                input: scene.narration,
            });
            const originalAudioBuffer = Buffer.from(await response.arrayBuffer());
            console.log(`✅ Generated audio for scene ${i}, size: ${originalAudioBuffer.length} bytes`);
            const adjustedAudioBuffer = await adjustAudioDuration(originalAudioBuffer, scene.duration);
            const audioKey = `${userId}/${timestamp}.scene-${i}.mp3`;
            console.log(`☁️ Uploading audio to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${audioKey}`);
            await s3.send(new client_s3_1.PutObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: audioKey,
                Body: adjustedAudioBuffer,
                ContentType: 'audio/mpeg',
            }));
            console.log(`✅ Uploaded audio to S3: ${audioKey}`);
            audioKeys.push(audioKey);
            console.log(`🎤 Transcribing audio for scene ${i} to get word timestamps...`);
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
                console.log(`📝 Extracted ${subtitleData.words.length} word timestamps for scene ${i}`);
            }
            else {
                console.log(`⚠️ No word timestamps available for scene ${i}, using fallback`);
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
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: `You are a video script writer. Break down the given prompt into ${sceneCount} scenes, each ${sceneDuration} seconds long, for a ${totalDuration}-second vertical video. 
          Each scene should have a clear visual description and narration text. Return as JSON array with objects containing:
          - description: visual scene description for video generation
          - duration: ${sceneDuration} (seconds)
          - narration: text to be spoken in this scene (aim for ${Math.floor(sceneDuration * 2.5 * 0.9)} words to fit ${sceneDuration} seconds naturally)
          
          Important: Keep narration concise and natural. Each scene's narration should be approximately ${Math.floor(sceneDuration * 2.5 * 0.9)} words to ensure it fits the ${sceneDuration}-second duration when spoken.
          
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
        const adjustedScenes = scenes.map((scene) => {
            const adjustedNarration = adjustTextForDuration(scene.narration, scene.duration);
            const originalDuration = estimateTextDuration(scene.narration);
            const adjustedDuration = estimateTextDuration(adjustedNarration);
            console.log(`📝 Scene ${scene.description.substring(0, 50)}...`);
            console.log(`   Original: ${originalDuration.toFixed(1)}s, Adjusted: ${adjustedDuration.toFixed(1)}s, Target: ${scene.duration}s`);
            return {
                ...scene,
                narration: adjustedNarration,
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
