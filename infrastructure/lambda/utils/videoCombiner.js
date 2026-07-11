"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.combineVideoAndAudio = combineVideoAndAudio;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ffmpeg = require('fluent-ffmpeg');
// --- Helpers for concat reliability ---
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
function probeHasAudio(filePath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, data) => {
            if (err)
                return resolve(false);
            const streams = data?.streams || [];
            resolve(streams.some((s) => s.codec_type === 'audio'));
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
    console.log('🎬 Concatenating all combined scenes (filter graph)…');
    if (!combinedScenePaths.length) {
        throw new Error('No combined scene paths provided');
    }
    if (combinedScenePaths.length === 1) {
        console.log('ℹ️ Only one scene — skipping concat.');
        return combinedScenePaths[0];
    }
    // Probe durations and audio presence so we can create consistent streams
    const [durations, audioFlags] = await Promise.all([
        Promise.all(combinedScenePaths.map((p) => probeDuration(p))),
        Promise.all(combinedScenePaths.map((p) => probeHasAudio(p))),
    ]);
    const totalDuration = durations.reduce((a, b) => a + b, 0);
    console.log('⏱️ Concat inputs:', combinedScenePaths.map((p, i) => ({
        idx: i,
        path: p,
        duration: Number(durations[i].toFixed(3)),
        hasAudio: audioFlags[i],
    })));
    const finalOutputPath = path.join(os.tmpdir(), 'final-video.mp4');
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            console.error('❌ Timeout concatenating scenes after 10 minutes');
            reject(new Error('Timeout concatenating scenes'));
        }, 10 * 60 * 1000);
        const cmd = ffmpeg();
        combinedScenePaths.forEach((p) => cmd.input(p));
        // Build filter graph: for each input, reset PTS; ensure an audio stream exists by
        // generating per-segment silent audio when missing; then concat decoded streams.
        const vfChains = [];
        const afChains = [];
        for (let i = 0; i < combinedScenePaths.length; i++) {
            vfChains.push(`[${i}:v:0]setpts=PTS-STARTPTS[v${i}]`);
            if (audioFlags[i]) {
                afChains.push(`[${i}:a:0]asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0[a${i}]`);
            }
            else {
                const d = Math.max(0, durations[i]);
                afChains.push(`anullsrc=r=48000:cl=stereo,atrim=0:${d.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
            }
        }
        const concatInputs = [];
        for (let i = 0; i < combinedScenePaths.length; i++) {
            concatInputs.push(`[v${i}][a${i}]`);
        }
        const filterGraph = [
            ...vfChains,
            ...afChains,
            `${concatInputs.join('')}concat=n=${combinedScenePaths.length}:v=1:a=1[v][a]`,
        ].join(';');
        console.log('🧩 filter_complex:', filterGraph);
        cmd
            .complexFilter(filterGraph)
            .outputOptions([
            '-map',
            '[v]',
            '-map',
            '[a]',
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
            '192k',
            '-ar',
            '48000',
            '-movflags',
            '+faststart',
            '-vsync',
            '2',
            '-threads',
            '0',
        ])
            // Force output long enough to cover all segments (guard against stray timestamps)
            .outputOptions(['-t', totalDuration.toFixed(3)])
            .output(finalOutputPath)
            .on('end', () => {
            clearTimeout(timeout);
            console.log('✅ All scenes concatenated successfully');
            // Clean up temporary scene files
            combinedScenePaths.forEach((scenePath) => {
                if (fs.existsSync(scenePath))
                    fs.unlinkSync(scenePath);
            });
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
    if (subtitleFile?.Key) {
        subtitlePath = path.join(os.tmpdir(), `scene-${scenePosition}-subtitle.ass`);
        const subtitleObject = await s3.send(new client_s3_1.GetObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: subtitleFile.Key,
        }));
        const subtitleBuffer = Buffer.from(await subtitleObject.Body.transformToByteArray());
        fs.writeFileSync(subtitlePath, subtitleBuffer);
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
                '-filter:a',
                'apad',
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
            '-shortest',
        ]);
        console.log('🔍 command output options new:', command.outputOptions());
        // Add subtitle overlay if available
        if (subtitlePath && fs.existsSync(subtitlePath)) {
            const subtitleFilter = `ass=${subtitlePath}:fontsdir=/opt/fonts`;
            command.outputOptions(['-vf', subtitleFilter]);
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9Db21iaW5lci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZpZGVvQ29tYmluZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFrREEsb0RBa0pDO0FBcE1ELGtEQUk0QjtBQUM1Qix3RUFBNkQ7QUFHN0QseUJBQXlCO0FBQ3pCLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFHN0IsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBRXhDLHlDQUF5QztBQUN6QyxTQUFTLGFBQWEsQ0FBQyxRQUFnQjtJQUNyQyxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7UUFDN0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxHQUFpQixFQUFFLElBQVMsRUFBRSxFQUFFO1lBQ3hELElBQUksR0FBRztnQkFBRSxPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQixNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDaEQsT0FBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxRQUFnQjtJQUNyQyxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7UUFDN0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxHQUFpQixFQUFFLElBQVMsRUFBRSxFQUFFO1lBQ3hELElBQUksR0FBRztnQkFBRSxPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMvQixNQUFNLE9BQU8sR0FBRyxJQUFJLEVBQUUsT0FBTyxJQUFJLEVBQUUs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LENBQ04sQ0FBQztZQUNKLENBQUM7WUFFRCxrQ0FBa0M7WUFDbEMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQztnQkFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3ZELElBQUksU0FBUyxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDO2dCQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDcEUsSUFBSSxZQUFZLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUM7Z0JBQzdDLEVBQUUsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUM7WUFFOUIsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDN0IsQ0FBQyxDQUFDO2FBQ0QsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLEdBQVUsRUFBRSxFQUFFO1lBQzFCLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN0QixPQUFPLENBQUMsS0FBSyxDQUFDLDJCQUEyQixhQUFhLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNoRSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDZCxDQUFDLENBQUM7YUFDRCxHQUFHLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIFMzQ2xpZW50LFxuICBHZXRPYmplY3RDb21tYW5kLFxuICBQdXRPYmplY3RDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSAnQGF3cy1zZGsvczMtcmVxdWVzdC1wcmVzaWduZXInO1xuaW1wb3J0IHsgTWFuaWZlc3QsIE1hbmlmZXN0U2NlbmUgfSBmcm9tICcuLi90eXBlcy9zM1R5cGVzJztcblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IFVzZXJJdGVtIH0gZnJvbSAnLi91c2VyJztcblxuY29uc3QgZmZtcGVnID0gcmVxdWlyZSgnZmx1ZW50LWZmbXBlZycpO1xuXG4vLyAtLS0gSGVscGVycyBmb3IgY29uY2F0IHJlbGlhYmlsaXR5IC0tLVxuZnVuY3Rpb24gcHJvYmVEdXJhdGlvbihmaWxlUGF0aDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgZmZtcGVnLmZmcHJvYmUoZmlsZVBhdGgsIChlcnI6IEVycm9yIHwgbnVsbCwgZGF0YTogYW55KSA9PiB7XG4gICAgICBpZiAoZXJyKSByZXR1cm4gcmVzb2x2ZSgwKTtcbiAgICAgIGNvbnN0IGR1ciA9IE51bWJlcihkYXRhPy5mb3JtYXQ/LmR1cmF0aW9uID8/IDApO1xuICAgICAgcmVzb2x2ZShOdW1iZXIuaXNGaW5pdGUoZHVyKSA/IGR1ciA6IDApO1xuICAgIH0pO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gcHJvYmVIYXNBdWRpbyhmaWxlUGF0aDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGZmbXBlZy5mZnByb2JlKGZpbGVQYXRoLCAoZXJyOiBFcnJvciB8IG51bGwsIGRhdGE6IGFueSkgPT4ge1xuICAgICAgaWYgKGVycikgcmV0dXJuIHJlc29sdmUoZmFsc2UpO1xuICAgICAgY29uc3Qgc3RyZWFtcyA9IGRhdGE/LnN0cmVhbXMgfHwgW107XG4gICAgICByZXNvbHZlKHN0cmVhbXMuc29tZSgoczogYW55KSA9PiBzLmNvZGVjX3R5cGUgPT09ICdhdWRpbycpKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbi8vIFMzIGZpbGUgb2JqZWN0IGludGVyZmFjZVxuaW50ZXJmYWNlIFMzRmlsZU9iamVjdCB7XG4gIEtleTogc3RyaW5nO1xufVxuXG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcblxuZXhwb3J0IGludGVyZmFjZSBTY2VuZSB7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIG5hcnJhdGlvbjogc3RyaW5nO1xuICBpZDogbnVtYmVyOyAvLyBBZGQgaWQgcHJvcGVydHlcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbWJpbmVWaWRlb0FuZEF1ZGlvKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIG1hbmlmZXN0OiBNYW5pZmVzdCxcbiAgcmVtb3ZlZFNjZW5lczogbnVtYmVyW10gPSBbXSxcbiAgdXNlcjogVXNlckl0ZW0gfCBudWxsLFxuKTogUHJvbWlzZTx7IGZpbmFsVmlkZW9TaWduZWRVcmw6IHN0cmluZzsgc2l6ZTogc3RyaW5nIH0+IHtcbiAgY29uc29sZS5sb2coXG4gICAgJ/CfjqwgQ29tYmluaW5nIHZpZGVvLCBhdWRpbywgYW5kIHN1YnRpdGxlcyBzY2VuZSBieSBzY2VuZSBmb3IgdXNlcjonLFxuICAgIHVzZXJJZCxcbiAgKTtcblxuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgJ/CflI0gVXNpbmcgbWFuaWZlc3QgZm9yIHNjZW5lIG9yZGVyaW5nOicsXG4gICAgICBtYW5pZmVzdC5zY2VuZXMubGVuZ3RoLFxuICAgICAgJ3NjZW5lcycsXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZygn8J+UjSBSZW1vdmVkIHNjZW5lcyB0byBleGNsdWRlOicsIHJlbW92ZWRTY2VuZXMpO1xuXG4gICAgaWYgKCFtYW5pZmVzdC5zY2VuZXMgfHwgbWFuaWZlc3Quc2NlbmVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBzY2VuZXMgZm91bmQgaW4gbWFuaWZlc3QnKTtcbiAgICB9XG5cbiAgICAvLyBGaWx0ZXIgb3V0IHJlbW92ZWQgc2NlbmVzIGFuZCBzb3J0IGJ5IHNjZW5lUG9zaXRpb24gdG8gZW5zdXJlIHByb3BlciBvcmRlclxuICAgIGNvbnN0IGZpbHRlcmVkU2NlbmVzID0gbWFuaWZlc3Quc2NlbmVzLmZpbHRlcigoc2NlbmU6IE1hbmlmZXN0U2NlbmUpID0+IHtcbiAgICAgIGNvbnN0IGlzUmVtb3ZlZCA9IHJlbW92ZWRTY2VuZXMuaW5jbHVkZXMoc2NlbmUuaWQpO1xuICAgICAgaWYgKGlzUmVtb3ZlZCkge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBg8J+aqyBFeGNsdWRpbmcgcmVtb3ZlZCBzY2VuZSBJRDogJHtzY2VuZS5pZH0gKHBvc2l0aW9uOiAke3NjZW5lLnNjZW5lUG9zaXRpb259KWAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gIWlzUmVtb3ZlZDtcbiAgICB9KTtcblxuICAgIGNvbnN0IHNvcnRlZFNjZW5lcyA9IGZpbHRlcmVkU2NlbmVzLnNvcnQoXG4gICAgICAoYTogTWFuaWZlc3RTY2VuZSwgYjogTWFuaWZlc3RTY2VuZSkgPT4gYS5zY2VuZVBvc2l0aW9uIC0gYi5zY2VuZVBvc2l0aW9uLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICfwn5SNIFNvcnRlZCBzY2VuZXMgYnkgc2NlbmVQb3NpdGlvbjonLFxuICAgICAgc29ydGVkU2NlbmVzLm1hcCgoczogTWFuaWZlc3RTY2VuZSkgPT4gKHtcbiAgICAgICAgc2NlbmVQb3NpdGlvbjogcy5zY2VuZVBvc2l0aW9uLFxuICAgICAgICBoYXNWaWRlbzogISFzLmZpbGVzPy5tcDQsXG4gICAgICAgIGhhc0F1ZGlvOiAhIXMuZmlsZXM/Lm1wMyxcbiAgICAgICAgaGFzU3VidGl0bGU6ICEhcy5maWxlcz8uYXNzLFxuICAgICAgfSkpLFxuICAgICk7XG5cbiAgICAvLyBQcm9jZXNzIGFsbCBzY2VuZXMgaW4gcGFyYWxsZWw6IGNvbWJpbmUgdmlkZW8gKyBhdWRpbyArIHN1YnRpdGxlXG4gICAgY29uc3Qgc2NlbmVQcm9jZXNzaW5nUHJvbWlzZXMgPSBzb3J0ZWRTY2VuZXMubWFwKFxuICAgICAgYXN5bmMgKHNjZW5lOiBNYW5pZmVzdFNjZW5lLCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgY29uc3Qgc2NlbmVQb3NpdGlvbiA9IHNjZW5lLnNjZW5lUG9zaXRpb247XG5cbiAgICAgICAgLy8gQ3JlYXRlIGZpbGUgb2JqZWN0cyBiYXNlZCBvbiBtYW5pZmVzdFxuICAgICAgICAvLyBFeHRyYWN0IFMzIGtleSBmcm9tIFVSTCBpZiBpdCdzIGEgZnVsbCBVUkwsIG90aGVyd2lzZSB1c2UgYXMtaXNcbiAgICAgICAgY29uc3QgZXh0cmFjdFMzS2V5ID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICAgICAgICBpZiAodXJsLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgICAgICAgIC8vIEV4dHJhY3Qga2V5IGZyb20gUzMgVVJMXG4gICAgICAgICAgICBjb25zdCB1cmxQYXJ0cyA9IHVybC5zcGxpdCgnLycpO1xuICAgICAgICAgICAgcmV0dXJuIHVybFBhcnRzLnNsaWNlKDMpLmpvaW4oJy8nKTsgLy8gUmVtb3ZlIGJ1Y2tldCBhbmQgZG9tYWluIHBhcnRzXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB1cmw7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgdmlkZW9GaWxlID0gc2NlbmUuZmlsZXM/Lm1wNFxuICAgICAgICAgID8geyBLZXk6IGV4dHJhY3RTM0tleShzY2VuZS5maWxlcy5tcDQpIH1cbiAgICAgICAgICA6IG51bGw7XG4gICAgICAgIGNvbnN0IGF1ZGlvRmlsZSA9IHNjZW5lLmZpbGVzPy5tcDNcbiAgICAgICAgICA/IHsgS2V5OiBleHRyYWN0UzNLZXkoc2NlbmUuZmlsZXMubXAzKSB9XG4gICAgICAgICAgOiBudWxsO1xuICAgICAgICBjb25zdCBzdWJ0aXRsZUZpbGUgPSBzY2VuZS5maWxlcz8uYXNzXG4gICAgICAgICAgPyB7IEtleTogZXh0cmFjdFMzS2V5KHNjZW5lLmZpbGVzLmFzcykgfVxuICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICBpZiAoIXZpZGVvRmlsZT8uS2V5KSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgYOKaoO+4jyBObyB2aWRlbyBmaWxlIGZvdW5kIGZvciBzY2VuZSBhdCBwb3NpdGlvbiAke3NjZW5lUG9zaXRpb259YCxcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGF3YWl0IHByb2Nlc3NTY2VuZShcbiAgICAgICAgICB2aWRlb0ZpbGUsXG4gICAgICAgICAgYXVkaW9GaWxlLFxuICAgICAgICAgIHN1YnRpdGxlRmlsZSxcbiAgICAgICAgICBzY2VuZVBvc2l0aW9uLFxuICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgICk7XG4gICAgICB9LFxuICAgICk7XG5cbiAgICBjb25zdCBjb21iaW5lZFNjZW5lUGF0aHMgPSAoXG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChzY2VuZVByb2Nlc3NpbmdQcm9taXNlcylcbiAgICApLmZpbHRlcigocGF0aCk6IHBhdGggaXMgc3RyaW5nID0+IHBhdGggIT09IG51bGwpO1xuXG4gICAgY29uc29sZS5sb2coJ/CflI0gc2NlbmVQcm9jZXNzaW5nUHJvbWlzZXMgZmluaXNoZWQ6JywgY29tYmluZWRTY2VuZVBhdGhzKTtcblxuICAgIC8vIE5vdyBjb25jYXRlbmF0ZSBhbGwgY29tYmluZWQgc2NlbmVzXG4gICAgY29uc3QgZmluYWxPdXRwdXRQYXRoID0gYXdhaXQgY29uY2F0ZW5hdGVTY2VuZXMoY29tYmluZWRTY2VuZVBhdGhzKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn5SNIGZpbmFsT3V0cHV0UGF0aCBzdGFydDonLCBmaW5hbE91dHB1dFBhdGgpO1xuXG4gICAgLy8gVXBsb2FkIGZpbmFsIHZpZGVvIHRvIFMzXG4gICAgY29uc3QgZmluYWxWaWRlb0J1ZmZlciA9IGZzLnJlYWRGaWxlU3luYyhmaW5hbE91dHB1dFBhdGgpO1xuICAgIGNvbnN0IGZpbmFsVmlkZW9LZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS1maW5hbC12aWRlby5tcDRgO1xuICAgIGNvbnN0IHNpemUgPSBmaW5hbFZpZGVvQnVmZmVyLmxlbmd0aC50b1N0cmluZygpO1xuICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fQlVDS0VUX05BTUUsXG4gICAgICAgIEtleTogZmluYWxWaWRlb0tleSxcbiAgICAgICAgQm9keTogZmluYWxWaWRlb0J1ZmZlcixcbiAgICAgICAgQ29udGVudFR5cGU6ICd2aWRlby9tcDQnLFxuICAgICAgICBNZXRhZGF0YToge1xuICAgICAgICAgIHNpemUsXG4gICAgICAgICAgZHVyYXRpb246IG1hbmlmZXN0LnRvdGFsRHVyYXRpb24udG9TdHJpbmcoKSxcbiAgICAgICAgICBzY2VuZUNvdW50OiBtYW5pZmVzdC5zY2VuZUNvdW50LnRvU3RyaW5nKCksXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/Cfkr4gRmluYWwgdmlkZW8gdXBsb2FkZWQgdG8gUzM6JywgZmluYWxWaWRlb0tleSk7XG5cbiAgICAvLyBHZW5lcmF0ZSBwcmUtc2lnbmVkIFVSTCBmb3IgdGhlIGZpbmFsIHZpZGVvXG4gICAgY29uc3QgZmluYWxWaWRlb1NpZ25lZFVybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgIHMzLFxuICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IGZpbmFsVmlkZW9LZXksXG4gICAgICB9KSxcbiAgICAgIHsgZXhwaXJlc0luOiAzNjAwMCB9LCAvLyAxMCBob3VycyBleHBpcmF0aW9uXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn5SXIEZpbmFsIHZpZGVvIHByZS1zaWduZWQgVVJMIGdlbmVyYXRlZCcpO1xuXG4gICAgLy8gQ2xlYW4gdXAgdGhlIHRlbXBvcmFyeSBmaW5hbCB2aWRlbyBmaWxlXG4gICAgaWYgKGZzLmV4aXN0c1N5bmMoZmluYWxPdXRwdXRQYXRoKSkge1xuICAgICAgZnMudW5saW5rU3luYyhmaW5hbE91dHB1dFBhdGgpO1xuICAgIH1cblxuICAgIHJldHVybiB7IGZpbmFsVmlkZW9TaWduZWRVcmwsIHNpemUgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gY29tYmluZVZpZGVvQW5kQXVkaW86JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbi8qKlxuICogQ29uY2F0ZW5hdGVzIG11bHRpcGxlIHZpZGVvIHNjZW5lIGZpbGVzIGludG8gYSBzaW5nbGUgZmluYWwgdmlkZW9cbiAqIEBwYXJhbSBjb21iaW5lZFNjZW5lUGF0aHMgQXJyYXkgb2YgcGF0aHMgdG8gY29tYmluZWQgc2NlbmUgdmlkZW8gZmlsZXNcbiAqIEByZXR1cm5zIFBhdGggdG8gdGhlIGZpbmFsIGNvbmNhdGVuYXRlZCB2aWRlbyBmaWxlXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGNvbmNhdGVuYXRlU2NlbmVzKFxuICBjb21iaW5lZFNjZW5lUGF0aHM6IHN0cmluZ1tdLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgY29uc29sZS5sb2coJ/CfjqwgQ29uY2F0ZW5hdGluZyBhbGwgY29tYmluZWQgc2NlbmVzIChmaWx0ZXIgZ3JhcGgp4oCmJyk7XG5cbiAgaWYgKCFjb21iaW5lZFNjZW5lUGF0aHMubGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBjb21iaW5lZCBzY2VuZSBwYXRocyBwcm92aWRlZCcpO1xuICB9XG4gIGlmIChjb21iaW5lZFNjZW5lUGF0aHMubGVuZ3RoID09PSAxKSB7XG4gICAgY29uc29sZS5sb2coJ+KEue+4jyBPbmx5IG9uZSBzY2VuZSDigJQgc2tpcHBpbmcgY29uY2F0LicpO1xuICAgIHJldHVybiBjb21iaW5lZFNjZW5lUGF0aHNbMF07XG4gIH1cblxuICAvLyBQcm9iZSBkdXJhdGlvbnMgYW5kIGF1ZGlvIHByZXNlbmNlIHNvIHdlIGNhbiBjcmVhdGUgY29uc2lzdGVudCBzdHJlYW1zXG4gIGNvbnN0IFtkdXJhdGlvbnMsIGF1ZGlvRmxhZ3NdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgIFByb21pc2UuYWxsKGNvbWJpbmVkU2NlbmVQYXRocy5tYXAoKHApID0+IHByb2JlRHVyYXRpb24ocCkpKSxcbiAgICBQcm9taXNlLmFsbChjb21iaW5lZFNjZW5lUGF0aHMubWFwKChwKSA9PiBwcm9iZUhhc0F1ZGlvKHApKSksXG4gIF0pO1xuXG4gIGNvbnN0IHRvdGFsRHVyYXRpb24gPSBkdXJhdGlvbnMucmVkdWNlKChhLCBiKSA9PiBhICsgYiwgMCk7XG4gIGNvbnNvbGUubG9nKFxuICAgICfij7HvuI8gQ29uY2F0IGlucHV0czonLFxuICAgIGNvbWJpbmVkU2NlbmVQYXRocy5tYXAoKHAsIGkpID0+ICh7XG4gICAgICBpZHg6IGksXG4gICAgICBwYXRoOiBwLFxuICAgICAgZHVyYXRpb246IE51bWJlcihkdXJhdGlvbnNbaV0udG9GaXhlZCgzKSksXG4gICAgICBoYXNBdWRpbzogYXVkaW9GbGFnc1tpXSxcbiAgICB9KSksXG4gICk7XG5cbiAgY29uc3QgZmluYWxPdXRwdXRQYXRoID0gcGF0aC5qb2luKG9zLnRtcGRpcigpLCAnZmluYWwtdmlkZW8ubXA0Jyk7XG5cbiAgcmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBUaW1lb3V0IGNvbmNhdGVuYXRpbmcgc2NlbmVzIGFmdGVyIDEwIG1pbnV0ZXMnKTtcbiAgICAgIHJlamVjdChuZXcgRXJyb3IoJ1RpbWVvdXQgY29uY2F0ZW5hdGluZyBzY2VuZXMnKSk7XG4gICAgfSwgMTAgKiA2MCAqIDEwMDApO1xuXG4gICAgY29uc3QgY21kID0gZmZtcGVnKCk7XG4gICAgY29tYmluZWRTY2VuZVBhdGhzLmZvckVhY2goKHApID0+IGNtZC5pbnB1dChwKSk7XG5cbiAgICAvLyBCdWlsZCBmaWx0ZXIgZ3JhcGg6IGZvciBlYWNoIGlucHV0LCByZXNldCBQVFM7IGVuc3VyZSBhbiBhdWRpbyBzdHJlYW0gZXhpc3RzIGJ5XG4gICAgLy8gZ2VuZXJhdGluZyBwZXItc2VnbWVudCBzaWxlbnQgYXVkaW8gd2hlbiBtaXNzaW5nOyB0aGVuIGNvbmNhdCBkZWNvZGVkIHN0cmVhbXMuXG4gICAgY29uc3QgdmZDaGFpbnM6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgYWZDaGFpbnM6IHN0cmluZ1tdID0gW107XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbWJpbmVkU2NlbmVQYXRocy5sZW5ndGg7IGkrKykge1xuICAgICAgdmZDaGFpbnMucHVzaChgWyR7aX06djowXXNldHB0cz1QVFMtU1RBUlRQVFNbdiR7aX1dYCk7XG4gICAgICBpZiAoYXVkaW9GbGFnc1tpXSkge1xuICAgICAgICBhZkNoYWlucy5wdXNoKFxuICAgICAgICAgIGBbJHtpfTphOjBdYXNldHB0cz1QVFMtU1RBUlRQVFMsYXJlc2FtcGxlPWFzeW5jPTE6Zmlyc3RfcHRzPTBbYSR7aX1dYCxcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IGQgPSBNYXRoLm1heCgwLCBkdXJhdGlvbnNbaV0pO1xuICAgICAgICBhZkNoYWlucy5wdXNoKFxuICAgICAgICAgIGBhbnVsbHNyYz1yPTQ4MDAwOmNsPXN0ZXJlbyxhdHJpbT0wOiR7ZC50b0ZpeGVkKFxuICAgICAgICAgICAgMyxcbiAgICAgICAgICApfSxhc2V0cHRzPVBUUy1TVEFSVFBUU1thJHtpfV1gLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGNvbmNhdElucHV0cyA9IFtdIGFzIHN0cmluZ1tdO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY29tYmluZWRTY2VuZVBhdGhzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25jYXRJbnB1dHMucHVzaChgW3Yke2l9XVthJHtpfV1gKTtcbiAgICB9XG5cbiAgICBjb25zdCBmaWx0ZXJHcmFwaCA9IFtcbiAgICAgIC4uLnZmQ2hhaW5zLFxuICAgICAgLi4uYWZDaGFpbnMsXG4gICAgICBgJHtjb25jYXRJbnB1dHMuam9pbignJyl9Y29uY2F0PW49JHtcbiAgICAgICAgY29tYmluZWRTY2VuZVBhdGhzLmxlbmd0aFxuICAgICAgfTp2PTE6YT0xW3ZdW2FdYCxcbiAgICBdLmpvaW4oJzsnKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn6epIGZpbHRlcl9jb21wbGV4OicsIGZpbHRlckdyYXBoKTtcblxuICAgIGNtZFxuICAgICAgLmNvbXBsZXhGaWx0ZXIoZmlsdGVyR3JhcGgpXG4gICAgICAub3V0cHV0T3B0aW9ucyhbXG4gICAgICAgICctbWFwJyxcbiAgICAgICAgJ1t2XScsXG4gICAgICAgICctbWFwJyxcbiAgICAgICAgJ1thXScsXG4gICAgICAgICctYzp2JyxcbiAgICAgICAgJ2xpYngyNjQnLFxuICAgICAgICAnLXByZXNldCcsXG4gICAgICAgICd2ZXJ5ZmFzdCcsXG4gICAgICAgICctY3JmJyxcbiAgICAgICAgJzIzJyxcbiAgICAgICAgJy1waXhfZm10JyxcbiAgICAgICAgJ3l1djQyMHAnLFxuICAgICAgICAnLWM6YScsXG4gICAgICAgICdhYWMnLFxuICAgICAgICAnLWI6YScsXG4gICAgICAgICcxOTJrJyxcbiAgICAgICAgJy1hcicsXG4gICAgICAgICc0ODAwMCcsXG4gICAgICAgICctbW92ZmxhZ3MnLFxuICAgICAgICAnK2Zhc3RzdGFydCcsXG4gICAgICAgICctdnN5bmMnLFxuICAgICAgICAnMicsXG4gICAgICAgICctdGhyZWFkcycsXG4gICAgICAgICcwJyxcbiAgICAgIF0pXG4gICAgICAvLyBGb3JjZSBvdXRwdXQgbG9uZyBlbm91Z2ggdG8gY292ZXIgYWxsIHNlZ21lbnRzIChndWFyZCBhZ2FpbnN0IHN0cmF5IHRpbWVzdGFtcHMpXG4gICAgICAub3V0cHV0T3B0aW9ucyhbJy10JywgdG90YWxEdXJhdGlvbi50b0ZpeGVkKDMpXSlcbiAgICAgIC5vdXRwdXQoZmluYWxPdXRwdXRQYXRoKVxuICAgICAgLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgY29uc29sZS5sb2coJ+KchSBBbGwgc2NlbmVzIGNvbmNhdGVuYXRlZCBzdWNjZXNzZnVsbHknKTtcbiAgICAgICAgLy8gQ2xlYW4gdXAgdGVtcG9yYXJ5IHNjZW5lIGZpbGVzXG4gICAgICAgIGNvbWJpbmVkU2NlbmVQYXRocy5mb3JFYWNoKChzY2VuZVBhdGgpID0+IHtcbiAgICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyhzY2VuZVBhdGgpKSBmcy51bmxpbmtTeW5jKHNjZW5lUGF0aCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXNvbHZlKGZpbmFsT3V0cHV0UGF0aCk7XG4gICAgICB9KVxuICAgICAgLm9uKCdlcnJvcicsIChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGNvbmNhdGVuYXRpbmcgc2NlbmVzOicsIGVycik7XG4gICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgfSlcbiAgICAgIC5ydW4oKTtcbiAgfSk7XG59XG5cbi8qKlxuICogUHJvY2Vzc2VzIGEgc2luZ2xlIHNjZW5lIGJ5IGNvbWJpbmluZyB2aWRlbywgYXVkaW8sIGFuZCBzdWJ0aXRsZSBmaWxlc1xuICogQHBhcmFtIHZpZGVvRmlsZSBTMyBvYmplY3QgY29udGFpbmluZyB2aWRlbyBmaWxlIGluZm9cbiAqIEBwYXJhbSBhdWRpb0ZpbGUgUzMgb2JqZWN0IGNvbnRhaW5pbmcgYXVkaW8gZmlsZSBpbmZvIChvcHRpb25hbClcbiAqIEBwYXJhbSBzdWJ0aXRsZUZpbGUgUzMgb2JqZWN0IGNvbnRhaW5pbmcgc3VidGl0bGUgZmlsZSBpbmZvIChvcHRpb25hbClcbiAqIEBwYXJhbSBzY2VuZVBvc2l0aW9uIEluZGV4IG9mIHRoZSBzY2VuZSBiZWluZyBwcm9jZXNzZWRcbiAqIEBwYXJhbSB1c2VySWQgVXNlciBJRCBmb3IgUzMgb3BlcmF0aW9uc1xuICogQHBhcmFtIHRpbWVzdGFtcCBUaW1lc3RhbXAgZm9yIFMzIG9wZXJhdGlvbnNcbiAqIEByZXR1cm5zIFBhdGggdG8gdGhlIGNvbWJpbmVkIHNjZW5lIGZpbGVcbiAqL1xuYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1NjZW5lKFxuICB2aWRlb0ZpbGU6IFMzRmlsZU9iamVjdCxcbiAgYXVkaW9GaWxlOiBTM0ZpbGVPYmplY3QgfCBudWxsLFxuICBzdWJ0aXRsZUZpbGU6IFMzRmlsZU9iamVjdCB8IG51bGwsXG4gIHNjZW5lUG9zaXRpb246IG51bWJlcixcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgLy8gRXh0cmFjdCB0aGUgYWN0dWFsIHNjZW5lIElEIGZyb20gdGhlIGZpbGVuYW1lXG4gIGNvbnN0IHNjZW5lSWRNYXRjaCA9IHZpZGVvRmlsZS5LZXkubWF0Y2goL3NjZW5lLShcXGQrKVxcLm1wNC8pO1xuICBjb25zdCBzY2VuZUlkID0gc2NlbmVJZE1hdGNoID8gcGFyc2VJbnQoc2NlbmVJZE1hdGNoWzFdKSA6IHNjZW5lUG9zaXRpb247XG5cbiAgY29uc29sZS5sb2coXG4gICAgYPCfjqwgUHJvY2Vzc2luZyBzY2VuZSAke3NjZW5lUG9zaXRpb259IChJRDogJHtzY2VuZUlkfSk6IGNvbWJpbmluZyB2aWRlbyArIGF1ZGlvICsgc3VidGl0bGVgLFxuICApO1xuXG4gIC8vIERvd25sb2FkIHZpZGVvIGZpbGVcbiAgY29uc3QgdmlkZW9QYXRoID0gcGF0aC5qb2luKG9zLnRtcGRpcigpLCBgc2NlbmUtJHtzY2VuZVBvc2l0aW9ufS12aWRlby5tcDRgKTtcbiAgY29uc3QgdmlkZW9PYmplY3QgPSBhd2FpdCBzMy5zZW5kKFxuICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICBLZXk6IHZpZGVvRmlsZS5LZXksXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IHZpZGVvQnVmZmVyID0gQnVmZmVyLmZyb20oXG4gICAgYXdhaXQgdmlkZW9PYmplY3QuQm9keSEudHJhbnNmb3JtVG9CeXRlQXJyYXkoKSxcbiAgKTtcbiAgZnMud3JpdGVGaWxlU3luYyh2aWRlb1BhdGgsIHZpZGVvQnVmZmVyKTtcblxuICAvLyBEb3dubG9hZCBhdWRpbyBmaWxlXG4gIGxldCBhdWRpb1BhdGg6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBpZiAoYXVkaW9GaWxlPy5LZXkpIHtcbiAgICBhdWRpb1BhdGggPSBwYXRoLmpvaW4ob3MudG1wZGlyKCksIGBzY2VuZS0ke3NjZW5lUG9zaXRpb259LWF1ZGlvLm1wM2ApO1xuICAgIGNvbnN0IGF1ZGlvT2JqZWN0ID0gYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiBhdWRpb0ZpbGUuS2V5LFxuICAgICAgfSksXG4gICAgKTtcbiAgICBjb25zdCBhdWRpb0J1ZmZlciA9IEJ1ZmZlci5mcm9tKFxuICAgICAgYXdhaXQgYXVkaW9PYmplY3QuQm9keSEudHJhbnNmb3JtVG9CeXRlQXJyYXkoKSxcbiAgICApO1xuICAgIGZzLndyaXRlRmlsZVN5bmMoYXVkaW9QYXRoLCBhdWRpb0J1ZmZlcik7XG4gIH1cblxuICAvLyBEb3dubG9hZCBzdWJ0aXRsZSBmaWxlXG4gIGxldCBzdWJ0aXRsZVBhdGg6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBpZiAoc3VidGl0bGVGaWxlPy5LZXkpIHtcbiAgICBzdWJ0aXRsZVBhdGggPSBwYXRoLmpvaW4oXG4gICAgICBvcy50bXBkaXIoKSxcbiAgICAgIGBzY2VuZS0ke3NjZW5lUG9zaXRpb259LXN1YnRpdGxlLmFzc2AsXG4gICAgKTtcbiAgICBjb25zdCBzdWJ0aXRsZU9iamVjdCA9IGF3YWl0IHMzLnNlbmQoXG4gICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgIEtleTogc3VidGl0bGVGaWxlLktleSxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgY29uc3Qgc3VidGl0bGVCdWZmZXIgPSBCdWZmZXIuZnJvbShcbiAgICAgIGF3YWl0IHN1YnRpdGxlT2JqZWN0LkJvZHkhLnRyYW5zZm9ybVRvQnl0ZUFycmF5KCksXG4gICAgKTtcbiAgICBmcy53cml0ZUZpbGVTeW5jKHN1YnRpdGxlUGF0aCwgc3VidGl0bGVCdWZmZXIpO1xuICB9XG5cbiAgLy8gQ29tYmluZSB2aWRlbyArIGF1ZGlvICsgc3VidGl0bGUgZm9yIHRoaXMgc2NlbmVcbiAgY29uc3QgY29tYmluZWRTY2VuZVBhdGggPSBwYXRoLmpvaW4oXG4gICAgb3MudG1wZGlyKCksXG4gICAgYHNjZW5lLSR7c2NlbmVQb3NpdGlvbn0tY29tYmluZWQubXA0YCxcbiAgKTtcblxuICByZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgYOKdjCBUaW1lb3V0IGNvbWJpbmluZyBzY2VuZSAke3NjZW5lUG9zaXRpb259IGFmdGVyIDUgbWludXRlc2AsXG4gICAgICApO1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcihgVGltZW91dCBjb21iaW5pbmcgc2NlbmUgJHtzY2VuZVBvc2l0aW9ufWApKTtcbiAgICB9LCA1ICogNjAgKiAxMDAwKTsgLy8gNSBtaW51dGUgdGltZW91dFxuXG4gICAgY29uc3QgY29tbWFuZCA9IGZmbXBlZygpLmlucHV0KHZpZGVvUGF0aCk7XG5cbiAgICBpZiAoYXVkaW9QYXRoKSB7XG4gICAgICBjb21tYW5kLmlucHV0KGF1ZGlvUGF0aCk7XG4gICAgICBjb21tYW5kLm91dHB1dE9wdGlvbnMoW1xuICAgICAgICAnLW1hcCcsXG4gICAgICAgICcxOmE6MCcsXG4gICAgICAgICctYzphJyxcbiAgICAgICAgJ2FhYycsXG4gICAgICAgICctYjphJyxcbiAgICAgICAgJzEyOGsnLFxuICAgICAgICAnLWZpbHRlcjphJyxcbiAgICAgICAgJ2FwYWQnLFxuICAgICAgXSk7XG4gICAgfVxuXG4gICAgY29tbWFuZC5vdXRwdXRPcHRpb25zKFtcbiAgICAgICctbWFwJyxcbiAgICAgICcwOnY6MCcsXG4gICAgICAnLWM6dicsXG4gICAgICAnbGlieDI2NCcsXG4gICAgICAnLXByZXNldCcsXG4gICAgICAndWx0cmFmYXN0JyxcbiAgICAgICctY3JmJyxcbiAgICAgICcyOCcsXG4gICAgICAnLXBpeF9mbXQnLFxuICAgICAgJ3l1djQyMHAnLFxuICAgICAgJy12c3luYycsXG4gICAgICAnMScsXG4gICAgICAnLXRocmVhZHMnLFxuICAgICAgJzAnLFxuICAgICAgJy1zaG9ydGVzdCcsXG4gICAgXSk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+UjSBjb21tYW5kIG91dHB1dCBvcHRpb25zIG5ldzonLCBjb21tYW5kLm91dHB1dE9wdGlvbnMoKSk7XG5cbiAgICAvLyBBZGQgc3VidGl0bGUgb3ZlcmxheSBpZiBhdmFpbGFibGVcbiAgICBpZiAoc3VidGl0bGVQYXRoICYmIGZzLmV4aXN0c1N5bmMoc3VidGl0bGVQYXRoKSkge1xuICAgICAgY29uc3Qgc3VidGl0bGVGaWx0ZXIgPSBgYXNzPSR7c3VidGl0bGVQYXRofTpmb250c2Rpcj0vb3B0L2ZvbnRzYDtcbiAgICAgIGNvbW1hbmQub3V0cHV0T3B0aW9ucyhbJy12ZicsIHN1YnRpdGxlRmlsdGVyXSk7XG4gICAgfVxuXG4gICAgY29tbWFuZFxuICAgICAgLm91dHB1dChjb21iaW5lZFNjZW5lUGF0aClcbiAgICAgIC5vbignZW5kJywgYXN5bmMgKCkgPT4ge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtzY2VuZVBvc2l0aW9ufSBjb21iaW5lZCBzdWNjZXNzZnVsbHkhYCk7XG5cbiAgICAgICAgLy8gU2F2ZSBjb21iaW5lZCBzY2VuZSB0byBTMyBmb3IgdGVzdGluZyBwdXJwb3Nlc1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IGNvbWJpbmVkU2NlbmVCdWZmZXIgPSBmcy5yZWFkRmlsZVN5bmMoY29tYmluZWRTY2VuZVBhdGgpO1xuICAgICAgICAgIGNvbnN0IGNvbWJpbmVkU2NlbmVLZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lUG9zaXRpb259LWNvbWJpbmVkLm1wNGA7XG5cbiAgICAgICAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgICAgICBLZXk6IGNvbWJpbmVkU2NlbmVLZXksXG4gICAgICAgICAgICAgIEJvZHk6IGNvbWJpbmVkU2NlbmVCdWZmZXIsXG4gICAgICAgICAgICAgIENvbnRlbnRUeXBlOiAndmlkZW8vbXA0JyxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgIGDwn5K+IFNjZW5lICR7c2NlbmVQb3NpdGlvbn0gKElEOiAke3NjZW5lSWR9KSBjb21iaW5lZCBmaWxlIHNhdmVkIHRvIFMzOiAke2NvbWJpbmVkU2NlbmVLZXl9YCxcbiAgICAgICAgICApO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgIGDimqDvuI8gQ291bGQgbm90IHNhdmUgY29tYmluZWQgc2NlbmUgJHtzY2VuZVBvc2l0aW9ufSAoSUQ6ICR7c2NlbmVJZH0pIHRvIFMzOmAsXG4gICAgICAgICAgICBlcnJvcixcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2xlYW4gdXAgaW5kaXZpZHVhbCBzY2VuZSBmaWxlc1xuICAgICAgICBpZiAoZnMuZXhpc3RzU3luYyh2aWRlb1BhdGgpKSBmcy51bmxpbmtTeW5jKHZpZGVvUGF0aCk7XG4gICAgICAgIGlmIChhdWRpb1BhdGggJiYgZnMuZXhpc3RzU3luYyhhdWRpb1BhdGgpKSBmcy51bmxpbmtTeW5jKGF1ZGlvUGF0aCk7XG4gICAgICAgIGlmIChzdWJ0aXRsZVBhdGggJiYgZnMuZXhpc3RzU3luYyhzdWJ0aXRsZVBhdGgpKVxuICAgICAgICAgIGZzLnVubGlua1N5bmMoc3VidGl0bGVQYXRoKTtcblxuICAgICAgICByZXNvbHZlKGNvbWJpbmVkU2NlbmVQYXRoKTtcbiAgICAgIH0pXG4gICAgICAub24oJ2Vycm9yJywgKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgRXJyb3IgY29tYmluaW5nIHNjZW5lICR7c2NlbmVQb3NpdGlvbn06YCwgZXJyKTtcbiAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICB9KVxuICAgICAgLnJ1bigpO1xuICB9KTtcbn1cbiJdfQ==