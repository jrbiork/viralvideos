"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
async function getVideoEffectUrls(userId, timestamp, scenes, user) {
    // Check if video effects already exist by listing S3 objects with prefix timestamp.scene- and suffix .mp4
    const s3Client = new client_s3_1.S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
    });
    const listCommand = new client_s3_1.ListObjectsV2Command({
        Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
        Prefix: `${userId}/${timestamp}.scene-`,
    });
    try {
        const listResult = await s3Client.send(listCommand);
        const existingVideoFiles = listResult.Contents?.filter((obj) => obj.Key?.endsWith('.mp4')) ||
            [];
        if (existingVideoFiles.length > 0) {
            console.log('🎥 Video effects already generated for the timestamp:', existingVideoFiles.length, 'files found');
            // Generate signed URLs for existing video files
            const signedUrlPromises = existingVideoFiles.map(async (obj) => {
                if (!obj.Key)
                    return null;
                const getObjectCommand = new client_s3_1.GetObjectCommand({
                    Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
                    Key: obj.Key,
                });
                const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, getObjectCommand, {
                    expiresIn: 36000, // 10 hours
                });
                // Extract filename without user prefix (e.g., "1004.scene-1.mp4")
                const filename = obj.Key.replace(`${userId}/`, '');
                return { [filename]: signedUrl };
            });
            return (await Promise.all(signedUrlPromises)).filter((urlObj) => urlObj !== null);
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
            try {
                // Get the image URL for this scene
                const imageKey = `${userId}/${timestamp}.scene-${scene.id}.png`;
                const imageUrl = await getImageSignedUrl(imageKey);
                if (!imageUrl) {
                    console.error(`❌ No image found for scene ${scene.id}`);
                    return null;
                }
                // Generate video with blur in/out and camera movement
                const videoSignedUrl = await generateSceneVideo(imageUrl, scene, userId, timestamp, user);
                // Extract filename without user prefix (e.g., "1004.scene-1.mp4")
                const filename = `${timestamp}.scene-${scene.id}.mp4`;
                console.log(`✅ Scene ${i + 1} video generated: ${filename}`);
                return { [filename]: videoSignedUrl };
            }
            catch (error) {
                console.error(`❌ Failed to generate video for scene ${i + 1}:`, error);
                throw new Error(`Failed to generate video for scene ${i + 1}: ${error}`);
            }
        });
        const videoUrls = (await Promise.all(videoPromises)).filter((urlObj) => urlObj !== null);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9FZmZlY3RzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmlkZW9FZmZlY3RzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBc0RBLGdEQTBEQztBQUVELG9EQTZEQztBQS9LRCxrREFLNEI7QUFDNUIsd0VBQTZEO0FBQzdELGlDQUEwQjtBQUMxQix5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLCtCQUFpQztBQUNqQyxpREFBK0M7QUFHL0MsTUFBTSxTQUFTLEdBQUcsSUFBQSxnQkFBUyxFQUFDLG9CQUFJLENBQUMsQ0FBQztBQUNsQyxNQUFNLGFBQWEsR0FBRyxJQUFBLGdCQUFTLEVBQUMsd0JBQVEsQ0FBQyxDQUFDO0FBQzFDLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBUzNFLFNBQVMsWUFBWSxDQUFDLENBQVM7SUFDN0IsSUFBSSxDQUFDO1FBQ0gsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxpQkFBaUI7SUFDeEIsTUFBTSxVQUFVLEdBQUc7UUFDakIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXO1FBQ3ZCLGlCQUFpQjtRQUNqQixhQUFhO1FBQ2IsaUJBQWlCO1FBQ2pCLHVCQUF1QjtLQUN4QixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQWEsQ0FBQztJQUU5QixLQUFLLE1BQU0sQ0FBQyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQzNCLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDO1lBQUUsT0FB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WSxFQUFFLENBQUM7WUFDdEIsT0FBTyxDQUFDLElBQUksQ0FDVixpREFBaUQsRUFDakQsWUFBWSxDQUNiLENBQUM7UUFDSixDQUFDO1FBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUVuRCw2Q0FBNkM7UUFDN0MsTUFBTSxjQUFjLEdBQUcsTUFBTSxJQUFBLG1DQUFZLEVBQ3ZDLEVBQUUsRUFDRixJQUFJLDRCQUFnQixDQUFDO1lBQ25CLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QjtZQUMzQyxHQUFHLEVBQUUsUUFBUTtTQUNkLENBQUMsRUFDRixFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FDckIsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLEtBQUssQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN0RSxPQUFPLGNBQWMsQ0FBQztJQUN4QixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQ1gsc0NBQXNDLEtBQUssQ0FBQyxFQUFFLEdBQUcsQ0FBQyxHQUFHLEVBQ3JELEtBQUssQ0FDTixDQUFDO1FBQ0YsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIFMzQ2xpZW50LFxuICBQdXRPYmplY3RDb21tYW5kLFxuICBHZXRPYmplY3RDb21tYW5kLFxuICBMaXN0T2JqZWN0c1YyQ29tbWFuZCxcbn0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcbmltcG9ydCB7IGdldFNpZ25lZFVybCB9IGZyb20gJ0Bhd3Mtc2RrL3MzLXJlcXVlc3QtcHJlc2lnbmVyJztcbmltcG9ydCBheGlvcyBmcm9tICdheGlvcyc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgcHJvbWlzaWZ5IH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgeyBleGVjLCBleGVjRmlsZSB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgVXNlckl0ZW0gfSBmcm9tICcuL3VzZXInO1xuXG5jb25zdCBleGVjQXN5bmMgPSBwcm9taXNpZnkoZXhlYyk7XG5jb25zdCBleGVjRmlsZUFzeW5jID0gcHJvbWlzaWZ5KGV4ZWNGaWxlKTtcbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjZW5lIHtcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgbmFycmF0aW9uOiBzdHJpbmc7XG4gIGlkOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGlzRXhlY3V0YWJsZShwOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgdHJ5IHtcbiAgICBmcy5hY2Nlc3NTeW5jKHAsIGZzLmNvbnN0YW50cy5YX09LKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVGZm1wZWdQYXRoKCk6IHN0cmluZyB7XG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSBbXG4gICAgcHJvY2Vzcy5lbnYuRkZNUEVHX1BBVEgsXG4gICAgJy9vcHQvYmluL2ZmbXBlZycsXG4gICAgJy9vcHQvZmZtcGVnJyxcbiAgICAnL3Vzci9iaW4vZmZtcGVnJyxcbiAgICAnL3Vzci9sb2NhbC9iaW4vZmZtcGVnJyxcbiAgXS5maWx0ZXIoQm9vbGVhbikgYXMgc3RyaW5nW107XG5cbiAgZm9yIChjb25zdCBwIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICBpZiAoZnMuZXhpc3RzU3luYyhwKSAmJiBpc0V4ZWN1dGFibGUocCkpIHJldHVybiBwO1xuICB9XG5cbiAgdGhyb3cgbmV3IEVycm9yKFxuICAgICdGRm1wZWcgYmluYXJ5IG5vdCBmb3VuZC4gRXhwZWN0ZWQgYXQgb25lIG9mOiAnICtcbiAgICAgIGNhbmRpZGF0ZXMuam9pbignLCAnKSArXG4gICAgICAnLiBFbnN1cmUgeW91ciBMYW1iZGEgbGF5ZXIgcHJvdmlkZXMgZmZtcGVnIChjb21tb24gcGF0aDogL29wdC9iaW4vZmZtcGVnKSBvciBzZXQgRkZNUEVHX1BBVEguJyxcbiAgKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFZpZGVvRWZmZWN0VXJscyhcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBzY2VuZXM6IE9taXQ8U2NlbmUsICdkZXNjcmlwdGlvbicgfCAnbmFycmF0aW9uJz5bXSxcbiAgdXNlcjogVXNlckl0ZW0gfCBudWxsLFxuKTogUHJvbWlzZTxBcnJheTx7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9Pj4ge1xuICAvLyBDaGVjayBpZiB2aWRlbyBlZmZlY3RzIGFscmVhZHkgZXhpc3QgYnkgbGlzdGluZyBTMyBvYmplY3RzIHdpdGggcHJlZml4IHRpbWVzdGFtcC5zY2VuZS0gYW5kIHN1ZmZpeCAubXA0XG4gIGNvbnN0IHMzQ2xpZW50ID0gbmV3IFMzQ2xpZW50KHtcbiAgICByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScsXG4gIH0pO1xuICBjb25zdCBsaXN0Q29tbWFuZCA9IG5ldyBMaXN0T2JqZWN0c1YyQ29tbWFuZCh7XG4gICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICBQcmVmaXg6IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLWAsXG4gIH0pO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgbGlzdFJlc3VsdCA9IGF3YWl0IHMzQ2xpZW50LnNlbmQobGlzdENvbW1hbmQpO1xuICAgIGNvbnN0IGV4aXN0aW5nVmlkZW9GaWxlcyA9XG4gICAgICBsaXN0UmVzdWx0LkNvbnRlbnRzPy5maWx0ZXIoKG9iajogYW55KSA9PiBvYmouS2V5Py5lbmRzV2l0aCgnLm1wNCcpKSB8fFxuICAgICAgW107XG5cbiAgICBpZiAoZXhpc3RpbmdWaWRlb0ZpbGVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBWaWRlbyBlZmZlY3RzIGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wOicsXG4gICAgICAgIGV4aXN0aW5nVmlkZW9GaWxlcy5sZW5ndGgsXG4gICAgICAgICdmaWxlcyBmb3VuZCcsXG4gICAgICApO1xuXG4gICAgICAvLyBHZW5lcmF0ZSBzaWduZWQgVVJMcyBmb3IgZXhpc3RpbmcgdmlkZW8gZmlsZXNcbiAgICAgIGNvbnN0IHNpZ25lZFVybFByb21pc2VzID0gZXhpc3RpbmdWaWRlb0ZpbGVzLm1hcChhc3luYyAob2JqOiBhbnkpID0+IHtcbiAgICAgICAgaWYgKCFvYmouS2V5KSByZXR1cm4gbnVsbDtcblxuICAgICAgICBjb25zdCBnZXRPYmplY3RDb21tYW5kID0gbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgICAgS2V5OiBvYmouS2V5LFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBzaWduZWRVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoczNDbGllbnQsIGdldE9iamVjdENvbW1hbmQsIHtcbiAgICAgICAgICBleHBpcmVzSW46IDM2MDAwLCAvLyAxMCBob3Vyc1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBFeHRyYWN0IGZpbGVuYW1lIHdpdGhvdXQgdXNlciBwcmVmaXggKGUuZy4sIFwiMTAwNC5zY2VuZS0xLm1wNFwiKVxuICAgICAgICBjb25zdCBmaWxlbmFtZSA9IG9iai5LZXkucmVwbGFjZShgJHt1c2VySWR9L2AsICcnKTtcblxuICAgICAgICByZXR1cm4geyBbZmlsZW5hbWVdOiBzaWduZWRVcmwgfTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gKGF3YWl0IFByb21pc2UuYWxsKHNpZ25lZFVybFByb21pc2VzKSkuZmlsdGVyKFxuICAgICAgICAodXJsT2JqOiBhbnkpOiB1cmxPYmogaXMgeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSA9PiB1cmxPYmogIT09IG51bGwsXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gYXdhaXQgZ2VuZXJhdGVWaWRlb0VmZmVjdHMoc2NlbmVzLCB1c2VySWQsIHRpbWVzdGFtcCwgdXNlcik7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNoZWNraW5nIGV4aXN0aW5nIHZpZGVvIGVmZmVjdHM6JywgZXJyb3IpO1xuICAgIC8vIEZhbGxiYWNrIHRvIGdlbmVyYXRpbmcgbmV3IHZpZGVvIGVmZmVjdHNcbiAgICByZXR1cm4gYXdhaXQgZ2VuZXJhdGVWaWRlb0VmZmVjdHMoc2NlbmVzLCB1c2VySWQsIHRpbWVzdGFtcCwgdXNlcik7XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlVmlkZW9FZmZlY3RzKFxuICBzY2VuZXM6IE9taXQ8U2NlbmUsICdkZXNjcmlwdGlvbicgfCAnbmFycmF0aW9uJz5bXSxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICB1c2VyOiBVc2VySXRlbSB8IG51bGwsXG4pOiBQcm9taXNlPEFycmF5PHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0+PiB7XG4gIC8vIEZvcm1hdDogW3sgXCJ0aW1lc3RhbXAuc2NlbmUtaWQubXA0XCI6IFwic2lnbmVkLXVybFwiIH1dXG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ/CfjqwgR2VuZXJhdGluZyB2aWRlbyBlZmZlY3RzIGZvciBzY2VuZXMuLi4nKTtcblxuICAgIC8vIFByb2Nlc3MgYWxsIHNjZW5lcyBpbiBwYXJhbGxlbFxuICAgIGNvbnN0IHZpZGVvUHJvbWlzZXMgPSBzY2VuZXMubWFwKGFzeW5jIChzY2VuZSwgaSkgPT4ge1xuICAgICAgY29uc29sZS5sb2coYPCfjqwgUHJvY2Vzc2luZyBzY2VuZSAke2kgKyAxfWApO1xuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBHZXQgdGhlIGltYWdlIFVSTCBmb3IgdGhpcyBzY2VuZVxuICAgICAgICBjb25zdCBpbWFnZUtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LnBuZ2A7XG4gICAgICAgIGNvbnN0IGltYWdlVXJsID0gYXdhaXQgZ2V0SW1hZ2VTaWduZWRVcmwoaW1hZ2VLZXkpO1xuXG4gICAgICAgIGlmICghaW1hZ2VVcmwpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgTm8gaW1hZ2UgZm91bmQgZm9yIHNjZW5lICR7c2NlbmUuaWR9YCk7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBHZW5lcmF0ZSB2aWRlbyB3aXRoIGJsdXIgaW4vb3V0IGFuZCBjYW1lcmEgbW92ZW1lbnRcbiAgICAgICAgY29uc3QgdmlkZW9TaWduZWRVcmwgPSBhd2FpdCBnZW5lcmF0ZVNjZW5lVmlkZW8oXG4gICAgICAgICAgaW1hZ2VVcmwsXG4gICAgICAgICAgc2NlbmUsXG4gICAgICAgICAgdXNlcklkLFxuICAgICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgICB1c2VyLFxuICAgICAgICApO1xuXG4gICAgICAgIC8vIEV4dHJhY3QgZmlsZW5hbWUgd2l0aG91dCB1c2VyIHByZWZpeCAoZS5nLiwgXCIxMDA0LnNjZW5lLTEubXA0XCIpXG4gICAgICAgIGNvbnN0IGZpbGVuYW1lID0gYCR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5tcDRgO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtpICsgMX0gdmlkZW8gZ2VuZXJhdGVkOiAke2ZpbGVuYW1lfWApO1xuICAgICAgICByZXR1cm4geyBbZmlsZW5hbWVdOiB2aWRlb1NpZ25lZFVybCB9O1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBnZW5lcmF0ZSB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX06YCwgZXJyb3IpO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYEZhaWxlZCB0byBnZW5lcmF0ZSB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX06ICR7ZXJyb3J9YCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IHZpZGVvVXJscyA9IChhd2FpdCBQcm9taXNlLmFsbCh2aWRlb1Byb21pc2VzKSkuZmlsdGVyKFxuICAgICAgKHVybE9iaik6IHVybE9iaiBpcyB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9ID0+IHVybE9iaiAhPT0gbnVsbCxcbiAgICApO1xuXG4gICAgaWYgKHZpZGVvVXJscy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIHZpZGVvcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyB2aWRlb3Mgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCAke3ZpZGVvVXJscy5sZW5ndGh9IHZpZGVvIGNsaXBzIHdpdGggZWZmZWN0c2ApO1xuICAgIHJldHVybiB2aWRlb1VybHM7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlVmlkZW9FZmZlY3RzOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRJbWFnZVNpZ25lZFVybChpbWFnZUtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICBLZXk6IGltYWdlS2V5LFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGF3YWl0IGdldFNpZ25lZFVybChzMywgY29tbWFuZCwgeyBleHBpcmVzSW46IDM2MDAwIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBnZXR0aW5nIHNpZ25lZCBVUkwgZm9yICR7aW1hZ2VLZXl9OmAsIGVycm9yKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVNjZW5lVmlkZW8oXG4gIGltYWdlVXJsOiBzdHJpbmcsXG4gIHNjZW5lOiBPbWl0PFNjZW5lLCAnZGVzY3JpcHRpb24nIHwgJ25hcnJhdGlvbic+LFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHVzZXI6IFVzZXJJdGVtIHwgbnVsbCxcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIHRyeSB7XG4gICAgLy8gRG93bmxvYWQgdGhlIGltYWdlXG4gICAgY29uc29sZS5sb2coYPCfk6UgRG93bmxvYWRpbmcgaW1hZ2UgZnJvbTogJHtpbWFnZVVybH1gKTtcbiAgICBjb25zdCBpbWFnZVJlc3BvbnNlID0gYXdhaXQgYXhpb3MuZ2V0KGltYWdlVXJsLCB7XG4gICAgICByZXNwb25zZVR5cGU6ICdhcnJheWJ1ZmZlcicsXG4gICAgfSk7XG4gICAgY29uc3QgaW1hZ2VCdWZmZXIgPSBCdWZmZXIuZnJvbShpbWFnZVJlc3BvbnNlLmRhdGEpO1xuXG4gICAgLy8gQ3JlYXRlIHRlbXBvcmFyeSBmaWxlc1xuICAgIGNvbnN0IHRlbXBEaXIgPSAnL3RtcCc7XG4gICAgY29uc3QgaW5wdXRJbWFnZVBhdGggPSBwYXRoLmpvaW4odGVtcERpciwgYGlucHV0LSR7c2NlbmUuaWR9LnBuZ2ApO1xuICAgIGNvbnN0IG91dHB1dFZpZGVvUGF0aCA9IHBhdGguam9pbih0ZW1wRGlyLCBgb3V0cHV0LSR7c2NlbmUuaWR9Lm1wNGApO1xuXG4gICAgbGV0IHdhdGVybWFya1BhdGggPSAnJztcbiAgICAvLyBkb3dubG9hZCB0aGUgd2F0ZXJtYXJrLnBuZyBmcm9tIHZpcmFsIHNob3J0IHBhcnRzIGJ1Y2tldFxuICAgIGlmIChcbiAgICAgIHVzZXI/LnN1YnNjcmlwdGlvbj8ubW9kZSA9PT0gJ2ZyZWUnIHx8XG4gICAgICB1c2VyPy5zdWJzY3JpcHRpb24/LnN0YXR1cyA9PT0gJ2NhbmNlbGxlZCcgfHxcbiAgICAgIHVzZXI/LnN1YnNjcmlwdGlvbj8uc3RhdHVzID09PSAnZXhwaXJlZCdcbiAgICApIHtcbiAgICAgIGNvbnN0IHdhdGVybWFya0tleSA9ICd3YXRlcm1hcmsucG5nJztcbiAgICAgIGNvbnN0IHdhdGVybWFya1VybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgICAgczMsXG4gICAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogd2F0ZXJtYXJrS2V5LFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIGNvbnN0IHdhdGVybWFya1Jlc3BvbnNlID0gYXdhaXQgYXhpb3MuZ2V0KHdhdGVybWFya1VybCwge1xuICAgICAgICByZXNwb25zZVR5cGU6ICdhcnJheWJ1ZmZlcicsXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHdhdGVybWFya0J1ZmZlciA9IEJ1ZmZlci5mcm9tKHdhdGVybWFya1Jlc3BvbnNlLmRhdGEpO1xuXG4gICAgICAvLyBXcml0ZSB3YXRlcm1hcmsgdG8gdGVtcCBmaWxlXG4gICAgICB3YXRlcm1hcmtQYXRoID0gcGF0aC5qb2luKHRlbXBEaXIsIGB3YXRlcm1hcmstJHtzY2VuZS5pZH0ucG5nYCk7XG4gICAgICBmcy53cml0ZUZpbGVTeW5jKHdhdGVybWFya1BhdGgsIHdhdGVybWFya0J1ZmZlcik7XG4gICAgfVxuXG4gICAgLy8gV3JpdGUgaW1hZ2UgdG8gdGVtcCBmaWxlXG4gICAgZnMud3JpdGVGaWxlU3luYyhpbnB1dEltYWdlUGF0aCwgaW1hZ2VCdWZmZXIpO1xuXG4gICAgY29uc3QgZnJhbWVzID0gTWF0aC5mbG9vcihzY2VuZS5kdXJhdGlvbiAqIDI1KTtcbiAgICBjb25zdCBibHVySW5EdXJhdGlvbiA9IDAuMjtcbiAgICBjb25zdCB6b29tT3V0RnJhbWVzID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihibHVySW5EdXJhdGlvbiAqIDI1KSk7XG5cbiAgICAvLyBhZGQgbmVhciB5b3VyIG90aGVyIHBhcmFtc1xuICAgIGNvbnN0IG1vdmVSYWRpdXMgPSAyNTsgLy8gcHggKG1vcmUgaW50ZW50aW9uYWwgYW5kIHZpc2libGUpXG4gICAgY29uc3QgbW92ZVBlcmlvZCA9IDE4MDsgLy8gZnJhbWVzICh+Ny4ycyBAMjVmcHMpIC0gZmFzdGVyIG1vdmVtZW50XG5cbiAgICAvLyBkZXRlcm1pbmlzdGljYWxseSBjaG9vc2Ugb25lIG9mIHRocmVlIG1vdGlvbiB2YXJpYW50cyBwZXIgc2NlbmUgKGluZGV4LWJhc2VkKVxuICAgIGNvbnN0IHZhcmlhbnQgPSBzY2VuZS5pZCAlIDM7IC8vIDA6IGRyYW1hdGljIHBvcC1vdXQrZHJpZnQsIDE6IHN0cm9uZyB6b29tLWluLCAyOiBzdHJvbmcgem9vbS1vdXRcbiAgICBjb25zb2xlLmxvZyhg8J+OqCBNb3Rpb24gdmFyaWFudCBzZWxlY3RlZCAoaW5kZXgtYmFzZWQpOiAke3ZhcmlhbnR9YCk7XG5cbiAgICAvLyBNb3Rpb24gdmFyaWFudCBjb25maWd1cmF0aW9uc1xuICAgIGNvbnN0IG1vdGlvblZhcmlhbnRzID0ge1xuICAgICAgMDoge1xuICAgICAgICAvLyBWYXJpYW50IDA6IGRyYW1hdGljIHpvb20tb3V0IHBvcCB0aGVuIGhvbGQgem9vbSArIHByb25vdW5jZWQgY2lyY3VsYXIgZHJpZnRcbiAgICAgICAgem9vbTogYGlmKGx0ZShvblxcXFwsJHt6b29tT3V0RnJhbWVzfSlcXFxcLDEuMTUtKDAuMDgqb24vJHt6b29tT3V0RnJhbWVzfSlcXFxcLDEuMDgpYCxcbiAgICAgICAgeDogYGl3LzItKGl3L3pvb20vMikgKyBpZihndGUob25cXFxcLCR7em9vbU91dEZyYW1lc30pXFxcXCwgJHttb3ZlUmFkaXVzfSpjb3MoMipQSSoob24tJHt6b29tT3V0RnJhbWVzfSkvJHttb3ZlUGVyaW9kfSlcXFxcLCAwKWAsXG4gICAgICAgIHk6IGBpaC8yLShpaC96b29tLzIpICsgaWYoZ3RlKG9uXFxcXCwke3pvb21PdXRGcmFtZXN9KVxcXFwsICR7bW92ZVJhZGl1c30qc2luKDIqUEkqKG9uLSR7em9vbU91dEZyYW1lc30pLyR7bW92ZVBlcmlvZH0pXFxcXCwgMClgLFxuICAgICAgICBzdXBlcnNhbXBsZTogJzE0NDB4MjU2MCcsXG4gICAgICAgIHRtaXg6IFwiZnJhbWVzPTI6d2VpZ2h0cz0nMSAxJ1wiLFxuICAgICAgICBzY2FsZTogJ3NjYWxlPTcyMDoxMjgwOmZsYWdzPXNwbGluZTpzd3NfZGl0aGVyPW5vbmUnLFxuICAgICAgfSxcbiAgICAgIDE6IHtcbiAgICAgICAgLy8gVmFyaWFudCAxOiBzdHJvbmcgY29udGludW91cyB6b29tLWluIChLZW4gQnVybnMpICsgcHJvbm91bmNlZCBjaXJjdWxhciBkcmlmdFxuICAgICAgICB6b29tOiAnbWluKHBvdygxLjAwMTJcXFxcLG9uKVxcXFwsMS4xNSknLFxuICAgICAgICB4OiBgaXcvMi0oaXcvem9vbS8yKSArICR7bW92ZVJhZGl1c30qY29zKDIqUEkqb24vJHttb3ZlUGVyaW9kfSlgLFxuICAgICAgICB5OiBgaWgvMi0oaWgvem9vbS8yKSArICR7bW92ZVJhZGl1c30qc2luKDIqUEkqb24vJHttb3ZlUGVyaW9kfSlgLFxuICAgICAgICBzdXBlcnNhbXBsZTogJzE0NDB4MjU2MCcsXG4gICAgICAgIHRtaXg6IFwiZnJhbWVzPTI6d2VpZ2h0cz0nMSAxJ1wiLFxuICAgICAgICBzY2FsZTogJ3NjYWxlPTcyMDoxMjgwOmZsYWdzPWxhbmN6b3M6c3dzX2RpdGhlcj1ub25lJyxcbiAgICAgIH0sXG4gICAgICAyOiB7XG4gICAgICAgIC8vIFZhcmlhbnQgMjogc3Ryb25nIGNvbnRpbnVvdXMgem9vbS1vdXQgKyBwcm9ub3VuY2VkIGVsbGlwdGljYWwgZHJpZnRcbiAgICAgICAgem9vbTogYG1heCgxLjA1XFxcXCwgMS4xMiAtIDAuMDcqb24vJHtmcmFtZXN9KWAsXG4gICAgICAgIHg6IGBpdy8yLShpdy96b29tLzIpICsgJHttb3ZlUmFkaXVzfSpjb3MoMipQSSpvbi8ke21vdmVQZXJpb2R9KWAsXG4gICAgICAgIHk6IGBpaC8yLShpaC96b29tLzIpICsgKCR7bW92ZVJhZGl1c30vMS4yKSpzaW4oMipQSSpvbi8ke21vdmVQZXJpb2R9KWAsXG4gICAgICAgIHN1cGVyc2FtcGxlOiAnMTQ0MHgyNTYwJyxcbiAgICAgICAgdG1peDogXCJmcmFtZXM9Mjp3ZWlnaHRzPScxIDEnXCIsXG4gICAgICAgIHNjYWxlOiAnc2NhbGU9NzIwOjEyODA6ZmxhZ3M9bGFuY3pvczpzd3NfZGl0aGVyPW5vbmUnLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgY29uc3QgY29uZmlnID0gbW90aW9uVmFyaWFudHNbdmFyaWFudCBhcyBrZXlvZiB0eXBlb2YgbW90aW9uVmFyaWFudHNdO1xuXG4gICAgLy8gQnVpbGQgZmlsdGVyIGdyYXBoIGNvbmRpdGlvbmFsbHkgZGVwZW5kaW5nIG9uIHdhdGVybWFyayBhdmFpbGFiaWxpdHlcbiAgICBjb25zdCBoYXNXYXRlcm1hcmsgPSBCb29sZWFuKFxuICAgICAgd2F0ZXJtYXJrUGF0aCAmJiB3YXRlcm1hcmtQYXRoLnRyaW0oKS5sZW5ndGggPiAwLFxuICAgICk7XG5cbiAgICBjb25zdCBmaWx0ZXJDb21wbGV4ID0gaGFzV2F0ZXJtYXJrXG4gICAgICA/IGBbMDp2XXpvb21wYW49ej0nJHtjb25maWcuem9vbX0nOmQ9JHtmcmFtZXN9OmAgK1xuICAgICAgICBgeD0nJHtjb25maWcueH0nOmAgK1xuICAgICAgICBgeT0nJHtjb25maWcueX0nOmAgK1xuICAgICAgICBgcz0ke2NvbmZpZy5zdXBlcnNhbXBsZX0sYCArXG4gICAgICAgIGB0bWl4PSR7Y29uZmlnLnRtaXh9LGAgK1xuICAgICAgICBgZnBzPTI1LGAgK1xuICAgICAgICBgJHtjb25maWcuc2NhbGV9LGAgK1xuICAgICAgICBgc3BsaXRbYjBdW2IxXTtgICtcbiAgICAgICAgYFtiMV1ib3hibHVyPTg6MVtiYl07YCArXG4gICAgICAgIGBbYjBdW2JiXWJsZW5kPWFsbF9leHByPSdBKigxLW1heCgwXFwsMSAtIFQvJHtibHVySW5EdXJhdGlvbn0pKSArIEIqbWF4KDBcXCwxIC0gVC8ke2JsdXJJbkR1cmF0aW9ufSknW21haW5dO2AgK1xuICAgICAgICBgWzE6dl1zY2FsZT0yMDA6LTFbd2F0ZXJtYXJrXTtgICtcbiAgICAgICAgYFttYWluXVt3YXRlcm1hcmtdb3ZlcmxheT0oVy13KS8yOjEyW3ZdYFxuICAgICAgOiBgWzA6dl16b29tcGFuPXo9JyR7Y29uZmlnLnpvb219JzpkPSR7ZnJhbWVzfTpgICtcbiAgICAgICAgYHg9JyR7Y29uZmlnLnh9JzpgICtcbiAgICAgICAgYHk9JyR7Y29uZmlnLnl9JzpgICtcbiAgICAgICAgYHM9JHtjb25maWcuc3VwZXJzYW1wbGV9LGAgK1xuICAgICAgICBgdG1peD0ke2NvbmZpZy50bWl4fSxgICtcbiAgICAgICAgYGZwcz0yNSxgICtcbiAgICAgICAgYCR7Y29uZmlnLnNjYWxlfSxgICtcbiAgICAgICAgYHNwbGl0W2IwXVtiMV07YCArXG4gICAgICAgIGBbYjFdYm94Ymx1cj04OjFbYmJdO2AgK1xuICAgICAgICBgW2IwXVtiYl1ibGVuZD1hbGxfZXhwcj0nQSooMS1tYXgoMFxcLDEgLSBULyR7Ymx1ckluRHVyYXRpb259KSkgKyBCKm1heCgwXFwsMSAtIFQvJHtibHVySW5EdXJhdGlvbn0pJ1t2XWA7XG5cbiAgICBjb25zdCBmZm1wZWdQYXRoID0gcmVzb2x2ZUZmbXBlZ1BhdGgoKTtcblxuICAgIGNvbnN0IGZmbXBlZ0FyZ3MgPSBoYXNXYXRlcm1hcmtcbiAgICAgID8gW1xuICAgICAgICAgICctbG9vcCcsXG4gICAgICAgICAgJzEnLFxuICAgICAgICAgICctaScsXG4gICAgICAgICAgaW5wdXRJbWFnZVBhdGgsXG4gICAgICAgICAgJy1sb29wJyxcbiAgICAgICAgICAnMScsXG4gICAgICAgICAgJy1pJyxcbiAgICAgICAgICB3YXRlcm1hcmtQYXRoLFxuICAgICAgICAgICctZmlsdGVyX2NvbXBsZXgnLFxuICAgICAgICAgIGZpbHRlckNvbXBsZXgsXG4gICAgICAgICAgJy1tYXAnLFxuICAgICAgICAgICdbdl0nLFxuICAgICAgICAgICctYzp2JyxcbiAgICAgICAgICAnbGlieDI2NCcsXG4gICAgICAgICAgJy1wcmVzZXQnLFxuICAgICAgICAgICd2ZXJ5ZmFzdCcsXG4gICAgICAgICAgJy1jcmYnLFxuICAgICAgICAgICcyMycsXG4gICAgICAgICAgJy1waXhfZm10JyxcbiAgICAgICAgICAneXV2NDIwcCcsXG4gICAgICAgICAgJy10aHJlYWRzJyxcbiAgICAgICAgICAnMCcsXG4gICAgICAgICAgJy10JyxcbiAgICAgICAgICBzY2VuZS5kdXJhdGlvbi50b1N0cmluZygpLFxuICAgICAgICAgICcteScsXG4gICAgICAgICAgb3V0cHV0VmlkZW9QYXRoLFxuICAgICAgICBdXG4gICAgICA6IFtcbiAgICAgICAgICAnLWxvb3AnLFxuICAgICAgICAgICcxJyxcbiAgICAgICAgICAnLWknLFxuICAgICAgICAgIGlucHV0SW1hZ2VQYXRoLFxuICAgICAgICAgICctZmlsdGVyX2NvbXBsZXgnLFxuICAgICAgICAgIGZpbHRlckNvbXBsZXgsXG4gICAgICAgICAgJy1tYXAnLFxuICAgICAgICAgICdbdl0nLFxuICAgICAgICAgICctYzp2JyxcbiAgICAgICAgICAnbGlieDI2NCcsXG4gICAgICAgICAgJy1wcmVzZXQnLFxuICAgICAgICAgICd2ZXJ5ZmFzdCcsXG4gICAgICAgICAgJy1jcmYnLFxuICAgICAgICAgICcyMycsXG4gICAgICAgICAgJy1waXhfZm10JyxcbiAgICAgICAgICAneXV2NDIwcCcsXG4gICAgICAgICAgJy10aHJlYWRzJyxcbiAgICAgICAgICAnMCcsXG4gICAgICAgICAgJy10JyxcbiAgICAgICAgICBzY2VuZS5kdXJhdGlvbi50b1N0cmluZygpLFxuICAgICAgICAgICcteScsXG4gICAgICAgICAgb3V0cHV0VmlkZW9QYXRoLFxuICAgICAgICBdO1xuXG4gICAgY29uc29sZS5sb2coYPCfjqwgUnVubmluZyBGRm1wZWcgY29tbWFuZCBmb3Igc2NlbmUgJHtzY2VuZS5pZCArIDF9OmApO1xuICAgIGNvbnNvbGUubG9nKGDwn46sIFNjZW5lIGR1cmF0aW9uOiAke3NjZW5lLmR1cmF0aW9ufXNgKTtcbiAgICBjb25zb2xlLmxvZyhmZm1wZWdQYXRoLCBmZm1wZWdBcmdzLmpvaW4oJyAnKSk7XG5cbiAgICBjb25zdCB7IHN0ZG91dCwgc3RkZXJyIH0gPSBhd2FpdCBleGVjRmlsZUFzeW5jKGZmbXBlZ1BhdGgsIGZmbXBlZ0FyZ3MsIHtcbiAgICAgIG1heEJ1ZmZlcjogMTAyNCAqIDEwMjQgKiAxMCxcbiAgICB9KTtcblxuICAgIGlmIChzdGRlcnIpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdGRm1wZWcgc3RkZXJyOicsIHN0ZGVycik7XG4gICAgfVxuXG4gICAgaWYgKHN0ZG91dCkge1xuICAgICAgY29uc29sZS5sb2coJ0ZGbXBlZyBzdGRvdXQ6Jywgc3Rkb3V0KTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiBvdXRwdXQgZmlsZSBleGlzdHNcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMob3V0cHV0VmlkZW9QYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGRm1wZWcgZGlkIG5vdCBnZW5lcmF0ZSBvdXRwdXQgdmlkZW8gZmlsZScpO1xuICAgIH1cblxuICAgIC8vIFVwbG9hZCB0byBTM1xuICAgIGNvbnN0IHZpZGVvS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ubXA0YDtcbiAgICBjb25zdCB2aWRlb0J1ZmZlciA9IGZzLnJlYWRGaWxlU3luYyhvdXRwdXRWaWRlb1BhdGgpO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBg4piB77iPIFVwbG9hZGluZyB2aWRlbyB0byBTMzogJHtwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRX0vJHt2aWRlb0tleX1gLFxuICAgICk7XG5cbiAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IHZpZGVvS2V5LFxuICAgICAgICBCb2R5OiB2aWRlb0J1ZmZlcixcbiAgICAgICAgQ29udGVudFR5cGU6ICd2aWRlby9tcDQnLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIENsZWFuIHVwIHRlbXBvcmFyeSBmaWxlc1xuICAgIHRyeSB7XG4gICAgICBmcy51bmxpbmtTeW5jKGlucHV0SW1hZ2VQYXRoKTtcbiAgICAgIGlmIChoYXNXYXRlcm1hcmsgJiYgZnMuZXhpc3RzU3luYyh3YXRlcm1hcmtQYXRoKSkge1xuICAgICAgICBmcy51bmxpbmtTeW5jKHdhdGVybWFya1BhdGgpO1xuICAgICAgfVxuICAgICAgZnMudW5saW5rU3luYyhvdXRwdXRWaWRlb1BhdGgpO1xuICAgIH0gY2F0Y2ggKGNsZWFudXBFcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAn4pqg77iPIFdhcm5pbmc6IENvdWxkIG5vdCBjbGVhbiB1cCB0ZW1wb3JhcnkgZmlsZXM6JyxcbiAgICAgICAgY2xlYW51cEVycm9yLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhg4pyFIFZpZGVvIHVwbG9hZGVkIHRvIFMzOiAke3ZpZGVvS2V5fWApO1xuXG4gICAgLy8gR2VuZXJhdGUgc2lnbmVkIFVSTCBmb3IgdGhlIHVwbG9hZGVkIHZpZGVvXG4gICAgY29uc3QgdmlkZW9TaWduZWRVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoXG4gICAgICBzMyxcbiAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiB2aWRlb0tleSxcbiAgICAgIH0pLFxuICAgICAgeyBleHBpcmVzSW46IDM2MDAwIH0sIC8vIDEwIGhvdXJzIGV4cGlyYXRpb25cbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coYOKchSBWaWRlbyBzaWduZWQgVVJMIGdlbmVyYXRlZCBmb3Igc2NlbmUgJHtzY2VuZS5pZCArIDF9YCk7XG4gICAgcmV0dXJuIHZpZGVvU2lnbmVkVXJsO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICBg4p2MIEVycm9yIGdlbmVyYXRpbmcgdmlkZW8gZm9yIHNjZW5lICR7c2NlbmUuaWQgKyAxfTpgLFxuICAgICAgZXJyb3IsXG4gICAgKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19