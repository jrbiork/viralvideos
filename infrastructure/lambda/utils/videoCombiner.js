"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.combineVideoAndAudio = combineVideoAndAudio;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ffmpeg = require('fluent-ffmpeg');
// Probe media duration in seconds (fallback to 0 if unavailable)
function probeDuration(filePath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, data) => {
            if (err)
                return resolve(0);
            const dur = Number(data?.format?.duration ?? 0);
            resolve(Number.isFinite(dur) ? dur : 0);
        });
    });
}
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
async function combineVideoAndAudio(userId, timestamp, manifest, removedScenes = [], user) {
    console.log('🎬 Combining video, audio, and subtitles scene by scene for user:', userId);
    try {
        console.log('🔍 Using manifest for scene ordering:', manifest.scenes.length, 'scenes');
        console.log('🔍 Removed scenes to exclude:', removedScenes);
        if (!manifest.scenes || manifest.scenes.length === 0) {
            throw new Error('No scenes found in manifest');
        }
        // Filter out removed scenes and sort by scenePosition to ensure proper order
        const filteredScenes = manifest.scenes.filter((scene) => {
            const isRemoved = removedScenes.includes(scene.id);
            if (isRemoved) {
                console.log(`🚫 Excluding removed scene ID: ${scene.id} (position: ${scene.scenePosition})`);
            }
            return !isRemoved;
        });
        const sortedScenes = filteredScenes.sort((a, b) => a.scenePosition - b.scenePosition);
        console.log('🔍 Sorted scenes by scenePosition:', sortedScenes.map((s) => ({
            scenePosition: s.scenePosition,
            hasVideo: !!s.files?.mp4,
            hasAudio: !!s.files?.mp3,
            hasSubtitle: !!s.files?.ass,
        })));
        // Process all scenes in parallel: combine video + audio + subtitle
        const sceneProcessingPromises = sortedScenes.map(async (scene, i) => {
            const scenePosition = scene.scenePosition;
            // Create file objects based on manifest
            // Extract S3 key from URL if it's a full URL, otherwise use as-is
            const extractS3Key = (url) => {
                if (url.startsWith('https://')) {
                    // Extract key from S3 URL
                    const urlParts = url.split('/');
                    return urlParts.slice(3).join('/'); // Remove bucket and domain parts
                }
                return url;
            };
            const videoFile = scene.files?.mp4
                ? { Key: extractS3Key(scene.files.mp4) }
                : null;
            const audioFile = scene.files?.mp3
                ? { Key: extractS3Key(scene.files.mp3) }
                : null;
            const subtitleFile = scene.files?.ass
                ? { Key: extractS3Key(scene.files.ass) }
                : null;
            if (!videoFile?.Key) {
                console.warn(`⚠️ No video file found for scene at position ${scenePosition}`);
                return null;
            }
            return await processScene(videoFile, audioFile, subtitleFile, scenePosition, userId, timestamp);
        });
        const combinedScenePaths = (await Promise.all(sceneProcessingPromises)).filter((path) => path !== null);
        console.log('🔍 sceneProcessingPromises finished:', combinedScenePaths);
        // Now concatenate all combined scenes
        const finalOutputPath = await concatenateScenes(combinedScenePaths);
        console.log('🔍 finalOutputPath start:', finalOutputPath);
        // Upload final video to S3
        const finalVideoBuffer = fs.readFileSync(finalOutputPath);
        const finalVideoKey = `${userId}/${timestamp}-final-video.mp4`;
        const size = finalVideoBuffer.length.toString();
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: process.env.VIDEO_BUCKET_NAME,
            Key: finalVideoKey,
            Body: finalVideoBuffer,
            ContentType: 'video/mp4',
            Metadata: {
                size,
                duration: manifest.totalDuration.toString(),
                sceneCount: manifest.sceneCount.toString(),
            },
        }));
        console.log('💾 Final video uploaded to S3:', finalVideoKey);
        // Generate pre-signed URL for the final video
        const finalVideoSignedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({
            Bucket: process.env.VIDEO_BUCKET_NAME,
            Key: finalVideoKey,
        }), { expiresIn: 36000 });
        console.log('🔗 Final video pre-signed URL generated');
        // Clean up the temporary final video file
        if (fs.existsSync(finalOutputPath)) {
            fs.unlinkSync(finalOutputPath);
        }
        return { finalVideoSignedUrl, size };
    }
    catch (error) {
        console.error('❌ Error in combineVideoAndAudio:', error);
        throw error;
    }
}
/**
 * Concatenates multiple video scene files into a single final video
 * @param combinedScenePaths Array of paths to combined scene video files
 * @returns Path to the final concatenated video file
 */
async function concatenateScenes(combinedScenePaths) {
    console.log('🎬 Concatenating all combined scenes...');
    const fileListPath = path.join(os.tmpdir(), 'combined-scenes-filelist.txt');
    const fileListContent = combinedScenePaths
        .map((scenePath) => `file '${scenePath}'`)
        .join('\n');
    fs.writeFileSync(fileListPath, fileListContent);
    const finalOutputPath = path.join(os.tmpdir(), 'final-video.mp4');
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            console.error('❌ Timeout concatenating scenes after 10 minutes');
            reject(new Error('Timeout concatenating scenes'));
        }, 10 * 60 * 1000); // 10 minute timeout
        ffmpeg()
            .input(fileListPath)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions([
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '23',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-threads',
            '0',
        ])
            .output(finalOutputPath)
            .on('end', () => {
            clearTimeout(timeout);
            console.log('✅ All scenes concatenated successfully');
            // Clean up temporary files
            combinedScenePaths.forEach((scenePath) => {
                if (fs.existsSync(scenePath))
                    fs.unlinkSync(scenePath);
            });
            if (fs.existsSync(fileListPath))
                fs.unlinkSync(fileListPath);
            resolve(finalOutputPath);
        })
            .on('error', (err) => {
            clearTimeout(timeout);
            console.error('❌ Error concatenating scenes:', err);
            reject(err);
        })
            .run();
    });
}
/**
 * Processes a single scene by combining video, audio, and subtitle files
 * @param videoFile S3 object containing video file info
 * @param audioFile S3 object containing audio file info (optional)
 * @param subtitleFile S3 object containing subtitle file info (optional)
 * @param scenePosition Index of the scene being processed
 * @param userId User ID for S3 operations
 * @param timestamp Timestamp for S3 operations
 * @returns Path to the combined scene file
 */
