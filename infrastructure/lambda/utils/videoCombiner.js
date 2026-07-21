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
            // often shorter than the narration — loop it indefinitely so the
            // -shortest output option below trims it to exactly the audio length
            // instead of the audio getting cut short.
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9Db21iaW5lci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZpZGVvQ29tYmluZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFrREEsb0RBbUpDO0FBck1ELGtEQUk0QjtBQUM1Qix3RUFBNkQ7QUFHN0QseUJBQXlCO0FBQ3pCLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFHN0IsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBRXhDLHlDQUF5QztBQUN6QyxTQUFTLGFBQWEsQ0FBQyxRQUFnQjtJQUNyQyxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7UUFDN0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxHQUFpQixFQUFFLElBQVMsRUFBRSxFQUFFO1lBQ3hELElBQUksR0FBRztnQkFBRSxPQUFPLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzQixNQUFNLEdBQUcsR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFRLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDaEQsT0FBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxRQUFnQjtJQUNyQyxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7UUFDN0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxHQUFpQixFQUFFLElBQVMsRUFBRSxFQUFFO1lBQ3hELElBQUksR0FBRztnQkFBRSxPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMvQixNQUFNLE9BQU8sR0FBRyxJQUFJLEVBQUUsT0FBTyxJQUFJLEVBQUUsQ0FBQztZQUNwQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQzlELENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBT0QsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQVNyRCxLQUFLLFVBQVUsb0JBQW9CLENBQ3hDLE1BQWMsRUFDZCxTQUFpQixFQUNqQixRQUFrQixFQUNsQixnQkFBMEIsRUFBRSxFQUM1QixJQUFxQjtJQUVyQixPQUFPLENBQUMsR0FBRyxDQUNULG1FQUFtRSxFQUNuRSxNQUFNLENBQ1AsQ0FBQztJQUVGLElBQUksQ0FBQztRQUNILE9BQU8sQ0FBQyxHQUFHLENBQ1QsdUNBQXVDLEVBQ3ZDLFFBQVEsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUN0QixRQUFRLENBQ1QsQ0FBQztRQUNGLE9BQU8sQ0FBQyxHQUFHLENBQUMsK0JBQStCLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFFNUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLElBQUksUUFBUSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDckQsTUFBTSxJQUFJLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFFRCw2RUFBNkU7UUFDN0UsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxLQUFvQixFQUFFLEVBQUU7WUFDckUsTUFBTSxTQUFTLEdBQUcsYUFBYSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbkQsSUFBSSxTQUFTLEVBQUUsQ0FBQztnQkFDZCxPQUFPLENBQUMsR0FBRyxDQUNULGtDQUFrQyxLQUFLLENBQUMsRUFBRSxlQUFlLEtBQUssQ0FBQyxhQUFhLEdBQUcsQ0FDaEYsQ0FBQztZQUNKLENBQUM7WUFDRCxPQUFPLENBQUMsU0FBUyxDQUFDO1FBQ3BCLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxZQUFZLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FDdEMsQ0FBQyxDQUFnQixFQUFFLENBQWdCLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxhQUFhLEdBQUcsQ0FBQyxDQUFDLGFBQWEsQ0FDMUUsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQ1Qsb0NBQW9DLEVBQ3BDLFlBQVksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFnQixFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3RDLGFBQWEsRUFBRSxDQUFDLENBQUMsYUFBYTtZQUM5QixRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsR0FBRztZQUN4QixRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsR0FBRztZQUN4QixXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsR0FBRztTQUM1QixDQUFDLENBQUMsQ0FDSixDQUFDO1FBRUYsbUVBQW1FO1FBQ25FLE1BQU0sdUJBQXVCLEdBQUcsWUFBWSxDQUFDLEdBQUcsQ0FDOUMsS0FBSyxFQUFFLEtBQW9CLEVBQUUsQ0FBUyxFQUFFLEVBQUU7WUFDeEMsTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQztZQUUxQyx3Q0FBd0M7WUFDeEMsa0VBQWtFO1lBQ2xFLE1BQU0sWUFBWSxHQUFHLENBQUMsR0FBVyxFQUFVLEVBQUU7Z0JBQzNDLElBQUksR0FBRyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDO29CQUMvQiwwQkFBMEI7b0JBQzFCLE1BQU0sUUFBUSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQ2hDLE9BQU8sUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxpQ0FBaUM7Z0JBQ3ZFLENBQUM7Z0JBQ0QsT0FBTyxHQUFHLENBQUM7WUFDYixDQUFDLENBQUM7WUFFRixNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsS0FBSyxFQUFFLEdBQUc7Z0JBQ2hDLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxZQUFZLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRTtnQkFDeEMsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNULE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRztnQkFDaEMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLFlBQVksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFO2dCQUN4QyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ1QsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLEtBQUssRUFBRSxHQUFHO2dCQUNuQyxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsWUFBWSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUU7Z0JBQ3hDLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFFVCxJQUFJLENBQUMsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDO2dCQUNwQixPQUFPLENBQUMsSUFBSSxDQUNWLGdEQUFnRCxhQUFhLEVBQUUsQ0FDaEUsQ0FBQztnQkFDRixPQUFPLElBQUksQ0FBQztZQUNkLENBQUM7WUFFRCxPQUFPLE1BQU0sWUFBWSxDQUN2QixTQUFTLEVBQ1QsU0FBUyxFQUNULFlBQVksRUFDWixhQUFhLEVBQ2IsTUFBTSxFQUNOLFNBQVMsRUFDVCxLQUFLLENBQUMsUUFBUSxDQUNmLENBQUM7UUFDSixDQUFDLENBQ0YsQ0FBQztRQUVGLE1BQU0sa0JBQWtCLEdBQUcsQ0FDekIsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLENBQzNDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFrQixFQUFFLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDO1FBRWxELE9BQU8sQ0FBQyxHQUFHLENBQUMsc0NBQXNDLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUV4RSxzQ0FBc0M7UUFDdEMsTUFBTSxlQUFlLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRXBFLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFFMUQsMkJBQTJCO1FBQzNCLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUMxRCxNQUFNLGFBQWEsR0FBRyxHQUFHLE1BQU0sSUFBSSxTQUFTLGtCQUFrQixDQUFDO1FBQy9ELE1BQU0sSUFBSSxHQUFHLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNoRCxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQ1gsSUFBSSw0QkFBZ0IsQ0FBQztZQUNuQixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUI7WUFDckMsR0FBRyxFQUFFLGFBQWE7WUFDbEIsSUFBSSxFQUFFLGdCQUFnQjtZQUN0QixXQUFXLEVBQUUsV0FBVztZQUN4QixRQUFRLEVBQUU7Z0JBQ1IsSUFBSTtnQkFDSixRQUFRLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUU7Z0JBQzNDLFVBQVUsRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLFFBQVEsRUFBRTthQUMzQztTQUNGLENBQUMsQ0FDSCxDQUFDO1FBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQ0FBZ0MsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUU3RCw4Q0FBOEM7UUFDOUMsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLElBQUEsbUNBQVksRUFDNUMsRUFBRSxFQUNGLElBQUksNEJBQWdCLENBQUM7WUFDbkIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCO1lBQ3JDLEdBQUcsRUFBRSxhQUFhO1NBQ25CLENBQUMsRUFDRixFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FDckIsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMseUNBQXlDLENBQUMsQ0FBQztRQUV2RCwwQ0FBMEM7UUFDMUMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7WUFDbkMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNqQyxDQUFDO1FBRUQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLElBQUksRUFBRSxDQUFDO0lBQ3ZDLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6RCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDO0FBRUQ7Ozs7R0FJRztBQUNILEtBQUssVUFBVSxpQkFBaUIsQ0FDOUIsa0JBQTRCO0lBRTVCLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0RBQXNELENBQUMsQ0FBQztJQUVwRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFDRCxJQUFJLGtCQUFrQixDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUNwQyxPQUFPLENBQUMsR0FBRyxDQUFDLHNDQUFzQyxDQUFDLENBQUM7UUFDcEQsT0FBTyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMvQixDQUFDO0lBRUQseUVBQXlFO0lBQ3pFLE1BQU0sQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDO1FBQ2hELE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1RCxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7S0FDN0QsQ0FBQyxDQUFDO0lBRUgsTUFBTSxhQUFhLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDM0QsT0FBTyxDQUFDLEdBQUcsQ0FDVCxtQkFBbUIsRUFDbkIsa0JBQWtCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNoQyxHQUFHLEVBQUUsQ0FBQztRQUNOLElBQUksRUFBRSxDQUFDO1FBQ1AsUUFBUSxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLFFBQVEsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDO0tBQ3hCLENBQUMsQ0FBQyxDQUNKLENBQUM7SUFFRixNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0lBRWxFLE9BQU8sSUFBSSxPQUFPLENBQVMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDN0MsTUFBTSxPQUFPLEdBQUcsVUFBVSxDQUFDLEdBQUcsRUFBRTtZQUM5QixPQUFPLENBQUMsS0FBSyxDQUFDLGlEQUFpRCxDQUFDLENBQUM7WUFDakUsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQztRQUNwRCxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQztRQUVuQixNQUFNLEdBQUcsR0FBRyxNQUFNLEVBQUUsQ0FBQztRQUNyQixrQkFBa0IsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVoRCxrRkFBa0Y7UUFDbEYsaUZBQWlGO1FBQ2pGLE1BQU0sUUFBUSxHQUFhLEVBQUUsQ0FBQztRQUM5QixNQUFNLFFBQVEsR0FBYSxFQUFFLENBQUM7UUFFOUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLGtCQUFrQixDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ25ELFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3RELElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ2xCLFFBQVEsQ0FBQyxJQUFJLENBQ1gsSUFBSSxDQUFDLDREQUE0RCxDQUFDLEdBQUcsQ0FDdEUsQ0FBQztZQUNKLENBQUM7aUJBQU0sQ0FBQztnQkFDTixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDcEMsUUFBUSxDQUFDLElBQUksQ0FDWCxzQ0FBc0MsQ0FBQyxDQUFDLE9BQU8sQ0FDN0MsQ0FBQyxDQUNGLDBCQUEwQixDQUFDLEdBQUcsQ0FDaEMsQ0FBQztZQUNKLENBQUM7UUFDSCxDQUFDO1FBRUQsTUFBTSxZQUFZLEdBQUcsRUFBYyxDQUFDO1FBQ3BDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNuRCxZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdEMsQ0FBQztRQUVELE1BQU0sV0FBVyxHQUFHO1lBQ2xCLEdBQUcsUUFBUTtZQUNYLEdBQUcsUUFBUTtZQUNYLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsWUFDdEIsa0JBQWtCLENBQUMsTUFDckIsZ0JBQWdCO1NBQ2pCLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRVosT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUUvQyxHQUFHO2FBQ0EsYUFBYSxDQUFDLFdBQVcsQ0FBQzthQUMxQixhQUFhLENBQUM7WUFDYixNQUFNO1lBQ04sS0FBSztZQUNMLE1BQU07WUFDTixLQUFLO1lBQ0wsTUFBTTtZQUNOLFNBQVM7WUFDVCxTQUFTO1lBQ1QsVUFBVTtZQUNWLE1BQU07WUFDTixJQUFJO1lBQ0osVUFBVTtZQUNWLFNBQVM7WUFDVCxNQUFNO1lBQ04sS0FBSztZQUNMLE1BQU07WUFDTixNQUFNO1lBQ04sS0FBSztZQUNMLE9BQU87WUFDUCxXQUFXO1lBQ1gsWUFBWTtZQUNaLFFBQVE7WUFDUixHQUFHO1lBQ0gsVUFBVTtZQUNWLEdBQUc7U0FDSixDQUFDO1lBQ0Ysa0ZBQWtGO2FBQ2pGLGFBQWEsQ0FBQyxDQUFDLElBQUksRUFBRSxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDL0MsTUFBTSxDQUFDLGVBQWUsQ0FBQzthQUN2QixFQUFFLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRTtZQUNkLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN0QixPQUFPLENBQUMsR0FBRyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7WUFDdEQsaUNBQWlDO1lBQ2pDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsRUFBRSxFQUFFO2dCQUN2QyxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDO29CQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDekQsQ0FBQyxDQUFDLENBQUM7WUFDSCxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDM0IsQ0FBQyxDQUFDO2FBQ0QsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLEdBQVUsRUFBRSxFQUFFO1lBQzFCLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN0QixPQUFPLENBQUMsS0FBSyxDQUFDLCtCQUErQixFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ3BELE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNkLENBQUMsQ0FBQzthQUNELEdBQUcsRUFBRSxDQUFDO0lBQ1gsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQ7Ozs7Ozs7Ozs7O0dBV0c7QUFDSCxLQUFLLFVBQVUsWUFBWSxDQUN6QixTQUF1QixFQUN2QixTQUE4QixFQUM5QixZQUFpQyxFQUNqQyxhQUFxQixFQUNyQixNQUFjLEVBQ2QsU0FBaUIsRUFDakIsVUFBVSxHQUFHLEtBQUs7SUFFbEIsZ0RBQWdEO0lBQ2hELE1BQU0sWUFBWSxHQUFHLFNBQVMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFDN0QsTUFBTSxPQUFPLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQztJQUV6RSxPQUFPLENBQUMsR0FBRyxDQUNULHVCQUF1QixhQUFhLFNBQVMsT0FBTyx1Q0FBdUMsQ0FDNUYsQ0FBQztJQUVGLHNCQUFzQjtJQUN0QixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxTQUFTLGFBQWEsWUFBWSxDQUFDLENBQUM7SUFDN0UsTUFBTSxXQUFXLEdBQUcsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUMvQixJQUFJLDRCQUFnQixDQUFDO1FBQ25CLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QjtRQUMzQyxHQUFHLEVBQUUsU0FBUyxDQUFDLEdBQUc7S0FDbkIsQ0FBQyxDQUNILENBQUM7SUFDRixNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUM3QixNQUFNLFdBQVcsQ0FBQyxJQUFLLENBQUMsb0JBQW9CLEVBQUUsQ0FDL0MsQ0FBQztJQUNGLEVBQUUsQ0FBQyxhQUFhLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBRXpDLHNCQUFzQjtJQUN0QixJQUFJLFNBQVMsR0FBa0IsSUFBSSxDQUFDO0lBQ3BDLElBQUksU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDO1FBQ25CLFNBQVMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxTQUFTLGFBQWEsWUFBWSxDQUFDLENBQUM7UUFDdkUsTUFBTSxXQUFXLEdBQUcsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUMvQixJQUFJLDRCQUFnQixDQUFDO1lBQ25CLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QjtZQUMzQyxHQUFHLEVBQUUsU0FBUyxDQUFDLEdBQUc7U0FDbkIsQ0FBQyxDQUNILENBQUM7UUFDRixNQUFNLFdBQVcsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUM3QixNQUFNLFdBQVcsQ0FBQyxJQUFLLENBQUMsb0JBQW9CLEVBQUUsQ0FDL0MsQ0FBQztRQUNGLEVBQUUsQ0FBQyxhQUFhLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFRCx5QkFBeUI7SUFDekIsSUFBSSxZQUFZLEdBQWtCLElBQUksQ0FBQztJQUN2QyxJQUFJLFlBQVksRUFBRSxHQUFHLEVBQUUsQ0FBQztRQUN0QixZQUFZLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FDdEIsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUNYLFNBQVMsYUFBYSxlQUFlLENBQ3RDLENBQUM7UUFDRixNQUFNLGNBQWMsR0FBRyxNQUFNLEVBQUUsQ0FBQyxJQUFJLENBQ2xDLElBQUksNEJBQWdCLENBQUM7WUFDbkIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCO1lBQzNDLEdBQUcsRUFBRSxZQUFZLENBQUMsR0FBRztTQUN0QixDQUFDLENBQ0gsQ0FBQztRQUNGLE1BQU0sY0FBYyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQ2hDLE1BQU0sY0FBYyxDQUFDLElBQUssQ0FBQyxvQkFBb0IsRUFBRSxDQUNsRCxDQUFDO1FBQ0YsRUFBRSxDQUFDLGFBQWEsQ0FBQyxZQUFZLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFDakQsQ0FBQztJQUVELGtEQUFrRDtJQUNsRCxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQ2pDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFDWCxTQUFTLGFBQWEsZUFBZSxDQUN0QyxDQUFDO0lBRUYsT0FBTyxJQUFJLE9BQU8sQ0FBUyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUM3QyxNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQzlCLE9BQU8sQ0FBQyxLQUFLLENBQ1gsNkJBQTZCLGFBQWEsa0JBQWtCLENBQzdELENBQUM7WUFDRixNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsMkJBQTJCLGFBQWEsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNoRSxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLG1CQUFtQjtRQUV0QyxNQUFNLE9BQU8sR0FBRyxNQUFNLEVBQUUsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFMUMsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNmLG9FQUFvRTtZQUNwRSxpRUFBaUU7WUFDakUscUVBQXFFO1lBQ3JFLDBDQUEwQztZQUMxQyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDL0MsQ0FBQztRQUVELElBQUksU0FBUyxFQUFFLENBQUM7WUFDZCxPQUFPLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3pCLE9BQU8sQ0FBQyxhQUFhLENBQUM7Z0JBQ3BCLE1BQU07Z0JBQ04sT0FBTztnQkFDUCxNQUFNO2dCQUNOLEtBQUs7Z0JBQ0wsTUFBTTtnQkFDTixNQUFNO2dCQUNOLFdBQVc7Z0JBQ1gsTUFBTTthQUNQLENBQUMsQ0FBQztRQUNMLENBQUM7UUFFRCxPQUFPLENBQUMsYUFBYSxDQUFDO1lBQ3BCLE1BQU07WUFDTixPQUFPO1lBQ1AsTUFBTTtZQUNOLFNBQVM7WUFDVCxTQUFTO1lBQ1QsV0FBVztZQUNYLE1BQU07WUFDTixJQUFJO1lBQ0osVUFBVTtZQUNWLFNBQVM7WUFDVCxRQUFRO1lBQ1IsR0FBRztZQUNILFVBQVU7WUFDVixHQUFHO1lBQ0gsV0FBVztTQUNaLENBQUMsQ0FBQztRQUVILE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0NBQWdDLEVBQUUsT0FBTyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFFdkUsb0NBQW9DO1FBQ3BDLElBQUksWUFBWSxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztZQUNoRCxNQUFNLGNBQWMsR0FBRyxPQUFPLFlBQVksc0JBQXNCLENBQUM7WUFDakUsT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDLEtBQUssRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFFRCxPQUFPO2FBQ0osTUFBTSxDQUFDLGlCQUFpQixDQUFDO2FBQ3pCLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDcEIsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3RCLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxhQUFhLHlCQUF5QixDQUFDLENBQUM7WUFFL0QsaURBQWlEO1lBQ2pELElBQUksQ0FBQztnQkFDSCxNQUFNLG1CQUFtQixHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsaUJBQWlCLENBQUMsQ0FBQztnQkFDL0QsTUFBTSxnQkFBZ0IsR0FBRyxHQUFHLE1BQU0sSUFBSSxTQUFTLFVBQVUsYUFBYSxlQUFlLENBQUM7Z0JBRXRGLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FDWCxJQUFJLDRCQUFnQixDQUFDO29CQUNuQixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUI7b0JBQzNDLEdBQUcsRUFBRSxnQkFBZ0I7b0JBQ3JCLElBQUksRUFBRSxtQkFBbUI7b0JBQ3pCLFdBQVcsRUFBRSxXQUFXO2lCQUN6QixDQUFDLENBQ0gsQ0FBQztnQkFFRixPQUFPLENBQUMsR0FBRyxDQUNULFlBQVksYUFBYSxTQUFTLE9BQU8sZ0NBQWdDLGdCQUFnQixFQUFFLENBQzVGLENBQUM7WUFDSixDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDZixPQUFPLENBQUMsSUFBSSxDQUNWLG9DQUFvQyxhQUFhLFNBQVMsT0FBTyxVQUFVLEVBQzNFLEtBQUssQ0FDTixDQUFDO1lBQ0osQ0FBQztZQUVELGtDQUFrQztZQUNsQyxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDO2dCQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDdkQsSUFBSSxTQUFTLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUM7Z0JBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNwRSxJQUFJLFlBQVksSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQztnQkFDN0MsRUFBRSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUU5QixPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUM3QixDQUFDLENBQUM7YUFDRCxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsR0FBVSxFQUFFLEVBQUU7WUFDMUIsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3RCLE9BQU8sQ0FBQyxLQUFLLENBQUMsMkJBQTJCLGFBQWEsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQ2hFLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNkLENBQUMsQ0FBQzthQUNELEdBQUcsRUFBRSxDQUFDO0lBQ1gsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgUzNDbGllbnQsXG4gIEdldE9iamVjdENvbW1hbmQsXG4gIFB1dE9iamVjdENvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgeyBnZXRTaWduZWRVcmwgfSBmcm9tICdAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lcic7XG5pbXBvcnQgeyBNYW5pZmVzdCwgTWFuaWZlc3RTY2VuZSB9IGZyb20gJy4uL3R5cGVzL3MzVHlwZXMnO1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgVXNlckl0ZW0gfSBmcm9tICcuL3VzZXInO1xuXG5jb25zdCBmZm1wZWcgPSByZXF1aXJlKCdmbHVlbnQtZmZtcGVnJyk7XG5cbi8vIC0tLSBIZWxwZXJzIGZvciBjb25jYXQgcmVsaWFiaWxpdHkgLS0tXG5mdW5jdGlvbiBwcm9iZUR1cmF0aW9uKGZpbGVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcj4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcbiAgICBmZm1wZWcuZmZwcm9iZShmaWxlUGF0aCwgKGVycjogRXJyb3IgfCBudWxsLCBkYXRhOiBhbnkpID0+IHtcbiAgICAgIGlmIChlcnIpIHJldHVybiByZXNvbHZlKDApO1xuICAgICAgY29uc3QgZHVyID0gTnVtYmVyKGRhdGE/LmZvcm1hdD8uZHVyYXRpb24gPz8gMCk7XG4gICAgICByZXNvbHZlKE51bWJlci5pc0Zpbml0ZShkdXIpID8gZHVyIDogMCk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBwcm9iZUhhc0F1ZGlvKGZpbGVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG4gICAgZmZtcGVnLmZmcHJvYmUoZmlsZVBhdGgsIChlcnI6IEVycm9yIHwgbnVsbCwgZGF0YTogYW55KSA9PiB7XG4gICAgICBpZiAoZXJyKSByZXR1cm4gcmVzb2x2ZShmYWxzZSk7XG4gICAgICBjb25zdCBzdHJlYW1zID0gZGF0YT8uc3RyZWFtcyB8fCBbXTtcbiAgICAgIHJlc29sdmUoc3RyZWFtcy5zb21lKChzOiBhbnkpID0+IHMuY29kZWNfdHlwZSA9PT0gJ2F1ZGlvJykpO1xuICAgIH0pO1xuICB9KTtcbn1cblxuLy8gUzMgZmlsZSBvYmplY3QgaW50ZXJmYWNlXG5pbnRlcmZhY2UgUzNGaWxlT2JqZWN0IHtcbiAgS2V5OiBzdHJpbmc7XG59XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjZW5lIHtcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgbmFycmF0aW9uOiBzdHJpbmc7XG4gIGlkOiBudW1iZXI7IC8vIEFkZCBpZCBwcm9wZXJ0eVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYmluZVZpZGVvQW5kQXVkaW8oXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgbWFuaWZlc3Q6IE1hbmlmZXN0LFxuICByZW1vdmVkU2NlbmVzOiBudW1iZXJbXSA9IFtdLFxuICB1c2VyOiBVc2VySXRlbSB8IG51bGwsXG4pOiBQcm9taXNlPHsgZmluYWxWaWRlb1NpZ25lZFVybDogc3RyaW5nOyBzaXplOiBzdHJpbmcgfT4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+OrCBDb21iaW5pbmcgdmlkZW8sIGF1ZGlvLCBhbmQgc3VidGl0bGVzIHNjZW5lIGJ5IHNjZW5lIGZvciB1c2VyOicsXG4gICAgdXNlcklkLFxuICApO1xuXG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coXG4gICAgICAn8J+UjSBVc2luZyBtYW5pZmVzdCBmb3Igc2NlbmUgb3JkZXJpbmc6JyxcbiAgICAgIG1hbmlmZXN0LnNjZW5lcy5sZW5ndGgsXG4gICAgICAnc2NlbmVzJyxcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKCfwn5SNIFJlbW92ZWQgc2NlbmVzIHRvIGV4Y2x1ZGU6JywgcmVtb3ZlZFNjZW5lcyk7XG5cbiAgICBpZiAoIW1hbmlmZXN0LnNjZW5lcyB8fCBtYW5pZmVzdC5zY2VuZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHNjZW5lcyBmb3VuZCBpbiBtYW5pZmVzdCcpO1xuICAgIH1cblxuICAgIC8vIEZpbHRlciBvdXQgcmVtb3ZlZCBzY2VuZXMgYW5kIHNvcnQgYnkgc2NlbmVQb3NpdGlvbiB0byBlbnN1cmUgcHJvcGVyIG9yZGVyXG4gICAgY29uc3QgZmlsdGVyZWRTY2VuZXMgPSBtYW5pZmVzdC5zY2VuZXMuZmlsdGVyKChzY2VuZTogTWFuaWZlc3RTY2VuZSkgPT4ge1xuICAgICAgY29uc3QgaXNSZW1vdmVkID0gcmVtb3ZlZFNjZW5lcy5pbmNsdWRlcyhzY2VuZS5pZCk7XG4gICAgICBpZiAoaXNSZW1vdmVkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGDwn5qrIEV4Y2x1ZGluZyByZW1vdmVkIHNjZW5lIElEOiAke3NjZW5lLmlkfSAocG9zaXRpb246ICR7c2NlbmUuc2NlbmVQb3NpdGlvbn0pYCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAhaXNSZW1vdmVkO1xuICAgIH0pO1xuXG4gICAgY29uc3Qgc29ydGVkU2NlbmVzID0gZmlsdGVyZWRTY2VuZXMuc29ydChcbiAgICAgIChhOiBNYW5pZmVzdFNjZW5lLCBiOiBNYW5pZmVzdFNjZW5lKSA9PiBhLnNjZW5lUG9zaXRpb24gLSBiLnNjZW5lUG9zaXRpb24sXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgJ/CflI0gU29ydGVkIHNjZW5lcyBieSBzY2VuZVBvc2l0aW9uOicsXG4gICAgICBzb3J0ZWRTY2VuZXMubWFwKChzOiBNYW5pZmVzdFNjZW5lKSA9PiAoe1xuICAgICAgICBzY2VuZVBvc2l0aW9uOiBzLnNjZW5lUG9zaXRpb24sXG4gICAgICAgIGhhc1ZpZGVvOiAhIXMuZmlsZXM/Lm1wNCxcbiAgICAgICAgaGFzQXVkaW86ICEhcy5maWxlcz8ubXAzLFxuICAgICAgICBoYXNTdWJ0aXRsZTogISFzLmZpbGVzPy5hc3MsXG4gICAgICB9KSksXG4gICAgKTtcblxuICAgIC8vIFByb2Nlc3MgYWxsIHNjZW5lcyBpbiBwYXJhbGxlbDogY29tYmluZSB2aWRlbyArIGF1ZGlvICsgc3VidGl0bGVcbiAgICBjb25zdCBzY2VuZVByb2Nlc3NpbmdQcm9taXNlcyA9IHNvcnRlZFNjZW5lcy5tYXAoXG4gICAgICBhc3luYyAoc2NlbmU6IE1hbmlmZXN0U2NlbmUsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICBjb25zdCBzY2VuZVBvc2l0aW9uID0gc2NlbmUuc2NlbmVQb3NpdGlvbjtcblxuICAgICAgICAvLyBDcmVhdGUgZmlsZSBvYmplY3RzIGJhc2VkIG9uIG1hbmlmZXN0XG4gICAgICAgIC8vIEV4dHJhY3QgUzMga2V5IGZyb20gVVJMIGlmIGl0J3MgYSBmdWxsIFVSTCwgb3RoZXJ3aXNlIHVzZSBhcy1pc1xuICAgICAgICBjb25zdCBleHRyYWN0UzNLZXkgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgICAgICAgIGlmICh1cmwuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKSkge1xuICAgICAgICAgICAgLy8gRXh0cmFjdCBrZXkgZnJvbSBTMyBVUkxcbiAgICAgICAgICAgIGNvbnN0IHVybFBhcnRzID0gdXJsLnNwbGl0KCcvJyk7XG4gICAgICAgICAgICByZXR1cm4gdXJsUGFydHMuc2xpY2UoMykuam9pbignLycpOyAvLyBSZW1vdmUgYnVja2V0IGFuZCBkb21haW4gcGFydHNcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHVybDtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCB2aWRlb0ZpbGUgPSBzY2VuZS5maWxlcz8ubXA0XG4gICAgICAgICAgPyB7IEtleTogZXh0cmFjdFMzS2V5KHNjZW5lLmZpbGVzLm1wNCkgfVxuICAgICAgICAgIDogbnVsbDtcbiAgICAgICAgY29uc3QgYXVkaW9GaWxlID0gc2NlbmUuZmlsZXM/Lm1wM1xuICAgICAgICAgID8geyBLZXk6IGV4dHJhY3RTM0tleShzY2VuZS5maWxlcy5tcDMpIH1cbiAgICAgICAgICA6IG51bGw7XG4gICAgICAgIGNvbnN0IHN1YnRpdGxlRmlsZSA9IHNjZW5lLmZpbGVzPy5hc3NcbiAgICAgICAgICA/IHsgS2V5OiBleHRyYWN0UzNLZXkoc2NlbmUuZmlsZXMuYXNzKSB9XG4gICAgICAgICAgOiBudWxsO1xuXG4gICAgICAgIGlmICghdmlkZW9GaWxlPy5LZXkpIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICBg4pqg77iPIE5vIHZpZGVvIGZpbGUgZm91bmQgZm9yIHNjZW5lIGF0IHBvc2l0aW9uICR7c2NlbmVQb3NpdGlvbn1gLFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYXdhaXQgcHJvY2Vzc1NjZW5lKFxuICAgICAgICAgIHZpZGVvRmlsZSxcbiAgICAgICAgICBhdWRpb0ZpbGUsXG4gICAgICAgICAgc3VidGl0bGVGaWxlLFxuICAgICAgICAgIHNjZW5lUG9zaXRpb24sXG4gICAgICAgICAgdXNlcklkLFxuICAgICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgICBzY2VuZS5hbmltYXRlZCxcbiAgICAgICAgKTtcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IGNvbWJpbmVkU2NlbmVQYXRocyA9IChcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKHNjZW5lUHJvY2Vzc2luZ1Byb21pc2VzKVxuICAgICkuZmlsdGVyKChwYXRoKTogcGF0aCBpcyBzdHJpbmcgPT4gcGF0aCAhPT0gbnVsbCk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+UjSBzY2VuZVByb2Nlc3NpbmdQcm9taXNlcyBmaW5pc2hlZDonLCBjb21iaW5lZFNjZW5lUGF0aHMpO1xuXG4gICAgLy8gTm93IGNvbmNhdGVuYXRlIGFsbCBjb21iaW5lZCBzY2VuZXNcbiAgICBjb25zdCBmaW5hbE91dHB1dFBhdGggPSBhd2FpdCBjb25jYXRlbmF0ZVNjZW5lcyhjb21iaW5lZFNjZW5lUGF0aHMpO1xuXG4gICAgY29uc29sZS5sb2coJ/CflI0gZmluYWxPdXRwdXRQYXRoIHN0YXJ0OicsIGZpbmFsT3V0cHV0UGF0aCk7XG5cbiAgICAvLyBVcGxvYWQgZmluYWwgdmlkZW8gdG8gUzNcbiAgICBjb25zdCBmaW5hbFZpZGVvQnVmZmVyID0gZnMucmVhZEZpbGVTeW5jKGZpbmFsT3V0cHV0UGF0aCk7XG4gICAgY29uc3QgZmluYWxWaWRlb0tleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LWZpbmFsLXZpZGVvLm1wNGA7XG4gICAgY29uc3Qgc2l6ZSA9IGZpbmFsVmlkZW9CdWZmZXIubGVuZ3RoLnRvU3RyaW5nKCk7XG4gICAgYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiBmaW5hbFZpZGVvS2V5LFxuICAgICAgICBCb2R5OiBmaW5hbFZpZGVvQnVmZmVyLFxuICAgICAgICBDb250ZW50VHlwZTogJ3ZpZGVvL21wNCcsXG4gICAgICAgIE1ldGFkYXRhOiB7XG4gICAgICAgICAgc2l6ZSxcbiAgICAgICAgICBkdXJhdGlvbjogbWFuaWZlc3QudG90YWxEdXJhdGlvbi50b1N0cmluZygpLFxuICAgICAgICAgIHNjZW5lQ291bnQ6IG1hbmlmZXN0LnNjZW5lQ291bnQudG9TdHJpbmcoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+SviBGaW5hbCB2aWRlbyB1cGxvYWRlZCB0byBTMzonLCBmaW5hbFZpZGVvS2V5KTtcblxuICAgIC8vIEdlbmVyYXRlIHByZS1zaWduZWQgVVJMIGZvciB0aGUgZmluYWwgdmlkZW9cbiAgICBjb25zdCBmaW5hbFZpZGVvU2lnbmVkVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKFxuICAgICAgczMsXG4gICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fQlVDS0VUX05BTUUsXG4gICAgICAgIEtleTogZmluYWxWaWRlb0tleSxcbiAgICAgIH0pLFxuICAgICAgeyBleHBpcmVzSW46IDM2MDAwIH0sIC8vIDEwIGhvdXJzIGV4cGlyYXRpb25cbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/CflJcgRmluYWwgdmlkZW8gcHJlLXNpZ25lZCBVUkwgZ2VuZXJhdGVkJyk7XG5cbiAgICAvLyBDbGVhbiB1cCB0aGUgdGVtcG9yYXJ5IGZpbmFsIHZpZGVvIGZpbGVcbiAgICBpZiAoZnMuZXhpc3RzU3luYyhmaW5hbE91dHB1dFBhdGgpKSB7XG4gICAgICBmcy51bmxpbmtTeW5jKGZpbmFsT3V0cHV0UGF0aCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHsgZmluYWxWaWRlb1NpZ25lZFVybCwgc2l6ZSB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBjb21iaW5lVmlkZW9BbmRBdWRpbzonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuLyoqXG4gKiBDb25jYXRlbmF0ZXMgbXVsdGlwbGUgdmlkZW8gc2NlbmUgZmlsZXMgaW50byBhIHNpbmdsZSBmaW5hbCB2aWRlb1xuICogQHBhcmFtIGNvbWJpbmVkU2NlbmVQYXRocyBBcnJheSBvZiBwYXRocyB0byBjb21iaW5lZCBzY2VuZSB2aWRlbyBmaWxlc1xuICogQHJldHVybnMgUGF0aCB0byB0aGUgZmluYWwgY29uY2F0ZW5hdGVkIHZpZGVvIGZpbGVcbiAqL1xuYXN5bmMgZnVuY3Rpb24gY29uY2F0ZW5hdGVTY2VuZXMoXG4gIGNvbWJpbmVkU2NlbmVQYXRoczogc3RyaW5nW10sXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zb2xlLmxvZygn8J+OrCBDb25jYXRlbmF0aW5nIGFsbCBjb21iaW5lZCBzY2VuZXMgKGZpbHRlciBncmFwaCnigKYnKTtcblxuICBpZiAoIWNvbWJpbmVkU2NlbmVQYXRocy5sZW5ndGgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGNvbWJpbmVkIHNjZW5lIHBhdGhzIHByb3ZpZGVkJyk7XG4gIH1cbiAgaWYgKGNvbWJpbmVkU2NlbmVQYXRocy5sZW5ndGggPT09IDEpIHtcbiAgICBjb25zb2xlLmxvZygn4oS577iPIE9ubHkgb25lIHNjZW5lIOKAlCBza2lwcGluZyBjb25jYXQuJyk7XG4gICAgcmV0dXJuIGNvbWJpbmVkU2NlbmVQYXRoc1swXTtcbiAgfVxuXG4gIC8vIFByb2JlIGR1cmF0aW9ucyBhbmQgYXVkaW8gcHJlc2VuY2Ugc28gd2UgY2FuIGNyZWF0ZSBjb25zaXN0ZW50IHN0cmVhbXNcbiAgY29uc3QgW2R1cmF0aW9ucywgYXVkaW9GbGFnc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgUHJvbWlzZS5hbGwoY29tYmluZWRTY2VuZVBhdGhzLm1hcCgocCkgPT4gcHJvYmVEdXJhdGlvbihwKSkpLFxuICAgIFByb21pc2UuYWxsKGNvbWJpbmVkU2NlbmVQYXRocy5tYXAoKHApID0+IHByb2JlSGFzQXVkaW8ocCkpKSxcbiAgXSk7XG5cbiAgY29uc3QgdG90YWxEdXJhdGlvbiA9IGR1cmF0aW9ucy5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKTtcbiAgY29uc29sZS5sb2coXG4gICAgJ+KPse+4jyBDb25jYXQgaW5wdXRzOicsXG4gICAgY29tYmluZWRTY2VuZVBhdGhzLm1hcCgocCwgaSkgPT4gKHtcbiAgICAgIGlkeDogaSxcbiAgICAgIHBhdGg6IHAsXG4gICAgICBkdXJhdGlvbjogTnVtYmVyKGR1cmF0aW9uc1tpXS50b0ZpeGVkKDMpKSxcbiAgICAgIGhhc0F1ZGlvOiBhdWRpb0ZsYWdzW2ldLFxuICAgIH0pKSxcbiAgKTtcblxuICBjb25zdCBmaW5hbE91dHB1dFBhdGggPSBwYXRoLmpvaW4ob3MudG1wZGlyKCksICdmaW5hbC12aWRlby5tcDQnKTtcblxuICByZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIFRpbWVvdXQgY29uY2F0ZW5hdGluZyBzY2VuZXMgYWZ0ZXIgMTAgbWludXRlcycpO1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcignVGltZW91dCBjb25jYXRlbmF0aW5nIHNjZW5lcycpKTtcbiAgICB9LCAxMCAqIDYwICogMTAwMCk7XG5cbiAgICBjb25zdCBjbWQgPSBmZm1wZWcoKTtcbiAgICBjb21iaW5lZFNjZW5lUGF0aHMuZm9yRWFjaCgocCkgPT4gY21kLmlucHV0KHApKTtcblxuICAgIC8vIEJ1aWxkIGZpbHRlciBncmFwaDogZm9yIGVhY2ggaW5wdXQsIHJlc2V0IFBUUzsgZW5zdXJlIGFuIGF1ZGlvIHN0cmVhbSBleGlzdHMgYnlcbiAgICAvLyBnZW5lcmF0aW5nIHBlci1zZWdtZW50IHNpbGVudCBhdWRpbyB3aGVuIG1pc3Npbmc7IHRoZW4gY29uY2F0IGRlY29kZWQgc3RyZWFtcy5cbiAgICBjb25zdCB2ZkNoYWluczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBhZkNoYWluczogc3RyaW5nW10gPSBbXTtcblxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgY29tYmluZWRTY2VuZVBhdGhzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2ZkNoYWlucy5wdXNoKGBbJHtpfTp2OjBdc2V0cHRzPVBUUy1TVEFSVFBUU1t2JHtpfV1gKTtcbiAgICAgIGlmIChhdWRpb0ZsYWdzW2ldKSB7XG4gICAgICAgIGFmQ2hhaW5zLnB1c2goXG4gICAgICAgICAgYFske2l9OmE6MF1hc2V0cHRzPVBUUy1TVEFSVFBUUyxhcmVzYW1wbGU9YXN5bmM9MTpmaXJzdF9wdHM9MFthJHtpfV1gLFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgZCA9IE1hdGgubWF4KDAsIGR1cmF0aW9uc1tpXSk7XG4gICAgICAgIGFmQ2hhaW5zLnB1c2goXG4gICAgICAgICAgYGFudWxsc3JjPXI9NDgwMDA6Y2w9c3RlcmVvLGF0cmltPTA6JHtkLnRvRml4ZWQoXG4gICAgICAgICAgICAzLFxuICAgICAgICAgICl9LGFzZXRwdHM9UFRTLVNUQVJUUFRTW2Eke2l9XWAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgY29uY2F0SW5wdXRzID0gW10gYXMgc3RyaW5nW107XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBjb21iaW5lZFNjZW5lUGF0aHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbmNhdElucHV0cy5wdXNoKGBbdiR7aX1dW2Eke2l9XWApO1xuICAgIH1cblxuICAgIGNvbnN0IGZpbHRlckdyYXBoID0gW1xuICAgICAgLi4udmZDaGFpbnMsXG4gICAgICAuLi5hZkNoYWlucyxcbiAgICAgIGAke2NvbmNhdElucHV0cy5qb2luKCcnKX1jb25jYXQ9bj0ke1xuICAgICAgICBjb21iaW5lZFNjZW5lUGF0aHMubGVuZ3RoXG4gICAgICB9OnY9MTphPTFbdl1bYV1gLFxuICAgIF0uam9pbignOycpO1xuXG4gICAgY29uc29sZS5sb2coJ/Cfp6kgZmlsdGVyX2NvbXBsZXg6JywgZmlsdGVyR3JhcGgpO1xuXG4gICAgY21kXG4gICAgICAuY29tcGxleEZpbHRlcihmaWx0ZXJHcmFwaClcbiAgICAgIC5vdXRwdXRPcHRpb25zKFtcbiAgICAgICAgJy1tYXAnLFxuICAgICAgICAnW3ZdJyxcbiAgICAgICAgJy1tYXAnLFxuICAgICAgICAnW2FdJyxcbiAgICAgICAgJy1jOnYnLFxuICAgICAgICAnbGlieDI2NCcsXG4gICAgICAgICctcHJlc2V0JyxcbiAgICAgICAgJ3ZlcnlmYXN0JyxcbiAgICAgICAgJy1jcmYnLFxuICAgICAgICAnMjMnLFxuICAgICAgICAnLXBpeF9mbXQnLFxuICAgICAgICAneXV2NDIwcCcsXG4gICAgICAgICctYzphJyxcbiAgICAgICAgJ2FhYycsXG4gICAgICAgICctYjphJyxcbiAgICAgICAgJzE5MmsnLFxuICAgICAgICAnLWFyJyxcbiAgICAgICAgJzQ4MDAwJyxcbiAgICAgICAgJy1tb3ZmbGFncycsXG4gICAgICAgICcrZmFzdHN0YXJ0JyxcbiAgICAgICAgJy12c3luYycsXG4gICAgICAgICcyJyxcbiAgICAgICAgJy10aHJlYWRzJyxcbiAgICAgICAgJzAnLFxuICAgICAgXSlcbiAgICAgIC8vIEZvcmNlIG91dHB1dCBsb25nIGVub3VnaCB0byBjb3ZlciBhbGwgc2VnbWVudHMgKGd1YXJkIGFnYWluc3Qgc3RyYXkgdGltZXN0YW1wcylcbiAgICAgIC5vdXRwdXRPcHRpb25zKFsnLXQnLCB0b3RhbER1cmF0aW9uLnRvRml4ZWQoMyldKVxuICAgICAgLm91dHB1dChmaW5hbE91dHB1dFBhdGgpXG4gICAgICAub24oJ2VuZCcsICgpID0+IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICBjb25zb2xlLmxvZygn4pyFIEFsbCBzY2VuZXMgY29uY2F0ZW5hdGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgICAgICAvLyBDbGVhbiB1cCB0ZW1wb3Jhcnkgc2NlbmUgZmlsZXNcbiAgICAgICAgY29tYmluZWRTY2VuZVBhdGhzLmZvckVhY2goKHNjZW5lUGF0aCkgPT4ge1xuICAgICAgICAgIGlmIChmcy5leGlzdHNTeW5jKHNjZW5lUGF0aCkpIGZzLnVubGlua1N5bmMoc2NlbmVQYXRoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlc29sdmUoZmluYWxPdXRwdXRQYXRoKTtcbiAgICAgIH0pXG4gICAgICAub24oJ2Vycm9yJywgKGVycjogRXJyb3IpID0+IHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgY29uY2F0ZW5hdGluZyBzY2VuZXM6JywgZXJyKTtcbiAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICB9KVxuICAgICAgLnJ1bigpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBQcm9jZXNzZXMgYSBzaW5nbGUgc2NlbmUgYnkgY29tYmluaW5nIHZpZGVvLCBhdWRpbywgYW5kIHN1YnRpdGxlIGZpbGVzXG4gKiBAcGFyYW0gdmlkZW9GaWxlIFMzIG9iamVjdCBjb250YWluaW5nIHZpZGVvIGZpbGUgaW5mb1xuICogQHBhcmFtIGF1ZGlvRmlsZSBTMyBvYmplY3QgY29udGFpbmluZyBhdWRpbyBmaWxlIGluZm8gKG9wdGlvbmFsKVxuICogQHBhcmFtIHN1YnRpdGxlRmlsZSBTMyBvYmplY3QgY29udGFpbmluZyBzdWJ0aXRsZSBmaWxlIGluZm8gKG9wdGlvbmFsKVxuICogQHBhcmFtIHNjZW5lUG9zaXRpb24gSW5kZXggb2YgdGhlIHNjZW5lIGJlaW5nIHByb2Nlc3NlZFxuICogQHBhcmFtIHVzZXJJZCBVc2VyIElEIGZvciBTMyBvcGVyYXRpb25zXG4gKiBAcGFyYW0gdGltZXN0YW1wIFRpbWVzdGFtcCBmb3IgUzMgb3BlcmF0aW9uc1xuICogQHBhcmFtIGlzQW5pbWF0ZWQgV2hldGhlciB0aGlzIHNjZW5lJ3MgdmlkZW8gaXMgYSBmaXhlZC1sZW5ndGggUnVud2F5XG4gKiAgIGFuaW1hdGlvbiBjbGlwIHRoYXQgc2hvdWxkIGxvb3AgdG8gY292ZXIgdGhlIGZ1bGwgYXVkaW8gZHVyYXRpb25cbiAqIEByZXR1cm5zIFBhdGggdG8gdGhlIGNvbWJpbmVkIHNjZW5lIGZpbGVcbiAqL1xuYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1NjZW5lKFxuICB2aWRlb0ZpbGU6IFMzRmlsZU9iamVjdCxcbiAgYXVkaW9GaWxlOiBTM0ZpbGVPYmplY3QgfCBudWxsLFxuICBzdWJ0aXRsZUZpbGU6IFMzRmlsZU9iamVjdCB8IG51bGwsXG4gIHNjZW5lUG9zaXRpb246IG51bWJlcixcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBpc0FuaW1hdGVkID0gZmFsc2UsXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICAvLyBFeHRyYWN0IHRoZSBhY3R1YWwgc2NlbmUgSUQgZnJvbSB0aGUgZmlsZW5hbWVcbiAgY29uc3Qgc2NlbmVJZE1hdGNoID0gdmlkZW9GaWxlLktleS5tYXRjaCgvc2NlbmUtKFxcZCspXFwubXA0Lyk7XG4gIGNvbnN0IHNjZW5lSWQgPSBzY2VuZUlkTWF0Y2ggPyBwYXJzZUludChzY2VuZUlkTWF0Y2hbMV0pIDogc2NlbmVQb3NpdGlvbjtcblxuICBjb25zb2xlLmxvZyhcbiAgICBg8J+OrCBQcm9jZXNzaW5nIHNjZW5lICR7c2NlbmVQb3NpdGlvbn0gKElEOiAke3NjZW5lSWR9KTogY29tYmluaW5nIHZpZGVvICsgYXVkaW8gKyBzdWJ0aXRsZWAsXG4gICk7XG5cbiAgLy8gRG93bmxvYWQgdmlkZW8gZmlsZVxuICBjb25zdCB2aWRlb1BhdGggPSBwYXRoLmpvaW4ob3MudG1wZGlyKCksIGBzY2VuZS0ke3NjZW5lUG9zaXRpb259LXZpZGVvLm1wNGApO1xuICBjb25zdCB2aWRlb09iamVjdCA9IGF3YWl0IHMzLnNlbmQoXG4gICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgIEtleTogdmlkZW9GaWxlLktleSxcbiAgICB9KSxcbiAgKTtcbiAgY29uc3QgdmlkZW9CdWZmZXIgPSBCdWZmZXIuZnJvbShcbiAgICBhd2FpdCB2aWRlb09iamVjdC5Cb2R5IS50cmFuc2Zvcm1Ub0J5dGVBcnJheSgpLFxuICApO1xuICBmcy53cml0ZUZpbGVTeW5jKHZpZGVvUGF0aCwgdmlkZW9CdWZmZXIpO1xuXG4gIC8vIERvd25sb2FkIGF1ZGlvIGZpbGVcbiAgbGV0IGF1ZGlvUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGlmIChhdWRpb0ZpbGU/LktleSkge1xuICAgIGF1ZGlvUGF0aCA9IHBhdGguam9pbihvcy50bXBkaXIoKSwgYHNjZW5lLSR7c2NlbmVQb3NpdGlvbn0tYXVkaW8ubXAzYCk7XG4gICAgY29uc3QgYXVkaW9PYmplY3QgPSBhd2FpdCBzMy5zZW5kKFxuICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IGF1ZGlvRmlsZS5LZXksXG4gICAgICB9KSxcbiAgICApO1xuICAgIGNvbnN0IGF1ZGlvQnVmZmVyID0gQnVmZmVyLmZyb20oXG4gICAgICBhd2FpdCBhdWRpb09iamVjdC5Cb2R5IS50cmFuc2Zvcm1Ub0J5dGVBcnJheSgpLFxuICAgICk7XG4gICAgZnMud3JpdGVGaWxlU3luYyhhdWRpb1BhdGgsIGF1ZGlvQnVmZmVyKTtcbiAgfVxuXG4gIC8vIERvd25sb2FkIHN1YnRpdGxlIGZpbGVcbiAgbGV0IHN1YnRpdGxlUGF0aDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGlmIChzdWJ0aXRsZUZpbGU/LktleSkge1xuICAgIHN1YnRpdGxlUGF0aCA9IHBhdGguam9pbihcbiAgICAgIG9zLnRtcGRpcigpLFxuICAgICAgYHNjZW5lLSR7c2NlbmVQb3NpdGlvbn0tc3VidGl0bGUuYXNzYCxcbiAgICApO1xuICAgIGNvbnN0IHN1YnRpdGxlT2JqZWN0ID0gYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiBzdWJ0aXRsZUZpbGUuS2V5LFxuICAgICAgfSksXG4gICAgKTtcbiAgICBjb25zdCBzdWJ0aXRsZUJ1ZmZlciA9IEJ1ZmZlci5mcm9tKFxuICAgICAgYXdhaXQgc3VidGl0bGVPYmplY3QuQm9keSEudHJhbnNmb3JtVG9CeXRlQXJyYXkoKSxcbiAgICApO1xuICAgIGZzLndyaXRlRmlsZVN5bmMoc3VidGl0bGVQYXRoLCBzdWJ0aXRsZUJ1ZmZlcik7XG4gIH1cblxuICAvLyBDb21iaW5lIHZpZGVvICsgYXVkaW8gKyBzdWJ0aXRsZSBmb3IgdGhpcyBzY2VuZVxuICBjb25zdCBjb21iaW5lZFNjZW5lUGF0aCA9IHBhdGguam9pbihcbiAgICBvcy50bXBkaXIoKSxcbiAgICBgc2NlbmUtJHtzY2VuZVBvc2l0aW9ufS1jb21iaW5lZC5tcDRgLFxuICApO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICBg4p2MIFRpbWVvdXQgY29tYmluaW5nIHNjZW5lICR7c2NlbmVQb3NpdGlvbn0gYWZ0ZXIgNSBtaW51dGVzYCxcbiAgICAgICk7XG4gICAgICByZWplY3QobmV3IEVycm9yKGBUaW1lb3V0IGNvbWJpbmluZyBzY2VuZSAke3NjZW5lUG9zaXRpb259YCkpO1xuICAgIH0sIDUgKiA2MCAqIDEwMDApOyAvLyA1IG1pbnV0ZSB0aW1lb3V0XG5cbiAgICBjb25zdCBjb21tYW5kID0gZmZtcGVnKCkuaW5wdXQodmlkZW9QYXRoKTtcblxuICAgIGlmIChpc0FuaW1hdGVkKSB7XG4gICAgICAvLyBBbmltYXRlZCBzY2VuZXMgaGF2ZSBhIGZpeGVkLWxlbmd0aCBSdW53YXkgY2xpcCAoZS5nLiA1cykgdGhhdCBpc1xuICAgICAgLy8gb2Z0ZW4gc2hvcnRlciB0aGFuIHRoZSBuYXJyYXRpb24g4oCUIGxvb3AgaXQgaW5kZWZpbml0ZWx5IHNvIHRoZVxuICAgICAgLy8gLXNob3J0ZXN0IG91dHB1dCBvcHRpb24gYmVsb3cgdHJpbXMgaXQgdG8gZXhhY3RseSB0aGUgYXVkaW8gbGVuZ3RoXG4gICAgICAvLyBpbnN0ZWFkIG9mIHRoZSBhdWRpbyBnZXR0aW5nIGN1dCBzaG9ydC5cbiAgICAgIGNvbW1hbmQuaW5wdXRPcHRpb25zKFsnLXN0cmVhbV9sb29wJywgJy0xJ10pO1xuICAgIH1cblxuICAgIGlmIChhdWRpb1BhdGgpIHtcbiAgICAgIGNvbW1hbmQuaW5wdXQoYXVkaW9QYXRoKTtcbiAgICAgIGNvbW1hbmQub3V0cHV0T3B0aW9ucyhbXG4gICAgICAgICctbWFwJyxcbiAgICAgICAgJzE6YTowJyxcbiAgICAgICAgJy1jOmEnLFxuICAgICAgICAnYWFjJyxcbiAgICAgICAgJy1iOmEnLFxuICAgICAgICAnMTI4aycsXG4gICAgICAgICctZmlsdGVyOmEnLFxuICAgICAgICAnYXBhZCcsXG4gICAgICBdKTtcbiAgICB9XG5cbiAgICBjb21tYW5kLm91dHB1dE9wdGlvbnMoW1xuICAgICAgJy1tYXAnLFxuICAgICAgJzA6djowJyxcbiAgICAgICctYzp2JyxcbiAgICAgICdsaWJ4MjY0JyxcbiAgICAgICctcHJlc2V0JyxcbiAgICAgICd1bHRyYWZhc3QnLFxuICAgICAgJy1jcmYnLFxuICAgICAgJzI4JyxcbiAgICAgICctcGl4X2ZtdCcsXG4gICAgICAneXV2NDIwcCcsXG4gICAgICAnLXZzeW5jJyxcbiAgICAgICcxJyxcbiAgICAgICctdGhyZWFkcycsXG4gICAgICAnMCcsXG4gICAgICAnLXNob3J0ZXN0JyxcbiAgICBdKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn5SNIGNvbW1hbmQgb3V0cHV0IG9wdGlvbnMgbmV3OicsIGNvbW1hbmQub3V0cHV0T3B0aW9ucygpKTtcblxuICAgIC8vIEFkZCBzdWJ0aXRsZSBvdmVybGF5IGlmIGF2YWlsYWJsZVxuICAgIGlmIChzdWJ0aXRsZVBhdGggJiYgZnMuZXhpc3RzU3luYyhzdWJ0aXRsZVBhdGgpKSB7XG4gICAgICBjb25zdCBzdWJ0aXRsZUZpbHRlciA9IGBhc3M9JHtzdWJ0aXRsZVBhdGh9OmZvbnRzZGlyPS9vcHQvZm9udHNgO1xuICAgICAgY29tbWFuZC5vdXRwdXRPcHRpb25zKFsnLXZmJywgc3VidGl0bGVGaWx0ZXJdKTtcbiAgICB9XG5cbiAgICBjb21tYW5kXG4gICAgICAub3V0cHV0KGNvbWJpbmVkU2NlbmVQYXRoKVxuICAgICAgLm9uKCdlbmQnLCBhc3luYyAoKSA9PiB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgY29uc29sZS5sb2coYOKchSBTY2VuZSAke3NjZW5lUG9zaXRpb259IGNvbWJpbmVkIHN1Y2Nlc3NmdWxseSFgKTtcblxuICAgICAgICAvLyBTYXZlIGNvbWJpbmVkIHNjZW5lIHRvIFMzIGZvciB0ZXN0aW5nIHB1cnBvc2VzXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29tYmluZWRTY2VuZUJ1ZmZlciA9IGZzLnJlYWRGaWxlU3luYyhjb21iaW5lZFNjZW5lUGF0aCk7XG4gICAgICAgICAgY29uc3QgY29tYmluZWRTY2VuZUtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmVQb3NpdGlvbn0tY29tYmluZWQubXA0YDtcblxuICAgICAgICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICAgICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgICAgIEtleTogY29tYmluZWRTY2VuZUtleSxcbiAgICAgICAgICAgICAgQm9keTogY29tYmluZWRTY2VuZUJ1ZmZlcixcbiAgICAgICAgICAgICAgQ29udGVudFR5cGU6ICd2aWRlby9tcDQnLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYPCfkr4gU2NlbmUgJHtzY2VuZVBvc2l0aW9ufSAoSUQ6ICR7c2NlbmVJZH0pIGNvbWJpbmVkIGZpbGUgc2F2ZWQgdG8gUzM6ICR7Y29tYmluZWRTY2VuZUtleX1gLFxuICAgICAgICAgICk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgYOKaoO+4jyBDb3VsZCBub3Qgc2F2ZSBjb21iaW5lZCBzY2VuZSAke3NjZW5lUG9zaXRpb259IChJRDogJHtzY2VuZUlkfSkgdG8gUzM6YCxcbiAgICAgICAgICAgIGVycm9yLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDbGVhbiB1cCBpbmRpdmlkdWFsIHNjZW5lIGZpbGVzXG4gICAgICAgIGlmIChmcy5leGlzdHNTeW5jKHZpZGVvUGF0aCkpIGZzLnVubGlua1N5bmModmlkZW9QYXRoKTtcbiAgICAgICAgaWYgKGF1ZGlvUGF0aCAmJiBmcy5leGlzdHNTeW5jKGF1ZGlvUGF0aCkpIGZzLnVubGlua1N5bmMoYXVkaW9QYXRoKTtcbiAgICAgICAgaWYgKHN1YnRpdGxlUGF0aCAmJiBmcy5leGlzdHNTeW5jKHN1YnRpdGxlUGF0aCkpXG4gICAgICAgICAgZnMudW5saW5rU3luYyhzdWJ0aXRsZVBhdGgpO1xuXG4gICAgICAgIHJlc29sdmUoY29tYmluZWRTY2VuZVBhdGgpO1xuICAgICAgfSlcbiAgICAgIC5vbignZXJyb3InLCAoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBjb21iaW5pbmcgc2NlbmUgJHtzY2VuZVBvc2l0aW9ufTpgLCBlcnIpO1xuICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgIH0pXG4gICAgICAucnVuKCk7XG4gIH0pO1xufVxuIl19