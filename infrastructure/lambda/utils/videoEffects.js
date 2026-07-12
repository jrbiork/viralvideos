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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9FZmZlY3RzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmlkZW9FZmZlY3RzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBNkRBLDREQXNCQztBQUVELGdEQThDQztBQUVELG9EQStFQztBQXBORCxrREFLNEI7QUFDNUIsd0VBQTZEO0FBQzdELGlDQUEwQjtBQUMxQix5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLCtCQUFpQztBQUNqQyxpREFBK0M7QUFHL0MsTUFBTSxTQUFTLEdBQUcsSUFBQSxnQkFBUyxFQUFDLG9CQUFJLENBQUMsQ0FBQztBQUNsQyxNQUFNLGFBQWEsR0FBRyxJQUFBLGdCQUFTLEVBQUMsd0JBQVEsQ0FBQyxDQUFDO0FBQzFDLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBUzNFLFNBQVMsWUFBWSxDQUFDLENBQVM7SUFDN0IsSUFBSSxDQUFDO1FBQ0gsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxpQkFBaUI7SUFDeEIsTUFBTSxVQUFVLEdBQUc7UUFDakIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXO1FBQ3ZCLGlCQUFpQjtRQUNqQixhQUFhO1FBQ2IsaUJBQWlCO1FBQ2pCLHVCQUF1QjtLQUN4QixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQWEsQ0FBQztJQUU5QixLQUFLLE1BQU0sQ0FBQyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQzNCLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxZQUFZLENBQUMsQ0FBQyxD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QztZQUMvQixDQUFDO1lBQ0QsRUFBRSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNqQyxDQUFDO1FBQUMsT0FBTyxZQUFZLEVBQUUsQ0FBQztZQUN0QixPQUFPLENBQUMsSUFBSSxDQUNWLGlEQUFpRCxFQUNqRCxZQUFZLENBQ2IsQ0FBQztRQUNKLENBQUM7UUFFRCxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBRW5ELDZDQUE2QztRQUM3QyxNQUFNLGNBQWMsR0FBRyxNQUFNLElBQUEsbUNBQVksRUFDdkMsRUFBRSxFQUNGLElBQUksNEJBQWdCLENBQUM7WUFDbkIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsdUJBQXVCO1lBQzNDLEdBQUcsRUFBRSxRQUFRO1NBQ2QsQ0FBQyxFQUNGLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxDQUNyQixDQUFDO1FBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQ0FBMEMsS0FBSyxDQUFDLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLE9BQU8sY0FBYyxDQUFDO0lBQ3hCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FDWCxzQ0FBc0MsS0FBSyxDQUFDLEVBQUUsR0FBRyxDQUFDLEdBQUcsRUFDckQsS0FBSyxDQUNOLENBQUM7UUFDRixNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgUzNDbGllbnQsXG4gIFB1dE9iamVjdENvbW1hbmQsXG4gIEdldE9iamVjdENvbW1hbmQsXG4gIExpc3RPYmplY3RzVjJDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSAnQGF3cy1zZGsvczMtcmVxdWVzdC1wcmVzaWduZXInO1xuaW1wb3J0IGF4aW9zIGZyb20gJ2F4aW9zJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IGV4ZWMsIGV4ZWNGaWxlIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBVc2VySXRlbSB9IGZyb20gJy4vdXNlcic7XG5cbmNvbnN0IGV4ZWNBc3luYyA9IHByb21pc2lmeShleGVjKTtcbmNvbnN0IGV4ZWNGaWxlQXN5bmMgPSBwcm9taXNpZnkoZXhlY0ZpbGUpO1xuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gaXNFeGVjdXRhYmxlKHA6IHN0cmluZyk6IGJvb2xlYW4ge1xuICB0cnkge1xuICAgIGZzLmFjY2Vzc1N5bmMocCwgZnMuY29uc3RhbnRzLlhfT0spO1xuICAgIHJldHVybiB0cnVlO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUZmbXBlZ1BhdGgoKTogc3RyaW5nIHtcbiAgY29uc3QgY2FuZGlkYXRlcyA9IFtcbiAgICBwcm9jZXNzLmVudi5GRk1QRUdfUEFUSCxcbiAgICAnL29wdC9iaW4vZmZtcGVnJyxcbiAgICAnL29wdC9mZm1wZWcnLFxuICAgICcvdXNyL2Jpbi9mZm1wZWcnLFxuICAgICcvdXNyL2xvY2FsL2Jpbi9mZm1wZWcnLFxuICBdLmZpbHRlcihCb29sZWFuKSBhcyBzdHJpbmdbXTtcblxuICBmb3IgKGNvbnN0IHAgb2YgY2FuZGlkYXRlcykge1xuICAgIGlmIChmcy5leGlzdHNTeW5jKHApICYmIGlzRXhlY3V0YWJsZShwKSkgcmV0dXJuIHA7XG4gIH1cblxuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ0ZGbXBlZyBiaW5hcnkgbm90IGZvdW5kLiBFeHBlY3RlZCBhdCBvbmUgb2Y6ICcgK1xuICAgICAgY2FuZGlkYXRlcy5qb2luKCcsICcpICtcbiAgICAgICcuIEVuc3VyZSB5b3VyIExhbWJkYSBsYXllciBwcm92aWRlcyBmZm1wZWcgKGNvbW1vbiBwYXRoOiAvb3B0L2Jpbi9mZm1wZWcpIG9yIHNldCBGRk1QRUdfUEFUSC4nLFxuICApO1xufVxuXG4vKipcbiAqIExpc3RzIHdoaWNoIG9mIGEgdmlkZW8ncyBwZXItc2NlbmUgS2VuLUJ1cm5zIG1wNCBvYmplY3RzIGFjdHVhbGx5IGV4aXN0IGluXG4gKiBTMyB0b2RheSwga2V5ZWQgYnkgZnVsbCBvYmplY3QgS2V5IChlLmcuIFwidXNlcklkL3RpbWVzdGFtcC5zY2VuZS0xLm1wNFwiKS5cbiAqIFNpbmdsZSBleGlzdGVuY2Ugc291cmNlIG9mIHRydXRoIHJldXNlZCBieSBnZXRWaWRlb0VmZmVjdFVybHMgYW5kIGJ5XG4gKiBoeWRyYXRlTWFuaWZlc3QgKG1hbmlmZXN0VXRpbHMudHMpIHNvIHNpZ25lZCBVUkxzIGFyZSBuZXZlciBoYW5kZWQgb3V0IGZvclxuICogc2NlbmVzIHdob3NlIHZpZGVvIGhhc24ndCBiZWVuIGdlbmVyYXRlZCB5ZXQuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsaXN0RXhpc3RpbmdTY2VuZU1wNEtleXMoXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbik6IFByb21pc2U8U2V0PHN0cmluZz4+IHtcbiAgY29uc3QgczNDbGllbnQgPSBuZXcgUzNDbGllbnQoe1xuICAgIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgfSk7XG4gIGNvbnN0IGxpc3RDb21tYW5kID0gbmV3IExpc3RPYmplY3RzVjJDb21tYW5kKHtcbiAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgIFByZWZpeDogYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtYCxcbiAgfSk7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBsaXN0UmVzdWx0ID0gYXdhaXQgczNDbGllbnQuc2VuZChsaXN0Q29tbWFuZCk7XG4gICAgY29uc3Qga2V5cyA9IChsaXN0UmVzdWx0LkNvbnRlbnRzIHx8IFtdKVxuICAgICAgLm1hcCgob2JqKSA9PiBvYmouS2V5KVxuICAgICAgLmZpbHRlcigoa2V5KToga2V5IGlzIHN0cmluZyA9PiAhIWtleSAmJiBrZXkuZW5kc1dpdGgoJy5tcDQnKSk7XG4gICAgcmV0dXJuIG5ldyBTZXQoa2V5cyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgbGlzdGluZyBleGlzdGluZyBzY2VuZSBtcDQga2V5czonLCBlcnJvcik7XG4gICAgcmV0dXJuIG5ldyBTZXQoKTtcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0VmlkZW9FZmZlY3RVcmxzKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHNjZW5lczogT21pdDxTY2VuZSwgJ2Rlc2NyaXB0aW9uJyB8ICduYXJyYXRpb24nPltdLFxuICB1c2VyOiBVc2VySXRlbSB8IG51bGwsXG4pOiBQcm9taXNlPEFycmF5PHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0+PiB7XG4gIGNvbnN0IHMzQ2xpZW50ID0gbmV3IFMzQ2xpZW50KHtcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScsXG4gIH0pO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgZXhpc3RpbmdLZXlzID0gYXdhaXQgbGlzdEV4aXN0aW5nU2NlbmVNcDRLZXlzKHVzZXJJZCwgdGltZXN0YW1wKTtcblxuICAgIGlmIChleGlzdGluZ0tleXMuc2l6ZSA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBWaWRlbyBlZmZlY3RzIGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wOicsXG4gICAgICAgIGV4aXN0aW5nS2V5cy5zaXplLFxuICAgICAgICAnZmlsZXMgZm91bmQnLFxuICAgICAgKTtcblxuICAgICAgLy8gR2VuZXJhdGUgc2lnbmVkIFVSTHMgZm9yIGV4aXN0aW5nIHZpZGVvIGZpbGVzXG4gICAgICBjb25zdCBzaWduZWRVcmxQcm9taXNlcyA9IEFycmF5LmZyb20oZXhpc3RpbmdLZXlzKS5tYXAoYXN5bmMgKGtleSkgPT4ge1xuICAgICAgICBjb25zdCBnZXRPYmplY3RDb21tYW5kID0gbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgS2V5OiBrZXksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHNpZ25lZFVybCA9IGF3YWl0IGdldFNpZ25lZFVybChzM0NsaWVudCwgZ2V0T2JqZWN0Q29tbWFuZCwge1xuICAgICAgICAgIGV4cGlyZXNJbjogMzYwMDAsIC8vIDEwIGhvdXJzXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEV4dHJhY3QgZmlsZW5hbWUgd2l0aG91dCB1c2VyIHByZWZpeCAoZS5nLiwgXCIxMDA0LnNjZW5lLTEubXA0XCIpXG4gICAgICAgIGNvbnN0IGZpbGVuYW1lID0ga2V5LnJlcGxhY2UoYCR7dXNlcklkfS9gLCAnJyk7XG5cbiAgICAgICAgcmV0dXJuIHsgW2ZpbGVuYW1lXTogc2lnbmVkVXJsIH07XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIGF3YWl0IFByb21pc2UuYWxsKHNpZ25lZFVybFByb21pc2VzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGF3YWl0IGdlbmVyYXRlVmlkZW9FZmZlY3RzKHNjZW5lcywgdXNlcklkLCB0aW1lc3RhbXAsIHVzZXIpO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjaGVja2luZyBleGlzdGluZyB2aWRlbyBlZmZlY3RzOicsIGVycm9yKTtcbiAgICAvLyBGYWxsYmFjayB0byBnZW5lcmF0aW5nIG5ldyB2aWRlbyBlZmZlY3RzXG4gICAgcmV0dXJuIGF3YWl0IGdlbmVyYXRlVmlkZW9FZmZlY3RzKHNjZW5lcywgdXNlcklkLCB0aW1lc3RhbXAsIHVzZXIpO1xuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVZpZGVvRWZmZWN0cyhcbiAgc2NlbmVzOiBPbWl0PFNjZW5lLCAnZGVzY3JpcHRpb24nIHwgJ25hcnJhdGlvbic+W10sXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgdXNlcjogVXNlckl0ZW0gfCBudWxsLFxuKTogUHJvbWlzZTxBcnJheTx7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9Pj4ge1xuICAvLyBGb3JtYXQ6IFt7IFwidGltZXN0YW1wLnNjZW5lLWlkLm1wNFwiOiBcInNpZ25lZC11cmxcIiB9XVxuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKCfwn46sIEdlbmVyYXRpbmcgdmlkZW8gZWZmZWN0cyBmb3Igc2NlbmVzLi4uJyk7XG5cbiAgICAvLyBQcm9jZXNzIGFsbCBzY2VuZXMgaW4gcGFyYWxsZWxcbiAgICBjb25zdCB2aWRlb1Byb21pc2VzID0gc2NlbmVzLm1hcChhc3luYyAoc2NlbmUsIGkpID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn46sIFByb2Nlc3Npbmcgc2NlbmUgJHtpICsgMX1gKTtcblxuICAgICAgLy8gR2V0IHRoZSBpbWFnZSBVUkwgZm9yIHRoaXMgc2NlbmVcbiAgICAgIGNvbnN0IGltYWdlS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ucG5nYDtcbiAgICAgIGNvbnN0IGltYWdlVXJsID0gYXdhaXQgZ2V0SW1hZ2VTaWduZWRVcmwoaW1hZ2VLZXkpO1xuXG4gICAgICBpZiAoIWltYWdlVXJsKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gaW1hZ2UgZm91bmQgZm9yIHNjZW5lICR7c2NlbmUuaWR9YCk7XG4gICAgICB9XG5cbiAgICAgIC8vIEdlbmVyYXRlIHZpZGVvIHdpdGggYmx1ciBpbi9vdXQgYW5kIGNhbWVyYSBtb3ZlbWVudFxuICAgICAgY29uc3QgdmlkZW9TaWduZWRVcmwgPSBhd2FpdCBnZW5lcmF0ZVNjZW5lVmlkZW8oXG4gICAgICAgIGltYWdlVXJsLFxuICAgICAgICBzY2VuZSxcbiAgICAgICAgdXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgIHVzZXIsXG4gICAgICApO1xuXG4gICAgICAvLyBFeHRyYWN0IGZpbGVuYW1lIHdpdGhvdXQgdXNlciBwcmVmaXggKGUuZy4sIFwiMTAwNC5zY2VuZS0xLm1wNFwiKVxuICAgICAgY29uc3QgZmlsZW5hbWUgPSBgJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wNGA7XG5cbiAgICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtpICsgMX0gdmlkZW8gZ2VuZXJhdGVkOiAke2ZpbGVuYW1lfWApO1xuICAgICAgcmV0dXJuIHsgW2ZpbGVuYW1lXTogdmlkZW9TaWduZWRVcmwgfTtcbiAgICB9KTtcblxuICAgIGNvbnN0IHNldHRsZWQgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQodmlkZW9Qcm9taXNlcyk7XG5cbiAgICBjb25zdCBmYWlsdXJlcyA9IHNldHRsZWRcbiAgICAgIC5tYXAoKHJlc3VsdCwgaSkgPT4gKHsgcmVzdWx0LCBzY2VuZUlkOiBzY2VuZXNbaV0uaWQgfSkpXG4gICAgICAuZmlsdGVyKFxuICAgICAgICAoXG4gICAgICAgICAgZW50cnksXG4gICAgICAgICk6IGVudHJ5IGlzIHtcbiAgICAgICAgICByZXN1bHQ6IFByb21pc2VSZWplY3RlZFJlc3VsdDtcbiAgICAgICAgICBzY2VuZUlkOiBudW1iZXI7XG4gICAgICAgIH0gPT4gZW50cnkucmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJyxcbiAgICAgICk7XG5cbiAgICBpZiAoZmFpbHVyZXMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgZGV0YWlscyA9IGZhaWx1cmVzXG4gICAgICAgIC5tYXAoKHsgc2NlbmVJZCwgcmVzdWx0IH0pID0+IGBzY2VuZSAke3NjZW5lSWR9OiAke3Jlc3VsdC5yZWFzb259YClcbiAgICAgICAgLmpvaW4oJzsgJyk7XG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgVmlkZW8gZWZmZWN0cyBmYWlsZWQgZm9yICR7ZmFpbHVyZXMubGVuZ3RofSBzY2VuZShzKTogJHtkZXRhaWxzfWApO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgRmFpbGVkIHRvIGdlbmVyYXRlIHZpZGVvIGZvciAke2ZhaWx1cmVzLmxlbmd0aH0gc2NlbmUocykg4oCUICR7ZGV0YWlsc31gLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCB2aWRlb1VybHMgPSBzZXR0bGVkXG4gICAgICAuZmlsdGVyKFxuICAgICAgICAocmVzdWx0KTogcmVzdWx0IGlzIFByb21pc2VGdWxmaWxsZWRSZXN1bHQ8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT4gPT5cbiAgICAgICAgICByZXN1bHQuc3RhdHVzID09PSAnZnVsZmlsbGVkJyxcbiAgICAgIClcbiAgICAgIC5tYXAoKHJlc3VsdCkgPT4gcmVzdWx0LnZhbHVlKTtcblxuICAgIGlmICh2aWRlb1VybHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyB2aWRlb3Mgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gdmlkZW9zIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQgJHt2aWRlb1VybHMubGVuZ3RofSB2aWRlbyBjbGlwcyB3aXRoIGVmZmVjdHNgKTtcbiAgICByZXR1cm4gdmlkZW9VcmxzO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBnZW5lcmF0ZVZpZGVvRWZmZWN0czonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0SW1hZ2VTaWduZWRVcmwoaW1hZ2VLZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICB0cnkge1xuICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgS2V5OiBpbWFnZUtleSxcbiAgICB9KTtcblxuICAgIHJldHVybiBhd2FpdCBnZXRTaWduZWRVcmwoczMsIGNvbW1hbmQsIHsgZXhwaXJlc0luOiAzNjAwMCB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGDinYwgRXJyb3IgZ2V0dGluZyBzaWduZWQgVVJMIGZvciAke2ltYWdlS2V5fTpgLCBlcnJvcik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVTY2VuZVZpZGVvKFxuICBpbWFnZVVybDogc3RyaW5nLFxuICBzY2VuZTogT21pdDxTY2VuZSwgJ2Rlc2NyaXB0aW9uJyB8ICduYXJyYXRpb24nPixcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICB1c2VyOiBVc2VySXRlbSB8IG51bGwsXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICB0cnkge1xuICAgIC8vIERvd25sb2FkIHRoZSBpbWFnZVxuICAgIGNvbnNvbGUubG9nKGDwn5OlIERvd25sb2FkaW5nIGltYWdlIGZyb206ICR7aW1hZ2VVcmx9YCk7XG4gICAgY29uc3QgaW1hZ2VSZXNwb25zZSA9IGF3YWl0IGF4aW9zLmdldChpbWFnZVVybCwge1xuICAgICAgcmVzcG9uc2VUeXBlOiAnYXJyYXlidWZmZXInLFxuICAgIH0pO1xuICAgIGNvbnN0IGltYWdlQnVmZmVyID0gQnVmZmVyLmZyb20oaW1hZ2VSZXNwb25zZS5kYXRhKTtcblxuICAgIC8vIENyZWF0ZSB0ZW1wb3JhcnkgZmlsZXNcbiAgICBjb25zdCB0ZW1wRGlyID0gJy90bXAnO1xuICAgIGNvbnN0IGlucHV0SW1hZ2VQYXRoID0gcGF0aC5qb2luKHRlbXBEaXIsIGBpbnB1dC0ke3NjZW5lLmlkfS5wbmdgKTtcbiAgICBjb25zdCBvdXRwdXRWaWRlb1BhdGggPSBwYXRoLmpvaW4odGVtcERpciwgYG91dHB1dC0ke3NjZW5lLmlkfS5tcDRgKTtcblxuICAgIGxldCB3YXRlcm1hcmtQYXRoID0gJyc7XG4gICAgLy8gZG93bmxvYWQgdGhlIHdhdGVybWFyay5wbmcgZnJvbSB2aXJhbCBzaG9ydCBwYXJ0cyBidWNrZXRcbiAgICBpZiAoXG4gICAgICB1c2VyPy5zdWJzY3JpcHRpb24/Lm1vZGUgPT09ICdmcmVlJyB8fFxuICAgICAgdXNlcj8uc3Vic2NyaXB0aW9uPy5zdGF0dXMgPT09ICdjYW5jZWxsZWQnIHx8XG4gICAgICB1c2VyPy5zdWJzY3JpcHRpb24/LnN0YXR1cyA9PT0gJ2V4cGlyZWQnXG4gICAgKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB3YXRlcm1hcmtLZXkgPSAnd2F0ZXJtYXJrLnBuZyc7XG4gICAgICAgIGNvbnN0IHdhdGVybWFya1VybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgICAgICBzMyxcbiAgICAgICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgICAgS2V5OiB3YXRlcm1hcmtLZXksXG4gICAgICAgICAgfSksXG4gICAgICAgICk7XG5cbiAgICAgICAgY29uc3Qgd2F0ZXJtYXJrUmVzcG9uc2UgPSBhd2FpdCBheGlvcy5nZXQod2F0ZXJtYXJrVXJsLCB7XG4gICAgICAgICAgcmVzcG9uc2VUeXBlOiAnYXJyYXlidWZmZXInLFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3Qgd2F0ZXJtYXJrQnVmZmVyID0gQnVmZmVyLmZyb20od2F0ZXJtYXJrUmVzcG9uc2UuZGF0YSk7XG5cbiAgICAgICAgLy8gV3JpdGUgd2F0ZXJtYXJrIHRvIHRlbXAgZmlsZVxuICAgICAgICB3YXRlcm1hcmtQYXRoID0gcGF0aC5qb2luKHRlbXBEaXIsIGB3YXRlcm1hcmstJHtzY2VuZS5pZH0ucG5nYCk7XG4gICAgICAgIGZzLndyaXRlRmlsZVN5bmMod2F0ZXJtYXJrUGF0aCwgd2F0ZXJtYXJrQnVmZmVyKTtcbiAgICAgIH0gY2F0Y2ggKHdhdGVybWFya0Vycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgJ+KaoO+4jyBGYWlsZWQgdG8gZmV0Y2ggd2F0ZXJtYXJrLCBjb250aW51aW5nIHdpdGhvdXQgaXQ6JyxcbiAgICAgICAgICB3YXRlcm1hcmtFcnJvcixcbiAgICAgICAgKTtcbiAgICAgICAgd2F0ZXJtYXJrUGF0aCA9ICcnO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFdyaXRlIGltYWdlIHRvIHRlbXAgZmlsZVxuICAgIGZzLndyaXRlRmlsZVN5bmMoaW5wdXRJbWFnZVBhdGgsIGltYWdlQnVmZmVyKTtcblxuICAgIGNvbnN0IGZyYW1lcyA9IE1hdGguZmxvb3Ioc2NlbmUuZHVyYXRpb24gKiAyNSk7XG4gICAgY29uc3QgYmx1ckluRHVyYXRpb24gPSAwLjI7XG4gICAgY29uc3Qgem9vbU91dEZyYW1lcyA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3IoYmx1ckluRHVyYXRpb24gKiAyNSkpO1xuXG4gICAgLy8gYWRkIG5lYXIgeW91ciBvdGhlciBwYXJhbXNcbiAgICBjb25zdCBtb3ZlUmFkaXVzID0gMjU7IC8vIHB4IChtb3JlIGludGVudGlvbmFsIGFuZCB2aXNpYmxlKVxuICAgIGNvbnN0IG1vdmVQZXJpb2QgPSAxODA7IC8vIGZyYW1lcyAofjcuMnMgQDI1ZnBzKSAtIGZhc3RlciBtb3ZlbWVudFxuXG4gICAgLy8gZGV0ZXJtaW5pc3RpY2FsbHkgY2hvb3NlIG9uZSBvZiB0aHJlZSBtb3Rpb24gdmFyaWFudHMgcGVyIHNjZW5lIChpbmRleC1iYXNlZClcbiAgICBjb25zdCB2YXJpYW50ID0gc2NlbmUuaWQgJSAzOyAvLyAwOiBkcmFtYXRpYyBwb3Atb3V0K2RyaWZ0LCAxOiBzdHJvbmcgem9vbS1pbiwgMjogc3Ryb25nIHpvb20tb3V0XG4gICAgY29uc29sZS5sb2coYPCfjqggTW90aW9uIHZhcmlhbnQgc2VsZWN0ZWQgKGluZGV4LWJhc2VkKTogJHt2YXJpYW50fWApO1xuXG4gICAgLy8gTW90aW9uIHZhcmlhbnQgY29uZmlndXJhdGlvbnNcbiAgICBjb25zdCBtb3Rpb25WYXJpYW50cyA9IHtcbiAgICAgIDA6IHtcbiAgICAgICAgLy8gVmFyaWFudCAwOiBkcmFtYXRpYyB6b29tLW91dCBwb3AgdGhlbiBob2xkIHpvb20gKyBwcm9ub3VuY2VkIGNpcmN1bGFyIGRyaWZ0XG4gICAgICAgIHpvb206IGBpZihsdGUob25cXFxcLCR7em9vbU91dEZyYW1lc30pXFxcXCwxLjE1LSgwLjA4Km9uLyR7em9vbU91dEZyYW1lc30pXFxcXCwxLjA4KWAsXG4gICAgICAgIHg6IGBpdy8yLShpdy96b29tLzIpICsgaWYoZ3RlKG9uXFxcXCwke3pvb21PdXRGcmFtZXN9KVxcXFwsICR7bW92ZVJhZGl1c30qY29zKDIqUEkqKG9uLSR7em9vbU91dEZyYW1lc30pLyR7bW92ZVBlcmlvZH0pXFxcXCwgMClgLFxuICAgICAgICB5OiBgaWgvMi0oaWgvem9vbS8yKSArIGlmKGd0ZShvblxcXFwsJHt6b29tT3V0RnJhbWVzfSlcXFxcLCAke21vdmVSYWRpdXN9KnNpbigyKlBJKihvbi0ke3pvb21PdXRGcmFtZXN9KS8ke21vdmVQZXJpb2R9KVxcXFwsIDApYCxcbiAgICAgICAgc3VwZXJzYW1wbGU6ICcxNDQweDI1NjAnLFxuICAgICAgICB0bWl4OiBcImZyYW1lcz0yOndlaWdodHM9JzEgMSdcIixcbiAgICAgICAgc2NhbGU6ICdzY2FsZT03MjA6MTI4MDpmbGFncz1zcGxpbmU6c3dzX2RpdGhlcj1ub25lJyxcbiAgICAgIH0sXG4gICAgICAxOiB7XG4gICAgICAgIC8vIFZhcmlhbnQgMTogc3Ryb25nIGNvbnRpbnVvdXMgem9vbS1pbiAoS2VuIEJ1cm5zKSArIHByb25vdW5jZWQgY2lyY3VsYXIgZHJpZnRcbiAgICAgICAgem9vbTogJ21pbihwb3coMS4wMDEyXFxcXCxvbilcXFxcLDEuMTUpJyxcbiAgICAgICAgeDogYGl3LzItKGl3L3pvb20vMikgKyAke21vdmVSYWRpdXN9KmNvcygyKlBJKm9uLyR7bW92ZVBlcmlvZH0pYCxcbiAgICAgICAgeTogYGloLzItKGloL3pvb20vMikgKyAke21vdmVSYWRpdXN9KnNpbigyKlBJKm9uLyR7bW92ZVBlcmlvZH0pYCxcbiAgICAgICAgc3VwZXJzYW1wbGU6ICcxNDQweDI1NjAnLFxuICAgICAgICB0bWl4OiBcImZyYW1lcz0yOndlaWdodHM9JzEgMSdcIixcbiAgICAgICAgc2NhbGU6ICdzY2FsZT03MjA6MTI4MDpmbGFncz1sYW5jem9zOnN3c19kaXRoZXI9bm9uZScsXG4gICAgICB9LFxuICAgICAgMjoge1xuICAgICAgICAvLyBWYXJpYW50IDI6IHN0cm9uZyBjb250aW51b3VzIHpvb20tb3V0ICsgcHJvbm91bmNlZCBlbGxpcHRpY2FsIGRyaWZ0XG4gICAgICAgIHpvb206IGBtYXgoMS4wNVxcXFwsIDEuMTIgLSAwLjA3Km9uLyR7ZnJhbWVzfSlgLFxuICAgICAgICB4OiBgaXcvMi0oaXcvem9vbS8yKSArICR7bW92ZVJhZGl1c30qY29zKDIqUEkqb24vJHttb3ZlUGVyaW9kfSlgLFxuICAgICAgICB5OiBgaWgvMi0oaWgvem9vbS8yKSArICgke21vdmVSYWRpdXN9LzEuMikqc2luKDIqUEkqb24vJHttb3ZlUGVyaW9kfSlgLFxuICAgICAgICBzdXBlcnNhbXBsZTogJzE0NDB4MjU2MCcsXG4gICAgICAgIHRtaXg6IFwiZnJhbWVzPTI6d2VpZ2h0cz0nMSAxJ1wiLFxuICAgICAgICBzY2FsZTogJ3NjYWxlPTcyMDoxMjgwOmZsYWdzPWxhbmN6b3M6c3dzX2RpdGhlcj1ub25lJyxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIGNvbnN0IGNvbmZpZyA9IG1vdGlvblZhcmlhbnRzW3ZhcmlhbnQgYXMga2V5b2YgdHlwZW9mIG1vdGlvblZhcmlhbnRzXTtcblxuICAgIC8vIEJ1aWxkIGZpbHRlciBncmFwaCBjb25kaXRpb25hbGx5IGRlcGVuZGluZyBvbiB3YXRlcm1hcmsgYXZhaWxhYmlsaXR5XG4gICAgY29uc3QgaGFzV2F0ZXJtYXJrID0gQm9vbGVhbihcbiAgICAgIHdhdGVybWFya1BhdGggJiYgd2F0ZXJtYXJrUGF0aC50cmltKCkubGVuZ3RoID4gMCxcbiAgICApO1xuXG4gICAgY29uc3QgZmlsdGVyQ29tcGxleCA9IGhhc1dhdGVybWFya1xuICAgICAgPyBgWzA6dl16b29tcGFuPXo9JyR7Y29uZmlnLnpvb219JzpkPSR7ZnJhbWVzfTpgICtcbiAgICAgICAgYHg9JyR7Y29uZmlnLnh9JzpgICtcbiAgICAgICAgYHk9JyR7Y29uZmlnLnl9JzpgICtcbiAgICAgICAgYHM9JHtjb25maWcuc3VwZXJzYW1wbGV9LGAgK1xuICAgICAgICBgdG1peD0ke2NvbmZpZy50bWl4fSxgICtcbiAgICAgICAgYGZwcz0yNSxgICtcbiAgICAgICAgYCR7Y29uZmlnLnNjYWxlfSxgICtcbiAgICAgICAgYHNwbGl0W2IwXVtiMV07YCArXG4gICAgICAgIGBbYjFdYm94Ymx1cj04OjFbYmJdO2AgK1xuICAgICAgICBgW2IwXVtiYl1ibGVuZD1hbGxfZXhwcj0nQSooMS1tYXgoMFxcLDEgLSBULyR7Ymx1ckluRHVyYXRpb259KSkgKyBCKm1heCgwXFwsMSAtIFQvJHtibHVySW5EdXJhdGlvbn0pJ1ttYWluXTtgICtcbiAgICAgICAgYFsxOnZdc2NhbGU9MjAwOi0xW3dhdGVybWFya107YCArXG4gICAgICAgIGBbbWFpbl1bd2F0ZXJtYXJrXW92ZXJsYXk9KFctdykvMjoxMlt2XWBcbiAgICAgIDogYFswOnZdem9vbXBhbj16PScke2NvbmZpZy56b29tfSc6ZD0ke2ZyYW1lc306YCArXG4gICAgICAgIGB4PScke2NvbmZpZy54fSc6YCArXG4gICAgICAgIGB5PScke2NvbmZpZy55fSc6YCArXG4gICAgICAgIGBzPSR7Y29uZmlnLnN1cGVyc2FtcGxlfSxgICtcbiAgICAgICAgYHRtaXg9JHtjb25maWcudG1peH0sYCArXG4gICAgICAgIGBmcHM9MjUsYCArXG4gICAgICAgIGAke2NvbmZpZy5zY2FsZX0sYCArXG4gICAgICAgIGBzcGxpdFtiMF1bYjFdO2AgK1xuICAgICAgICBgW2IxXWJveGJsdXI9ODoxW2JiXTtgICtcbiAgICAgICAgYFtiMF1bYmJdYmxlbmQ9YWxsX2V4cHI9J0EqKDEtbWF4KDBcXCwxIC0gVC8ke2JsdXJJbkR1cmF0aW9ufSkpICsgQiptYXgoMFxcLDEgLSBULyR7Ymx1ckluRHVyYXRpb259KSdbdl1gO1xuXG4gICAgY29uc3QgZmZtcGVnUGF0aCA9IHJlc29sdmVGZm1wZWdQYXRoKCk7XG5cbiAgICBjb25zdCBmZm1wZWdBcmdzID0gaGFzV2F0ZXJtYXJrXG4gICAgICA/IFtcbiAgICAgICAgICAnLWxvb3AnLFxuICAgICAgICAgICcxJyxcbiAgICAgICAgICAnLWknLFxuICAgICAgICAgIGlucHV0SW1hZ2VQYXRoLFxuICAgICAgICAgICctbG9vcCcsXG4gICAgICAgICAgJzEnLFxuICAgICAgICAgICctaScsXG4gICAgICAgICAgd2F0ZXJtYXJrUGF0aCxcbiAgICAgICAgICAnLWZpbHRlcl9jb21wbGV4JyxcbiAgICAgICAgICBmaWx0ZXJDb21wbGV4LFxuICAgICAgICAgICctbWFwJyxcbiAgICAgICAgICAnW3ZdJyxcbiAgICAgICAgICAnLWM6dicsXG4gICAgICAgICAgJ2xpYngyNjQnLFxuICAgICAgICAgICctcHJlc2V0JyxcbiAgICAgICAgICAndmVyeWZhc3QnLFxuICAgICAgICAgICctY3JmJyxcbiAgICAgICAgICAnMjMnLFxuICAgICAgICAgICctcGl4X2ZtdCcsXG4gICAgICAgICAgJ3l1djQyMHAnLFxuICAgICAgICAgICctdGhyZWFkcycsXG4gICAgICAgICAgJzAnLFxuICAgICAgICAgICctdCcsXG4gICAgICAgICAgc2NlbmUuZHVyYXRpb24udG9TdHJpbmcoKSxcbiAgICAgICAgICAnLXknLFxuICAgICAgICAgIG91dHB1dFZpZGVvUGF0aCxcbiAgICAgICAgXVxuICAgICAgOiBbXG4gICAgICAgICAgJy1sb29wJyxcbiAgICAgICAgICAnMScsXG4gICAgICAgICAgJy1pJyxcbiAgICAgICAgICBpbnB1dEltYWdlUGF0aCxcbiAgICAgICAgICAnLWZpbHRlcl9jb21wbGV4JyxcbiAgICAgICAgICBmaWx0ZXJDb21wbGV4LFxuICAgICAgICAgICctbWFwJyxcbiAgICAgICAgICAnW3ZdJyxcbiAgICAgICAgICAnLWM6dicsXG4gICAgICAgICAgJ2xpYngyNjQnLFxuICAgICAgICAgICctcHJlc2V0JyxcbiAgICAgICAgICAndmVyeWZhc3QnLFxuICAgICAgICAgICctY3JmJyxcbiAgICAgICAgICAnMjMnLFxuICAgICAgICAgICctcGl4X2ZtdCcsXG4gICAgICAgICAgJ3l1djQyMHAnLFxuICAgICAgICAgICctdGhyZWFkcycsXG4gICAgICAgICAgJzAnLFxuICAgICAgICAgICctdCcsXG4gICAgICAgICAgc2NlbmUuZHVyYXRpb24udG9TdHJpbmcoKSxcbiAgICAgICAgICAnLXknLFxuICAgICAgICAgIG91dHB1dFZpZGVvUGF0aCxcbiAgICAgICAgXTtcblxuICAgIGNvbnNvbGUubG9nKGDwn46sIFJ1bm5pbmcgRkZtcGVnIGNvbW1hbmQgZm9yIHNjZW5lICR7c2NlbmUuaWQgKyAxfTpgKTtcbiAgICBjb25zb2xlLmxvZyhg8J+OrCBTY2VuZSBkdXJhdGlvbjogJHtzY2VuZS5kdXJhdGlvbn1zYCk7XG4gICAgY29uc29sZS5sb2coZmZtcGVnUGF0aCwgZmZtcGVnQXJncy5qb2luKCcgJykpO1xuXG4gICAgY29uc3QgeyBzdGRvdXQsIHN0ZGVyciB9ID0gYXdhaXQgZXhlY0ZpbGVBc3luYyhmZm1wZWdQYXRoLCBmZm1wZWdBcmdzLCB7XG4gICAgICBtYXhCdWZmZXI6IDEwMjQgKiAxMDI0ICogMTAsXG4gICAgfSk7XG5cbiAgICBpZiAoc3RkZXJyKSB7XG4gICAgICBjb25zb2xlLmxvZygnRkZtcGVnIHN0ZGVycjonLCBzdGRlcnIpO1xuICAgIH1cblxuICAgIGlmIChzdGRvdXQpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdGRm1wZWcgc3Rkb3V0OicsIHN0ZG91dCk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgb3V0cHV0IGZpbGUgZXhpc3RzXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKG91dHB1dFZpZGVvUGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRkZtcGVnIGRpZCBub3QgZ2VuZXJhdGUgb3V0cHV0IHZpZGVvIGZpbGUnKTtcbiAgICB9XG5cbiAgICAvLyBVcGxvYWQgdG8gUzNcbiAgICBjb25zdCB2aWRlb0tleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wNGA7XG4gICAgY29uc3QgdmlkZW9CdWZmZXIgPSBmcy5yZWFkRmlsZVN5bmMob3V0cHV0VmlkZW9QYXRoKTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYOKYge+4jyBVcGxvYWRpbmcgdmlkZW8gdG8gUzM6ICR7cHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUV9LyR7dmlkZW9LZXl9YCxcbiAgICApO1xuXG4gICAgYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiB2aWRlb0tleSxcbiAgICAgICAgQm9keTogdmlkZW9CdWZmZXIsXG4gICAgICAgIENvbnRlbnRUeXBlOiAndmlkZW8vbXA0JyxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBDbGVhbiB1cCB0ZW1wb3JhcnkgZmlsZXNcbiAgICB0cnkge1xuICAgICAgZnMudW5saW5rU3luYyhpbnB1dEltYWdlUGF0aCk7XG4gICAgICBpZiAoaGFzV2F0ZXJtYXJrICYmIGZzLmV4aXN0c1N5bmMod2F0ZXJtYXJrUGF0aCkpIHtcbiAgICAgICAgZnMudW5saW5rU3luYyh3YXRlcm1hcmtQYXRoKTtcbiAgICAgIH1cbiAgICAgIGZzLnVubGlua1N5bmMob3V0cHV0VmlkZW9QYXRoKTtcbiAgICB9IGNhdGNoIChjbGVhbnVwRXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgJ+KaoO+4jyBXYXJuaW5nOiBDb3VsZCBub3QgY2xlYW4gdXAgdGVtcG9yYXJ5IGZpbGVzOicsXG4gICAgICAgIGNsZWFudXBFcnJvcixcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYOKchSBWaWRlbyB1cGxvYWRlZCB0byBTMzogJHt2aWRlb0tleX1gKTtcblxuICAgIC8vIEdlbmVyYXRlIHNpZ25lZCBVUkwgZm9yIHRoZSB1cGxvYWRlZCB2aWRlb1xuICAgIGNvbnN0IHZpZGVvU2lnbmVkVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKFxuICAgICAgczMsXG4gICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgIEtleTogdmlkZW9LZXksXG4gICAgICB9KSxcbiAgICAgIHsgZXhwaXJlc0luOiAzNjAwMCB9LCAvLyAxMCBob3VycyBleHBpcmF0aW9uXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKGDinIUgVmlkZW8gc2lnbmVkIFVSTCBnZW5lcmF0ZWQgZm9yIHNjZW5lICR7c2NlbmUuaWQgKyAxfWApO1xuICAgIHJldHVybiB2aWRlb1NpZ25lZFVybDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKFxuICAgICAgYOKdjCBFcnJvciBnZW5lcmF0aW5nIHZpZGVvIGZvciBzY2VuZSAke3NjZW5lLmlkICsgMX06YCxcbiAgICAgIGVycm9yLFxuICAgICk7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==