async function processScene(videoFile, audioFile, subtitleFile, scenePosition, userId, timestamp) {
    // Extract the actual scene ID from the filename
    const sceneIdMatch = videoFile.Key.match(/scene-(\d+)\.mp4/);
    const sceneId = sceneIdMatch ? parseInt(sceneIdMatch[1]) : scenePosition;
    console.log(`🎬 Processing scene ${scenePosition} (ID: ${sceneId}): combining video + audio + subtitle`);
    // Download video file
    const videoPath = path.join(os.tmpdir(), `scene-${scenePosition}-video.mp4`);
    const videoObject = await s3.send(new client_s3_1.GetObjectCommand({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Key: videoFile.Key,
    }));
    const videoBuffer = Buffer.from(await videoObject.Body.transformToByteArray());
    fs.writeFileSync(videoPath, videoBuffer);
    // Download audio file
    let audioPath = null;
    if (audioFile?.Key) {
        audioPath = path.join(os.tmpdir(), `scene-${scenePosition}-audio.mp3`);
        const audioObject = await s3.send(new client_s3_1.GetObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: audioFile.Key,
        }));
        const audioBuffer = Buffer.from(await audioObject.Body.transformToByteArray());
        fs.writeFileSync(audioPath, audioBuffer);
    }
    // Download subtitle file
    let subtitlePath = null;
    let padVideoSeconds = undefined;
    let targetDuration = undefined;
    if (subtitleFile?.Key) {
        subtitlePath = path.join(os.tmpdir(), `scene-${scenePosition}-subtitle.ass`);
        const subtitleObject = await s3.send(new client_s3_1.GetObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: subtitleFile.Key,
        }));
        const subtitleBuffer = Buffer.from(await subtitleObject.Body.transformToByteArray());
        fs.writeFileSync(subtitlePath, subtitleBuffer);
        // Measure stream durations to ensure final scene matches the longest
        const videoDuration = await probeDuration(videoPath);
        const audioDuration = audioPath ? await probeDuration(audioPath) : 0;
        targetDuration = Math.max(videoDuration, audioDuration);
        padVideoSeconds = Math.max(0, audioDuration - videoDuration);
        console.log(`⏱️ Scene ${scenePosition} durations: video=${videoDuration.toFixed(3)}s, audio=${audioDuration.toFixed(3)}s, target=${targetDuration.toFixed(3)}s, padVideo=${padVideoSeconds.toFixed(3)}s`);
    }
    else {
        // If no subtitle, still measure durations for padding
        const videoDuration = await probeDuration(videoPath);
        const audioDuration = audioPath ? await probeDuration(audioPath) : 0;
        targetDuration = Math.max(videoDuration, audioDuration);
        padVideoSeconds = Math.max(0, audioDuration - videoDuration);
        console.log(`⏱️ Scene ${scenePosition} durations: video=${videoDuration.toFixed(3)}s, audio=${audioDuration.toFixed(3)}s, target=${targetDuration.toFixed(3)}s, padVideo=${padVideoSeconds.toFixed(3)}s`);
    }
    // Combine video + audio + subtitle for this scene
    const combinedScenePath = path.join(os.tmpdir(), `scene-${scenePosition}-combined.mp4`);
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            console.error(`❌ Timeout combining scene ${scenePosition} after 5 minutes`);
            reject(new Error(`Timeout combining scene ${scenePosition}`));
        }, 5 * 60 * 1000); // 5 minute timeout
        const command = ffmpeg().input(videoPath);
        if (audioPath) {
            command.input(audioPath);
            command.outputOptions([
                '-map',
                '1:a:0',
                '-c:a',
                'aac',
                '-b:a',
                '128k',
                // pad short audio with silence and reset PTS to start at 0
                '-filter:a',
                'apad,asetpts=PTS-STARTPTS',
            ]);
        }
        command.outputOptions([
            '-map',
            '0:v:0',
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-crf',
            '28',
            '-pix_fmt',
            'yuv420p',
            '-vsync',
            '1',
            '-threads',
            '0',
        ]);
        // Build video filters: reset PTS, then subtitles, then optional tpad if audio is longer
        const vfParts = ['setpts=PTS-STARTPTS'];
        if (subtitlePath && fs.existsSync(subtitlePath)) {
            vfParts.push(`ass=${subtitlePath}:fontsdir=/opt/fonts`);
        }
        if (typeof padVideoSeconds !== 'undefined' && padVideoSeconds > 0.005) {
            // Extend video by cloning last frame to match longer audio
            vfParts.push(`tpad=stop_mode=clone:stop_duration=${padVideoSeconds.toFixed(3)}`);
        }
        command.outputOptions(['-vf', vfParts.join(',')]);
        command.outputOptions(['-t', targetDuration.toFixed(3)]);
        console.log('🔍 command output options new:', command.outputOptions());
        command
            .output(combinedScenePath)
            .on('end', async () => {
            clearTimeout(timeout);
            console.log(`✅ Scene ${scenePosition} combined successfully!`);
            // Save combined scene to S3 for testing purposes
            try {
                const combinedSceneBuffer = fs.readFileSync(combinedScenePath);
                const combinedSceneKey = `${userId}/${timestamp}.scene-${scenePosition}-combined.mp4`;
                await s3.send(new client_s3_1.PutObjectCommand({
                    Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                    Key: combinedSceneKey,
                    Body: combinedSceneBuffer,
                    ContentType: 'video/mp4',
                }));
                console.log(`💾 Scene ${scenePosition} (ID: ${sceneId}) combined file saved to S3: ${combinedSceneKey}`);
            }
            catch (error) {
                console.warn(`⚠️ Could not save combined scene ${scenePosition} (ID: ${sceneId}) to S3:`, error);
            }
            // Clean up individual scene files
            if (fs.existsSync(videoPath))
                fs.unlinkSync(videoPath);
            if (audioPath && fs.existsSync(audioPath))
                fs.unlinkSync(audioPath);
            if (subtitlePath && fs.existsSync(subtitlePath))
                fs.unlinkSync(subtitlePath);
            resolve(combinedScenePath);
        })
            .on('error', (err) => {
            clearTimeout(timeout);
            console.error(`❌ Error combining scene ${scenePosition}:`, err);
            reject(err);
        })
            .run();
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9Db21iaW5lci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZpZGVvQ29tYmluZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUF3Q0Esb0RBa0pDO0FBMUxELGtEQUk0QjtBQUM1Qix3RUFBNkQ7QUFHN0QseUJBQXlCO0FBQ3pCLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFHN0IsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBRXhDLGlFQUFpRTtBQUNqRSxTQUFTLGFBQWEsQ0FBQyxRQUFnQjtJQUNyQyxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7UUFDN0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxHQUFpQixFQUFFLElBQVMsRUFBRSxFQUFFO1lBQ3hELElBQUksR0FBRztnQkFBRSxPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQixNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDaEQsT0FBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUM7QUFPRCxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBU3JELEtBQUssVUFBVSxvQkFBb0IsQ0FDeEMsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLFFBQWtCLEVBQ2xCLGdCQUEwQixFQUFFLEVBQzVCLElBQXFCO0lBRXJCLE9BQU8sQ0FBQyxHQUFHLENBQ1QsbUVBQW1FLEVBQ25FLE1BQU0sQ0FDUCxDQUFDO0lBRUYs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QUM1RixDQUFDO1lBQ0osQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2YsT0FBTyxDQUFDLElBQUksQ0FDVixvQ0FBb0MsYUFBYSxTQUFTLE9BQU8sVUFBVSxFQUMzRSxLQUFLLENBQ04sQ0FBQztZQUNKLENBQUM7WUFFRCxrQ0FBa0M7WUFDbEMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQztnQkFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3ZELElBQUksU0FBUyxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDO2dCQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDcEUsSUFBSSxZQUFZLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUM7Z0JBQzdDLEVBQUUsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUM7WUFFOUIsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDN0IsQ0FBQyxDQUFDO2FBQ0QsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLEdBQVUsRUFBRSxFQUFFO1lBQzFCLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN0QixPQUFPLENBQUMsS0FBSyxDQUFDLDJCQUEyQixhQUFhLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNoRSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDZCxDQUFDLENBQUM7YUFDRCxHQUFHLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIFMzQ2xpZW50LFxuICBHZXRPYmplY3RDb21tYW5kLFxuICBQdXRPYmplY3RDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSAnQGF3cy1zZGsvczMtcmVxdWVzdC1wcmVzaWduZXInO1xuaW1wb3J0IHsgTWFuaWZlc3QsIE1hbmlmZXN0U2NlbmUgfSBmcm9tICcuLi90eXBlcy9zM1R5cGVzJztcblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IFVzZXJJdGVtIH0gZnJvbSAnLi91c2VyJztcblxuY29uc3QgZmZtcGVnID0gcmVxdWlyZSgnZmx1ZW50LWZmbXBlZycpO1xuXG4vLyBQcm9iZSBtZWRpYSBkdXJhdGlvbiBpbiBzZWNvbmRzIChmYWxsYmFjayB0byAwIGlmIHVuYXZhaWxhYmxlKVxuZnVuY3Rpb24gcHJvYmVEdXJhdGlvbihmaWxlUGF0aDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgZmZtcGVnLmZmcHJvYmUoZmlsZVBhdGgsIChlcnI6IEVycm9yIHwgbnVsbCwgZGF0YTogYW55KSA9PiB7XG4gICAgICBpZiAoZXJyKSByZXR1cm4gcmVzb2x2ZSgwKTtcbiAgICAgIGNvbnN0IGR1ciA9IE51bWJlcihkYXRhPy5mb3JtYXQ/LmR1cmF0aW9uID8/IDApO1xuICAgICAgcmVzb2x2ZShOdW1iZXIuaXNGaW5pdGUoZHVyKSA/IGR1ciA6IDApO1xuICAgIH0pO1xuICB9KTtcbn1cblxuLy8gUzMgZmlsZSBvYmplY3QgaW50ZXJmYWNlXG5pbnRlcmZhY2UgUzNGaWxlT2JqZWN0IHtcbiAgS2V5OiBzdHJpbmc7XG59XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjZW5lIHtcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgbmFycmF0aW9uOiBzdHJpbmc7XG4gIGlkOiBudW1iZXI7IC8vIEFkZCBpZCBwcm9wZXJ0eVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYmluZVZpZGVvQW5kQXVkaW8oXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgbWFuaWZlc3Q6IE1hbmlmZXN0LFxuICByZW1vdmVkU2NlbmVzOiBudW1iZXJbXSA9IFtdLFxuICB1c2VyOiBVc2VySXRlbSB8IG51bGwsXG4pOiBQcm9taXNlPHsgZmluYWxWaWRlb1NpZ25lZFVybDogc3RyaW5nOyBzaXplOiBzdHJpbmcgfT4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+OrCBDb21iaW5pbmcgdmlkZW8sIGF1ZGlvLCBhbmQgc3VidGl0bGVzIHNjZW5lIGJ5IHNjZW5lIGZvciB1c2VyOicsXG4gICAgdXNlcklkLFxuICApO1xuXG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coXG4gICAgICAn8J+UjSBVc2luZyBtYW5pZmVzdCBmb3Igc2NlbmUgb3JkZXJpbmc6JyxcbiAgICAgIG1hbmlmZXN0LnNjZW5lcy5sZW5ndGgsXG4gICAgICAnc2NlbmVzJyxcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKCfwn5SNIFJlbW92ZWQgc2NlbmVzIHRvIGV4Y2x1ZGU6JywgcmVtb3ZlZFNjZW5lcyk7XG5cbiAgICBpZiAoIW1hbmlmZXN0LnNjZW5lcyB8fCBtYW5pZmVzdC5zY2VuZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHNjZW5lcyBmb3VuZCBpbiBtYW5pZmVzdCcpO1xuICAgIH1cblxuICAgIC8vIEZpbHRlciBvdXQgcmVtb3ZlZCBzY2VuZXMgYW5kIHNvcnQgYnkgc2NlbmVQb3NpdGlvbiB0byBlbnN1cmUgcHJvcGVyIG9yZGVyXG4gICAgY29uc3QgZmlsdGVyZWRTY2VuZXMgPSBtYW5pZmVzdC5zY2VuZXMuZmlsdGVyKChzY2VuZTogTWFuaWZlc3RTY2VuZSkgPT4ge1xuICAgICAgY29uc3QgaXNSZW1vdmVkID0gcmVtb3ZlZFNjZW5lcy5pbmNsdWRlcyhzY2VuZS5pZCk7XG4gICAgICBpZiAoaXNSZW1vdmVkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGDwn5qrIEV4Y2x1ZGluZyByZW1vdmVkIHNjZW5lIElEOiAke3NjZW5lLmlkfSAocG9zaXRpb246ICR7c2NlbmUuc2NlbmVQb3NpdGlvbn0pYCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAhaXNSZW1vdmVkO1xuICAgIH0pO1xuXG4gICAgY29uc3Qgc29ydGVkU2NlbmVzID0gZmlsdGVyZWRTY2VuZXMuc29ydChcbiAgICAgIChhOiBNYW5pZmVzdFNjZW5lLCBiOiBNYW5pZmVzdFNjZW5lKSA9PiBhLnNjZW5lUG9zaXRpb24gLSBiLnNjZW5lUG9zaXRpb24sXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgJ/CflI0gU29ydGVkIHNjZW5lcyBieSBzY2VuZVBvc2l0aW9uOicsXG4gICAgICBzb3J0ZWRTY2VuZXMubWFwKChzOiBNYW5pZmVzdFNjZW5lKSA9PiAoe1xuICAgICAgICBzY2VuZVBvc2l0aW9uOiBzLnNjZW5lUG9zaXRpb24sXG4gICAgICAgIGhhc1ZpZGVvOiAhIXMuZmlsZXM/Lm1wNCxcbiAgICAgICAgaGFzQXVkaW86ICEhcy5maWxlcz8ubXAzLFxuICAgICAgICBoYXNTdWJ0aXRsZTogISFzLmZpbGVzPy5hc3MsXG4gICAgICB9KSksXG4gICAgKTtcblxuICAgIC8vIFByb2Nlc3MgYWxsIHNjZW5lcyBpbiBwYXJhbGxlbDogY29tYmluZSB2aWRlbyArIGF1ZGlvICsgc3VidGl0bGVcbiAgICBjb25zdCBzY2VuZVByb2Nlc3NpbmdQcm9taXNlcyA9IHNvcnRlZFNjZW5lcy5tYXAoXG4gICAgICBhc3luYyAoc2NlbmU6IE1hbmlmZXN0U2NlbmUsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICBjb25zdCBzY2VuZVBvc2l0aW9uID0gc2NlbmUuc2NlbmVQb3NpdGlvbjtcblxuICAgICAgICAvLyBDcmVhdGUgZmlsZSBvYmplY3RzIGJhc2VkIG9uIG1hbmlmZXN0XG4gICAgICAgIC8vIEV4dHJhY3QgUzMga2V5IGZyb20gVVJMIGlmIGl0J3MgYSBmdWxsIFVSTCwgb3RoZXJ3aXNlIHVzZSBhcy1pc1xuICAgICAgICBjb25zdCBleHRyYWN0UzNLZXkgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgICAgICAgIGlmICh1cmwuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKSkge1xuICAgICAgICAgICAgLy8gRXh0cmFjdCBrZXkgZnJvbSBTMyBVUkxcbiAgICAgICAgICAgIGNvbnN0IHVybFBhcnRzID0gdXJsLnNwbGl0KCcvJyk7XG4gICAgICAgICAgICByZXR1cm4gdXJsUGFydHMuc2xpY2UoMykuam9pbignLycpOyAvLyBSZW1vdmUgYnVja2V0IGFuZCBkb21haW4gcGFydHNcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHVybDtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCB2aWRlb0ZpbGUgPSBzY2VuZS5maWxlcz8ubXA0XG4gICAgICAgICAgPyB7IEtleTogZXh0cmFjdFMzS2V5KHNjZW5lLmZpbGVzLm1wNCkgfVxuICAgICAgICAgIDogbnVsbDtcbiAgICAgICAgY29uc3QgYXVkaW9GaWxlID0gc2NlbmUuZmlsZXM/Lm1wM1xuICAgICAgICAgID8geyBLZXk6IGV4dHJhY3RTM0tleShzY2VuZS5maWxlcy5tcDMpIH1cbiAgICAgICAgICA6IG51bGw7XG4gICAgICAgIGNvbnN0IHN1YnRpdGxlRmlsZSA9IHNjZW5lLmZpbGVzPy5hc3NcbiAgICAgICAgICA/IHsgS2V5OiBleHRyYWN0UzNLZXkoc2NlbmUuZmlsZXMuYXNzKSB9XG4gICAgICAgICAgOiBudWxsO1xuXG4gICAgICAgIGlmICghdmlkZW9GaWxlPy5LZXkpIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICBg4pqg77iPIE5vIHZpZGVvIGZpbGUgZm91bmQgZm9yIHNjZW5lIGF0IHBvc2l0aW9uICR7c2NlbmVQb3NpdGlvbn1gLFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYXdhaXQgcHJvY2Vzc1NjZW5lKFxuICAgICAgICAgIHZpZGVvRmlsZSxcbiAgICAgICAgICBhdWRpb0ZpbGUsXG4gICAgICAgICAgc3VidGl0bGVGaWxlLFxuICAgICAgICAgIHNjZW5lUG9zaXRpb24sXG4gICAgICAgICAgdXNlcklkLFxuICAgICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgKTtcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IGNvbWJpbmVkU2NlbmVQYXRocyA9IChcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKHNjZW5lUHJvY2Vzc2luZ1Byb21pc2VzKVxuICAgICkuZmlsdGVyKChwYXRoKTogcGF0aCBpcyBzdHJpbmcgPT4gcGF0aCAhPT0gbnVsbCk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+UjSBzY2VuZVByb2Nlc3NpbmdQcm9taXNlcyBmaW5pc2hlZDonLCBjb21iaW5lZFNjZW5lUGF0aHMpO1xuXG4gICAgLy8gTm93IGNvbmNhdGVuYXRlIGFsbCBjb21iaW5lZCBzY2VuZXNcbiAgICBjb25zdCBmaW5hbE91dHB1dFBhdGggPSBhd2FpdCBjb25jYXRlbmF0ZVNjZW5lcyhjb21iaW5lZFNjZW5lUGF0aHMpO1xuXG4gICAgY29uc29sZS5sb2coJ/CflI0gZmluYWxPdXRwdXRQYXRoIHN0YXJ0OicsIGZpbmFsT3V0cHV0UGF0aCk7XG5cbiAgICAvLyBVcGxvYWQgZmluYWwgdmlkZW8gdG8gUzNcbiAgICBjb25zdCBmaW5hbFZpZGVvQnVmZmVyID0gZnMucmVhZEZpbGVTeW5jKGZpbmFsT3V0cHV0UGF0aCk7XG4gICAgY29uc3QgZmluYWxWaWRlb0tleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LWZpbmFsLXZpZGVvLm1wNGA7XG4gICAgY29uc3Qgc2l6ZSA9IGZpbmFsVmlkZW9CdWZmZXIubGVuZ3RoLnRvU3RyaW5nKCk7XG4gICAgYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiBmaW5hbFZpZGVvS2V5LFxuICAgICAgICBCb2R5OiBmaW5hbFZpZGVvQnVmZmVyLFxuICAgICAgICBDb250ZW50VHlwZTogJ3ZpZGVvL21wNCcsXG4gICAgICAgIE1ldGFkYXRhOiB7XG4gICAgICAgICAgc2l6ZSxcbiAgICAgICAgICBkdXJhdGlvbjogbWFuaWZlc3QudG90YWxEdXJhdGlvbi50b1N0cmluZygpLFxuICAgICAgICAgIHNjZW5lQ291bnQ6IG1hbmlmZXN0LnNjZW5lQ291bnQudG9TdHJpbmcoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+SviBGaW5hbCB2aWRlbyB1cGxvYWRlZCB0byBTMzonLCBmaW5hbFZpZGVvS2V5KTtcblxuICAgIC8vIEdlbmVyYXRlIHByZS1zaWduZWQgVVJMIGZvciB0aGUgZmluYWwgdmlkZW9cbiAgICBjb25zdCBmaW5hbFZpZGVvU2lnbmVkVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKFxuICAgICAgczMsXG4gICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fQlVDS0VUX05BTUUsXG4gICAgICAgIEtleTogZmluYWxWaWRlb0tleSxcbiAgICAgIH0pLFxuICAgICAgeyBleHBpcmVzSW46IDM2MDAwIH0sIC8vIDEwIGhvdXJzIGV4cGlyYXRpb25cbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/CflJcgRmluYWwgdmlkZW8gcHJlLXNpZ25lZCBVUkwgZ2VuZXJhdGVkJyk7XG5cbiAgICAvLyBDbGVhbiB1cCB0aGUgdGVtcG9yYXJ5IGZpbmFsIHZpZGVvIGZpbGVcbiAgICBpZiAoZnMuZXhpc3RzU3luYyhmaW5hbE91dHB1dFBhdGgpKSB7XG4gICAgICBmcy51bmxpbmtTeW5jKGZpbmFsT3V0cHV0UGF0aCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgZmluYWxWaWRlb1NpZ25lZFVybCwgc2l6ZSB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBjb21iaW5lVmlkZW9BbmRBdWRpbzonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuLyoqXG4gKiBDb25jYXRlbmF0ZXMgbXVsdGlwbGUgdmlkZW8gc2NlbmUgZmlsZXMgaW50byBhIHNpbmdsZSBmaW5hbCB2aWRlb1xuICogQHBhcmFtIGNvbWJpbmVkU2NlbmVQYXRocyBBcnJheSBvZiBwYXRocyB0byBjb21iaW5lZCBzY2VuZSB2aWRlbyBmaWxlc1xuICogQHJldHVybnMgUGF0aCB0byB0aGUgZmluYWwgY29uY2F0ZW5hdGVkIHZpZGVvIGZpbGVcbiAqL1xuYXN5bmMgZnVuY3Rpb24gY29uY2F0ZW5hdGVTY2VuZXMoXG4gIGNvbWJpbmVkU2NlbmVQYXRoczogc3RyaW5nW10sXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zb2xlLmxvZygn8J+OrCBDb25jYXRlbmF0aW5nIGFsbCBjb21iaW5lZCBzY2VuZXMuLi4nKTtcblxuICBjb25zdCBmaWxlTGlzdFBhdGggPSBwYXRoLmpvaW4ob3MudG1wZGlyKCksICdjb21iaW5lZC1zY2VuZXMtZmlsZWxpc3QudHh0Jyk7XG4gIGNvbnN0IGZpbGVMaXN0Q29udGVudCA9IGNvbWJpbmVkU2NlbmVQYXRoc1xuICAgIC5tYXAoKHNjZW5lUGF0aCkgPT4gYGZpbGUgJyR7c2NlbmVQYXRofSdgKVxuICAgIC5qb2luKCdcXG4nKTtcbiAgZnMud3JpdGVGaWxlU3luYyhmaWxlTGlzdFBhdGgsIGZpbGVMaXN0Q29udGVudCk7XG5cbiAgY29uc3QgZmluYWxPdXRwdXRQYXRoID0gcGF0aC5qb2luKG9zLnRtcGRpcigpLCAnZmluYWwtdmlkZW8ubXA0Jyk7XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBUaW1lb3V0IGNvbmNhdGVuYXRpbmcgc2NlbmVzIGFmdGVyIDEwIG1pbnV0ZXMnKTtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoJ1RpbWVvdXQgY29uY2F0ZW5hdGluZyBzY2VuZXMnKSk7XG4gICAgfSwgMTAgKiA2MCAqIDEwMDApOyAvLyAxMCBtaW51dGUgdGltZW91dFxuXG4gICAgZmZtcGVnKClcbiAgICAgIC5pbnB1dChmaWxlTGlzdFBhdGgpXG4gICAgICAuaW5wdXRPcHRpb25zKFsnLWYnLCAnY29uY2F0JywgJy1zYWZlJywgJzAnXSlcbiAgICAgIC5vdXRwdXRPcHRpb25zKFtcbiAgICAgICAgJy1jOnYnLFxuICAgICAgICAnbGlieDI2NCcsXG4gICAgICAgICctcHJlc2V0JyxcbiAgICAgICAgJ3ZlcnlmYXN0JyxcbiAgICAgICAgJy1jcmYnLFxuICAgICAgICAnMjMnLFxuICAgICAgICAnLXBpeF9mbXQnLFxuICAgICAgICAneXV2NDIwcCcsXG4gICAgICAgICctYzphJyxcbiAgICAgICAgJ2FhYycsXG4gICAgICAgICctYjphJyxcbiAgICAgICAgJzEyOGsnLFxuICAgICAgICAnLXRocmVhZHMnLFxuICAgICAgICAnMCcsXG4gICAgICBdKVxuICAgICAgLm91dHB1dChmaW5hbE91dHB1dFBhdGgpXG4gICAgICAub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICBjb25zb2xlLmxvZygn4pyFIEFsbCBzY2VuZXMgY29uY2F0ZW5hdGVkIHN1Y2Nlc3NmdWxseScpO1xuXG4gICAgICAgIC8vIENsZWFuIHVwIHRlbXBvcmFyeSBmaWxlc1xuICAgICAgICBjb21iaW5lZFNjZW5lUGF0aHMuZm9yRWFjaCgoc2NlbmVQYXRoKSA9PiB7XG4gICAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoc2NlbmVQYXRoKSkgZnMudW5saW5rU3luYyhzY2VuZVBhdGgpO1xuICAgICAgICB9KTtcbiAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZmlsZUxpc3RQYXRoKSkgZnMudW5saW5rU3luYyhmaWxlTGlzdFBhdGgpO1xuXG4gICAgICAgIHJlc29sdmUoZmluYWxPdXRwdXRQYXRoKTtcbiAgICAgIH0pXG4gICAgICAub24oJ2Vycm9yJywgKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgY29uY2F0ZW5hdGluZyBzY2VuZXM6JywgZXJyKTtcbiAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICB9KVxuICAgICAgLnJ1bigpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBQcm9jZXNzZXMgYSBzaW5nbGUgc2NlbmUgYnkgY29tYmluaW5nIHZpZGVvLCBhdWRpbywgYW5kIHN1YnRpdGxlIGZpbGVzXG4gKiBAcGFyYW0gdmlkZW9GaWxlIFMzIG9iamVjdCBjb250YWluaW5nIHZpZGVvIGZpbGUgaW5mb1xuICogQHBhcmFtIGF1ZGlvRmlsZSBTMyBvYmplY3QgY29udGFpbmluZyBhdWRpbyBmaWxlIGluZm8gKG9wdGlvbmFsKVxuICogQHBhcmFtIHN1YnRpdGxlRmlsZSBTMyBvYmplY3QgY29udGFpbmluZyBzdWJ0aXRsZSBmaWxlIGluZm8gKG9wdGlvbmFsKVxuICogQHBhcmFtIHNjZW5lUG9zaXRpb24gSW5kZXggb2YgdGhlIHNjZW5lIGJlaW5nIHByb2Nlc3NlZFxuICogQHBhcmFtIHVzZXJJZCBVc2VyIElEIGZvciBTMyBvcGVyYXRpb25zXG4gKiBAcGFyYW0gdGltZXN0YW1wIFRpbWVzdGFtcCBmb3IgUzMgb3BlcmF0aW9uc1xuICogQHJldHVybnMgUGF0aCB0byB0aGUgY29tYmluZWQgc2NlbmUgZmlsZVxuICovXG5hc3luYyBmdW5jdGlvbiBwcm9jZXNzU2NlbmUoXG4gIHZpZGVvRmlsZTogUzNGaWxlT2JqZWN0LFxuICBhdWRpb0ZpbGU6IFMzRmlsZU9iamVjdCB8IG51bGwsXG4gIHN1YnRpdGxlRmlsZTogUzNGaWxlT2JqZWN0IHwgbnVsbCxcbiAgc2NlbmVQb3NpdGlvbjogbnVtYmVyLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICAvLyBFeHRyYWN0IHRoZSBhY3R1YWwgc2NlbmUgSUQgZnJvbSB0aGUgZmlsZW5hbWVcbiAgY29uc3Qgc2NlbmVJZE1hdGNoID0gdmlkZW9GaWxlLktleS5tYXRjaCgvc2NlbmUtKFxcZCspXFwubXA0Lyk7XG4gIGNvbnN0IHNjZW5lSWQgPSBzY2VuZUlkTWF0Y2ggPyBwYXJzZUludChzY2VuZUlkTWF0Y2hbMV0pIDogc2NlbmVQb3NpdGlvbjtcblxuICBjb25zb2xlLmxvZyhcbiAgICBg8J+OrCBQcm9jZXNzaW5nIHNjZW5lICR7c2NlbmVQb3NpdGlvbn0gKElEOiAke3NjZW5lSWR9KTogY29tYmluaW5nIHZpZGVvICsgYXVkaW8gKyBzdWJ0aXRsZWAsXG4gICk7XG5cbiAgLy8gRG93bmxvYWQgdmlkZW8gZmlsZVxuICBjb25zdCB2aWRlb1BhdGggPSBwYXRoLmpvaW4ob3MudG1wZGlyKCksIGBzY2VuZS0ke3NjZW5lUG9zaXRpb259LXZpZGVvLm1wNGApO1xuICBjb25zdCB2aWRlb09iamVjdCA9IGF3YWl0IHMzLnNlbmQoXG4gICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgIEtleTogdmlkZW9GaWxlLktleSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgdmlkZW9CdWZmZXIgPSBCdWZmZXIuZnJvbShcbiAgICBhd2FpdCB2aWRlb09iamVjdC5Cb2R5IS50cmFuc2Zvcm1Ub0J5dGVBcnJheSgpLFxuICApO1xuICBmcy53cml0ZUZpbGVTeW5jKHZpZGVvUGF0aCwgdmlkZW9CdWZmZXIpO1xuXG4gIC8vIERvd25sb2FkIGF1ZGlvIGZpbGVcbiAgbGV0IGF1ZGlvUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGlmIChhdWRpb0ZpbGU/LktleSkge1xuICAgIGF1ZGlvUGF0aCA9IHBhdGguam9pbihvcy50bXBkaXIoKSwgYHNjZW5lLSR7c2NlbmVQb3NpdGlvbn0tYXVkaW8ubXAzYCk7XG4gICAgY29uc3QgYXVkaW9PYmplY3QgPSBhd2FpdCBzMy5zZW5kKFxuICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IGF1ZGlvRmlsZS5LZXksXG4gICAgICB9KSxcbiAgICApO1xuICAgIGNvbnN0IGF1ZGlvQnVmZmVyID0gQnVmZmVyLmZyb20oXG4gICAgICBhd2FpdCBhdWRpb09iamVjdC5Cb2R5IS50cmFuc2Zvcm1Ub0J5dGVBcnJheSgpLFxuICAgICk7XG4gICAgZnMud3JpdGVGaWxlU3luYyhhdWRpb1BhdGgsIGF1ZGlvQnVmZmVyKTtcbiAgfVxuXG4gIC8vIERvd25sb2FkIHN1YnRpdGxlIGZpbGVcbiAgbGV0IHN1YnRpdGxlUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGxldCBwYWRWaWRlb1NlY29uZHM6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgbGV0IHRhcmdldER1cmF0aW9uOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gIGlmIChzdWJ0aXRsZUZpbGU/LktleSkge1xuICAgIHN1YnRpdGxlUGF0aCA9IHBhdGguam9pbihcbiAgICAgIG9zLnRtcGRpcigpLFxuICAgICAgYHNjZW5lLSR7c2NlbmVQb3NpdGlvbn0tc3VidGl0bGUuYXNzYCxcbiAgICApO1xuICAgIGNvbnN0IHN1YnRpdGxlT2JqZWN0ID0gYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiBzdWJ0aXRsZUZpbGUuS2V5LFxuICAgICAgfSksXG4gICAgKTtcbiAgICBjb25zdCBzdWJ0aXRsZUJ1ZmZlciA9IEJ1ZmZlci5mcm9tKFxuICAgICAgYXdhaXQgc3VidGl0bGVPYmplY3QuQm9keSEudHJhbnNmb3JtVG9CeXRlQXJyYXkoKSxcbiAgICApO1xuICAgIGZzLndyaXRlRmlsZVN5bmMoc3VidGl0bGVQYXRoLCBzdWJ0aXRsZUJ1ZmZlcik7XG5cbiAgICAvLyBNZWFzdXJlIHN0cmVhbSBkdXJhdGlvbnMgdG8gZW5zdXJlIGZpbmFsIHNjZW5lIG1hdGNoZXMgdGhlIGxvbmdlc3RcbiAgICBjb25zdCB2aWRlb0R1cmF0aW9uID0gYXdhaXQgcHJvYmVEdXJhdGlvbih2aWRlb1BhdGgpO1xuICAgIGNvbnN0IGF1ZGlvRHVyYXRpb24gPSBhdWRpb1BhdGggPyBhd2FpdCBwcm9iZUR1cmF0aW9uKGF1ZGlvUGF0aCkgOiAwO1xuICAgIHRhcmdldER1cmF0aW9uID0gTWF0aC5tYXgodmlkZW9EdXJhdGlvbiwgYXVkaW9EdXJhdGlvbik7XG4gICAgcGFkVmlkZW9TZWNvbmRzID0gTWF0aC5tYXgoMCwgYXVkaW9EdXJhdGlvbiAtIHZpZGVvRHVyYXRpb24pO1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYOKPse+4jyBTY2VuZSAke3NjZW5lUG9zaXRpb259IGR1cmF0aW9uczogdmlkZW89JHt2aWRlb0R1cmF0aW9uLnRvRml4ZWQoXG4gICAgICAgIDMsXG4gICAgICApfXMsIGF1ZGlvPSR7YXVkaW9EdXJhdGlvbi50b0ZpeGVkKDMpfXMsIHRhcmdldD0ke3RhcmdldER1cmF0aW9uLnRvRml4ZWQoXG4gICAgICAgIDMsXG4gICAgICApfXMsIHBhZFZpZGVvPSR7cGFkVmlkZW9TZWNvbmRzLnRvRml4ZWQoMyl9c2AsXG4gICAgKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBJZiBubyBzdWJ0aXRsZSwgc3RpbGwgbWVhc3VyZSBkdXJhdGlvbnMgZm9yIHBhZGRpbmdcbiAgICBjb25zdCB2aWRlb0R1cmF0aW9uID0gYXdhaXQgcHJvYmVEdXJhdGlvbih2aWRlb1BhdGgpO1xuICAgIGNvbnN0IGF1ZGlvRHVyYXRpb24gPSBhdWRpb1BhdGggPyBhd2FpdCBwcm9iZUR1cmF0aW9uKGF1ZGlvUGF0aCkgOiAwO1xuICAgIHRhcmdldER1cmF0aW9uID0gTWF0aC5tYXgodmlkZW9EdXJhdGlvbiwgYXVkaW9EdXJhdGlvbik7XG4gICAgcGFkVmlkZW9TZWNvbmRzID0gTWF0aC5tYXgoMCwgYXVkaW9EdXJhdGlvbiAtIHZpZGVvRHVyYXRpb24pO1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYOKPse+4jyBTY2VuZSAke3NjZW5lUG9zaXRpb259IGR1cmF0aW9uczogdmlkZW89JHt2aWRlb0R1cmF0aW9uLnRvRml4ZWQoXG4gICAgICAgIDMsXG4gICAgICApfXMsIGF1ZGlvPSR7YXVkaW9EdXJhdGlvbi50b0ZpeGVkKDMpfXMsIHRhcmdldD0ke3RhcmdldER1cmF0aW9uLnRvRml4ZWQoXG4gICAgICAgIDMsXG4gICAgICApfXMsIHBhZFZpZGVvPSR7cGFkVmlkZW9TZWNvbmRzLnRvRml4ZWQoMyl9c2AsXG4gICAgKTtcbiAgfVxuXG4gIC8vIENvbWJpbmUgdmlkZW8gKyBhdWRpbyArIHN1YnRpdGxlIGZvciB0aGlzIHNjZW5lXG4gIGNvbnN0IGNvbWJpbmVkU2NlbmVQYXRoID0gcGF0aC5qb2luKFxuICAgIG9zLnRtcGRpcigpLFxuICAgIGBzY2VuZS0ke3NjZW5lUG9zaXRpb259LWNvbWJpbmVkLm1wNGAsXG4gICk7XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgIGDinYwgVGltZW91dCBjb21iaW5pbmcgc2NlbmUgJHtzY2VuZVBvc2l0aW9ufSBhZnRlciA1IG1pbnV0ZXNgLFxuICAgICAgKTtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoYFRpbWVvdXQgY29tYmluaW5nIHNjZW5lICR7c2NlbmVQb3NpdGlvbn1gKSk7XG4gICAgfSwgNSAqIDYwICogMTAwMCk7IC8vIDUgbWludXRlIHRpbWVvdXRcblxuICAgIGNvbnN0IGNvbW1hbmQgPSBmZm1wZWcoKS5pbnB1dCh2aWRlb1BhdGgpO1xuXG4gICAgaWYgKGF1ZGlvUGF0aCkge1xuICAgICAgY29tbWFuZC5pbnB1dChhdWRpb1BhdGgpO1xuICAgICAgY29tbWFuZC5vdXRwdXRPcHRpb25zKFtcbiAgICAgICAgJy1tYXAnLFxuICAgICAgICAnMTphOjAnLFxuICAgICAgICAnLWM6YScsXG4gICAgICAgICdhYWMnLFxuICAgICAgICAnLWI6YScsXG4gICAgICAgICcxMjhrJyxcbiAgICAgICAgLy8gcGFkIHNob3J0IGF1ZGlvIHdpdGggc2lsZW5jZSBhbmQgcmVzZXQgUFRTIHRvIHN0YXJ0IGF0IDBcbiAgICAgICAgJy1maWx0ZXI6YScsXG4gICAgICAgICdhcGFkLGFzZXRwdHM9UFRTLVNUQVJUUFRTJyxcbiAgICAgIF0pO1xuICAgIH1cblxuICAgIGNvbW1hbmQub3V0cHV0T3B0aW9ucyhbXG4gICAgICAnLW1hcCcsXG4gICAgICAnMDp2OjAnLFxuICAgICAgJy1jOnYnLFxuICAgICAgJ2xpYngyNjQnLFxuICAgICAgJy1wcmVzZXQnLFxuICAgICAgJ3VsdHJhZmFzdCcsXG4gICAgICAnLWNyZicsXG4gICAgICAnMjgnLFxuICAgICAgJy1waXhfZm10JyxcbiAgICAgICd5dXY0MjBwJyxcbiAgICAgICctdnN5bmMnLFxuICAgICAgJzEnLFxuICAgICAgJy10aHJlYWRzJyxcbiAgICAgICcwJyxcbiAgICBdKTtcblxuICAgIC8vIEJ1aWxkIHZpZGVvIGZpbHRlcnM6IHJlc2V0IFBUUywgdGhlbiBzdWJ0aXRsZXMsIHRoZW4gb3B0aW9uYWwgdHBhZCBpZiBhdWRpbyBpcyBsb25nZXJcbiAgICBjb25zdCB2ZlBhcnRzOiBzdHJpbmdbXSA9IFsnc2V0cHRzPVBUUy1TVEFSVFBUUyddO1xuICAgIGlmIChzdWJ0aXRsZVBhdGggJiYgZnMuZXhpc3RzU3luYyhzdWJ0aXRsZVBhdGgpKSB7XG4gICAgICB2ZlBhcnRzLnB1c2goYGFzcz0ke3N1YnRpdGxlUGF0aH06Zm9udHNkaXI9L29wdC9mb250c2ApO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHBhZFZpZGVvU2Vjb25kcyAhPT0gJ3VuZGVmaW5lZCcgJiYgcGFkVmlkZW9TZWNvbmRzID4gMC4wMDUpIHtcbiAgICAgIC8vIEV4dGVuZCB2aWRlbyBieSBjbG9uaW5nIGxhc3QgZnJhbWUgdG8gbWF0Y2ggbG9uZ2VyIGF1ZGlvXG4gICAgICB2ZlBhcnRzLnB1c2goXG4gICAgICAgIGB0cGFkPXN0b3BfbW9kZT1jbG9uZTpzdG9wX2R1cmF0aW9uPSR7cGFkVmlkZW9TZWNvbmRzLnRvRml4ZWQoMyl9YCxcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbW1hbmQub3V0cHV0T3B0aW9ucyhbJy12ZicsIHZmUGFydHMuam9pbignLCcpXSk7XG5cbiAgICBjb21tYW5kLm91dHB1dE9wdGlvbnMoWyctdCcsIHRhcmdldER1cmF0aW9uLnRvRml4ZWQoMyldKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn5SNIGNvbW1hbmQgb3V0cHV0IG9wdGlvbnMgbmV3OicsIGNvbW1hbmQub3V0cHV0T3B0aW9ucygpKTtcblxuICAgIGNvbW1hbmRcbiAgICAgIC5vdXRwdXQoY29tYmluZWRTY2VuZVBhdGgpXG4gICAgICAub24oJ2VuZCcsIGFzeW5jICgpID0+IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIFNjZW5lICR7c2NlbmVQb3NpdGlvbn0gY29tYmluZWQgc3VjY2Vzc2Z1bGx5IWApO1xuXG4gICAgICAgIC8vIFNhdmUgY29tYmluZWQgc2NlbmUgdG8gUzMgZm9yIHRlc3RpbmcgcHVycG9zZXNcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21iaW5lZFNjZW5lQnVmZmVyID0gZnMucmVhZEZpbGVTeW5jKGNvbWJpbmVkU2NlbmVQYXRoKTtcbiAgICAgICAgICBjb25zdCBjb21iaW5lZFNjZW5lS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZVBvc2l0aW9ufS1jb21iaW5lZC5tcDRgO1xuXG4gICAgICAgICAgYXdhaXQgczMuc2VuZChcbiAgICAgICAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICAgICAgS2V5OiBjb21iaW5lZFNjZW5lS2V5LFxuICAgICAgICAgICAgICBCb2R5OiBjb21iaW5lZFNjZW5lQnVmZmVyLFxuICAgICAgICAgICAgICBDb250ZW50VHlwZTogJ3ZpZGVvL21wNCcsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBg8J+SviBTY2VuZSAke3NjZW5lUG9zaXRpb259IChJRDogJHtzY2VuZUlkfSkgY29tYmluZWQgZmlsZSBzYXZlZCB0byBTMzogJHtjb21iaW5lZFNjZW5lS2V5fWAsXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICBg4pqg77iPIENvdWxkIG5vdCBzYXZlIGNvbWJpbmVkIHNjZW5lICR7c2NlbmVQb3NpdGlvbn0gKElEOiAke3NjZW5lSWR9KSB0byBTMzpgLFxuICAgICAgICAgICAgZXJyb3IsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENsZWFuIHVwIGluZGl2aWR1YWwgc2NlbmUgZmlsZXNcbiAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmModmlkZW9QYXRoKSkgZnMudW5saW5rU3luYyh2aWRlb1BhdGgpO1xuICAgICAgICBpZiAoYXVkaW9QYXRoICYmIGZzLmV4aXN0c1N5bmMoYXVkaW9QYXRoKSkgZnMudW5saW5rU3luYyhhdWRpb1BhdGgpO1xuICAgICAgICBpZiAoc3VidGl0bGVQYXRoICYmIGZzLmV4aXN0c1N5bmMoc3VidGl0bGVQYXRoKSlcbiAgICAgICAgICBmcy51bmxpbmtTeW5jKHN1YnRpdGxlUGF0aCk7XG5cbiAgICAgICAgcmVzb2x2ZShjb21iaW5lZFNjZW5lUGF0aCk7XG4gICAgICB9KVxuICAgICAgLm9uKCdlcnJvcicsIChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEVycm9yIGNvbWJpbmluZyBzY2VuZSAke3NjZW5lUG9zaXRpb259OmAsIGVycik7XG4gICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgfSlcbiAgICAgIC5ydW4oKTtcbiAgfSk7XG59XG4iXX0=