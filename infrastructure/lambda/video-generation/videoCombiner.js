"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.combineVideoAndAudio = combineVideoAndAudio;
const client_s3_1 = require("@aws-sdk/client-s3");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const assUtils_1 = require("./util/assUtils");
const ffmpeg = require('fluent-ffmpeg');
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
const ffmpegPath = '/opt/bin/ffmpeg';
const ffprobePath = '/opt/bin/ffprobe';
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
async function combineVideoAndAudio(userId, timestamp, scenes) {
    console.log('🎬 Combining video, audio, and subtitles for user:', userId);
    try {
        const listResponse = await s3.send(new client_s3_1.ListObjectsV2Command({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Prefix: `${userId}/${timestamp}.scene-`,
            MaxKeys: 30,
        }));
        const objs = listResponse.Contents || [];
        const videoFiles = objs
            .filter((obj) => obj.Key?.endsWith('.mp4'))
            .sort((a, b) => {
            const aId = parseInt(a.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
            const bId = parseInt(b.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
            return aId - bId;
        });
        const audioFiles = objs
            .filter((obj) => obj.Key?.endsWith('.mp3'))
            .sort((a, b) => {
            const aId = parseInt(a.Key?.match(/scene-(\d+)\.mp3/)?.[1] || '0');
            const bId = parseInt(b.Key?.match(/scene-(\d+)\.mp3/)?.[1] || '0');
            return aId - bId;
        });
        const subtitleFiles = objs
            .filter((obj) => obj.Key?.endsWith('.ass'))
            .sort((a, b) => {
            const aId = parseInt(a.Key?.match(/scene-(\d+)\.ass/)?.[1] || '0');
            const bId = parseInt(b.Key?.match(/scene-(\d+)\.ass/)?.[1] || '0');
            return aId - bId;
        });
        console.log(`📹 Found ${videoFiles.length} video files, ${audioFiles.length} audio files, ${subtitleFiles.length} subtitle files`);
        if (videoFiles.length === 0) {
            throw new Error('No video files found for user');
        }
        const videoPaths = [];
        for (let i = 0; i < videoFiles.length; i++) {
            const videoFile = videoFiles[i];
            if (!videoFile.Key)
                continue;
            const videoPath = path.join(os.tmpdir(), `video-${i}.mp4`);
            const videoObject = await s3.send(new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: videoFile.Key,
            }));
            const videoBuffer = Buffer.from(await videoObject.Body.transformToByteArray());
            fs.writeFileSync(videoPath, videoBuffer);
            videoPaths.push(videoPath);
        }
        const audioPaths = [];
        for (let i = 0; i < audioFiles.length; i++) {
            const audioFile = audioFiles[i];
            if (!audioFile.Key)
                continue;
            const audioPath = path.join(os.tmpdir(), `audio-${i}.mp3`);
            const audioObject = await s3.send(new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: audioFile.Key,
            }));
            const audioBuffer = Buffer.from(await audioObject.Body.transformToByteArray());
            fs.writeFileSync(audioPath, audioBuffer);
            audioPaths.push(audioPath);
        }
        const subtitlePaths = [];
        for (let i = 0; i < subtitleFiles.length; i++) {
            const subtitleFile = subtitleFiles[i];
            if (!subtitleFile.Key)
                continue;
            const subtitlePath = path.join(os.tmpdir(), `subtitle-${i}.ass`);
            const subtitleObject = await s3.send(new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: subtitleFile.Key,
            }));
            const subtitleBuffer = Buffer.from(await subtitleObject.Body.transformToByteArray());
            fs.writeFileSync(subtitlePath, subtitleBuffer);
            subtitlePaths.push(subtitlePath);
        }
        const fileListPath = path.join(os.tmpdir(), 'filelist.txt');
        const fileListContent = videoPaths
            .map((videoPath) => `file '${videoPath}'`)
            .join('\n');
        fs.writeFileSync(fileListPath, fileListContent);
        const concatenatedAudioPath = path.join(os.tmpdir(), 'concatenated-audio.mp3');
        const audioConcatCommand = ffmpeg();
        audioPaths.forEach((audioPath) => {
            audioConcatCommand.input(audioPath);
        });
        await new Promise((resolve, reject) => {
            audioConcatCommand
                .on('end', () => {
                resolve();
            })
                .on('error', (err) => {
                console.error('❌ Audio concatenation error:', err);
                reject(err);
            })
                .mergeToFile(concatenatedAudioPath, os.tmpdir());
        });
        const concatenatedSubtitlePath = path.join(os.tmpdir(), 'concatenated-subtitles.ass');
        if (subtitlePaths.length > 0) {
            let concatenatedSubtitleContent = (0, assUtils_1.createASSStyleHeader)();
            let currentTime = 0;
            for (let i = 0; i < subtitlePaths.length; i++) {
                const subtitleContent = fs.readFileSync(subtitlePaths[i], 'utf-8');
                const subtitleLines = subtitleContent.split('\n');
                let inEventsSection = false;
                for (const line of subtitleLines) {
                    if (line.trim() === '[Events]') {
                        inEventsSection = true;
                        continue;
                    }
                    if (inEventsSection && line.startsWith('Dialogue:')) {
                        const parts = line.split(',');
                        if (parts.length >= 10) {
                            const startTime = parts[1];
                            const endTime = parts[2];
                            const text = parts.slice(9).join(',');
                            const startSeconds = (0, assUtils_1.parseASSTime)(startTime);
                            const endSeconds = (0, assUtils_1.parseASSTime)(endTime);
                            const adjustedStart = (0, assUtils_1.formatASSTime)(startSeconds);
                            const adjustedEnd = (0, assUtils_1.formatASSTime)(endSeconds);
                            concatenatedSubtitleContent += `Dialogue: 0,${adjustedStart},${adjustedEnd},Default,,0,0,0,,${text}\n`;
                        }
                    }
                }
                const sceneDuration = scenes && scenes[i] ? scenes[i].duration : 5;
                currentTime += sceneDuration;
            }
            fs.writeFileSync(concatenatedSubtitlePath, concatenatedSubtitleContent);
        }
        const outputPath = path.join(os.tmpdir(), 'final-video.mp4');
        let videoFilter = '';
        if (subtitlePaths.length > 0 && fs.existsSync(concatenatedSubtitlePath)) {
        }
        const ffmpegCommand = ffmpeg()
            .input(fileListPath)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .input(concatenatedAudioPath);
        const outputOptions = [
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-shortest',
        ];
        if (subtitlePaths.length > 0 && fs.existsSync(concatenatedSubtitlePath)) {
            const subtitleFilter = `scale=1080:1920,ass=${concatenatedSubtitlePath}:fontsdir=/opt/fonts`;
            outputOptions.push('-vf', subtitleFilter);
        }
        else if (videoFilter) {
            outputOptions.push('-vf', videoFilter);
        }
        ffmpegCommand.outputOptions(outputOptions);
        await new Promise((resolve, reject) => {
            ffmpegCommand
                .output(outputPath)
                .on('end', () => {
                resolve();
            })
                .on('error', (err) => {
                console.error('❌ Video processing error:', err);
                reject(err);
            })
                .run();
        });
        videoPaths.forEach((videoPath) => {
            if (fs.existsSync(videoPath))
                fs.unlinkSync(videoPath);
        });
        audioPaths.forEach((audioPath) => {
            if (fs.existsSync(audioPath))
                fs.unlinkSync(audioPath);
        });
        subtitlePaths.forEach((subtitlePath) => {
            if (fs.existsSync(subtitlePath))
                fs.unlinkSync(subtitlePath);
        });
        if (fs.existsSync(fileListPath))
            fs.unlinkSync(fileListPath);
        if (fs.existsSync(concatenatedAudioPath))
            fs.unlinkSync(concatenatedAudioPath);
        if (fs.existsSync(concatenatedSubtitlePath))
            fs.unlinkSync(concatenatedSubtitlePath);
        return outputPath;
    }
    catch (error) {
        console.error('❌ Error in combineVideoAndAudio:', error);
        throw error;
    }
}
