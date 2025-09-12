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
async function getVideoEffectUrls(userId, timestamp, scenes) {
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
            return await generateVideoEffects(scenes, userId, timestamp);
        }
    }
    catch (error) {
        console.error('Error checking existing video effects:', error);
        // Fallback to generating new video effects
        return await generateVideoEffects(scenes, userId, timestamp);
    }
}
async function generateVideoEffects(scenes, userId, timestamp) {
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
                const videoSignedUrl = await generateSceneVideo(imageUrl, scene, userId, timestamp);
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
async function generateSceneVideo(imageUrl, scene, userId, timestamp) {
    try {
        // Download the image
        console.log(`📥 Downloading image from: ${imageUrl}`);
        const imageResponse = await axios_1.default.get(imageUrl, {
            responseType: 'arraybuffer',
        });
        const imageBuffer = Buffer.from(imageResponse.data);
        // download the watermark.png from viral short parts bucket
        const watermarkKey = 'watermark.png';
        const watermarkUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3, new client_s3_1.GetObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: watermarkKey,
        }));
        const watermarkResponse = await axios_1.default.get(watermarkUrl, {
            responseType: 'arraybuffer',
        });
        const watermarkBuffer = Buffer.from(watermarkResponse.data);
        // Create temporary files
        const tempDir = '/tmp';
        const inputImagePath = path.join(tempDir, `input-${scene.id}.png`);
        const outputVideoPath = path.join(tempDir, `output-${scene.id}.mp4`);
        // Write image to temp file
        fs.writeFileSync(inputImagePath, imageBuffer);
        // Write watermark to temp file
        const watermarkPath = path.join(tempDir, `watermark-${scene.id}.png`);
        fs.writeFileSync(watermarkPath, watermarkBuffer);
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
        const filterComplex = `[0:v]zoompan=z='${config.zoom}':d=${frames}:` +
            `x='${config.x}':` +
            `y='${config.y}':` +
            `s=${config.supersample},` +
            `tmix=${config.tmix},` +
            `fps=25,` +
            `${config.scale},` +
            `split[b0][b1];` +
            `[b1]boxblur=8:1[bb];` +
            `[b0][bb]blend=all_expr='A*(1-max(0\\,1 - T/${blurInDuration})) + B*max(0\\,1 - T/${blurInDuration})'[main];` +
            `[1:v]scale=200:-1[watermark];` +
            `[main][watermark]overlay=(W-w)/2:12[v]`;
        const ffmpegPath = resolveFfmpegPath();
        const ffmpegArgs = [
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
            fs.unlinkSync(watermarkPath);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9FZmZlY3RzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmlkZW9FZmZlY3RzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBcURBLGdEQXlEQztBQUVELG9EQTJEQztBQTNLRCxrREFLNEI7QUFDNUIsd0VBQTZEO0FBQzdELGlDQUEwQjtBQUMxQix5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLCtCQUFpQztBQUNqQyxpREFBK0M7QUFFL0MsTUFBTSxTQUFTLEdBQUcsSUFBQSxnQkFBUyxFQUFDLG9CQUFJLENBQUMsQ0FBQztBQUNsQyxNQUFNLGFBQWEsR0FBRyxJQUFBLGdCQUFTLEVBQUMsd0JBQVEsQ0FBQyxDQUFDO0FBQzFDLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBUzNFLFNBQVMsWUFBWSxDQUFDLENBQVM7SUFDN0IsSUFBSSxDQUFDO1FBQ0gsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxpQkFBaUI7SUFDeEIsTUFBTSxVQUFVLEdBQUc7UUFDakIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXO1FBQ3ZCLGlCQUFpQjtRQUNqQixhQUFhO1FBQ2IsaUJBQWlCO1FBQ2pCLHVCQUF1QjtLQUN4QixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQWEsQ0FBQztJQUU5QixLQUFLLE1BQU0sQ0FBQyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQzNCLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDO1lBQUUsT0FB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LEVBQ3ZDLEVBQUUsRUFDRixJQUFJLDRCQUFnQixDQUFDO1lBQ25CLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QjtZQUMzQyxHQUFHLEVBQUUsUUFBUTtTQUNkLENBQUMsRUFDRixFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FDckIsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLEtBQUssQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN0RSxPQUFPLGNBQWMsQ0FBQztJQUN4QixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQ1gsc0NBQXNDLEtBQUssQ0FBQyxFQUFFLEdBQUcsQ0FBQyxHQUFHLEVBQ3JELEtBQUssQ0FDTixDQUFDO1FBQ0YsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIFMzQ2xpZW50LFxuICBQdXRPYmplY3RDb21tYW5kLFxuICBHZXRPYmplY3RDb21tYW5kLFxuICBMaXN0T2JqZWN0c1YyQ29tbWFuZCxcbn0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcbmltcG9ydCB7IGdldFNpZ25lZFVybCB9IGZyb20gJ0Bhd3Mtc2RrL3MzLXJlcXVlc3QtcHJlc2lnbmVyJztcbmltcG9ydCBheGlvcyBmcm9tICdheGlvcyc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgcHJvbWlzaWZ5IH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgeyBleGVjLCBleGVjRmlsZSB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuXG5jb25zdCBleGVjQXN5bmMgPSBwcm9taXNpZnkoZXhlYyk7XG5jb25zdCBleGVjRmlsZUFzeW5jID0gcHJvbWlzaWZ5KGV4ZWNGaWxlKTtcbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjZW5lIHtcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgbmFycmF0aW9uOiBzdHJpbmc7XG4gIGlkOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGlzRXhlY3V0YWJsZShwOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgdHJ5IHtcbiAgICBmcy5hY2Nlc3NTeW5jKHAsIGZzLmNvbnN0YW50cy5YX09LKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVGZm1wZWdQYXRoKCk6IHN0cmluZyB7XG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSBbXG4gICAgcHJvY2Vzcy5lbnYuRkZNUEVHX1BBVEgsXG4gICAgJy9vcHQvYmluL2ZmbXBlZycsXG4gICAgJy9vcHQvZmZtcGVnJyxcbiAgICAnL3Vzci9iaW4vZmZtcGVnJyxcbiAgICAnL3Vzci9sb2NhbC9iaW4vZmZtcGVnJyxcbiAgXS5maWx0ZXIoQm9vbGVhbikgYXMgc3RyaW5nW107XG5cbiAgZm9yIChjb25zdCBwIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICBpZiAoZnMuZXhpc3RzU3luYyhwKSAmJiBpc0V4ZWN1dGFibGUocCkpIHJldHVybiBwO1xuICB9XG5cbiAgdGhyb3cgbmV3IEVycm9yKFxuICAgICdGRm1wZWcgYmluYXJ5IG5vdCBmb3VuZC4gRXhwZWN0ZWQgYXQgb25lIG9mOiAnICtcbiAgICAgIGNhbmRpZGF0ZXMuam9pbignLCAnKSArXG4gICAgICAnLiBFbnN1cmUgeW91ciBMYW1iZGEgbGF5ZXIgcHJvdmlkZXMgZmZtcGVnIChjb21tb24gcGF0aDogL29wdC9iaW4vZmZtcGVnKSBvciBzZXQgRkZNUEVHX1BBVEguJyxcbiAgKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldFZpZGVvRWZmZWN0VXJscyhcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBzY2VuZXM6IE9taXQ8U2NlbmUsICdkZXNjcmlwdGlvbicgfCAnbmFycmF0aW9uJz5bXSxcbik6IFByb21pc2U8QXJyYXk8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT4+IHtcbiAgLy8gQ2hlY2sgaWYgdmlkZW8gZWZmZWN0cyBhbHJlYWR5IGV4aXN0IGJ5IGxpc3RpbmcgUzMgb2JqZWN0cyB3aXRoIHByZWZpeCB0aW1lc3RhbXAuc2NlbmUtIGFuZCBzdWZmaXggLm1wNFxuICBjb25zdCBzM0NsaWVudCA9IG5ldyBTM0NsaWVudCh7XG4gICAgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxuICB9KTtcbiAgY29uc3QgbGlzdENvbW1hbmQgPSBuZXcgTGlzdE9iamVjdHNWMkNvbW1hbmQoe1xuICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgUHJlZml4OiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS1gLFxuICB9KTtcblxuICB0cnkge1xuICAgIGNvbnN0IGxpc3RSZXN1bHQgPSBhd2FpdCBzM0NsaWVudC5zZW5kKGxpc3RDb21tYW5kKTtcbiAgICBjb25zdCBleGlzdGluZ1ZpZGVvRmlsZXMgPVxuICAgICAgbGlzdFJlc3VsdC5Db250ZW50cz8uZmlsdGVyKChvYmo6IGFueSkgPT4gb2JqLktleT8uZW5kc1dpdGgoJy5tcDQnKSkgfHxcbiAgICAgIFtdO1xuXG4gICAgaWYgKGV4aXN0aW5nVmlkZW9GaWxlcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgVmlkZW8gZWZmZWN0cyBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcDonLFxuICAgICAgICBleGlzdGluZ1ZpZGVvRmlsZXMubGVuZ3RoLFxuICAgICAgICAnZmlsZXMgZm91bmQnLFxuICAgICAgKTtcblxuICAgICAgLy8gR2VuZXJhdGUgc2lnbmVkIFVSTHMgZm9yIGV4aXN0aW5nIHZpZGVvIGZpbGVzXG4gICAgICBjb25zdCBzaWduZWRVcmxQcm9taXNlcyA9IGV4aXN0aW5nVmlkZW9GaWxlcy5tYXAoYXN5bmMgKG9iajogYW55KSA9PiB7XG4gICAgICAgIGlmICghb2JqLktleSkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgY29uc3QgZ2V0T2JqZWN0Q29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogb2JqLktleSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3Qgc2lnbmVkVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKHMzQ2xpZW50LCBnZXRPYmplY3RDb21tYW5kLCB7XG4gICAgICAgICAgZXhwaXJlc0luOiAzNjAwMCwgLy8gMTAgaG91cnNcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gRXh0cmFjdCBmaWxlbmFtZSB3aXRob3V0IHVzZXIgcHJlZml4IChlLmcuLCBcIjEwMDQuc2NlbmUtMS5tcDRcIilcbiAgICAgICAgY29uc3QgZmlsZW5hbWUgPSBvYmouS2V5LnJlcGxhY2UoYCR7dXNlcklkfS9gLCAnJyk7XG5cbiAgICAgICAgcmV0dXJuIHsgW2ZpbGVuYW1lXTogc2lnbmVkVXJsIH07XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIChhd2FpdCBQcm9taXNlLmFsbChzaWduZWRVcmxQcm9taXNlcykpLmZpbHRlcihcbiAgICAgICAgKHVybE9iajogYW55KTogdXJsT2JqIGlzIHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPT4gdXJsT2JqICE9PSBudWxsLFxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGF3YWl0IGdlbmVyYXRlVmlkZW9FZmZlY3RzKHNjZW5lcywgdXNlcklkLCB0aW1lc3RhbXApO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjaGVja2luZyBleGlzdGluZyB2aWRlbyBlZmZlY3RzOicsIGVycm9yKTtcbiAgICAvLyBGYWxsYmFjayB0byBnZW5lcmF0aW5nIG5ldyB2aWRlbyBlZmZlY3RzXG4gICAgcmV0dXJuIGF3YWl0IGdlbmVyYXRlVmlkZW9FZmZlY3RzKHNjZW5lcywgdXNlcklkLCB0aW1lc3RhbXApO1xuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVZpZGVvRWZmZWN0cyhcbiAgc2NlbmVzOiBPbWl0PFNjZW5lLCAnZGVzY3JpcHRpb24nIHwgJ25hcnJhdGlvbic+W10sXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbik6IFByb21pc2U8QXJyYXk8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT4+IHtcbiAgLy8gRm9ybWF0OiBbeyBcInRpbWVzdGFtcC5zY2VuZS1pZC5tcDRcIjogXCJzaWduZWQtdXJsXCIgfV1cbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZygn8J+OrCBHZW5lcmF0aW5nIHZpZGVvIGVmZmVjdHMgZm9yIHNjZW5lcy4uLicpO1xuXG4gICAgLy8gUHJvY2VzcyBhbGwgc2NlbmVzIGluIHBhcmFsbGVsXG4gICAgY29uc3QgdmlkZW9Qcm9taXNlcyA9IHNjZW5lcy5tYXAoYXN5bmMgKHNjZW5lLCBpKSA9PiB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+OrCBQcm9jZXNzaW5nIHNjZW5lICR7aSArIDF9YCk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIEdldCB0aGUgaW1hZ2UgVVJMIGZvciB0aGlzIHNjZW5lXG4gICAgICAgIGNvbnN0IGltYWdlS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ucG5nYDtcbiAgICAgICAgY29uc3QgaW1hZ2VVcmwgPSBhd2FpdCBnZXRJbWFnZVNpZ25lZFVybChpbWFnZUtleSk7XG5cbiAgICAgICAgaWYgKCFpbWFnZVVybCkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBObyBpbWFnZSBmb3VuZCBmb3Igc2NlbmUgJHtzY2VuZS5pZH1gKTtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEdlbmVyYXRlIHZpZGVvIHdpdGggYmx1ciBpbi9vdXQgYW5kIGNhbWVyYSBtb3ZlbWVudFxuICAgICAgICBjb25zdCB2aWRlb1NpZ25lZFVybCA9IGF3YWl0IGdlbmVyYXRlU2NlbmVWaWRlbyhcbiAgICAgICAgICBpbWFnZVVybCxcbiAgICAgICAgICBzY2VuZSxcbiAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICApO1xuXG4gICAgICAgIC8vIEV4dHJhY3QgZmlsZW5hbWUgd2l0aG91dCB1c2VyIHByZWZpeCAoZS5nLiwgXCIxMDA0LnNjZW5lLTEubXA0XCIpXG4gICAgICAgIGNvbnN0IGZpbGVuYW1lID0gYCR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5tcDRgO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtpICsgMX0gdmlkZW8gZ2VuZXJhdGVkOiAke2ZpbGVuYW1lfWApO1xuICAgICAgICByZXR1cm4geyBbZmlsZW5hbWVdOiB2aWRlb1NpZ25lZFVybCB9O1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBnZW5lcmF0ZSB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX06YCwgZXJyb3IpO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYEZhaWxlZCB0byBnZW5lcmF0ZSB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX06ICR7ZXJyb3J9YCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IHZpZGVvVXJscyA9IChhd2FpdCBQcm9taXNlLmFsbCh2aWRlb1Byb21pc2VzKSkuZmlsdGVyKFxuICAgICAgKHVybE9iaik6IHVybE9iaiBpcyB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9ID0+IHVybE9iaiAhPT0gbnVsbCxcbiAgICApO1xuXG4gICAgaWYgKHZpZGVvVXJscy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIHZpZGVvcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyB2aWRlb3Mgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCAke3ZpZGVvVXJscy5sZW5ndGh9IHZpZGVvIGNsaXBzIHdpdGggZWZmZWN0c2ApO1xuICAgIHJldHVybiB2aWRlb1VybHM7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlVmlkZW9FZmZlY3RzOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRJbWFnZVNpZ25lZFVybChpbWFnZUtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICBLZXk6IGltYWdlS2V5LFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGF3YWl0IGdldFNpZ25lZFVybChzMywgY29tbWFuZCwgeyBleHBpcmVzSW46IDM2MDAwIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBnZXR0aW5nIHNpZ25lZCBVUkwgZm9yICR7aW1hZ2VLZXl9OmAsIGVycm9yKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVNjZW5lVmlkZW8oXG4gIGltYWdlVXJsOiBzdHJpbmcsXG4gIHNjZW5lOiBPbWl0PFNjZW5lLCAnZGVzY3JpcHRpb24nIHwgJ25hcnJhdGlvbic+LFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICB0cnkge1xuICAgIC8vIERvd25sb2FkIHRoZSBpbWFnZVxuICAgIGNvbnNvbGUubG9nKGDwn5OlIERvd25sb2FkaW5nIGltYWdlIGZyb206ICR7aW1hZ2VVcmx9YCk7XG4gICAgY29uc3QgaW1hZ2VSZXNwb25zZSA9IGF3YWl0IGF4aW9zLmdldChpbWFnZVVybCwge1xuICAgICAgcmVzcG9uc2VUeXBlOiAnYXJyYXlidWZmZXInLFxuICAgIH0pO1xuICAgIGNvbnN0IGltYWdlQnVmZmVyID0gQnVmZmVyLmZyb20oaW1hZ2VSZXNwb25zZS5kYXRhKTtcblxuICAgIC8vIGRvd25sb2FkIHRoZSB3YXRlcm1hcmsucG5nIGZyb20gdmlyYWwgc2hvcnQgcGFydHMgYnVja2V0XG4gICAgY29uc3Qgd2F0ZXJtYXJrS2V5ID0gJ3dhdGVybWFyay5wbmcnO1xuICAgIGNvbnN0IHdhdGVybWFya1VybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgIHMzLFxuICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IHdhdGVybWFya0tleSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zdCB3YXRlcm1hcmtSZXNwb25zZSA9IGF3YWl0IGF4aW9zLmdldCh3YXRlcm1hcmtVcmwsIHtcbiAgICAgIHJlc3BvbnNlVHlwZTogJ2FycmF5YnVmZmVyJyxcbiAgICB9KTtcbiAgICBjb25zdCB3YXRlcm1hcmtCdWZmZXIgPSBCdWZmZXIuZnJvbSh3YXRlcm1hcmtSZXNwb25zZS5kYXRhKTtcblxuICAgIC8vIENyZWF0ZSB0ZW1wb3JhcnkgZmlsZXNcbiAgICBjb25zdCB0ZW1wRGlyID0gJy90bXAnO1xuICAgIGNvbnN0IGlucHV0SW1hZ2VQYXRoID0gcGF0aC5qb2luKHRlbXBEaXIsIGBpbnB1dC0ke3NjZW5lLmlkfS5wbmdgKTtcbiAgICBjb25zdCBvdXRwdXRWaWRlb1BhdGggPSBwYXRoLmpvaW4odGVtcERpciwgYG91dHB1dC0ke3NjZW5lLmlkfS5tcDRgKTtcblxuICAgIC8vIFdyaXRlIGltYWdlIHRvIHRlbXAgZmlsZVxuICAgIGZzLndyaXRlRmlsZVN5bmMoaW5wdXRJbWFnZVBhdGgsIGltYWdlQnVmZmVyKTtcblxuICAgIC8vIFdyaXRlIHdhdGVybWFyayB0byB0ZW1wIGZpbGVcbiAgICBjb25zdCB3YXRlcm1hcmtQYXRoID0gcGF0aC5qb2luKHRlbXBEaXIsIGB3YXRlcm1hcmstJHtzY2VuZS5pZH0ucG5nYCk7XG4gICAgZnMud3JpdGVGaWxlU3luYyh3YXRlcm1hcmtQYXRoLCB3YXRlcm1hcmtCdWZmZXIpO1xuXG4gICAgY29uc3QgZnJhbWVzID0gTWF0aC5mbG9vcihzY2VuZS5kdXJhdGlvbiAqIDI1KTtcbiAgICBjb25zdCBibHVySW5EdXJhdGlvbiA9IDAuMjtcbiAgICBjb25zdCB6b29tT3V0RnJhbWVzID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihibHVySW5EdXJhdGlvbiAqIDI1KSk7XG5cbiAgICAvLyBhZGQgbmVhciB5b3VyIG90aGVyIHBhcmFtc1xuICAgIGNvbnN0IG1vdmVSYWRpdXMgPSAyNTsgLy8gcHggKG1vcmUgaW50ZW50aW9uYWwgYW5kIHZpc2libGUpXG4gICAgY29uc3QgbW92ZVBlcmlvZCA9IDE4MDsgLy8gZnJhbWVzICh+Ny4ycyBAMjVmcHMpIC0gZmFzdGVyIG1vdmVtZW50XG5cbiAgICAvLyBkZXRlcm1pbmlzdGljYWxseSBjaG9vc2Ugb25lIG9mIHRocmVlIG1vdGlvbiB2YXJpYW50cyBwZXIgc2NlbmUgKGluZGV4LWJhc2VkKVxuICAgIGNvbnN0IHZhcmlhbnQgPSBzY2VuZS5pZCAlIDM7IC8vIDA6IGRyYW1hdGljIHBvcC1vdXQrZHJpZnQsIDE6IHN0cm9uZyB6b29tLWluLCAyOiBzdHJvbmcgem9vbS1vdXRcbiAgICBjb25zb2xlLmxvZyhg8J+OqCBNb3Rpb24gdmFyaWFudCBzZWxlY3RlZCAoaW5kZXgtYmFzZWQpOiAke3ZhcmlhbnR9YCk7XG5cbiAgICAvLyBNb3Rpb24gdmFyaWFudCBjb25maWd1cmF0aW9uc1xuICAgIGNvbnN0IG1vdGlvblZhcmlhbnRzID0ge1xuICAgICAgMDoge1xuICAgICAgICAvLyBWYXJpYW50IDA6IGRyYW1hdGljIHpvb20tb3V0IHBvcCB0aGVuIGhvbGQgem9vbSArIHByb25vdW5jZWQgY2lyY3VsYXIgZHJpZnRcbiAgICAgICAgem9vbTogYGlmKGx0ZShvblxcXFwsJHt6b29tT3V0RnJhbWVzfSlcXFxcLDEuMTUtKDAuMDgqb24vJHt6b29tT3V0RnJhbWVzfSlcXFxcLDEuMDgpYCxcbiAgICAgICAgeDogYGl3LzItKGl3L3pvb20vMikgKyBpZihndGUob25cXFxcLCR7em9vbU91dEZyYW1lc30pXFxcXCwgJHttb3ZlUmFkaXVzfSpjb3MoMipQSSoob24tJHt6b29tT3V0RnJhbWVzfSkvJHttb3ZlUGVyaW9kfSlcXFxcLCAwKWAsXG4gICAgICAgIHk6IGBpaC8yLShpaC96b29tLzIpICsgaWYoZ3RlKG9uXFxcXCwke3pvb21PdXRGcmFtZXN9KVxcXFwsICR7bW92ZVJhZGl1c30qc2luKDIqUEkqKG9uLSR7em9vbU91dEZyYW1lc30pLyR7bW92ZVBlcmlvZH0pXFxcXCwgMClgLFxuICAgICAgICBzdXBlcnNhbXBsZTogJzE0NDB4MjU2MCcsXG4gICAgICAgIHRtaXg6IFwiZnJhbWVzPTI6d2VpZ2h0cz0nMSAxJ1wiLFxuICAgICAgICBzY2FsZTogJ3NjYWxlPTcyMDoxMjgwOmZsYWdzPXNwbGluZTpzd3NfZGl0aGVyPW5vbmUnLFxuICAgICAgfSxcbiAgICAgIDE6IHtcbiAgICAgICAgLy8gVmFyaWFudCAxOiBzdHJvbmcgY29udGludW91cyB6b29tLWluIChLZW4gQnVybnMpICsgcHJvbm91bmNlZCBjaXJjdWxhciBkcmlmdFxuICAgICAgICB6b29tOiAnbWluKHBvdygxLjAwMTJcXFxcLG9uKVxcXFwsMS4xNSknLFxuICAgICAgICB4OiBgaXcvMi0oaXcvem9vbS8yKSArICR7bW92ZVJhZGl1c30qY29zKDIqUEkqb24vJHttb3ZlUGVyaW9kfSlgLFxuICAgICAgICB5OiBgaWgvMi0oaWgvem9vbS8yKSArICR7bW92ZVJhZGl1c30qc2luKDIqUEkqb24vJHttb3ZlUGVyaW9kfSlgLFxuICAgICAgICBzdXBlcnNhbXBsZTogJzE0NDB4MjU2MCcsXG4gICAgICAgIHRtaXg6IFwiZnJhbWVzPTI6d2VpZ2h0cz0nMSAxJ1wiLFxuICAgICAgICBzY2FsZTogJ3NjYWxlPTcyMDoxMjgwOmZsYWdzPWxhbmN6b3M6c3dzX2RpdGhlcj1ub25lJyxcbiAgICAgIH0sXG4gICAgICAyOiB7XG4gICAgICAgIC8vIFZhcmlhbnQgMjogc3Ryb25nIGNvbnRpbnVvdXMgem9vbS1vdXQgKyBwcm9ub3VuY2VkIGVsbGlwdGljYWwgZHJpZnRcbiAgICAgICAgem9vbTogYG1heCgxLjA1XFxcXCwgMS4xMiAtIDAuMDcqb24vJHtmcmFtZXN9KWAsXG4gICAgICAgIHg6IGBpdy8yLShpdy96b29tLzIpICsgJHttb3ZlUmFkaXVzfSpjb3MoMipQSSpvbi8ke21vdmVQZXJpb2R9KWAsXG4gICAgICAgIHk6IGBpaC8yLShpaC96b29tLzIpICsgKCR7bW92ZVJhZGl1c30vMS4yKSpzaW4oMipQSSpvbi8ke21vdmVQZXJpb2R9KWAsXG4gICAgICAgIHN1cGVyc2FtcGxlOiAnMTQ0MHgyNTYwJyxcbiAgICAgICAgdG1peDogXCJmcmFtZXM9Mjp3ZWlnaHRzPScxIDEnXCIsXG4gICAgICAgIHNjYWxlOiAnc2NhbGU9NzIwOjEyODA6ZmxhZ3M9bGFuY3pvczpzd3NfZGl0aGVyPW5vbmUnLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgY29uc3QgY29uZmlnID0gbW90aW9uVmFyaWFudHNbdmFyaWFudCBhcyBrZXlvZiB0eXBlb2YgbW90aW9uVmFyaWFudHNdO1xuXG4gICAgY29uc3QgZmlsdGVyQ29tcGxleCA9XG4gICAgICBgWzA6dl16b29tcGFuPXo9JyR7Y29uZmlnLnpvb219JzpkPSR7ZnJhbWVzfTpgICtcbiAgICAgIGB4PScke2NvbmZpZy54fSc6YCArXG4gICAgICBgeT0nJHtjb25maWcueX0nOmAgK1xuICAgICAgYHM9JHtjb25maWcuc3VwZXJzYW1wbGV9LGAgK1xuICAgICAgYHRtaXg9JHtjb25maWcudG1peH0sYCArXG4gICAgICBgZnBzPTI1LGAgK1xuICAgICAgYCR7Y29uZmlnLnNjYWxlfSxgICtcbiAgICAgIGBzcGxpdFtiMF1bYjFdO2AgK1xuICAgICAgYFtiMV1ib3hibHVyPTg6MVtiYl07YCArXG4gICAgICBgW2IwXVtiYl1ibGVuZD1hbGxfZXhwcj0nQSooMS1tYXgoMFxcXFwsMSAtIFQvJHtibHVySW5EdXJhdGlvbn0pKSArIEIqbWF4KDBcXFxcLDEgLSBULyR7Ymx1ckluRHVyYXRpb259KSdbbWFpbl07YCArXG4gICAgICBgWzE6dl1zY2FsZT0yMDA6LTFbd2F0ZXJtYXJrXTtgICtcbiAgICAgIGBbbWFpbl1bd2F0ZXJtYXJrXW92ZXJsYXk9KFctdykvMjoxMlt2XWA7XG5cbiAgICBjb25zdCBmZm1wZWdQYXRoID0gcmVzb2x2ZUZmbXBlZ1BhdGgoKTtcblxuICAgIGNvbnN0IGZmbXBlZ0FyZ3MgPSBbXG4gICAgICAnLWxvb3AnLFxuICAgICAgJzEnLFxuICAgICAgJy1pJyxcbiAgICAgIGlucHV0SW1hZ2VQYXRoLFxuICAgICAgJy1sb29wJyxcbiAgICAgICcxJyxcbiAgICAgICctaScsXG4gICAgICB3YXRlcm1hcmtQYXRoLFxuICAgICAgJy1maWx0ZXJfY29tcGxleCcsXG4gICAgICBmaWx0ZXJDb21wbGV4LFxuICAgICAgJy1tYXAnLFxuICAgICAgJ1t2XScsXG4gICAgICAnLWM6dicsXG4gICAgICAnbGlieDI2NCcsXG4gICAgICAnLXByZXNldCcsXG4gICAgICAndmVyeWZhc3QnLFxuICAgICAgJy1jcmYnLFxuICAgICAgJzIzJyxcbiAgICAgICctcGl4X2ZtdCcsXG4gICAgICAneXV2NDIwcCcsXG4gICAgICAnLXRocmVhZHMnLFxuICAgICAgJzAnLFxuICAgICAgJy10JyxcbiAgICAgIHNjZW5lLmR1cmF0aW9uLnRvU3RyaW5nKCksXG4gICAgICAnLXknLFxuICAgICAgb3V0cHV0VmlkZW9QYXRoLFxuICAgIF07XG5cbiAgICBjb25zb2xlLmxvZyhg8J+OrCBSdW5uaW5nIEZGbXBlZyBjb21tYW5kIGZvciBzY2VuZSAke3NjZW5lLmlkICsgMX06YCk7XG4gICAgY29uc29sZS5sb2coYPCfjqwgU2NlbmUgZHVyYXRpb246ICR7c2NlbmUuZHVyYXRpb259c2ApO1xuICAgIGNvbnNvbGUubG9nKGZmbXBlZ1BhdGgsIGZmbXBlZ0FyZ3Muam9pbignICcpKTtcblxuICAgIGNvbnN0IHsgc3Rkb3V0LCBzdGRlcnIgfSA9IGF3YWl0IGV4ZWNGaWxlQXN5bmMoZmZtcGVnUGF0aCwgZmZtcGVnQXJncywge1xuICAgICAgbWF4QnVmZmVyOiAxMDI0ICogMTAyNCAqIDEwLFxuICAgIH0pO1xuXG4gICAgaWYgKHN0ZGVycikge1xuICAgICAgY29uc29sZS5sb2coJ0ZGbXBlZyBzdGRlcnI6Jywgc3RkZXJyKTtcbiAgICB9XG5cbiAgICBpZiAoc3Rkb3V0KSB7XG4gICAgICBjb25zb2xlLmxvZygnRkZtcGVnIHN0ZG91dDonLCBzdGRvdXQpO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIG91dHB1dCBmaWxlIGV4aXN0c1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhvdXRwdXRWaWRlb1BhdGgpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZGbXBlZyBkaWQgbm90IGdlbmVyYXRlIG91dHB1dCB2aWRlbyBmaWxlJyk7XG4gICAgfVxuXG4gICAgLy8gVXBsb2FkIHRvIFMzXG4gICAgY29uc3QgdmlkZW9LZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5tcDRgO1xuICAgIGNvbnN0IHZpZGVvQnVmZmVyID0gZnMucmVhZEZpbGVTeW5jKG91dHB1dFZpZGVvUGF0aCk7XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIGDimIHvuI8gVXBsb2FkaW5nIHZpZGVvIHRvIFMzOiAke3Byb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FfS8ke3ZpZGVvS2V5fWAsXG4gICAgKTtcblxuICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgIEtleTogdmlkZW9LZXksXG4gICAgICAgIEJvZHk6IHZpZGVvQnVmZmVyLFxuICAgICAgICBDb250ZW50VHlwZTogJ3ZpZGVvL21wNCcsXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gQ2xlYW4gdXAgdGVtcG9yYXJ5IGZpbGVzXG4gICAgdHJ5IHtcbiAgICAgIGZzLnVubGlua1N5bmMoaW5wdXRJbWFnZVBhdGgpO1xuICAgICAgZnMudW5saW5rU3luYyh3YXRlcm1hcmtQYXRoKTtcbiAgICAgIGZzLnVubGlua1N5bmMob3V0cHV0VmlkZW9QYXRoKTtcbiAgICB9IGNhdGNoIChjbGVhbnVwRXJyb3IpIHtcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgJ+KaoO+4jyBXYXJuaW5nOiBDb3VsZCBub3QgY2xlYW4gdXAgdGVtcG9yYXJ5IGZpbGVzOicsXG4gICAgICAgIGNsZWFudXBFcnJvcixcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYOKchSBWaWRlbyB1cGxvYWRlZCB0byBTMzogJHt2aWRlb0tleX1gKTtcblxuICAgIC8vIEdlbmVyYXRlIHNpZ25lZCBVUkwgZm9yIHRoZSB1cGxvYWRlZCB2aWRlb1xuICAgIGNvbnN0IHZpZGVvU2lnbmVkVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKFxuICAgICAgczMsXG4gICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICAgIEtleTogdmlkZW9LZXksXG4gICAgICB9KSxcbiAgICAgIHsgZXhwaXJlc0luOiAzNjAwMCB9LCAvLyAxMCBob3VycyBleHBpcmF0aW9uXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKGDinIUgVmlkZW8gc2lnbmVkIFVSTCBnZW5lcmF0ZWQgZm9yIHNjZW5lICR7c2NlbmUuaWQgKyAxfWApO1xuICAgIHJldHVybiB2aWRlb1NpZ25lZFVybDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKFxuICAgICAgYOKdjCBFcnJvciBnZW5lcmF0aW5nIHZpZGVvIGZvciBzY2VuZSAke3NjZW5lLmlkICsgMX06YCxcbiAgICAgIGVycm9yLFxuICAgICk7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==