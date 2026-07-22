"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.combineVideoAndAudio = combineVideoAndAudio;
exports.processScene = processScene;
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
            return await processScene(videoFile, audioFile, subtitleFile, scenePosition, userId, timestamp, scene.animated);
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
 * @param isAnimated Whether this scene's video is a fixed-length Runway
 *   animation clip that should loop to cover the full audio duration
 * @returns Path to the combined scene file
 */
async function processScene(videoFile, audioFile, subtitleFile, scenePosition, userId, timestamp, isAnimated = false) {
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
    // Probe durations to ensure the final mux runs for the longer of the two
    // streams — for animated scenes (looped below) the audio is expected to be
    // longer, so the target duration naturally becomes the audio's length.
    const videoDuration = await probeDuration(videoPath);
    const audioDuration = audioPath ? await probeDuration(audioPath) : 0;
    const targetDuration = Math.max(videoDuration, audioDuration);
    const padVideoSeconds = audioPath
        ? Math.max(0, audioDuration - videoDuration)
        : 0;
    // Combine video + audio + subtitle for this scene
    const combinedScenePath = path.join(os.tmpdir(), `scene-${scenePosition}-combined.mp4`);
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            console.error(`❌ Timeout combining scene ${scenePosition} after 5 minutes`);
            reject(new Error(`Timeout combining scene ${scenePosition}`));
        }, 5 * 60 * 1000); // 5 minute timeout
        const command = ffmpeg().input(videoPath);
        if (isAnimated) {
            // Animated scenes have a fixed-length Runway clip (e.g. 5s) that is
            // often shorter than the narration — loop it indefinitely and rely on
            // the explicit -t below to cut it to exactly the target duration.
            command.inputOptions(['-stream_loop', '-1']);
        }
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
            '-t',
            targetDuration.toFixed(3),
        ]);
        // Build video filters: subtitles + optional freeze-frame padding when
        // the (non-looped) video is naturally a little shorter than the audio.
        const vfParts = [];
        if (subtitlePath && fs.existsSync(subtitlePath)) {
            vfParts.push(`ass=${subtitlePath}:fontsdir=/opt/fonts`);
        }
        if (!isAnimated && padVideoSeconds > 0.005) {
            vfParts.push(`tpad=stop_mode=clone:stop_duration=${padVideoSeconds.toFixed(3)}`);
        }
        if (vfParts.length > 0) {
            command.outputOptions(['-vf', vfParts.join(',')]);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9Db21iaW5lci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZpZGVvQ29tYmluZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFrREEsb0RBbUpDO0FBaUpELG9DQStMQztBQXJoQkQsa0RBSTRCO0FBQzVCLHdFQUE2RDtBQUc3RCx5QkFBeUI7QUFDekIseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUc3QixNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUM7QUFFeEMseUNBQXlDO0FBQ3pDLFNBQVMsYUFBYSxDQUFDLFFBQWdCO0lBQ3JDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtRQUM3QixNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLEdBQWlCLEVBQUUsSUFBUyxFQUFFLEVBQUU7WUFDeEQsSUFBSSxHQUFHO2dCQUFFLE9BQU8sT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzNCLE1BQU0sR0FBRyxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLFFBQVEsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNoRCxPQUFPLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQUVELFNBQVMsYUFBYSxDQUFDLFFBQWdCO0lBQ3JDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsRUFBRTtRQUM3QixNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxDQUFDLEdBQWlCLEVBQUUsSUFBUyxFQUFFLEVBQUU7WUFDeEQsSUFBSSxHQUFHO2dCQUFFLE9BQU8sT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQy9CLE1BQU0sT0FBTyxHQUFHLElBQUksRUFBRSxP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QVMsQ0FBQyxDQUFDO1lBQ3ZELElBQUksU0FBUyxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDO2dCQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDcEUsSUFBSSxZQUFZLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUM7Z0JBQzdDLEVBQUUsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUM7WUFFOUIsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDN0IsQ0FBQyxDQUFDO2FBQ0QsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLEdBQVUsRUFBRSxFQUFFO1lBQzFCLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN0QixPQUFPLENBQUMsS0FBSyxDQUFDLDJCQUEyQixhQUFhLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNoRSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDZCxDQUFDLENBQUM7YUFDRCxHQUFHLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIFMzQ2xpZW50LFxuICBHZXRPYmplY3RDb21tYW5kLFxuICBQdXRPYmplY3RDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSAnQGF3cy1zZGsvczMtcmVxdWVzdC1wcmVzaWduZXInO1xuaW1wb3J0IHsgTWFuaWZlc3QsIE1hbmlmZXN0U2NlbmUgfSBmcm9tICcuLi90eXBlcy9zM1R5cGVzJztcblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IFVzZXJJdGVtIH0gZnJvbSAnLi91c2VyJztcblxuY29uc3QgZmZtcGVnID0gcmVxdWlyZSgnZmx1ZW50LWZmbXBlZycpO1xuXG4vLyAtLS0gSGVscGVycyBmb3IgY29uY2F0IHJlbGlhYmlsaXR5IC0tLVxuZnVuY3Rpb24gcHJvYmVEdXJhdGlvbihmaWxlUGF0aDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgZmZtcGVnLmZmcHJvYmUoZmlsZVBhdGgsIChlcnI6IEVycm9yIHwgbnVsbCwgZGF0YTogYW55KSA9PiB7XG4gICAgICBpZiAoZXJyKSByZXR1cm4gcmVzb2x2ZSgwKTtcbiAgICAgIGNvbnN0IGR1ciA9IE51bWJlcihkYXRhPy5mb3JtYXQ/LmR1cmF0aW9uID8/IDApO1xuICAgICAgcmVzb2x2ZShOdW1iZXIuaXNGaW5pdGUoZHVyKSA/IGR1ciA6IDApO1xuICAgIH0pO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gcHJvYmVIYXNBdWRpbyhmaWxlUGF0aDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuICAgIGZmbXBlZy5mZnByb2JlKGZpbGVQYXRoLCAoZXJyOiBFcnJvciB8IG51bGwsIGRhdGE6IGFueSkgPT4ge1xuICAgICAgaWYgKGVycikgcmV0dXJuIHJlc29sdmUoZmFsc2UpO1xuICAgICAgY29uc3Qgc3RyZWFtcyA9IGRhdGE/LnN0cmVhbXMgfHwgW107XG4gICAgICByZXNvbHZlKHN0cmVhbXMuc29tZSgoczogYW55KSA9PiBzLmNvZGVjX3R5cGUgPT09ICdhdWRpbycpKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbi8vIFMzIGZpbGUgb2JqZWN0IGludGVyZmFjZVxuZXhwb3J0IGludGVyZmFjZSBTM0ZpbGVPYmplY3Qge1xuICBLZXk6IHN0cmluZztcbn1cblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjsgLy8gQWRkIGlkIHByb3BlcnR5XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21iaW5lVmlkZW9BbmRBdWRpbyhcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBtYW5pZmVzdDogTWFuaWZlc3QsXG4gIHJlbW92ZWRTY2VuZXM6IG51bWJlcltdID0gW10sXG4gIHVzZXI6IFVzZXJJdGVtIHwgbnVsbCxcbik6IFByb21pc2U8eyBmaW5hbFZpZGVvU2lnbmVkVXJsOiBzdHJpbmc7IHNpemU6IHN0cmluZyB9PiB7XG4gIGNvbnNvbGUubG9nKFxuICAgICfwn46sIENvbWJpbmluZyB2aWRlbywgYXVkaW8sIGFuZCBzdWJ0aXRsZXMgc2NlbmUgYnkgc2NlbmUgZm9yIHVzZXI6JyxcbiAgICB1c2VySWQsXG4gICk7XG5cbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICfwn5SNIFVzaW5nIG1hbmlmZXN0IGZvciBzY2VuZSBvcmRlcmluZzonLFxuICAgICAgbWFuaWZlc3Quc2NlbmVzLmxlbmd0aCxcbiAgICAgICdzY2VuZXMnLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coJ/CflI0gUmVtb3ZlZCBzY2VuZXMgdG8gZXhjbHVkZTonLCByZW1vdmVkU2NlbmVzKTtcblxuICAgIGlmICghbWFuaWZlc3Quc2NlbmVzIHx8IG1hbmlmZXN0LnNjZW5lcy5sZW5ndGggPT09IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gc2NlbmVzIGZvdW5kIGluIG1hbmlmZXN0Jyk7XG4gICAgfVxuXG4gICAgLy8gRmlsdGVyIG91dCByZW1vdmVkIHNjZW5lcyBhbmQgc29ydCBieSBzY2VuZVBvc2l0aW9uIHRvIGVuc3VyZSBwcm9wZXIgb3JkZXJcbiAgICBjb25zdCBmaWx0ZXJlZFNjZW5lcyA9IG1hbmlmZXN0LnNjZW5lcy5maWx0ZXIoKHNjZW5lOiBNYW5pZmVzdFNjZW5lKSA9PiB7XG4gICAgICBjb25zdCBpc1JlbW92ZWQgPSByZW1vdmVkU2NlbmVzLmluY2x1ZGVzKHNjZW5lLmlkKTtcbiAgICAgIGlmIChpc1JlbW92ZWQpIHtcbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYPCfmqsgRXhjbHVkaW5nIHJlbW92ZWQgc2NlbmUgSUQ6ICR7c2NlbmUuaWR9IChwb3NpdGlvbjogJHtzY2VuZS5zY2VuZVBvc2l0aW9ufSlgLFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuICFpc1JlbW92ZWQ7XG4gICAgfSk7XG5cbiAgICBjb25zdCBzb3J0ZWRTY2VuZXMgPSBmaWx0ZXJlZFNjZW5lcy5zb3J0KFxuICAgICAgKGE6IE1hbmlmZXN0U2NlbmUsIGI6IE1hbmlmZXN0U2NlbmUpID0+IGEuc2NlbmVQb3NpdGlvbiAtIGIuc2NlbmVQb3NpdGlvbixcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICAn8J+UjSBTb3J0ZWQgc2NlbmVzIGJ5IHNjZW5lUG9zaXRpb246JyxcbiAgICAgIHNvcnRlZFNjZW5lcy5tYXAoKHM6IE1hbmlmZXN0U2NlbmUpID0+ICh7XG4gICAgICAgIHNjZW5lUG9zaXRpb246IHMuc2NlbmVQb3NpdGlvbixcbiAgICAgICAgaGFzVmlkZW86ICEhcy5maWxlcz8ubXA0LFxuICAgICAgICBoYXNBdWRpbzogISFzLmZpbGVzPy5tcDMsXG4gICAgICAgIGhhc1N1YnRpdGxlOiAhIXMuZmlsZXM/LmFzcyxcbiAgICAgIH0pKSxcbiAgICApO1xuXG4gICAgLy8gUHJvY2VzcyBhbGwgc2NlbmVzIGluIHBhcmFsbGVsOiBjb21iaW5lIHZpZGVvICsgYXVkaW8gKyBzdWJ0aXRsZVxuICAgIGNvbnN0IHNjZW5lUHJvY2Vzc2luZ1Byb21pc2VzID0gc29ydGVkU2NlbmVzLm1hcChcbiAgICAgIGFzeW5jIChzY2VuZTogTWFuaWZlc3RTY2VuZSwgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgIGNvbnN0IHNjZW5lUG9zaXRpb24gPSBzY2VuZS5zY2VuZVBvc2l0aW9uO1xuXG4gICAgICAgIC8vIENyZWF0ZSBmaWxlIG9iamVjdHMgYmFzZWQgb24gbWFuaWZlc3RcbiAgICAgICAgLy8gRXh0cmFjdCBTMyBrZXkgZnJvbSBVUkwgaWYgaXQncyBhIGZ1bGwgVVJMLCBvdGhlcndpc2UgdXNlIGFzLWlzXG4gICAgICAgIGNvbnN0IGV4dHJhY3RTM0tleSA9ICh1cmw6IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gICAgICAgICAgaWYgKHVybC5zdGFydHNXaXRoKCdodHRwczovLycpKSB7XG4gICAgICAgICAgICAvLyBFeHRyYWN0IGtleSBmcm9tIFMzIFVSTFxuICAgICAgICAgICAgY29uc3QgdXJsUGFydHMgPSB1cmwuc3BsaXQoJy8nKTtcbiAgICAgICAgICAgIHJldHVybiB1cmxQYXJ0cy5zbGljZSgzKS5qb2luKCcvJyk7IC8vIFJlbW92ZSBidWNrZXQgYW5kIGRvbWFpbiBwYXJ0c1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdXJsO1xuICAgICAgICB9O1xuXG4gICAgICAgIGNvbnN0IHZpZGVvRmlsZSA9IHNjZW5lLmZpbGVzPy5tcDRcbiAgICAgICAgICA/IHsgS2V5OiBleHRyYWN0UzNLZXkoc2NlbmUuZmlsZXMubXA0KSB9XG4gICAgICAgICAgOiBudWxsO1xuICAgICAgICBjb25zdCBhdWRpb0ZpbGUgPSBzY2VuZS5maWxlcz8ubXAzXG4gICAgICAgICAgPyB7IEtleTogZXh0cmFjdFMzS2V5KHNjZW5lLmZpbGVzLm1wMykgfVxuICAgICAgICAgIDogbnVsbDtcbiAgICAgICAgY29uc3Qgc3VidGl0bGVGaWxlID0gc2NlbmUuZmlsZXM/LmFzc1xuICAgICAgICAgID8geyBLZXk6IGV4dHJhY3RTM0tleShzY2VuZS5maWxlcy5hc3MpIH1cbiAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgaWYgKCF2aWRlb0ZpbGU/LktleSkge1xuICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgIGDimqDvuI8gTm8gdmlkZW8gZmlsZSBmb3VuZCBmb3Igc2NlbmUgYXQgcG9zaXRpb24gJHtzY2VuZVBvc2l0aW9ufWAsXG4gICAgICAgICAgKTtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBhd2FpdCBwcm9jZXNzU2NlbmUoXG4gICAgICAgICAgdmlkZW9GaWxlLFxuICAgICAgICAgIGF1ZGlvRmlsZSxcbiAgICAgICAgICBzdWJ0aXRsZUZpbGUsXG4gICAgICAgICAgc2NlbmVQb3NpdGlvbixcbiAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICAgIHNjZW5lLmFuaW1hdGVkLFxuICAgICAgICApO1xuICAgICAgfSxcbiAgICApO1xuXG4gICAgY29uc3QgY29tYmluZWRTY2VuZVBhdGhzID0gKFxuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwoc2NlbmVQcm9jZXNzaW5nUHJvbWlzZXMpXG4gICAgKS5maWx0ZXIoKHBhdGgpOiBwYXRoIGlzIHN0cmluZyA9PiBwYXRoICE9PSBudWxsKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn5SNIHNjZW5lUHJvY2Vzc2luZ1Byb21pc2VzIGZpbmlzaGVkOicsIGNvbWJpbmVkU2NlbmVQYXRocyk7XG5cbiAgICAvLyBOb3cgY29uY2F0ZW5hdGUgYWxsIGNvbWJpbmVkIHNjZW5lc1xuICAgIGNvbnN0IGZpbmFsT3V0cHV0UGF0aCA9IGF3YWl0IGNvbmNhdGVuYXRlU2NlbmVzKGNvbWJpbmVkU2NlbmVQYXRocyk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+UjSBmaW5hbE91dHB1dFBhdGggc3RhcnQ6JywgZmluYWxPdXRwdXRQYXRoKTtcblxuICAgIC8vIFVwbG9hZCBmaW5hbCB2aWRlbyB0byBTM1xuICAgIGNvbnN0IGZpbmFsVmlkZW9CdWZmZXIgPSBmcy5yZWFkRmlsZVN5bmMoZmluYWxPdXRwdXRQYXRoKTtcbiAgICBjb25zdCBmaW5hbFZpZGVvS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0tZmluYWwtdmlkZW8ubXA0YDtcbiAgICBjb25zdCBzaXplID0gZmluYWxWaWRlb0J1ZmZlci5sZW5ndGgudG9TdHJpbmcoKTtcbiAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IGZpbmFsVmlkZW9LZXksXG4gICAgICAgIEJvZHk6IGZpbmFsVmlkZW9CdWZmZXIsXG4gICAgICAgIENvbnRlbnRUeXBlOiAndmlkZW8vbXA0JyxcbiAgICAgICAgTWV0YWRhdGE6IHtcbiAgICAgICAgICBzaXplLFxuICAgICAgICAgIGR1cmF0aW9uOiBtYW5pZmVzdC50b3RhbER1cmF0aW9uLnRvU3RyaW5nKCksXG4gICAgICAgICAgc2NlbmVDb3VudDogbWFuaWZlc3Quc2NlbmVDb3VudC50b1N0cmluZygpLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn5K+IEZpbmFsIHZpZGVvIHVwbG9hZGVkIHRvIFMzOicsIGZpbmFsVmlkZW9LZXkpO1xuXG4gICAgLy8gR2VuZXJhdGUgcHJlLXNpZ25lZCBVUkwgZm9yIHRoZSBmaW5hbCB2aWRlb1xuICAgIGNvbnN0IGZpbmFsVmlkZW9TaWduZWRVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoXG4gICAgICBzMyxcbiAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiBmaW5hbFZpZGVvS2V5LFxuICAgICAgfSksXG4gICAgICB7IGV4cGlyZXNJbjogMzYwMDAgfSwgLy8gMTAgaG91cnMgZXhwaXJhdGlvblxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+UlyBGaW5hbCB2aWRlbyBwcmUtc2lnbmVkIFVSTCBnZW5lcmF0ZWQnKTtcblxuICAgIC8vIENsZWFuIHVwIHRoZSB0ZW1wb3JhcnkgZmluYWwgdmlkZW8gZmlsZVxuICAgIGlmIChmcy5leGlzdHNTeW5jKGZpbmFsT3V0cHV0UGF0aCkpIHtcbiAgICAgIGZzLnVubGlua1N5bmMoZmluYWxPdXRwdXRQYXRoKTtcbiAgICB9XG5cbiAgICByZXR1cm4geyBmaW5hbFZpZGVvU2lnbmVkVXJsLCBzaXplIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGNvbWJpbmVWaWRlb0FuZEF1ZGlvOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG4vKipcbiAqIENvbmNhdGVuYXRlcyBtdWx0aXBsZSB2aWRlbyBzY2VuZSBmaWxlcyBpbnRvIGEgc2luZ2xlIGZpbmFsIHZpZGVvXG4gKiBAcGFyYW0gY29tYmluZWRTY2VuZVBhdGhzIEFycmF5IG9mIHBhdGhzIHRvIGNvbWJpbmVkIHNjZW5lIHZpZGVvIGZpbGVzXG4gKiBAcmV0dXJucyBQYXRoIHRvIHRoZSBmaW5hbCBjb25jYXRlbmF0ZWQgdmlkZW8gZmlsZVxuICovXG5hc3luYyBmdW5jdGlvbiBjb25jYXRlbmF0ZVNjZW5lcyhcbiAgY29tYmluZWRTY2VuZVBhdGhzOiBzdHJpbmdbXSxcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnNvbGUubG9nKCfwn46sIENvbmNhdGVuYXRpbmcgYWxsIGNvbWJpbmVkIHNjZW5lcyAoZmlsdGVyIGdyYXBoKeKApicpO1xuXG4gIGlmICghY29tYmluZWRTY2VuZVBhdGhzLmxlbmd0aCkge1xuICAgIHRocm93IG5ldyBFcnJvcignTm8gY29tYmluZWQgc2NlbmUgcGF0aHMgcHJvdmlkZWQnKTtcbiAgfVxuICBpZiAoY29tYmluZWRTY2VuZVBhdGhzLmxlbmd0aCA9PT0gMSkge1xuICAgIGNvbnNvbGUubG9nKCfihLnvuI8gT25seSBvbmUgc2NlbmUg4oCUIHNraXBwaW5nIGNvbmNhdC4nKTtcbiAgICByZXR1cm4gY29tYmluZWRTY2VuZVBhdGhzWzBdO1xuICB9XG5cbiAgLy8gUHJvYmUgZHVyYXRpb25zIGFuZCBhdWRpbyBwcmVzZW5jZSBzbyB3ZSBjYW4gY3JlYXRlIGNvbnNpc3RlbnQgc3RyZWFtc1xuICBjb25zdCBbZHVyYXRpb25zLCBhdWRpb0ZsYWdzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICBQcm9taXNlLmFsbChjb21iaW5lZFNjZW5lUGF0aHMubWFwKChwKSA9PiBwcm9iZUR1cmF0aW9uKHApKSksXG4gICAgUHJvbWlzZS5hbGwoY29tYmluZWRTY2VuZVBhdGhzLm1hcCgocCkgPT4gcHJvYmVIYXNBdWRpbyhwKSkpLFxuICBdKTtcblxuICBjb25zdCB0b3RhbER1cmF0aW9uID0gZHVyYXRpb25zLnJlZHVjZSgoYSwgYikgPT4gYSArIGIsIDApO1xuICBjb25zb2xlLmxvZyhcbiAgICAn4o+x77iPIENvbmNhdCBpbnB1dHM6JyxcbiAgICBjb21iaW5lZFNjZW5lUGF0aHMubWFwKChwLCBpKSA9PiAoe1xuICAgICAgaWR4OiBpLFxuICAgICAgcGF0aDogcCxcbiAgICAgIGR1cmF0aW9uOiBOdW1iZXIoZHVyYXRpb25zW2ldLnRvRml4ZWQoMykpLFxuICAgICAgaGFzQXVkaW86IGF1ZGlvRmxhZ3NbaV0sXG4gICAgfSkpLFxuICApO1xuXG4gIGNvbnN0IGZpbmFsT3V0cHV0UGF0aCA9IHBhdGguam9pbihvcy50bXBkaXIoKSwgJ2ZpbmFsLXZpZGVvLm1wNCcpO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgVGltZW91dCBjb25jYXRlbmF0aW5nIHNjZW5lcyBhZnRlciAxMCBtaW51dGVzJyk7XG4gICAgICByZWplY3QobmV3IEVycm9yKCdUaW1lb3V0IGNvbmNhdGVuYXRpbmcgc2NlbmVzJykpO1xuICAgIH0sIDEwICogNjAgKiAxMDAwKTtcblxuICAgIGNvbnN0IGNtZCA9IGZmbXBlZygpO1xuICAgIGNvbWJpbmVkU2NlbmVQYXRocy5mb3JFYWNoKChwKSA9PiBjbWQuaW5wdXQocCkpO1xuXG4gICAgLy8gQnVpbGQgZmlsdGVyIGdyYXBoOiBmb3IgZWFjaCBpbnB1dCwgcmVzZXQgUFRTOyBlbnN1cmUgYW4gYXVkaW8gc3RyZWFtIGV4aXN0cyBieVxuICAgIC8vIGdlbmVyYXRpbmcgcGVyLXNlZ21lbnQgc2lsZW50IGF1ZGlvIHdoZW4gbWlzc2luZzsgdGhlbiBjb25jYXQgZGVjb2RlZCBzdHJlYW1zLlxuICAgIGNvbnN0IHZmQ2hhaW5zOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGFmQ2hhaW5zOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb21iaW5lZFNjZW5lUGF0aHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZmQ2hhaW5zLnB1c2goYFske2l9OnY6MF1zZXRwdHM9UFRTLVNUQVJUUFRTW3Yke2l9XWApO1xuICAgICAgaWYgKGF1ZGlvRmxhZ3NbaV0pIHtcbiAgICAgICAgYWZDaGFpbnMucHVzaChcbiAgICAgICAgICBgWyR7aX06YTowXWFzZXRwdHM9UFRTLVNUQVJUUFRTLGFyZXNhbXBsZT1hc3luYz0xOmZpcnN0X3B0cz0wW2Eke2l9XWAsXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBkID0gTWF0aC5tYXgoMCwgZHVyYXRpb25zW2ldKTtcbiAgICAgICAgYWZDaGFpbnMucHVzaChcbiAgICAgICAgICBgYW51bGxzcmM9cj00ODAwMDpjbD1zdGVyZW8sYXRyaW09MDoke2QudG9GaXhlZChcbiAgICAgICAgICAgIDMsXG4gICAgICAgICAgKX0sYXNldHB0cz1QVFMtU1RBUlRQVFNbYSR7aX1dYCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBjb25jYXRJbnB1dHMgPSBbXSBhcyBzdHJpbmdbXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbWJpbmVkU2NlbmVQYXRocy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uY2F0SW5wdXRzLnB1c2goYFt2JHtpfV1bYSR7aX1dYCk7XG4gICAgfVxuXG4gICAgY29uc3QgZmlsdGVyR3JhcGggPSBbXG4gICAgICAuLi52ZkNoYWlucyxcbiAgICAgIC4uLmFmQ2hhaW5zLFxuICAgICAgYCR7Y29uY2F0SW5wdXRzLmpvaW4oJycpfWNvbmNhdD1uPSR7XG4gICAgICAgIGNvbWJpbmVkU2NlbmVQYXRocy5sZW5ndGhcbiAgICAgIH06dj0xOmE9MVt2XVthXWAsXG4gICAgXS5qb2luKCc7Jyk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+nqSBmaWx0ZXJfY29tcGxleDonLCBmaWx0ZXJHcmFwaCk7XG5cbiAgICBjbWRcbiAgICAgIC5jb21wbGV4RmlsdGVyKGZpbHRlckdyYXBoKVxuICAgICAgLm91dHB1dE9wdGlvbnMoW1xuICAgICAgICAnLW1hcCcsXG4gICAgICAgICdbdl0nLFxuICAgICAgICAnLW1hcCcsXG4gICAgICAgICdbYV0nLFxuICAgICAgICAnLWM6dicsXG4gICAgICAgICdsaWJ4MjY0JyxcbiAgICAgICAgJy1wcmVzZXQnLFxuICAgICAgICAndmVyeWZhc3QnLFxuICAgICAgICAnLWNyZicsXG4gICAgICAgICcyMycsXG4gICAgICAgICctcGl4X2ZtdCcsXG4gICAgICAgICd5dXY0MjBwJyxcbiAgICAgICAgJy1jOmEnLFxuICAgICAgICAnYWFjJyxcbiAgICAgICAgJy1iOmEnLFxuICAgICAgICAnMTkyaycsXG4gICAgICAgICctYXInLFxuICAgICAgICAnNDgwMDAnLFxuICAgICAgICAnLW1vdmZsYWdzJyxcbiAgICAgICAgJytmYXN0c3RhcnQnLFxuICAgICAgICAnLXZzeW5jJyxcbiAgICAgICAgJzInLFxuICAgICAgICAnLXRocmVhZHMnLFxuICAgICAgICAnMCcsXG4gICAgICBdKVxuICAgICAgLy8gRm9yY2Ugb3V0cHV0IGxvbmcgZW5vdWdoIHRvIGNvdmVyIGFsbCBzZWdtZW50cyAoZ3VhcmQgYWdhaW5zdCBzdHJheSB0aW1lc3RhbXBzKVxuICAgICAgLm91dHB1dE9wdGlvbnMoWyctdCcsIHRvdGFsRHVyYXRpb24udG9GaXhlZCgzKV0pXG4gICAgICAub3V0cHV0KGZpbmFsT3V0cHV0UGF0aClcbiAgICAgIC5vbignZW5kJywgKCkgPT4ge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgIGNvbnNvbGUubG9nKCfinIUgQWxsIHNjZW5lcyBjb25jYXRlbmF0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG4gICAgICAgIC8vIENsZWFuIHVwIHRlbXBvcmFyeSBzY2VuZSBmaWxlc1xuICAgICAgICBjb21iaW5lZFNjZW5lUGF0aHMuZm9yRWFjaCgoc2NlbmVQYXRoKSA9PiB7XG4gICAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoc2NlbmVQYXRoKSkgZnMudW5saW5rU3luYyhzY2VuZVBhdGgpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmVzb2x2ZShmaW5hbE91dHB1dFBhdGgpO1xuICAgICAgfSlcbiAgICAgIC5vbignZXJyb3InLCAoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBjb25jYXRlbmF0aW5nIHNjZW5lczonLCBlcnIpO1xuICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgIH0pXG4gICAgICAucnVuKCk7XG4gIH0pO1xufVxuXG4vKipcbiAqIFByb2Nlc3NlcyBhIHNpbmdsZSBzY2VuZSBieSBjb21iaW5pbmcgdmlkZW8sIGF1ZGlvLCBhbmQgc3VidGl0bGUgZmlsZXNcbiAqIEBwYXJhbSB2aWRlb0ZpbGUgUzMgb2JqZWN0IGNvbnRhaW5pbmcgdmlkZW8gZmlsZSBpbmZvXG4gKiBAcGFyYW0gYXVkaW9GaWxlIFMzIG9iamVjdCBjb250YWluaW5nIGF1ZGlvIGZpbGUgaW5mbyAob3B0aW9uYWwpXG4gKiBAcGFyYW0gc3VidGl0bGVGaWxlIFMzIG9iamVjdCBjb250YWluaW5nIHN1YnRpdGxlIGZpbGUgaW5mbyAob3B0aW9uYWwpXG4gKiBAcGFyYW0gc2NlbmVQb3NpdGlvbiBJbmRleCBvZiB0aGUgc2NlbmUgYmVpbmcgcHJvY2Vzc2VkXG4gKiBAcGFyYW0gdXNlcklkIFVzZXIgSUQgZm9yIFMzIG9wZXJhdGlvbnNcbiAqIEBwYXJhbSB0aW1lc3RhbXAgVGltZXN0YW1wIGZvciBTMyBvcGVyYXRpb25zXG4gKiBAcGFyYW0gaXNBbmltYXRlZCBXaGV0aGVyIHRoaXMgc2NlbmUncyB2aWRlbyBpcyBhIGZpeGVkLWxlbmd0aCBSdW53YXlcbiAqICAgYW5pbWF0aW9uIGNsaXAgdGhhdCBzaG91bGQgbG9vcCB0byBjb3ZlciB0aGUgZnVsbCBhdWRpbyBkdXJhdGlvblxuICogQHJldHVybnMgUGF0aCB0byB0aGUgY29tYmluZWQgc2NlbmUgZmlsZVxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1NjZW5lKFxuICB2aWRlb0ZpbGU6IFMzRmlsZU9iamVjdCxcbiAgYXVkaW9GaWxlOiBTM0ZpbGVPYmplY3QgfCBudWxsLFxuICBzdWJ0aXRsZUZpbGU6IFMzRmlsZU9iamVjdCB8IG51bGwsXG4gIHNjZW5lUG9zaXRpb246IG51bWJlcixcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBpc0FuaW1hdGVkID0gZmFsc2UsXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICAvLyBFeHRyYWN0IHRoZSBhY3R1YWwgc2NlbmUgSUQgZnJvbSB0aGUgZmlsZW5hbWVcbiAgY29uc3Qgc2NlbmVJZE1hdGNoID0gdmlkZW9GaWxlLktleS5tYXRjaCgvc2NlbmUtKFxcZCspXFwubXA0Lyk7XG4gIGNvbnN0IHNjZW5lSWQgPSBzY2VuZUlkTWF0Y2ggPyBwYXJzZUludChzY2VuZUlkTWF0Y2hbMV0pIDogc2NlbmVQb3NpdGlvbjtcblxuICBjb25zb2xlLmxvZyhcbiAgICBg8J+OrCBQcm9jZXNzaW5nIHNjZW5lICR7c2NlbmVQb3NpdGlvbn0gKElEOiAke3NjZW5lSWR9KTogY29tYmluaW5nIHZpZGVvICsgYXVkaW8gKyBzdWJ0aXRsZWAsXG4gICk7XG5cbiAgLy8gRG93bmxvYWQgdmlkZW8gZmlsZVxuICBjb25zdCB2aWRlb1BhdGggPSBwYXRoLmpvaW4ob3MudG1wZGlyKCksIGBzY2VuZS0ke3NjZW5lUG9zaXRpb259LXZpZGVvLm1wNGApO1xuICBjb25zdCB2aWRlb09iamVjdCA9IGF3YWl0IHMzLnNlbmQoXG4gICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgIEtleTogdmlkZW9GaWxlLktleSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgdmlkZW9CdWZmZXIgPSBCdWZmZXIuZnJvbShcbiAgICBhd2FpdCB2aWRlb09iamVjdC5Cb2R5IS50cmFuc2Zvcm1Ub0J5dGVBcnJheSgpLFxuICApO1xuICBmcy53cml0ZUZpbGVTeW5jKHZpZGVvUGF0aCwgdmlkZW9CdWZmZXIpO1xuXG4gIC8vIERvd25sb2FkIGF1ZGlvIGZpbGVcbiAgbGV0IGF1ZGlvUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGlmIChhdWRpb0ZpbGU/LktleSkge1xuICAgIGF1ZGlvUGF0aCA9IHBhdGguam9pbihvcy50bXBkaXIoKSwgYHNjZW5lLSR7c2NlbmVQb3NpdGlvbn0tYXVkaW8ubXAzYCk7XG4gICAgY29uc3QgYXVkaW9PYmplY3QgPSBhd2FpdCBzMy5zZW5kKFxuICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IGF1ZGlvRmlsZS5LZXksXG4gICAgICB9KSxcbiAgICApO1xuICAgIGNvbnN0IGF1ZGlvQnVmZmVyID0gQnVmZmVyLmZyb20oXG4gICAgICBhd2FpdCBhdWRpb09iamVjdC5Cb2R5IS50cmFuc2Zvcm1Ub0J5dGVBcnJheSgpLFxuICAgICk7XG4gICAgZnMud3JpdGVGaWxlU3luYyhhdWRpb1BhdGgsIGF1ZGlvQnVmZmVyKTtcbiAgfVxuXG4gIC8vIERvd25sb2FkIHN1YnRpdGxlIGZpbGVcbiAgbGV0IHN1YnRpdGxlUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGlmIChzdWJ0aXRsZUZpbGU/LktleSkge1xuICAgIHN1YnRpdGxlUGF0aCA9IHBhdGguam9pbihcbiAgICAgIG9zLnRtcGRpcigpLFxuICAgICAgYHNjZW5lLSR7c2NlbmVQb3NpdGlvbn0tc3VidGl0bGUuYXNzYCxcbiAgICApO1xuICAgIGNvbnN0IHN1YnRpdGxlT2JqZWN0ID0gYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiBzdWJ0aXRsZUZpbGUuS2V5LFxuICAgICAgfSksXG4gICAgKTtcbiAgICBjb25zdCBzdWJ0aXRsZUJ1ZmZlciA9IEJ1ZmZlci5mcm9tKFxuICAgICAgYXdhaXQgc3VidGl0bGVPYmplY3QuQm9keSEudHJhbnNmb3JtVG9CeXRlQXJyYXkoKSxcbiAgICApO1xuICAgIGZzLndyaXRlRmlsZVN5bmMoc3VidGl0bGVQYXRoLCBzdWJ0aXRsZUJ1ZmZlcik7XG4gIH1cblxuICAvLyBQcm9iZSBkdXJhdGlvbnMgdG8gZW5zdXJlIHRoZSBmaW5hbCBtdXggcnVucyBmb3IgdGhlIGxvbmdlciBvZiB0aGUgdHdvXG4gIC8vIHN0cmVhbXMg4oCUIGZvciBhbmltYXRlZCBzY2VuZXMgKGxvb3BlZCBiZWxvdykgdGhlIGF1ZGlvIGlzIGV4cGVjdGVkIHRvIGJlXG4gIC8vIGxvbmdlciwgc28gdGhlIHRhcmdldCBkdXJhdGlvbiBuYXR1cmFsbHkgYmVjb21lcyB0aGUgYXVkaW8ncyBsZW5ndGguXG4gIGNvbnN0IHZpZGVvRHVyYXRpb24gPSBhd2FpdCBwcm9iZUR1cmF0aW9uKHZpZGVvUGF0aCk7XG4gIGNvbnN0IGF1ZGlvRHVyYXRpb24gPSBhdWRpb1BhdGggPyBhd2FpdCBwcm9iZUR1cmF0aW9uKGF1ZGlvUGF0aCkgOiAwO1xuICBjb25zdCB0YXJnZXREdXJhdGlvbiA9IE1hdGgubWF4KHZpZGVvRHVyYXRpb24sIGF1ZGlvRHVyYXRpb24pO1xuICBjb25zdCBwYWRWaWRlb1NlY29uZHMgPSBhdWRpb1BhdGhcbiAgICA/IE1hdGgubWF4KDAsIGF1ZGlvRHVyYXRpb24gLSB2aWRlb0R1cmF0aW9uKVxuICAgIDogMDtcblxuICAvLyBDb21iaW5lIHZpZGVvICsgYXVkaW8gKyBzdWJ0aXRsZSBmb3IgdGhpcyBzY2VuZVxuICBjb25zdCBjb21iaW5lZFNjZW5lUGF0aCA9IHBhdGguam9pbihcbiAgICBvcy50bXBkaXIoKSxcbiAgICBgc2NlbmUtJHtzY2VuZVBvc2l0aW9ufS1jb21iaW5lZC5tcDRgLFxuICApO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBg4p2MIFRpbWVvdXQgY29tYmluaW5nIHNjZW5lICR7c2NlbmVQb3NpdGlvbn0gYWZ0ZXIgNSBtaW51dGVzYCxcbiAgICAgICk7XG4gICAgICByZWplY3QobmV3IEVycm9yKGBUaW1lb3V0IGNvbWJpbmluZyBzY2VuZSAke3NjZW5lUG9zaXRpb259YCkpO1xuICAgIH0sIDUgKiA2MCAqIDEwMDApOyAvLyA1IG1pbnV0ZSB0aW1lb3V0XG5cbiAgICBjb25zdCBjb21tYW5kID0gZmZtcGVnKCkuaW5wdXQodmlkZW9QYXRoKTtcblxuICAgIGlmIChpc0FuaW1hdGVkKSB7XG4gICAgICAvLyBBbmltYXRlZCBzY2VuZXMgaGF2ZSBhIGZpeGVkLWxlbmd0aCBSdW53YXkgY2xpcCAoZS5nLiA1cykgdGhhdCBpc1xuICAgICAgLy8gb2Z0ZW4gc2hvcnRlciB0aGFuIHRoZSBuYXJyYXRpb24g4oCUIGxvb3AgaXQgaW5kZWZpbml0ZWx5IGFuZCByZWx5IG9uXG4gICAgICAvLyB0aGUgZXhwbGljaXQgLXQgYmVsb3cgdG8gY3V0IGl0IHRvIGV4YWN0bHkgdGhlIHRhcmdldCBkdXJhdGlvbi5cbiAgICAgIGNvbW1hbmQuaW5wdXRPcHRpb25zKFsnLXN0cmVhbV9sb29wJywgJy0xJ10pO1xuICAgIH1cblxuICAgIGlmIChhdWRpb1BhdGgpIHtcbiAgICAgIGNvbW1hbmQuaW5wdXQoYXVkaW9QYXRoKTtcbiAgICAgIGNvbW1hbmQub3V0cHV0T3B0aW9ucyhbXG4gICAgICAgICctbWFwJyxcbiAgICAgICAgJzE6YTowJyxcbiAgICAgICAgJy1jOmEnLFxuICAgICAgICAnYWFjJyxcbiAgICAgICAgJy1iOmEnLFxuICAgICAgICAnMTI4aycsXG4gICAgICAgICctZmlsdGVyOmEnLFxuICAgICAgICAnYXBhZCcsXG4gICAgICBdKTtcbiAgICB9XG5cbiAgICBjb21tYW5kLm91dHB1dE9wdGlvbnMoW1xuICAgICAgJy1tYXAnLFxuICAgICAgJzA6djowJyxcbiAgICAgICctYzp2JyxcbiAgICAgICdsaWJ4MjY0JyxcbiAgICAgICctcHJlc2V0JyxcbiAgICAgICd1bHRyYWZhc3QnLFxuICAgICAgJy1jcmYnLFxuICAgICAgJzI4JyxcbiAgICAgICctcGl4X2ZtdCcsXG4gICAgICAneXV2NDIwcCcsXG4gICAgICAnLXZzeW5jJyxcbiAgICAgICcxJyxcbiAgICAgICctdGhyZWFkcycsXG4gICAgICAnMCcsXG4gICAgICAnLXQnLFxuICAgICAgdGFyZ2V0RHVyYXRpb24udG9GaXhlZCgzKSxcbiAgICBdKTtcblxuICAgIC8vIEJ1aWxkIHZpZGVvIGZpbHRlcnM6IHN1YnRpdGxlcyArIG9wdGlvbmFsIGZyZWV6ZS1mcmFtZSBwYWRkaW5nIHdoZW5cbiAgICAvLyB0aGUgKG5vbi1sb29wZWQpIHZpZGVvIGlzIG5hdHVyYWxseSBhIGxpdHRsZSBzaG9ydGVyIHRoYW4gdGhlIGF1ZGlvLlxuICAgIGNvbnN0IHZmUGFydHM6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKHN1YnRpdGxlUGF0aCAmJiBmcy5leGlzdHNTeW5jKHN1YnRpdGxlUGF0aCkpIHtcbiAgICAgIHZmUGFydHMucHVzaChgYXNzPSR7c3VidGl0bGVQYXRofTpmb250c2Rpcj0vb3B0L2ZvbnRzYCk7XG4gICAgfVxuICAgIGlmICghaXNBbmltYXRlZCAmJiBwYWRWaWRlb1NlY29uZHMgPiAwLjAwNSkge1xuICAgICAgdmZQYXJ0cy5wdXNoKFxuICAgICAgICBgdHBhZD1zdG9wX21vZGU9Y2xvbmU6c3RvcF9kdXJhdGlvbj0ke3BhZFZpZGVvU2Vjb25kcy50b0ZpeGVkKDMpfWAsXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAodmZQYXJ0cy5sZW5ndGggPiAwKSB7XG4gICAgICBjb21tYW5kLm91dHB1dE9wdGlvbnMoWyctdmYnLCB2ZlBhcnRzLmpvaW4oJywnKV0pO1xuICAgIH1cblxuICAgIGNvbW1hbmRcbiAgICAgIC5vdXRwdXQoY29tYmluZWRTY2VuZVBhdGgpXG4gICAgICAub24oJ2VuZCcsIGFzeW5jICgpID0+IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIFNjZW5lICR7c2NlbmVQb3NpdGlvbn0gY29tYmluZWQgc3VjY2Vzc2Z1bGx5IWApO1xuXG4gICAgICAgIC8vIFNhdmUgY29tYmluZWQgc2NlbmUgdG8gUzMgZm9yIHRlc3RpbmcgcHVycG9zZXNcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCBjb21iaW5lZFNjZW5lQnVmZmVyID0gZnMucmVhZEZpbGVTeW5jKGNvbWJpbmVkU2NlbmVQYXRoKTtcbiAgICAgICAgICBjb25zdCBjb21iaW5lZFNjZW5lS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZVBvc2l0aW9ufS1jb21iaW5lZC5tcDRgO1xuXG4gICAgICAgICAgYXdhaXQgczMuc2VuZChcbiAgICAgICAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICAgICAgS2V5OiBjb21iaW5lZFNjZW5lS2V5LFxuICAgICAgICAgICAgICBCb2R5OiBjb21iaW5lZFNjZW5lQnVmZmVyLFxuICAgICAgICAgICAgICBDb250ZW50VHlwZTogJ3ZpZGVvL21wNCcsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBg8J+SviBTY2VuZSAke3NjZW5lUG9zaXRpb259IChJRDogJHtzY2VuZUlkfSkgY29tYmluZWQgZmlsZSBzYXZlZCB0byBTMzogJHtjb21iaW5lZFNjZW5lS2V5fWAsXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICBg4pqg77iPIENvdWxkIG5vdCBzYXZlIGNvbWJpbmVkIHNjZW5lICR7c2NlbmVQb3NpdGlvbn0gKElEOiAke3NjZW5lSWR9KSB0byBTMzpgLFxuICAgICAgICAgICAgZXJyb3IsXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENsZWFuIHVwIGluZGl2aWR1YWwgc2NlbmUgZmlsZXNcbiAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmModmlkZW9QYXRoKSkgZnMudW5saW5rU3luYyh2aWRlb1BhdGgpO1xuICAgICAgICBpZiAoYXVkaW9QYXRoICYmIGZzLmV4aXN0c1N5bmMoYXVkaW9QYXRoKSkgZnMudW5saW5rU3luYyhhdWRpb1BhdGgpO1xuICAgICAgICBpZiAoc3VidGl0bGVQYXRoICYmIGZzLmV4aXN0c1N5bmMoc3VidGl0bGVQYXRoKSlcbiAgICAgICAgICBmcy51bmxpbmtTeW5jKHN1YnRpdGxlUGF0aCk7XG5cbiAgICAgICAgcmVzb2x2ZShjb21iaW5lZFNjZW5lUGF0aCk7XG4gICAgICB9KVxuICAgICAgLm9uKCdlcnJvcicsIChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEVycm9yIGNvbWJpbmluZyBzY2VuZSAke3NjZW5lUG9zaXRpb259OmAsIGVycik7XG4gICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgfSlcbiAgICAgIC5ydW4oKTtcbiAgfSk7XG59XG4iXX0=