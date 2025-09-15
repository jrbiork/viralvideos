"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.combineVideoAndAudio = combineVideoAndAudio;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ffmpeg = require('fluent-ffmpeg');
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
async function combineVideoAndAudio(userId, timestamp, manifest, removedScenes = []) {
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
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: process.env.VIDEO_BUCKET_NAME,
            Key: finalVideoKey,
            Body: finalVideoBuffer,
            ContentType: 'video/mp4',
            Metadata: {
                size: finalVideoBuffer.length.toString(),
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
        return finalVideoSignedUrl;
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
        const command = ffmpeg()
            .input(videoPath)
            .inputOptions(['-async', '1', '-itsoffset', '0']);
        if (audioPath) {
            command.input(audioPath);
        }
        command.outputOptions([
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-crf',
            '28',
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
            '-threads',
            '0',
        ]);
        if (audioPath) {
            command.outputOptions(['-map', '1:a:0']);
        }
        // Add subtitle overlay if available
        if (subtitlePath && fs.existsSync(subtitlePath)) {
            const subtitleFilter = `ass=${subtitlePath}:fontsdir=/opt/fonts`;
            command.outputOptions(['-vf', subtitleFilter]);
        }
        command
            .output(combinedScenePath)
            .on('end', async () => {
            clearTimeout(timeout);
            console.log(`✅ Scene ${scenePosition} combined successfully`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9Db21iaW5lci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZpZGVvQ29tYmluZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUE2QkEsb0RBaUpDO0FBOUtELGtEQUs0QjtBQUM1Qix3RUFBNkQ7QUFHN0QseUJBQXlCO0FBQ3pCLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFFN0IsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBT3hDLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFTckQsS0FBSyxVQUFVLG9CQUFvQixDQUN4QyxNQUFjLEVBQ2QsU0FBaUIsRUFDakIsUUFBa0IsRUFDbEIsZ0JBQTBCLEVBQUU7SUFFNUIsT0FBTyxDQUFDLEdBQUcsQ0FDVCxtRUFBbUUsRUFDbkUsTUFBTSxDQUNQLENBQUM7SUFFRixJQUFJLENBQUM7UUFDSCxPQUFPLENBQUMsR0FBRyxDQUNULHVDQUF1QyxFQUN2QyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFDdEIsUUFBUSxDQUNULENBQUM7UUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBRTVELElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxJQUFJLFFBQVEsQ0FBQyxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3JELE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBRUQsNkVBQTZFO1FBQzdFLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBb0IsRUFBRSxFQUFFO1lBQ3JFLE1BQU0sU0FBUyxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ25ELElB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TyxDQUFDLElBQUksQ0FDVixvQ0FBb0MsYUFBYSxTQUFTLE9BQU8sVUFBVSxFQUMzRSxLQUFLLENBQ04sQ0FBQztZQUNKLENBQUM7WUFFRCxrQ0FBa0M7WUFDbEMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQztnQkFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3ZELElBQUksU0FBUyxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDO2dCQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDcEUsSUFBSSxZQUFZLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUM7Z0JBQzdDLEVBQUUsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUM7WUFFOUIsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDN0IsQ0FBQyxDQUFDO2FBQ0QsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLEdBQVUsRUFBRSxFQUFFO1lBQzFCLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN0QixPQUFPLENBQUMsS0FBSyxDQUFDLDJCQUEyQixhQUFhLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUNoRSxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDZCxDQUFDLENBQUM7YUFDRCxHQUFHLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIFMzQ2xpZW50LFxuICBMaXN0T2JqZWN0c1YyQ29tbWFuZCxcbiAgR2V0T2JqZWN0Q29tbWFuZCxcbiAgUHV0T2JqZWN0Q29tbWFuZCxcbn0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcbmltcG9ydCB7IGdldFNpZ25lZFVybCB9IGZyb20gJ0Bhd3Mtc2RrL3MzLXJlcXVlc3QtcHJlc2lnbmVyJztcbmltcG9ydCB7IE1hbmlmZXN0LCBNYW5pZmVzdFNjZW5lIH0gZnJvbSAnLi4vdHlwZXMvczNUeXBlcyc7XG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyB1cGRhdGVNYW5pZmVzdCB9IGZyb20gJy4uL3V0aWxzL21hbmlmZXN0VXRpbHMnO1xuY29uc3QgZmZtcGVnID0gcmVxdWlyZSgnZmx1ZW50LWZmbXBlZycpO1xuXG4vLyBTMyBmaWxlIG9iamVjdCBpbnRlcmZhY2VcbmludGVyZmFjZSBTM0ZpbGVPYmplY3Qge1xuICBLZXk6IHN0cmluZztcbn1cblxuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjsgLy8gQWRkIGlkIHByb3BlcnR5XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21iaW5lVmlkZW9BbmRBdWRpbyhcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBtYW5pZmVzdDogTWFuaWZlc3QsXG4gIHJlbW92ZWRTY2VuZXM6IG51bWJlcltdID0gW10sXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+OrCBDb21iaW5pbmcgdmlkZW8sIGF1ZGlvLCBhbmQgc3VidGl0bGVzIHNjZW5lIGJ5IHNjZW5lIGZvciB1c2VyOicsXG4gICAgdXNlcklkLFxuICApO1xuXG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coXG4gICAgICAn8J+UjSBVc2luZyBtYW5pZmVzdCBmb3Igc2NlbmUgb3JkZXJpbmc6JyxcbiAgICAgIG1hbmlmZXN0LnNjZW5lcy5sZW5ndGgsXG4gICAgICAnc2NlbmVzJyxcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKCfwn5SNIFJlbW92ZWQgc2NlbmVzIHRvIGV4Y2x1ZGU6JywgcmVtb3ZlZFNjZW5lcyk7XG5cbiAgICBpZiAoIW1hbmlmZXN0LnNjZW5lcyB8fCBtYW5pZmVzdC5zY2VuZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHNjZW5lcyBmb3VuZCBpbiBtYW5pZmVzdCcpO1xuICAgIH1cblxuICAgIC8vIEZpbHRlciBvdXQgcmVtb3ZlZCBzY2VuZXMgYW5kIHNvcnQgYnkgc2NlbmVQb3NpdGlvbiB0byBlbnN1cmUgcHJvcGVyIG9yZGVyXG4gICAgY29uc3QgZmlsdGVyZWRTY2VuZXMgPSBtYW5pZmVzdC5zY2VuZXMuZmlsdGVyKChzY2VuZTogTWFuaWZlc3RTY2VuZSkgPT4ge1xuICAgICAgY29uc3QgaXNSZW1vdmVkID0gcmVtb3ZlZFNjZW5lcy5pbmNsdWRlcyhzY2VuZS5pZCk7XG4gICAgICBpZiAoaXNSZW1vdmVkKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGDwn5qrIEV4Y2x1ZGluZyByZW1vdmVkIHNjZW5lIElEOiAke3NjZW5lLmlkfSAocG9zaXRpb246ICR7c2NlbmUuc2NlbmVQb3NpdGlvbn0pYCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAhaXNSZW1vdmVkO1xuICAgIH0pO1xuXG4gICAgY29uc3Qgc29ydGVkU2NlbmVzID0gZmlsdGVyZWRTY2VuZXMuc29ydChcbiAgICAgIChhOiBNYW5pZmVzdFNjZW5lLCBiOiBNYW5pZmVzdFNjZW5lKSA9PiBhLnNjZW5lUG9zaXRpb24gLSBiLnNjZW5lUG9zaXRpb24sXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgJ/CflI0gU29ydGVkIHNjZW5lcyBieSBzY2VuZVBvc2l0aW9uOicsXG4gICAgICBzb3J0ZWRTY2VuZXMubWFwKChzOiBNYW5pZmVzdFNjZW5lKSA9PiAoe1xuICAgICAgICBzY2VuZVBvc2l0aW9uOiBzLnNjZW5lUG9zaXRpb24sXG4gICAgICAgIGhhc1ZpZGVvOiAhIXMuZmlsZXM/Lm1wNCxcbiAgICAgICAgaGFzQXVkaW86ICEhcy5maWxlcz8ubXAzLFxuICAgICAgICBoYXNTdWJ0aXRsZTogISFzLmZpbGVzPy5hc3MsXG4gICAgICB9KSksXG4gICAgKTtcblxuICAgIC8vIFByb2Nlc3MgYWxsIHNjZW5lcyBpbiBwYXJhbGxlbDogY29tYmluZSB2aWRlbyArIGF1ZGlvICsgc3VidGl0bGVcbiAgICBjb25zdCBzY2VuZVByb2Nlc3NpbmdQcm9taXNlcyA9IHNvcnRlZFNjZW5lcy5tYXAoXG4gICAgICBhc3luYyAoc2NlbmU6IE1hbmlmZXN0U2NlbmUsIGk6IG51bWJlcikgPT4ge1xuICAgICAgICBjb25zdCBzY2VuZVBvc2l0aW9uID0gc2NlbmUuc2NlbmVQb3NpdGlvbjtcblxuICAgICAgICAvLyBDcmVhdGUgZmlsZSBvYmplY3RzIGJhc2VkIG9uIG1hbmlmZXN0XG4gICAgICAgIC8vIEV4dHJhY3QgUzMga2V5IGZyb20gVVJMIGlmIGl0J3MgYSBmdWxsIFVSTCwgb3RoZXJ3aXNlIHVzZSBhcy1pc1xuICAgICAgICBjb25zdCBleHRyYWN0UzNLZXkgPSAodXJsOiBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICAgICAgICAgIGlmICh1cmwuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKSkge1xuICAgICAgICAgICAgLy8gRXh0cmFjdCBrZXkgZnJvbSBTMyBVUkxcbiAgICAgICAgICAgIGNvbnN0IHVybFBhcnRzID0gdXJsLnNwbGl0KCcvJyk7XG4gICAgICAgICAgICByZXR1cm4gdXJsUGFydHMuc2xpY2UoMykuam9pbignLycpOyAvLyBSZW1vdmUgYnVja2V0IGFuZCBkb21haW4gcGFydHNcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHVybDtcbiAgICAgICAgfTtcblxuICAgICAgICBjb25zdCB2aWRlb0ZpbGUgPSBzY2VuZS5maWxlcz8ubXA0XG4gICAgICAgICAgPyB7IEtleTogZXh0cmFjdFMzS2V5KHNjZW5lLmZpbGVzLm1wNCkgfVxuICAgICAgICAgIDogbnVsbDtcbiAgICAgICAgY29uc3QgYXVkaW9GaWxlID0gc2NlbmUuZmlsZXM/Lm1wM1xuICAgICAgICAgID8geyBLZXk6IGV4dHJhY3RTM0tleShzY2VuZS5maWxlcy5tcDMpIH1cbiAgICAgICAgICA6IG51bGw7XG4gICAgICAgIGNvbnN0IHN1YnRpdGxlRmlsZSA9IHNjZW5lLmZpbGVzPy5hc3NcbiAgICAgICAgICA/IHsgS2V5OiBleHRyYWN0UzNLZXkoc2NlbmUuZmlsZXMuYXNzKSB9XG4gICAgICAgICAgOiBudWxsO1xuXG4gICAgICAgIGlmICghdmlkZW9GaWxlPy5LZXkpIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICBg4pqg77iPIE5vIHZpZGVvIGZpbGUgZm91bmQgZm9yIHNjZW5lIGF0IHBvc2l0aW9uICR7c2NlbmVQb3NpdGlvbn1gLFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYXdhaXQgcHJvY2Vzc1NjZW5lKFxuICAgICAgICAgIHZpZGVvRmlsZSxcbiAgICAgICAgICBhdWRpb0ZpbGUsXG4gICAgICAgICAgc3VidGl0bGVGaWxlLFxuICAgICAgICAgIHNjZW5lUG9zaXRpb24sXG4gICAgICAgICAgdXNlcklkLFxuICAgICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgKTtcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIGNvbnN0IGNvbWJpbmVkU2NlbmVQYXRocyA9IChcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKHNjZW5lUHJvY2Vzc2luZ1Byb21pc2VzKVxuICAgICkuZmlsdGVyKChwYXRoKTogcGF0aCBpcyBzdHJpbmcgPT4gcGF0aCAhPT0gbnVsbCk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+UjSBzY2VuZVByb2Nlc3NpbmdQcm9taXNlcyBmaW5pc2hlZDonLCBjb21iaW5lZFNjZW5lUGF0aHMpO1xuXG4gICAgLy8gTm93IGNvbmNhdGVuYXRlIGFsbCBjb21iaW5lZCBzY2VuZXNcbiAgICBjb25zdCBmaW5hbE91dHB1dFBhdGggPSBhd2FpdCBjb25jYXRlbmF0ZVNjZW5lcyhjb21iaW5lZFNjZW5lUGF0aHMpO1xuXG4gICAgY29uc29sZS5sb2coJ/CflI0gZmluYWxPdXRwdXRQYXRoIHN0YXJ0OicsIGZpbmFsT3V0cHV0UGF0aCk7XG5cbiAgICAvLyBVcGxvYWQgZmluYWwgdmlkZW8gdG8gUzNcbiAgICBjb25zdCBmaW5hbFZpZGVvQnVmZmVyID0gZnMucmVhZEZpbGVTeW5jKGZpbmFsT3V0cHV0UGF0aCk7XG4gICAgY29uc3QgZmluYWxWaWRlb0tleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LWZpbmFsLXZpZGVvLm1wNGA7XG5cbiAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IGZpbmFsVmlkZW9LZXksXG4gICAgICAgIEJvZHk6IGZpbmFsVmlkZW9CdWZmZXIsXG4gICAgICAgIENvbnRlbnRUeXBlOiAndmlkZW8vbXA0JyxcbiAgICAgICAgTWV0YWRhdGE6IHtcbiAgICAgICAgICBzaXplOiBmaW5hbFZpZGVvQnVmZmVyLmxlbmd0aC50b1N0cmluZygpLFxuICAgICAgICAgIGR1cmF0aW9uOiBtYW5pZmVzdC50b3RhbER1cmF0aW9uLnRvU3RyaW5nKCksXG4gICAgICAgICAgc2NlbmVDb3VudDogbWFuaWZlc3Quc2NlbmVDb3VudC50b1N0cmluZygpLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn5K+IEZpbmFsIHZpZGVvIHVwbG9hZGVkIHRvIFMzOicsIGZpbmFsVmlkZW9LZXkpO1xuXG4gICAgLy8gR2VuZXJhdGUgcHJlLXNpZ25lZCBVUkwgZm9yIHRoZSBmaW5hbCB2aWRlb1xuICAgIGNvbnN0IGZpbmFsVmlkZW9TaWduZWRVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoXG4gICAgICBzMyxcbiAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiBmaW5hbFZpZGVvS2V5LFxuICAgICAgfSksXG4gICAgICB7IGV4cGlyZXNJbjogMzYwMDAgfSwgLy8gMTAgaG91cnMgZXhwaXJhdGlvblxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+UlyBGaW5hbCB2aWRlbyBwcmUtc2lnbmVkIFVSTCBnZW5lcmF0ZWQnKTtcblxuICAgIC8vIENsZWFuIHVwIHRoZSB0ZW1wb3JhcnkgZmluYWwgdmlkZW8gZmlsZVxuICAgIGlmIChmcy5leGlzdHNTeW5jKGZpbmFsT3V0cHV0UGF0aCkpIHtcbiAgICAgIGZzLnVubGlua1N5bmMoZmluYWxPdXRwdXRQYXRoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmluYWxWaWRlb1NpZ25lZFVybDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gY29tYmluZVZpZGVvQW5kQXVkaW86JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbi8qKlxuICogQ29uY2F0ZW5hdGVzIG11bHRpcGxlIHZpZGVvIHNjZW5lIGZpbGVzIGludG8gYSBzaW5nbGUgZmluYWwgdmlkZW9cbiAqIEBwYXJhbSBjb21iaW5lZFNjZW5lUGF0aHMgQXJyYXkgb2YgcGF0aHMgdG8gY29tYmluZWQgc2NlbmUgdmlkZW8gZmlsZXNcbiAqIEByZXR1cm5zIFBhdGggdG8gdGhlIGZpbmFsIGNvbmNhdGVuYXRlZCB2aWRlbyBmaWxlXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGNvbmNhdGVuYXRlU2NlbmVzKFxuICBjb21iaW5lZFNjZW5lUGF0aHM6IHN0cmluZ1tdLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgY29uc29sZS5sb2coJ/CfjqwgQ29uY2F0ZW5hdGluZyBhbGwgY29tYmluZWQgc2NlbmVzLi4uJyk7XG5cbiAgY29uc3QgZmlsZUxpc3RQYXRoID0gcGF0aC5qb2luKG9zLnRtcGRpcigpLCAnY29tYmluZWQtc2NlbmVzLWZpbGVsaXN0LnR4dCcpO1xuICBjb25zdCBmaWxlTGlzdENvbnRlbnQgPSBjb21iaW5lZFNjZW5lUGF0aHNcbiAgICAubWFwKChzY2VuZVBhdGgpID0+IGBmaWxlICcke3NjZW5lUGF0aH0nYClcbiAgICAuam9pbignXFxuJyk7XG4gIGZzLndyaXRlRmlsZVN5bmMoZmlsZUxpc3RQYXRoLCBmaWxlTGlzdENvbnRlbnQpO1xuXG4gIGNvbnN0IGZpbmFsT3V0cHV0UGF0aCA9IHBhdGguam9pbihvcy50bXBkaXIoKSwgJ2ZpbmFsLXZpZGVvLm1wNCcpO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgVGltZW91dCBjb25jYXRlbmF0aW5nIHNjZW5lcyBhZnRlciAxMCBtaW51dGVzJyk7XG4gICAgICByZWplY3QobmV3IEVycm9yKCdUaW1lb3V0IGNvbmNhdGVuYXRpbmcgc2NlbmVzJykpO1xuICAgIH0sIDEwICogNjAgKiAxMDAwKTsgLy8gMTAgbWludXRlIHRpbWVvdXRcblxuICAgIGZmbXBlZygpXG4gICAgICAuaW5wdXQoZmlsZUxpc3RQYXRoKVxuICAgICAgLmlucHV0T3B0aW9ucyhbJy1mJywgJ2NvbmNhdCcsICctc2FmZScsICcwJ10pXG4gICAgICAub3V0cHV0T3B0aW9ucyhbXG4gICAgICAgICctYzp2JyxcbiAgICAgICAgJ2xpYngyNjQnLFxuICAgICAgICAnLXByZXNldCcsXG4gICAgICAgICd2ZXJ5ZmFzdCcsXG4gICAgICAgICctY3JmJyxcbiAgICAgICAgJzIzJyxcbiAgICAgICAgJy1waXhfZm10JyxcbiAgICAgICAgJ3l1djQyMHAnLFxuICAgICAgICAnLWM6YScsXG4gICAgICAgICdhYWMnLFxuICAgICAgICAnLWI6YScsXG4gICAgICAgICcxMjhrJyxcbiAgICAgICAgJy10aHJlYWRzJyxcbiAgICAgICAgJzAnLFxuICAgICAgXSlcbiAgICAgIC5vdXRwdXQoZmluYWxPdXRwdXRQYXRoKVxuICAgICAgLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgY29uc29sZS5sb2coJ+KchSBBbGwgc2NlbmVzIGNvbmNhdGVuYXRlZCBzdWNjZXNzZnVsbHknKTtcblxuICAgICAgICAvLyBDbGVhbiB1cCB0ZW1wb3JhcnkgZmlsZXNcbiAgICAgICAgY29tYmluZWRTY2VuZVBhdGhzLmZvckVhY2goKHNjZW5lUGF0aCkgPT4ge1xuICAgICAgICAgIGlmIChmcy5leGlzdHNTeW5jKHNjZW5lUGF0aCkpIGZzLnVubGlua1N5bmMoc2NlbmVQYXRoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChmcy5leGlzdHNTeW5jKGZpbGVMaXN0UGF0aCkpIGZzLnVubGlua1N5bmMoZmlsZUxpc3RQYXRoKTtcblxuICAgICAgICByZXNvbHZlKGZpbmFsT3V0cHV0UGF0aCk7XG4gICAgICB9KVxuICAgICAgLm9uKCdlcnJvcicsIChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGNvbmNhdGVuYXRpbmcgc2NlbmVzOicsIGVycik7XG4gICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgfSlcbiAgICAgIC5ydW4oKTtcbiAgfSk7XG59XG5cbi8qKlxuICogUHJvY2Vzc2VzIGEgc2luZ2xlIHNjZW5lIGJ5IGNvbWJpbmluZyB2aWRlbywgYXVkaW8sIGFuZCBzdWJ0aXRsZSBmaWxlc1xuICogQHBhcmFtIHZpZGVvRmlsZSBTMyBvYmplY3QgY29udGFpbmluZyB2aWRlbyBmaWxlIGluZm9cbiAqIEBwYXJhbSBhdWRpb0ZpbGUgUzMgb2JqZWN0IGNvbnRhaW5pbmcgYXVkaW8gZmlsZSBpbmZvIChvcHRpb25hbClcbiAqIEBwYXJhbSBzdWJ0aXRsZUZpbGUgUzMgb2JqZWN0IGNvbnRhaW5pbmcgc3VidGl0bGUgZmlsZSBpbmZvIChvcHRpb25hbClcbiAqIEBwYXJhbSBzY2VuZVBvc2l0aW9uIEluZGV4IG9mIHRoZSBzY2VuZSBiZWluZyBwcm9jZXNzZWRcbiAqIEBwYXJhbSB1c2VySWQgVXNlciBJRCBmb3IgUzMgb3BlcmF0aW9uc1xuICogQHBhcmFtIHRpbWVzdGFtcCBUaW1lc3RhbXAgZm9yIFMzIG9wZXJhdGlvbnNcbiAqIEByZXR1cm5zIFBhdGggdG8gdGhlIGNvbWJpbmVkIHNjZW5lIGZpbGVcbiAqL1xuYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1NjZW5lKFxuICB2aWRlb0ZpbGU6IFMzRmlsZU9iamVjdCxcbiAgYXVkaW9GaWxlOiBTM0ZpbGVPYmplY3QgfCBudWxsLFxuICBzdWJ0aXRsZUZpbGU6IFMzRmlsZU9iamVjdCB8IG51bGwsXG4gIHNjZW5lUG9zaXRpb246IG51bWJlcixcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgLy8gRXh0cmFjdCB0aGUgYWN0dWFsIHNjZW5lIElEIGZyb20gdGhlIGZpbGVuYW1lXG4gIGNvbnN0IHNjZW5lSWRNYXRjaCA9IHZpZGVvRmlsZS5LZXkubWF0Y2goL3NjZW5lLShcXGQrKVxcLm1wNC8pO1xuICBjb25zdCBzY2VuZUlkID0gc2NlbmVJZE1hdGNoID8gcGFyc2VJbnQoc2NlbmVJZE1hdGNoWzFdKSA6IHNjZW5lUG9zaXRpb247XG5cbiAgY29uc29sZS5sb2coXG4gICAgYPCfjqwgUHJvY2Vzc2luZyBzY2VuZSAke3NjZW5lUG9zaXRpb259IChJRDogJHtzY2VuZUlkfSk6IGNvbWJpbmluZyB2aWRlbyArIGF1ZGlvICsgc3VidGl0bGVgLFxuICApO1xuXG4gIC8vIERvd25sb2FkIHZpZGVvIGZpbGVcbiAgY29uc3QgdmlkZW9QYXRoID0gcGF0aC5qb2luKG9zLnRtcGRpcigpLCBgc2NlbmUtJHtzY2VuZVBvc2l0aW9ufS12aWRlby5tcDRgKTtcbiAgY29uc3QgdmlkZW9PYmplY3QgPSBhd2FpdCBzMy5zZW5kKFxuICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICBLZXk6IHZpZGVvRmlsZS5LZXksXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IHZpZGVvQnVmZmVyID0gQnVmZmVyLmZyb20oXG4gICAgYXdhaXQgdmlkZW9PYmplY3QuQm9keSEudHJhbnNmb3JtVG9CeXRlQXJyYXkoKSxcbiAgKTtcbiAgZnMud3JpdGVGaWxlU3luYyh2aWRlb1BhdGgsIHZpZGVvQnVmZmVyKTtcblxuICAvLyBEb3dubG9hZCBhdWRpbyBmaWxlXG4gIGxldCBhdWRpb1BhdGg6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBpZiAoYXVkaW9GaWxlPy5LZXkpIHtcbiAgICBhdWRpb1BhdGggPSBwYXRoLmpvaW4ob3MudG1wZGlyKCksIGBzY2VuZS0ke3NjZW5lUG9zaXRpb259LWF1ZGlvLm1wM2ApO1xuICAgIGNvbnN0IGF1ZGlvT2JqZWN0ID0gYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiBhdWRpb0ZpbGUuS2V5LFxuICAgICAgfSksXG4gICAgKTtcbiAgICBjb25zdCBhdWRpb0J1ZmZlciA9IEJ1ZmZlci5mcm9tKFxuICAgICAgYXdhaXQgYXVkaW9PYmplY3QuQm9keSEudHJhbnNmb3JtVG9CeXRlQXJyYXkoKSxcbiAgICApO1xuICAgIGZzLndyaXRlRmlsZVN5bmMoYXVkaW9QYXRoLCBhdWRpb0J1ZmZlcik7XG4gIH1cblxuICAvLyBEb3dubG9hZCBzdWJ0aXRsZSBmaWxlXG4gIGxldCBzdWJ0aXRsZVBhdGg6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBpZiAoc3VidGl0bGVGaWxlPy5LZXkpIHtcbiAgICBzdWJ0aXRsZVBhdGggPSBwYXRoLmpvaW4oXG4gICAgICBvcy50bXBkaXIoKSxcbiAgICAgIGBzY2VuZS0ke3NjZW5lUG9zaXRpb259LXN1YnRpdGxlLmFzc2AsXG4gICAgKTtcbiAgICBjb25zdCBzdWJ0aXRsZU9iamVjdCA9IGF3YWl0IHMzLnNlbmQoXG4gICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgIEtleTogc3VidGl0bGVGaWxlLktleSxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgY29uc3Qgc3VidGl0bGVCdWZmZXIgPSBCdWZmZXIuZnJvbShcbiAgICAgIGF3YWl0IHN1YnRpdGxlT2JqZWN0LkJvZHkhLnRyYW5zZm9ybVRvQnl0ZUFycmF5KCksXG4gICAgKTtcbiAgICBmcy53cml0ZUZpbGVTeW5jKHN1YnRpdGxlUGF0aCwgc3VidGl0bGVCdWZmZXIpO1xuICB9XG5cbiAgLy8gQ29tYmluZSB2aWRlbyArIGF1ZGlvICsgc3VidGl0bGUgZm9yIHRoaXMgc2NlbmVcbiAgY29uc3QgY29tYmluZWRTY2VuZVBhdGggPSBwYXRoLmpvaW4oXG4gICAgb3MudG1wZGlyKCksXG4gICAgYHNjZW5lLSR7c2NlbmVQb3NpdGlvbn0tY29tYmluZWQubXA0YCxcbiAgKTtcblxuICByZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgYOKdjCBUaW1lb3V0IGNvbWJpbmluZyBzY2VuZSAke3NjZW5lUG9zaXRpb259IGFmdGVyIDUgbWludXRlc2AsXG4gICAgICApO1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcihgVGltZW91dCBjb21iaW5pbmcgc2NlbmUgJHtzY2VuZVBvc2l0aW9ufWApKTtcbiAgICB9LCA1ICogNjAgKiAxMDAwKTsgLy8gNSBtaW51dGUgdGltZW91dFxuXG4gICAgY29uc3QgY29tbWFuZCA9IGZmbXBlZygpXG4gICAgICAuaW5wdXQodmlkZW9QYXRoKVxuICAgICAgLmlucHV0T3B0aW9ucyhbJy1hc3luYycsICcxJywgJy1pdHNvZmZzZXQnLCAnMCddKTtcblxuICAgIGlmIChhdWRpb1BhdGgpIHtcbiAgICAgIGNvbW1hbmQuaW5wdXQoYXVkaW9QYXRoKTtcbiAgICB9XG5cbiAgICBjb21tYW5kLm91dHB1dE9wdGlvbnMoW1xuICAgICAgJy1jOnYnLFxuICAgICAgJ2xpYngyNjQnLFxuICAgICAgJy1wcmVzZXQnLFxuICAgICAgJ3VsdHJhZmFzdCcsXG4gICAgICAnLWNyZicsXG4gICAgICAnMjgnLFxuICAgICAgJy1waXhfZm10JyxcbiAgICAgICd5dXY0MjBwJyxcbiAgICAgICctYzphJyxcbiAgICAgICdhYWMnLFxuICAgICAgJy1iOmEnLFxuICAgICAgJzEyOGsnLFxuICAgICAgJy1tYXAnLFxuICAgICAgJzA6djowJyxcbiAgICAgICctc2hvcnRlc3QnLFxuICAgICAgJy12c3luYycsXG4gICAgICAnMScsXG4gICAgICAnLXRocmVhZHMnLFxuICAgICAgJzAnLFxuICAgIF0pO1xuXG4gICAgaWYgKGF1ZGlvUGF0aCkge1xuICAgICAgY29tbWFuZC5vdXRwdXRPcHRpb25zKFsnLW1hcCcsICcxOmE6MCddKTtcbiAgICB9XG5cbiAgICAvLyBBZGQgc3VidGl0bGUgb3ZlcmxheSBpZiBhdmFpbGFibGVcbiAgICBpZiAoc3VidGl0bGVQYXRoICYmIGZzLmV4aXN0c1N5bmMoc3VidGl0bGVQYXRoKSkge1xuICAgICAgY29uc3Qgc3VidGl0bGVGaWx0ZXIgPSBgYXNzPSR7c3VidGl0bGVQYXRofTpmb250c2Rpcj0vb3B0L2ZvbnRzYDtcbiAgICAgIGNvbW1hbmQub3V0cHV0T3B0aW9ucyhbJy12ZicsIHN1YnRpdGxlRmlsdGVyXSk7XG4gICAgfVxuXG4gICAgY29tbWFuZFxuICAgICAgLm91dHB1dChjb21iaW5lZFNjZW5lUGF0aClcbiAgICAgIC5vbignZW5kJywgYXN5bmMgKCkgPT4ge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtzY2VuZVBvc2l0aW9ufSBjb21iaW5lZCBzdWNjZXNzZnVsbHlgKTtcblxuICAgICAgICAvLyBTYXZlIGNvbWJpbmVkIHNjZW5lIHRvIFMzIGZvciB0ZXN0aW5nIHB1cnBvc2VzXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29tYmluZWRTY2VuZUJ1ZmZlciA9IGZzLnJlYWRGaWxlU3luYyhjb21iaW5lZFNjZW5lUGF0aCk7XG4gICAgICAgICAgY29uc3QgY29tYmluZWRTY2VuZUtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmVQb3NpdGlvbn0tY29tYmluZWQubXA0YDtcblxuICAgICAgICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICAgICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgICAgIEtleTogY29tYmluZWRTY2VuZUtleSxcbiAgICAgICAgICAgICAgQm9keTogY29tYmluZWRTY2VuZUJ1ZmZlcixcbiAgICAgICAgICAgICAgQ29udGVudFR5cGU6ICd2aWRlby9tcDQnLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYPCfkr4gU2NlbmUgJHtzY2VuZVBvc2l0aW9ufSAoSUQ6ICR7c2NlbmVJZH0pIGNvbWJpbmVkIGZpbGUgc2F2ZWQgdG8gUzM6ICR7Y29tYmluZWRTY2VuZUtleX1gLFxuICAgICAgICAgICk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgYOKaoO+4jyBDb3VsZCBub3Qgc2F2ZSBjb21iaW5lZCBzY2VuZSAke3NjZW5lUG9zaXRpb259IChJRDogJHtzY2VuZUlkfSkgdG8gUzM6YCxcbiAgICAgICAgICAgIGVycm9yLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDbGVhbiB1cCBpbmRpdmlkdWFsIHNjZW5lIGZpbGVzXG4gICAgICAgIGlmIChmcy5leGlzdHNTeW5jKHZpZGVvUGF0aCkpIGZzLnVubGlua1N5bmModmlkZW9QYXRoKTtcbiAgICAgICAgaWYgKGF1ZGlvUGF0aCAmJiBmcy5leGlzdHNTeW5jKGF1ZGlvUGF0aCkpIGZzLnVubGlua1N5bmMoYXVkaW9QYXRoKTtcbiAgICAgICAgaWYgKHN1YnRpdGxlUGF0aCAmJiBmcy5leGlzdHNTeW5jKHN1YnRpdGxlUGF0aCkpXG4gICAgICAgICAgZnMudW5saW5rU3luYyhzdWJ0aXRsZVBhdGgpO1xuXG4gICAgICAgIHJlc29sdmUoY29tYmluZWRTY2VuZVBhdGgpO1xuICAgICAgfSlcbiAgICAgIC5vbignZXJyb3InLCAoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBjb21iaW5pbmcgc2NlbmUgJHtzY2VuZVBvc2l0aW9ufTpgLCBlcnIpO1xuICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgIH0pXG4gICAgICAucnVuKCk7XG4gIH0pO1xufVxuIl19