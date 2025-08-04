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
exports.uploadToS3 = uploadToS3;
const client_s3_1 = require("@aws-sdk/client-s3");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const ffmpeg = require('fluent-ffmpeg');
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
const ffmpegPath = '/opt/bin/ffmpeg';
const ffprobePath = '/opt/bin/ffprobe';
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
async function logFfmpegCapabilities() {
    try {
        const { stdout: verOut } = await execAsync('/opt/bin/ffmpeg -version');
        console.log('FFmpeg version/build info:\n', verOut);
        const hasLibAss = verOut.includes('--enable-libass');
        const hasFreeType = verOut.includes('--enable-libfreetype');
        const hasFontconfig = verOut.includes('--enable-fontconfig');
        console.log('libass enabled:', hasLibAss);
        console.log('libfreetype enabled:', hasFreeType);
        console.log('fontconfig enabled:', hasFontconfig);
        const { stdout: filtersOut } = await execAsync('/opt/bin/ffmpeg -hide_banner -filters');
        const relevant = filtersOut
            .split('\n')
            .filter((l) => /drawtext|ass/.test(l))
            .join('\n');
        console.log('Relevant filters present:\n', relevant);
    }
    catch (err) {
        console.error('Failed to inspect ffmpeg capabilities:', err);
    }
}
async function combineVideoAndAudio(userId, timestamp) {
    console.log('🎬 Combining video, audio, and subtitles for user:', userId);
    console.log('🕐 Using timestamp prefix:', timestamp);
    try {
        await logFfmpegCapabilities();
        console.log('📋 Listing video files from S3...');
        const videoListResponse = await s3.send(new client_s3_1.ListObjectsV2Command({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Prefix: `${userId}/${timestamp}.scene-`,
            MaxKeys: 10,
        }));
        console.log('📋 Listing audio files from S3...');
        const audioListResponse = await s3.send(new client_s3_1.ListObjectsV2Command({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Prefix: `${userId}/${timestamp}.scene-`,
            MaxKeys: 10,
        }));
        console.log('📋 Listing subtitle files from S3...');
        const subtitleListResponse = await s3.send(new client_s3_1.ListObjectsV2Command({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Prefix: `${userId}/${timestamp}.scene-`,
            MaxKeys: 10,
        }));
        const videoFiles = videoListResponse.Contents?.filter((obj) => obj.Key?.endsWith('.mp4'))?.sort((a, b) => {
            const aIndex = parseInt(a.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
            const bIndex = parseInt(b.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
            return aIndex - bIndex;
        }) || [];
        const audioFiles = audioListResponse.Contents?.filter((obj) => obj.Key?.endsWith('.mp3'))?.sort((a, b) => {
            const aIndex = parseInt(a.Key?.match(/scene-(\d+)\.mp3/)?.[1] || '0');
            const bIndex = parseInt(b.Key?.match(/scene-(\d+)\.mp3/)?.[1] || '0');
            return aIndex - bIndex;
        }) || [];
        const subtitleFiles = subtitleListResponse.Contents?.filter((obj) => obj.Key?.endsWith('.ass'))?.sort((a, b) => {
            const aIndex = parseInt(a.Key?.match(/scene-(\d+)\.ass/)?.[1] || '0');
            const bIndex = parseInt(b.Key?.match(/scene-(\d+)\.ass/)?.[1] || '0');
            return aIndex - bIndex;
        }) || [];
        console.log(`📹 Found ${videoFiles.length} video files:`, videoFiles.map((f) => f.Key));
        console.log(`🎵 Found ${audioFiles.length} audio files:`, audioFiles.map((f) => f.Key));
        console.log(`📝 Found ${subtitleFiles.length} subtitle files:`, subtitleFiles.map((f) => f.Key));
        if (videoFiles.length === 0) {
            throw new Error('No video files found for user');
        }
        console.log('📥 Downloading video clips from S3...');
        const videoPaths = [];
        for (let i = 0; i < videoFiles.length; i++) {
            const videoFile = videoFiles[i];
            if (!videoFile.Key)
                continue;
            const videoPath = path.join(os.tmpdir(), `video-${i}.mp4`);
            console.log(`📥 Downloading ${videoFile.Key} to ${videoPath}`);
            const videoObject = await s3.send(new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: videoFile.Key,
            }));
            const videoBuffer = Buffer.from(await videoObject.Body.transformToByteArray());
            fs.writeFileSync(videoPath, videoBuffer);
            videoPaths.push(videoPath);
            console.log(`✅ Downloaded video ${i + 1}/${videoFiles.length}`);
        }
        console.log('📥 Downloading audio files from S3...');
        const audioPaths = [];
        for (let i = 0; i < audioFiles.length; i++) {
            const audioFile = audioFiles[i];
            if (!audioFile.Key)
                continue;
            const audioPath = path.join(os.tmpdir(), `audio-${i}.mp3`);
            console.log(`📥 Downloading ${audioFile.Key} to ${audioPath}`);
            const audioObject = await s3.send(new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: audioFile.Key,
            }));
            const audioBuffer = Buffer.from(await audioObject.Body.transformToByteArray());
            fs.writeFileSync(audioPath, audioBuffer);
            audioPaths.push(audioPath);
            console.log(`✅ Downloaded audio ${i + 1}/${audioFiles.length}`);
        }
        console.log('📥 Downloading subtitle files from S3...');
        const subtitlePaths = [];
        for (let i = 0; i < subtitleFiles.length; i++) {
            const subtitleFile = subtitleFiles[i];
            if (!subtitleFile.Key)
                continue;
            const subtitlePath = path.join(os.tmpdir(), `subtitle-${i}.ass`);
            console.log(`📥 Downloading ${subtitleFile.Key} to ${subtitlePath}`);
            const subtitleObject = await s3.send(new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: subtitleFile.Key,
            }));
            const subtitleBuffer = Buffer.from(await subtitleObject.Body.transformToByteArray());
            fs.writeFileSync(subtitlePath, subtitleBuffer);
            subtitlePaths.push(subtitlePath);
            console.log(`✅ Downloaded subtitle ${i + 1}/${subtitleFiles.length}`);
        }
        const fileListPath = path.join(os.tmpdir(), 'filelist.txt');
        const fileListContent = videoPaths
            .map((videoPath) => `file '${videoPath}'`)
            .join('\n');
        fs.writeFileSync(fileListPath, fileListContent);
        console.log('📄 Created file list for concatenation');
        const concatenatedAudioPath = path.join(os.tmpdir(), 'concatenated-audio.mp3');
        console.log('🎵 Concatenating audio files...');
        const audioConcatCommand = ffmpeg();
        audioPaths.forEach((audioPath) => {
            audioConcatCommand.input(audioPath);
        });
        await new Promise((resolve, reject) => {
            audioConcatCommand
                .on('end', () => {
                console.log('✅ Audio concatenation completed');
                resolve();
            })
                .on('error', (err) => {
                console.error('❌ Audio concatenation error:', err);
                reject(err);
            })
                .mergeToFile(concatenatedAudioPath, os.tmpdir());
        });
        const concatenatedSubtitlePath = path.join(os.tmpdir(), 'concatenated-subtitles.ass');
        console.log('📝 Concatenating ASS subtitle files...');
        if (subtitlePaths.length > 0) {
            console.log('🔍 DEBUG: Starting subtitle concatenation for', subtitlePaths.length, 'files');
            let concatenatedSubtitleContent = createASSStyleHeader();
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
                        const dialogueMatch = line.match(/Dialogue: (\d+),(\d+:\d+:\d+\.\d+),(\d+:\d+:\d+\.\d+),([^,]*),([^,]*),(\d+),(\d+),(\d+),([^,]*),(.*)/);
                        if (dialogueMatch) {
                            const startTime = dialogueMatch[2];
                            const endTime = dialogueMatch[3];
                            const text = dialogueMatch[10];
                            const startSeconds = parseASSTime(startTime) + currentTime;
                            const endSeconds = parseASSTime(endTime) + currentTime;
                            const adjustedStart = formatASSTime(startSeconds);
                            const adjustedEnd = formatASSTime(endSeconds);
                            concatenatedSubtitleContent += `Dialogue: 0,${adjustedStart},${adjustedEnd},Default,,0,0,0,,${text}\n`;
                        }
                    }
                }
                if (videoPaths[i]) {
                    const videoDuration = await getVideoDuration(videoPaths[i]);
                    currentTime += videoDuration;
                }
            }
            fs.writeFileSync(concatenatedSubtitlePath, concatenatedSubtitleContent);
            console.log('✅ ASS subtitle concatenation completed');
            console.log('🔍 ASS file content preview:');
            console.log(concatenatedSubtitleContent.substring(0, 1000));
            console.log('🔍 ASS file size:', fs.statSync(concatenatedSubtitlePath).size, 'bytes');
            console.log('🔍 DEBUG: File written successfully to:', concatenatedSubtitlePath);
            console.log('🔍 DEBUG: File exists after write:', fs.existsSync(concatenatedSubtitlePath));
            console.log('📄 Concatenated ASS subtitle content preview:', concatenatedSubtitleContent.substring(0, 500));
            console.log('📁 Concatenated subtitle file path:', concatenatedSubtitlePath);
            console.log('📊 Concatenated subtitle file size:', fs.statSync(concatenatedSubtitlePath).size, 'bytes');
            try {
                const fileContent = fs.readFileSync(concatenatedSubtitlePath, 'utf-8');
                console.log('🔍 Full ASS file content:', fileContent);
                console.log('🔍 File contains subtitle entries:', fileContent.includes('Dialogue:'));
                console.log('🔍 Number of Dialogue entries:', (fileContent.match(/Dialogue:/g) || []).length);
            }
            catch (error) {
                console.error('❌ Error reading ASS file:', error);
            }
        }
        const outputPath = path.join(os.tmpdir(), 'final-video.mp4');
        console.log('🎬 Combining video, audio, and subtitles with FFmpeg...');
        let videoFilter = '';
        console.log('🔍 DEBUG: subtitlePaths.length:', subtitlePaths.length);
        console.log('🔍 DEBUG: subtitlePaths:', subtitlePaths);
        console.log('🔍 DEBUG: concatenatedSubtitlePath:', concatenatedSubtitlePath);
        console.log('🔍 DEBUG: concatenatedSubtitlePath exists:', fs.existsSync(concatenatedSubtitlePath));
        if (subtitlePaths.length > 0) {
            console.log('🔍 DEBUG: Checking individual subtitle files:');
            subtitlePaths.forEach((path, index) => {
                console.log(`  Subtitle ${index}: ${path} - exists: ${fs.existsSync(path)}`);
            });
        }
        if (subtitlePaths.length > 0 && fs.existsSync(concatenatedSubtitlePath)) {
            console.log('📝 Using .ass subtitle file directly');
            console.log('📄 ASS subtitle content preview:', fs.readFileSync(concatenatedSubtitlePath, 'utf-8').substring(0, 500));
            console.log('📝 Will use ASS subtitle file as input to FFmpeg');
        }
        const ffmpegCommand = ffmpeg()
            .input(fileListPath)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .input(concatenatedAudioPath);
        if (subtitlePaths.length > 0 && fs.existsSync(concatenatedSubtitlePath)) {
            console.log('📝 ASS subtitle file available for overlay filter');
        }
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
            console.log('🔍 Debugging ASS subtitle embedding...');
            console.log('📁 ASS file path:', concatenatedSubtitlePath);
            console.log('📄 ASS file exists:', fs.existsSync(concatenatedSubtitlePath));
            console.log('📏 ASS file size:', fs.statSync(concatenatedSubtitlePath).size, 'bytes');
            try {
                const assContent = fs.readFileSync(concatenatedSubtitlePath, 'utf-8');
                console.log('📄 ASS file content preview:', assContent.substring(0, 500));
                console.log('🔍 ASS file contains Dialogue entries:', (assContent.match(/Dialogue:/g) || []).length);
            }
            catch (error) {
                console.error('❌ Error reading ASS file:', error);
            }
            const subtitleFilter = `scale=1080:1920,ass=${concatenatedSubtitlePath}:fontsdir=/opt/fonts`;
            outputOptions.push('-vf', subtitleFilter);
            console.log('📝 Added scale and ASS subtitle embedding filter with fontsdir:', subtitleFilter);
            console.log('🔄 Alternative: Will also try subtitles filter if ass fails');
            const alternativeFilter = `scale=1080:1920,subtitles='${concatenatedSubtitlePath}'`;
            console.log('🔄 Alternative filter:', alternativeFilter);
            console.log('🧪 Testing ASS filter with fontsdir, checking FFmpeg logs for errors');
            outputOptions.push('-loglevel', 'debug');
            console.log('🔍 Added debug logging to FFmpeg command');
        }
        else if (videoFilter) {
            outputOptions.push('-vf', videoFilter);
        }
        ffmpegCommand.outputOptions(outputOptions);
        console.log('🎬 FFmpeg command prepared');
        console.log('📝 Subtitle paths found:', subtitlePaths.length);
        console.log('📁 Concatenated subtitle exists:', fs.existsSync(concatenatedSubtitlePath));
        console.log('🔧 Complete FFmpeg command structure:');
        const inputFiles = [fileListPath, concatenatedAudioPath];
        console.log('  Input files:', inputFiles);
        console.log('  Output file:', outputPath);
        console.log('  Using subtitle overlay:', subtitlePaths.length > 0 && fs.existsSync(concatenatedSubtitlePath));
        await new Promise((resolve, reject) => {
            ffmpegCommand
                .output(outputPath)
                .on('start', (commandLine) => {
                console.log('🔧 FFmpeg command being executed:', commandLine);
            })
                .on('end', () => {
                console.log('✅ Video processing completed');
                resolve();
            })
                .on('error', (err) => {
                console.error('❌ Video processing error:', err);
                reject(err);
            })
                .on('stderr', (stderrLine) => {
                if (stderrLine.includes('error') ||
                    stderrLine.includes('Error') ||
                    stderrLine.includes('failed') ||
                    stderrLine.includes('ass') ||
                    stderrLine.includes('subtitle') ||
                    stderrLine.includes('font')) {
                    console.log('📝 FFmpeg stderr:', stderrLine);
                }
            })
                .run();
        });
        console.log('🧹 Cleaning up temporary files...');
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
        console.log('✅ Cleanup completed');
        return outputPath;
    }
    catch (error) {
        console.error('❌ Error in combineVideoAndAudio:', error);
        throw error;
    }
}
function parseTimeToSeconds(timeString) {
    const match = timeString.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    if (match) {
        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const seconds = parseInt(match[3]);
        const milliseconds = parseInt(match[4]);
        return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
    }
    return 0;
}
function formatSecondsToTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds
        .toString()
        .padStart(3, '0')}`;
}
function parseASSTime(assTime) {
    const match = assTime.match(/^(\d+):(\d{2}):(\d{2})\.(\d{2,3})$/);
    if (!match)
        return 0;
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseInt(match[3]);
    let fraction = match[4];
    let ms = 0;
    if (fraction.length === 2) {
        ms = parseInt(fraction) * 10;
    }
    else {
        ms = parseInt(fraction);
    }
    return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}
function formatASSTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const centis = Math.round((seconds % 1) * 100);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
        .toString()
        .padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}
function createASSStyleHeader() {
    let header = '[Script Info]\n';
    header += 'Title: Test\n';
    header += 'ScriptType: v4.00+\n';
    header += 'WrapStyle: 1\n';
    header += 'ScaledBorderAndShadow: yes\n';
    header += 'YCbCr Matrix: None\n';
    header += 'PlayResX: 1080\n';
    header += 'PlayResY: 1920\n\n';
    header += '[V4+ Styles]\n';
    header +=
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n';
    header +=
        'Style: Default,LiberationSans,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1\n\n';
    header += '[Events]\n';
    header +=
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
    return header;
}
async function getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                console.warn('⚠️ Could not get video duration, using default:', err);
                resolve(5);
            }
            else {
                resolve(metadata.format.duration || 5);
            }
        });
    });
}
async function uploadToS3(filePath, userId, timestamp) {
    try {
        console.log(`📁 Reading file: ${filePath}`);
        const fileBuffer = fs.readFileSync(filePath);
        console.log(`📊 File size: ${fileBuffer.length} bytes`);
        const videoKey = `${userId}/${timestamp}-final-video.mp4`;
        console.log(`☁️ Uploading to S3: ${process.env.VIDEO_BUCKET_NAME}/${videoKey}`);
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: process.env.VIDEO_BUCKET_NAME,
            Key: videoKey,
            Body: fileBuffer,
            ContentType: 'video/mp4',
        }));
        console.log('✅ Upload successful');
        return videoKey;
    }
    catch (error) {
        console.error('❌ Error uploading to S3:', error);
        throw error;
    }
}
