"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listExistingSceneMp4Keys = listExistingSceneMp4Keys;
exports.getVideoEffectUrls = getVideoEffectUrls;
exports.generateVideoEffects = generateVideoEffects;
exports.getImageSignedUrl = getImageSignedUrl;
exports.generateSceneVideo = generateSceneVideo;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const axios_1 = require("axios");
const fs = require("fs");
const path = require("path");
const util_1 = require("util");
const child_process_1 = require("child_process");
const ffmpeg_1 = require("./ffmpeg");
const s3Uploader_1 = require("./s3Uploader");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
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
            try {
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
            catch (watermarkError) {
                console.error('⚠️ Failed to fetch watermark, continuing without it:', watermarkError);
                watermarkPath = '';
            }
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
        const ffmpegPath = (0, ffmpeg_1.resolveFfmpegPath)();
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
        const cleanupTempFiles = () => {
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
        };
        const videoKey = `${userId}/${timestamp}.scene-${scene.id}.mp4`;
        // Runway's animate-scene flow uploads its clip to this exact same key,
        // and can complete while this Ken-Burns render (kicked off at video
        // creation time) is still in flight. Re-check the manifest right before
        // uploading so the slower writer never clobbers the animated clip.
        const manifest = await (0, s3Uploader_1.getObjectFromS3)(`${userId}/${timestamp}.manifest.json`).catch(() => null);
        const manifestScene = manifest?.scenes?.find((s) => s.id === scene.id);
        if (manifestScene?.animated) {
            console.warn(`⚠️ Scene ${scene.id} was animated while its Ken-Burns clip was rendering — skipping upload to avoid overwriting the animation.`);
            cleanupTempFiles();
            return await (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({
                Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                Key: videoKey,
            }), { expiresIn: 36000 });
        }
        // Upload to S3
        const videoBuffer = fs.readFileSync(outputVideoPath);
        console.log(`☁️ Uploading video to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${videoKey}`);
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: videoKey,
            Body: videoBuffer,
            ContentType: 'video/mp4',
        }));
        cleanupTempFiles();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9FZmZlY3RzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmlkZW9FZmZlY3RzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBa0NBLDREQXNCQztBQUVELGdEQThDQztBQUVELG9EQStFQztBQUVELDhDQWNDO0FBRUQsZ0RBaVNDO0FBNWVELGtEQUs0QjtBQUM1Qix3RUFBNkQ7QUFDN0QsaUNBQTBCO0FBQzFCLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFDN0IsK0JBQWlDO0FBQ2pDLGlEQUErQztBQUUvQyxxQ0FBNkM7QUFDN0MsNkNBQStDO0FBRS9DLE1BQU0sU0FBUyxHQUFHLElBQUEsZ0JBQVMsRUFBQyxvQkFBSSxDQUFDLENBQUM7QUFDbEMsTUFBTSxhQUFhLEdBQUcsSUFBQSxnQkFBUyxFQUFDLHdCQUFRLENBQUMsQ0FBQztBQUMxQyxNQUFNLEVBQUUsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVyxFQUFFLENBQUMsQ0FBQztBQVMzRTs7Ozs7O0dBTUc7QUFDSSxLQUFLLFVBQVUsd0JBQXdCLENBQzVDLE1BQWMsRUFDZCxTQUFpQjtJQUVqQixNQUFNLFFBQVEsR0FBRyxJQUFJLG9CQUFRLENBQUM7UUFDNUIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVc7S0FDOUMsQ0FBQyxDQUFDO0lBQ0gsTUFBTSxXQUFXLEdBQUcsSUFBSSxnQ0FBb0IsQ0FBQztRQUMzQyxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUI7UUFDM0MsTUFBTSxFQUFFLEdBQUcsTUFBTSxJQUFJLFNBQVMsU0FBUztLQUN4QyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUM7UUFDSCxNQUFNLFVBQVUsR0FBRyxNQUFNLFFBQVEsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDcEQsTUFBTSxJQUFJLEdBQUcsQ0FBQyxVQUFV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QztRQUVyRCxPQUFPLENBQUMsR0FBRyxDQUNULDZCQUE2QixPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QixJQUFJLFFBQVEsRUFBRSxDQUMvRSxDQUFDO1FBRUYsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUNYLElBQUksNEJBQWdCLENBQUM7WUFDbkIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCO1lBQzNDLEdBQUcsRUFBRSxRQUFRO1lBQ2IsSUFBSSxFQUFFLFdBQVc7WUFDakIsV0FBVyxFQUFFLFdBQVc7U0FDekIsQ0FBQyxDQUNILENBQUM7UUFFRixnQkFBZ0IsRUFBRSxDQUFDO1FBRW5CLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFFbkQsNkNBQTZDO1FBQzdDLE1BQU0sY0FBYyxHQUFHLE1BQU0sSUFBQSxtQ0FBWSxFQUN2QyxFQUFFLEVBQ0YsSUFBSSw0QkFBZ0IsQ0FBQztZQUNuQixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUI7WUFDM0MsR0FBRyxFQUFFLFFBQVE7U0FDZCxDQUFDLEVBQ0YsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQ3JCLENBQUM7UUFFRixPQUFPLENBQUMsR0FBRyxDQUFDLDBDQUEwQyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdEUsT0FBTyxjQUFjLENBQUM7SUFDeEIsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUNYLHNDQUFzQyxLQUFLLENBQUMsRUFBRSxHQUFHLENBQUMsR0FBRyxFQUNyRCxLQUFLLENBQ04sQ0FBQztRQUNGLE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBTM0NsaWVudCxcbiAgUHV0T2JqZWN0Q29tbWFuZCxcbiAgR2V0T2JqZWN0Q29tbWFuZCxcbiAgTGlzdE9iamVjdHNWMkNvbW1hbmQsXG59IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zMyc7XG5pbXBvcnQgeyBnZXRTaWduZWRVcmwgfSBmcm9tICdAYXdzLXNkay9zMy1yZXF1ZXN0LXByZXNpZ25lcic7XG5pbXBvcnQgYXhpb3MgZnJvbSAnYXhpb3MnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IHByb21pc2lmeSB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgZXhlYywgZXhlY0ZpbGUgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IFVzZXJJdGVtIH0gZnJvbSAnLi91c2VyJztcbmltcG9ydCB7IHJlc29sdmVGZm1wZWdQYXRoIH0gZnJvbSAnLi9mZm1wZWcnO1xuaW1wb3J0IHsgZ2V0T2JqZWN0RnJvbVMzIH0gZnJvbSAnLi9zM1VwbG9hZGVyJztcblxuY29uc3QgZXhlY0FzeW5jID0gcHJvbWlzaWZ5KGV4ZWMpO1xuY29uc3QgZXhlY0ZpbGVBc3luYyA9IHByb21pc2lmeShleGVjRmlsZSk7XG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyB9KTtcblxuZXhwb3J0IGludGVyZmFjZSBTY2VuZSB7XG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIG5hcnJhdGlvbjogc3RyaW5nO1xuICBpZDogbnVtYmVyO1xufVxuXG4vKipcbiAqIExpc3RzIHdoaWNoIG9mIGEgdmlkZW8ncyBwZXItc2NlbmUgS2VuLUJ1cm5zIG1wNCBvYmplY3RzIGFjdHVhbGx5IGV4aXN0IGluXG4gKiBTMyB0b2RheSwga2V5ZWQgYnkgZnVsbCBvYmplY3QgS2V5IChlLmcuIFwidXNlcklkL3RpbWVzdGFtcC5zY2VuZS0xLm1wNFwiKS5cbiAqIFNpbmdsZSBleGlzdGVuY2Ugc291cmNlIG9mIHRydXRoIHJldXNlZCBieSBnZXRWaWRlb0VmZmVjdFVybHMgYW5kIGJ5XG4gKiBoeWRyYXRlTWFuaWZlc3QgKG1hbmlmZXN0VXRpbHMudHMpIHNvIHNpZ25lZCBVUkxzIGFyZSBuZXZlciBoYW5kZWQgb3V0IGZvclxuICogc2NlbmVzIHdob3NlIHZpZGVvIGhhc24ndCBiZWVuIGdlbmVyYXRlZCB5ZXQuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsaXN0RXhpc3RpbmdTY2VuZU1wNEtleXMoXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbik6IFByb21pc2U8U2V0PHN0cmluZz4+IHtcbiAgY29uc3QgczNDbGllbnQgPSBuZXcgUzNDbGllbnQoe1xuICAgIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgfSk7XG4gIGNvbnN0IGxpc3RDb21tYW5kID0gbmV3IExpc3RPYmplY3RzVjJDb21tYW5kKHtcbiAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgIFByZWZpeDogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtYCxcbiAgfSk7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBsaXN0UmVzdWx0ID0gYXdhaXQgczNDbGllbnQuc2VuZChsaXN0Q29tbWFuZCk7XG4gICAgY29uc3Qga2V5cyA9IChsaXN0UmVzdWx0LkNvbnRlbnRzIHx8IFtdKVxuICAgICAgLm1hcCgob2JqKSA9PiBvYmouS2V5KVxuICAgICAgLmZpbHRlcigoa2V5KToga2V5IGlzIHN0cmluZyA9PiAhIWtleSAmJiBrZXkuZW5kc1dpdGgoJy5tcDQnKSk7XG4gICAgcmV0dXJuIG5ldyBTZXQoa2V5cyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgbGlzdGluZyBleGlzdGluZyBzY2VuZSBtcDQga2V5czonLCBlcnJvcik7XG4gICAgcmV0dXJuIG5ldyBTZXQoKTtcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0VmlkZW9FZmZlY3RVcmxzKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHNjZW5lczogT21pdDxTY2VuZSwgJ2Rlc2NyaXB0aW9uJyB8ICduYXJyYXRpb24nPltdLFxuICB1c2VyOiBVc2VySXRlbSB8IG51bGwsXG4pOiBQcm9taXNlPEFycmF5PHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0+PiB7XG4gIGNvbnN0IHMzQ2xpZW50ID0gbmV3IFMzQ2xpZW50KHtcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScsXG4gIH0pO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgZXhpc3RpbmdLZXlzID0gYXdhaXQgbGlzdEV4aXN0aW5nU2NlbmVNcDRLZXlzKHVzZXJJZCwgdGltZXN0YW1wKTtcblxuICAgIGlmIChleGlzdGluZ0tleXMuc2l6ZSA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBWaWRlbyBlZmZlY3RzIGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wOicsXG4gICAgICAgIGV4aXN0aW5nS2V5cy5zaXplLFxuICAgICAgICAnZmlsZXMgZm91bmQnLFxuICAgICAgKTtcblxuICAgICAgLy8gR2VuZXJhdGUgc2lnbmVkIFVSTHMgZm9yIGV4aXN0aW5nIHZpZGVvIGZpbGVzXG4gICAgICBjb25zdCBzaWduZWRVcmxQcm9taXNlcyA9IEFycmF5LmZyb20oZXhpc3RpbmdLZXlzKS5tYXAoYXN5bmMgKGtleSkgPT4ge1xuICAgICAgICBjb25zdCBnZXRPYmplY3RDb21tYW5kID0gbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgS2V5OiBrZXksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHNpZ25lZFVybCA9IGF3YWl0IGdldFNpZ25lZFVybChzM0NsaWVudCwgZ2V0T2JqZWN0Q29tbWFuZCwge1xuICAgICAgICAgIGV4cGlyZXNJbjogMzYwMDAsIC8vIDEwIGhvdXJzXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEV4dHJhY3QgZmlsZW5hbWUgd2l0aG91dCB1c2VyIHByZWZpeCAoZS5nLiwgXCIxMDA0LnNjZW5lLTEubXA0XCIpXG4gICAgICAgIGNvbnN0IGZpbGVuYW1lID0ga2V5LnJlcGxhY2UoYCR7dXNlcklkfS9gLCAnJyk7XG5cbiAgICAgICAgcmV0dXJuIHsgW2ZpbGVuYW1lXTogc2lnbmVkVXJsIH07XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIGF3YWl0IFByb21pc2UuYWxsKHNpZ25lZFVybFByb21pc2VzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGF3YWl0IGdlbmVyYXRlVmlkZW9FZmZlY3RzKHNjZW5lcywgdXNlcklkLCB0aW1lc3RhbXAsIHVzZXIpO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjaGVja2luZyBleGlzdGluZyB2aWRlbyBlZmZlY3RzOicsIGVycm9yKTtcbiAgICAvLyBGYWxsYmFjayB0byBnZW5lcmF0aW5nIG5ldyB2aWRlbyBlZmZlY3RzXG4gICAgcmV0dXJuIGF3YWl0IGdlbmVyYXRlVmlkZW9FZmZlY3RzKHNjZW5lcywgdXNlcklkLCB0aW1lc3RhbXAsIHVzZXIpO1xuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVZpZGVvRWZmZWN0cyhcbiAgc2NlbmVzOiBPbWl0PFNjZW5lLCAnZGVzY3JpcHRpb24nIHwgJ25hcnJhdGlvbic+W10sXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgdXNlcjogVXNlckl0ZW0gfCBudWxsLFxuKTogUHJvbWlzZTxBcnJheTx7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9Pj4ge1xuICAvLyBGb3JtYXQ6IFt7IFwidGltZXN0YW1wLnNjZW5lLWlkLm1wNFwiOiBcInNpZ25lZC11cmxcIiB9XVxuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKCfwn46sIEdlbmVyYXRpbmcgdmlkZW8gZWZmZWN0cyBmb3Igc2NlbmVzLi4uJyk7XG5cbiAgICAvLyBQcm9jZXNzIGFsbCBzY2VuZXMgaW4gcGFyYWxsZWxcbiAgICBjb25zdCB2aWRlb1Byb21pc2VzID0gc2NlbmVzLm1hcChhc3luYyAoc2NlbmUsIGkpID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn46sIFByb2Nlc3Npbmcgc2NlbmUgJHtpICsgMX1gKTtcblxuICAgICAgLy8gR2V0IHRoZSBpbWFnZSBVUkwgZm9yIHRoaXMgc2NlbmVcbiAgICAgIGNvbnN0IGltYWdlS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ucG5nYDtcbiAgICAgIGNvbnN0IGltYWdlVXJsID0gYXdhaXQgZ2V0SW1hZ2VTaWduZWRVcmwoaW1hZ2VLZXkpO1xuXG4gICAgICBpZiAoIWltYWdlVXJsKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gaW1hZ2UgZm91bmQgZm9yIHNjZW5lICR7c2NlbmUuaWR9YCk7XG4gICAgICB9XG5cbiAgICAgIC8vIEdlbmVyYXRlIHZpZGVvIHdpdGggYmx1ciBpbi9vdXQgYW5kIGNhbWVyYSBtb3ZlbWVudFxuICAgICAgY29uc3QgdmlkZW9TaWduZWRVcmwgPSBhd2FpdCBnZW5lcmF0ZVNjZW5lVmlkZW8oXG4gICAgICAgIGltYWdlVXJsLFxuICAgICAgICBzY2VuZSxcbiAgICAgICAgdXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgIHVzZXIsXG4gICAgICApO1xuXG4gICAgICAvLyBFeHRyYWN0IGZpbGVuYW1lIHdpdGhvdXQgdXNlciBwcmVmaXggKGUuZy4sIFwiMTAwNC5zY2VuZS0xLm1wNFwiKVxuICAgICAgY29uc3QgZmlsZW5hbWUgPSBgJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wNGA7XG5cbiAgICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtpICsgMX0gdmlkZW8gZ2VuZXJhdGVkOiAke2ZpbGVuYW1lfWApO1xuICAgICAgcmV0dXJuIHsgW2ZpbGVuYW1lXTogdmlkZW9TaWduZWRVcmwgfTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHNldHRsZWQgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQodmlkZW9Qcm9taXNlcyk7XG5cbiAgICBjb25zdCBmYWlsdXJlcyA9IHNldHRsZWRcbiAgICAgIC5tYXAoKHJlc3VsdCwgaSkgPT4gKHsgcmVzdWx0LCBzY2VuZUlkOiBzY2VuZXNbaV0uaWQgfSkpXG4gICAgICAuZmlsdGVyKFxuICAgICAgICAoXG4gICAgICAgICAgZW50cnksXG4gICAgICAgICk6IGVudHJ5IGlzIHtcbiAgICAgICAgICByZXN1bHQ6IFByb21pc2VSZWplY3RlZFJlc3VsdDtcbiAgICAgICAgICBzY2VuZUlkOiBudW1iZXI7XG4gICAgICAgIH0gPT4gZW50cnkucmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJyxcbiAgICAgICk7XG5cbiAgICBpZiAoZmFpbHVyZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgZGV0YWlscyA9IGZhaWx1cmVzXG4gICAgICAgIC5tYXAoKHsgc2NlbmVJZCwgcmVzdWx0IH0pID0+IGBzY2VuZSAke3NjZW5lSWR9OiAke3Jlc3VsdC5yZWFzb259YClcbiAgICAgICAgLmpvaW4oJzsgJyk7XG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgVmlkZW8gZWZmZWN0cyBmYWlsZWQgZm9yICR7ZmFpbHVyZXMubGVuZ3RofSBzY2VuZShzKTogJHtkZXRhaWxzfWApO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgRmFpbGVkIHRvIGdlbmVyYXRlIHZpZGVvIGZvciAke2ZhaWx1cmVzLmxlbmd0aH0gc2NlbmUocykg4oCUICR7ZGV0YWlsc31gLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCB2aWRlb1VybHMgPSBzZXR0bGVkXG4gICAgICAuZmlsdGVyKFxuICAgICAgICAocmVzdWx0KTogcmVzdWx0IGlzIFByb21pc2VGdWxmaWxsZWRSZXN1bHQ8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT4gPT5cbiAgICAgICAgICByZXN1bHQuc3RhdHVzID09PSAnZnVsZmlsbGVkJyxcbiAgICAgIClcbiAgICAgIC5tYXAoKHJlc3VsdCkgPT4gcmVzdWx0LnZhbHVlKTtcblxuICAgIGlmICh2aWRlb1VybHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyB2aWRlb3Mgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gdmlkZW9zIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQgJHt2aWRlb1VybHMubGVuZ3RofSB2aWRlbyBjbGlwcyB3aXRoIGVmZmVjdHNgKTtcbiAgICByZXR1cm4gdmlkZW9VcmxzO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBnZW5lcmF0ZVZpZGVvRWZmZWN0czonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEltYWdlU2lnbmVkVXJsKFxuICBpbWFnZUtleTogc3RyaW5nLFxuKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICBLZXk6IGltYWdlS2V5LFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGF3YWl0IGdldFNpZ25lZFVybChzMywgY29tbWFuZCwgeyBleHBpcmVzSW46IDM2MDAwIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBnZXR0aW5nIHNpZ25lZCBVUkwgZm9yICR7aW1hZ2VLZXl9OmAsIGVycm9yKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVTY2VuZVZpZGVvKFxuICBpbWFnZVVybDogc3RyaW5nLFxuICBzY2VuZTogT21pdDxTY2VuZSwgJ2Rlc2NyaXB0aW9uJyB8ICduYXJyYXRpb24nPixcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICB1c2VyOiBVc2VySXRlbSB8IG51bGwsXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICB0cnkge1xuICAgIC8vIERvd25sb2FkIHRoZSBpbWFnZVxuICAgIGNvbnNvbGUubG9nKGDwn5OlIERvd25sb2FkaW5nIGltYWdlIGZyb206ICR7aW1hZ2VVcmx9YCk7XG4gICAgY29uc3QgaW1hZ2VSZXNwb25zZSA9IGF3YWl0IGF4aW9zLmdldChpbWFnZVVybCwge1xuICAgICAgcmVzcG9uc2VUeXBlOiAnYXJyYXlidWZmZXInLFxuICAgIH0pO1xuICAgIGNvbnN0IGltYWdlQnVmZmVyID0gQnVmZmVyLmZyb20oaW1hZ2VSZXNwb25zZS5kYXRhKTtcblxuICAgIC8vIENyZWF0ZSB0ZW1wb3JhcnkgZmlsZXNcbiAgICBjb25zdCB0ZW1wRGlyID0gJy90bXAnO1xuICAgIGNvbnN0IGlucHV0SW1hZ2VQYXRoID0gcGF0aC5qb2luKHRlbXBEaXIsIGBpbnB1dC0ke3NjZW5lLmlkfS5wbmdgKTtcbiAgICBjb25zdCBvdXRwdXRWaWRlb1BhdGggPSBwYXRoLmpvaW4odGVtcERpciwgYG91dHB1dC0ke3NjZW5lLmlkfS5tcDRgKTtcblxuICAgIGxldCB3YXRlcm1hcmtQYXRoID0gJyc7XG4gICAgLy8gZG93bmxvYWQgdGhlIHdhdGVybWFyay5wbmcgZnJvbSB2aXJhbCBzaG9ydCBwYXJ0cyBidWNrZXRcbiAgICBpZiAoXG4gICAgICB1c2VyPy5zdWJzY3JpcHRpb24/Lm1vZGUgPT09ICdmcmVlJyB8fFxuICAgICAgdXNlcj8uc3Vic2NyaXB0aW9uPy5zdGF0dXMgPT09ICdjYW5jZWxsZWQnIHx8XG4gICAgICB1c2VyPy5zdWJzY3JpcHRpb24/LnN0YXR1cyA9PT0gJ2V4cGlyZWQnXG4gICAgKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB3YXRlcm1hcmtLZXkgPSAnd2F0ZXJtYXJrLnBuZyc7XG4gICAgICAgIGNvbnN0IHdhdGVybWFya1VybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgICAgICBzMyxcbiAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgICAgS2V5OiB3YXRlcm1hcmtLZXksXG4gICAgICAgICAgfSksXG4gICAgICAgICk7XG5cbiAgICAgICAgY29uc3Qgd2F0ZXJtYXJrUmVzcG9uc2UgPSBhd2FpdCBheGlvcy5nZXQod2F0ZXJtYXJrVXJsLCB7XG4gICAgICAgICAgcmVzcG9uc2VUeXBlOiAnYXJyYXlidWZmZXInLFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3Qgd2F0ZXJtYXJrQnVmZmVyID0gQnVmZmVyLmZyb20od2F0ZXJtYXJrUmVzcG9uc2UuZGF0YSk7XG5cbiAgICAgICAgLy8gV3JpdGUgd2F0ZXJtYXJrIHRvIHRlbXAgZmlsZVxuICAgICAgICB3YXRlcm1hcmtQYXRoID0gcGF0aC5qb2luKHRlbXBEaXIsIGB3YXRlcm1hcmstJHtzY2VuZS5pZH0ucG5nYCk7XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMod2F0ZXJtYXJrUGF0aCwgd2F0ZXJtYXJrQnVmZmVyKTtcbiAgICAgIH0gY2F0Y2ggKHdhdGVybWFya0Vycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgJ+KaoO+4jyBGYWlsZWQgdG8gZmV0Y2ggd2F0ZXJtYXJrLCBjb250aW51aW5nIHdpdGhvdXQgaXQ6JyxcbiAgICAgICAgICB3YXRlcm1hcmtFcnJvcixcbiAgICAgICAgKTtcbiAgICAgICAgd2F0ZXJtYXJrUGF0aCA9ICcnO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFdyaXRlIGltYWdlIHRvIHRlbXAgZmlsZVxuICAgIGZzLndyaXRlRmlsZVN5bmMoaW5wdXRJbWFnZVBhdGgsIGltYWdlQnVmZmVyKTtcblxuICAgIGNvbnN0IGZyYW1lcyA9IE1hdGguZmxvb3Ioc2NlbmUuZHVyYXRpb24gKiAyNSk7XG4gICAgY29uc3QgYmx1ckluRHVyYXRpb24gPSAwLjI7XG4gICAgY29uc3Qgem9vbU91dEZyYW1lcyA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3IoYmx1ckluRHVyYXRpb24gKiAyNSkpO1xuXG4gICAgLy8gYWRkIG5lYXIgeW91ciBvdGhlciBwYXJhbXNcbiAgICBjb25zdCBtb3ZlUmFkaXVzID0gMjU7IC8vIHB4IChtb3JlIGludGVudGlvbmFsIGFuZCB2aXNpYmxlKVxuICAgIGNvbnN0IG1vdmVQZXJpb2QgPSAxODA7IC8vIGZyYW1lcyAofjcuMnMgQDI1ZnBzKSAtIGZhc3RlciBtb3ZlbWVudFxuXG4gICAgLy8gZGV0ZXJtaW5pc3RpY2FsbHkgY2hvb3NlIG9uZSBvZiB0aHJlZSBtb3Rpb24gdmFyaWFudHMgcGVyIHNjZW5lIChpbmRleC1iYXNlZClcbiAgICBjb25zdCB2YXJpYW50ID0gc2NlbmUuaWQgJSAzOyAvLyAwOiBkcmFtYXRpYyBwb3Atb3V0K2RyaWZ0LCAxOiBzdHJvbmcgem9vbS1pbiwgMjogc3Ryb25nIHpvb20tb3V0XG4gICAgY29uc29sZS5sb2coYPCfjqggTW90aW9uIHZhcmlhbnQgc2VsZWN0ZWQgKGluZGV4LWJhc2VkKTogJHt2YXJpYW50fWApO1xuXG4gICAgLy8gTW90aW9uIHZhcmlhbnQgY29uZmlndXJhdGlvbnNcbiAgICBjb25zdCBtb3Rpb25WYXJpYW50cyA9IHtcbiAgICAgIDA6IHtcbiAgICAgICAgLy8gVmFyaWFudCAwOiBkcmFtYXRpYyB6b29tLW91dCBwb3AgdGhlbiBob2xkIHpvb20gKyBwcm9ub3VuY2VkIGNpcmN1bGFyIGRyaWZ0XG4gICAgICAgIHpvb206IGBpZihsdGUob25cXFxcLCR7em9vbU91dEZyYW1lc30pXFxcXCwxLjE1LSgwLjA4Km9uLyR7em9vbU91dEZyYW1lc30pXFxcXCwxLjA4KWAsXG4gICAgICAgIHg6IGBpdy8yLShpdy96b29tLzIpICsgaWYoZ3RlKG9uXFxcXCwke3pvb21PdXRGcmFtZXN9KVxcXFwsICR7bW92ZVJhZGl1c30qY29zKDIqUEkqKG9uLSR7em9vbU91dEZyYW1lc30pLyR7bW92ZVBlcmlvZH0pXFxcXCwgMClgLFxuICAgICAgICB5OiBgaWgvMi0oaWgvem9vbS8yKSArIGlmKGd0ZShvblxcXFwsJHt6b29tT3V0RnJhbWVzfSlcXFxcLCAke21vdmVSYWRpdXN9KnNpbigyKlBJKihvbi0ke3pvb21PdXRGcmFtZXN9KS8ke21vdmVQZXJpb2R9KVxcXFwsIDApYCxcbiAgICAgICAgc3VwZXJzYW1wbGU6ICcxNDQweDI1NjAnLFxuICAgICAgICB0bWl4OiBcImZyYW1lcz0yOndlaWdodHM9JzEgMSdcIixcbiAgICAgICAgc2NhbGU6ICdzY2FsZT03MjA6MTI4MDpmbGFncz1zcGxpbmU6c3dzX2RpdGhlcj1ub25lJyxcbiAgICAgIH0sXG4gICAgICAxOiB7XG4gICAgICAgIC8vIFZhcmlhbnQgMTogc3Ryb25nIGNvbnRpbnVvdXMgem9vbS1pbiAoS2VuIEJ1cm5zKSArIHByb25vdW5jZWQgY2lyY3VsYXIgZHJpZnRcbiAgICAgICAgem9vbTogJ21pbihwb3coMS4wMDEyXFxcXCxvbilcXFxcLDEuMTUpJyxcbiAgICAgICAgeDogYGl3LzItKGl3L3pvb20vMikgKyAke21vdmVSYWRpdXN9KmNvcygyKlBJKm9uLyR7bW92ZVBlcmlvZH0pYCxcbiAgICAgICAgeTogYGloLzItKGloL3pvb20vMikgKyAke21vdmVSYWRpdXN9KnNpbigyKlBJKm9uLyR7bW92ZVBlcmlvZH0pYCxcbiAgICAgICAgc3VwZXJzYW1wbGU6ICcxNDQweDI1NjAnLFxuICAgICAgICB0bWl4OiBcImZyYW1lcz0yOndlaWdodHM9JzEgMSdcIixcbiAgICAgICAgc2NhbGU6ICdzY2FsZT03MjA6MTI4MDpmbGFncz1sYW5jem9zOnN3c19kaXRoZXI9bm9uZScsXG4gICAgICB9LFxuICAgICAgMjoge1xuICAgICAgICAvLyBWYXJpYW50IDI6IHN0cm9uZyBjb250aW51b3VzIHpvb20tb3V0ICsgcHJvbm91bmNlZCBlbGxpcHRpY2FsIGRyaWZ0XG4gICAgICAgIHpvb206IGBtYXgoMS4wNVxcXFwsIDEuMTIgLSAwLjA3Km9uLyR7ZnJhbWVzfSlgLFxuICAgICAgICB4OiBgaXcvMi0oaXcvem9vbS8yKSArICR7bW92ZVJhZGl1c30qY29zKDIqUEkqb24vJHttb3ZlUGVyaW9kfSlgLFxuICAgICAgICB5OiBgaWgvMi0oaWgvem9vbS8yKSArICgke21vdmVSYWRpdXN9LzEuMikqc2luKDIqUEkqb24vJHttb3ZlUGVyaW9kfSlgLFxuICAgICAgICBzdXBlcnNhbXBsZTogJzE0NDB4MjU2MCcsXG4gICAgICAgIHRtaXg6IFwiZnJhbWVzPTI6d2VpZ2h0cz0nMSAxJ1wiLFxuICAgICAgICBzY2FsZTogJ3NjYWxlPTcyMDoxMjgwOmZsYWdzPWxhbmN6b3M6c3dzX2RpdGhlcj1ub25lJyxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIGNvbnN0IGNvbmZpZyA9IG1vdGlvblZhcmlhbnRzW3ZhcmlhbnQgYXMga2V5b2YgdHlwZW9mIG1vdGlvblZhcmlhbnRzXTtcblxuICAgIC8vIEJ1aWxkIGZpbHRlciBncmFwaCBjb25kaXRpb25hbGx5IGRlcGVuZGluZyBvbiB3YXRlcm1hcmsgYXZhaWxhYmlsaXR5XG4gICAgY29uc3QgaGFzV2F0ZXJtYXJrID0gQm9vbGVhbihcbiAgICAgIHdhdGVybWFya1BhdGggJiYgd2F0ZXJtYXJrUGF0aC50cmltKCkubGVuZ3RoID4gMCxcbiAgICApO1xuXG4gICAgY29uc3QgZmlsdGVyQ29tcGxleCA9IGhhc1dhdGVybWFya1xuICAgICAgPyBgWzA6dl16b29tcGFuPXo9JyR7Y29uZmlnLnpvb219JzpkPSR7ZnJhbWVzfTpgICtcbiAgICAgICAgYHg9JyR7Y29uZmlnLnh9JzpgICtcbiAgICAgICAgYHk9JyR7Y29uZmlnLnl9JzpgICtcbiAgICAgICAgYHM9JHtjb25maWcuc3VwZXJzYW1wbGV9LGAgK1xuICAgICAgICBgdG1peD0ke2NvbmZpZy50bWl4fSxgICtcbiAgICAgICAgYGZwcz0yNSxgICtcbiAgICAgICAgYCR7Y29uZmlnLnNjYWxlfSxgICtcbiAgICAgICAgYHNwbGl0W2IwXVtiMV07YCArXG4gICAgICAgIGBbYjFdYm94Ymx1cj04OjFbYmJdO2AgK1xuICAgICAgICBgW2IwXVtiYl1ibGVuZD1hbGxfZXhwcj0nQSooMS1tYXgoMFxcLDEgLSBULyR7Ymx1ckluRHVyYXRpb259KSkgKyBCKm1heCgwXFwsMSAtIFQvJHtibHVySW5EdXJhdGlvbn0pJ1ttYWluXTtgICtcbiAgICAgICAgYFsxOnZdc2NhbGU9MjAwOi0xW3dhdGVybWFya107YCArXG4gICAgICAgIGBbbWFpbl1bd2F0ZXJtYXJrXW92ZXJsYXk9KFctdykvMjoxMlt2XWBcbiAgICAgIDogYFswOnZdem9vbXBhbj16PScke2NvbmZpZy56b29tfSc6ZD0ke2ZyYW1lc306YCArXG4gICAgICAgIGB4PScke2NvbmZpZy54fSc6YCArXG4gICAgICAgIGB5PScke2NvbmZpZy55fSc6YCArXG4gICAgICAgIGBzPSR7Y29uZmlnLnN1cGVyc2FtcGxlfSxgICtcbiAgICAgICAgYHRtaXg9JHtjb25maWcudG1peH0sYCArXG4gICAgICAgIGBmcHM9MjUsYCArXG4gICAgICAgIGAke2NvbmZpZy5zY2FsZX0sYCArXG4gICAgICAgIGBzcGxpdFtiMF1bYjFdO2AgK1xuICAgICAgICBgW2IxXWJveGJsdXI9ODoxW2JiXTtgICtcbiAgICAgICAgYFtiMF1bYmJdYmxlbmQ9YWxsX2V4cHI9J0EqKDEtbWF4KDBcXCwxIC0gVC8ke2JsdXJJbkR1cmF0aW9ufSkpICsgQiptYXgoMFxcLDEgLSBULyR7Ymx1ckluRHVyYXRpb259KSdbdl1gO1xuXG4gICAgY29uc3QgZmZtcGVnUGF0aCA9IHJlc29sdmVGZm1wZWdQYXRoKCk7XG5cbiAgICBjb25zdCBmZm1wZWdBcmdzID0gaGFzV2F0ZXJtYXJrXG4gICAgICA/IFtcbiAgICAgICAgICAnLWxvb3AnLFxuICAgICAgICAgICcxJyxcbiAgICAgICAgICAnLWknLFxuICAgICAgICAgIGlucHV0SW1hZ2VQYXRoLFxuICAgICAgICAgICctbG9vcCcsXG4gICAgICAgICAgJzEnLFxuICAgICAgICAgICctaScsXG4gICAgICAgICAgd2F0ZXJtYXJrUGF0aCxcbiAgICAgICAgICAnLWZpbHRlcl9jb21wbGV4JyxcbiAgICAgICAgICBmaWx0ZXJDb21wbGV4LFxuICAgICAgICAgICctbWFwJyxcbiAgICAgICAgICAnW3ZdJyxcbiAgICAgICAgICAnLWM6dicsXG4gICAgICAgICAgJ2xpYngyNjQnLFxuICAgICAgICAgICctcHJlc2V0JyxcbiAgICAgICAgICAndmVyeWZhc3QnLFxuICAgICAgICAgICctY3JmJyxcbiAgICAgICAgICAnMjMnLFxuICAgICAgICAgICctcGl4X2ZtdCcsXG4gICAgICAgICAgJ3l1djQyMHAnLFxuICAgICAgICAgICctdGhyZWFkcycsXG4gICAgICAgICAgJzAnLFxuICAgICAgICAgICctdCcsXG4gICAgICAgICAgc2NlbmUuZHVyYXRpb24udG9TdHJpbmcoKSxcbiAgICAgICAgICAnLXknLFxuICAgICAgICAgIG91dHB1dFZpZGVvUGF0aCxcbiAgICAgICAgXVxuICAgICAgOiBbXG4gICAgICAgICAgJy1sb29wJyxcbiAgICAgICAgICAnMScsXG4gICAgICAgICAgJy1pJyxcbiAgICAgICAgICBpbnB1dEltYWdlUGF0aCxcbiAgICAgICAgICAnLWZpbHRlcl9jb21wbGV4JyxcbiAgICAgICAgICBmaWx0ZXJDb21wbGV4LFxuICAgICAgICAgICctbWFwJyxcbiAgICAgICAgICAnW3ZdJyxcbiAgICAgICAgICAnLWM6dicsXG4gICAgICAgICAgJ2xpYngyNjQnLFxuICAgICAgICAgICctcHJlc2V0JyxcbiAgICAgICAgICAndmVyeWZhc3QnLFxuICAgICAgICAgICctY3JmJyxcbiAgICAgICAgICAnMjMnLFxuICAgICAgICAgICctcGl4X2ZtdCcsXG4gICAgICAgICAgJ3l1djQyMHAnLFxuICAgICAgICAgICctdGhyZWFkcycsXG4gICAgICAgICAgJzAnLFxuICAgICAgICAgICctdCcsXG4gICAgICAgICAgc2NlbmUuZHVyYXRpb24udG9TdHJpbmcoKSxcbiAgICAgICAgICAnLXknLFxuICAgICAgICAgIG91dHB1dFZpZGVvUGF0aCxcbiAgICAgICAgXTtcblxuICAgIGNvbnNvbGUubG9nKGDwn46sIFJ1bm5pbmcgRkZtcGVnIGNvbW1hbmQgZm9yIHNjZW5lICR7c2NlbmUuaWQgKyAxfTpgKTtcbiAgICBjb25zb2xlLmxvZyhg8J+OrCBTY2VuZSBkdXJhdGlvbjogJHtzY2VuZS5kdXJhdGlvbn1zYCk7XG4gICAgY29uc29sZS5sb2coZmZtcGVnUGF0aCwgZmZtcGVnQXJncy5qb2luKCcgJykpO1xuXG4gICAgY29uc3QgeyBzdGRvdXQsIHN0ZGVyciB9ID0gYXdhaXQgZXhlY0ZpbGVBc3luYyhmZm1wZWdQYXRoLCBmZm1wZWdBcmdzLCB7XG4gICAgICBtYXhCdWZmZXI6IDEwMjQgKiAxMDI0ICogMTAsXG4gICAgfSk7XG5cbiAgICBpZiAoc3RkZXJyKSB7XG4gICAgICBjb25zb2xlLmxvZygnRkZtcGVnIHN0ZGVycjonLCBzdGRlcnIpO1xuICAgIH1cblxuICAgIGlmIChzdGRvdXQpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdGRm1wZWcgc3Rkb3V0OicsIHN0ZG91dCk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgb3V0cHV0IGZpbGUgZXhpc3RzXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKG91dHB1dFZpZGVvUGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRkZtcGVnIGRpZCBub3QgZ2VuZXJhdGUgb3V0cHV0IHZpZGVvIGZpbGUnKTtcbiAgICB9XG5cbiAgICBjb25zdCBjbGVhbnVwVGVtcEZpbGVzID0gKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgZnMudW5saW5rU3luYyhpbnB1dEltYWdlUGF0aCk7XG4gICAgICAgIGlmIChoYXNXYXRlcm1hcmsgJiYgZnMuZXhpc3RzU3luYyh3YXRlcm1hcmtQYXRoKSkge1xuICAgICAgICAgIGZzLnVubGlua1N5bmMod2F0ZXJtYXJrUGF0aCk7XG4gICAgICAgIH1cbiAgICAgICAgZnMudW5saW5rU3luYyhvdXRwdXRWaWRlb1BhdGgpO1xuICAgICAgfSBjYXRjaCAoY2xlYW51cEVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAn4pqg77iPIFdhcm5pbmc6IENvdWxkIG5vdCBjbGVhbiB1cCB0ZW1wb3JhcnkgZmlsZXM6JyxcbiAgICAgICAgICBjbGVhbnVwRXJyb3IsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IHZpZGVvS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ubXA0YDtcblxuICAgIC8vIFJ1bndheSdzIGFuaW1hdGUtc2NlbmUgZmxvdyB1cGxvYWRzIGl0cyBjbGlwIHRvIHRoaXMgZXhhY3Qgc2FtZSBrZXksXG4gICAgLy8gYW5kIGNhbiBjb21wbGV0ZSB3aGlsZSB0aGlzIEtlbi1CdXJucyByZW5kZXIgKGtpY2tlZCBvZmYgYXQgdmlkZW9cbiAgICAvLyBjcmVhdGlvbiB0aW1lKSBpcyBzdGlsbCBpbiBmbGlnaHQuIFJlLWNoZWNrIHRoZSBtYW5pZmVzdCByaWdodCBiZWZvcmVcbiAgICAvLyB1cGxvYWRpbmcgc28gdGhlIHNsb3dlciB3cml0ZXIgbmV2ZXIgY2xvYmJlcnMgdGhlIGFuaW1hdGVkIGNsaXAuXG4gICAgY29uc3QgbWFuaWZlc3QgPSBhd2FpdCBnZXRPYmplY3RGcm9tUzMoXG4gICAgICBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5tYW5pZmVzdC5qc29uYCxcbiAgICApLmNhdGNoKCgpID0+IG51bGwpO1xuICAgIGNvbnN0IG1hbmlmZXN0U2NlbmUgPSBtYW5pZmVzdD8uc2NlbmVzPy5maW5kKFxuICAgICAgKHM6IHsgaWQ6IG51bWJlcjsgYW5pbWF0ZWQ/OiBib29sZWFuIH0pID0+IHMuaWQgPT09IHNjZW5lLmlkLFxuICAgICk7XG4gICAgaWYgKG1hbmlmZXN0U2NlbmU/LmFuaW1hdGVkKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGDimqDvuI8gU2NlbmUgJHtzY2VuZS5pZH0gd2FzIGFuaW1hdGVkIHdoaWxlIGl0cyBLZW4tQnVybnMgY2xpcCB3YXMgcmVuZGVyaW5nIOKAlCBza2lwcGluZyB1cGxvYWQgdG8gYXZvaWQgb3ZlcndyaXRpbmcgdGhlIGFuaW1hdGlvbi5gLFxuICAgICAgKTtcbiAgICAgIGNsZWFudXBUZW1wRmlsZXMoKTtcbiAgICAgIHJldHVybiBhd2FpdCBnZXRTaWduZWRVcmwoXG4gICAgICAgIHMzLFxuICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgICBLZXk6IHZpZGVvS2V5LFxuICAgICAgICB9KSxcbiAgICAgICAgeyBleHBpcmVzSW46IDM2MDAwIH0sXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIFVwbG9hZCB0byBTM1xuICAgIGNvbnN0IHZpZGVvQnVmZmVyID0gZnMucmVhZEZpbGVTeW5jKG91dHB1dFZpZGVvUGF0aCk7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGDimIHvuI8gVXBsb2FkaW5nIHZpZGVvIHRvIFMzOiAke3Byb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FfS8ke3ZpZGVvS2V5fWAsXG4gICAgKTtcblxuICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgIEtleTogdmlkZW9LZXksXG4gICAgICAgIEJvZHk6IHZpZGVvQnVmZmVyLFxuICAgICAgICBDb250ZW50VHlwZTogJ3ZpZGVvL21wNCcsXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY2xlYW51cFRlbXBGaWxlcygpO1xuXG4gICAgY29uc29sZS5sb2coYOKchSBWaWRlbyB1cGxvYWRlZCB0byBTMzogJHt2aWRlb0tleX1gKTtcblxuICAgIC8vIEdlbmVyYXRlIHNpZ25lZCBVUkwgZm9yIHRoZSB1cGxvYWRlZCB2aWRlb1xuICAgIGNvbnN0IHZpZGVvU2lnbmVkVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKFxuICAgICAgczMsXG4gICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgIEtleTogdmlkZW9LZXksXG4gICAgICB9KSxcbiAgICAgIHsgZXhwaXJlc0luOiAzNjAwMCB9LCAvLyAxMCBob3VycyBleHBpcmF0aW9uXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKGDinIUgVmlkZW8gc2lnbmVkIFVSTCBnZW5lcmF0ZWQgZm9yIHNjZW5lICR7c2NlbmUuaWQgKyAxfWApO1xuICAgIHJldHVybiB2aWRlb1NpZ25lZFVybDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKFxuICAgICAgYOKdjCBFcnJvciBnZW5lcmF0aW5nIHZpZGVvIGZvciBzY2VuZSAke3NjZW5lLmlkICsgMX06YCxcbiAgICAgIGVycm9yLFxuICAgICk7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==