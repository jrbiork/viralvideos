"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateVideoBlurInOut = generateVideoBlurInOut;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
async function generateVideoBlurInOut(scenes, userId, timestamp) {
    try {
        console.log('🎬 Generating video blur in/out effects for scenes...');
        const videoKeys = [];
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            console.log(`🎬 Processing scene ${i + 1}: ${scene.description}`);
            try {
                const imageKey = `${userId}/${timestamp}.scene-${scene.id}.jpg`;
                const imageUrl = await getImageSignedUrl(imageKey);
                if (!imageUrl) {
                    console.error(`❌ No image found for scene ${scene.id}`);
                    continue;
                }
                const videoKey = await generateSceneVideo(imageUrl, scene, i, userId, timestamp);
                videoKeys.push(videoKey);
                console.log(`✅ Scene ${i + 1} video generated: ${videoKey}`);
            }
            catch (error) {
                console.error(`❌ Failed to generate video for scene ${i + 1}:`, error);
                throw new Error(`Failed to generate video for scene ${i + 1}: ${error}`);
            }
        }
        if (videoKeys.length === 0) {
            console.log('❌ Error: No videos were generated');
            throw new Error('No videos were generated');
        }
        console.log(`✅ Generated ${videoKeys.length} video clips with blur effects`);
        return videoKeys;
    }
    catch (error) {
        console.error('❌ Error in generateVideoBlurInOut:', error);
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
        console.log(`📥 Downloading image from: ${imageUrl}`);
        const imageResponse = await axios_1.default.get(imageUrl, {
            responseType: 'arraybuffer',
        });
        const imageBuffer = Buffer.from(imageResponse.data);
        const tempDir = '/tmp';
        const inputImagePath = path.join(tempDir, `input-${sceneIndex}.jpg`);
        const outputVideoPath = path.join(tempDir, `output-${sceneIndex}.mp4`);
        fs.writeFileSync(inputImagePath, imageBuffer);
        const frames = Math.floor(scene.duration * 25);
        const blurInDuration = 0.2;
        const zoomOutFrames = Math.max(1, Math.floor(blurInDuration * 25));
        const moveRadius = 8;
        const movePeriod = 240;
        const filterComplex = `[0:v]zoompan=z='if(lte(on\\,${zoomOutFrames})\\,1.06-(0.02*on/${zoomOutFrames})\\,1.04)':d=${frames}:` +
            `x='iw/2-(iw/zoom/2) + if(gte(on\\,${zoomOutFrames})\\, ${moveRadius}*cos(2*PI*(on-${zoomOutFrames})/${movePeriod})\\, 0)':` +
            `y='ih/2-(ih/zoom/2) + if(gte(on\\,${zoomOutFrames})\\, ${moveRadius}*sin(2*PI*(on-${zoomOutFrames})/${movePeriod})\\, 0)':` +
            `s=2160x3840,` +
            `tmix=frames=3:weights='1 2 1',` +
            `scale=720:1280:flags=spline+accurate_rnd:sws_dither=none,` +
            `split[b0][b1];` +
            `[b1]boxblur=8:1[bb];` +
            `[b0][bb]blend=all_expr='A*(1-max(0\\,1 - T/${blurInDuration})) + B*max(0\\,1 - T/${blurInDuration})'[v]`;
        const ffmpegPath = resolveFfmpegPath();
        const ffmpegArgs = [
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
            'medium',
            '-crf',
            '23',
            '-pix_fmt',
            'yuv420p',
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
        if (!fs.existsSync(outputVideoPath)) {
            throw new Error('FFmpeg did not generate output video file');
        }
        const videoKey = `${userId}/${timestamp}.scene-${scene.id}.mp4`;
        const videoBuffer = fs.readFileSync(outputVideoPath);
        console.log(`☁️ Uploading video to S3: ${process.env.VIDEO_PARTS_BUCKET_NAME}/${videoKey}`);
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: process.env.VIDEO_PARTS_BUCKET_NAME,
            Key: videoKey,
            Body: videoBuffer,
            ContentType: 'video/mp4',
        }));
        try {
            fs.unlinkSync(inputImagePath);
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
