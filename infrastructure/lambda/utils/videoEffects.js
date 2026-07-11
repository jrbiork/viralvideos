"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listExistingSceneMp4Keys = listExistingSceneMp4Keys;
exports.getVideoEffectUrls = getVideoEffectUrls;
exports.generateVideoEffects = generateVideoEffects;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const axios_1 = require("axios");
const fs = require("fs");
const path = require("path");
const util_1 = require("util");
const child_process_1 = require("child_process");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
function isExecutable(p) {
    try {
        fs.accessSync(p, fs.constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
function resolveFfmpegPath() {
    const candidates = [
        process.env.FFMPEG_PATH,
        '/opt/bin/ffmpeg',
        '/opt/ffmpeg',
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
    ].filter(Boolean);
    for (const p of candidates) {
        if (fs.existsSync(p) && isExecutable(p))
            return p;
    }
    throw new Error('FFmpeg binary not found. Expected at one of: ' +
        candidates.join(', ') +
        '. Ensure your Lambda layer provides ffmpeg (common path: /opt/bin/ffmpeg) or set FFMPEG_PATH.');
}
/**
 * Lists which of a video's per-scene Ken-Burns mp4 objects actually exist in
 * S3 today, keyed by full object Key (e.g. "userId/timestamp.scene-1.mp4").
 * Single existence source of truth reused by getVideoEffectUrls and by
 * hydrateManifest (manifestUtils.ts) so signed URLs are never handed out for
 * scenes whose video hasn't been generated yet.
 */
async function listExistingSceneMp4Keys(userId, timestamp) {
    const s3Client = new client_s3_1.S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
    });
    const listCommand = new client_s3_1.ListObjectsV2Command({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Prefix: `${userId}/${timestamp}.scene-`,
    });
    try {
        const listResult = await s3Client.send(listCommand);
        const keys = (listResult.Contents || [])
            .map((obj) => obj.Key)
            .filter((key) => !!key && key.endsWith('.mp4'));
        return new Set(keys);
    }
    catch (error) {
        console.error('Error listing existing scene mp4 keys:', error);
        return new Set();
    }
}
async function getVideoEffectUrls(userId, timestamp, scenes, user) {
    const s3Client = new client_s3_1.S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
    });
    try {
        const existingKeys = await listExistingSceneMp4Keys(userId, timestamp);
        if (existingKeys.size > 0) {
            console.log('🎥 Video effects already generated for the timestamp:', existingKeys.size, 'files found');
            // Generate signed URLs for existing video files
            const signedUrlPromises = Array.from(existingKeys).map(async (key) => {
                const getObjectCommand = new client_s3_1.GetObjectCommand({
                    Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                    Key: key,
                });
                const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, getObjectCommand, {
                    expiresIn: 36000, // 10 hours
                });
                // Extract filename without user prefix (e.g., "1004.scene-1.mp4")
                const filename = key.replace(`${userId}/`, '');
                return { [filename]: signedUrl };
            });
            return await Promise.all(signedUrlPromises);
        }
        else {
            return await generateVideoEffects(scenes, userId, timestamp, user);
        }
    }
    catch (error) {
        console.error('Error checking existing video effects:', error);
        // Fallback to generating new video effects
        return await generateVideoEffects(scenes, userId, timestamp, user);
    }
}
async function generateVideoEffects(scenes, userId, timestamp, user) {
    // Format: [{ "timestamp.scene-id.mp4": "signed-url" }]
    try {
        console.log('🎬 Generating video effects for scenes...');
        // Process all scenes in parallel
        const videoPromises = scenes.map(async (scene, i) => {
            console.log(`🎬 Processing scene ${i + 1}`);
            // Get the image URL for this scene
            const imageKey = `${userId}/${timestamp}.scene-${scene.id}.png`;
            const imageUrl = await getImageSignedUrl(imageKey);
            if (!imageUrl) {
                throw new Error(`No image found for scene ${scene.id}`);
            }
            // Generate video with blur in/out and camera movement
            const videoSignedUrl = await generateSceneVideo(imageUrl, scene, userId, timestamp, user);
            // Extract filename without user prefix (e.g., "1004.scene-1.mp4")
            const filename = `${timestamp}.scene-${scene.id}.mp4`;
            console.log(`✅ Scene ${i + 1} video generated: ${filename}`);
            return { [filename]: videoSignedUrl };
        });
        const settled = await Promise.allSettled(videoPromises);
        const failures = settled
            .map((result, i) => ({ result, sceneId: scenes[i].id }))
            .filter((entry) => entry.result.status === 'rejected');
        if (failures.length > 0) {
            const details = failures
                .map(({ sceneId, result }) => `scene ${sceneId}: ${result.reason}`)
                .join('; ');
            console.error(`❌ Video effects failed for ${failures.length} scene(s): ${details}`);
            throw new Error(`Failed to generate video for ${failures.length} scene(s) — ${details}`);
        }
        const videoUrls = settled
            .filter((result) => result.status === 'fulfilled')
            .map((result) => result.value);
        if (videoUrls.length === 0) {
            console.log('❌ Error: No videos were generated');
            throw new Error('No videos were generated');
        }
        console.log(`✅ Generated ${videoUrls.length} video clips with effects`);
        return videoUrls;
    }
    catch (error) {
        console.error('❌ Error in generateVideoEffects:', error);
        throw error;
    }
}
async function getImageSignedUrl(imageKey) {
    try {
        const command = new client_s3_1.GetObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: imageKey,
        });
        return await (0, s3_request_presigner_1.getSignedUrl)(s3, command, { expiresIn: 36000 });
    }
    catch (error) {
        console.error(`❌ Error getting signed URL for ${imageKey}:`, error);
        return null;
    }
}
async function generateSceneVideo(imageUrl, scene, userId, timestamp, user) {
    try {
        // Download the image
        console.log(`📥 Downloading image from: ${imageUrl}`);
        const imageResponse = await axios_1.default.get(imageUrl, {
            responseType: 'arraybuffer',
        });
        const imageBuffer = Buffer.from(imageResponse.data);
        // Create temporary files
        const tempDir = '/tmp';
        const inputImagePath = path.join(tempDir, `input-${scene.id}.png`);
        const outputVideoPath = path.join(tempDir, `output-${scene.id}.mp4`);
        let watermarkPath = '';
        // download the watermark.png from viral short parts bucket
        if (user?.subscription?.mode === 'free' ||
            user?.subscription?.status === 'cancelled' ||
            user?.subscription?.status === 'expired') {
            const watermarkKey = 'watermark.png';
            const watermarkUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: watermarkKey,
            }));
            const watermarkResponse = await axios_1.default.get(watermarkUrl, {
                responseType: 'arraybuffer',
            });
            const watermarkBuffer = Buffer.from(watermarkResponse.data);
            // Write watermark to temp file
            watermarkPath = path.join(tempDir, `watermark-${scene.id}.png`);
            fs.writeFileSync(watermarkPath, watermarkBuffer);
        }
        // Write image to temp file
        fs.writeFileSync(inputImagePath, imageBuffer);
        const frames = Math.floor(scene.duration * 25);
        const blurInDuration = 0.2;
        const zoomOutFrames = Math.max(1, Math.floor(blurInDuration * 25));
        // add near your other params
        const moveRadius = 25; // px (more intentional and visible)
        const movePeriod = 180; // frames (~7.2s @25fps) - faster movement
        // deterministically choose one of three motion variants per scene (index-based)
        const variant = scene.id % 3; // 0: dramatic pop-out+drift, 1: strong zoom-in, 2: strong zoom-out
        console.log(`🎨 Motion variant selected (index-based): ${variant}`);
        // Motion variant configurations
        const motionVariants = {
            0: {
                // Variant 0: dramatic zoom-out pop then hold zoom + pronounced circular drift
                zoom: `if(lte(on\\,${zoomOutFrames})\\,1.15-(0.08*on/${zoomOutFrames})\\,1.08)`,
                x: `iw/2-(iw/zoom/2) + if(gte(on\\,${zoomOutFrames})\\, ${moveRadius}*cos(2*PI*(on-${zoomOutFrames})/${movePeriod})\\, 0)`,
                y: `ih/2-(ih/zoom/2) + if(gte(on\\,${zoomOutFrames})\\, ${moveRadius}*sin(2*PI*(on-${zoomOutFrames})/${movePeriod})\\, 0)`,
                supersample: '1440x2560',
                tmix: "frames=2:weights='1 1'",
                scale: 'scale=720:1280:flags=spline:sws_dither=none',
            },
            1: {
                // Variant 1: strong continuous zoom-in (Ken Burns) + pronounced circular drift
                zoom: 'min(pow(1.0012\\,on)\\,1.15)',
                x: `iw/2-(iw/zoom/2) + ${moveRadius}*cos(2*PI*on/${movePeriod})`,
                y: `ih/2-(ih/zoom/2) + ${moveRadius}*sin(2*PI*on/${movePeriod})`,
                supersample: '1440x2560',
                tmix: "frames=2:weights='1 1'",
                scale: 'scale=720:1280:flags=lanczos:sws_dither=none',
            },
            2: {
                // Variant 2: strong continuous zoom-out + pronounced elliptical drift
                zoom: `max(1.05\\, 1.12 - 0.07*on/${frames})`,
                x: `iw/2-(iw/zoom/2) + ${moveRadius}*cos(2*PI*on/${movePeriod})`,
                y: `ih/2-(ih/zoom/2) + (${moveRadius}/1.2)*sin(2*PI*on/${movePeriod})`,
                supersample: '1440x2560',
                tmix: "frames=2:weights='1 1'",
                scale: 'scale=720:1280:flags=lanczos:sws_dither=none',
            },
        };
        const config = motionVariants[variant];
        // Build filter graph conditionally depending on watermark availability
        const hasWatermark = Boolean(watermarkPath && watermarkPath.trim().length > 0);
        const filterComplex = hasWatermark
            ? `[0:v]zoompan=z='${config.zoom}':d=${frames}:` +
                `x='${config.x}':` +
                `y='${config.y}':` +
                `s=${config.supersample},` +
                `tmix=${config.tmix},` +
                `fps=25,` +
                `${config.scale},` +
                `split[b0][b1];` +
                `[b1]boxblur=8:1[bb];` +
                `[b0][bb]blend=all_expr='A*(1-max(0\,1 - T/${blurInDuration})) + B*max(0\,1 - T/${blurInDuration})'[main];` +
                `[1:v]scale=200:-1[watermark];` +
                `[main][watermark]overlay=(W-w)/2:12[v]`
            : `[0:v]zoompan=z='${config.zoom}':d=${frames}:` +
                `x='${config.x}':` +
                `y='${config.y}':` +
                `s=${config.supersample},` +
                `tmix=${config.tmix},` +
                `fps=25,` +
                `${config.scale},` +
                `split[b0][b1];` +
                `[b1]boxblur=8:1[bb];` +
                `[b0][bb]blend=all_expr='A*(1-max(0\,1 - T/${blurInDuration})) + B*max(0\,1 - T/${blurInDuration})'[v]`;
        const ffmpegPath = resolveFfmpegPath();
        const ffmpegArgs = hasWatermark
            ? [
                '-loop',
                '1',
                '-i',
                inputImagePath,
                '-loop',
                '1',
                '-i',
                watermarkPath,
                '-filter_complex',
                filterComplex,
                '-map',
                '[v]',
                '-c:v',
                'libx264',
                '-preset',
                'veryfast',
                '-crf',
                '23',
                '-pix_fmt',
                'yuv420p',
                '-threads',
                '0',
                '-t',
                scene.duration.toString(),
                '-y',
                outputVideoPath,
            ]
            : [
                '-loop',
                '1',
                '-i',
                inputImagePath,
                '-filter_complex',
                filterComplex,
                '-map',
                '[v]',
                '-c:v',
                'libx264',
                '-preset',
                'veryfast',
                '-crf',
                '23',
                '-pix_fmt',
                'yuv420p',
                '-threads',
                '0',
                '-t',
                scene.duration.toString(),
                '-y',
                outputVideoPath,
            ];
        console.log(`🎬 Running FFmpeg command for scene ${scene.id + 1}:`);
        console.log(`🎬 Scene duration: ${scene.duration}s`);
        console.log(ffmpegPath, ffmpegArgs.join(' '));
        const { stdout, stderr } = await execFileAsync(ffmpegPath, ffmpegArgs, {
            maxBuffer: 1024 * 1024 * 10,
        });
        if (stderr) {
            console.log('FFmpeg stderr:', stderr);
        }
        if (stdout) {
            console.log('FFmpeg stdout:', stdout);
        }
        // Check if output file exists
        if (!fs.existsSync(outputVideoPath)) {
            throw new Error('FFmpeg did not generate output video file');
        }
        // Upload to S3
        const videoKey = `${userId}/${timestamp}.scene-${scene.id}.mp4`;
        const videoBuffer = fs.readFileSync(outputVideoPath);
        console.log(`☁️ Uploading video to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${videoKey}`);
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: videoKey,
            Body: videoBuffer,
            ContentType: 'video/mp4',
        }));
        // Clean up temporary files
        try {
            fs.unlinkSync(inputImagePath);
            if (hasWatermark && fs.existsSync(watermarkPath)) {
                fs.unlinkSync(watermarkPath);
            }
            fs.unlinkSync(outputVideoPath);
        }
        catch (cleanupError) {
            console.warn('⚠️ Warning: Could not clean up temporary files:', cleanupError);
        }
        console.log(`✅ Video uploaded to S3: ${videoKey}`);
        // Generate signed URL for the uploaded video
        const videoSignedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: videoKey,
        }), { expiresIn: 36000 });
        console.log(`✅ Video signed URL generated for scene ${scene.id + 1}`);
        return videoSignedUrl;
    }
    catch (error) {
        console.error(`❌ Error generating video for scene ${scene.id + 1}:`, error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9FZmZlY3RzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmlkZW9FZmZlY3RzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBNkRBLDREQXNCQztBQUVELGdEQThDQztBQUVELG9EQStFQztBQXBORCxrREFLNEI7QUFDNUIsd0VBQTZEO0FBQzdELGlDQUEwQjtBQUMxQix5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLCtCQUFpQztBQUNqQyxpREFBK0M7QUFHL0MsTUFBTSxTQUFTLEdBQUcsSUFBQSxnQkFBUyxFQUFDLG9CQUFJLENBQUMsQ0FBQztBQUNsQyxNQUFNLGFBQWEsR0FBRyxJQUFBLGdCQUFTLEVBQUMsd0JBQVEsQ0FBQyxDQUFDO0FBQzFDLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBUzNFLFNBQVMsWUFBWSxDQUFDLENBQVM7SUFDN0IsSUFBSSxDQUFDO1FBQ0gsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxpQkFBaUI7SUFDeEIsTUFBTSxVQUFVLEdBQUc7UUFDakIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXO1FBQ3ZCLGlCQUFpQjtRQUNqQixhQUFhO1FBQ2IsaUJBQWlCO1FBQ2pCLHVCQUF1QjtLQUN4QixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQWEsQ0FBQztJQUU5QixLQUFLLE1BQU0sQ0FBQyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQzNCLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxZQUFZLENBQUMsQ0FBQyxD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QztRQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFFbkQsNkNBQTZDO1FBQzdDLE1BQU0sY0FBYyxHQUFHLE1BQU0sSUFBQSxtQ0FBWSxFQUN2QyxFQUFFLEVBQ0YsSUFBSSw0QkFBZ0IsQ0FBQztZQUNuQixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUI7WUFDM0MsR0FBRyxFQUFFLFFBQVE7U0FDZCxDQUFDLEVBQ0YsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQ3JCLENBQUM7UUFFRixPQUFPLENBQUMsR0FBRyxDQUFDLDBDQUEwQyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdEUsT0FBTyxjQUFjLENBQUM7SUFDeEIsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUNYLHNDQUFzQyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsR0FBRyxFQUNyRCxLQUFLLENBQ04sQ0FBQztRQUNGLE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBTM0NsaWVudCxcbiAgUHV0T2JqZWN0Q29tbWFuZCxcbiAgR2V0T2JqZWN0Q29tbWFuZCxcbiAgTGlzdE9iamVjdHNWMkNvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgeyBnZXRTaWduZWRVcmwgfSBmcm9tICdAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lcic7XG5pbXBvcnQgYXhpb3MgZnJvbSAnYXhpb3MnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgZXhlYywgZXhlY0ZpbGUgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IFVzZXJJdGVtIH0gZnJvbSAnLi91c2VyJztcblxuY29uc3QgZXhlY0FzeW5jID0gcHJvbWlzaWZ5KGV4ZWMpO1xuY29uc3QgZXhlY0ZpbGVBc3luYyA9IHByb21pc2lmeShleGVjRmlsZSk7XG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyB9KTtcblxuZXhwb3J0IGludGVyZmFjZSBTY2VuZSB7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIG5hcnJhdGlvbjogc3RyaW5nO1xuICBpZDogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBpc0V4ZWN1dGFibGUocDogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHRyeSB7XG4gICAgZnMuYWNjZXNzU3luYyhwLCBmcy5jb25zdGFudHMuWF9PSyk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG5mdW5jdGlvbiByZXNvbHZlRmZtcGVnUGF0aCgpOiBzdHJpbmcge1xuICBjb25zdCBjYW5kaWRhdGVzID0gW1xuICAgIHByb2Nlc3MuZW52LkZGTVBFR19QQVRILFxuICAgICcvb3B0L2Jpbi9mZm1wZWcnLFxuICAgICcvb3B0L2ZmbXBlZycsXG4gICAgJy91c3IvYmluL2ZmbXBlZycsXG4gICAgJy91c3IvbG9jYWwvYmluL2ZmbXBlZycsXG4gIF0uZmlsdGVyKEJvb2xlYW4pIGFzIHN0cmluZ1tdO1xuXG4gIGZvciAoY29uc3QgcCBvZiBjYW5kaWRhdGVzKSB7XG4gICAgaWYgKGZzLmV4aXN0c1N5bmMocCkgJiYgaXNFeGVjdXRhYmxlKHApKSByZXR1cm4gcDtcbiAgfVxuXG4gIHRocm93IG5ldyBFcnJvcihcbiAgICAnRkZtcGVnIGJpbmFyeSBub3QgZm91bmQuIEV4cGVjdGVkIGF0IG9uZSBvZjogJyArXG4gICAgICBjYW5kaWRhdGVzLmpvaW4oJywgJykgK1xuICAgICAgJy4gRW5zdXJlIHlvdXIgTGFtYmRhIGxheWVyIHByb3ZpZGVzIGZmbXBlZyAoY29tbW9uIHBhdGg6IC9vcHQvYmluL2ZmbXBlZykgb3Igc2V0IEZGTVBFR19QQVRILicsXG4gICk7XG59XG5cbi8qKlxuICogTGlzdHMgd2hpY2ggb2YgYSB2aWRlbydzIHBlci1zY2VuZSBLZW4tQnVybnMgbXA0IG9iamVjdHMgYWN0dWFsbHkgZXhpc3QgaW5cbiAqIFMzIHRvZGF5LCBrZXllZCBieSBmdWxsIG9iamVjdCBLZXkgKGUuZy4gXCJ1c2VySWQvdGltZXN0YW1wLnNjZW5lLTEubXA0XCIpLlxuICogU2luZ2xlIGV4aXN0ZW5jZSBzb3VyY2Ugb2YgdHJ1dGggcmV1c2VkIGJ5IGdldFZpZGVvRWZmZWN0VXJscyBhbmQgYnlcbiAqIGh5ZHJhdGVNYW5pZmVzdCAobWFuaWZlc3RVdGlscy50cykgc28gc2lnbmVkIFVSTHMgYXJlIG5ldmVyIGhhbmRlZCBvdXQgZm9yXG4gKiBzY2VuZXMgd2hvc2UgdmlkZW8gaGFzbid0IGJlZW4gZ2VuZXJhdGVkIHlldC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGxpc3RFeGlzdGluZ1NjZW5lTXA0S2V5cyhcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuKTogUHJvbWlzZTxTZXQ8c3RyaW5nPj4ge1xuICBjb25zdCBzM0NsaWVudCA9IG5ldyBTM0NsaWVudCh7XG4gICAgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxuICB9KTtcbiAgY29uc3QgbGlzdENvbW1hbmQgPSBuZXcgTGlzdE9iamVjdHNWMkNvbW1hbmQoe1xuICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgUHJlZml4OiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS1gLFxuICB9KTtcblxuICB0cnkge1xuICAgIGNvbnN0IGxpc3RSZXN1bHQgPSBhd2FpdCBzM0NsaWVudC5zZW5kKGxpc3RDb21tYW5kKTtcbiAgICBjb25zdCBrZXlzID0gKGxpc3RSZXN1bHQuQ29udGVudHMgfHwgW10pXG4gICAgICAubWFwKChvYmopID0+IG9iai5LZXkpXG4gICAgICAuZmlsdGVyKChrZXkpOiBrZXkgaXMgc3RyaW5nID0+ICEha2V5ICYmIGtleS5lbmRzV2l0aCgnLm1wNCcpKTtcbiAgICByZXR1cm4gbmV3IFNldChrZXlzKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBsaXN0aW5nIGV4aXN0aW5nIHNjZW5lIG1wNCBrZXlzOicsIGVycm9yKTtcbiAgICByZXR1cm4gbmV3IFNldCgpO1xuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRWaWRlb0VmZmVjdFVybHMoXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgc2NlbmVzOiBPbWl0PFNjZW5lLCAnZGVzY3JpcHRpb24nIHwgJ25hcnJhdGlvbic+W10sXG4gIHVzZXI6IFVzZXJJdGVtIHwgbnVsbCxcbik6IFByb21pc2U8QXJyYXk8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT4+IHtcbiAgY29uc3QgczNDbGllbnQgPSBuZXcgUzNDbGllbnQoe1xuICAgIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgfSk7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBleGlzdGluZ0tleXMgPSBhd2FpdCBsaXN0RXhpc3RpbmdTY2VuZU1wNEtleXModXNlcklkLCB0aW1lc3RhbXApO1xuXG4gICAgaWYgKGV4aXN0aW5nS2V5cy5zaXplID4gMCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIFZpZGVvIGVmZmVjdHMgYWxyZWFkeSBnZW5lcmF0ZWQgZm9yIHRoZSB0aW1lc3RhbXA6JyxcbiAgICAgICAgZXhpc3RpbmdLZXlzLnNpemUsXG4gICAgICAgICdmaWxlcyBmb3VuZCcsXG4gICAgICApO1xuXG4gICAgICAvLyBHZW5lcmF0ZSBzaWduZWQgVVJMcyBmb3IgZXhpc3RpbmcgdmlkZW8gZmlsZXNcbiAgICAgIGNvbnN0IHNpZ25lZFVybFByb21pc2VzID0gQXJyYXkuZnJvbShleGlzdGluZ0tleXMpLm1hcChhc3luYyAoa2V5KSA9PiB7XG4gICAgICAgIGNvbnN0IGdldE9iamVjdENvbW1hbmQgPSBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICBLZXk6IGtleSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3Qgc2lnbmVkVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKHMzQ2xpZW50LCBnZXRPYmplY3RDb21tYW5kLCB7XG4gICAgICAgICAgZXhwaXJlc0luOiAzNjAwMCwgLy8gMTAgaG91cnNcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gRXh0cmFjdCBmaWxlbmFtZSB3aXRob3V0IHVzZXIgcHJlZml4IChlLmcuLCBcIjEwMDQuc2NlbmUtMS5tcDRcIilcbiAgICAgICAgY29uc3QgZmlsZW5hbWUgPSBrZXkucmVwbGFjZShgJHt1c2VySWR9L2AsICcnKTtcblxuICAgICAgICByZXR1cm4geyBbZmlsZW5hbWVdOiBzaWduZWRVcmwgfTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gYXdhaXQgUHJvbWlzZS5hbGwoc2lnbmVkVXJsUHJvbWlzZXMpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gYXdhaXQgZ2VuZXJhdGVWaWRlb0VmZmVjdHMoc2NlbmVzLCB1c2VySWQsIHRpbWVzdGFtcCwgdXNlcik7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNoZWNraW5nIGV4aXN0aW5nIHZpZGVvIGVmZmVjdHM6JywgZXJyb3IpO1xuICAgIC8vIEZhbGxiYWNrIHRvIGdlbmVyYXRpbmcgbmV3IHZpZGVvIGVmZmVjdHNcbiAgICByZXR1cm4gYXdhaXQgZ2VuZXJhdGVWaWRlb0VmZmVjdHMoc2NlbmVzLCB1c2VySWQsIHRpbWVzdGFtcCwgdXNlcik7XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlVmlkZW9FZmZlY3RzKFxuICBzY2VuZXM6IE9taXQ8U2NlbmUsICdkZXNjcmlwdGlvbicgfCAnbmFycmF0aW9uJz5bXSxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICB1c2VyOiBVc2VySXRlbSB8IG51bGwsXG4pOiBQcm9taXNlPEFycmF5PHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0+PiB7XG4gIC8vIEZvcm1hdDogW3sgXCJ0aW1lc3RhbXAuc2NlbmUtaWQubXA0XCI6IFwic2lnbmVkLXVybFwiIH1dXG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ/CfjqwgR2VuZXJhdGluZyB2aWRlbyBlZmZlY3RzIGZvciBzY2VuZXMuLi4nKTtcblxuICAgIC8vIFByb2Nlc3MgYWxsIHNjZW5lcyBpbiBwYXJhbGxlbFxuICAgIGNvbnN0IHZpZGVvUHJvbWlzZXMgPSBzY2VuZXMubWFwKGFzeW5jIChzY2VuZSwgaSkgPT4ge1xuICAgICAgY29uc29sZS5sb2coYPCfjqwgUHJvY2Vzc2luZyBzY2VuZSAke2kgKyAxfWApO1xuXG4gICAgICAvLyBHZXQgdGhlIGltYWdlIFVSTCBmb3IgdGhpcyBzY2VuZVxuICAgICAgY29uc3QgaW1hZ2VLZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5wbmdgO1xuICAgICAgY29uc3QgaW1hZ2VVcmwgPSBhd2FpdCBnZXRJbWFnZVNpZ25lZFVybChpbWFnZUtleSk7XG5cbiAgICAgIGlmICghaW1hZ2VVcmwpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBObyBpbWFnZSBmb3VuZCBmb3Igc2NlbmUgJHtzY2VuZS5pZH1gKTtcbiAgICAgIH1cblxuICAgICAgLy8gR2VuZXJhdGUgdmlkZW8gd2l0aCBibHVyIGluL291dCBhbmQgY2FtZXJhIG1vdmVtZW50XG4gICAgICBjb25zdCB2aWRlb1NpZ25lZFVybCA9IGF3YWl0IGdlbmVyYXRlU2NlbmVWaWRlbyhcbiAgICAgICAgaW1hZ2VVcmwsXG4gICAgICAgIHNjZW5lLFxuICAgICAgICB1c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgdXNlcixcbiAgICAgICk7XG5cbiAgICAgIC8vIEV4dHJhY3QgZmlsZW5hbWUgd2l0aG91dCB1c2VyIHByZWZpeCAoZS5nLiwgXCIxMDA0LnNjZW5lLTEubXA0XCIpXG4gICAgICBjb25zdCBmaWxlbmFtZSA9IGAke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ubXA0YDtcblxuICAgICAgY29uc29sZS5sb2coYOKchSBTY2VuZSAke2kgKyAxfSB2aWRlbyBnZW5lcmF0ZWQ6ICR7ZmlsZW5hbWV9YCk7XG4gICAgICByZXR1cm4geyBbZmlsZW5hbWVdOiB2aWRlb1NpZ25lZFVybCB9O1xuICAgIH0pO1xuXG4gICAgY29uc3Qgc2V0dGxlZCA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZCh2aWRlb1Byb21pc2VzKTtcblxuICAgIGNvbnN0IGZhaWx1cmVzID0gc2V0dGxlZFxuICAgICAgLm1hcCgocmVzdWx0LCBpKSA9PiAoeyByZXN1bHQsIHNjZW5lSWQ6IHNjZW5lc1tpXS5pZCB9KSlcbiAgICAgIC5maWx0ZXIoXG4gICAgICAgIChcbiAgICAgICAgICBlbnRyeSxcbiAgICAgICAgKTogZW50cnkgaXMge1xuICAgICAgICAgIHJlc3VsdDogUHJvbWlzZVJlamVjdGVkUmVzdWx0O1xuICAgICAgICAgIHNjZW5lSWQ6IG51bWJlcjtcbiAgICAgICAgfSA9PiBlbnRyeS5yZXN1bHQuc3RhdHVzID09PSAncmVqZWN0ZWQnLFxuICAgICAgKTtcblxuICAgIGlmIChmYWlsdXJlcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBkZXRhaWxzID0gZmFpbHVyZXNcbiAgICAgICAgLm1hcCgoeyBzY2VuZUlkLCByZXN1bHQgfSkgPT4gYHNjZW5lICR7c2NlbmVJZH06ICR7cmVzdWx0LnJlYXNvbn1gKVxuICAgICAgICAuam9pbignOyAnKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBWaWRlbyBlZmZlY3RzIGZhaWxlZCBmb3IgJHtmYWlsdXJlcy5sZW5ndGh9IHNjZW5lKHMpOiAke2RldGFpbHN9YCk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8gZm9yICR7ZmFpbHVyZXMubGVuZ3RofSBzY2VuZShzKSDigJQgJHtkZXRhaWxzfWAsXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IHZpZGVvVXJscyA9IHNldHRsZWRcbiAgICAgIC5maWx0ZXIoXG4gICAgICAgIChyZXN1bHQpOiByZXN1bHQgaXMgUHJvbWlzZUZ1bGZpbGxlZFJlc3VsdDx7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9PiA9PlxuICAgICAgICAgIHJlc3VsdC5zdGF0dXMgPT09ICdmdWxmaWxsZWQnLFxuICAgICAgKVxuICAgICAgLm1hcCgocmVzdWx0KSA9PiByZXN1bHQudmFsdWUpO1xuXG4gICAgaWYgKHZpZGVvVXJscy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIHZpZGVvcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyB2aWRlb3Mgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCAke3ZpZGVvVXJscy5sZW5ndGh9IHZpZGVvIGNsaXBzIHdpdGggZWZmZWN0c2ApO1xuICAgIHJldHVybiB2aWRlb1VybHM7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlVmlkZW9FZmZlY3RzOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRJbWFnZVNpZ25lZFVybChpbWFnZUtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICBLZXk6IGltYWdlS2V5LFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGF3YWl0IGdldFNpZ25lZFVybChzMywgY29tbWFuZCwgeyBleHBpcmVzSW46IDM2MDAwIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBnZXR0aW5nIHNpZ25lZCBVUkwgZm9yICR7aW1hZ2VLZXl9OmAsIGVycm9yKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVNjZW5lVmlkZW8oXG4gIGltYWdlVXJsOiBzdHJpbmcsXG4gIHNjZW5lOiBPbWl0PFNjZW5lLCAnZGVzY3JpcHRpb24nIHwgJ25hcnJhdGlvbic+LFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHVzZXI6IFVzZXJJdGVtIHwgbnVsbCxcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIHRyeSB7XG4gICAgLy8gRG93bmxvYWQgdGhlIGltYWdlXG4gICAgY29uc29sZS5sb2coYPCfk6UgRG93bmxvYWRpbmcgaW1hZ2UgZnJvbTogJHtpbWFnZVVybH1gKTtcbiAgICBjb25zdCBpbWFnZVJlc3BvbnNlID0gYXdhaXQgYXhpb3MuZ2V0KGltYWdlVXJsLCB7XG4gICAgICByZXNwb25zZVR5cGU6ICdhcnJheWJ1ZmZlcicsXG4gICAgfSk7XG4gICAgY29uc3QgaW1hZ2VCdWZmZXIgPSBCdWZmZXIuZnJvbShpbWFnZVJlc3BvbnNlLmRhdGEpO1xuXG4gICAgLy8gQ3JlYXRlIHRlbXBvcmFyeSBmaWxlc1xuICAgIGNvbnN0IHRlbXBEaXIgPSAnL3RtcCc7XG4gICAgY29uc3QgaW5wdXRJbWFnZVBhdGggPSBwYXRoLmpvaW4odGVtcERpciwgYGlucHV0LSR7c2NlbmUuaWR9LnBuZ2ApO1xuICAgIGNvbnN0IG91dHB1dFZpZGVvUGF0aCA9IHBhdGguam9pbih0ZW1wRGlyLCBgb3V0cHV0LSR7c2NlbmUuaWR9Lm1wNGApO1xuXG4gICAgbGV0IHdhdGVybWFya1BhdGggPSAnJztcbiAgICAvLyBkb3dubG9hZCB0aGUgd2F0ZXJtYXJrLnBuZyBmcm9tIHZpcmFsIHNob3J0IHBhcnRzIGJ1Y2tldFxuICAgIGlmIChcbiAgICAgIHVzZXI/LnN1YnNjcmlwdGlvbj8ubW9kZSA9PT0gJ2ZyZWUnIHx8XG4gICAgICB1c2VyPy5zdWJzY3JpcHRpb24/LnN0YXR1cyA9PT0gJ2NhbmNlbGxlZCcgfHxcbiAgICAgIHVzZXI/LnN1YnNjcmlwdGlvbj8uc3RhdHVzID09PSAnZXhwaXJlZCdcbiAgICApIHtcbiAgICAgIGNvbnN0IHdhdGVybWFya0tleSA9ICd3YXRlcm1hcmsucG5nJztcbiAgICAgIGNvbnN0IHdhdGVybWFya1VybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgICAgczMsXG4gICAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogd2F0ZXJtYXJrS2V5LFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIGNvbnN0IHdhdGVybWFya1Jlc3BvbnNlID0gYXdhaXQgYXhpb3MuZ2V0KHdhdGVybWFya1VybCwge1xuICAgICAgICByZXNwb25zZVR5cGU6ICdhcnJheWJ1ZmZlcicsXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHdhdGVybWFya0J1ZmZlciA9IEJ1ZmZlci5mcm9tKHdhdGVybWFya1Jlc3BvbnNlLmRhdGEpO1xuXG4gICAgICAvLyBXcml0ZSB3YXRlcm1hcmsgdG8gdGVtcCBmaWxlXG4gICAgICB3YXRlcm1hcmtQYXRoID0gcGF0aC5qb2luKHRlbXBEaXIsIGB3YXRlcm1hcmstJHtzY2VuZS5pZH0ucG5nYCk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHdhdGVybWFya1BhdGgsIHdhdGVybWFya0J1ZmZlcik7XG4gICAgfVxuXG4gICAgLy8gV3JpdGUgaW1hZ2UgdG8gdGVtcCBmaWxlXG4gICAgZnMud3JpdGVGaWxlU3luYyhpbnB1dEltYWdlUGF0aCwgaW1hZ2VCdWZmZXIpO1xuXG4gICAgY29uc3QgZnJhbWVzID0gTWF0aC5mbG9vcihzY2VuZS5kdXJhdGlvbiAqIDI1KTtcbiAgICBjb25zdCBibHVySW5EdXJhdGlvbiA9IDAuMjtcbiAgICBjb25zdCB6b29tT3V0RnJhbWVzID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihibHVySW5EdXJhdGlvbiAqIDI1KSk7XG5cbiAgICAvLyBhZGQgbmVhciB5b3VyIG90aGVyIHBhcmFtc1xuICAgIGNvbnN0IG1vdmVSYWRpdXMgPSAyNTsgLy8gcHggKG1vcmUgaW50ZW50aW9uYWwgYW5kIHZpc2libGUpXG4gICAgY29uc3QgbW92ZVBlcmlvZCA9IDE4MDsgLy8gZnJhbWVzICh+Ny4ycyBAMjVmcHMpIC0gZmFzdGVyIG1vdmVtZW50XG5cbiAgICAvLyBkZXRlcm1pbmlzdGljYWxseSBjaG9vc2Ugb25lIG9mIHRocmVlIG1vdGlvbiB2YXJpYW50cyBwZXIgc2NlbmUgKGluZGV4LWJhc2VkKVxuICAgIGNvbnN0IHZhcmlhbnQgPSBzY2VuZS5pZCAlIDM7IC8vIDA6IGRyYW1hdGljIHBvcC1vdXQrZHJpZnQsIDE6IHN0cm9uZyB6b29tLWluLCAyOiBzdHJvbmcgem9vbS1vdXRcbiAgICBjb25zb2xlLmxvZyhg8J+OqCBNb3Rpb24gdmFyaWFudCBzZWxlY3RlZCAoaW5kZXgtYmFzZWQpOiAke3ZhcmlhbnR9YCk7XG5cbiAgICAvLyBNb3Rpb24gdmFyaWFudCBjb25maWd1cmF0aW9uc1xuICAgIGNvbnN0IG1vdGlvblZhcmlhbnRzID0ge1xuICAgICAgMDoge1xuICAgICAgICAvLyBWYXJpYW50IDA6IGRyYW1hdGljIHpvb20tb3V0IHBvcCB0aGVuIGhvbGQgem9vbSArIHByb25vdW5jZWQgY2lyY3VsYXIgZHJpZnRcbiAgICAgICAgem9vbTogYGlmKGx0ZShvblxcXFwsJHt6b29tT3V0RnJhbWVzfSlcXFxcLDEuMTUtKDAuMDgqb24vJHt6b29tT3V0RnJhbWVzfSlcXFxcLDEuMDgpYCxcbiAgICAgICAgeDogYGl3LzItKGl3L3pvb20vMikgKyBpZihndGUob25cXFxcLCR7em9vbU91dEZyYW1lc30pXFxcXCwgJHttb3ZlUmFkaXVzfSpjb3MoMipQSSoob24tJHt6b29tT3V0RnJhbWVzfSkvJHttb3ZlUGVyaW9kfSlcXFxcLCAwKWAsXG4gICAgICAgIHk6IGBpaC8yLShpaC96b29tLzIpICsgaWYoZ3RlKG9uXFxcXCwke3pvb21PdXRGcmFtZXN9KVxcXFwsICR7bW92ZVJhZGl1c30qc2luKDIqUEkqKG9uLSR7em9vbU91dEZyYW1lc30pLyR7bW92ZVBlcmlvZH0pXFxcXCwgMClgLFxuICAgICAgICBzdXBlcnNhbXBsZTogJzE0NDB4MjU2MCcsXG4gICAgICAgIHRtaXg6IFwiZnJhbWVzPTI6d2VpZ2h0cz0nMSAxJ1wiLFxuICAgICAgICBzY2FsZTogJ3NjYWxlPTcyMDoxMjgwOmZsYWdzPXNwbGluZTpzd3NfZGl0aGVyPW5vbmUnLFxuICAgICAgfSxcbiAgICAgIDE6IHtcbiAgICAgICAgLy8gVmFyaWFudCAxOiBzdHJvbmcgY29udGludW91cyB6b29tLWluIChLZW4gQnVybnMpICsgcHJvbm91bmNlZCBjaXJjdWxhciBkcmlmdFxuICAgICAgICB6b29tOiAnbWluKHBvdygxLjAwMTJcXFxcLG9uKVxcXFwsMS4xNSknLFxuICAgICAgICB4OiBgaXcvMi0oaXcvem9vbS8yKSArICR7bW92ZVJhZGl1c30qY29zKDIqUEkqb24vJHttb3ZlUGVyaW9kfSlgLFxuICAgICAgICB5OiBgaWgvMi0oaWgvem9vbS8yKSArICR7bW92ZVJhZGl1c30qc2luKDIqUEkqb24vJHttb3ZlUGVyaW9kfSlgLFxuICAgICAgICBzdXBlcnNhbXBsZTogJzE0NDB4MjU2MCcsXG4gICAgICAgIHRtaXg6IFwiZnJhbWVzPTI6d2VpZ2h0cz0nMSAxJ1wiLFxuICAgICAgICBzY2FsZTogJ3NjYWxlPTcyMDoxMjgwOmZsYWdzPWxhbmN6b3M6c3dzX2RpdGhlcj1ub25lJyxcbiAgICAgIH0sXG4gICAgICAyOiB7XG4gICAgICAgIC8vIFZhcmlhbnQgMjogc3Ryb25nIGNvbnRpbnVvdXMgem9vbS1vdXQgKyBwcm9ub3VuY2VkIGVsbGlwdGljYWwgZHJpZnRcbiAgICAgICAgem9vbTogYG1heCgxLjA1XFxcXCwgMS4xMiAtIDAuMDcqb24vJHtmcmFtZXN9KWAsXG4gICAgICAgIHg6IGBpdy8yLShpdy96b29tLzIpICsgJHttb3ZlUmFkaXVzfSpjb3MoMipQSSpvbi8ke21vdmVQZXJpb2R9KWAsXG4gICAgICAgIHk6IGBpaC8yLShpaC96b29tLzIpICsgKCR7bW92ZVJhZGl1c30vMS4yKSpzaW4oMipQSSpvbi8ke21vdmVQZXJpb2R9KWAsXG4gICAgICAgIHN1cGVyc2FtcGxlOiAnMTQ0MHgyNTYwJyxcbiAgICAgICAgdG1peDogXCJmcmFtZXM9Mjp3ZWlnaHRzPScxIDEnXCIsXG4gICAgICAgIHNjYWxlOiAnc2NhbGU9NzIwOjEyODA6ZmxhZ3M9bGFuY3pvczpzd3NfZGl0aGVyPW5vbmUnLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgY29uc3QgY29uZmlnID0gbW90aW9uVmFyaWFudHNbdmFyaWFudCBhcyBrZXlvZiB0eXBlb2YgbW90aW9uVmFyaWFudHNdO1xuXG4gICAgLy8gQnVpbGQgZmlsdGVyIGdyYXBoIGNvbmRpdGlvbmFsbHkgZGVwZW5kaW5nIG9uIHdhdGVybWFyayBhdmFpbGFiaWxpdHlcbiAgICBjb25zdCBoYXNXYXRlcm1hcmsgPSBCb29sZWFuKFxuICAgICAgd2F0ZXJtYXJrUGF0aCAmJiB3YXRlcm1hcmtQYXRoLnRyaW0oKS5sZW5ndGggPiAwLFxuICAgICk7XG5cbiAgICBjb25zdCBmaWx0ZXJDb21wbGV4ID0gaGFzV2F0ZXJtYXJrXG4gICAgICA/IGBbMDp2XXpvb21wYW49ej0nJHtjb25maWcuem9vbX0nOmQ9JHtmcmFtZXN9OmAgK1xuICAgICAgICBgeD0nJHtjb25maWcueH0nOmAgK1xuICAgICAgICBgeT0nJHtjb25maWcueX0nOmAgK1xuICAgICAgICBgcz0ke2NvbmZpZy5zdXBlcnNhbXBsZX0sYCArXG4gICAgICAgIGB0bWl4PSR7Y29uZmlnLnRtaXh9LGAgK1xuICAgICAgICBgZnBzPTI1LGAgK1xuICAgICAgICBgJHtjb25maWcuc2NhbGV9LGAgK1xuICAgICAgICBgc3BsaXRbYjBdW2IxXTtgICtcbiAgICAgICAgYFtiMV1ib3hibHVyPTg6MVtiYl07YCArXG4gICAgICAgIGBbYjBdW2JiXWJsZW5kPWFsbF9leHByPSdBKigxLW1heCgwXFwsMSAtIFQvJHtibHVySW5EdXJhdGlvbn0pKSArIEIqbWF4KDBcXCwxIC0gVC8ke2JsdXJJbkR1cmF0aW9ufSknW21haW5dO2AgK1xuICAgICAgICBgWzE6dl1zY2FsZT0yMDA6LTFbd2F0ZXJtYXJrXTtgICtcbiAgICAgICAgYFttYWluXVt3YXRlcm1hcmtdb3ZlcmxheT0oVy13KS8yOjEyW3ZdYFxuICAgICAgOiBgWzA6dl16b29tcGFuPXo9JyR7Y29uZmlnLnpvb219JzpkPSR7ZnJhbWVzfTpgICtcbiAgICAgICAgYHg9JyR7Y29uZmlnLnh9JzpgICtcbiAgICAgICAgYHk9JyR7Y29uZmlnLnl9JzpgICtcbiAgICAgICAgYHM9JHtjb25maWcuc3VwZXJzYW1wbGV9LGAgK1xuICAgICAgICBgdG1peD0ke2NvbmZpZy50bWl4fSxgICtcbiAgICAgICAgYGZwcz0yNSxgICtcbiAgICAgICAgYCR7Y29uZmlnLnNjYWxlfSxgICtcbiAgICAgICAgYHNwbGl0W2IwXVtiMV07YCArXG4gICAgICAgIGBbYjFdYm94Ymx1cj04OjFbYmJdO2AgK1xuICAgICAgICBgW2IwXVtiYl1ibGVuZD1hbGxfZXhwcj0nQSooMS1tYXgoMFxcLDEgLSBULyR7Ymx1ckluRHVyYXRpb259KSkgKyBCKm1heCgwXFwsMSAtIFQvJHtibHVySW5EdXJhdGlvbn0pJ1t2XWA7XG5cbiAgICBjb25zdCBmZm1wZWdQYXRoID0gcmVzb2x2ZUZmbXBlZ1BhdGgoKTtcblxuICAgIGNvbnN0IGZmbXBlZ0FyZ3MgPSBoYXNXYXRlcm1hcmtcbiAgICAgID8gW1xuICAgICAgICAgICctbG9vcCcsXG4gICAgICAgICAgJzEnLFxuICAgICAgICAgICctaScsXG4gICAgICAgICAgaW5wdXRJbWFnZVBhdGgsXG4gICAgICAgICAgJy1sb29wJyxcbiAgICAgICAgICAnMScsXG4gICAgICAgICAgJy1pJyxcbiAgICAgICAgICB3YXRlcm1hcmtQYXRoLFxuICAgICAgICAgICctZmlsdGVyX2NvbXBsZXgnLFxuICAgICAgICAgIGZpbHRlckNvbXBsZXgsXG4gICAgICAgICAgJy1tYXAnLFxuICAgICAgICAgICdbdl0nLFxuICAgICAgICAgICctYzp2JyxcbiAgICAgICAgICAnbGlieDI2NCcsXG4gICAgICAgICAgJy1wcmVzZXQnLFxuICAgICAgICAgICd2ZXJ5ZmFzdCcsXG4gICAgICAgICAgJy1jcmYnLFxuICAgICAgICAgICcyMycsXG4gICAgICAgICAgJy1waXhfZm10JyxcbiAgICAgICAgICAneXV2NDIwcCcsXG4gICAgICAgICAgJy10aHJlYWRzJyxcbiAgICAgICAgICAnMCcsXG4gICAgICAgICAgJy10JyxcbiAgICAgICAgICBzY2VuZS5kdXJhdGlvbi50b1N0cmluZygpLFxuICAgICAgICAgICcteScsXG4gICAgICAgICAgb3V0cHV0VmlkZW9QYXRoLFxuICAgICAgICBdXG4gICAgICA6IFtcbiAgICAgICAgICAnLWxvb3AnLFxuICAgICAgICAgICcxJyxcbiAgICAgICAgICAnLWknLFxuICAgICAgICAgIGlucHV0SW1hZ2VQYXRoLFxuICAgICAgICAgICctZmlsdGVyX2NvbXBsZXgnLFxuICAgICAgICAgIGZpbHRlckNvbXBsZXgsXG4gICAgICAgICAgJy1tYXAnLFxuICAgICAgICAgICdbdl0nLFxuICAgICAgICAgICctYzp2JyxcbiAgICAgICAgICAnbGlieDI2NCcsXG4gICAgICAgICAgJy1wcmVzZXQnLFxuICAgICAgICAgICd2ZXJ5ZmFzdCcsXG4gICAgICAgICAgJy1jcmYnLFxuICAgICAgICAgICcyMycsXG4gICAgICAgICAgJy1waXhfZm10JyxcbiAgICAgICAgICAneXV2NDIwcCcsXG4gICAgICAgICAgJy10aHJlYWRzJyxcbiAgICAgICAgICAnMCcsXG4gICAgICAgICAgJy10JyxcbiAgICAgICAgICBzY2VuZS5kdXJhdGlvbi50b1N0cmluZygpLFxuICAgICAgICAgICcteScsXG4gICAgICAgICAgb3V0cHV0VmlkZW9QYXRoLFxuICAgICAgICBdO1xuXG4gICAgY29uc29sZS5sb2coYPCfjqwgUnVubmluZyBGRm1wZWcgY29tbWFuZCBmb3Igc2NlbmUgJHtzY2VuZS5pZCArIDF9OmApO1xuICAgIGNvbnNvbGUubG9nKGDwn46sIFNjZW5lIGR1cmF0aW9uOiAke3NjZW5lLmR1cmF0aW9ufXNgKTtcbiAgICBjb25zb2xlLmxvZyhmZm1wZWdQYXRoLCBmZm1wZWdBcmdzLmpvaW4oJyAnKSk7XG5cbiAgICBjb25zdCB7IHN0ZG91dCwgc3RkZXJyIH0gPSBhd2FpdCBleGVjRmlsZUFzeW5jKGZmbXBlZ1BhdGgsIGZmbXBlZ0FyZ3MsIHtcbiAgICAgIG1heEJ1ZmZlcjogMTAyNCAqIDEwMjQgKiAxMCxcbiAgICB9KTtcblxuICAgIGlmIChzdGRlcnIpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdGRm1wZWcgc3RkZXJyOicsIHN0ZGVycik7XG4gICAgfVxuXG4gICAgaWYgKHN0ZG91dCkge1xuICAgICAgY29uc29sZS5sb2coJ0ZGbXBlZyBzdGRvdXQ6Jywgc3Rkb3V0KTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiBvdXRwdXQgZmlsZSBleGlzdHNcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMob3V0cHV0VmlkZW9QYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGRm1wZWcgZGlkIG5vdCBnZW5lcmF0ZSBvdXRwdXQgdmlkZW8gZmlsZScpO1xuICAgIH1cblxuICAgIC8vIFVwbG9hZCB0byBTM1xuICAgIGNvbnN0IHZpZGVvS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ubXA0YDtcbiAgICBjb25zdCB2aWRlb0J1ZmZlciA9IGZzLnJlYWRGaWxlU3luYyhvdXRwdXRWaWRlb1BhdGgpO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBg4piB77iPIFVwbG9hZGluZyB2aWRlbyB0byBTMzogJHtwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRX0vJHt2aWRlb0tleX1gLFxuICAgICk7XG5cbiAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IHZpZGVvS2V5LFxuICAgICAgICBCb2R5OiB2aWRlb0J1ZmZlcixcbiAgICAgICAgQ29udGVudFR5cGU6ICd2aWRlby9tcDQnLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIENsZWFuIHVwIHRlbXBvcmFyeSBmaWxlc1xuICAgIHRyeSB7XG4gICAgICBmcy51bmxpbmtTeW5jKGlucHV0SW1hZ2VQYXRoKTtcbiAgICAgIGlmIChoYXNXYXRlcm1hcmsgJiYgZnMuZXhpc3RzU3luYyh3YXRlcm1hcmtQYXRoKSkge1xuICAgICAgICBmcy51bmxpbmtTeW5jKHdhdGVybWFya1BhdGgpO1xuICAgICAgfVxuICAgICAgZnMudW5saW5rU3luYyhvdXRwdXRWaWRlb1BhdGgpO1xuICAgIH0gY2F0Y2ggKGNsZWFudXBFcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAn4pqg77iPIFdhcm5pbmc6IENvdWxkIG5vdCBjbGVhbiB1cCB0ZW1wb3JhcnkgZmlsZXM6JyxcbiAgICAgICAgY2xlYW51cEVycm9yLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhg4pyFIFZpZGVvIHVwbG9hZGVkIHRvIFMzOiAke3ZpZGVvS2V5fWApO1xuXG4gICAgLy8gR2VuZXJhdGUgc2lnbmVkIFVSTCBmb3IgdGhlIHVwbG9hZGVkIHZpZGVvXG4gICAgY29uc3QgdmlkZW9TaWduZWRVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoXG4gICAgICBzMyxcbiAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiB2aWRlb0tleSxcbiAgICAgIH0pLFxuICAgICAgeyBleHBpcmVzSW46IDM2MDAwIH0sIC8vIDEwIGhvdXJzIGV4cGlyYXRpb25cbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coYOKchSBWaWRlbyBzaWduZWQgVVJMIGdlbmVyYXRlZCBmb3Igc2NlbmUgJHtzY2VuZS5pZCArIDF9YCk7XG4gICAgcmV0dXJuIHZpZGVvU2lnbmVkVXJsO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICBg4p2MIEVycm9yIGdlbmVyYXRpbmcgdmlkZW8gZm9yIHNjZW5lICR7c2NlbmUuaWQgKyAxfTpgLFxuICAgICAgZXJyb3IsXG4gICAgKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19