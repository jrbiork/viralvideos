"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const axios_1 = require("axios");
const openai_1 = require("openai");
const sdk_1 = require("@runwayml/sdk");
const fs = require("fs");
const path = require("path");
const os = require("os");
const s3 = new client_s3_1.S3Client({ region: process.env.AWS_REGION });
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
const handler = async (event) => {
    console.log('🚀 Lambda function started');
    console.log('📄 Event received:', JSON.stringify(event, null, 2));
    try {
        // Log environment variables (without sensitive values)
        console.log('🔍 Environment variables check:');
        console.log('AWS_REGION:', process.env.AWS_REGION);
        console.log('VIDEO_BUCKET_NAME:', process.env.VIDEO_BUCKET_NAME);
        console.log('RUNWAY_API_KEY set:', !!process.env.RUNWAY_API_KEY);
        console.log('OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY);
        // Validate environment variables
        if (!process.env.RUNWAY_API_KEY) {
            console.error('❌ RUNWAY_API_KEY is not set');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'RUNWAY_API_KEY is not configured' }),
            };
        }
        if (!process.env.OPENAI_API_KEY) {
            console.error('❌ OPENAI_API_KEY is not set');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }),
            };
        }
        if (!process.env.VIDEO_BUCKET_NAME) {
            console.error('❌ VIDEO_BUCKET_NAME is not set');
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'VIDEO_BUCKET_NAME is not configured' }),
            };
        }
        console.log('✅ All environment variables are set');
        let request;
        // Handle different event formats
        if (event.body) {
            // API Gateway format - body is a JSON string
            if (typeof event.body === 'string') {
                request = JSON.parse(event.body);
            }
            else {
                // Direct Lambda invocation - body is already an object
                request = event.body;
            }
        }
        else {
            // Direct Lambda invocation - payload is the entire event
            request = event;
        }
        console.log('✅ Request parsed:', {
            prompt: request.prompt?.substring(0, 50) + '...',
            userId: request.userId,
            timestamp: request.timestamp,
        });
        console.log('🔍 Full request object:', request);
        if (!request.prompt) {
            console.log('❌ Error: Prompt is required');
            console.log('🔍 Request object keys:', Object.keys(request));
            console.log('🔍 Request prompt value:', request.prompt);
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Prompt is required' }),
            };
        }
        console.log('🎬 Starting video generation for prompt:', request.prompt);
        console.log('⏱️  Video duration:', request.duration, 'seconds');
        console.log('🎬 Number of scenes:', request.sceneCount);
        // Step 1: Generate story breakdown using GPT-4
        console.log('📖 Generating story breakdown...');
        let scenes; // = await generateStoryBreakdown(request.prompt, request.sceneCount, request.duration);
        console.log('✅ Generated scenes:', scenes);
        // Generate dynamic scenes based on parameters
        const sceneDuration = Math.floor(request.duration / request.sceneCount);
        scenes = Array.from({ length: request.sceneCount }, (_, index) => ({
            description: request.sceneCount === 1
                ? `A beautiful meditation scene with ocean waves and sunset. The camera shows different angles of the peaceful ocean setting throughout the entire duration.`
                : `Scene ${index + 1}: A beautiful meditation scene with ocean waves and sunset. The camera shows different angles of the peaceful ocean setting.`,
            duration: sceneDuration,
            narration: request.sceneCount === 1
                ? `Take a deep breath and let the peaceful ocean waves guide you to tranquility. Feel the rhythm of the waves and the warmth of the setting sun as you find your inner peace.`
                : `This is scene ${index + 1} of our meditation journey. Take a deep breath and let the peaceful ocean waves guide you to tranquility.`,
        }));
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to generate story breakdown');
            throw new Error('Failed to generate story breakdown');
        }
        // Step 2: Generate video clips for each scene
        console.log('🎥 Generating video clips...');
        const videoClips = [];
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            console.log(`🎬 Generating video for scene ${i + 1}:`, scene.description);
            try {
                const videoClip = await generateVideoClip(scene.description, scene.duration, i);
                videoClips.push(videoClip);
                console.log(`✅ Scene ${i + 1} video generated:`, videoClip);
            }
            catch (error) {
                console.error(`❌ Failed to generate video for scene ${i + 1}:`, error);
                throw new Error(`Failed to generate video for scene ${i + 1}: ${error}`);
            }
        }
        if (videoClips.length === 0) {
            console.log('❌ Error: No video clips were generated');
            throw new Error('No video clips were generated');
        }
        console.log(`✅ Generated ${videoClips.length} video clips`);
        // Step 3: Generate narration audio
        console.log('🎤 Generating narration audio...');
        const narrationAudio = await generateNarration(scenes);
        console.log('✅ Generated narration audio:', narrationAudio);
        // Step 4: Combine video clips and audio
        console.log('🎬 Combining video and audio...');
        const finalVideo = await combineVideoAndAudio(videoClips, narrationAudio, scenes);
        console.log('✅ Final video generated:', finalVideo);
        if (!finalVideo) {
            console.log('❌ Error: Failed to combine video and audio');
            throw new Error('Failed to combine video and audio');
        }
        // Step 5: Upload to S3
        console.log('☁️ Uploading to S3...');
        const videoKey = `videos/${request.userId}/${Date.now()}/final-video.mp4`;
        await uploadToS3(finalVideo, videoKey);
        console.log('✅ Uploaded to S3:', videoKey);
        console.log('🎉 Video generation completed successfully');
        return {
            statusCode: 200,
            body: JSON.stringify({
                videoKey,
                message: 'Video generated successfully',
            }),
        };
    }
    catch (error) {
        console.error('💥 Error in video generation:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to generate video',
                details: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};
exports.handler = handler;
async function generateStoryBreakdown(prompt, sceneCount, totalDuration) {
    console.log('🤖 Calling OpenAI for story breakdown...');
    console.log(`📊 Parameters: ${sceneCount} scenes, ${totalDuration} seconds total`);
    const sceneDuration = Math.floor(totalDuration / sceneCount);
    console.log(`⏱️  Each scene will be ${sceneDuration} seconds long`);
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: `You are a video script writer. Break down the given prompt into ${sceneCount} scenes, each ${sceneDuration} seconds long, for a ${totalDuration}-second vertical video. 
          Each scene should have a clear visual description and narration text. Return as JSON array with objects containing:
          - description: visual scene description for video generation
          - duration: ${sceneDuration} (seconds)
          - narration: text to be spoken in this scene
          
          If only 1 scene is requested, create a single comprehensive scene that covers the entire duration.`,
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 0.7,
        });
        const content = response.choices[0]?.message?.content;
        console.log('📄 OpenAI response content:', content);
        if (!content) {
            console.log('❌ Error: OpenAI did not return content');
            throw new Error('Failed to generate story breakdown');
        }
        const scenes = JSON.parse(content);
        console.log('✅ Story breakdown parsed successfully');
        return scenes;
    }
    catch (error) {
        console.error('❌ Error in generateStoryBreakdown:', error);
        throw error;
    }
}
async function generateVideoClip(description, duration, sceneIndex) {
    try {
        console.log(`🎬 Calling Runway SDK for scene ${sceneIndex}...`);
        console.log(`📝 Scene description: ${description}`);
        console.log(`⏱️  Scene duration: ${duration} seconds`);
        // Initialize Runway SDK
        const runway = new sdk_1.RunwayML({
            apiKey: process.env.RUNWAY_API_KEY,
        });
        console.log('📤 Runway SDK request parameters:');
        console.log('- Text-to-image model: gen4_image');
        console.log('- Image-to-video model: gen4_turbo');
        console.log('- Prompt:', description);
        console.log('- Duration:', duration, 'seconds');
        console.log('- Aspect ratio: 9:16 (vertical)');
        // Step 1: Generate an image from text using text-to-image API
        console.log('🎨 Generating image from text...');
        const imageGeneration = await runway.textToImage.create({
            model: 'gen4_image',
            promptText: description,
            ratio: '1080:1920', // Vertical format (9:16)
            seed: Math.floor(Math.random() * 1000000),
        });
        console.log('📡 Text-to-image generation started');
        console.log('🆔 Image Generation ID:', imageGeneration.id);
        // Wait for the image generation to complete
        console.log('⏳ Waiting for image generation to complete...');
        const imageResult = await imageGeneration.waitForTaskOutput();
        console.log('✅ Image generation completed');
        console.log('📄 Image result:', imageResult);
        if (!imageResult.output ||
            !imageResult.output.images ||
            imageResult.output.images.length === 0) {
            console.log('❌ Error: Runway SDK did not return an image');
            console.log('Full image result:', imageResult);
            throw new Error('Runway SDK did not return an image');
        }
        const imageUrl = imageResult.output.images[0].uri;
        console.log('🖼️ Generated image URL:', imageUrl);
        // Step 2: Generate video from the image using image-to-video API
        console.log('🎬 Generating video from image...');
        const videoGeneration = await runway.imageToVideo.create({
            model: 'gen4_turbo',
            promptImage: [
                {
                    position: 'first',
                    uri: imageUrl,
                },
            ],
            ratio: '720:1280', // Vertical format (9:16)
            duration: Math.min(duration, 10), // Runway supports max 10 seconds
            promptText: description,
            seed: Math.floor(Math.random() * 1000000),
        });
        console.log('📡 Image-to-video generation started');
        console.log('🆔 Video Generation ID:', videoGeneration.id);
        // Wait for the video generation to complete
        console.log('⏳ Waiting for video generation to complete...');
        const videoResult = await videoGeneration.waitForTaskOutput();
        console.log('✅ Video generation completed');
        console.log('📄 Video result:', videoResult);
        if (!videoResult.output || !videoResult.output.videoUrl) {
            console.log('❌ Error: Runway SDK did not return a video URL');
            console.log('Full video result:', videoResult);
            throw new Error('Runway SDK did not return a video URL');
        }
        const videoUrl = videoResult.output.videoUrl;
        console.log(`📥 Downloading video from: ${videoUrl}`);
        const videoBuffer = await downloadVideo(videoUrl);
        console.log(`✅ Downloaded video, size: ${videoBuffer.length} bytes`);
        const tempPath = path.join(os.tmpdir(), `scene-${sceneIndex}.mp4`);
        fs.writeFileSync(tempPath, videoBuffer);
        console.log(`💾 Saved video to: ${tempPath}`);
        return tempPath;
    }
    catch (error) {
        console.error(`❌ Error in generateVideoClip for scene ${sceneIndex}:`, error);
        if (error && typeof error === 'object' && 'message' in error) {
            console.error('Error message:', error.message);
            console.error('Error name:', error.name);
            console.error('Error stack:', error.stack);
        }
        throw error;
    }
}
async function generateNarration(scenes) {
    console.log('🎤 Generating narration from scenes...');
    try {
        const fullNarration = scenes.map((scene) => scene.narration).join(' ');
        console.log('📝 Full narration text:', fullNarration);
        const response = await openai.audio.speech.create({
            model: 'tts-1',
            voice: 'alloy',
            input: fullNarration,
        });
        const audioBuffer = Buffer.from(await response.arrayBuffer());
        console.log(`✅ Generated audio, size: ${audioBuffer.length} bytes`);
        const tempPath = path.join(os.tmpdir(), 'narration.mp3');
        fs.writeFileSync(tempPath, audioBuffer);
        console.log(`💾 Saved audio to: ${tempPath}`);
        return tempPath;
    }
    catch (error) {
        console.error('❌ Error in generateNarration:', error);
        throw error;
    }
}
async function combineVideoAndAudio(videoClips, audioPath, scenes) {
    console.log('🎬 Combining video and audio...');
    console.log('📹 Video clips:', videoClips);
    console.log('🎵 Audio path:', audioPath);
    // This is a simplified version. In production, you'd use FFmpeg to:
    // 1. Concatenate video clips
    // 2. Add audio track
    // 3. Add subtitles
    // 4. Export as 1080x1920 MP4
    // For demo purposes, we'll just return the first video clip
    // In production, implement proper video processing with FFmpeg
    console.log('✅ Using first video clip as final video (simplified)');
    return videoClips[0];
}
async function downloadVideo(url) {
    console.log(`📥 Downloading video from: ${url}`);
    try {
        const response = await axios_1.default.get(url, { responseType: 'arraybuffer' });
        console.log(`✅ Downloaded video, status: ${response.status}`);
        return Buffer.from(response.data);
    }
    catch (error) {
        console.error('❌ Error downloading video:', error);
        throw error;
    }
}
async function uploadToS3(filePath, key) {
    try {
        console.log(`📁 Reading file: ${filePath}`);
        const fileBuffer = fs.readFileSync(filePath);
        console.log(`📊 File size: ${fileBuffer.length} bytes`);
        console.log(`☁️ Uploading to S3: ${process.env.VIDEO_BUCKET_NAME}/${key}`);
        await s3.send(new client_s3_1.PutObjectCommand({
            Bucket: process.env.VIDEO_BUCKET_NAME,
            Key: key,
            Body: fileBuffer,
            ContentType: 'video/mp4',
        }));
        console.log('✅ Upload successful');
    }
    catch (error) {
        console.error('❌ Error uploading to S3:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxrREFJNEI7QUFDNUIsaUNBQTBCO0FBQzFCLG1DQUE0QjtBQUM1Qix1Q0FBeUM7QUFDekMseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3Qix5QkFBeUI7QUFFekIsTUFBTSxFQUFFLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUM1RCxNQUFNLE1BQU0sR0FBRyxJQUFJLGdCQUFNLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDO0FBZ0IzRCxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQzFCLEtBQTJCLEVBQ0ssRUFBRTtJQUNsQyxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixDQUFDLENBQUM7SUFDMUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVsRSxJQUFJLENBQUM7UUFDSCx1REFBdUQ7UUFDdkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDO1FBQy9DLE9BQU8sQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDbkQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDakUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUNqRSxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixFQUFFLENB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Q0gsQ0FBQztRQUNGLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMEJBQTBCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDakQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7XG4gIFMzQ2xpZW50LFxuICBQdXRPYmplY3RDb21tYW5kLFxuICBHZXRPYmplY3RDb21tYW5kLFxufSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IGF4aW9zIGZyb20gJ2F4aW9zJztcbmltcG9ydCBPcGVuQUkgZnJvbSAnb3BlbmFpJztcbmltcG9ydCB7IFJ1bndheU1MIH0gZnJvbSAnQHJ1bndheW1sL3Nkayc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuXG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB9KTtcbmNvbnN0IG9wZW5haSA9IG5ldyBPcGVuQUkoeyBhcGlLZXk6IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZIH0pO1xuXG5pbnRlcmZhY2UgVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCB7XG4gIHByb21wdDogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG4gIGR1cmF0aW9uOiBudW1iZXI7XG4gIHNjZW5lQ291bnQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIFNjZW5lIHtcbiAgZGVzY3JpcHRpb246IHN0cmluZztcbiAgZHVyYXRpb246IG51bWJlcjtcbiAgbmFycmF0aW9uOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQsXG4pOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygn8J+agCBMYW1iZGEgZnVuY3Rpb24gc3RhcnRlZCcpO1xuICBjb25zb2xlLmxvZygn8J+ThCBFdmVudCByZWNlaXZlZDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xuXG4gIHRyeSB7XG4gICAgLy8gTG9nIGVudmlyb25tZW50IHZhcmlhYmxlcyAod2l0aG91dCBzZW5zaXRpdmUgdmFsdWVzKVxuICAgIGNvbnNvbGUubG9nKCfwn5SNIEVudmlyb25tZW50IHZhcmlhYmxlcyBjaGVjazonKTtcbiAgICBjb25zb2xlLmxvZygnQVdTX1JFR0lPTjonLCBwcm9jZXNzLmVudi5BV1NfUkVHSU9OKTtcbiAgICBjb25zb2xlLmxvZygnVklERU9fQlVDS0VUX05BTUU6JywgcHJvY2Vzcy5lbnYuVklERU9fQlVDS0VUX05BTUUpO1xuICAgIGNvbnNvbGUubG9nKCdSVU5XQVlfQVBJX0tFWSBzZXQ6JywgISFwcm9jZXNzLmVudi5SVU5XQVlfQVBJX0tFWSk7XG4gICAgY29uc29sZS5sb2coJ09QRU5BSV9BUElfS0VZIHNldDonLCAhIXByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZKTtcblxuICAgIC8vIFZhbGlkYXRlIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgIGlmICghcHJvY2Vzcy5lbnYuUlVOV0FZX0FQSV9LRVkpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBSVU5XQVlfQVBJX0tFWSBpcyBub3Qgc2V0Jyk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdSVU5XQVlfQVBJX0tFWSBpcyBub3QgY29uZmlndXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGlmICghcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVkpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBPUEVOQUlfQVBJX0tFWSBpcyBub3Qgc2V0Jyk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdPUEVOQUlfQVBJX0tFWSBpcyBub3QgY29uZmlndXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGlmICghcHJvY2Vzcy5lbnYuVklERU9fQlVDS0VUX05BTUUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBWSURFT19CVUNLRVRfTkFNRSBpcyBub3Qgc2V0Jyk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdWSURFT19CVUNLRVRfTkFNRSBpcyBub3QgY29uZmlndXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKCfinIUgQWxsIGVudmlyb25tZW50IHZhcmlhYmxlcyBhcmUgc2V0Jyk7XG5cbiAgICBsZXQgcmVxdWVzdDogVmlkZW9HZW5lcmF0aW9uUmVxdWVzdDtcblxuICAgIC8vIEhhbmRsZSBkaWZmZXJlbnQgZXZlbnQgZm9ybWF0c1xuICAgIGlmIChldmVudC5ib2R5KSB7XG4gICAgICAvLyBBUEkgR2F0ZXdheSBmb3JtYXQgLSBib2R5IGlzIGEgSlNPTiBzdHJpbmdcbiAgICAgIGlmICh0eXBlb2YgZXZlbnQuYm9keSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmVxdWVzdCA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBEaXJlY3QgTGFtYmRhIGludm9jYXRpb24gLSBib2R5IGlzIGFscmVhZHkgYW4gb2JqZWN0XG4gICAgICAgIHJlcXVlc3QgPSBldmVudC5ib2R5IGFzIFZpZGVvR2VuZXJhdGlvblJlcXVlc3Q7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIERpcmVjdCBMYW1iZGEgaW52b2NhdGlvbiAtIHBheWxvYWQgaXMgdGhlIGVudGlyZSBldmVudFxuICAgICAgcmVxdWVzdCA9IGV2ZW50IGFzIGFueTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZygn4pyFIFJlcXVlc3QgcGFyc2VkOicsIHtcbiAgICAgIHByb21wdDogcmVxdWVzdC5wcm9tcHQ/LnN1YnN0cmluZygwLCA1MCkgKyAnLi4uJyxcbiAgICAgIHVzZXJJZDogcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXA6IHJlcXVlc3QudGltZXN0YW1wLFxuICAgIH0pO1xuICAgIGNvbnNvbGUubG9nKCfwn5SNIEZ1bGwgcmVxdWVzdCBvYmplY3Q6JywgcmVxdWVzdCk7XG5cbiAgICBpZiAoIXJlcXVlc3QucHJvbXB0KSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBQcm9tcHQgaXMgcmVxdWlyZWQnKTtcbiAgICAgIGNvbnNvbGUubG9nKCfwn5SNIFJlcXVlc3Qgb2JqZWN0IGtleXM6JywgT2JqZWN0LmtleXMocmVxdWVzdCkpO1xuICAgICAgY29uc29sZS5sb2coJ/CflI0gUmVxdWVzdCBwcm9tcHQgdmFsdWU6JywgcmVxdWVzdC5wcm9tcHQpO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUHJvbXB0IGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CfjqwgU3RhcnRpbmcgdmlkZW8gZ2VuZXJhdGlvbiBmb3IgcHJvbXB0OicsIHJlcXVlc3QucHJvbXB0KTtcbiAgICBjb25zb2xlLmxvZygn4o+x77iPICBWaWRlbyBkdXJhdGlvbjonLCByZXF1ZXN0LmR1cmF0aW9uLCAnc2Vjb25kcycpO1xuICAgIGNvbnNvbGUubG9nKCfwn46sIE51bWJlciBvZiBzY2VuZXM6JywgcmVxdWVzdC5zY2VuZUNvdW50KTtcblxuICAgIC8vIFN0ZXAgMTogR2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duIHVzaW5nIEdQVC00XG4gICAgY29uc29sZS5sb2coJ/Cfk5YgR2VuZXJhdGluZyBzdG9yeSBicmVha2Rvd24uLi4nKTtcbiAgICBsZXQgc2NlbmVzOyAvLyA9IGF3YWl0IGdlbmVyYXRlU3RvcnlCcmVha2Rvd24ocmVxdWVzdC5wcm9tcHQsIHJlcXVlc3Quc2NlbmVDb3VudCwgcmVxdWVzdC5kdXJhdGlvbik7XG4gICAgY29uc29sZS5sb2coJ+KchSBHZW5lcmF0ZWQgc2NlbmVzOicsIHNjZW5lcyk7XG5cbiAgICAvLyBHZW5lcmF0ZSBkeW5hbWljIHNjZW5lcyBiYXNlZCBvbiBwYXJhbWV0ZXJzXG4gICAgY29uc3Qgc2NlbmVEdXJhdGlvbiA9IE1hdGguZmxvb3IocmVxdWVzdC5kdXJhdGlvbiAvIHJlcXVlc3Quc2NlbmVDb3VudCk7XG4gICAgc2NlbmVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogcmVxdWVzdC5zY2VuZUNvdW50IH0sIChfLCBpbmRleCkgPT4gKHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICByZXF1ZXN0LnNjZW5lQ291bnQgPT09IDFcbiAgICAgICAgICA/IGBBIGJlYXV0aWZ1bCBtZWRpdGF0aW9uIHNjZW5lIHdpdGggb2NlYW4gd2F2ZXMgYW5kIHN1bnNldC4gVGhlIGNhbWVyYSBzaG93cyBkaWZmZXJlbnQgYW5nbGVzIG9mIHRoZSBwZWFjZWZ1bCBvY2VhbiBzZXR0aW5nIHRocm91Z2hvdXQgdGhlIGVudGlyZSBkdXJhdGlvbi5gXG4gICAgICAgICAgOiBgU2NlbmUgJHtcbiAgICAgICAgICAgICAgaW5kZXggKyAxXG4gICAgICAgICAgICB9OiBBIGJlYXV0aWZ1bCBtZWRpdGF0aW9uIHNjZW5lIHdpdGggb2NlYW4gd2F2ZXMgYW5kIHN1bnNldC4gVGhlIGNhbWVyYSBzaG93cyBkaWZmZXJlbnQgYW5nbGVzIG9mIHRoZSBwZWFjZWZ1bCBvY2VhbiBzZXR0aW5nLmAsXG4gICAgICBkdXJhdGlvbjogc2NlbmVEdXJhdGlvbixcbiAgICAgIG5hcnJhdGlvbjpcbiAgICAgICAgcmVxdWVzdC5zY2VuZUNvdW50ID09PSAxXG4gICAgICAgICAgPyBgVGFrZSBhIGRlZXAgYnJlYXRoIGFuZCBsZXQgdGhlIHBlYWNlZnVsIG9jZWFuIHdhdmVzIGd1aWRlIHlvdSB0byB0cmFucXVpbGl0eS4gRmVlbCB0aGUgcmh5dGhtIG9mIHRoZSB3YXZlcyBhbmQgdGhlIHdhcm10aCBvZiB0aGUgc2V0dGluZyBzdW4gYXMgeW91IGZpbmQgeW91ciBpbm5lciBwZWFjZS5gXG4gICAgICAgICAgOiBgVGhpcyBpcyBzY2VuZSAke1xuICAgICAgICAgICAgICBpbmRleCArIDFcbiAgICAgICAgICAgIH0gb2Ygb3VyIG1lZGl0YXRpb24gam91cm5leS4gVGFrZSBhIGRlZXAgYnJlYXRoIGFuZCBsZXQgdGhlIHBlYWNlZnVsIG9jZWFuIHdhdmVzIGd1aWRlIHlvdSB0byB0cmFucXVpbGl0eS5gLFxuICAgIH0pKTtcblxuICAgIGlmICghc2NlbmVzIHx8IHNjZW5lcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IEZhaWxlZCB0byBnZW5lcmF0ZSBzdG9yeSBicmVha2Rvd24nKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgIH1cblxuICAgIC8vIFN0ZXAgMjogR2VuZXJhdGUgdmlkZW8gY2xpcHMgZm9yIGVhY2ggc2NlbmVcbiAgICBjb25zb2xlLmxvZygn8J+OpSBHZW5lcmF0aW5nIHZpZGVvIGNsaXBzLi4uJyk7XG4gICAgY29uc3QgdmlkZW9DbGlwczogc3RyaW5nW10gPSBbXTtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjZW5lcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgc2NlbmUgPSBzY2VuZXNbaV07XG4gICAgICBjb25zb2xlLmxvZyhg8J+OrCBHZW5lcmF0aW5nIHZpZGVvIGZvciBzY2VuZSAke2kgKyAxfTpgLCBzY2VuZS5kZXNjcmlwdGlvbik7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHZpZGVvQ2xpcCA9IGF3YWl0IGdlbmVyYXRlVmlkZW9DbGlwKFxuICAgICAgICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgICAgICAgIHNjZW5lLmR1cmF0aW9uLFxuICAgICAgICAgIGksXG4gICAgICAgICk7XG4gICAgICAgIHZpZGVvQ2xpcHMucHVzaCh2aWRlb0NsaXApO1xuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIFNjZW5lICR7aSArIDF9IHZpZGVvIGdlbmVyYXRlZDpgLCB2aWRlb0NsaXApO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MIEZhaWxlZCB0byBnZW5lcmF0ZSB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX06YCwgZXJyb3IpO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYEZhaWxlZCB0byBnZW5lcmF0ZSB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX06ICR7ZXJyb3J9YCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodmlkZW9DbGlwcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIHZpZGVvIGNsaXBzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHZpZGVvIGNsaXBzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coYOKchSBHZW5lcmF0ZWQgJHt2aWRlb0NsaXBzLmxlbmd0aH0gdmlkZW8gY2xpcHNgKTtcblxuICAgIC8vIFN0ZXAgMzogR2VuZXJhdGUgbmFycmF0aW9uIGF1ZGlvXG4gICAgY29uc29sZS5sb2coJ/CfjqQgR2VuZXJhdGluZyBuYXJyYXRpb24gYXVkaW8uLi4nKTtcbiAgICBjb25zdCBuYXJyYXRpb25BdWRpbyA9IGF3YWl0IGdlbmVyYXRlTmFycmF0aW9uKHNjZW5lcyk7XG4gICAgY29uc29sZS5sb2coJ+KchSBHZW5lcmF0ZWQgbmFycmF0aW9uIGF1ZGlvOicsIG5hcnJhdGlvbkF1ZGlvKTtcblxuICAgIC8vIFN0ZXAgNDogQ29tYmluZSB2aWRlbyBjbGlwcyBhbmQgYXVkaW9cbiAgICBjb25zb2xlLmxvZygn8J+OrCBDb21iaW5pbmcgdmlkZW8gYW5kIGF1ZGlvLi4uJyk7XG4gICAgY29uc3QgZmluYWxWaWRlbyA9IGF3YWl0IGNvbWJpbmVWaWRlb0FuZEF1ZGlvKFxuICAgICAgdmlkZW9DbGlwcyxcbiAgICAgIG5hcnJhdGlvbkF1ZGlvLFxuICAgICAgc2NlbmVzLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coJ+KchSBGaW5hbCB2aWRlbyBnZW5lcmF0ZWQ6JywgZmluYWxWaWRlbyk7XG5cbiAgICBpZiAoIWZpbmFsVmlkZW8pIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IEZhaWxlZCB0byBjb21iaW5lIHZpZGVvIGFuZCBhdWRpbycpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gY29tYmluZSB2aWRlbyBhbmQgYXVkaW8nKTtcbiAgICB9XG5cbiAgICAvLyBTdGVwIDU6IFVwbG9hZCB0byBTM1xuICAgIGNvbnNvbGUubG9nKCfimIHvuI8gVXBsb2FkaW5nIHRvIFMzLi4uJyk7XG4gICAgY29uc3QgdmlkZW9LZXkgPSBgdmlkZW9zLyR7cmVxdWVzdC51c2VySWR9LyR7RGF0ZS5ub3coKX0vZmluYWwtdmlkZW8ubXA0YDtcbiAgICBhd2FpdCB1cGxvYWRUb1MzKGZpbmFsVmlkZW8sIHZpZGVvS2V5KTtcbiAgICBjb25zb2xlLmxvZygn4pyFIFVwbG9hZGVkIHRvIFMzOicsIHZpZGVvS2V5KTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46JIFZpZGVvIGdlbmVyYXRpb24gY29tcGxldGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHZpZGVvS2V5LFxuICAgICAgICBtZXNzYWdlOiAnVmlkZW8gZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICB9KSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ/CfkqUgRXJyb3IgaW4gdmlkZW8gZ2VuZXJhdGlvbjonLCBlcnJvcik7XG4gICAgY29uc29sZS5lcnJvcihcbiAgICAgICdFcnJvciBzdGFjazonLFxuICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLnN0YWNrIDogJ05vIHN0YWNrIHRyYWNlJyxcbiAgICApO1xuICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAnRXJyb3IgbWVzc2FnZTonLFxuICAgICAgZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGVycm9yOiAnRmFpbGVkIHRvIGdlbmVyYXRlIHZpZGVvJyxcbiAgICAgICAgZGV0YWlsczogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgICB9KSxcbiAgICB9O1xuICB9XG59O1xuXG5hc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duKFxuICBwcm9tcHQ6IHN0cmluZyxcbiAgc2NlbmVDb3VudDogbnVtYmVyLFxuICB0b3RhbER1cmF0aW9uOiBudW1iZXIsXG4pOiBQcm9taXNlPFNjZW5lW10+IHtcbiAgY29uc29sZS5sb2coJ/CfpJYgQ2FsbGluZyBPcGVuQUkgZm9yIHN0b3J5IGJyZWFrZG93bi4uLicpO1xuICBjb25zb2xlLmxvZyhcbiAgICBg8J+TiiBQYXJhbWV0ZXJzOiAke3NjZW5lQ291bnR9IHNjZW5lcywgJHt0b3RhbER1cmF0aW9ufSBzZWNvbmRzIHRvdGFsYCxcbiAgKTtcblxuICBjb25zdCBzY2VuZUR1cmF0aW9uID0gTWF0aC5mbG9vcih0b3RhbER1cmF0aW9uIC8gc2NlbmVDb3VudCk7XG4gIGNvbnNvbGUubG9nKGDij7HvuI8gIEVhY2ggc2NlbmUgd2lsbCBiZSAke3NjZW5lRHVyYXRpb259IHNlY29uZHMgbG9uZ2ApO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvcGVuYWkuY2hhdC5jb21wbGV0aW9ucy5jcmVhdGUoe1xuICAgICAgbW9kZWw6ICdncHQtNCcsXG4gICAgICBtZXNzYWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3N5c3RlbScsXG4gICAgICAgICAgY29udGVudDogYFlvdSBhcmUgYSB2aWRlbyBzY3JpcHQgd3JpdGVyLiBCcmVhayBkb3duIHRoZSBnaXZlbiBwcm9tcHQgaW50byAke3NjZW5lQ291bnR9IHNjZW5lcywgZWFjaCAke3NjZW5lRHVyYXRpb259IHNlY29uZHMgbG9uZywgZm9yIGEgJHt0b3RhbER1cmF0aW9ufS1zZWNvbmQgdmVydGljYWwgdmlkZW8uIFxuICAgICAgICAgIEVhY2ggc2NlbmUgc2hvdWxkIGhhdmUgYSBjbGVhciB2aXN1YWwgZGVzY3JpcHRpb24gYW5kIG5hcnJhdGlvbiB0ZXh0LiBSZXR1cm4gYXMgSlNPTiBhcnJheSB3aXRoIG9iamVjdHMgY29udGFpbmluZzpcbiAgICAgICAgICAtIGRlc2NyaXB0aW9uOiB2aXN1YWwgc2NlbmUgZGVzY3JpcHRpb24gZm9yIHZpZGVvIGdlbmVyYXRpb25cbiAgICAgICAgICAtIGR1cmF0aW9uOiAke3NjZW5lRHVyYXRpb259IChzZWNvbmRzKVxuICAgICAgICAgIC0gbmFycmF0aW9uOiB0ZXh0IHRvIGJlIHNwb2tlbiBpbiB0aGlzIHNjZW5lXG4gICAgICAgICAgXG4gICAgICAgICAgSWYgb25seSAxIHNjZW5lIGlzIHJlcXVlc3RlZCwgY3JlYXRlIGEgc2luZ2xlIGNvbXByZWhlbnNpdmUgc2NlbmUgdGhhdCBjb3ZlcnMgdGhlIGVudGlyZSBkdXJhdGlvbi5gLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgICAgIGNvbnRlbnQ6IHByb21wdCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0ZW1wZXJhdHVyZTogMC43LFxuICAgIH0pO1xuXG4gICAgY29uc3QgY29udGVudCA9IHJlc3BvbnNlLmNob2ljZXNbMF0/Lm1lc3NhZ2U/LmNvbnRlbnQ7XG4gICAgY29uc29sZS5sb2coJ/Cfk4QgT3BlbkFJIHJlc3BvbnNlIGNvbnRlbnQ6JywgY29udGVudCk7XG5cbiAgICBpZiAoIWNvbnRlbnQpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE9wZW5BSSBkaWQgbm90IHJldHVybiBjb250ZW50Jyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZW5lcmF0ZSBzdG9yeSBicmVha2Rvd24nKTtcbiAgICB9XG5cbiAgICBjb25zdCBzY2VuZXMgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuICAgIGNvbnNvbGUubG9nKCfinIUgU3RvcnkgYnJlYWtkb3duIHBhcnNlZCBzdWNjZXNzZnVsbHknKTtcbiAgICByZXR1cm4gc2NlbmVzO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBFcnJvciBpbiBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZW5lcmF0ZVZpZGVvQ2xpcChcbiAgZGVzY3JpcHRpb246IHN0cmluZyxcbiAgZHVyYXRpb246IG51bWJlcixcbiAgc2NlbmVJbmRleDogbnVtYmVyLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhg8J+OrCBDYWxsaW5nIFJ1bndheSBTREsgZm9yIHNjZW5lICR7c2NlbmVJbmRleH0uLi5gKTtcbiAgICBjb25zb2xlLmxvZyhg8J+TnSBTY2VuZSBkZXNjcmlwdGlvbjogJHtkZXNjcmlwdGlvbn1gKTtcbiAgICBjb25zb2xlLmxvZyhg4o+x77iPICBTY2VuZSBkdXJhdGlvbjogJHtkdXJhdGlvbn0gc2Vjb25kc2ApO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBSdW53YXkgU0RLXG4gICAgY29uc3QgcnVud2F5ID0gbmV3IFJ1bndheU1MKHtcbiAgICAgIGFwaUtleTogcHJvY2Vzcy5lbnYuUlVOV0FZX0FQSV9LRVkhLFxuICAgIH0pO1xuXG4gICAgY29uc29sZS5sb2coJ/Cfk6QgUnVud2F5IFNESyByZXF1ZXN0IHBhcmFtZXRlcnM6Jyk7XG4gICAgY29uc29sZS5sb2coJy0gVGV4dC10by1pbWFnZSBtb2RlbDogZ2VuNF9pbWFnZScpO1xuICAgIGNvbnNvbGUubG9nKCctIEltYWdlLXRvLXZpZGVvIG1vZGVsOiBnZW40X3R1cmJvJyk7XG4gICAgY29uc29sZS5sb2coJy0gUHJvbXB0OicsIGRlc2NyaXB0aW9uKTtcbiAgICBjb25zb2xlLmxvZygnLSBEdXJhdGlvbjonLCBkdXJhdGlvbiwgJ3NlY29uZHMnKTtcbiAgICBjb25zb2xlLmxvZygnLSBBc3BlY3QgcmF0aW86IDk6MTYgKHZlcnRpY2FsKScpO1xuXG4gICAgLy8gU3RlcCAxOiBHZW5lcmF0ZSBhbiBpbWFnZSBmcm9tIHRleHQgdXNpbmcgdGV4dC10by1pbWFnZSBBUElcbiAgICBjb25zb2xlLmxvZygn8J+OqCBHZW5lcmF0aW5nIGltYWdlIGZyb20gdGV4dC4uLicpO1xuICAgIGNvbnN0IGltYWdlR2VuZXJhdGlvbiA9IGF3YWl0IHJ1bndheS50ZXh0VG9JbWFnZS5jcmVhdGUoe1xuICAgICAgbW9kZWw6ICdnZW40X2ltYWdlJyxcbiAgICAgIHByb21wdFRleHQ6IGRlc2NyaXB0aW9uLFxuICAgICAgcmF0aW86ICcxMDgwOjE5MjAnLCAvLyBWZXJ0aWNhbCBmb3JtYXQgKDk6MTYpXG4gICAgICBzZWVkOiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMDAwKSxcbiAgICB9KTtcblxuICAgIGNvbnNvbGUubG9nKCfwn5OhIFRleHQtdG8taW1hZ2UgZ2VuZXJhdGlvbiBzdGFydGVkJyk7XG4gICAgY29uc29sZS5sb2coJ/CfhpQgSW1hZ2UgR2VuZXJhdGlvbiBJRDonLCBpbWFnZUdlbmVyYXRpb24uaWQpO1xuXG4gICAgLy8gV2FpdCBmb3IgdGhlIGltYWdlIGdlbmVyYXRpb24gdG8gY29tcGxldGVcbiAgICBjb25zb2xlLmxvZygn4o+zIFdhaXRpbmcgZm9yIGltYWdlIGdlbmVyYXRpb24gdG8gY29tcGxldGUuLi4nKTtcbiAgICBjb25zdCBpbWFnZVJlc3VsdCA9IGF3YWl0IChpbWFnZUdlbmVyYXRpb24gYXMgYW55KS53YWl0Rm9yVGFza091dHB1dCgpO1xuXG4gICAgY29uc29sZS5sb2coJ+KchSBJbWFnZSBnZW5lcmF0aW9uIGNvbXBsZXRlZCcpO1xuICAgIGNvbnNvbGUubG9nKCfwn5OEIEltYWdlIHJlc3VsdDonLCBpbWFnZVJlc3VsdCk7XG5cbiAgICBpZiAoXG4gICAgICAhaW1hZ2VSZXN1bHQub3V0cHV0IHx8XG4gICAgICAhaW1hZ2VSZXN1bHQub3V0cHV0LmltYWdlcyB8fFxuICAgICAgaW1hZ2VSZXN1bHQub3V0cHV0LmltYWdlcy5sZW5ndGggPT09IDBcbiAgICApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IFJ1bndheSBTREsgZGlkIG5vdCByZXR1cm4gYW4gaW1hZ2UnKTtcbiAgICAgIGNvbnNvbGUubG9nKCdGdWxsIGltYWdlIHJlc3VsdDonLCBpbWFnZVJlc3VsdCk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1J1bndheSBTREsgZGlkIG5vdCByZXR1cm4gYW4gaW1hZ2UnKTtcbiAgICB9XG5cbiAgICBjb25zdCBpbWFnZVVybCA9IGltYWdlUmVzdWx0Lm91dHB1dC5pbWFnZXNbMF0udXJpO1xuICAgIGNvbnNvbGUubG9nKCfwn5a877iPIEdlbmVyYXRlZCBpbWFnZSBVUkw6JywgaW1hZ2VVcmwpO1xuXG4gICAgLy8gU3RlcCAyOiBHZW5lcmF0ZSB2aWRlbyBmcm9tIHRoZSBpbWFnZSB1c2luZyBpbWFnZS10by12aWRlbyBBUElcbiAgICBjb25zb2xlLmxvZygn8J+OrCBHZW5lcmF0aW5nIHZpZGVvIGZyb20gaW1hZ2UuLi4nKTtcbiAgICBjb25zdCB2aWRlb0dlbmVyYXRpb24gPSBhd2FpdCBydW53YXkuaW1hZ2VUb1ZpZGVvLmNyZWF0ZSh7XG4gICAgICBtb2RlbDogJ2dlbjRfdHVyYm8nLFxuICAgICAgcHJvbXB0SW1hZ2U6IFtcbiAgICAgICAge1xuICAgICAgICAgIHBvc2l0aW9uOiAnZmlyc3QnLFxuICAgICAgICAgIHVyaTogaW1hZ2VVcmwsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgcmF0aW86ICc3MjA6MTI4MCcsIC8vIFZlcnRpY2FsIGZvcm1hdCAoOToxNilcbiAgICAgIGR1cmF0aW9uOiBNYXRoLm1pbihkdXJhdGlvbiwgMTApIGFzIDUgfCAxMCwgLy8gUnVud2F5IHN1cHBvcnRzIG1heCAxMCBzZWNvbmRzXG4gICAgICBwcm9tcHRUZXh0OiBkZXNjcmlwdGlvbixcbiAgICAgIHNlZWQ6IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwMDApLFxuICAgIH0pO1xuXG4gICAgY29uc29sZS5sb2coJ/Cfk6EgSW1hZ2UtdG8tdmlkZW8gZ2VuZXJhdGlvbiBzdGFydGVkJyk7XG4gICAgY29uc29sZS5sb2coJ/CfhpQgVmlkZW8gR2VuZXJhdGlvbiBJRDonLCB2aWRlb0dlbmVyYXRpb24uaWQpO1xuXG4gICAgLy8gV2FpdCBmb3IgdGhlIHZpZGVvIGdlbmVyYXRpb24gdG8gY29tcGxldGVcbiAgICBjb25zb2xlLmxvZygn4o+zIFdhaXRpbmcgZm9yIHZpZGVvIGdlbmVyYXRpb24gdG8gY29tcGxldGUuLi4nKTtcbiAgICBjb25zdCB2aWRlb1Jlc3VsdCA9IGF3YWl0ICh2aWRlb0dlbmVyYXRpb24gYXMgYW55KS53YWl0Rm9yVGFza091dHB1dCgpO1xuXG4gICAgY29uc29sZS5sb2coJ+KchSBWaWRlbyBnZW5lcmF0aW9uIGNvbXBsZXRlZCcpO1xuICAgIGNvbnNvbGUubG9nKCfwn5OEIFZpZGVvIHJlc3VsdDonLCB2aWRlb1Jlc3VsdCk7XG5cbiAgICBpZiAoIXZpZGVvUmVzdWx0Lm91dHB1dCB8fCAhdmlkZW9SZXN1bHQub3V0cHV0LnZpZGVvVXJsKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBSdW53YXkgU0RLIGRpZCBub3QgcmV0dXJuIGEgdmlkZW8gVVJMJyk7XG4gICAgICBjb25zb2xlLmxvZygnRnVsbCB2aWRlbyByZXN1bHQ6JywgdmlkZW9SZXN1bHQpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdSdW53YXkgU0RLIGRpZCBub3QgcmV0dXJuIGEgdmlkZW8gVVJMJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdmlkZW9VcmwgPSB2aWRlb1Jlc3VsdC5vdXRwdXQudmlkZW9Vcmw7XG4gICAgY29uc29sZS5sb2coYPCfk6UgRG93bmxvYWRpbmcgdmlkZW8gZnJvbTogJHt2aWRlb1VybH1gKTtcbiAgICBjb25zdCB2aWRlb0J1ZmZlciA9IGF3YWl0IGRvd25sb2FkVmlkZW8odmlkZW9VcmwpO1xuICAgIGNvbnNvbGUubG9nKGDinIUgRG93bmxvYWRlZCB2aWRlbywgc2l6ZTogJHt2aWRlb0J1ZmZlci5sZW5ndGh9IGJ5dGVzYCk7XG5cbiAgICBjb25zdCB0ZW1wUGF0aCA9IHBhdGguam9pbihvcy50bXBkaXIoKSwgYHNjZW5lLSR7c2NlbmVJbmRleH0ubXA0YCk7XG4gICAgZnMud3JpdGVGaWxlU3luYyh0ZW1wUGF0aCwgdmlkZW9CdWZmZXIpO1xuICAgIGNvbnNvbGUubG9nKGDwn5K+IFNhdmVkIHZpZGVvIHRvOiAke3RlbXBQYXRofWApO1xuXG4gICAgcmV0dXJuIHRlbXBQYXRoO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICBg4p2MIEVycm9yIGluIGdlbmVyYXRlVmlkZW9DbGlwIGZvciBzY2VuZSAke3NjZW5lSW5kZXh9OmAsXG4gICAgICBlcnJvcixcbiAgICApO1xuICAgIGlmIChlcnJvciAmJiB0eXBlb2YgZXJyb3IgPT09ICdvYmplY3QnICYmICdtZXNzYWdlJyBpbiBlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgbWVzc2FnZTonLCAoZXJyb3IgYXMgYW55KS5tZXNzYWdlKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIG5hbWU6JywgKGVycm9yIGFzIGFueSkubmFtZSk7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBzdGFjazonLCAoZXJyb3IgYXMgYW55KS5zdGFjayk7XG4gICAgfVxuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlTmFycmF0aW9uKHNjZW5lczogU2NlbmVbXSk6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnNvbGUubG9nKCfwn46kIEdlbmVyYXRpbmcgbmFycmF0aW9uIGZyb20gc2NlbmVzLi4uJyk7XG4gIHRyeSB7XG4gICAgY29uc3QgZnVsbE5hcnJhdGlvbiA9IHNjZW5lcy5tYXAoKHNjZW5lKSA9PiBzY2VuZS5uYXJyYXRpb24pLmpvaW4oJyAnKTtcbiAgICBjb25zb2xlLmxvZygn8J+TnSBGdWxsIG5hcnJhdGlvbiB0ZXh0OicsIGZ1bGxOYXJyYXRpb24pO1xuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBvcGVuYWkuYXVkaW8uc3BlZWNoLmNyZWF0ZSh7XG4gICAgICBtb2RlbDogJ3R0cy0xJyxcbiAgICAgIHZvaWNlOiAnYWxsb3knLFxuICAgICAgaW5wdXQ6IGZ1bGxOYXJyYXRpb24sXG4gICAgfSk7XG5cbiAgICBjb25zdCBhdWRpb0J1ZmZlciA9IEJ1ZmZlci5mcm9tKGF3YWl0IHJlc3BvbnNlLmFycmF5QnVmZmVyKCkpO1xuICAgIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkIGF1ZGlvLCBzaXplOiAke2F1ZGlvQnVmZmVyLmxlbmd0aH0gYnl0ZXNgKTtcblxuICAgIGNvbnN0IHRlbXBQYXRoID0gcGF0aC5qb2luKG9zLnRtcGRpcigpLCAnbmFycmF0aW9uLm1wMycpO1xuICAgIGZzLndyaXRlRmlsZVN5bmModGVtcFBhdGgsIGF1ZGlvQnVmZmVyKTtcbiAgICBjb25zb2xlLmxvZyhg8J+SviBTYXZlZCBhdWRpbyB0bzogJHt0ZW1wUGF0aH1gKTtcblxuICAgIHJldHVybiB0ZW1wUGF0aDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgaW4gZ2VuZXJhdGVOYXJyYXRpb246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNvbWJpbmVWaWRlb0FuZEF1ZGlvKFxuICB2aWRlb0NsaXBzOiBzdHJpbmdbXSxcbiAgYXVkaW9QYXRoOiBzdHJpbmcsXG4gIHNjZW5lczogU2NlbmVbXSxcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnNvbGUubG9nKCfwn46sIENvbWJpbmluZyB2aWRlbyBhbmQgYXVkaW8uLi4nKTtcbiAgY29uc29sZS5sb2coJ/Cfk7kgVmlkZW8gY2xpcHM6JywgdmlkZW9DbGlwcyk7XG4gIGNvbnNvbGUubG9nKCfwn461IEF1ZGlvIHBhdGg6JywgYXVkaW9QYXRoKTtcblxuICAvLyBUaGlzIGlzIGEgc2ltcGxpZmllZCB2ZXJzaW9uLiBJbiBwcm9kdWN0aW9uLCB5b3UnZCB1c2UgRkZtcGVnIHRvOlxuICAvLyAxLiBDb25jYXRlbmF0ZSB2aWRlbyBjbGlwc1xuICAvLyAyLiBBZGQgYXVkaW8gdHJhY2tcbiAgLy8gMy4gQWRkIHN1YnRpdGxlc1xuICAvLyA0LiBFeHBvcnQgYXMgMTA4MHgxOTIwIE1QNFxuXG4gIC8vIEZvciBkZW1vIHB1cnBvc2VzLCB3ZSdsbCBqdXN0IHJldHVybiB0aGUgZmlyc3QgdmlkZW8gY2xpcFxuICAvLyBJbiBwcm9kdWN0aW9uLCBpbXBsZW1lbnQgcHJvcGVyIHZpZGVvIHByb2Nlc3Npbmcgd2l0aCBGRm1wZWdcbiAgY29uc29sZS5sb2coJ+KchSBVc2luZyBmaXJzdCB2aWRlbyBjbGlwIGFzIGZpbmFsIHZpZGVvIChzaW1wbGlmaWVkKScpO1xuICByZXR1cm4gdmlkZW9DbGlwc1swXTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZG93bmxvYWRWaWRlbyh1cmw6IHN0cmluZyk6IFByb21pc2U8QnVmZmVyPiB7XG4gIGNvbnNvbGUubG9nKGDwn5OlIERvd25sb2FkaW5nIHZpZGVvIGZyb206ICR7dXJsfWApO1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgYXhpb3MuZ2V0KHVybCwgeyByZXNwb25zZVR5cGU6ICdhcnJheWJ1ZmZlcicgfSk7XG4gICAgY29uc29sZS5sb2coYOKchSBEb3dubG9hZGVkIHZpZGVvLCBzdGF0dXM6ICR7cmVzcG9uc2Uuc3RhdHVzfWApO1xuICAgIHJldHVybiBCdWZmZXIuZnJvbShyZXNwb25zZS5kYXRhKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgZG93bmxvYWRpbmcgdmlkZW86JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHVwbG9hZFRvUzMoZmlsZVBhdGg6IHN0cmluZywga2V5OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZyhg8J+TgSBSZWFkaW5nIGZpbGU6ICR7ZmlsZVBhdGh9YCk7XG4gICAgY29uc3QgZmlsZUJ1ZmZlciA9IGZzLnJlYWRGaWxlU3luYyhmaWxlUGF0aCk7XG4gICAgY29uc29sZS5sb2coYPCfk4ogRmlsZSBzaXplOiAke2ZpbGVCdWZmZXIubGVuZ3RofSBieXRlc2ApO1xuXG4gICAgY29uc29sZS5sb2coYOKYge+4jyBVcGxvYWRpbmcgdG8gUzM6ICR7cHJvY2Vzcy5lbnYuVklERU9fQlVDS0VUX05BTUV9LyR7a2V5fWApO1xuICAgIGF3YWl0IHMzLnNlbmQoXG4gICAgICBuZXcgUHV0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuVklERU9fQlVDS0VUX05BTUUsXG4gICAgICAgIEtleToga2V5LFxuICAgICAgICBCb2R5OiBmaWxlQnVmZmVyLFxuICAgICAgICBDb250ZW50VHlwZTogJ3ZpZGVvL21wNCcsXG4gICAgICB9KSxcbiAgICApO1xuICAgIGNvbnNvbGUubG9nKCfinIUgVXBsb2FkIHN1Y2Nlc3NmdWwnKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgdXBsb2FkaW5nIHRvIFMzOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19