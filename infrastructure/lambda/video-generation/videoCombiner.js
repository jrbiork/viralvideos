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
const ffmpeg = require('fluent-ffmpeg');
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
const ffmpegPath = '/opt/bin/ffmpeg';
const ffprobePath = '/opt/bin/ffprobe';
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
async function combineVideoAndAudio(userId, timestamp, scenes) {
    console.log('🎬 Combining video, audio, and subtitles scene by scene for user:', userId);
    try {
        const listResponse = await s3.send(new client_s3_1.ListObjectsV2Command({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Prefix: `${userId}/${timestamp}.scene-`,
            MaxKeys: 100,
        }));
        const objs = listResponse.Contents || [];
        const videoFiles = objs
            .filter((obj) => obj.Key?.endsWith('.mp4') && !obj.Key?.includes('-combined'))
            .sort((a, b) => {
            const aId = parseInt(a.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
            const bId = parseInt(b.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
            return aId - bId;
        });
        console.log('🔍 Found video files:', videoFiles.map((f) => f.Key));
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
        const combinedScenePaths = [];
        for (let i = 0; i < videoFiles.length; i++) {
            const videoFile = videoFiles[i];
            const audioFile = audioFiles[i];
            const subtitleFile = subtitleFiles[i];
            if (!videoFile.Key)
                continue;
            const sceneIdMatch = videoFile.Key.match(/scene-(\d+)\.mp4/);
            const sceneId = sceneIdMatch ? parseInt(sceneIdMatch[1]) : i;
            console.log(`🎬 Processing scene ${i} (ID: ${sceneId}): combining video + audio + subtitle`);
            const videoPath = path.join(os.tmpdir(), `scene-${i}-video.mp4`);
            const videoObject = await s3.send(new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: videoFile.Key,
            }));
            const videoBuffer = Buffer.from(await videoObject.Body.transformToByteArray());
            fs.writeFileSync(videoPath, videoBuffer);
            let audioPath = null;
            if (audioFile?.Key) {
                audioPath = path.join(os.tmpdir(), `scene-${i}-audio.mp3`);
                const audioObject = await s3.send(new client_s3_1.GetObjectCommand({
                    Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                    Key: audioFile.Key,
                }));
                const audioBuffer = Buffer.from(await audioObject.Body.transformToByteArray());
                fs.writeFileSync(audioPath, audioBuffer);
            }
            let subtitlePath = null;
            if (subtitleFile?.Key) {
                subtitlePath = path.join(os.tmpdir(), `scene-${i}-subtitle.ass`);
                const subtitleObject = await s3.send(new client_s3_1.GetObjectCommand({
                    Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                    Key: subtitleFile.Key,
                }));
                const subtitleBuffer = Buffer.from(await subtitleObject.Body.transformToByteArray());
                fs.writeFileSync(subtitlePath, subtitleBuffer);
            }
            const combinedScenePath = path.join(os.tmpdir(), `scene-${i}-combined.mp4`);
            const ffmpegCommand = ffmpeg().input(videoPath);
            if (audioPath) {
                ffmpegCommand.input(audioPath);
            }
            ffmpegCommand.inputOptions(['-async', '1', '-itsoffset', '0']);
            const outputOptions = [
                '-c:v',
                'libx264',
                '-pix_fmt',
                'yuv420p',
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                '-map',
                '0:v:0',
                '-shortest',
                '-vsync',
                '1',
            ];
            if (audioPath) {
                outputOptions.push('-map', '1:a:0');
            }
            if (subtitlePath && fs.existsSync(subtitlePath)) {
                const subtitleFilter = `scale=1080:1920,ass=${subtitlePath}:fontsdir=/opt/fonts`;
                outputOptions.push('-vf', subtitleFilter);
            }
            ffmpegCommand.outputOptions(outputOptions);
            await new Promise((resolve, reject) => {
                ffmpegCommand
                    .output(combinedScenePath)
                    .on('end', () => {
                    console.log(`✅ Scene ${i} combined successfully`);
                    resolve();
                })
                    .on('error', (err) => {
                    console.error(`❌ Error combining scene ${i}:`, err);
                    reject(err);
                })
                    .run();
            });
            try {
                const combinedSceneBuffer = fs.readFileSync(combinedScenePath);
                const combinedSceneKey = `${userId}/${timestamp}.scene-${i}-combined.mp4`;
                await s3.send(new client_s3_1.PutObjectCommand({
                    Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                    Key: combinedSceneKey,
                    Body: combinedSceneBuffer,
                    ContentType: 'video/mp4',
                }));
                console.log(`💾 Scene ${i} (ID: ${sceneId}) combined file saved to S3: ${combinedSceneKey}`);
            }
            catch (error) {
                console.warn(`⚠️ Could not save combined scene ${i} (ID: ${sceneId}) to S3:`, error);
            }
            combinedScenePaths.push(combinedScenePath);
            if (fs.existsSync(videoPath))
                fs.unlinkSync(videoPath);
            if (audioPath && fs.existsSync(audioPath))
                fs.unlinkSync(audioPath);
            if (subtitlePath && fs.existsSync(subtitlePath))
                fs.unlinkSync(subtitlePath);
        }
        console.log('🎬 Concatenating all combined scenes...');
        const fileListPath = path.join(os.tmpdir(), 'combined-scenes-filelist.txt');
        const fileListContent = combinedScenePaths
            .map((scenePath) => `file '${scenePath}'`)
            .join('\n');
        fs.writeFileSync(fileListPath, fileListContent);
        const finalOutputPath = path.join(os.tmpdir(), 'final-video.mp4');
        const concatCommand = ffmpeg()
            .input(fileListPath)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions([
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
        ])
            .output(finalOutputPath);
        await new Promise((resolve, reject) => {
            concatCommand
                .on('end', () => {
                console.log('✅ All scenes concatenated successfully');
                resolve();
            })
                .on('error', (err) => {
                console.error('❌ Error concatenating scenes:', err);
                reject(err);
            })
                .run();
        });
        combinedScenePaths.forEach((scenePath) => {
            if (fs.existsSync(scenePath))
                fs.unlinkSync(scenePath);
        });
        if (fs.existsSync(fileListPath))
            fs.unlinkSync(fileListPath);
        return finalOutputPath;
    }
    catch (error) {
        console.error('❌ Error in combineVideoAndAudio:', error);
        throw error;
    }
}
