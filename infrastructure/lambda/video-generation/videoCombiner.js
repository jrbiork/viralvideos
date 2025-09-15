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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9Db21iaW5lci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZpZGVvQ29tYmluZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUE2QkEsb0RBaUpDO0FBOUtELGtEQUs0QjtBQUM1Qix3RUFBNkQ7QUFHN0QseUJBQXlCO0FBQ3pCLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFFN0IsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0FBT3hDLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFTckQsS0FBSyxVQUFVLG9CQUFvQixDQUN4QyxNQUFjLEVBQ2QsU0FBaUIsRUFDakIsUUFBa0IsRUFDbEIsZ0JBQTBCLEVBQUU7SUFFNUIsT0FBTyxDQUFDLEdBQUcsQ0FDVCxtRUFBbUUsRUFDbkUsTUFBTSxDQUNQLENBQUM7SUFFRixJQUFJLENBQUM7UUFDSCxPQUFPLENBQUMsR0FBRyxDQUNULHVDQUF1QyxFQUN2QyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFDdEIsUUFBUSxDQUNULENBQUM7UUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLCtCQUErQixFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBRTVELElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxJQUFJLFFBQVEsQ0FBQyxNQUFNLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3JELE1BQU0sSUFBSSxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBRUQsNkVBQTZFO1FBQzdFLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBb0IsRUFBRSxFQUFFO1lBQ3JFLE1BQU0sU0FBUyxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ25ELElB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LENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNmLE9BQU8sQ0FBQyxJQUFJLENBQ1Ysb0NBQW9DLGFBQWEsU0FBUyxPQUFPLFVBQVUsRUFDM0UsS0FBSyxDQUNOLENBQUM7WUFDSixDQUFDO1lBRUQsa0NBQWtDO1lBQ2xDLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUM7Z0JBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUN2RCxJQUFJLFNBQVMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQztnQkFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3BFLElBQUksWUFBWSxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDO2dCQUM3QyxFQUFFLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDO1lBRTlCLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQzdCLENBQUMsQ0FBQzthQUNELEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxHQUFVLEVBQUUsRUFBRTtZQUMxQixZQUFZLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdEIsT0FBTyxDQUFDLEtBQUssQ0FBQywyQkFBMkIsYUFBYSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDaEUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsQ0FBQyxDQUFDO2FBQ0QsR0FBRyxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBTM0NsaWVudCxcbiAgTGlzdE9iamVjdHNWMkNvbW1hbmQsXG4gIEdldE9iamVjdENvbW1hbmQsXG4gIFB1dE9iamVjdENvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgeyBnZXRTaWduZWRVcmwgfSBmcm9tICdAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lcic7XG5pbXBvcnQgeyBNYW5pZmVzdCwgTWFuaWZlc3RTY2VuZSB9IGZyb20gJy4uL3R5cGVzL3MzVHlwZXMnO1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgdXBkYXRlTWFuaWZlc3QgfSBmcm9tICcuLi91dGlscy9tYW5pZmVzdFV0aWxzJztcbmNvbnN0IGZmbXBlZyA9IHJlcXVpcmUoJ2ZsdWVudC1mZm1wZWcnKTtcblxuLy8gUzMgZmlsZSBvYmplY3QgaW50ZXJmYWNlXG5pbnRlcmZhY2UgUzNGaWxlT2JqZWN0IHtcbiAgS2V5OiBzdHJpbmc7XG59XG5cbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjZW5lIHtcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgbmFycmF0aW9uOiBzdHJpbmc7XG4gIGlkOiBudW1iZXI7IC8vIEFkZCBpZCBwcm9wZXJ0eVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tYmluZVZpZGVvQW5kQXVkaW8oXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgbWFuaWZlc3Q6IE1hbmlmZXN0LFxuICByZW1vdmVkU2NlbmVzOiBudW1iZXJbXSA9IFtdLFxuKTogUHJvbWlzZTx7IGZpbmFsVmlkZW9TaWduZWRVcmw6IHN0cmluZzsgc2l6ZTogc3RyaW5nIH0+IHtcbiAgY29uc29sZS5sb2coXG4gICAgJ/CfjqwgQ29tYmluaW5nIHZpZGVvLCBhdWRpbywgYW5kIHN1YnRpdGxlcyBzY2VuZSBieSBzY2VuZSBmb3IgdXNlcjonLFxuICAgIHVzZXJJZCxcbiAgKTtcblxuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgJ/CflI0gVXNpbmcgbWFuaWZlc3QgZm9yIHNjZW5lIG9yZGVyaW5nOicsXG4gICAgICBtYW5pZmVzdC5zY2VuZXMubGVuZ3RoLFxuICAgICAgJ3NjZW5lcycsXG4gICAgKTtcbiAgICBjb25zb2xlLmxvZygn8J+UjSBSZW1vdmVkIHNjZW5lcyB0byBleGNsdWRlOicsIHJlbW92ZWRTY2VuZXMpO1xuXG4gICAgaWYgKCFtYW5pZmVzdC5zY2VuZXMgfHwgbWFuaWZlc3Quc2NlbmVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBzY2VuZXMgZm91bmQgaW4gbWFuaWZlc3QnKTtcbiAgICB9XG5cbiAgICAvLyBGaWx0ZXIgb3V0IHJlbW92ZWQgc2NlbmVzIGFuZCBzb3J0IGJ5IHNjZW5lUG9zaXRpb24gdG8gZW5zdXJlIHByb3BlciBvcmRlclxuICAgIGNvbnN0IGZpbHRlcmVkU2NlbmVzID0gbWFuaWZlc3Quc2NlbmVzLmZpbHRlcigoc2NlbmU6IE1hbmlmZXN0U2NlbmUpID0+IHtcbiAgICAgIGNvbnN0IGlzUmVtb3ZlZCA9IHJlbW92ZWRTY2VuZXMuaW5jbHVkZXMoc2NlbmUuaWQpO1xuICAgICAgaWYgKGlzUmVtb3ZlZCkge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBg8J+aqyBFeGNsdWRpbmcgcmVtb3ZlZCBzY2VuZSBJRDogJHtzY2VuZS5pZH0gKHBvc2l0aW9uOiAke3NjZW5lLnNjZW5lUG9zaXRpb259KWAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm4gIWlzUmVtb3ZlZDtcbiAgICB9KTtcblxuICAgIGNvbnN0IHNvcnRlZFNjZW5lcyA9IGZpbHRlcmVkU2NlbmVzLnNvcnQoXG4gICAgICAoYTogTWFuaWZlc3RTY2VuZSwgYjogTWFuaWZlc3RTY2VuZSkgPT4gYS5zY2VuZVBvc2l0aW9uIC0gYi5zY2VuZVBvc2l0aW9uLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICfwn5SNIFNvcnRlZCBzY2VuZXMgYnkgc2NlbmVQb3NpdGlvbjonLFxuICAgICAgc29ydGVkU2NlbmVzLm1hcCgoczogTWFuaWZlc3RTY2VuZSkgPT4gKHtcbiAgICAgICAgc2NlbmVQb3NpdGlvbjogcy5zY2VuZVBvc2l0aW9uLFxuICAgICAgICBoYXNWaWRlbzogISFzLmZpbGVzPy5tcDQsXG4gICAgICAgIGhhc0F1ZGlvOiAhIXMuZmlsZXM/Lm1wMyxcbiAgICAgICAgaGFzU3VidGl0bGU6ICEhcy5maWxlcz8uYXNzLFxuICAgICAgfSkpLFxuICAgICk7XG5cbiAgICAvLyBQcm9jZXNzIGFsbCBzY2VuZXMgaW4gcGFyYWxsZWw6IGNvbWJpbmUgdmlkZW8gKyBhdWRpbyArIHN1YnRpdGxlXG4gICAgY29uc3Qgc2NlbmVQcm9jZXNzaW5nUHJvbWlzZXMgPSBzb3J0ZWRTY2VuZXMubWFwKFxuICAgICAgYXN5bmMgKHNjZW5lOiBNYW5pZmVzdFNjZW5lLCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgY29uc3Qgc2NlbmVQb3NpdGlvbiA9IHNjZW5lLnNjZW5lUG9zaXRpb247XG5cbiAgICAgICAgLy8gQ3JlYXRlIGZpbGUgb2JqZWN0cyBiYXNlZCBvbiBtYW5pZmVzdFxuICAgICAgICAvLyBFeHRyYWN0IFMzIGtleSBmcm9tIFVSTCBpZiBpdCdzIGEgZnVsbCBVUkwsIG90aGVyd2lzZSB1c2UgYXMtaXNcbiAgICAgICAgY29uc3QgZXh0cmFjdFMzS2V5ID0gKHVybDogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgICAgICAgICBpZiAodXJsLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgICAgICAgIC8vIEV4dHJhY3Qga2V5IGZyb20gUzMgVVJMXG4gICAgICAgICAgICBjb25zdCB1cmxQYXJ0cyA9IHVybC5zcGxpdCgnLycpO1xuICAgICAgICAgICAgcmV0dXJuIHVybFBhcnRzLnNsaWNlKDMpLmpvaW4oJy8nKTsgLy8gUmVtb3ZlIGJ1Y2tldCBhbmQgZG9tYWluIHBhcnRzXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB1cmw7XG4gICAgICAgIH07XG5cbiAgICAgICAgY29uc3QgdmlkZW9GaWxlID0gc2NlbmUuZmlsZXM/Lm1wNFxuICAgICAgICAgID8geyBLZXk6IGV4dHJhY3RTM0tleShzY2VuZS5maWxlcy5tcDQpIH1cbiAgICAgICAgICA6IG51bGw7XG4gICAgICAgIGNvbnN0IGF1ZGlvRmlsZSA9IHNjZW5lLmZpbGVzPy5tcDNcbiAgICAgICAgICA/IHsgS2V5OiBleHRyYWN0UzNLZXkoc2NlbmUuZmlsZXMubXAzKSB9XG4gICAgICAgICAgOiBudWxsO1xuICAgICAgICBjb25zdCBzdWJ0aXRsZUZpbGUgPSBzY2VuZS5maWxlcz8uYXNzXG4gICAgICAgICAgPyB7IEtleTogZXh0cmFjdFMzS2V5KHNjZW5lLmZpbGVzLmFzcykgfVxuICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICBpZiAoIXZpZGVvRmlsZT8uS2V5KSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgYOKaoO+4jyBObyB2aWRlbyBmaWxlIGZvdW5kIGZvciBzY2VuZSBhdCBwb3NpdGlvbiAke3NjZW5lUG9zaXRpb259YCxcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGF3YWl0IHByb2Nlc3NTY2VuZShcbiAgICAgICAgICB2aWRlb0ZpbGUsXG4gICAgICAgICAgYXVkaW9GaWxlLFxuICAgICAgICAgIHN1YnRpdGxlRmlsZSxcbiAgICAgICAgICBzY2VuZVBvc2l0aW9uLFxuICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgICk7XG4gICAgICB9LFxuICAgICk7XG5cbiAgICBjb25zdCBjb21iaW5lZFNjZW5lUGF0aHMgPSAoXG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChzY2VuZVByb2Nlc3NpbmdQcm9taXNlcylcbiAgICApLmZpbHRlcigocGF0aCk6IHBhdGggaXMgc3RyaW5nID0+IHBhdGggIT09IG51bGwpO1xuXG4gICAgY29uc29sZS5sb2coJ/CflI0gc2NlbmVQcm9jZXNzaW5nUHJvbWlzZXMgZmluaXNoZWQ6JywgY29tYmluZWRTY2VuZVBhdGhzKTtcblxuICAgIC8vIE5vdyBjb25jYXRlbmF0ZSBhbGwgY29tYmluZWQgc2NlbmVzXG4gICAgY29uc3QgZmluYWxPdXRwdXRQYXRoID0gYXdhaXQgY29uY2F0ZW5hdGVTY2VuZXMoY29tYmluZWRTY2VuZVBhdGhzKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn5SNIGZpbmFsT3V0cHV0UGF0aCBzdGFydDonLCBmaW5hbE91dHB1dFBhdGgpO1xuXG4gICAgLy8gVXBsb2FkIGZpbmFsIHZpZGVvIHRvIFMzXG4gICAgY29uc3QgZmluYWxWaWRlb0J1ZmZlciA9IGZzLnJlYWRGaWxlU3luYyhmaW5hbE91dHB1dFBhdGgpO1xuICAgIGNvbnN0IGZpbmFsVmlkZW9LZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS1maW5hbC12aWRlby5tcDRgO1xuICAgIGNvbnN0IHNpemUgPSBmaW5hbFZpZGVvQnVmZmVyLmxlbmd0aC50b1N0cmluZygpO1xuICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fQlVDS0VUX05BTUUsXG4gICAgICAgIEtleTogZmluYWxWaWRlb0tleSxcbiAgICAgICAgQm9keTogZmluYWxWaWRlb0J1ZmZlcixcbiAgICAgICAgQ29udGVudFR5cGU6ICd2aWRlby9tcDQnLFxuICAgICAgICBNZXRhZGF0YToge1xuICAgICAgICAgIHNpemUsXG4gICAgICAgICAgZHVyYXRpb246IG1hbmlmZXN0LnRvdGFsRHVyYXRpb24udG9TdHJpbmcoKSxcbiAgICAgICAgICBzY2VuZUNvdW50OiBtYW5pZmVzdC5zY2VuZUNvdW50LnRvU3RyaW5nKCksXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/Cfkr4gRmluYWwgdmlkZW8gdXBsb2FkZWQgdG8gUzM6JywgZmluYWxWaWRlb0tleSk7XG5cbiAgICAvLyBHZW5lcmF0ZSBwcmUtc2lnbmVkIFVSTCBmb3IgdGhlIGZpbmFsIHZpZGVvXG4gICAgY29uc3QgZmluYWxWaWRlb1NpZ25lZFVybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgIHMzLFxuICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IGZpbmFsVmlkZW9LZXksXG4gICAgICB9KSxcbiAgICAgIHsgZXhwaXJlc0luOiAzNjAwMCB9LCAvLyAxMCBob3VycyBleHBpcmF0aW9uXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn5SXIEZpbmFsIHZpZGVvIHByZS1zaWduZWQgVVJMIGdlbmVyYXRlZCcpO1xuXG4gICAgLy8gQ2xlYW4gdXAgdGhlIHRlbXBvcmFyeSBmaW5hbCB2aWRlbyBmaWxlXG4gICAgaWYgKGZzLmV4aXN0c1N5bmMoZmluYWxPdXRwdXRQYXRoKSkge1xuICAgICAgZnMudW5saW5rU3luYyhmaW5hbE91dHB1dFBhdGgpO1xuICAgIH1cblxuICAgIHJldHVybiB7IGZpbmFsVmlkZW9TaWduZWRVcmwsIHNpemUgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gY29tYmluZVZpZGVvQW5kQXVkaW86JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbi8qKlxuICogQ29uY2F0ZW5hdGVzIG11bHRpcGxlIHZpZGVvIHNjZW5lIGZpbGVzIGludG8gYSBzaW5nbGUgZmluYWwgdmlkZW9cbiAqIEBwYXJhbSBjb21iaW5lZFNjZW5lUGF0aHMgQXJyYXkgb2YgcGF0aHMgdG8gY29tYmluZWQgc2NlbmUgdmlkZW8gZmlsZXNcbiAqIEByZXR1cm5zIFBhdGggdG8gdGhlIGZpbmFsIGNvbmNhdGVuYXRlZCB2aWRlbyBmaWxlXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGNvbmNhdGVuYXRlU2NlbmVzKFxuICBjb21iaW5lZFNjZW5lUGF0aHM6IHN0cmluZ1tdLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgY29uc29sZS5sb2coJ/CfjqwgQ29uY2F0ZW5hdGluZyBhbGwgY29tYmluZWQgc2NlbmVzLi4uJyk7XG5cbiAgY29uc3QgZmlsZUxpc3RQYXRoID0gcGF0aC5qb2luKG9zLnRtcGRpcigpLCAnY29tYmluZWQtc2NlbmVzLWZpbGVsaXN0LnR4dCcpO1xuICBjb25zdCBmaWxlTGlzdENvbnRlbnQgPSBjb21iaW5lZFNjZW5lUGF0aHNcbiAgICAubWFwKChzY2VuZVBhdGgpID0+IGBmaWxlICcke3NjZW5lUGF0aH0nYClcbiAgICAuam9pbignXFxuJyk7XG4gIGZzLndyaXRlRmlsZVN5bmMoZmlsZUxpc3RQYXRoLCBmaWxlTGlzdENvbnRlbnQpO1xuXG4gIGNvbnN0IGZpbmFsT3V0cHV0UGF0aCA9IHBhdGguam9pbihvcy50bXBkaXIoKSwgJ2ZpbmFsLXZpZGVvLm1wNCcpO1xuXG4gIHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgVGltZW91dCBjb25jYXRlbmF0aW5nIHNjZW5lcyBhZnRlciAxMCBtaW51dGVzJyk7XG4gICAgICByZWplY3QobmV3IEVycm9yKCdUaW1lb3V0IGNvbmNhdGVuYXRpbmcgc2NlbmVzJykpO1xuICAgIH0sIDEwICogNjAgKiAxMDAwKTsgLy8gMTAgbWludXRlIHRpbWVvdXRcblxuICAgIGZmbXBlZygpXG4gICAgICAuaW5wdXQoZmlsZUxpc3RQYXRoKVxuICAgICAgLmlucHV0T3B0aW9ucyhbJy1mJywgJ2NvbmNhdCcsICctc2FmZScsICcwJ10pXG4gICAgICAub3V0cHV0T3B0aW9ucyhbXG4gICAgICAgICctYzp2JyxcbiAgICAgICAgJ2xpYngyNjQnLFxuICAgICAgICAnLXByZXNldCcsXG4gICAgICAgICd2ZXJ5ZmFzdCcsXG4gICAgICAgICctY3JmJyxcbiAgICAgICAgJzIzJyxcbiAgICAgICAgJy1waXhfZm10JyxcbiAgICAgICAgJ3l1djQyMHAnLFxuICAgICAgICAnLWM6YScsXG4gICAgICAgICdhYWMnLFxuICAgICAgICAnLWI6YScsXG4gICAgICAgICcxMjhrJyxcbiAgICAgICAgJy10aHJlYWRzJyxcbiAgICAgICAgJzAnLFxuICAgICAgXSlcbiAgICAgIC5vdXRwdXQoZmluYWxPdXRwdXRQYXRoKVxuICAgICAgLm9uKCdlbmQnLCAoKSA9PiB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgY29uc29sZS5sb2coJ+KchSBBbGwgc2NlbmVzIGNvbmNhdGVuYXRlZCBzdWNjZXNzZnVsbHknKTtcblxuICAgICAgICAvLyBDbGVhbiB1cCB0ZW1wb3JhcnkgZmlsZXNcbiAgICAgICAgY29tYmluZWRTY2VuZVBhdGhzLmZvckVhY2goKHNjZW5lUGF0aCkgPT4ge1xuICAgICAgICAgIGlmIChmcy5leGlzdHNTeW5jKHNjZW5lUGF0aCkpIGZzLnVubGlua1N5bmMoc2NlbmVQYXRoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGlmIChmcy5leGlzdHNTeW5jKGZpbGVMaXN0UGF0aCkpIGZzLnVubGlua1N5bmMoZmlsZUxpc3RQYXRoKTtcblxuICAgICAgICByZXNvbHZlKGZpbmFsT3V0cHV0UGF0aCk7XG4gICAgICB9KVxuICAgICAgLm9uKCdlcnJvcicsIChlcnI6IEVycm9yKSA9PiB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGNvbmNhdGVuYXRpbmcgc2NlbmVzOicsIGVycik7XG4gICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgfSlcbiAgICAgIC5ydW4oKTtcbiAgfSk7XG59XG5cbi8qKlxuICogUHJvY2Vzc2VzIGEgc2luZ2xlIHNjZW5lIGJ5IGNvbWJpbmluZyB2aWRlbywgYXVkaW8sIGFuZCBzdWJ0aXRsZSBmaWxlc1xuICogQHBhcmFtIHZpZGVvRmlsZSBTMyBvYmplY3QgY29udGFpbmluZyB2aWRlbyBmaWxlIGluZm9cbiAqIEBwYXJhbSBhdWRpb0ZpbGUgUzMgb2JqZWN0IGNvbnRhaW5pbmcgYXVkaW8gZmlsZSBpbmZvIChvcHRpb25hbClcbiAqIEBwYXJhbSBzdWJ0aXRsZUZpbGUgUzMgb2JqZWN0IGNvbnRhaW5pbmcgc3VidGl0bGUgZmlsZSBpbmZvIChvcHRpb25hbClcbiAqIEBwYXJhbSBzY2VuZVBvc2l0aW9uIEluZGV4IG9mIHRoZSBzY2VuZSBiZWluZyBwcm9jZXNzZWRcbiAqIEBwYXJhbSB1c2VySWQgVXNlciBJRCBmb3IgUzMgb3BlcmF0aW9uc1xuICogQHBhcmFtIHRpbWVzdGFtcCBUaW1lc3RhbXAgZm9yIFMzIG9wZXJhdGlvbnNcbiAqIEByZXR1cm5zIFBhdGggdG8gdGhlIGNvbWJpbmVkIHNjZW5lIGZpbGVcbiAqL1xuYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1NjZW5lKFxuICB2aWRlb0ZpbGU6IFMzRmlsZU9iamVjdCxcbiAgYXVkaW9GaWxlOiBTM0ZpbGVPYmplY3QgfCBudWxsLFxuICBzdWJ0aXRsZUZpbGU6IFMzRmlsZU9iamVjdCB8IG51bGwsXG4gIHNjZW5lUG9zaXRpb246IG51bWJlcixcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgLy8gRXh0cmFjdCB0aGUgYWN0dWFsIHNjZW5lIElEIGZyb20gdGhlIGZpbGVuYW1lXG4gIGNvbnN0IHNjZW5lSWRNYXRjaCA9IHZpZGVvRmlsZS5LZXkubWF0Y2goL3NjZW5lLShcXGQrKVxcLm1wNC8pO1xuICBjb25zdCBzY2VuZUlkID0gc2NlbmVJZE1hdGNoID8gcGFyc2VJbnQoc2NlbmVJZE1hdGNoWzFdKSA6IHNjZW5lUG9zaXRpb247XG5cbiAgY29uc29sZS5sb2coXG4gICAgYPCfjqwgUHJvY2Vzc2luZyBzY2VuZSAke3NjZW5lUG9zaXRpb259IChJRDogJHtzY2VuZUlkfSk6IGNvbWJpbmluZyB2aWRlbyArIGF1ZGlvICsgc3VidGl0bGVgLFxuICApO1xuXG4gIC8vIERvd25sb2FkIHZpZGVvIGZpbGVcbiAgY29uc3QgdmlkZW9QYXRoID0gcGF0aC5qb2luKG9zLnRtcGRpcigpLCBgc2NlbmUtJHtzY2VuZVBvc2l0aW9ufS12aWRlby5tcDRgKTtcbiAgY29uc3QgdmlkZW9PYmplY3QgPSBhd2FpdCBzMy5zZW5kKFxuICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICBLZXk6IHZpZGVvRmlsZS5LZXksXG4gICAgfSksXG4gICk7XG4gIGNvbnN0IHZpZGVvQnVmZmVyID0gQnVmZmVyLmZyb20oXG4gICAgYXdhaXQgdmlkZW9PYmplY3QuQm9keSEudHJhbnNmb3JtVG9CeXRlQXJyYXkoKSxcbiAgKTtcbiAgZnMud3JpdGVGaWxlU3luYyh2aWRlb1BhdGgsIHZpZGVvQnVmZmVyKTtcblxuICAvLyBEb3dubG9hZCBhdWRpbyBmaWxlXG4gIGxldCBhdWRpb1BhdGg6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBpZiAoYXVkaW9GaWxlPy5LZXkpIHtcbiAgICBhdWRpb1BhdGggPSBwYXRoLmpvaW4ob3MudG1wZGlyKCksIGBzY2VuZS0ke3NjZW5lUG9zaXRpb259LWF1ZGlvLm1wM2ApO1xuICAgIGNvbnN0IGF1ZGlvT2JqZWN0ID0gYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiBhdWRpb0ZpbGUuS2V5LFxuICAgICAgfSksXG4gICAgKTtcbiAgICBjb25zdCBhdWRpb0J1ZmZlciA9IEJ1ZmZlci5mcm9tKFxuICAgICAgYXdhaXQgYXVkaW9PYmplY3QuQm9keSEudHJhbnNmb3JtVG9CeXRlQXJyYXkoKSxcbiAgICApO1xuICAgIGZzLndyaXRlRmlsZVN5bmMoYXVkaW9QYXRoLCBhdWRpb0J1ZmZlcik7XG4gIH1cblxuICAvLyBEb3dubG9hZCBzdWJ0aXRsZSBmaWxlXG4gIGxldCBzdWJ0aXRsZVBhdGg6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBpZiAoc3VidGl0bGVGaWxlPy5LZXkpIHtcbiAgICBzdWJ0aXRsZVBhdGggPSBwYXRoLmpvaW4oXG4gICAgICBvcy50bXBkaXIoKSxcbiAgICAgIGBzY2VuZS0ke3NjZW5lUG9zaXRpb259LXN1YnRpdGxlLmFzc2AsXG4gICAgKTtcbiAgICBjb25zdCBzdWJ0aXRsZU9iamVjdCA9IGF3YWl0IHMzLnNlbmQoXG4gICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgIEtleTogc3VidGl0bGVGaWxlLktleSxcbiAgICAgIH0pLFxuICAgICk7XG4gICAgY29uc3Qgc3VidGl0bGVCdWZmZXIgPSBCdWZmZXIuZnJvbShcbiAgICAgIGF3YWl0IHN1YnRpdGxlT2JqZWN0LkJvZHkhLnRyYW5zZm9ybVRvQnl0ZUFycmF5KCksXG4gICAgKTtcbiAgICBmcy53cml0ZUZpbGVTeW5jKHN1YnRpdGxlUGF0aCwgc3VidGl0bGVCdWZmZXIpO1xuICB9XG5cbiAgLy8gQ29tYmluZSB2aWRlbyArIGF1ZGlvICsgc3VidGl0bGUgZm9yIHRoaXMgc2NlbmVcbiAgY29uc3QgY29tYmluZWRTY2VuZVBhdGggPSBwYXRoLmpvaW4oXG4gICAgb3MudG1wZGlyKCksXG4gICAgYHNjZW5lLSR7c2NlbmVQb3NpdGlvbn0tY29tYmluZWQubXA0YCxcbiAgKTtcblxuICByZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgYOKdjCBUaW1lb3V0IGNvbWJpbmluZyBzY2VuZSAke3NjZW5lUG9zaXRpb259IGFmdGVyIDUgbWludXRlc2AsXG4gICAgICApO1xuICAgICAgcmVqZWN0KG5ldyBFcnJvcihgVGltZW91dCBjb21iaW5pbmcgc2NlbmUgJHtzY2VuZVBvc2l0aW9ufWApKTtcbiAgICB9LCA1ICogNjAgKiAxMDAwKTsgLy8gNSBtaW51dGUgdGltZW91dFxuXG4gICAgY29uc3QgY29tbWFuZCA9IGZmbXBlZygpXG4gICAgICAuaW5wdXQodmlkZW9QYXRoKVxuICAgICAgLmlucHV0T3B0aW9ucyhbJy1hc3luYycsICcxJywgJy1pdHNvZmZzZXQnLCAnMCddKTtcblxuICAgIGlmIChhdWRpb1BhdGgpIHtcbiAgICAgIGNvbW1hbmQuaW5wdXQoYXVkaW9QYXRoKTtcbiAgICB9XG5cbiAgICBjb21tYW5kLm91dHB1dE9wdGlvbnMoW1xuICAgICAgJy1jOnYnLFxuICAgICAgJ2xpYngyNjQnLFxuICAgICAgJy1wcmVzZXQnLFxuICAgICAgJ3VsdHJhZmFzdCcsXG4gICAgICAnLWNyZicsXG4gICAgICAnMjgnLFxuICAgICAgJy1waXhfZm10JyxcbiAgICAgICd5dXY0MjBwJyxcbiAgICAgICctYzphJyxcbiAgICAgICdhYWMnLFxuICAgICAgJy1iOmEnLFxuICAgICAgJzEyOGsnLFxuICAgICAgJy1tYXAnLFxuICAgICAgJzA6djowJyxcbiAgICAgICctc2hvcnRlc3QnLFxuICAgICAgJy12c3luYycsXG4gICAgICAnMScsXG4gICAgICAnLXRocmVhZHMnLFxuICAgICAgJzAnLFxuICAgIF0pO1xuXG4gICAgaWYgKGF1ZGlvUGF0aCkge1xuICAgICAgY29tbWFuZC5vdXRwdXRPcHRpb25zKFsnLW1hcCcsICcxOmE6MCddKTtcbiAgICB9XG5cbiAgICAvLyBBZGQgc3VidGl0bGUgb3ZlcmxheSBpZiBhdmFpbGFibGVcbiAgICBpZiAoc3VidGl0bGVQYXRoICYmIGZzLmV4aXN0c1N5bmMoc3VidGl0bGVQYXRoKSkge1xuICAgICAgY29uc3Qgc3VidGl0bGVGaWx0ZXIgPSBgYXNzPSR7c3VidGl0bGVQYXRofTpmb250c2Rpcj0vb3B0L2ZvbnRzYDtcbiAgICAgIGNvbW1hbmQub3V0cHV0T3B0aW9ucyhbJy12ZicsIHN1YnRpdGxlRmlsdGVyXSk7XG4gICAgfVxuXG4gICAgY29tbWFuZFxuICAgICAgLm91dHB1dChjb21iaW5lZFNjZW5lUGF0aClcbiAgICAgIC5vbignZW5kJywgYXN5bmMgKCkgPT4ge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtzY2VuZVBvc2l0aW9ufSBjb21iaW5lZCBzdWNjZXNzZnVsbHlgKTtcblxuICAgICAgICAvLyBTYXZlIGNvbWJpbmVkIHNjZW5lIHRvIFMzIGZvciB0ZXN0aW5nIHB1cnBvc2VzXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgY29tYmluZWRTY2VuZUJ1ZmZlciA9IGZzLnJlYWRGaWxlU3luYyhjb21iaW5lZFNjZW5lUGF0aCk7XG4gICAgICAgICAgY29uc3QgY29tYmluZWRTY2VuZUtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmVQb3NpdGlvbn0tY29tYmluZWQubXA0YDtcblxuICAgICAgICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICAgICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgICAgIEtleTogY29tYmluZWRTY2VuZUtleSxcbiAgICAgICAgICAgICAgQm9keTogY29tYmluZWRTY2VuZUJ1ZmZlcixcbiAgICAgICAgICAgICAgQ29udGVudFR5cGU6ICd2aWRlby9tcDQnLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYPCfkr4gU2NlbmUgJHtzY2VuZVBvc2l0aW9ufSAoSUQ6ICR7c2NlbmVJZH0pIGNvbWJpbmVkIGZpbGUgc2F2ZWQgdG8gUzM6ICR7Y29tYmluZWRTY2VuZUtleX1gLFxuICAgICAgICAgICk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgYOKaoO+4jyBDb3VsZCBub3Qgc2F2ZSBjb21iaW5lZCBzY2VuZSAke3NjZW5lUG9zaXRpb259IChJRDogJHtzY2VuZUlkfSkgdG8gUzM6YCxcbiAgICAgICAgICAgIGVycm9yLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDbGVhbiB1cCBpbmRpdmlkdWFsIHNjZW5lIGZpbGVzXG4gICAgICAgIGlmIChmcy5leGlzdHNTeW5jKHZpZGVvUGF0aCkpIGZzLnVubGlua1N5bmModmlkZW9QYXRoKTtcbiAgICAgICAgaWYgKGF1ZGlvUGF0aCAmJiBmcy5leGlzdHNTeW5jKGF1ZGlvUGF0aCkpIGZzLnVubGlua1N5bmMoYXVkaW9QYXRoKTtcbiAgICAgICAgaWYgKHN1YnRpdGxlUGF0aCAmJiBmcy5leGlzdHNTeW5jKHN1YnRpdGxlUGF0aCkpXG4gICAgICAgICAgZnMudW5saW5rU3luYyhzdWJ0aXRsZVBhdGgpO1xuXG4gICAgICAgIHJlc29sdmUoY29tYmluZWRTY2VuZVBhdGgpO1xuICAgICAgfSlcbiAgICAgIC5vbignZXJyb3InLCAoZXJyOiBFcnJvcikgPT4ge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBjb21iaW5pbmcgc2NlbmUgJHtzY2VuZVBvc2l0aW9ufTpgLCBlcnIpO1xuICAgICAgICByZWplY3QoZXJyKTtcbiAgICAgIH0pXG4gICAgICAucnVuKCk7XG4gIH0pO1xufVxuIl19