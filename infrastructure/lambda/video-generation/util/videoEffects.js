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
            console.log(`🎬 Processing scene ${i + 1}: ${scene.description}`);
            try {
                // Get the image URL for this scene
                const imageKey = `${userId}/${timestamp}.scene-${scene.id}.jpg`;
                const imageUrl = await getImageSignedUrl(imageKey);
                if (!imageUrl) {
                    console.error(`❌ No image found for scene ${scene.id}`);
                    return null;
                }
                // Generate video with blur in/out and camera movement
                const videoSignedUrl = await generateSceneVideo(imageUrl, scene, i, userId, timestamp);
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
async function generateSceneVideo(imageUrl, scene, sceneIndex, userId, timestamp) {
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
        const inputImagePath = path.join(tempDir, `input-${sceneIndex}.jpg`);
        const outputVideoPath = path.join(tempDir, `output-${sceneIndex}.mp4`);
        // Write image to temp file
        fs.writeFileSync(inputImagePath, imageBuffer);
        // Write watermark to temp file
        const watermarkPath = path.join(tempDir, `watermark-${sceneIndex}.png`);
        fs.writeFileSync(watermarkPath, watermarkBuffer);
        const frames = Math.floor(scene.duration * 25);
        const blurInDuration = 0.2;
        const zoomOutFrames = Math.max(1, Math.floor(blurInDuration * 25));
        // add near your other params
        const moveRadius = 25; // px (more intentional and visible)
        const movePeriod = 180; // frames (~7.2s @25fps) - faster movement
        // deterministically choose one of three motion variants per scene (index-based)
        const variant = sceneIndex % 3; // 0: dramatic pop-out+drift, 1: strong zoom-in, 2: strong zoom-out
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
            `[main][watermark]overlay=(W-w)/2:10[v]`;
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
        console.log(`🎬 Running FFmpeg command for scene ${sceneIndex + 1}:`);
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
        console.log(`✅ Video signed URL generated for scene ${sceneIndex + 1}`);
        return videoSignedUrl;
    }
    catch (error) {
        console.error(`❌ Error generating video for scene ${sceneIndex + 1}:`, error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9FZmZlY3RzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmlkZW9FZmZlY3RzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBcURBLGdEQXlEQztBQUVELG9EQTREQztBQTVLRCxrREFLNEI7QUFDNUIsd0VBQTZEO0FBQzdELGlDQUEwQjtBQUMxQix5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLCtCQUFpQztBQUNqQyxpREFBK0M7QUFFL0MsTUFBTSxTQUFTLEdBQUcsSUFBQSxnQkFBUyxFQUFDLG9CQUFJLENBQUMsQ0FBQztBQUNsQyxNQUFNLGFBQWEsR0FBRyxJQUFBLGdCQUFTLEVBQUMsd0JBQVEsQ0FBQyxDQUFDO0FBQzFDLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBUzNFLFNBQVMsWUFBWSxDQUFDLENBQVM7SUFDN0IsSUFBSSxDQUFDO1FBQ0gsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxpQkFBaUI7SUFDeEIsTUFBTSxVQUFVLEdBQUc7UUFDakIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXO1FBQ3ZCLGlCQUFpQjtRQUNqQixhQUFhO1FBQ2IsaUJBQWlCO1FBQ2pCLHVCQUF1QjtLQUN4QixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQWEsQ0FBQztJQUU5QixLQUFLLE1BQU0sQ0FBQyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQzNCLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDO1lBQUUsT0FB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Q0YsSUFBSSw0QkFBZ0IsQ0FBQztZQUNuQixNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyx1QkFBdUI7WUFDM0MsR0FBRyxFQUFFLFFBQVE7U0FDZCxDQUFDLEVBQ0YsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLENBQ3JCLENBQUM7UUFFRixPQUFPLENBQUMsR0FBRyxDQUFDLDBDQUEwQyxVQUFVLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN4RSxPQUFPLGNBQWMsQ0FBQztJQUN4QixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQ1gsc0NBQXNDLFVBQVUsR0FBRyxDQUFDLEdBQUcsRUFDdkQsS0FBSyxDQUNOLENBQUM7UUFDRixNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgUzNDbGllbnQsXG4gIFB1dE9iamVjdENvbW1hbmQsXG4gIEdldE9iamVjdENvbW1hbmQsXG4gIExpc3RPYmplY3RzVjJDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSAnQGF3cy1zZGsvczMtcmVxdWVzdC1wcmVzaWduZXInO1xuaW1wb3J0IGF4aW9zIGZyb20gJ2F4aW9zJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IGV4ZWMsIGV4ZWNGaWxlIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5cbmNvbnN0IGV4ZWNBc3luYyA9IHByb21pc2lmeShleGVjKTtcbmNvbnN0IGV4ZWNGaWxlQXN5bmMgPSBwcm9taXNpZnkoZXhlY0ZpbGUpO1xuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gaXNFeGVjdXRhYmxlKHA6IHN0cmluZyk6IGJvb2xlYW4ge1xuICB0cnkge1xuICAgIGZzLmFjY2Vzc1N5bmMocCwgZnMuY29uc3RhbnRzLlhfT0spO1xuICAgIHJldHVybiB0cnVlO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUZmbXBlZ1BhdGgoKTogc3RyaW5nIHtcbiAgY29uc3QgY2FuZGlkYXRlcyA9IFtcbiAgICBwcm9jZXNzLmVudi5GRk1QRUdfUEFUSCxcbiAgICAnL29wdC9iaW4vZmZtcGVnJyxcbiAgICAnL29wdC9mZm1wZWcnLFxuICAgICcvdXNyL2Jpbi9mZm1wZWcnLFxuICAgICcvdXNyL2xvY2FsL2Jpbi9mZm1wZWcnLFxuICBdLmZpbHRlcihCb29sZWFuKSBhcyBzdHJpbmdbXTtcblxuICBmb3IgKGNvbnN0IHAgb2YgY2FuZGlkYXRlcykge1xuICAgIGlmIChmcy5leGlzdHNTeW5jKHApICYmIGlzRXhlY3V0YWJsZShwKSkgcmV0dXJuIHA7XG4gIH1cblxuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ0ZGbXBlZyBiaW5hcnkgbm90IGZvdW5kLiBFeHBlY3RlZCBhdCBvbmUgb2Y6ICcgK1xuICAgICAgY2FuZGlkYXRlcy5qb2luKCcsICcpICtcbiAgICAgICcuIEVuc3VyZSB5b3VyIExhbWJkYSBsYXllciBwcm92aWRlcyBmZm1wZWcgKGNvbW1vbiBwYXRoOiAvb3B0L2Jpbi9mZm1wZWcpIG9yIHNldCBGRk1QRUdfUEFUSC4nLFxuICApO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0VmlkZW9FZmZlY3RVcmxzKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHNjZW5lczogU2NlbmVbXSxcbik6IFByb21pc2U8QXJyYXk8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT4+IHtcbiAgLy8gQ2hlY2sgaWYgdmlkZW8gZWZmZWN0cyBhbHJlYWR5IGV4aXN0IGJ5IGxpc3RpbmcgUzMgb2JqZWN0cyB3aXRoIHByZWZpeCB0aW1lc3RhbXAuc2NlbmUtIGFuZCBzdWZmaXggLm1wNFxuICBjb25zdCBzM0NsaWVudCA9IG5ldyBTM0NsaWVudCh7XG4gICAgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxuICB9KTtcbiAgY29uc3QgbGlzdENvbW1hbmQgPSBuZXcgTGlzdE9iamVjdHNWMkNvbW1hbmQoe1xuICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgUHJlZml4OiBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS1gLFxuICB9KTtcblxuICB0cnkge1xuICAgIGNvbnN0IGxpc3RSZXN1bHQgPSBhd2FpdCBzM0NsaWVudC5zZW5kKGxpc3RDb21tYW5kKTtcbiAgICBjb25zdCBleGlzdGluZ1ZpZGVvRmlsZXMgPVxuICAgICAgbGlzdFJlc3VsdC5Db250ZW50cz8uZmlsdGVyKChvYmo6IGFueSkgPT4gb2JqLktleT8uZW5kc1dpdGgoJy5tcDQnKSkgfHxcbiAgICAgIFtdO1xuXG4gICAgaWYgKGV4aXN0aW5nVmlkZW9GaWxlcy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgVmlkZW8gZWZmZWN0cyBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcDonLFxuICAgICAgICBleGlzdGluZ1ZpZGVvRmlsZXMubGVuZ3RoLFxuICAgICAgICAnZmlsZXMgZm91bmQnLFxuICAgICAgKTtcblxuICAgICAgLy8gR2VuZXJhdGUgc2lnbmVkIFVSTHMgZm9yIGV4aXN0aW5nIHZpZGVvIGZpbGVzXG4gICAgICBjb25zdCBzaWduZWRVcmxQcm9taXNlcyA9IGV4aXN0aW5nVmlkZW9GaWxlcy5tYXAoYXN5bmMgKG9iajogYW55KSA9PiB7XG4gICAgICAgIGlmICghb2JqLktleSkgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgY29uc3QgZ2V0T2JqZWN0Q29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICAgIEtleTogb2JqLktleSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3Qgc2lnbmVkVXJsID0gYXdhaXQgZ2V0U2lnbmVkVXJsKHMzQ2xpZW50LCBnZXRPYmplY3RDb21tYW5kLCB7XG4gICAgICAgICAgZXhwaXJlc0luOiAzNjAwMCwgLy8gMTAgaG91cnNcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gRXh0cmFjdCBmaWxlbmFtZSB3aXRob3V0IHVzZXIgcHJlZml4IChlLmcuLCBcIjEwMDQuc2NlbmUtMS5tcDRcIilcbiAgICAgICAgY29uc3QgZmlsZW5hbWUgPSBvYmouS2V5LnJlcGxhY2UoYCR7dXNlcklkfS9gLCAnJyk7XG5cbiAgICAgICAgcmV0dXJuIHsgW2ZpbGVuYW1lXTogc2lnbmVkVXJsIH07XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIChhd2FpdCBQcm9taXNlLmFsbChzaWduZWRVcmxQcm9taXNlcykpLmZpbHRlcihcbiAgICAgICAgKHVybE9iajogYW55KTogdXJsT2JqIGlzIHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPT4gdXJsT2JqICE9PSBudWxsLFxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGF3YWl0IGdlbmVyYXRlVmlkZW9FZmZlY3RzKHNjZW5lcywgdXNlcklkLCB0aW1lc3RhbXApO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjaGVja2luZyBleGlzdGluZyB2aWRlbyBlZmZlY3RzOicsIGVycm9yKTtcbiAgICAvLyBGYWxsYmFjayB0byBnZW5lcmF0aW5nIG5ldyB2aWRlbyBlZmZlY3RzXG4gICAgcmV0dXJuIGF3YWl0IGdlbmVyYXRlVmlkZW9FZmZlY3RzKHNjZW5lcywgdXNlcklkLCB0aW1lc3RhbXApO1xuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVZpZGVvRWZmZWN0cyhcbiAgc2NlbmVzOiBTY2VuZVtdLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4pOiBQcm9taXNlPEFycmF5PHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0+PiB7XG4gIC8vIEZvcm1hdDogW3sgXCJ0aW1lc3RhbXAuc2NlbmUtaWQubXA0XCI6IFwic2lnbmVkLXVybFwiIH1dXG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ/CfjqwgR2VuZXJhdGluZyB2aWRlbyBlZmZlY3RzIGZvciBzY2VuZXMuLi4nKTtcblxuICAgIC8vIFByb2Nlc3MgYWxsIHNjZW5lcyBpbiBwYXJhbGxlbFxuICAgIGNvbnN0IHZpZGVvUHJvbWlzZXMgPSBzY2VuZXMubWFwKGFzeW5jIChzY2VuZSwgaSkgPT4ge1xuICAgICAgY29uc29sZS5sb2coYPCfjqwgUHJvY2Vzc2luZyBzY2VuZSAke2kgKyAxfTogJHtzY2VuZS5kZXNjcmlwdGlvbn1gKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgLy8gR2V0IHRoZSBpbWFnZSBVUkwgZm9yIHRoaXMgc2NlbmVcbiAgICAgICAgY29uc3QgaW1hZ2VLZXkgPSBgJHt1c2VySWR9LyR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5qcGdgO1xuICAgICAgICBjb25zdCBpbWFnZVVybCA9IGF3YWl0IGdldEltYWdlU2lnbmVkVXJsKGltYWdlS2V5KTtcblxuICAgICAgICBpZiAoIWltYWdlVXJsKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIE5vIGltYWdlIGZvdW5kIGZvciBzY2VuZSAke3NjZW5lLmlkfWApO1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gR2VuZXJhdGUgdmlkZW8gd2l0aCBibHVyIGluL291dCBhbmQgY2FtZXJhIG1vdmVtZW50XG4gICAgICAgIGNvbnN0IHZpZGVvU2lnbmVkVXJsID0gYXdhaXQgZ2VuZXJhdGVTY2VuZVZpZGVvKFxuICAgICAgICAgIGltYWdlVXJsLFxuICAgICAgICAgIHNjZW5lLFxuICAgICAgICAgIGksXG4gICAgICAgICAgdXNlcklkLFxuICAgICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBFeHRyYWN0IGZpbGVuYW1lIHdpdGhvdXQgdXNlciBwcmVmaXggKGUuZy4sIFwiMTAwNC5zY2VuZS0xLm1wNFwiKVxuICAgICAgICBjb25zdCBmaWxlbmFtZSA9IGAke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ubXA0YDtcblxuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIFNjZW5lICR7aSArIDF9IHZpZGVvIGdlbmVyYXRlZDogJHtmaWxlbmFtZX1gKTtcbiAgICAgICAgcmV0dXJuIHsgW2ZpbGVuYW1lXTogdmlkZW9TaWduZWRVcmwgfTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9OmAsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIGBGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9OiAke2Vycm9yfWAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCB2aWRlb1VybHMgPSAoYXdhaXQgUHJvbWlzZS5hbGwodmlkZW9Qcm9taXNlcykpLmZpbHRlcihcbiAgICAgICh1cmxPYmopOiB1cmxPYmogaXMgeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSA9PiB1cmxPYmogIT09IG51bGwsXG4gICAgKTtcblxuICAgIGlmICh2aWRlb1VybHMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyB2aWRlb3Mgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignTm8gdmlkZW9zIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQgJHt2aWRlb1VybHMubGVuZ3RofSB2aWRlbyBjbGlwcyB3aXRoIGVmZmVjdHNgKTtcbiAgICByZXR1cm4gdmlkZW9VcmxzO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBnZW5lcmF0ZVZpZGVvRWZmZWN0czonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0SW1hZ2VTaWduZWRVcmwoaW1hZ2VLZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuICB0cnkge1xuICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgS2V5OiBpbWFnZUtleSxcbiAgICB9KTtcblxuICAgIHJldHVybiBhd2FpdCBnZXRTaWduZWRVcmwoczMsIGNvbW1hbmQsIHsgZXhwaXJlc0luOiAzNjAwMCB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKGDinYwgRXJyb3IgZ2V0dGluZyBzaWduZWQgVVJMIGZvciAke2ltYWdlS2V5fTpgLCBlcnJvcik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVTY2VuZVZpZGVvKFxuICBpbWFnZVVybDogc3RyaW5nLFxuICBzY2VuZTogU2NlbmUsXG4gIHNjZW5lSW5kZXg6IG51bWJlcixcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgdHJ5IHtcbiAgICAvLyBEb3dubG9hZCB0aGUgaW1hZ2VcbiAgICBjb25zb2xlLmxvZyhg8J+TpSBEb3dubG9hZGluZyBpbWFnZSBmcm9tOiAke2ltYWdlVXJsfWApO1xuICAgIGNvbnN0IGltYWdlUmVzcG9uc2UgPSBhd2FpdCBheGlvcy5nZXQoaW1hZ2VVcmwsIHtcbiAgICAgIHJlc3BvbnNlVHlwZTogJ2FycmF5YnVmZmVyJyxcbiAgICB9KTtcbiAgICBjb25zdCBpbWFnZUJ1ZmZlciA9IEJ1ZmZlci5mcm9tKGltYWdlUmVzcG9uc2UuZGF0YSk7XG5cbiAgICAvLyBkb3dubG9hZCB0aGUgd2F0ZXJtYXJrLnBuZyBmcm9tIHZpcmFsIHNob3J0IHBhcnRzIGJ1Y2tldFxuICAgIGNvbnN0IHdhdGVybWFya0tleSA9ICd3YXRlcm1hcmsucG5nJztcbiAgICBjb25zdCB3YXRlcm1hcmtVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoXG4gICAgICBzMyxcbiAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiB3YXRlcm1hcmtLZXksXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgY29uc3Qgd2F0ZXJtYXJrUmVzcG9uc2UgPSBhd2FpdCBheGlvcy5nZXQod2F0ZXJtYXJrVXJsLCB7XG4gICAgICByZXNwb25zZVR5cGU6ICdhcnJheWJ1ZmZlcicsXG4gICAgfSk7XG4gICAgY29uc3Qgd2F0ZXJtYXJrQnVmZmVyID0gQnVmZmVyLmZyb20od2F0ZXJtYXJrUmVzcG9uc2UuZGF0YSk7XG5cbiAgICAvLyBDcmVhdGUgdGVtcG9yYXJ5IGZpbGVzXG4gICAgY29uc3QgdGVtcERpciA9ICcvdG1wJztcbiAgICBjb25zdCBpbnB1dEltYWdlUGF0aCA9IHBhdGguam9pbih0ZW1wRGlyLCBgaW5wdXQtJHtzY2VuZUluZGV4fS5qcGdgKTtcbiAgICBjb25zdCBvdXRwdXRWaWRlb1BhdGggPSBwYXRoLmpvaW4odGVtcERpciwgYG91dHB1dC0ke3NjZW5lSW5kZXh9Lm1wNGApO1xuXG4gICAgLy8gV3JpdGUgaW1hZ2UgdG8gdGVtcCBmaWxlXG4gICAgZnMud3JpdGVGaWxlU3luYyhpbnB1dEltYWdlUGF0aCwgaW1hZ2VCdWZmZXIpO1xuXG4gICAgLy8gV3JpdGUgd2F0ZXJtYXJrIHRvIHRlbXAgZmlsZVxuICAgIGNvbnN0IHdhdGVybWFya1BhdGggPSBwYXRoLmpvaW4odGVtcERpciwgYHdhdGVybWFyay0ke3NjZW5lSW5kZXh9LnBuZ2ApO1xuICAgIGZzLndyaXRlRmlsZVN5bmMod2F0ZXJtYXJrUGF0aCwgd2F0ZXJtYXJrQnVmZmVyKTtcblxuICAgIGNvbnN0IGZyYW1lcyA9IE1hdGguZmxvb3Ioc2NlbmUuZHVyYXRpb24gKiAyNSk7XG4gICAgY29uc3QgYmx1ckluRHVyYXRpb24gPSAwLjI7XG4gICAgY29uc3Qgem9vbU91dEZyYW1lcyA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3IoYmx1ckluRHVyYXRpb24gKiAyNSkpO1xuXG4gICAgLy8gYWRkIG5lYXIgeW91ciBvdGhlciBwYXJhbXNcbiAgICBjb25zdCBtb3ZlUmFkaXVzID0gMjU7IC8vIHB4IChtb3JlIGludGVudGlvbmFsIGFuZCB2aXNpYmxlKVxuICAgIGNvbnN0IG1vdmVQZXJpb2QgPSAxODA7IC8vIGZyYW1lcyAofjcuMnMgQDI1ZnBzKSAtIGZhc3RlciBtb3ZlbWVudFxuXG4gICAgLy8gZGV0ZXJtaW5pc3RpY2FsbHkgY2hvb3NlIG9uZSBvZiB0aHJlZSBtb3Rpb24gdmFyaWFudHMgcGVyIHNjZW5lIChpbmRleC1iYXNlZClcbiAgICBjb25zdCB2YXJpYW50ID0gc2NlbmVJbmRleCAlIDM7IC8vIDA6IGRyYW1hdGljIHBvcC1vdXQrZHJpZnQsIDE6IHN0cm9uZyB6b29tLWluLCAyOiBzdHJvbmcgem9vbS1vdXRcbiAgICBjb25zb2xlLmxvZyhg8J+OqCBNb3Rpb24gdmFyaWFudCBzZWxlY3RlZCAoaW5kZXgtYmFzZWQpOiAke3ZhcmlhbnR9YCk7XG5cbiAgICAvLyBNb3Rpb24gdmFyaWFudCBjb25maWd1cmF0aW9uc1xuICAgIGNvbnN0IG1vdGlvblZhcmlhbnRzID0ge1xuICAgICAgMDoge1xuICAgICAgICAvLyBWYXJpYW50IDA6IGRyYW1hdGljIHpvb20tb3V0IHBvcCB0aGVuIGhvbGQgem9vbSArIHByb25vdW5jZWQgY2lyY3VsYXIgZHJpZnRcbiAgICAgICAgem9vbTogYGlmKGx0ZShvblxcXFwsJHt6b29tT3V0RnJhbWVzfSlcXFxcLDEuMTUtKDAuMDgqb24vJHt6b29tT3V0RnJhbWVzfSlcXFxcLDEuMDgpYCxcbiAgICAgICAgeDogYGl3LzItKGl3L3pvb20vMikgKyBpZihndGUob25cXFxcLCR7em9vbU91dEZyYW1lc30pXFxcXCwgJHttb3ZlUmFkaXVzfSpjb3MoMipQSSoob24tJHt6b29tT3V0RnJhbWVzfSkvJHttb3ZlUGVyaW9kfSlcXFxcLCAwKWAsXG4gICAgICAgIHk6IGBpaC8yLShpaC96b29tLzIpICsgaWYoZ3RlKG9uXFxcXCwke3pvb21PdXRGcmFtZXN9KVxcXFwsICR7bW92ZVJhZGl1c30qc2luKDIqUEkqKG9uLSR7em9vbU91dEZyYW1lc30pLyR7bW92ZVBlcmlvZH0pXFxcXCwgMClgLFxuICAgICAgICBzdXBlcnNhbXBsZTogJzE0NDB4MjU2MCcsXG4gICAgICAgIHRtaXg6IFwiZnJhbWVzPTI6d2VpZ2h0cz0nMSAxJ1wiLFxuICAgICAgICBzY2FsZTogJ3NjYWxlPTcyMDoxMjgwOmZsYWdzPXNwbGluZTpzd3NfZGl0aGVyPW5vbmUnLFxuICAgICAgfSxcbiAgICAgIDE6IHtcbiAgICAgICAgLy8gVmFyaWFudCAxOiBzdHJvbmcgY29udGludW91cyB6b29tLWluIChLZW4gQnVybnMpICsgcHJvbm91bmNlZCBjaXJjdWxhciBkcmlmdFxuICAgICAgICB6b29tOiAnbWluKHBvdygxLjAwMTJcXFxcLG9uKVxcXFwsMS4xNSknLFxuICAgICAgICB4OiBgaXcvMi0oaXcvem9vbS8yKSArICR7bW92ZVJhZGl1c30qY29zKDIqUEkqb24vJHttb3ZlUGVyaW9kfSlgLFxuICAgICAgICB5OiBgaWgvMi0oaWgvem9vbS8yKSArICR7bW92ZVJhZGl1c30qc2luKDIqUEkqb24vJHttb3ZlUGVyaW9kfSlgLFxuICAgICAgICBzdXBlcnNhbXBsZTogJzE0NDB4MjU2MCcsXG4gICAgICAgIHRtaXg6IFwiZnJhbWVzPTI6d2VpZ2h0cz0nMSAxJ1wiLFxuICAgICAgICBzY2FsZTogJ3NjYWxlPTcyMDoxMjgwOmZsYWdzPWxhbmN6b3M6c3dzX2RpdGhlcj1ub25lJyxcbiAgICAgIH0sXG4gICAgICAyOiB7XG4gICAgICAgIC8vIFZhcmlhbnQgMjogc3Ryb25nIGNvbnRpbnVvdXMgem9vbS1vdXQgKyBwcm9ub3VuY2VkIGVsbGlwdGljYWwgZHJpZnRcbiAgICAgICAgem9vbTogYG1heCgxLjA1XFxcXCwgMS4xMiAtIDAuMDcqb24vJHtmcmFtZXN9KWAsXG4gICAgICAgIHg6IGBpdy8yLShpdy96b29tLzIpICsgJHttb3ZlUmFkaXVzfSpjb3MoMipQSSpvbi8ke21vdmVQZXJpb2R9KWAsXG4gICAgICAgIHk6IGBpaC8yLShpaC96b29tLzIpICsgKCR7bW92ZVJhZGl1c30vMS4yKSpzaW4oMipQSSpvbi8ke21vdmVQZXJpb2R9KWAsXG4gICAgICAgIHN1cGVyc2FtcGxlOiAnMTQ0MHgyNTYwJyxcbiAgICAgICAgdG1peDogXCJmcmFtZXM9Mjp3ZWlnaHRzPScxIDEnXCIsXG4gICAgICAgIHNjYWxlOiAnc2NhbGU9NzIwOjEyODA6ZmxhZ3M9bGFuY3pvczpzd3NfZGl0aGVyPW5vbmUnLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgY29uc3QgY29uZmlnID0gbW90aW9uVmFyaWFudHNbdmFyaWFudCBhcyBrZXlvZiB0eXBlb2YgbW90aW9uVmFyaWFudHNdO1xuXG4gICAgY29uc3QgZmlsdGVyQ29tcGxleCA9XG4gICAgICBgWzA6dl16b29tcGFuPXo9JyR7Y29uZmlnLnpvb219JzpkPSR7ZnJhbWVzfTpgICtcbiAgICAgIGB4PScke2NvbmZpZy54fSc6YCArXG4gICAgICBgeT0nJHtjb25maWcueX0nOmAgK1xuICAgICAgYHM9JHtjb25maWcuc3VwZXJzYW1wbGV9LGAgK1xuICAgICAgYHRtaXg9JHtjb25maWcudG1peH0sYCArXG4gICAgICBgZnBzPTI1LGAgK1xuICAgICAgYCR7Y29uZmlnLnNjYWxlfSxgICtcbiAgICAgIGBzcGxpdFtiMF1bYjFdO2AgK1xuICAgICAgYFtiMV1ib3hibHVyPTg6MVtiYl07YCArXG4gICAgICBgW2IwXVtiYl1ibGVuZD1hbGxfZXhwcj0nQSooMS1tYXgoMFxcXFwsMSAtIFQvJHtibHVySW5EdXJhdGlvbn0pKSArIEIqbWF4KDBcXFxcLDEgLSBULyR7Ymx1ckluRHVyYXRpb259KSdbbWFpbl07YCArXG4gICAgICBgWzE6dl1zY2FsZT0yMDA6LTFbd2F0ZXJtYXJrXTtgICtcbiAgICAgIGBbbWFpbl1bd2F0ZXJtYXJrXW92ZXJsYXk9KFctdykvMjoxMFt2XWA7XG5cbiAgICBjb25zdCBmZm1wZWdQYXRoID0gcmVzb2x2ZUZmbXBlZ1BhdGgoKTtcblxuICAgIGNvbnN0IGZmbXBlZ0FyZ3MgPSBbXG4gICAgICAnLWxvb3AnLFxuICAgICAgJzEnLFxuICAgICAgJy1pJyxcbiAgICAgIGlucHV0SW1hZ2VQYXRoLFxuICAgICAgJy1sb29wJyxcbiAgICAgICcxJyxcbiAgICAgICctaScsXG4gICAgICB3YXRlcm1hcmtQYXRoLFxuICAgICAgJy1maWx0ZXJfY29tcGxleCcsXG4gICAgICBmaWx0ZXJDb21wbGV4LFxuICAgICAgJy1tYXAnLFxuICAgICAgJ1t2XScsXG4gICAgICAnLWM6dicsXG4gICAgICAnbGlieDI2NCcsXG4gICAgICAnLXByZXNldCcsXG4gICAgICAndmVyeWZhc3QnLFxuICAgICAgJy1jcmYnLFxuICAgICAgJzIzJyxcbiAgICAgICctcGl4X2ZtdCcsXG4gICAgICAneXV2NDIwcCcsXG4gICAgICAnLXRocmVhZHMnLFxuICAgICAgJzAnLFxuICAgICAgJy10JyxcbiAgICAgIHNjZW5lLmR1cmF0aW9uLnRvU3RyaW5nKCksXG4gICAgICAnLXknLFxuICAgICAgb3V0cHV0VmlkZW9QYXRoLFxuICAgIF07XG5cbiAgICBjb25zb2xlLmxvZyhg8J+OrCBSdW5uaW5nIEZGbXBlZyBjb21tYW5kIGZvciBzY2VuZSAke3NjZW5lSW5kZXggKyAxfTpgKTtcbiAgICBjb25zb2xlLmxvZyhg8J+OrCBTY2VuZSBkdXJhdGlvbjogJHtzY2VuZS5kdXJhdGlvbn1zYCk7XG4gICAgY29uc29sZS5sb2coZmZtcGVnUGF0aCwgZmZtcGVnQXJncy5qb2luKCcgJykpO1xuXG4gICAgY29uc3QgeyBzdGRvdXQsIHN0ZGVyciB9ID0gYXdhaXQgZXhlY0ZpbGVBc3luYyhmZm1wZWdQYXRoLCBmZm1wZWdBcmdzLCB7XG4gICAgICBtYXhCdWZmZXI6IDEwMjQgKiAxMDI0ICogMTAsXG4gICAgfSk7XG5cbiAgICBpZiAoc3RkZXJyKSB7XG4gICAgICBjb25zb2xlLmxvZygnRkZtcGVnIHN0ZGVycjonLCBzdGRlcnIpO1xuICAgIH1cblxuICAgIGlmIChzdGRvdXQpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdGRm1wZWcgc3Rkb3V0OicsIHN0ZG91dCk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgb3V0cHV0IGZpbGUgZXhpc3RzXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKG91dHB1dFZpZGVvUGF0aCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRkZtcGVnIGRpZCBub3QgZ2VuZXJhdGUgb3V0cHV0IHZpZGVvIGZpbGUnKTtcbiAgICB9XG5cbiAgICAvLyBVcGxvYWQgdG8gUzNcbiAgICBjb25zdCB2aWRlb0tleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9Lm1wNGA7XG4gICAgY29uc3QgdmlkZW9CdWZmZXIgPSBmcy5yZWFkRmlsZVN5bmMob3V0cHV0VmlkZW9QYXRoKTtcblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYOKYge+4jyBVcGxvYWRpbmcgdmlkZW8gdG8gUzM6ICR7cHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUV9LyR7dmlkZW9LZXl9YCxcbiAgICApO1xuXG4gICAgYXdhaXQgczMuc2VuZChcbiAgICAgIG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiB2aWRlb0tleSxcbiAgICAgICAgQm9keTogdmlkZW9CdWZmZXIsXG4gICAgICAgIENvbnRlbnRUeXBlOiAndmlkZW8vbXA0JyxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBDbGVhbiB1cCB0ZW1wb3JhcnkgZmlsZXNcbiAgICB0cnkge1xuICAgICAgZnMudW5saW5rU3luYyhpbnB1dEltYWdlUGF0aCk7XG4gICAgICBmcy51bmxpbmtTeW5jKHdhdGVybWFya1BhdGgpO1xuICAgICAgZnMudW5saW5rU3luYyhvdXRwdXRWaWRlb1BhdGgpO1xuICAgIH0gY2F0Y2ggKGNsZWFudXBFcnJvcikge1xuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAn4pqg77iPIFdhcm5pbmc6IENvdWxkIG5vdCBjbGVhbiB1cCB0ZW1wb3JhcnkgZmlsZXM6JyxcbiAgICAgICAgY2xlYW51cEVycm9yLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhg4pyFIFZpZGVvIHVwbG9hZGVkIHRvIFMzOiAke3ZpZGVvS2V5fWApO1xuXG4gICAgLy8gR2VuZXJhdGUgc2lnbmVkIFVSTCBmb3IgdGhlIHVwbG9hZGVkIHZpZGVvXG4gICAgY29uc3QgdmlkZW9TaWduZWRVcmwgPSBhd2FpdCBnZXRTaWduZWRVcmwoXG4gICAgICBzMyxcbiAgICAgIG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRSxcbiAgICAgICAgS2V5OiB2aWRlb0tleSxcbiAgICAgIH0pLFxuICAgICAgeyBleHBpcmVzSW46IDM2MDAwIH0sIC8vIDEwIGhvdXJzIGV4cGlyYXRpb25cbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coYOKchSBWaWRlbyBzaWduZWQgVVJMIGdlbmVyYXRlZCBmb3Igc2NlbmUgJHtzY2VuZUluZGV4ICsgMX1gKTtcbiAgICByZXR1cm4gdmlkZW9TaWduZWRVcmw7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcbiAgICAgIGDinYwgRXJyb3IgZ2VuZXJhdGluZyB2aWRlbyBmb3Igc2NlbmUgJHtzY2VuZUluZGV4ICsgMX06YCxcbiAgICAgIGVycm9yLFxuICAgICk7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==