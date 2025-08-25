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
                const videoKey = await generateSceneVideo(imageUrl, scene, i, userId, timestamp);
                console.log(`✅ Scene ${i + 1} video generated: ${videoKey}`);
                return videoKey;
            }
            catch (error) {
                console.error(`❌ Failed to generate video for scene ${i + 1}:`, error);
                throw new Error(`Failed to generate video for scene ${i + 1}: ${error}`);
            }
        });
        const videoKeys = (await Promise.all(videoPromises)).filter((key) => key !== null);
        if (videoKeys.length === 0) {
            console.log('❌ Error: No videos were generated');
            throw new Error('No videos were generated');
        }
        console.log(`✅ Generated ${videoKeys.length} video clips with effects`);
        return videoKeys;
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
        return videoKey;
    }
    catch (error) {
        console.error(`❌ Error generating video for scene ${sceneIndex + 1}:`, error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9FZmZlY3RzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidmlkZW9FZmZlY3RzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBb0RBLG9EQXdEQztBQTVHRCxrREFJNEI7QUFDNUIsd0VBQTZEO0FBQzdELGlDQUEwQjtBQUMxQix5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLCtCQUFpQztBQUNqQyxpREFBK0M7QUFFL0MsTUFBTSxTQUFTLEdBQUcsSUFBQSxnQkFBUyxFQUFDLG9CQUFJLENBQUMsQ0FBQztBQUNsQyxNQUFNLGFBQWEsR0FBRyxJQUFBLGdCQUFTLEVBQUMsd0JBQVEsQ0FBQyxDQUFDO0FBQzFDLE1BQU0sRUFBRSxHQUFHLElBQUksb0JBQVEsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBUzNFLFNBQVMsWUFBWSxDQUFDLENBQVM7SUFDN0IsSUFBSSxDQUFDO1FBQ0gsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUCxPQUFPLEtBQUssQ0FBQztJQUNmLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxpQkFBaUI7SUFDeEIsTUFBTSxVQUFVLEdBQUc7UUFDakIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXO1FBQ3ZCLGlCQUFpQjtRQUNqQixhQUFhO1FBQ2IsaUJBQWlCO1FBQ2pCLHVCQUF1QjtLQUN4QixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQWEsQ0FBQztJQUU5QixLQUFLLE1BQU0sQ0FBQyxJQUFJLFVBQVUsRUFBRSxDQUFDO1FBQzNCLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDO1lBQUUsT0FBTyxDQUFDLENBQUM7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QUM7UUFDbkQsT0FBTyxRQUFRLENBQUM7SUFDbEIsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUNYLHNDQUFzQyxVQUFVLEdBQUcsQ0FBQyxHQUFHLEVBQ3ZELEtBQUssQ0FDTixDQUFDO1FBQ0YsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIFMzQ2xpZW50LFxuICBQdXRPYmplY3RDb21tYW5kLFxuICBHZXRPYmplY3RDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgZ2V0U2lnbmVkVXJsIH0gZnJvbSAnQGF3cy1zZGsvczMtcmVxdWVzdC1wcmVzaWduZXInO1xuaW1wb3J0IGF4aW9zIGZyb20gJ2F4aW9zJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBwcm9taXNpZnkgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IGV4ZWMsIGV4ZWNGaWxlIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5cbmNvbnN0IGV4ZWNBc3luYyA9IHByb21pc2lmeShleGVjKTtcbmNvbnN0IGV4ZWNGaWxlQXN5bmMgPSBwcm9taXNpZnkoZXhlY0ZpbGUpO1xuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2NlbmUge1xuICBkZXNjcmlwdGlvbjogc3RyaW5nO1xuICBkdXJhdGlvbjogbnVtYmVyO1xuICBuYXJyYXRpb246IHN0cmluZztcbiAgaWQ6IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gaXNFeGVjdXRhYmxlKHA6IHN0cmluZyk6IGJvb2xlYW4ge1xuICB0cnkge1xuICAgIGZzLmFjY2Vzc1N5bmMocCwgZnMuY29uc3RhbnRzLlhfT0spO1xuICAgIHJldHVybiB0cnVlO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUZmbXBlZ1BhdGgoKTogc3RyaW5nIHtcbiAgY29uc3QgY2FuZGlkYXRlcyA9IFtcbiAgICBwcm9jZXNzLmVudi5GRk1QRUdfUEFUSCxcbiAgICAnL29wdC9iaW4vZmZtcGVnJyxcbiAgICAnL29wdC9mZm1wZWcnLFxuICAgICcvdXNyL2Jpbi9mZm1wZWcnLFxuICAgICcvdXNyL2xvY2FsL2Jpbi9mZm1wZWcnLFxuICBdLmZpbHRlcihCb29sZWFuKSBhcyBzdHJpbmdbXTtcblxuICBmb3IgKGNvbnN0IHAgb2YgY2FuZGlkYXRlcykge1xuICAgIGlmIChmcy5leGlzdHNTeW5jKHApICYmIGlzRXhlY3V0YWJsZShwKSkgcmV0dXJuIHA7XG4gIH1cblxuICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgJ0ZGbXBlZyBiaW5hcnkgbm90IGZvdW5kLiBFeHBlY3RlZCBhdCBvbmUgb2Y6ICcgK1xuICAgICAgY2FuZGlkYXRlcy5qb2luKCcsICcpICtcbiAgICAgICcuIEVuc3VyZSB5b3VyIExhbWJkYSBsYXllciBwcm92aWRlcyBmZm1wZWcgKGNvbW1vbiBwYXRoOiAvb3B0L2Jpbi9mZm1wZWcpIG9yIHNldCBGRk1QRUdfUEFUSC4nLFxuICApO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVWaWRlb0VmZmVjdHMoXG4gIHNjZW5lczogU2NlbmVbXSxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKCfwn46sIEdlbmVyYXRpbmcgdmlkZW8gZWZmZWN0cyBmb3Igc2NlbmVzLi4uJyk7XG5cbiAgICAvLyBQcm9jZXNzIGFsbCBzY2VuZXMgaW4gcGFyYWxsZWxcbiAgICBjb25zdCB2aWRlb1Byb21pc2VzID0gc2NlbmVzLm1hcChhc3luYyAoc2NlbmUsIGkpID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKGDwn46sIFByb2Nlc3Npbmcgc2NlbmUgJHtpICsgMX06ICR7c2NlbmUuZGVzY3JpcHRpb259YCk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIC8vIEdldCB0aGUgaW1hZ2UgVVJMIGZvciB0aGlzIHNjZW5lXG4gICAgICAgIGNvbnN0IGltYWdlS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0uanBnYDtcbiAgICAgICAgY29uc3QgaW1hZ2VVcmwgPSBhd2FpdCBnZXRJbWFnZVNpZ25lZFVybChpbWFnZUtleSk7XG5cbiAgICAgICAgaWYgKCFpbWFnZVVybCkge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBObyBpbWFnZSBmb3VuZCBmb3Igc2NlbmUgJHtzY2VuZS5pZH1gKTtcbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEdlbmVyYXRlIHZpZGVvIHdpdGggYmx1ciBpbi9vdXQgYW5kIGNhbWVyYSBtb3ZlbWVudFxuICAgICAgICBjb25zdCB2aWRlb0tleSA9IGF3YWl0IGdlbmVyYXRlU2NlbmVWaWRlbyhcbiAgICAgICAgICBpbWFnZVVybCxcbiAgICAgICAgICBzY2VuZSxcbiAgICAgICAgICBpLFxuICAgICAgICAgIHVzZXJJZCxcbiAgICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgICk7XG5cbiAgICAgICAgY29uc29sZS5sb2coYOKchSBTY2VuZSAke2kgKyAxfSB2aWRlbyBnZW5lcmF0ZWQ6ICR7dmlkZW9LZXl9YCk7XG4gICAgICAgIHJldHVybiB2aWRlb0tleTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9OmAsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIGBGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9OiAke2Vycm9yfWAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb25zdCB2aWRlb0tleXMgPSAoYXdhaXQgUHJvbWlzZS5hbGwodmlkZW9Qcm9taXNlcykpLmZpbHRlcihcbiAgICAgIChrZXkpOiBrZXkgaXMgc3RyaW5nID0+IGtleSAhPT0gbnVsbCxcbiAgICApO1xuXG4gICAgaWYgKHZpZGVvS2V5cy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIHZpZGVvcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyB2aWRlb3Mgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCAke3ZpZGVvS2V5cy5sZW5ndGh9IHZpZGVvIGNsaXBzIHdpdGggZWZmZWN0c2ApO1xuICAgIHJldHVybiB2aWRlb0tleXM7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIGluIGdlbmVyYXRlVmlkZW9FZmZlY3RzOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRJbWFnZVNpZ25lZFVybChpbWFnZUtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRPYmplY3RDb21tYW5kKHtcbiAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fUEFSVFNfQlVDS0VUX05BTUUsXG4gICAgICBLZXk6IGltYWdlS2V5LFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGF3YWl0IGdldFNpZ25lZFVybChzMywgY29tbWFuZCwgeyBleHBpcmVzSW46IDM2MDAwIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBFcnJvciBnZXR0aW5nIHNpZ25lZCBVUkwgZm9yICR7aW1hZ2VLZXl9OmAsIGVycm9yKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVNjZW5lVmlkZW8oXG4gIGltYWdlVXJsOiBzdHJpbmcsXG4gIHNjZW5lOiBTY2VuZSxcbiAgc2NlbmVJbmRleDogbnVtYmVyLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICB0cnkge1xuICAgIC8vIERvd25sb2FkIHRoZSBpbWFnZVxuICAgIGNvbnNvbGUubG9nKGDwn5OlIERvd25sb2FkaW5nIGltYWdlIGZyb206ICR7aW1hZ2VVcmx9YCk7XG4gICAgY29uc3QgaW1hZ2VSZXNwb25zZSA9IGF3YWl0IGF4aW9zLmdldChpbWFnZVVybCwge1xuICAgICAgcmVzcG9uc2VUeXBlOiAnYXJyYXlidWZmZXInLFxuICAgIH0pO1xuICAgIGNvbnN0IGltYWdlQnVmZmVyID0gQnVmZmVyLmZyb20oaW1hZ2VSZXNwb25zZS5kYXRhKTtcblxuICAgIC8vIGRvd25sb2FkIHRoZSB3YXRlcm1hcmsucG5nIGZyb20gdmlyYWwgc2hvcnQgcGFydHMgYnVja2V0XG4gICAgY29uc3Qgd2F0ZXJtYXJrS2V5ID0gJ3dhdGVybWFyay5wbmcnO1xuICAgIGNvbnN0IHdhdGVybWFya1VybCA9IGF3YWl0IGdldFNpZ25lZFVybChcbiAgICAgIHMzLFxuICAgICAgbmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IHdhdGVybWFya0tleSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zdCB3YXRlcm1hcmtSZXNwb25zZSA9IGF3YWl0IGF4aW9zLmdldCh3YXRlcm1hcmtVcmwsIHtcbiAgICAgIHJlc3BvbnNlVHlwZTogJ2FycmF5YnVmZmVyJyxcbiAgICB9KTtcbiAgICBjb25zdCB3YXRlcm1hcmtCdWZmZXIgPSBCdWZmZXIuZnJvbSh3YXRlcm1hcmtSZXNwb25zZS5kYXRhKTtcblxuICAgIC8vIENyZWF0ZSB0ZW1wb3JhcnkgZmlsZXNcbiAgICBjb25zdCB0ZW1wRGlyID0gJy90bXAnO1xuICAgIGNvbnN0IGlucHV0SW1hZ2VQYXRoID0gcGF0aC5qb2luKHRlbXBEaXIsIGBpbnB1dC0ke3NjZW5lSW5kZXh9LmpwZ2ApO1xuICAgIGNvbnN0IG91dHB1dFZpZGVvUGF0aCA9IHBhdGguam9pbih0ZW1wRGlyLCBgb3V0cHV0LSR7c2NlbmVJbmRleH0ubXA0YCk7XG5cbiAgICAvLyBXcml0ZSBpbWFnZSB0byB0ZW1wIGZpbGVcbiAgICBmcy53cml0ZUZpbGVTeW5jKGlucHV0SW1hZ2VQYXRoLCBpbWFnZUJ1ZmZlcik7XG5cbiAgICAvLyBXcml0ZSB3YXRlcm1hcmsgdG8gdGVtcCBmaWxlXG4gICAgY29uc3Qgd2F0ZXJtYXJrUGF0aCA9IHBhdGguam9pbih0ZW1wRGlyLCBgd2F0ZXJtYXJrLSR7c2NlbmVJbmRleH0ucG5nYCk7XG4gICAgZnMud3JpdGVGaWxlU3luYyh3YXRlcm1hcmtQYXRoLCB3YXRlcm1hcmtCdWZmZXIpO1xuXG4gICAgY29uc3QgZnJhbWVzID0gTWF0aC5mbG9vcihzY2VuZS5kdXJhdGlvbiAqIDI1KTtcbiAgICBjb25zdCBibHVySW5EdXJhdGlvbiA9IDAuMjtcbiAgICBjb25zdCB6b29tT3V0RnJhbWVzID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihibHVySW5EdXJhdGlvbiAqIDI1KSk7XG5cbiAgICAvLyBhZGQgbmVhciB5b3VyIG90aGVyIHBhcmFtc1xuICAgIGNvbnN0IG1vdmVSYWRpdXMgPSAyNTsgLy8gcHggKG1vcmUgaW50ZW50aW9uYWwgYW5kIHZpc2libGUpXG4gICAgY29uc3QgbW92ZVBlcmlvZCA9IDE4MDsgLy8gZnJhbWVzICh+Ny4ycyBAMjVmcHMpIC0gZmFzdGVyIG1vdmVtZW50XG5cbiAgICAvLyBkZXRlcm1pbmlzdGljYWxseSBjaG9vc2Ugb25lIG9mIHRocmVlIG1vdGlvbiB2YXJpYW50cyBwZXIgc2NlbmUgKGluZGV4LWJhc2VkKVxuICAgIGNvbnN0IHZhcmlhbnQgPSBzY2VuZUluZGV4ICUgMzsgLy8gMDogZHJhbWF0aWMgcG9wLW91dCtkcmlmdCwgMTogc3Ryb25nIHpvb20taW4sIDI6IHN0cm9uZyB6b29tLW91dFxuICAgIGNvbnNvbGUubG9nKGDwn46oIE1vdGlvbiB2YXJpYW50IHNlbGVjdGVkIChpbmRleC1iYXNlZCk6ICR7dmFyaWFudH1gKTtcblxuICAgIC8vIE1vdGlvbiB2YXJpYW50IGNvbmZpZ3VyYXRpb25zXG4gICAgY29uc3QgbW90aW9uVmFyaWFudHMgPSB7XG4gICAgICAwOiB7XG4gICAgICAgIC8vIFZhcmlhbnQgMDogZHJhbWF0aWMgem9vbS1vdXQgcG9wIHRoZW4gaG9sZCB6b29tICsgcHJvbm91bmNlZCBjaXJjdWxhciBkcmlmdFxuICAgICAgICB6b29tOiBgaWYobHRlKG9uXFxcXCwke3pvb21PdXRGcmFtZXN9KVxcXFwsMS4xNS0oMC4wOCpvbi8ke3pvb21PdXRGcmFtZXN9KVxcXFwsMS4wOClgLFxuICAgICAgICB4OiBgaXcvMi0oaXcvem9vbS8yKSArIGlmKGd0ZShvblxcXFwsJHt6b29tT3V0RnJhbWVzfSlcXFxcLCAke21vdmVSYWRpdXN9KmNvcygyKlBJKihvbi0ke3pvb21PdXRGcmFtZXN9KS8ke21vdmVQZXJpb2R9KVxcXFwsIDApYCxcbiAgICAgICAgeTogYGloLzItKGloL3pvb20vMikgKyBpZihndGUob25cXFxcLCR7em9vbU91dEZyYW1lc30pXFxcXCwgJHttb3ZlUmFkaXVzfSpzaW4oMipQSSoob24tJHt6b29tT3V0RnJhbWVzfSkvJHttb3ZlUGVyaW9kfSlcXFxcLCAwKWAsXG4gICAgICAgIHN1cGVyc2FtcGxlOiAnMTQ0MHgyNTYwJyxcbiAgICAgICAgdG1peDogXCJmcmFtZXM9Mjp3ZWlnaHRzPScxIDEnXCIsXG4gICAgICAgIHNjYWxlOiAnc2NhbGU9NzIwOjEyODA6ZmxhZ3M9c3BsaW5lOnN3c19kaXRoZXI9bm9uZScsXG4gICAgICB9LFxuICAgICAgMToge1xuICAgICAgICAvLyBWYXJpYW50IDE6IHN0cm9uZyBjb250aW51b3VzIHpvb20taW4gKEtlbiBCdXJucykgKyBwcm9ub3VuY2VkIGNpcmN1bGFyIGRyaWZ0XG4gICAgICAgIHpvb206ICdtaW4ocG93KDEuMDAxMlxcXFwsb24pXFxcXCwxLjE1KScsXG4gICAgICAgIHg6IGBpdy8yLShpdy96b29tLzIpICsgJHttb3ZlUmFkaXVzfSpjb3MoMipQSSpvbi8ke21vdmVQZXJpb2R9KWAsXG4gICAgICAgIHk6IGBpaC8yLShpaC96b29tLzIpICsgJHttb3ZlUmFkaXVzfSpzaW4oMipQSSpvbi8ke21vdmVQZXJpb2R9KWAsXG4gICAgICAgIHN1cGVyc2FtcGxlOiAnMTQ0MHgyNTYwJyxcbiAgICAgICAgdG1peDogXCJmcmFtZXM9Mjp3ZWlnaHRzPScxIDEnXCIsXG4gICAgICAgIHNjYWxlOiAnc2NhbGU9NzIwOjEyODA6ZmxhZ3M9bGFuY3pvczpzd3NfZGl0aGVyPW5vbmUnLFxuICAgICAgfSxcbiAgICAgIDI6IHtcbiAgICAgICAgLy8gVmFyaWFudCAyOiBzdHJvbmcgY29udGludW91cyB6b29tLW91dCArIHByb25vdW5jZWQgZWxsaXB0aWNhbCBkcmlmdFxuICAgICAgICB6b29tOiBgbWF4KDEuMDVcXFxcLCAxLjEyIC0gMC4wNypvbi8ke2ZyYW1lc30pYCxcbiAgICAgICAgeDogYGl3LzItKGl3L3pvb20vMikgKyAke21vdmVSYWRpdXN9KmNvcygyKlBJKm9uLyR7bW92ZVBlcmlvZH0pYCxcbiAgICAgICAgeTogYGloLzItKGloL3pvb20vMikgKyAoJHttb3ZlUmFkaXVzfS8xLjIpKnNpbigyKlBJKm9uLyR7bW92ZVBlcmlvZH0pYCxcbiAgICAgICAgc3VwZXJzYW1wbGU6ICcxNDQweDI1NjAnLFxuICAgICAgICB0bWl4OiBcImZyYW1lcz0yOndlaWdodHM9JzEgMSdcIixcbiAgICAgICAgc2NhbGU6ICdzY2FsZT03MjA6MTI4MDpmbGFncz1sYW5jem9zOnN3c19kaXRoZXI9bm9uZScsXG4gICAgICB9LFxuICAgIH07XG5cbiAgICBjb25zdCBjb25maWcgPSBtb3Rpb25WYXJpYW50c1t2YXJpYW50IGFzIGtleW9mIHR5cGVvZiBtb3Rpb25WYXJpYW50c107XG5cbiAgICBjb25zdCBmaWx0ZXJDb21wbGV4ID1cbiAgICAgIGBbMDp2XXpvb21wYW49ej0nJHtjb25maWcuem9vbX0nOmQ9JHtmcmFtZXN9OmAgK1xuICAgICAgYHg9JyR7Y29uZmlnLnh9JzpgICtcbiAgICAgIGB5PScke2NvbmZpZy55fSc6YCArXG4gICAgICBgcz0ke2NvbmZpZy5zdXBlcnNhbXBsZX0sYCArXG4gICAgICBgdG1peD0ke2NvbmZpZy50bWl4fSxgICtcbiAgICAgIGBmcHM9MjUsYCArXG4gICAgICBgJHtjb25maWcuc2NhbGV9LGAgK1xuICAgICAgYHNwbGl0W2IwXVtiMV07YCArXG4gICAgICBgW2IxXWJveGJsdXI9ODoxW2JiXTtgICtcbiAgICAgIGBbYjBdW2JiXWJsZW5kPWFsbF9leHByPSdBKigxLW1heCgwXFxcXCwxIC0gVC8ke2JsdXJJbkR1cmF0aW9ufSkpICsgQiptYXgoMFxcXFwsMSAtIFQvJHtibHVySW5EdXJhdGlvbn0pJ1ttYWluXTtgICtcbiAgICAgIGBbMTp2XXNjYWxlPTIwMDotMVt3YXRlcm1hcmtdO2AgK1xuICAgICAgYFttYWluXVt3YXRlcm1hcmtdb3ZlcmxheT0oVy13KS8yOjEwW3ZdYDtcblxuICAgIGNvbnN0IGZmbXBlZ1BhdGggPSByZXNvbHZlRmZtcGVnUGF0aCgpO1xuXG4gICAgY29uc3QgZmZtcGVnQXJncyA9IFtcbiAgICAgICctbG9vcCcsXG4gICAgICAnMScsXG4gICAgICAnLWknLFxuICAgICAgaW5wdXRJbWFnZVBhdGgsXG4gICAgICAnLWxvb3AnLFxuICAgICAgJzEnLFxuICAgICAgJy1pJyxcbiAgICAgIHdhdGVybWFya1BhdGgsXG4gICAgICAnLWZpbHRlcl9jb21wbGV4JyxcbiAgICAgIGZpbHRlckNvbXBsZXgsXG4gICAgICAnLW1hcCcsXG4gICAgICAnW3ZdJyxcbiAgICAgICctYzp2JyxcbiAgICAgICdsaWJ4MjY0JyxcbiAgICAgICctcHJlc2V0JyxcbiAgICAgICd2ZXJ5ZmFzdCcsXG4gICAgICAnLWNyZicsXG4gICAgICAnMjMnLFxuICAgICAgJy1waXhfZm10JyxcbiAgICAgICd5dXY0MjBwJyxcbiAgICAgICctdGhyZWFkcycsXG4gICAgICAnMCcsXG4gICAgICAnLXQnLFxuICAgICAgc2NlbmUuZHVyYXRpb24udG9TdHJpbmcoKSxcbiAgICAgICcteScsXG4gICAgICBvdXRwdXRWaWRlb1BhdGgsXG4gICAgXTtcblxuICAgIGNvbnNvbGUubG9nKGDwn46sIFJ1bm5pbmcgRkZtcGVnIGNvbW1hbmQgZm9yIHNjZW5lICR7c2NlbmVJbmRleCArIDF9OmApO1xuICAgIGNvbnNvbGUubG9nKGDwn46sIFNjZW5lIGR1cmF0aW9uOiAke3NjZW5lLmR1cmF0aW9ufXNgKTtcbiAgICBjb25zb2xlLmxvZyhmZm1wZWdQYXRoLCBmZm1wZWdBcmdzLmpvaW4oJyAnKSk7XG5cbiAgICBjb25zdCB7IHN0ZG91dCwgc3RkZXJyIH0gPSBhd2FpdCBleGVjRmlsZUFzeW5jKGZmbXBlZ1BhdGgsIGZmbXBlZ0FyZ3MsIHtcbiAgICAgIG1heEJ1ZmZlcjogMTAyNCAqIDEwMjQgKiAxMCxcbiAgICB9KTtcblxuICAgIGlmIChzdGRlcnIpIHtcbiAgICAgIGNvbnNvbGUubG9nKCdGRm1wZWcgc3RkZXJyOicsIHN0ZGVycik7XG4gICAgfVxuXG4gICAgaWYgKHN0ZG91dCkge1xuICAgICAgY29uc29sZS5sb2coJ0ZGbXBlZyBzdGRvdXQ6Jywgc3Rkb3V0KTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiBvdXRwdXQgZmlsZSBleGlzdHNcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMob3V0cHV0VmlkZW9QYXRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGRm1wZWcgZGlkIG5vdCBnZW5lcmF0ZSBvdXRwdXQgdmlkZW8gZmlsZScpO1xuICAgIH1cblxuICAgIC8vIFVwbG9hZCB0byBTM1xuICAgIGNvbnN0IHZpZGVvS2V5ID0gYCR7dXNlcklkfS8ke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZS5pZH0ubXA0YDtcbiAgICBjb25zdCB2aWRlb0J1ZmZlciA9IGZzLnJlYWRGaWxlU3luYyhvdXRwdXRWaWRlb1BhdGgpO1xuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBg4piB77iPIFVwbG9hZGluZyB2aWRlbyB0byBTMzogJHtwcm9jZXNzLmVudi5WSURFT19QQVJUU19CVUNLRVRfTkFNRX0vJHt2aWRlb0tleX1gLFxuICAgICk7XG5cbiAgICBhd2FpdCBzMy5zZW5kKFxuICAgICAgbmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LlZJREVPX1BBUlRTX0JVQ0tFVF9OQU1FLFxuICAgICAgICBLZXk6IHZpZGVvS2V5LFxuICAgICAgICBCb2R5OiB2aWRlb0J1ZmZlcixcbiAgICAgICAgQ29udGVudFR5cGU6ICd2aWRlby9tcDQnLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIENsZWFuIHVwIHRlbXBvcmFyeSBmaWxlc1xuICAgIHRyeSB7XG4gICAgICBmcy51bmxpbmtTeW5jKGlucHV0SW1hZ2VQYXRoKTtcbiAgICAgIGZzLnVubGlua1N5bmMod2F0ZXJtYXJrUGF0aCk7XG4gICAgICBmcy51bmxpbmtTeW5jKG91dHB1dFZpZGVvUGF0aCk7XG4gICAgfSBjYXRjaCAoY2xlYW51cEVycm9yKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICfimqDvuI8gV2FybmluZzogQ291bGQgbm90IGNsZWFuIHVwIHRlbXBvcmFyeSBmaWxlczonLFxuICAgICAgICBjbGVhbnVwRXJyb3IsXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKGDinIUgVmlkZW8gdXBsb2FkZWQgdG8gUzM6ICR7dmlkZW9LZXl9YCk7XG4gICAgcmV0dXJuIHZpZGVvS2V5O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICBg4p2MIEVycm9yIGdlbmVyYXRpbmcgdmlkZW8gZm9yIHNjZW5lICR7c2NlbmVJbmRleCArIDF9OmAsXG4gICAgICBlcnJvcixcbiAgICApO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=