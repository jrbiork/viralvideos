"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9FZmZlY3RzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmlkZW9FZmZlY3RzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBb0RBLG9EQTREQztBQWhIRCxrREFJNEI7QUFDNUIsd0VBQTZEO0FBQzdELGlDQUEwQjtBQUMxQix5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLCtCQUFpQztBQUNqQyxpREFBK0M7QUFFL0MsTUFBTSxTQUFTLEdBQUcsSUFBQSxnQkFBUyxFQUFDLG9CQUFJLENBQUMsQ0FBQztBQUNsQyxNQUFNLGFBQWEsR0FBRyxJQUFBLGdCQUFTLEVBQUMsd0JBQVEsQ0FBQyxDQUFDO0FBQzFDLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBUzNFLFNBQVMsWUFBWSxDQUFDLENBQVM7SUFDN0IsSUFBSSxDQUFDO1FBQ0gsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxpQkFBaUI7SUFDeEIsTUFBTSxVQUFVLEdBQUc7UUFDakIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXO1FBQ3ZCLGlCQUFpQjtRQUNqQixhQUFhO1FBQ2IsaUJBQWlCO1FBQ2pCLHVCQUF1QjtLQUN4QixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQWEsQ0FBQztJQUU5QixLQUFLLE1BQU0sQ0FBQyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQzNCLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDO1lBQUUsT0FBTyxDQUFDLENBQUM7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LENBQUM7WUFDdEIsT0FBTyxDQUFDLElBQUksQ0FDVixpREFBaUQsRUFDakQsWUFBWSxDQUNiLENBQUM7UUFDSixDQUFDO1FBRUQsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUVuRCw2Q0FBNkM7UUFDN0MsTUFBTSxjQUFjLEdBQUcsTUFBTSxJQUFBLG1DQUFZLEVBQ3ZDLEVBQUUsRUFDRixJQUFJLDRCQUFnQixDQUFDO1lBQ25CLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QjtZQUMzQyxHQUFHLEVBQUUsUUFBUTtTQUNkLENBQUMsRUFDRixFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FDckIsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLFVBQVUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3hFLE9BQU8sY0FBYyxDQUFDO0lBQ3hCLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FDWCxzQ0FBc0MsVUFBVSxHQUFHLENBQUMsR0FBRyxFQUN2RCxLQUFLLENBQ04sQ0FBQztRQUNGLE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBTM0NsaWVudCxcbiAgUHV0T2JqZWN0Q29tbWFuZCxcbiAgR2V0T2JqZWN0Q29tbWFuZCxcbn0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXMzJztcbmltcG9ydCB7IGdldFNpZ25lZFVybCB9IGZyb20gJ0Bhd3Mtc2RrL3MzLXJlcXVlc3QtcHJlc2lnbmVyJztcbmltcG9ydCBheGlvcyBmcm9tICdheGlvcyc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgcHJvbWlzaWZ5IH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgeyBleGVjLCBleGVjRmlsZSB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuXG5jb25zdCBleGVjQXN5bmMgPSBwcm9taXNpZnkoZXhlYyk7XG5jb25zdCBleGVjRmlsZUFzeW5jID0gcHJvbWlzaWZ5KGV4ZWNGaWxlKTtcbmNvbnN0IHMzID0gbmV3IFMzQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNjZW5lIHtcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgbmFycmF0aW9uOiBzdHJpbmc7XG4gIGlkOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGlzRXhlY3V0YWJsZShwOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgdHJ5IHtcbiAgICBmcy5hY2Nlc3NTeW5jKHAsIGZzLmNvbnN0YW50cy5YX09LKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVGZm1wZWdQYXRoKCk6IHN0cmluZyB7XG4gIGNvbnN0IGNhbmRpZGF0ZXMgPSBbXG4gICAgcHJvY2Vzcy5lbnYuRkZNUEVHX1BBVEgsXG4gICAgJy9vcHQvYmluL2ZmbXBlZycsXG4gICAgJy9vcHQvZmZtcGVnJyxcbiAgICAnL3Vzci9iaW4vZmZtcGVnJyxcbiAgICAnL3Vzci9sb2NhbC9iaW4vZmZtcGVnJyxcbiAgXS5maWx0ZXIoQm9vbGVhbikgYXMgc3RyaW5nW107XG5cbiAgZm9yIChjb25zdCBwIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICBpZiAoZnMuZXhpc3RzU3luYyhwKSAmJiBpc0V4ZWN1dGFibGUocCkpIHJldHVybiBwO1xuICB9XG5cbiAgdGhyb3cgbmV3IEVycm9yKFxuICAgICdGRm1wZWcgYmluYXJ5IG5vdCBmb3VuZC4gRXhwZWN0ZWQgYXQgb25lIG9mOiAnICtcbiAgICAgIGNhbmRpZGF0ZXMuam9pbignLCAnKSArXG4gICAgICAnLiBFbnN1cmUgeW91ciBMYW1iZGEgbGF5ZXIgcHJvdmlkZXMgZmZtcGVnIChjb21tb24gcGF0aDogL29wdC9iaW4vZmZtcGVnKSBvciBzZXQgRkZNUEVHX1BBVEguJyxcbiAgKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlVmlkZW9FZmZlY3RzKFxuICBzY2VuZXM6IFNjZW5lW10sXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbik6IFByb21pc2U8QXJyYXk8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT4+IHtcbiAgLy8gRm9ybWF0OiBbeyBcInRpbWVzdGFtcC5zY2VuZS1pZC5tcDRcIjogXCJzaWduZWQtdXJsXCIgfV1cbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZygn8J+OrCBHZW5lcmF0aW5nIHZpZGVvIGVmZmVjdHMgZm9yIHNjZW5lcy4uLicpO1xuXG4gICAgLy8gUHJvY2VzcyBhbGwgc2NlbmVzIGluIHBhcmFsbGVsXG4gICAgY29uc3QgdmlkZW9Qcm9taXNlcyA9IHNjZW5lcy5tYXAoYXN5bmMgKHNjZW5lLCBpKSA9PiB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+OrCBQcm9jZXNzaW5nIHNjZW5lICR7aSArIDF9OiAke3NjZW5lLmRlc2NyaXB0aW9ufWApO1xuXG4gICAgICB0cnkge1xuICAgICAgICAvLyBHZXQgdGhlIGltYWdlIFVSTCBmb3IgdGhpcyBzY2VuZVxuICAgICAgICBjb25zdCBpbWFnZUtleSA9IGAke3VzZXJJZH0vJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmUuaWR9LmpwZ2A7XG4gICAgICAgIGNvbnN0IGltYWdlVXJsID0gYXdhaXQgZ2V0SW1hZ2VTaWduZWRVcmwoaW1hZ2VLZXkpO1xuXG4gICAgICAgIGlmICghaW1hZ2VVcmwpIHtcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGDinYwgTm8gaW1hZ2UgZm91bmQgZm9yIHNjZW5lICR7c2NlbmUuaWR9YCk7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBHZW5lcmF0ZSB2aWRlbyB3aXRoIGJsdXIgaW4vb3V0IGFuZCBjYW1lcmEgbW92ZW1lbnRcbiAgICAgICAgY29uc3QgdmlkZW9TaWduZWRVcmwgPSBhd2FpdCBnZW5lcmF0ZVNjZW5lVmlkZW8oXG4gICAgICAgICAgaW1hZ2VVcmwsXG4gICAgICAgICAgc2NlbmUsXG4gICAgICAgICAgaSxcbiAgICAgICAgICB1c2VySWQsXG4gICAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICApO1xuXG4gICAgICAgIC8vIEV4dHJhY3QgZmlsZW5hbWUgd2l0aG91dCB1c2VyIHByZWZpeCAoZS5nLiwgXCIxMDA0LnNjZW5lLTEubXA0XCIpXG4gICAgICAgIGNvbnN0IGZpbGVuYW1lID0gYCR7dGltZXN0YW1wfS5zY2VuZS0ke3NjZW5lLmlkfS5tcDRgO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtpICsgMX0gdmlkZW8gZ2VuZXJhdGVkOiAke2ZpbGVuYW1lfWApO1xuICAgICAgICByZXR1cm4geyBbZmlsZW5hbWVdOiB2aWRlb1NpZ25lZFVybCB9O1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBnZW5lcmF0ZSB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX06YCwgZXJyb3IpO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYEZhaWxlZCB0byBnZW5lcmF0ZSB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX06ICR7ZXJyb3J9YCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGNvbnN0IHZpZGVvVXJscyA9IChhd2FpdCBQcm9taXNlLmFsbCh2aWRlb1Byb21pc2VzKSkuZmlsdGVyKFxuICAgICAgKHVybE9iaik6IHVybE9iaiBpcyB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9ID0+IHVybE9iaiAhPT0gbnVsbCxcbiAgICApO1xuXG4gICAgaWYgKHZpZGVvVXJscy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIHZpZGVvcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyB2aWRlb3Mgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCAke3ZpZGVvVXJscy5sZW5ndGh9IHZpZGVvIGNsaXBzIHdpdGggZWZmZWN0c2ApO1xuICAgIHJldHVybiB2aWRlb1VybHM7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlVmlkZW9FZmZlY3RzOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRJbWFnZVNpZ25lZFVybChpbWFnZUtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICBLZXk6IGltYWdlS2V5LFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGF3YWl0IGdldFNpZ25lZFVybChzMywgY29tbWFuZCwgeyBleHBpcmVzSW46IDM2MDAwIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBnZXR0aW5nIHNpZ25lZCBVUkwgZm9yICR7aW1hZ2VLZXl9OmAsIGVycm9yKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVNjZW5lVmlkZW8oXG4gIGltYWdlVXJsOiBzdHJpbmcsXG4gIHNjZW5lOiBTY2VuZSxcbiAgc2NlbmVJbmRleDogbnVtYmVyLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICB0cnkge1xuICAgIC8vIERvd25sb2FkIHRoZSBpbWFnZVxuICAgIGNvbnNvbGUubG9nKGDwn5OlIERvd25sb2FkaW5nIGltYWdlIGZyb206ICR7aW1hZ2VVcmx9YCk7XG4gICAgY29uc3QgaW1hZ2VSZXNwb25zZSA9IGF3YWl0IGF4aW9zLmdldChpbWFnZVVybCwge1xuICAgICAgcmVzcG9uc2VUeXBlOiAnYXJyYXlidWZmZXInLFxuICAgIH0pO1xuICAgIGNvbnN0IGltYWdlQnVmZmVyID0gQnVmZmVyLmZyb20oaW1hZ2VSZXNwb25zZS5kYXRhKTtcblxuICAgIC8vIGRvd25sb2FkIHRoZSB3YXRlcm1hcmsucG5nIGZyb20gdmlyYWwgc2hvcnQgcGFydHMgYnVja2V0XG4gICAgY29uc3Qgd2F0ZXJtYXJrS2V5ID0gJ3dhdGVybWFyay5wbmcnO1xuICAgIGNvbnN0IHdhdGVybWFya1VybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgIHMzLFxuICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IHdhdGVybWFya0tleSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zdCB3YXRlcm1hcmtSZXNwb25zZSA9IGF3YWl0IGF4aW9zLmdldCh3YXRlcm1hcmtVcmwsIHtcbiAgICAgIHJlc3BvbnNlVHlwZTogJ2FycmF5YnVmZmVyJyxcbiAgICB9KTtcbiAgICBjb25zdCB3YXRlcm1hcmtCdWZmZXIgPSBCdWZmZXIuZnJvbSh3YXRlcm1hcmtSZXNwb25zZS5kYXRhKTtcblxuICAgIC8vIENyZWF0ZSB0ZW1wb3JhcnkgZmlsZXNcbiAgICBjb25zdCB0ZW1wRGlyID0gJy90bXAnO1xuICAgIGNvbnN0IGlucHV0SW1hZ2VQYXRoID0gcGF0aC5qb2luKHRlbXBEaXIsIGBpbnB1dC0ke3NjZW5lSW5kZXh9LmpwZ2ApO1xuICAgIGNvbnN0IG91dHB1dFZpZGVvUGF0aCA9IHBhdGguam9pbih0ZW1wRGlyLCBgb3V0cHV0LSR7c2NlbmVJbmRleH0ubXA0YCk7XG5cbiAgICAvLyBXcml0ZSBpbWFnZSB0byB0ZW1wIGZpbGVcbiAgICBmcy53cml0ZUZpbGVTeW5jKGlucHV0SW1hZ2VQYXRoLCBpbWFnZUJ1ZmZlcik7XG5cbiAgICAvLyBXcml0ZSB3YXRlcm1hcmsgdG8gdGVtcCBmaWxlXG4gICAgY29uc3Qgd2F0ZXJtYXJrUGF0aCA9IHBhdGguam9pbih0ZW1wRGlyLCBgd2F0ZXJtYXJrLSR7c2NlbmVJbmRleH0ucG5nYCk7XG4gICAgZnMud3JpdGVGaWxlU3luYyh3YXRlcm1hcmtQYXRoLCB3YXRlcm1hcmtCdWZmZXIpO1xuXG4gICAgY29uc3QgZnJhbWVzID0gTWF0aC5mbG9vcihzY2VuZS5kdXJhdGlvbiAqIDI1KTtcbiAgICBjb25zdCBibHVySW5EdXJhdGlvbiA9IDAuMjtcbiAgICBjb25zdCB6b29tT3V0RnJhbWVzID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihibHVySW5EdXJhdGlvbiAqIDI1KSk7XG5cbiAgICAvLyBhZGQgbmVhciB5b3VyIG90aGVyIHBhcmFtc1xuICAgIGNvbnN0IG1vdmVSYWRpdXMgPSAyNTsgLy8gcHggKG1vcmUgaW50ZW50aW9uYWwgYW5kIHZpc2libGUpXG4gICAgY29uc3QgbW92ZVBlcmlvZCA9IDE4MDsgLy8gZnJhbWVzICh+Ny4ycyBAMjVmcHMpIC0gZmFzdGVyIG1vdmVtZW50XG5cbiAgICAvLyBkZXRlcm1pbmlzdGljYWxseSBjaG9vc2Ugb25lIG9mIHRocmVlIG1vdGlvbiB2YXJpYW50cyBwZXIgc2NlbmUgKGluZGV4LWJhc2VkKVxuICAgIGNvbnN0IHZhcmlhbnQgPSBzY2VuZUluZGV4ICUgMzsgLy8gMDogZHJhbWF0aWMgcG9wLW91dCtkcmlmdCwgMTogc3Ryb25nIHpvb20taW4sIDI6IHN0cm9uZyB6b29tLW91dFxuICAgIGNvbnNvbGUubG9nKGDwn46oIE1vdGlvbiB2YXJpYW50IHNlbGVjdGVkIChpbmRleC1iYXNlZCk6ICR7dmFyaWFudH1gKTtcblxuICAgIC8vIE1vdGlvbiB2YXJpYW50IGNvbmZpZ3VyYXRpb25zXG4gICAgY29uc3QgbW90aW9uVmFyaWFudHMgPSB7XG4gICAgICAwOiB7XG4gICAgICAgIC8vIFZhcmlhbnQgMDogZHJhbWF0aWMgem9vbS1vdXQgcG9wIHRoZW4gaG9sZCB6b29tICsgcHJvbm91bmNlZCBjaXJjdWxhciBkcmlmdFxuICAgICAgICB6b29tOiBgaWYobHRlKG9uXFxcXCwke3pvb21PdXRGcmFtZXN9KVxcXFwsMS4xNS0oMC4wOCpvbi8ke3pvb21PdXRGcmFtZXN9KVxcXFwsMS4wOClgLFxuICAgICAgICB4OiBgaXcvMi0oaXcvem9vbS8yKSArIGlmKGd0ZShvblxcXFwsJHt6b29tT3V0RnJhbWVzfSlcXFxcLCAke21vdmVSYWRpdXN9KmNvcygyKlBJKihvbi0ke3pvb21PdXRGcmFtZXN9KS8ke21vdmVQZXJpb2R9KVxcXFwsIDApYCxcbiAgICAgICAgeTogYGloLzItKGloL3pvb20vMikgKyBpZihndGUob25cXFxcLCR7em9vbU91dEZyYW1lc30pXFxcXCwgJHttb3ZlUmFkaXVzfSpzaW4oMipQSSoob24tJHt6b29tT3V0RnJhbWVzfSkvJHttb3ZlUGVyaW9kfSlcXFxcLCAwKWAsXG4gICAgICAgIHN1cGVyc2FtcGxlOiAnMTQ0MHgyNTYwJyxcbiAgICAgICAgdG1peDogXCJmcmFtZXM9Mjp3ZWlnaHRzPScxIDEnXCIsXG4gICAgICAgIHNjYWxlOiAnc2NhbGU9NzIwOjEyODA6ZmxhZ3M9c3BsaW5lOnN3c19kaXRoZXI9bm9uZScsXG4gICAgICB9LFxuICAgICAgMToge1xuICAgICAgICAvLyBWYXJpYW50IDE6IHN0cm9uZyBjb250aW51b3VzIHpvb20taW4gKEtlbiBCdXJucykgKyBwcm9ub3VuY2VkIGNpcmN1bGFyIGRyaWZ0XG4gICAgICAgIHpvb206ICdtaW4ocG93KDEuMDAxMlxcXFwsb24pXFxcXCwxLjE1KScsXG4gICAgICAgIHg6IGBpdy8yLShpdy96b29tLzIpICsgJHttb3ZlUmFkaXVzfSpjb3MoMipQSSpvbi8ke21vdmVQZXJpb2R9KWAsXG4gICAgICAgIHk6IGBpaC8yLShpaC96b29tLzIpICsgJHttb3ZlUmFkaXVzfSpzaW4oMipQSSpvbi8ke21vdmVQZXJpb2R9KWAsXG4gICAgICAgIHN1cGVyc2FtcGxlOiAnMTQ0MHgyNTYwJyxcbiAgICAgICAgdG1peDogXCJmcmFtZXM9Mjp3ZWlnaHRzPScxIDEnXCIsXG4gICAgICAgIHNjYWxlOiAnc2NhbGU9NzIwOjEyODA6ZmxhZ3M9bGFuY3pvczpzd3NfZGl0aGVyPW5vbmUnLFxuICAgICAgfSxcbiAgICAgIDI6IHtcbiAgICAgICAgLy8gVmFyaWFudCAyOiBzdHJvbmcgY29udGludW91cyB6b29tLW91dCArIHByb25vdW5jZWQgZWxsaXB0aWNhbCBkcmlmdFxuICAgICAgICB6b29tOiBgbWF4KDEuMDVcXFxcLCAxLjEyIC0gMC4wNypvbi8ke2ZyYW1lc30pYCxcbiAgICAgICAgeDogYGl3LzItKGl3L3pvb20vMikgKyAke21vdmVSYWRpdXN9KmNvcygyKlBJKm9uLyR7bW92ZVBlcmlvZH0pYCxcbiAgICAgICAgeTogYGloLzItKGloL3pvb20vMikgKyAoJHttb3ZlUmFkaXVzfS8xLjIpKnNpbigyKlBJKm9uLyR7bW92ZVBlcmlvZH0pYCxcbiAgICAgICAgc3VwZXJzYW1wbGU6ICcxNDQweDI1NjAnLFxuICAgICAgICB0bWl4OiBcImZyYW1lcz0yOndlaWdodHM9JzEgMSdcIixcbiAgICAgICAgc2NhbGU6ICdzY2FsZT03MjA6MTI4MDpmbGFncz1sYW5jem9zOnN3c19kaXRoZXI9bm9uZScsXG4gICAgICB9LFxuICAgIH07XG5cbiAgICBjb25zdCBjb25maWcgPSBtb3Rpb25WYXJpYW50c1t2YXJpYW50IGFzIGtleW9mIHR5cGVvZiBtb3Rpb25WYXJpYW50c107XG5cbiAgICBjb25zdCBmaWx0ZXJDb21wbGV4ID1cbiAgICAgIGBbMDp2XXpvb21wYW49ej0nJHtjb25maWcuem9vbX0nOmQ9JHtmcmFtZXN9OmAgK1xuICAgICAgYHg9JyR7Y29uZmlnLnh9JzpgICtcbiAgICAgIGB5PScke2NvbmZpZy55fSc6YCArXG4gICAgICBgcz0ke2NvbmZpZy5zdXBlcnNhbXBsZX0sYCArXG4gICAgICBgdG1peD0ke2NvbmZpZy50bWl4fSxgICtcbiAgICAgIGBmcHM9MjUsYCArXG4gICAgICBgJHtjb25maWcuc2NhbGV9LGAgK1xuICAgICAgYHNwbGl0W2IwXVtiMV07YCArXG4gICAgICBgW2IxXWJveGJsdXI9ODoxW2JiXTtgICtcbiAgICAgIGBbYjBdW2JiXWJsZW5kPWFsbF9leHByPSdBKigxLW1heCgwXFxcXCwxIC0gVC8ke2JsdXJJbkR1cmF0aW9ufSkpICsgQiptYXgoMFxcXFwsMSAtIFQvJHtibHVySW5EdXJhdGlvbn0pJ1ttYWluXTtgICtcbiAgICAgIGBbMTp2XXNjYWxlPTIwMDotMVt3YXRlcm1hcmtdO2AgK1xuICAgICAgYFttYWluXVt3YXRlcm1hcmtdb3ZlcmxheT0oVy13KS8yOjEwW3ZdYDtcblxuICAgIGNvbnN0IGZmbXBlZ1BhdGggPSByZXNvbHZlRmZtcGVnUGF0aCgpO1xuXG4gICAgY29uc3QgZmZtcGVnQXJncyA9IFtcbiAgICAgICctbG9vcCcsXG4gICAgICAnMScsXG4gICAgICAnLWknLFxuICAgICAgaW5wdXRJbWFnZVBhdGgsXG4gICAgICAnLWxvb3AnLFxuICAgICAgJzEnLFxuICAgICAgJy1pJyxcbiAgICAgIHdhdGVybWFya1BhdGgsXG4gICAgICAnLWZpbHRlcl9jb21wbGV4JyxcbiAgICAgIGZpbHRlckNvbXBsZXgsXG4gICAgICAnLW1hcCcsXG4gICAgICAnW3ZdJyxcbiAgICAgICctYzp2JyxcbiAgICAgICdsaWJ4MjY0JyxcbiAgICAgICctcHJlc2V0JyxcbiAgICAgICd2ZXJ5ZmFzdCcsXG4gICAgICAnLWNyZicsXG4gICAgICAnMjMnLFxuICAgICAgJy1waXhfZm10JyxcbiAgICAgICd5dXY0MjBwJyxcbiAgICAgICctdGhyZWFkcycsXG4gICAgICAnMCcsXG4gICAgICAnLXQnLFxuICAgICAgc2NlbmUuZHVyYXRpb24udG9TdHJpbmcoKSxcbiAgICAgICcteScsXG4gICAgICBvdXRwdXRWaWRlb1BhdGgsXG4gICAgXTtcblxuICAgIGNvbnNvbGUubG9nKGDwn46sIFJ1bm5pbmcgRkZtcGVnIGNvbW1hbmQgZm9yIHNjZW5lICR7c2NlbmVJbmRleCArIDF9OmApO1xuICAgIGNvbnNvbGUubG9nKGDwn46sIFNjZW5lIGR1cmF0aW9uOiAke3NjZW5lLmR1cmF0aW9ufXNgKTtcbiAgICBjb25zb2xlLmxvZyhmZm1wZWdQYXRoLCBmZm1wZWdBcmdzLmpvaW4oJyAnKSk7XG5cbiAgICBjb25zdCB7IHN0ZG91dCwgc3RkZXJyIH0gPSBhd2FpdCBleGVjRmlsZUFzeW5jKGZmbXBlZ1BhdGgsIGZmbXBlZ0FyZ3MsIHtcbiAgICAgIG1heEJ1ZmZlcjogMTAyNCAqIDEwMjQgKiAxMCxcbiAgICB9KTtcblxuICAgIGlmIChzdGRlcnIpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdGRm1wZWcgc3RkZXJyOicsIHN0ZGVycik7XG4gICAgfVxuXG4gICAgaWYgKHN0ZG91dCkge1xuICAgICAgY29uc29sZS5sb2coJ0ZGbXBlZyBzdGRvdXQ6Jywgc3Rkb3V0KTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiBvdXRwdXQgZmlsZSBleGlzdHNcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMob3V0cHV0VmlkZW9QYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGRm1wZWcgZGlkIG5vdCBnZW5lcmF0ZSBvdXRwdXQgdmlkZW8gZmlsZScpO1xuICAgIH1cblxuICAgIC8vIFVwbG9hZCB0byBTM1xuICAgIGNvbnN0IHZpZGVvS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ubXA0YDtcbiAgICBjb25zdCB2aWRlb0J1ZmZlciA9IGZzLnJlYWRGaWxlU3luYyhvdXRwdXRWaWRlb1BhdGgpO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBg4piB77iPIFVwbG9hZGluZyB2aWRlbyB0byBTMzogJHtwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRX0vJHt2aWRlb0tleX1gLFxuICAgICk7XG5cbiAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IHZpZGVvS2V5LFxuICAgICAgICBCb2R5OiB2aWRlb0J1ZmZlcixcbiAgICAgICAgQ29udGVudFR5cGU6ICd2aWRlby9tcDQnLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIENsZWFuIHVwIHRlbXBvcmFyeSBmaWxlc1xuICAgIHRyeSB7XG4gICAgICBmcy51bmxpbmtTeW5jKGlucHV0SW1hZ2VQYXRoKTtcbiAgICAgIGZzLnVubGlua1N5bmMod2F0ZXJtYXJrUGF0aCk7XG4gICAgICBmcy51bmxpbmtTeW5jKG91dHB1dFZpZGVvUGF0aCk7XG4gICAgfSBjYXRjaCAoY2xlYW51cEVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICfimqDvuI8gV2FybmluZzogQ291bGQgbm90IGNsZWFuIHVwIHRlbXBvcmFyeSBmaWxlczonLFxuICAgICAgICBjbGVhbnVwRXJyb3IsXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKGDinIUgVmlkZW8gdXBsb2FkZWQgdG8gUzM6ICR7dmlkZW9LZXl9YCk7XG5cbiAgICAvLyBHZW5lcmF0ZSBzaWduZWQgVVJMIGZvciB0aGUgdXBsb2FkZWQgdmlkZW9cbiAgICBjb25zdCB2aWRlb1NpZ25lZFVybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgIHMzLFxuICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IHZpZGVvS2V5LFxuICAgICAgfSksXG4gICAgICB7IGV4cGlyZXNJbjogMzYwMDAgfSwgLy8gMTAgaG91cnMgZXhwaXJhdGlvblxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZyhg4pyFIFZpZGVvIHNpZ25lZCBVUkwgZ2VuZXJhdGVkIGZvciBzY2VuZSAke3NjZW5lSW5kZXggKyAxfWApO1xuICAgIHJldHVybiB2aWRlb1NpZ25lZFVybDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKFxuICAgICAgYOKdjCBFcnJvciBnZW5lcmF0aW5nIHZpZGVvIGZvciBzY2VuZSAke3NjZW5lSW5kZXggKyAxfTpgLFxuICAgICAgZXJyb3IsXG4gICAgKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19