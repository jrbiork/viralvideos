"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.combineVideoAndAudio = combineVideoAndAudio;
exports.uploadToS3 = uploadToS3;
const client_s3_1 = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");
const os = require("os");
const ffmpeg = require('fluent-ffmpeg');
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
// Configure FFmpeg paths for Lambda environment
const ffmpegPath = '/opt/ffmpeg/ffmpeg';
const ffprobePath = '/opt/ffmpeg/ffprobe';
// Set FFmpeg paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
async function combineVideoAndAudio(userId, timestamp) {
    console.log('🎬 Combining video, audio, and subtitles for user:', userId);
    console.log('🕐 Using timestamp prefix:', timestamp);
    try {
        // List all video files for the user with timestamp prefix
        console.log('📋 Listing video files from S3...');
        const videoListResponse = await s3.send(new client_s3_1.ListObjectsV2Command({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Prefix: `${userId}/${timestamp}.scene-`,
            MaxKeys: 10,
        }));
        // List all audio files for the user with timestamp prefix
        console.log('📋 Listing audio files from S3...');
        const audioListResponse = await s3.send(new client_s3_1.ListObjectsV2Command({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Prefix: `${userId}/${timestamp}.scene-`,
            MaxKeys: 10,
        }));
        // List all subtitle files for the user with timestamp prefix
        console.log('📋 Listing subtitle files from S3...');
        const subtitleListResponse = await s3.send(new client_s3_1.ListObjectsV2Command({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Prefix: `${userId}/${timestamp}.scene-`,
            MaxKeys: 10,
        }));
        // Filter and sort video files
        const videoFiles = videoListResponse.Contents?.filter((obj) => obj.Key?.endsWith('.mp4'))?.sort((a, b) => {
            const aIndex = parseInt(a.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
            const bIndex = parseInt(b.Key?.match(/scene-(\d+)\.mp4/)?.[1] || '0');
            return aIndex - bIndex;
        }) || [];
        // Filter and sort audio files
        const audioFiles = audioListResponse.Contents?.filter((obj) => obj.Key?.endsWith('.mp3'))?.sort((a, b) => {
            const aIndex = parseInt(a.Key?.match(/scene-(\d+)\.mp3/)?.[1] || '0');
            const bIndex = parseInt(b.Key?.match(/scene-(\d+)\.mp3/)?.[1] || '0');
            return aIndex - bIndex;
        }) || [];
        // Filter and sort subtitle files
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
        // Download all video clips from S3
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
        // Download all audio files from S3
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
        // Download all subtitle files from S3
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
        // Create a file list for FFmpeg concatenation
        const fileListPath = path.join(os.tmpdir(), 'filelist.txt');
        const fileListContent = videoPaths
            .map((videoPath) => `file '${videoPath}'`)
            .join('\n');
        fs.writeFileSync(fileListPath, fileListContent);
        console.log('📄 Created file list for concatenation');
        // Create concatenated audio file
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
        // Create concatenated subtitle file
        const concatenatedSubtitlePath = path.join(os.tmpdir(), 'concatenated-subtitles.ass');
        console.log('📝 Concatenating subtitle files...');
        if (subtitlePaths.length > 0) {
            // For ASS files, we need to concatenate them differently
            // First, get the header and styles from the first file
            const firstSubtitleContent = fs.readFileSync(subtitlePaths[0], 'utf-8');
            const lines = firstSubtitleContent.split('\n');
            let concatenatedSubtitleContent = '';
            let inEvents = false;
            let currentTime = 0;
            // Extract header and styles from first file
            for (const line of lines) {
                if (line.startsWith('[Events]')) {
                    concatenatedSubtitleContent += line + '\n';
                    concatenatedSubtitleContent +=
                        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
                    inEvents = true;
                    break;
                }
                concatenatedSubtitleContent += line + '\n';
            }
            // Now process each subtitle file and adjust timestamps
            for (let i = 0; i < subtitlePaths.length; i++) {
                const subtitleContent = fs.readFileSync(subtitlePaths[i], 'utf-8');
                const subtitleLines = subtitleContent.split('\n');
                let inEventsSection = false;
                for (const line of subtitleLines) {
                    if (line.startsWith('[Events]')) {
                        inEventsSection = true;
                        continue;
                    }
                    if (inEventsSection && line.startsWith('Dialogue:')) {
                        // Parse ASS dialogue line: Dialogue: 0,0:00:00.00,0:00:01.42,Default,,0,0,0,,Text
                        const dialogueMatch = line.match(/Dialogue: 0,([^,]+),([^,]+),([^,]+),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),(.+)/);
                        if (dialogueMatch) {
                            const originalStart = dialogueMatch[1];
                            const originalEnd = dialogueMatch[2];
                            const style = dialogueMatch[3];
                            const name = dialogueMatch[4];
                            const marginL = dialogueMatch[5];
                            const marginR = dialogueMatch[6];
                            const marginV = dialogueMatch[7];
                            const effect = dialogueMatch[8];
                            const text = dialogueMatch[9];
                            // Convert ASS time format (H:MM:SS.cc) to seconds, add current time, then convert back
                            const startSeconds = parseASSTime(originalStart) + currentTime;
                            const endSeconds = parseASSTime(originalEnd) + currentTime;
                            const adjustedStart = formatASSTime(startSeconds);
                            const adjustedEnd = formatASSTime(endSeconds);
                            concatenatedSubtitleContent += `Dialogue: 0,${adjustedStart},${adjustedEnd},${style},${name},${marginL},${marginR},${marginV},${effect},${text}\n`;
                        }
                    }
                }
                // Add scene duration to current time for next scene
                if (videoPaths[i]) {
                    // Get video duration using ffprobe
                    const videoDuration = await getVideoDuration(videoPaths[i]);
                    currentTime += videoDuration;
                }
            }
            fs.writeFileSync(concatenatedSubtitlePath, concatenatedSubtitleContent);
            console.log('✅ Subtitle concatenation completed');
            console.log('📄 Concatenated subtitle content preview:', concatenatedSubtitleContent.substring(0, 500));
            console.log('📁 Concatenated subtitle file path:', concatenatedSubtitlePath);
            console.log('📊 Concatenated subtitle file size:', fs.statSync(concatenatedSubtitlePath).size, 'bytes');
            // Debug: Check if the file is readable and has valid content
            try {
                const fileContent = fs.readFileSync(concatenatedSubtitlePath, 'utf-8');
                console.log('🔍 Full ASS file content:', fileContent);
                console.log('🔍 File starts with ASS header:', fileContent.startsWith('[Script Info]'));
                console.log('🔍 File contains Events section:', fileContent.includes('[Events]'));
                console.log('🔍 File contains Dialogue lines:', fileContent.includes('Dialogue:'));
            }
            catch (error) {
                console.error('❌ Error reading ASS file:', error);
            }
        }
        // Combine video, audio, and subtitles using FFmpeg
        const outputPath = path.join(os.tmpdir(), 'final-video.mp4');
        console.log('🎬 Combining video, audio, and subtitles with FFmpeg...');
        // Prepare video filter with scaling and subtitles
        let videoFilter = 'scale=1080:1920'; // Base scaling filter
        // Add subtitle filter if available
        if (subtitlePaths.length > 0 && fs.existsSync(concatenatedSubtitlePath)) {
            console.log('📝 Using ASS subtitle format');
            console.log('📄 ASS subtitle content preview:', fs.readFileSync(concatenatedSubtitlePath, 'utf-8').substring(0, 500));
            // Convert ASS to SRT for better compatibility with subtitles filter
            const srtSubtitlePath = concatenatedSubtitlePath.replace('.ass', '.srt');
            const assContent = fs.readFileSync(concatenatedSubtitlePath, 'utf-8');
            const srtContent = convertASStoSRT(assContent);
            fs.writeFileSync(srtSubtitlePath, srtContent);
            console.log('📝 Converted ASS to SRT for subtitle burning');
            console.log('📄 SRT subtitle content preview:', srtContent.substring(0, 500));
            // Use subtitles filter with SRT file (more widely supported)
            const absolutePath = srtSubtitlePath.replace(/\\/g, '/');
            videoFilter += `,subtitles='${absolutePath}':force_style='FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,BackColour=&H000000,Bold=1,Outline=2'`;
            console.log('📝 Adding subtitle filter to video:', videoFilter);
        }
        const ffmpegCommand = ffmpeg()
            .input(fileListPath)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .input(concatenatedAudioPath);
        // Add subtitle file as input if available
        if (subtitlePaths.length > 0 && fs.existsSync(concatenatedSubtitlePath)) {
            ffmpegCommand.input(concatenatedSubtitlePath);
        }
        ffmpegCommand.outputOptions([
            '-c:v',
            'libx264', // Video codec
            '-c:a',
            'aac', // Audio codec
            '-b:a',
            '128k', // Audio bitrate
            '-pix_fmt',
            'yuv420p', // Pixel format for compatibility
            '-vf',
            videoFilter, // Combined scaling and subtitle filter
            '-r',
            '30', // Frame rate
            '-shortest', // End when shortest input ends
        ]);
        console.log('🎬 FFmpeg command prepared with video filter:', videoFilter);
        console.log('📝 Subtitle paths found:', subtitlePaths.length);
        console.log('📁 Concatenated subtitle exists:', fs.existsSync(concatenatedSubtitlePath));
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
                // Only log error messages, not verbose info
                if (stderrLine.includes('error') ||
                    stderrLine.includes('Error') ||
                    stderrLine.includes('failed')) {
                    console.log('📝 FFmpeg stderr:', stderrLine);
                }
            })
                .run();
        });
        // Clean up temporary files
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
    // Parse ASS time format: HH:MM:SS.mmm (e.g., "00:00:00.000")
    const match = assTime.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
    if (match) {
        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const seconds = parseInt(match[3]);
        const milliseconds = parseInt(match[4]);
        return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
    }
    return 0;
}
function formatASSTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${milliseconds
        .toString()
        .padStart(3, '0')}`;
}
function extractSubtitleText(assContent) {
    const lines = assContent.split('\n');
    let subtitleText = '';
    let inEvents = false;
    for (const line of lines) {
        if (line.startsWith('[Events]')) {
            inEvents = true;
            continue;
        }
        if (inEvents && line.startsWith('Dialogue:')) {
            // Parse ASS dialogue line and extract text
            const dialogueMatch = line.match(/Dialogue: 0,[^,]+,[^,]+,[^,]+,[^,]*,[^,]*,[^,]*,[^,]*,[^,]*,([^,]+)/);
            if (dialogueMatch) {
                const text = dialogueMatch[1];
                if (subtitleText)
                    subtitleText += ' ';
                subtitleText += text;
            }
        }
    }
    return subtitleText || 'Subtitles Available';
}
function convertASStoSRT(assContent) {
    const lines = assContent.split('\n');
    let srtContent = '';
    let subtitleIndex = 1;
    let inEvents = false;
    for (const line of lines) {
        if (line.startsWith('[Events]')) {
            inEvents = true;
            continue;
        }
        if (inEvents && line.startsWith('Dialogue:')) {
            // Parse ASS dialogue line: Dialogue: 0,0:00:00.00,0:00:01.42,Default,,0,0,0,,Text
            const dialogueMatch = line.match(/Dialogue: 0,([^,]+),([^,]+),([^,]+),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),(.+)/);
            if (dialogueMatch) {
                const startTime = dialogueMatch[1];
                const endTime = dialogueMatch[2];
                const text = dialogueMatch[9];
                // Convert ASS time format to SRT format
                const srtStartTime = convertASSTimeToSRT(startTime);
                const srtEndTime = convertASSTimeToSRT(endTime);
                srtContent += `${subtitleIndex}\n`;
                srtContent += `${srtStartTime} --> ${srtEndTime}\n`;
                srtContent += `${text}\n\n`;
                subtitleIndex++;
            }
        }
    }
    return srtContent;
}
function convertASSTimeToSRT(assTime) {
    // Convert ASS time format (HH:MM:SS.mmm) to SRT format (HH:MM:SS,mmm)
    const match = assTime.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
    if (match) {
        const hours = match[1];
        const minutes = match[2];
        const seconds = match[3];
        const milliseconds = match[4];
        return `${hours}:${minutes}:${seconds},${milliseconds}`;
    }
    return assTime; // Return original if no match
}
async function getVideoDuration(videoPath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(videoPath, (err, metadata) => {
            if (err) {
                console.warn('⚠️ Could not get video duration, using default:', err);
                resolve(5); // Default duration
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tYmluZVZpZGVvLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29tYmluZVZpZGVvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBMkJBLG9EQXdhQztBQStJRCxnQ0E4QkM7QUFobkJELGtEQUs0QjtBQUM1Qix5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLHlCQUF5QjtBQUN6QixNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUM7QUFFeEMsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUU1RCxnREFBZ0Q7QUFDaEQsTUFBTSxVQUFVLEdBQUcsb0JBQW9CLENBQUM7QUFDeEMsTUFBTSxXQUFXLEdBQUcscUJBQXFCLENBQUM7QUFFMUMsbUJBQW1CO0FBQ25CLE1BQU0sQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUM7QUFDakMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQztBQVE1QixLQUFLLFVBQVUsb0JBQW9CLENBQ3hDLE1BQWMsRUFDZCxTQUFpQjtJQUVqQixPQUFPLENBQUMsR0FBRyxDQUFDLG9EQUFvRCxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQzFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsNEJBQTRCLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFFckQsSUFBSSxDQUFDO1FBQ0gsMERBQTBEO1FBQzFELE9BQU8sQ0FBQyxHQUFHLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUNqRCxNQUFNLGlCQUFpQixHQUFHLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FDckMsSUFBSSxnQ0FBb0IsQ0FBQztZQUN2QixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUI7WUFDM0MsTUFBTSxFQUFFLEdBQUcsTUFBTSxJQUFJLFNBQVMsU0FBUztZQUN2QyxPQUFPLEVBQUUsRUFBRTtTQUNaLENB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dE9iamVjdENvbW1hbmQsXG4gIFB1dE9iamVjdENvbW1hbmQsXG4gIExpc3RPYmplY3RzVjJDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmNvbnN0IGZmbXBlZyA9IHJlcXVpcmUoJ2ZsdWVudC1mZm1wZWcnKTtcblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5cbi8vIENvbmZpZ3VyZSBGRm1wZWcgcGF0aHMgZm9yIExhbWJkYSBlbnZpcm9ubWVudFxuY29uc3QgZmZtcGVnUGF0aCA9ICcvb3B0L2ZmbXBlZy9mZm1wZWcnO1xuY29uc3QgZmZwcm9iZVBhdGggPSAnL29wdC9mZm1wZWcvZmZwcm9iZSc7XG5cbi8vIFNldCBGRm1wZWcgcGF0aHNcbmZmbXBlZy5zZXRGZm1wZWdQYXRoKGZmbXBlZ1BhdGgpO1xuZmZtcGVnLnNldEZmcHJvYmVQYXRoKGZmcHJvYmVQYXRoKTtcblxuZXhwb3J0IGludGVyZmFjZSBTY2VuZSB7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIG5hcnJhdGlvbjogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYmluZVZpZGVvQW5kQXVkaW8oXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnNvbGUubG9nKCfwn46sIENvbWJpbmluZyB2aWRlbywgYXVkaW8sIGFuZCBzdWJ0aXRsZXMgZm9yIHVzZXI6JywgdXNlcklkKTtcbiAgY29uc29sZS5sb2coJ/CflZAgVXNpbmcgdGltZXN0YW1wIHByZWZpeDonLCB0aW1lc3RhbXApO1xuXG4gIHRyeSB7XG4gICAgLy8gTGlzdCBhbGwgdmlkZW8gZmlsZXMgZm9yIHRoZSB1c2VyIHdpdGggdGltZXN0YW1wIHByZWZpeFxuICAgIGNvbnNvbGUubG9nKCfwn5OLIExpc3RpbmcgdmlkZW8gZmlsZXMgZnJvbSBTMy4uLicpO1xuICAgIGNvbnN0IHZpZGVvTGlzdFJlc3BvbnNlID0gYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBMaXN0T2JqZWN0c1YyQ29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgIFByZWZpeDogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtYCxcbiAgICAgICAgTWF4S2V5czogMTAsXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gTGlzdCBhbGwgYXVkaW8gZmlsZXMgZm9yIHRoZSB1c2VyIHdpdGggdGltZXN0YW1wIHByZWZpeFxuICAgIGNvbnNvbGUubG9nKCfwn5OLIExpc3RpbmcgYXVkaW8gZmlsZXMgZnJvbSBTMy4uLicpO1xuICAgIGNvbnN0IGF1ZGlvTGlzdFJlc3BvbnNlID0gYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBMaXN0T2JqZWN0c1YyQ29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgIFByZWZpeDogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtYCxcbiAgICAgICAgTWF4S2V5czogMTAsXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gTGlzdCBhbGwgc3VidGl0bGUgZmlsZXMgZm9yIHRoZSB1c2VyIHdpdGggdGltZXN0YW1wIHByZWZpeFxuICAgIGNvbnNvbGUubG9nKCfwn5OLIExpc3Rpbmcgc3VidGl0bGUgZmlsZXMgZnJvbSBTMy4uLicpO1xuICAgIGNvbnN0IHN1YnRpdGxlTGlzdFJlc3BvbnNlID0gYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBMaXN0T2JqZWN0c1YyQ29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgIFByZWZpeDogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtYCxcbiAgICAgICAgTWF4S2V5czogMTAsXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gRmlsdGVyIGFuZCBzb3J0IHZpZGVvIGZpbGVzXG4gICAgY29uc3QgdmlkZW9GaWxlcyA9XG4gICAgICB2aWRlb0xpc3RSZXNwb25zZS5Db250ZW50cz8uZmlsdGVyKChvYmopID0+XG4gICAgICAgIG9iai5LZXk/LmVuZHNXaXRoKCcubXA0JyksXG4gICAgICApPy5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgIGNvbnN0IGFJbmRleCA9IHBhcnNlSW50KGEuS2V5Py5tYXRjaCgvc2NlbmUtKFxcZCspXFwubXA0Lyk/LlsxXSB8fCAnMCcpO1xuICAgICAgICBjb25zdCBiSW5kZXggPSBwYXJzZUludChiLktleT8ubWF0Y2goL3NjZW5lLShcXGQrKVxcLm1wNC8pPy5bMV0gfHwgJzAnKTtcbiAgICAgICAgcmV0dXJuIGFJbmRleCAtIGJJbmRleDtcbiAgICAgIH0pIHx8IFtdO1xuXG4gICAgLy8gRmlsdGVyIGFuZCBzb3J0IGF1ZGlvIGZpbGVzXG4gICAgY29uc3QgYXVkaW9GaWxlcyA9XG4gICAgICBhdWRpb0xpc3RSZXNwb25zZS5Db250ZW50cz8uZmlsdGVyKChvYmopID0+XG4gICAgICAgIG9iai5LZXk/LmVuZHNXaXRoKCcubXAzJyksXG4gICAgICApPy5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgIGNvbnN0IGFJbmRleCA9IHBhcnNlSW50KGEuS2V5Py5tYXRjaCgvc2NlbmUtKFxcZCspXFwubXAzLyk/LlsxXSB8fCAnMCcpO1xuICAgICAgICBjb25zdCBiSW5kZXggPSBwYXJzZUludChiLktleT8ubWF0Y2goL3NjZW5lLShcXGQrKVxcLm1wMy8pPy5bMV0gfHwgJzAnKTtcbiAgICAgICAgcmV0dXJuIGFJbmRleCAtIGJJbmRleDtcbiAgICAgIH0pIHx8IFtdO1xuXG4gICAgLy8gRmlsdGVyIGFuZCBzb3J0IHN1YnRpdGxlIGZpbGVzXG4gICAgY29uc3Qgc3VidGl0bGVGaWxlcyA9XG4gICAgICBzdWJ0aXRsZUxpc3RSZXNwb25zZS5Db250ZW50cz8uZmlsdGVyKChvYmopID0+XG4gICAgICAgIG9iai5LZXk/LmVuZHNXaXRoKCcuYXNzJyksXG4gICAgICApPy5zb3J0KChhLCBiKSA9PiB7XG4gICAgICAgIGNvbnN0IGFJbmRleCA9IHBhcnNlSW50KGEuS2V5Py5tYXRjaCgvc2NlbmUtKFxcZCspXFwuYXNzLyk/LlsxXSB8fCAnMCcpO1xuICAgICAgICBjb25zdCBiSW5kZXggPSBwYXJzZUludChiLktleT8ubWF0Y2goL3NjZW5lLShcXGQrKVxcLmFzcy8pPy5bMV0gfHwgJzAnKTtcbiAgICAgICAgcmV0dXJuIGFJbmRleCAtIGJJbmRleDtcbiAgICAgIH0pIHx8IFtdO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBg8J+TuSBGb3VuZCAke3ZpZGVvRmlsZXMubGVuZ3RofSB2aWRlbyBmaWxlczpgLFxuICAgICAgdmlkZW9GaWxlcy5tYXAoKGYpID0+IGYuS2V5KSxcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYPCfjrUgRm91bmQgJHthdWRpb0ZpbGVzLmxlbmd0aH0gYXVkaW8gZmlsZXM6YCxcbiAgICAgIGF1ZGlvRmlsZXMubWFwKChmKSA9PiBmLktleSksXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGDwn5OdIEZvdW5kICR7c3VidGl0bGVGaWxlcy5sZW5ndGh9IHN1YnRpdGxlIGZpbGVzOmAsXG4gICAgICBzdWJ0aXRsZUZpbGVzLm1hcCgoZikgPT4gZi5LZXkpLFxuICAgICk7XG5cbiAgICBpZiAodmlkZW9GaWxlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gdmlkZW8gZmlsZXMgZm91bmQgZm9yIHVzZXInKTtcbiAgICB9XG5cbiAgICAvLyBEb3dubG9hZCBhbGwgdmlkZW8gY2xpcHMgZnJvbSBTM1xuICAgIGNvbnNvbGUubG9nKCfwn5OlIERvd25sb2FkaW5nIHZpZGVvIGNsaXBzIGZyb20gUzMuLi4nKTtcbiAgICBjb25zdCB2aWRlb1BhdGhzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdmlkZW9GaWxlcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgdmlkZW9GaWxlID0gdmlkZW9GaWxlc1tpXTtcbiAgICAgIGlmICghdmlkZW9GaWxlLktleSkgY29udGludWU7XG5cbiAgICAgIGNvbnN0IHZpZGVvUGF0aCA9IHBhdGguam9pbihvcy50bXBkaXIoKSwgYHZpZGVvLSR7aX0ubXA0YCk7XG5cbiAgICAgIGNvbnNvbGUubG9nKGDwn5OlIERvd25sb2FkaW5nICR7dmlkZW9GaWxlLktleX0gdG8gJHt2aWRlb1BhdGh9YCk7XG4gICAgICBjb25zdCB2aWRlb09iamVjdCA9IGF3YWl0IHMzLnNlbmQoXG4gICAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogdmlkZW9GaWxlLktleSxcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgICBjb25zdCB2aWRlb0J1ZmZlciA9IEJ1ZmZlci5mcm9tKFxuICAgICAgICBhd2FpdCB2aWRlb09iamVjdC5Cb2R5IS50cmFuc2Zvcm1Ub0J5dGVBcnJheSgpLFxuICAgICAgKTtcbiAgICAgIGZzLndyaXRlRmlsZVN5bmModmlkZW9QYXRoLCB2aWRlb0J1ZmZlcik7XG4gICAgICB2aWRlb1BhdGhzLnB1c2godmlkZW9QYXRoKTtcbiAgICAgIGNvbnNvbGUubG9nKGDinIUgRG93bmxvYWRlZCB2aWRlbyAke2kgKyAxfS8ke3ZpZGVvRmlsZXMubGVuZ3RofWApO1xuICAgIH1cblxuICAgIC8vIERvd25sb2FkIGFsbCBhdWRpbyBmaWxlcyBmcm9tIFMzXG4gICAgY29uc29sZS5sb2coJ/Cfk6UgRG93bmxvYWRpbmcgYXVkaW8gZmlsZXMgZnJvbSBTMy4uLicpO1xuICAgIGNvbnN0IGF1ZGlvUGF0aHM6IHN0cmluZ1tdID0gW107XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhdWRpb0ZpbGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBhdWRpb0ZpbGUgPSBhdWRpb0ZpbGVzW2ldO1xuICAgICAgaWYgKCFhdWRpb0ZpbGUuS2V5KSBjb250aW51ZTtcblxuICAgICAgY29uc3QgYXVkaW9QYXRoID0gcGF0aC5qb2luKG9zLnRtcGRpcigpLCBgYXVkaW8tJHtpfS5tcDNgKTtcblxuICAgICAgY29uc29sZS5sb2coYPCfk6UgRG93bmxvYWRpbmcgJHthdWRpb0ZpbGUuS2V5fSB0byAke2F1ZGlvUGF0aH1gKTtcbiAgICAgIGNvbnN0IGF1ZGlvT2JqZWN0ID0gYXdhaXQgczMuc2VuZChcbiAgICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgS2V5OiBhdWRpb0ZpbGUuS2V5LFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIGNvbnN0IGF1ZGlvQnVmZmVyID0gQnVmZmVyLmZyb20oXG4gICAgICAgIGF3YWl0IGF1ZGlvT2JqZWN0LkJvZHkhLnRyYW5zZm9ybVRvQnl0ZUFycmF5KCksXG4gICAgICApO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhhdWRpb1BhdGgsIGF1ZGlvQnVmZmVyKTtcbiAgICAgIGF1ZGlvUGF0aHMucHVzaChhdWRpb1BhdGgpO1xuICAgICAgY29uc29sZS5sb2coYOKchSBEb3dubG9hZGVkIGF1ZGlvICR7aSArIDF9LyR7YXVkaW9GaWxlcy5sZW5ndGh9YCk7XG4gICAgfVxuXG4gICAgLy8gRG93bmxvYWQgYWxsIHN1YnRpdGxlIGZpbGVzIGZyb20gUzNcbiAgICBjb25zb2xlLmxvZygn8J+TpSBEb3dubG9hZGluZyBzdWJ0aXRsZSBmaWxlcyBmcm9tIFMzLi4uJyk7XG4gICAgY29uc3Qgc3VidGl0bGVQYXRoczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHN1YnRpdGxlRmlsZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHN1YnRpdGxlRmlsZSA9IHN1YnRpdGxlRmlsZXNbaV07XG4gICAgICBpZiAoIXN1YnRpdGxlRmlsZS5LZXkpIGNvbnRpbnVlO1xuXG4gICAgICBjb25zdCBzdWJ0aXRsZVBhdGggPSBwYXRoLmpvaW4ob3MudG1wZGlyKCksIGBzdWJ0aXRsZS0ke2l9LmFzc2ApO1xuXG4gICAgICBjb25zb2xlLmxvZyhg8J+TpSBEb3dubG9hZGluZyAke3N1YnRpdGxlRmlsZS5LZXl9IHRvICR7c3VidGl0bGVQYXRofWApO1xuICAgICAgY29uc3Qgc3VidGl0bGVPYmplY3QgPSBhd2FpdCBzMy5zZW5kKFxuICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICBLZXk6IHN1YnRpdGxlRmlsZS5LZXksXG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgICAgY29uc3Qgc3VidGl0bGVCdWZmZXIgPSBCdWZmZXIuZnJvbShcbiAgICAgICAgYXdhaXQgc3VidGl0bGVPYmplY3QuQm9keSEudHJhbnNmb3JtVG9CeXRlQXJyYXkoKSxcbiAgICAgICk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHN1YnRpdGxlUGF0aCwgc3VidGl0bGVCdWZmZXIpO1xuICAgICAgc3VidGl0bGVQYXRocy5wdXNoKHN1YnRpdGxlUGF0aCk7XG4gICAgICBjb25zb2xlLmxvZyhg4pyFIERvd25sb2FkZWQgc3VidGl0bGUgJHtpICsgMX0vJHtzdWJ0aXRsZUZpbGVzLmxlbmd0aH1gKTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgYSBmaWxlIGxpc3QgZm9yIEZGbXBlZyBjb25jYXRlbmF0aW9uXG4gICAgY29uc3QgZmlsZUxpc3RQYXRoID0gcGF0aC5qb2luKG9zLnRtcGRpcigpLCAnZmlsZWxpc3QudHh0Jyk7XG4gICAgY29uc3QgZmlsZUxpc3RDb250ZW50ID0gdmlkZW9QYXRoc1xuICAgICAgLm1hcCgodmlkZW9QYXRoKSA9PiBgZmlsZSAnJHt2aWRlb1BhdGh9J2ApXG4gICAgICAuam9pbignXFxuJyk7XG4gICAgZnMud3JpdGVGaWxlU3luYyhmaWxlTGlzdFBhdGgsIGZpbGVMaXN0Q29udGVudCk7XG4gICAgY29uc29sZS5sb2coJ/Cfk4QgQ3JlYXRlZCBmaWxlIGxpc3QgZm9yIGNvbmNhdGVuYXRpb24nKTtcblxuICAgIC8vIENyZWF0ZSBjb25jYXRlbmF0ZWQgYXVkaW8gZmlsZVxuICAgIGNvbnN0IGNvbmNhdGVuYXRlZEF1ZGlvUGF0aCA9IHBhdGguam9pbihcbiAgICAgIG9zLnRtcGRpcigpLFxuICAgICAgJ2NvbmNhdGVuYXRlZC1hdWRpby5tcDMnLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coJ/CfjrUgQ29uY2F0ZW5hdGluZyBhdWRpbyBmaWxlcy4uLicpO1xuXG4gICAgY29uc3QgYXVkaW9Db25jYXRDb21tYW5kID0gZmZtcGVnKCk7XG4gICAgYXVkaW9QYXRocy5mb3JFYWNoKChhdWRpb1BhdGgpID0+IHtcbiAgICAgIGF1ZGlvQ29uY2F0Q29tbWFuZC5pbnB1dChhdWRpb1BhdGgpO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgYXVkaW9Db25jYXRDb21tYW5kXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfinIUgQXVkaW8gY29uY2F0ZW5hdGlvbiBjb21wbGV0ZWQnKTtcbiAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5vbignZXJyb3InLCAoZXJyOiBhbnkpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgQXVkaW8gY29uY2F0ZW5hdGlvbiBlcnJvcjonLCBlcnIpO1xuICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICB9KVxuICAgICAgICAubWVyZ2VUb0ZpbGUoY29uY2F0ZW5hdGVkQXVkaW9QYXRoLCBvcy50bXBkaXIoKSk7XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgY29uY2F0ZW5hdGVkIHN1YnRpdGxlIGZpbGVcbiAgICBjb25zdCBjb25jYXRlbmF0ZWRTdWJ0aXRsZVBhdGggPSBwYXRoLmpvaW4oXG4gICAgICBvcy50bXBkaXIoKSxcbiAgICAgICdjb25jYXRlbmF0ZWQtc3VidGl0bGVzLmFzcycsXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZygn8J+TnSBDb25jYXRlbmF0aW5nIHN1YnRpdGxlIGZpbGVzLi4uJyk7XG5cbiAgICBpZiAoc3VidGl0bGVQYXRocy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBGb3IgQVNTIGZpbGVzLCB3ZSBuZWVkIHRvIGNvbmNhdGVuYXRlIHRoZW0gZGlmZmVyZW50bHlcbiAgICAgIC8vIEZpcnN0LCBnZXQgdGhlIGhlYWRlciBhbmQgc3R5bGVzIGZyb20gdGhlIGZpcnN0IGZpbGVcbiAgICAgIGNvbnN0IGZpcnN0U3VidGl0bGVDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHN1YnRpdGxlUGF0aHNbMF0sICd1dGYtOCcpO1xuICAgICAgY29uc3QgbGluZXMgPSBmaXJzdFN1YnRpdGxlQ29udGVudC5zcGxpdCgnXFxuJyk7XG5cbiAgICAgIGxldCBjb25jYXRlbmF0ZWRTdWJ0aXRsZUNvbnRlbnQgPSAnJztcbiAgICAgIGxldCBpbkV2ZW50cyA9IGZhbHNlO1xuICAgICAgbGV0IGN1cnJlbnRUaW1lID0gMDtcblxuICAgICAgLy8gRXh0cmFjdCBoZWFkZXIgYW5kIHN0eWxlcyBmcm9tIGZpcnN0IGZpbGVcbiAgICAgIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgICAgICBpZiAobGluZS5zdGFydHNXaXRoKCdbRXZlbnRzXScpKSB7XG4gICAgICAgICAgY29uY2F0ZW5hdGVkU3VidGl0bGVDb250ZW50ICs9IGxpbmUgKyAnXFxuJztcbiAgICAgICAgICBjb25jYXRlbmF0ZWRTdWJ0aXRsZUNvbnRlbnQgKz1cbiAgICAgICAgICAgICdGb3JtYXQ6IExheWVyLCBTdGFydCwgRW5kLCBTdHlsZSwgTmFtZSwgTWFyZ2luTCwgTWFyZ2luUiwgTWFyZ2luViwgRWZmZWN0LCBUZXh0XFxuJztcbiAgICAgICAgICBpbkV2ZW50cyA9IHRydWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY29uY2F0ZW5hdGVkU3VidGl0bGVDb250ZW50ICs9IGxpbmUgKyAnXFxuJztcbiAgICAgIH1cblxuICAgICAgLy8gTm93IHByb2Nlc3MgZWFjaCBzdWJ0aXRsZSBmaWxlIGFuZCBhZGp1c3QgdGltZXN0YW1wc1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzdWJ0aXRsZVBhdGhzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHN1YnRpdGxlQ29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhzdWJ0aXRsZVBhdGhzW2ldLCAndXRmLTgnKTtcbiAgICAgICAgY29uc3Qgc3VidGl0bGVMaW5lcyA9IHN1YnRpdGxlQ29udGVudC5zcGxpdCgnXFxuJyk7XG4gICAgICAgIGxldCBpbkV2ZW50c1NlY3Rpb24gPSBmYWxzZTtcblxuICAgICAgICBmb3IgKGNvbnN0IGxpbmUgb2Ygc3VidGl0bGVMaW5lcykge1xuICAgICAgICAgIGlmIChsaW5lLnN0YXJ0c1dpdGgoJ1tFdmVudHNdJykpIHtcbiAgICAgICAgICAgIGluRXZlbnRzU2VjdGlvbiA9IHRydWU7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoaW5FdmVudHNTZWN0aW9uICYmIGxpbmUuc3RhcnRzV2l0aCgnRGlhbG9ndWU6JykpIHtcbiAgICAgICAgICAgIC8vIFBhcnNlIEFTUyBkaWFsb2d1ZSBsaW5lOiBEaWFsb2d1ZTogMCwwOjAwOjAwLjAwLDA6MDA6MDEuNDIsRGVmYXVsdCwsMCwwLDAsLFRleHRcbiAgICAgICAgICAgIGNvbnN0IGRpYWxvZ3VlTWF0Y2ggPSBsaW5lLm1hdGNoKFxuICAgICAgICAgICAgICAvRGlhbG9ndWU6IDAsKFteLF0rKSwoW14sXSspLChbXixdKyksKFteLF0qKSwoW14sXSopLChbXixdKiksKFteLF0qKSwoW14sXSopLCguKykvLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmIChkaWFsb2d1ZU1hdGNoKSB7XG4gICAgICAgICAgICAgIGNvbnN0IG9yaWdpbmFsU3RhcnQgPSBkaWFsb2d1ZU1hdGNoWzFdO1xuICAgICAgICAgICAgICBjb25zdCBvcmlnaW5hbEVuZCA9IGRpYWxvZ3VlTWF0Y2hbMl07XG4gICAgICAgICAgICAgIGNvbnN0IHN0eWxlID0gZGlhbG9ndWVNYXRjaFszXTtcbiAgICAgICAgICAgICAgY29uc3QgbmFtZSA9IGRpYWxvZ3VlTWF0Y2hbNF07XG4gICAgICAgICAgICAgIGNvbnN0IG1hcmdpbkwgPSBkaWFsb2d1ZU1hdGNoWzVdO1xuICAgICAgICAgICAgICBjb25zdCBtYXJnaW5SID0gZGlhbG9ndWVNYXRjaFs2XTtcbiAgICAgICAgICAgICAgY29uc3QgbWFyZ2luViA9IGRpYWxvZ3VlTWF0Y2hbN107XG4gICAgICAgICAgICAgIGNvbnN0IGVmZmVjdCA9IGRpYWxvZ3VlTWF0Y2hbOF07XG4gICAgICAgICAgICAgIGNvbnN0IHRleHQgPSBkaWFsb2d1ZU1hdGNoWzldO1xuXG4gICAgICAgICAgICAgIC8vIENvbnZlcnQgQVNTIHRpbWUgZm9ybWF0IChIOk1NOlNTLmNjKSB0byBzZWNvbmRzLCBhZGQgY3VycmVudCB0aW1lLCB0aGVuIGNvbnZlcnQgYmFja1xuICAgICAgICAgICAgICBjb25zdCBzdGFydFNlY29uZHMgPSBwYXJzZUFTU1RpbWUob3JpZ2luYWxTdGFydCkgKyBjdXJyZW50VGltZTtcbiAgICAgICAgICAgICAgY29uc3QgZW5kU2Vjb25kcyA9IHBhcnNlQVNTVGltZShvcmlnaW5hbEVuZCkgKyBjdXJyZW50VGltZTtcblxuICAgICAgICAgICAgICBjb25zdCBhZGp1c3RlZFN0YXJ0ID0gZm9ybWF0QVNTVGltZShzdGFydFNlY29uZHMpO1xuICAgICAgICAgICAgICBjb25zdCBhZGp1c3RlZEVuZCA9IGZvcm1hdEFTU1RpbWUoZW5kU2Vjb25kcyk7XG5cbiAgICAgICAgICAgICAgY29uY2F0ZW5hdGVkU3VidGl0bGVDb250ZW50ICs9IGBEaWFsb2d1ZTogMCwke2FkanVzdGVkU3RhcnR9LCR7YWRqdXN0ZWRFbmR9LCR7c3R5bGV9LCR7bmFtZX0sJHttYXJnaW5MfSwke21hcmdpblJ9LCR7bWFyZ2luVn0sJHtlZmZlY3R9LCR7dGV4dH1cXG5gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEFkZCBzY2VuZSBkdXJhdGlvbiB0byBjdXJyZW50IHRpbWUgZm9yIG5leHQgc2NlbmVcbiAgICAgICAgaWYgKHZpZGVvUGF0aHNbaV0pIHtcbiAgICAgICAgICAvLyBHZXQgdmlkZW8gZHVyYXRpb24gdXNpbmcgZmZwcm9iZVxuICAgICAgICAgIGNvbnN0IHZpZGVvRHVyYXRpb24gPSBhd2FpdCBnZXRWaWRlb0R1cmF0aW9uKHZpZGVvUGF0aHNbaV0pO1xuICAgICAgICAgIGN1cnJlbnRUaW1lICs9IHZpZGVvRHVyYXRpb247XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZnMud3JpdGVGaWxlU3luYyhjb25jYXRlbmF0ZWRTdWJ0aXRsZVBhdGgsIGNvbmNhdGVuYXRlZFN1YnRpdGxlQ29udGVudCk7XG4gICAgICBjb25zb2xlLmxvZygn4pyFIFN1YnRpdGxlIGNvbmNhdGVuYXRpb24gY29tcGxldGVkJyk7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/Cfk4QgQ29uY2F0ZW5hdGVkIHN1YnRpdGxlIGNvbnRlbnQgcHJldmlldzonLFxuICAgICAgICBjb25jYXRlbmF0ZWRTdWJ0aXRsZUNvbnRlbnQuc3Vic3RyaW5nKDAsIDUwMCksXG4gICAgICApO1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn5OBIENvbmNhdGVuYXRlZCBzdWJ0aXRsZSBmaWxlIHBhdGg6JyxcbiAgICAgICAgY29uY2F0ZW5hdGVkU3VidGl0bGVQYXRoLFxuICAgICAgKTtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+TiiBDb25jYXRlbmF0ZWQgc3VidGl0bGUgZmlsZSBzaXplOicsXG4gICAgICAgIGZzLnN0YXRTeW5jKGNvbmNhdGVuYXRlZFN1YnRpdGxlUGF0aCkuc2l6ZSxcbiAgICAgICAgJ2J5dGVzJyxcbiAgICAgICk7XG5cbiAgICAgIC8vIERlYnVnOiBDaGVjayBpZiB0aGUgZmlsZSBpcyByZWFkYWJsZSBhbmQgaGFzIHZhbGlkIGNvbnRlbnRcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGZpbGVDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGNvbmNhdGVuYXRlZFN1YnRpdGxlUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5SNIEZ1bGwgQVNTIGZpbGUgY29udGVudDonLCBmaWxlQ29udGVudCk7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICfwn5SNIEZpbGUgc3RhcnRzIHdpdGggQVNTIGhlYWRlcjonLFxuICAgICAgICAgIGZpbGVDb250ZW50LnN0YXJ0c1dpdGgoJ1tTY3JpcHQgSW5mb10nKSxcbiAgICAgICAgKTtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgJ/CflI0gRmlsZSBjb250YWlucyBFdmVudHMgc2VjdGlvbjonLFxuICAgICAgICAgIGZpbGVDb250ZW50LmluY2x1ZGVzKCdbRXZlbnRzXScpLFxuICAgICAgICApO1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAn8J+UjSBGaWxlIGNvbnRhaW5zIERpYWxvZ3VlIGxpbmVzOicsXG4gICAgICAgICAgZmlsZUNvbnRlbnQuaW5jbHVkZXMoJ0RpYWxvZ3VlOicpLFxuICAgICAgICApO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIHJlYWRpbmcgQVNTIGZpbGU6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENvbWJpbmUgdmlkZW8sIGF1ZGlvLCBhbmQgc3VidGl0bGVzIHVzaW5nIEZGbXBlZ1xuICAgIGNvbnN0IG91dHB1dFBhdGggPSBwYXRoLmpvaW4ob3MudG1wZGlyKCksICdmaW5hbC12aWRlby5tcDQnKTtcbiAgICBjb25zb2xlLmxvZygn8J+OrCBDb21iaW5pbmcgdmlkZW8sIGF1ZGlvLCBhbmQgc3VidGl0bGVzIHdpdGggRkZtcGVnLi4uJyk7XG5cbiAgICAvLyBQcmVwYXJlIHZpZGVvIGZpbHRlciB3aXRoIHNjYWxpbmcgYW5kIHN1YnRpdGxlc1xuICAgIGxldCB2aWRlb0ZpbHRlciA9ICdzY2FsZT0xMDgwOjE5MjAnOyAvLyBCYXNlIHNjYWxpbmcgZmlsdGVyXG5cbiAgICAvLyBBZGQgc3VidGl0bGUgZmlsdGVyIGlmIGF2YWlsYWJsZVxuICAgIGlmIChzdWJ0aXRsZVBhdGhzLmxlbmd0aCA+IDAgJiYgZnMuZXhpc3RzU3luYyhjb25jYXRlbmF0ZWRTdWJ0aXRsZVBhdGgpKSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+TnSBVc2luZyBBU1Mgc3VidGl0bGUgZm9ybWF0Jyk7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/Cfk4QgQVNTIHN1YnRpdGxlIGNvbnRlbnQgcHJldmlldzonLFxuICAgICAgICBmcy5yZWFkRmlsZVN5bmMoY29uY2F0ZW5hdGVkU3VidGl0bGVQYXRoLCAndXRmLTgnKS5zdWJzdHJpbmcoMCwgNTAwKSxcbiAgICAgICk7XG5cbiAgICAgIC8vIENvbnZlcnQgQVNTIHRvIFNSVCBmb3IgYmV0dGVyIGNvbXBhdGliaWxpdHkgd2l0aCBzdWJ0aXRsZXMgZmlsdGVyXG4gICAgICBjb25zdCBzcnRTdWJ0aXRsZVBhdGggPSBjb25jYXRlbmF0ZWRTdWJ0aXRsZVBhdGgucmVwbGFjZSgnLmFzcycsICcuc3J0Jyk7XG4gICAgICBjb25zdCBhc3NDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGNvbmNhdGVuYXRlZFN1YnRpdGxlUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICBjb25zdCBzcnRDb250ZW50ID0gY29udmVydEFTU3RvU1JUKGFzc0NvbnRlbnQpO1xuICAgICAgZnMud3JpdGVGaWxlU3luYyhzcnRTdWJ0aXRsZVBhdGgsIHNydENvbnRlbnQpO1xuXG4gICAgICBjb25zb2xlLmxvZygn8J+TnSBDb252ZXJ0ZWQgQVNTIHRvIFNSVCBmb3Igc3VidGl0bGUgYnVybmluZycpO1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn5OEIFNSVCBzdWJ0aXRsZSBjb250ZW50IHByZXZpZXc6JyxcbiAgICAgICAgc3J0Q29udGVudC5zdWJzdHJpbmcoMCwgNTAwKSxcbiAgICAgICk7XG5cbiAgICAgIC8vIFVzZSBzdWJ0aXRsZXMgZmlsdGVyIHdpdGggU1JUIGZpbGUgKG1vcmUgd2lkZWx5IHN1cHBvcnRlZClcbiAgICAgIGNvbnN0IGFic29sdXRlUGF0aCA9IHNydFN1YnRpdGxlUGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJyk7XG4gICAgICB2aWRlb0ZpbHRlciArPSBgLHN1YnRpdGxlcz0nJHthYnNvbHV0ZVBhdGh9Jzpmb3JjZV9zdHlsZT0nRm9udFNpemU9MjQsUHJpbWFyeUNvbG91cj0mSGZmZmZmZixPdXRsaW5lQ29sb3VyPSZIMDAwMDAwLEJhY2tDb2xvdXI9JkgwMDAwMDAsQm9sZD0xLE91dGxpbmU9MidgO1xuXG4gICAgICBjb25zb2xlLmxvZygn8J+TnSBBZGRpbmcgc3VidGl0bGUgZmlsdGVyIHRvIHZpZGVvOicsIHZpZGVvRmlsdGVyKTtcbiAgICB9XG5cbiAgICBjb25zdCBmZm1wZWdDb21tYW5kID0gZmZtcGVnKClcbiAgICAgIC5pbnB1dChmaWxlTGlzdFBhdGgpXG4gICAgICAuaW5wdXRPcHRpb25zKFsnLWYnLCAnY29uY2F0JywgJy1zYWZlJywgJzAnXSlcbiAgICAgIC5pbnB1dChjb25jYXRlbmF0ZWRBdWRpb1BhdGgpO1xuXG4gICAgLy8gQWRkIHN1YnRpdGxlIGZpbGUgYXMgaW5wdXQgaWYgYXZhaWxhYmxlXG4gICAgaWYgKHN1YnRpdGxlUGF0aHMubGVuZ3RoID4gMCAmJiBmcy5leGlzdHNTeW5jKGNvbmNhdGVuYXRlZFN1YnRpdGxlUGF0aCkpIHtcbiAgICAgIGZmbXBlZ0NvbW1hbmQuaW5wdXQoY29uY2F0ZW5hdGVkU3VidGl0bGVQYXRoKTtcbiAgICB9XG5cbiAgICBmZm1wZWdDb21tYW5kLm91dHB1dE9wdGlvbnMoW1xuICAgICAgJy1jOnYnLFxuICAgICAgJ2xpYngyNjQnLCAvLyBWaWRlbyBjb2RlY1xuICAgICAgJy1jOmEnLFxuICAgICAgJ2FhYycsIC8vIEF1ZGlvIGNvZGVjXG4gICAgICAnLWI6YScsXG4gICAgICAnMTI4aycsIC8vIEF1ZGlvIGJpdHJhdGVcbiAgICAgICctcGl4X2ZtdCcsXG4gICAgICAneXV2NDIwcCcsIC8vIFBpeGVsIGZvcm1hdCBmb3IgY29tcGF0aWJpbGl0eVxuICAgICAgJy12ZicsXG4gICAgICB2aWRlb0ZpbHRlciwgLy8gQ29tYmluZWQgc2NhbGluZyBhbmQgc3VidGl0bGUgZmlsdGVyXG4gICAgICAnLXInLFxuICAgICAgJzMwJywgLy8gRnJhbWUgcmF0ZVxuICAgICAgJy1zaG9ydGVzdCcsIC8vIEVuZCB3aGVuIHNob3J0ZXN0IGlucHV0IGVuZHNcbiAgICBdKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46sIEZGbXBlZyBjb21tYW5kIHByZXBhcmVkIHdpdGggdmlkZW8gZmlsdGVyOicsIHZpZGVvRmlsdGVyKTtcbiAgICBjb25zb2xlLmxvZygn8J+TnSBTdWJ0aXRsZSBwYXRocyBmb3VuZDonLCBzdWJ0aXRsZVBhdGhzLmxlbmd0aCk7XG4gICAgY29uc29sZS5sb2coXG4gICAgICAn8J+TgSBDb25jYXRlbmF0ZWQgc3VidGl0bGUgZXhpc3RzOicsXG4gICAgICBmcy5leGlzdHNTeW5jKGNvbmNhdGVuYXRlZFN1YnRpdGxlUGF0aCksXG4gICAgKTtcblxuICAgIGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIGZmbXBlZ0NvbW1hbmRcbiAgICAgICAgLm91dHB1dChvdXRwdXRQYXRoKVxuICAgICAgICAub24oJ3N0YXJ0JywgKGNvbW1hbmRMaW5lOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZygn8J+UpyBGRm1wZWcgY29tbWFuZCBiZWluZyBleGVjdXRlZDonLCBjb21tYW5kTGluZSk7XG4gICAgICAgIH0pXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfinIUgVmlkZW8gcHJvY2Vzc2luZyBjb21wbGV0ZWQnKTtcbiAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgIH0pXG4gICAgICAgIC5vbignZXJyb3InLCAoZXJyOiBhbnkpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgVmlkZW8gcHJvY2Vzc2luZyBlcnJvcjonLCBlcnIpO1xuICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICB9KVxuICAgICAgICAub24oJ3N0ZGVycicsIChzdGRlcnJMaW5lOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAvLyBPbmx5IGxvZyBlcnJvciBtZXNzYWdlcywgbm90IHZlcmJvc2UgaW5mb1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHN0ZGVyckxpbmUuaW5jbHVkZXMoJ2Vycm9yJykgfHxcbiAgICAgICAgICAgIHN0ZGVyckxpbmUuaW5jbHVkZXMoJ0Vycm9yJykgfHxcbiAgICAgICAgICAgIHN0ZGVyckxpbmUuaW5jbHVkZXMoJ2ZhaWxlZCcpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygn8J+TnSBGRm1wZWcgc3RkZXJyOicsIHN0ZGVyckxpbmUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgLnJ1bigpO1xuICAgIH0pO1xuXG4gICAgLy8gQ2xlYW4gdXAgdGVtcG9yYXJ5IGZpbGVzXG4gICAgY29uc29sZS5sb2coJ/Cfp7kgQ2xlYW5pbmcgdXAgdGVtcG9yYXJ5IGZpbGVzLi4uJyk7XG4gICAgdmlkZW9QYXRocy5mb3JFYWNoKCh2aWRlb1BhdGgpID0+IHtcbiAgICAgIGlmIChmcy5leGlzdHNTeW5jKHZpZGVvUGF0aCkpIGZzLnVubGlua1N5bmModmlkZW9QYXRoKTtcbiAgICB9KTtcbiAgICBhdWRpb1BhdGhzLmZvckVhY2goKGF1ZGlvUGF0aCkgPT4ge1xuICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoYXVkaW9QYXRoKSkgZnMudW5saW5rU3luYyhhdWRpb1BhdGgpO1xuICAgIH0pO1xuICAgIHN1YnRpdGxlUGF0aHMuZm9yRWFjaCgoc3VidGl0bGVQYXRoKSA9PiB7XG4gICAgICBpZiAoZnMuZXhpc3RzU3luYyhzdWJ0aXRsZVBhdGgpKSBmcy51bmxpbmtTeW5jKHN1YnRpdGxlUGF0aCk7XG4gICAgfSk7XG4gICAgaWYgKGZzLmV4aXN0c1N5bmMoZmlsZUxpc3RQYXRoKSkgZnMudW5saW5rU3luYyhmaWxlTGlzdFBhdGgpO1xuICAgIGlmIChmcy5leGlzdHNTeW5jKGNvbmNhdGVuYXRlZEF1ZGlvUGF0aCkpXG4gICAgICBmcy51bmxpbmtTeW5jKGNvbmNhdGVuYXRlZEF1ZGlvUGF0aCk7XG4gICAgaWYgKGZzLmV4aXN0c1N5bmMoY29uY2F0ZW5hdGVkU3VidGl0bGVQYXRoKSlcbiAgICAgIGZzLnVubGlua1N5bmMoY29uY2F0ZW5hdGVkU3VidGl0bGVQYXRoKTtcbiAgICBjb25zb2xlLmxvZygn4pyFIENsZWFudXAgY29tcGxldGVkJyk7XG5cbiAgICByZXR1cm4gb3V0cHV0UGF0aDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gY29tYmluZVZpZGVvQW5kQXVkaW86JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbmZ1bmN0aW9uIHBhcnNlVGltZVRvU2Vjb25kcyh0aW1lU3RyaW5nOiBzdHJpbmcpOiBudW1iZXIge1xuICBjb25zdCBtYXRjaCA9IHRpbWVTdHJpbmcubWF0Y2goLyhcXGR7Mn0pOihcXGR7Mn0pOihcXGR7Mn0pLChcXGR7M30pLyk7XG4gIGlmIChtYXRjaCkge1xuICAgIGNvbnN0IGhvdXJzID0gcGFyc2VJbnQobWF0Y2hbMV0pO1xuICAgIGNvbnN0IG1pbnV0ZXMgPSBwYXJzZUludChtYXRjaFsyXSk7XG4gICAgY29uc3Qgc2Vjb25kcyA9IHBhcnNlSW50KG1hdGNoWzNdKTtcbiAgICBjb25zdCBtaWxsaXNlY29uZHMgPSBwYXJzZUludChtYXRjaFs0XSk7XG4gICAgcmV0dXJuIGhvdXJzICogMzYwMCArIG1pbnV0ZXMgKiA2MCArIHNlY29uZHMgKyBtaWxsaXNlY29uZHMgLyAxMDAwO1xuICB9XG4gIHJldHVybiAwO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRTZWNvbmRzVG9UaW1lKHNlY29uZHM6IG51bWJlcik6IHN0cmluZyB7XG4gIGNvbnN0IGhvdXJzID0gTWF0aC5mbG9vcihzZWNvbmRzIC8gMzYwMCk7XG4gIGNvbnN0IG1pbnV0ZXMgPSBNYXRoLmZsb29yKChzZWNvbmRzICUgMzYwMCkgLyA2MCk7XG4gIGNvbnN0IHNlY3MgPSBNYXRoLmZsb29yKHNlY29uZHMgJSA2MCk7XG4gIGNvbnN0IG1pbGxpc2Vjb25kcyA9IE1hdGguZmxvb3IoKHNlY29uZHMgJSAxKSAqIDEwMDApO1xuXG4gIHJldHVybiBgJHtob3Vycy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyl9OiR7bWludXRlc1xuICAgIC50b1N0cmluZygpXG4gICAgLnBhZFN0YXJ0KDIsICcwJyl9OiR7c2Vjcy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyl9LCR7bWlsbGlzZWNvbmRzXG4gICAgLnRvU3RyaW5nKClcbiAgICAucGFkU3RhcnQoMywgJzAnKX1gO1xufVxuXG5mdW5jdGlvbiBwYXJzZUFTU1RpbWUoYXNzVGltZTogc3RyaW5nKTogbnVtYmVyIHtcbiAgLy8gUGFyc2UgQVNTIHRpbWUgZm9ybWF0OiBISDpNTTpTUy5tbW0gKGUuZy4sIFwiMDA6MDA6MDAuMDAwXCIpXG4gIGNvbnN0IG1hdGNoID0gYXNzVGltZS5tYXRjaCgvKFxcZHsyfSk6KFxcZHsyfSk6KFxcZHsyfSlcXC4oXFxkezN9KS8pO1xuICBpZiAobWF0Y2gpIHtcbiAgICBjb25zdCBob3VycyA9IHBhcnNlSW50KG1hdGNoWzFdKTtcbiAgICBjb25zdCBtaW51dGVzID0gcGFyc2VJbnQobWF0Y2hbMl0pO1xuICAgIGNvbnN0IHNlY29uZHMgPSBwYXJzZUludChtYXRjaFszXSk7XG4gICAgY29uc3QgbWlsbGlzZWNvbmRzID0gcGFyc2VJbnQobWF0Y2hbNF0pO1xuICAgIHJldHVybiBob3VycyAqIDM2MDAgKyBtaW51dGVzICogNjAgKyBzZWNvbmRzICsgbWlsbGlzZWNvbmRzIC8gMTAwMDtcbiAgfVxuICByZXR1cm4gMDtcbn1cblxuZnVuY3Rpb24gZm9ybWF0QVNTVGltZShzZWNvbmRzOiBudW1iZXIpOiBzdHJpbmcge1xuICBjb25zdCBob3VycyA9IE1hdGguZmxvb3Ioc2Vjb25kcyAvIDM2MDApO1xuICBjb25zdCBtaW51dGVzID0gTWF0aC5mbG9vcigoc2Vjb25kcyAlIDM2MDApIC8gNjApO1xuICBjb25zdCBzZWNzID0gTWF0aC5mbG9vcihzZWNvbmRzICUgNjApO1xuICBjb25zdCBtaWxsaXNlY29uZHMgPSBNYXRoLmZsb29yKChzZWNvbmRzICUgMSkgKiAxMDAwKTtcblxuICByZXR1cm4gYCR7aG91cnMudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpfToke21pbnV0ZXNcbiAgICAudG9TdHJpbmcoKVxuICAgIC5wYWRTdGFydCgyLCAnMCcpfToke3NlY3MudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpfS4ke21pbGxpc2Vjb25kc1xuICAgIC50b1N0cmluZygpXG4gICAgLnBhZFN0YXJ0KDMsICcwJyl9YDtcbn1cblxuZnVuY3Rpb24gZXh0cmFjdFN1YnRpdGxlVGV4dChhc3NDb250ZW50OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBsaW5lcyA9IGFzc0NvbnRlbnQuc3BsaXQoJ1xcbicpO1xuICBsZXQgc3VidGl0bGVUZXh0ID0gJyc7XG4gIGxldCBpbkV2ZW50cyA9IGZhbHNlO1xuXG4gIGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuICAgIGlmIChsaW5lLnN0YXJ0c1dpdGgoJ1tFdmVudHNdJykpIHtcbiAgICAgIGluRXZlbnRzID0gdHJ1ZTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChpbkV2ZW50cyAmJiBsaW5lLnN0YXJ0c1dpdGgoJ0RpYWxvZ3VlOicpKSB7XG4gICAgICAvLyBQYXJzZSBBU1MgZGlhbG9ndWUgbGluZSBhbmQgZXh0cmFjdCB0ZXh0XG4gICAgICBjb25zdCBkaWFsb2d1ZU1hdGNoID0gbGluZS5tYXRjaChcbiAgICAgICAgL0RpYWxvZ3VlOiAwLFteLF0rLFteLF0rLFteLF0rLFteLF0qLFteLF0qLFteLF0qLFteLF0qLFteLF0qLChbXixdKykvLFxuICAgICAgKTtcbiAgICAgIGlmIChkaWFsb2d1ZU1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHRleHQgPSBkaWFsb2d1ZU1hdGNoWzFdO1xuICAgICAgICBpZiAoc3VidGl0bGVUZXh0KSBzdWJ0aXRsZVRleHQgKz0gJyAnO1xuICAgICAgICBzdWJ0aXRsZVRleHQgKz0gdGV4dDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gc3VidGl0bGVUZXh0IHx8ICdTdWJ0aXRsZXMgQXZhaWxhYmxlJztcbn1cblxuZnVuY3Rpb24gY29udmVydEFTU3RvU1JUKGFzc0NvbnRlbnQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IGxpbmVzID0gYXNzQ29udGVudC5zcGxpdCgnXFxuJyk7XG4gIGxldCBzcnRDb250ZW50ID0gJyc7XG4gIGxldCBzdWJ0aXRsZUluZGV4ID0gMTtcbiAgbGV0IGluRXZlbnRzID0gZmFsc2U7XG5cbiAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgaWYgKGxpbmUuc3RhcnRzV2l0aCgnW0V2ZW50c10nKSkge1xuICAgICAgaW5FdmVudHMgPSB0cnVlO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgaWYgKGluRXZlbnRzICYmIGxpbmUuc3RhcnRzV2l0aCgnRGlhbG9ndWU6JykpIHtcbiAgICAgIC8vIFBhcnNlIEFTUyBkaWFsb2d1ZSBsaW5lOiBEaWFsb2d1ZTogMCwwOjAwOjAwLjAwLDA6MDA6MDEuNDIsRGVmYXVsdCwsMCwwLDAsLFRleHRcbiAgICAgIGNvbnN0IGRpYWxvZ3VlTWF0Y2ggPSBsaW5lLm1hdGNoKFxuICAgICAgICAvRGlhbG9ndWU6IDAsKFteLF0rKSwoW14sXSspLChbXixdKyksKFteLF0qKSwoW14sXSopLChbXixdKiksKFteLF0qKSwoW14sXSopLCguKykvLFxuICAgICAgKTtcbiAgICAgIGlmIChkaWFsb2d1ZU1hdGNoKSB7XG4gICAgICAgIGNvbnN0IHN0YXJ0VGltZSA9IGRpYWxvZ3VlTWF0Y2hbMV07XG4gICAgICAgIGNvbnN0IGVuZFRpbWUgPSBkaWFsb2d1ZU1hdGNoWzJdO1xuICAgICAgICBjb25zdCB0ZXh0ID0gZGlhbG9ndWVNYXRjaFs5XTtcblxuICAgICAgICAvLyBDb252ZXJ0IEFTUyB0aW1lIGZvcm1hdCB0byBTUlQgZm9ybWF0XG4gICAgICAgIGNvbnN0IHNydFN0YXJ0VGltZSA9IGNvbnZlcnRBU1NUaW1lVG9TUlQoc3RhcnRUaW1lKTtcbiAgICAgICAgY29uc3Qgc3J0RW5kVGltZSA9IGNvbnZlcnRBU1NUaW1lVG9TUlQoZW5kVGltZSk7XG5cbiAgICAgICAgc3J0Q29udGVudCArPSBgJHtzdWJ0aXRsZUluZGV4fVxcbmA7XG4gICAgICAgIHNydENvbnRlbnQgKz0gYCR7c3J0U3RhcnRUaW1lfSAtLT4gJHtzcnRFbmRUaW1lfVxcbmA7XG4gICAgICAgIHNydENvbnRlbnQgKz0gYCR7dGV4dH1cXG5cXG5gO1xuICAgICAgICBzdWJ0aXRsZUluZGV4Kys7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHNydENvbnRlbnQ7XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRBU1NUaW1lVG9TUlQoYXNzVGltZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgLy8gQ29udmVydCBBU1MgdGltZSBmb3JtYXQgKEhIOk1NOlNTLm1tbSkgdG8gU1JUIGZvcm1hdCAoSEg6TU06U1MsbW1tKVxuICBjb25zdCBtYXRjaCA9IGFzc1RpbWUubWF0Y2goLyhcXGR7Mn0pOihcXGR7Mn0pOihcXGR7Mn0pXFwuKFxcZHszfSkvKTtcbiAgaWYgKG1hdGNoKSB7XG4gICAgY29uc3QgaG91cnMgPSBtYXRjaFsxXTtcbiAgICBjb25zdCBtaW51dGVzID0gbWF0Y2hbMl07XG4gICAgY29uc3Qgc2Vjb25kcyA9IG1hdGNoWzNdO1xuICAgIGNvbnN0IG1pbGxpc2Vjb25kcyA9IG1hdGNoWzRdO1xuICAgIHJldHVybiBgJHtob3Vyc306JHttaW51dGVzfToke3NlY29uZHN9LCR7bWlsbGlzZWNvbmRzfWA7XG4gIH1cbiAgcmV0dXJuIGFzc1RpbWU7IC8vIFJldHVybiBvcmlnaW5hbCBpZiBubyBtYXRjaFxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRWaWRlb0R1cmF0aW9uKHZpZGVvUGF0aDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBmZm1wZWcuZmZwcm9iZSh2aWRlb1BhdGgsIChlcnI6IGFueSwgbWV0YWRhdGE6IGFueSkgPT4ge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICBjb25zb2xlLndhcm4oJ+KaoO+4jyBDb3VsZCBub3QgZ2V0IHZpZGVvIGR1cmF0aW9uLCB1c2luZyBkZWZhdWx0OicsIGVycik7XG4gICAgICAgIHJlc29sdmUoNSk7IC8vIERlZmF1bHQgZHVyYXRpb25cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc29sdmUobWV0YWRhdGEuZm9ybWF0LmR1cmF0aW9uIHx8IDUpO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVwbG9hZFRvUzMoXG4gIGZpbGVQYXRoOiBzdHJpbmcsXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coYPCfk4EgUmVhZGluZyBmaWxlOiAke2ZpbGVQYXRofWApO1xuICAgIGNvbnN0IGZpbGVCdWZmZXIgPSBmcy5yZWFkRmlsZVN5bmMoZmlsZVBhdGgpO1xuICAgIGNvbnNvbGUubG9nKGDwn5OKIEZpbGUgc2l6ZTogJHtmaWxlQnVmZmVyLmxlbmd0aH0gYnl0ZXNgKTtcblxuICAgIGNvbnN0IHZpZGVvS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0tZmluYWwtdmlkZW8ubXA0YDtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYOKYge+4jyBVcGxvYWRpbmcgdG8gUzM6ICR7cHJvY2Vzcy5lbnYuVklERU9fQlVDS0VUX05BTUV9LyR7dmlkZW9LZXl9YCxcbiAgICApO1xuICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fQlVDS0VUX05BTUUsXG4gICAgICAgIEtleTogdmlkZW9LZXksXG4gICAgICAgIEJvZHk6IGZpbGVCdWZmZXIsXG4gICAgICAgIENvbnRlbnRUeXBlOiAndmlkZW8vbXA0JyxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coJ+KchSBVcGxvYWQgc3VjY2Vzc2Z1bCcpO1xuXG4gICAgcmV0dXJuIHZpZGVvS2V5O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciB1cGxvYWRpbmcgdG8gUzM6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=