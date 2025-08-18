"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adjustAudioDuration = adjustAudioDuration;
exports.estimateTextDuration = estimateTextDuration;
exports.adjustTextForDuration = adjustTextForDuration;
const ffmpeg = require('fluent-ffmpeg');
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
