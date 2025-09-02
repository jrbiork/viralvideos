"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVideoGeneration = processVideoGeneration;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const image_1 = require("./image");
const audio_1 = require("../utils/audio");
const subtitles_1 = require("../utils/subtitles");
const script_1 = require("../utils/script");
const script_2 = require("../utils/script");
const s3Uploader_1 = require("../utils/s3Uploader");
const audioUtils_1 = require("./util/audioUtils");
const imageUtils_1 = require("../utils/imageUtils");
const videoEffects_1 = require("../utils/videoEffects");
const videoCombiner_1 = require("./videoCombiner");
const manifestUtils_1 = require("../utils/manifestUtils");
const s3Uploader_2 = require("../utils/s3Uploader");
const broadcastProgress_1 = require("./broadcastProgress");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
async function processVideoGeneration(request, record) {
    try {
        console.log('processVideoGeneration:', request);
        // Use timestamp
        const timestamp = request.timestamp;
        const sceneDuration = Math.floor(request.totalDuration / request.sceneCount);
        let scenes = [];
        let voiceToneInstruction = '';
        // check if the video is already generated
        let manifest = await (0, manifestUtils_1.getManifest)(request.userId, request.timestamp);
        if (manifest) {
            console.log('🎥 Video already generated, skipping video generation');
            const manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
            await (0, broadcastProgress_1.broadcastProgress)('preview_completed', request.userId, request.timestamp, { manifest: manifestHydrated }, 'Video generated successfully');
            return {
                message: 'Video already generated',
                manifest: manifestHydrated,
            };
        }
        else {
            scenes = Array.from({ length: request.sceneCount }, (_, i) => ({
                id: i,
                description: '',
                duration: sceneDuration,
                narration: '',
            }));
            // Create manifest and upload to s3
            await (0, manifestUtils_1.createManifest)(request.userId, timestamp, scenes, request.totalDuration);
            manifest = await (0, manifestUtils_1.getManifest)(request.userId, request.timestamp);
        }
        // Check if there is already script generated in the s3 bucket for the timestamp
        const scriptKey = `${request.userId}/${timestamp}.script.txt`;
        const existingScript = await (0, s3Uploader_1.getObjectFromS3)(scriptKey);
        // Step 1: Generate script/story breakdown using GPT-4
        if (existingScript) {
            console.log('🎥 Script already generated for the timestamp, using existing script');
            scenes = (0, script_1.addSceneIds)(existingScript.scenes);
            voiceToneInstruction = existingScript.voiceToneInstruction;
        }
        else {
            console.log('🎥 No existing script found, generating new story breakdown');
            if (!request.prompt) {
                console.log('❌ Error: No prompt provided');
                throw new Error('No prompt provided');
            }
            const storyBreakdown = await (0, script_2.generateStoryBreakdown)(request.prompt, request.sceneCount, sceneDuration, request.totalDuration, request.userId, timestamp);
            scenes = storyBreakdown.scenes;
            voiceToneInstruction = storyBreakdown.voiceToneInstruction;
        }
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to get or generate story breakdown');
            throw new Error('Failed to get or generate story breakdown');
        }
        console.log('🎥 Manifest created and uploaded:');
        console.log('🎥 Story breakdown generated:', scenes);
        // Step 2: Generate images for each scene in parallel
        // Check if there are already images generated in the s3 bucket for the timestamp
        let imageUrls = await (0, imageUtils_1.getImageUrls)(request.userId, timestamp);
        if (imageUrls.length > 0) {
            console.log('🎥 Images already generated for the timestamp:', imageUrls);
        }
        else {
            const seed = Math.floor(Math.random() * 1000000);
            console.log('🎨 Generating images for each scene in parallel...');
            try {
                const imagePromises = scenes.map(async (scene, i) => {
                    console.log(`🎨 Generating image for scene ${i + 1}:`, scene.description);
                    const imageUrl = await (0, image_1.generateImage)(scene.description, i, request.userId, timestamp, seed, scene.id);
                    console.log(`✅ Scene ${i + 1} image generated:`, imageUrl);
                    return imageUrl;
                });
                // Wait for all images to be generated
                const generatedImageUrls = await Promise.all(imagePromises);
                if (generatedImageUrls.length === 0) {
                    console.log('❌ Error: No images were generated');
                    throw new Error('No images were generated');
                }
                // upload imageUrls to s3 using uploadImageToS3
                const uploadPromises = generatedImageUrls.map((imageUrl, i) => (0, s3Uploader_2.uploadImageToS3)(imageUrl, request.userId, timestamp, scenes[i].id));
                await Promise.all(uploadPromises);
                console.log('🖼️ Images uploaded to S3');
            }
            catch (error) {
                console.error('❌ Failed to generate images:', error);
            }
        }
        console.log('🖼️ Image URLs generated:', imageUrls);
        // check if all together if .mp3, .subtitle.json, .ass files are already exists in the s3 bucket and return boolean
        const audioCaptionFilesExist = await (0, audioUtils_1.checkAudioCaptionExists)(request.userId, timestamp);
        if (audioCaptionFilesExist) {
            console.log('🎥 Audio, subtitle, and ass files already generated for the timestamp:', audioCaptionFilesExist);
        }
        else {
            console.log('🎥 No existing audio, subtitle, and ass files found, generating new narration');
            // Step 3: Generate audio files with word-level timestamps
            const { subtitles } = await (0, audio_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction);
            // Step 4: Generate subtitle file
            await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, subtitles);
        }
        let manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
        await (0, broadcastProgress_1.broadcastProgress)('audio_subtitle_created', request.userId, timestamp, {
            manifest: manifestHydrated,
        }, 'Audio and Subtitles completed');
        // Step 4: Generate camera movements from image
        // check if there are already all the video effects generated in the s3 bucket for the timestamp
        await (0, videoEffects_1.getVideoEffectUrls)(request.userId, timestamp, scenes);
        console.log('🎬 Video effects URLs generated:');
        console.log('🎬 Manifest preview completed:', JSON.stringify(manifest, null, 2));
        manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
        await (0, broadcastProgress_1.broadcastProgress)('preview_completed', request.userId, timestamp, { manifest: manifestHydrated }, 'Video generated successfully');
        // Step 6: Combine video parts and upload to s3
        const finalVideoUrl = await (0, videoCombiner_1.combineVideoAndAudio)(request.userId, timestamp, scenes);
        console.log('🎬 Video combined completed', finalVideoUrl);
        // If this was triggered by SQS, delete the message from the queue
        if (record && process.env.VIDEO_QUEUE_URL) {
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
        }
        return {
            message: 'Video generated successfully',
        };
    }
    catch (error) {
        console.error('Error in video generation:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NWaWRlb0dlbmVyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFnQ0Esd0RBd09DO0FBdlFELG9EQUFzRTtBQUN0RSxtQ0FBd0M7QUFDeEMsMENBQW1EO0FBQ25ELGtEQUF1RDtBQUN2RCw0Q0FBOEM7QUFDOUMsNENBQWdFO0FBQ2hFLG9EQUFrRTtBQUNsRSxrREFBNEQ7QUFDNUQsb0RBQW1EO0FBQ25ELHdEQUEyRDtBQUMzRCxtREFBdUQ7QUFDdkQsMERBSWdDO0FBQ2hDLG9EQUFzRDtBQUN0RCwyREFBd0Q7QUFFeEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFZdEUsS0FBSyxVQUFVLHNCQUFzQixDQUMxQyxPQUErQixFQUMvQixNQUFrQjtJQUVsQixJQUFJLENBQUM7UUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRWhELGdCQUFnQjtRQUNoQixNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDO1FBRXBDLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQzlCLE9BQU8sQ0FBQyxhQUFhLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FDM0MsQ0FBQztRQUVGLElBQUksTUFBTSxHQUFZLEVBQUUsQ0FBQztRQUN6QixJQUFJLG9CQUFvQixHQUFXLEVBQUUsQ0FBQztRQUV0QywwQ0FBMEM7UUFDMUMsSUFBSSxRQUFRLEdBQUcsTUFBTSxJQUFBLDJCQUFXLEVBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7UUFFcEUsSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNiLE9BQU8sQ0FBQyxHQUFHLENBQUMsdURB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N0MsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZTtnQkFDckMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxhQUFhO2FBQ3BDLENBQUMsQ0FBQztZQUNILE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBRUQsT0FBTztZQUNMLE9BQU8sRUFBRSw4QkFBOEI7U0FDeEMsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNuRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU1FTUmVjb3JkIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBTUVNDbGllbnQsIERlbGV0ZU1lc3NhZ2VDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZUltYWdlIH0gZnJvbSAnLi9pbWFnZSc7XG5pbXBvcnQgeyBnZW5lcmF0ZU5hcnJhdGlvbiB9IGZyb20gJy4uL3V0aWxzL2F1ZGlvJztcbmltcG9ydCB7IGdlbmVyYXRlU3VidGl0bGVzIH0gZnJvbSAnLi4vdXRpbHMvc3VidGl0bGVzJztcbmltcG9ydCB7IGFkZFNjZW5lSWRzIH0gZnJvbSAnLi4vdXRpbHMvc2NyaXB0JztcbmltcG9ydCB7IGdlbmVyYXRlU3RvcnlCcmVha2Rvd24sIFNjZW5lIH0gZnJvbSAnLi4vdXRpbHMvc2NyaXB0JztcbmltcG9ydCB7IHVwbG9hZFRvUzMsIGdldE9iamVjdEZyb21TMyB9IGZyb20gJy4uL3V0aWxzL3MzVXBsb2FkZXInO1xuaW1wb3J0IHsgY2hlY2tBdWRpb0NhcHRpb25FeGlzdHMgfSBmcm9tICcuL3V0aWwvYXVkaW9VdGlscyc7XG5pbXBvcnQgeyBnZXRJbWFnZVVybHMgfSBmcm9tICcuLi91dGlscy9pbWFnZVV0aWxzJztcbmltcG9ydCB7IGdldFZpZGVvRWZmZWN0VXJscyB9IGZyb20gJy4uL3V0aWxzL3ZpZGVvRWZmZWN0cyc7XG5pbXBvcnQgeyBjb21iaW5lVmlkZW9BbmRBdWRpbyB9IGZyb20gJy4vdmlkZW9Db21iaW5lcic7XG5pbXBvcnQge1xuICBjcmVhdGVNYW5pZmVzdCxcbiAgZ2V0TWFuaWZlc3QsXG4gIGh5ZHJhdGVNYW5pZmVzdCxcbn0gZnJvbSAnLi4vdXRpbHMvbWFuaWZlc3RVdGlscyc7XG5pbXBvcnQgeyB1cGxvYWRJbWFnZVRvUzMgfSBmcm9tICcuLi91dGlscy9zM1VwbG9hZGVyJztcbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi9icm9hZGNhc3RQcm9ncmVzcyc7XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCB7XG4gIHR5cGU/OiAnZ2VuZXJhdGUtdmlkZW8nIHwgJ3NhdmUtaW1hZ2UnIHwgJ2FuaW1hdGUtaW1hZ2UnO1xuICBwcm9tcHQ/OiBzdHJpbmc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyO1xuICBzY2VuZUNvdW50OiBudW1iZXI7XG4gIHN0ZXA6IG51bWJlcjtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NWaWRlb0dlbmVyYXRpb24oXG4gIHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3QsXG4gIHJlY29yZD86IFNRU1JlY29yZCxcbik6IFByb21pc2U8YW55PiB7XG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ3Byb2Nlc3NWaWRlb0dlbmVyYXRpb246JywgcmVxdWVzdCk7XG5cbiAgICAvLyBVc2UgdGltZXN0YW1wXG4gICAgY29uc3QgdGltZXN0YW1wID0gcmVxdWVzdC50aW1lc3RhbXA7XG5cbiAgICBjb25zdCBzY2VuZUR1cmF0aW9uID0gTWF0aC5mbG9vcihcbiAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbiAvIHJlcXVlc3Quc2NlbmVDb3VudCxcbiAgICApO1xuXG4gICAgbGV0IHNjZW5lczogU2NlbmVbXSA9IFtdO1xuICAgIGxldCB2b2ljZVRvbmVJbnN0cnVjdGlvbjogc3RyaW5nID0gJyc7XG5cbiAgICAvLyBjaGVjayBpZiB0aGUgdmlkZW8gaXMgYWxyZWFkeSBnZW5lcmF0ZWRcbiAgICBsZXQgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdChyZXF1ZXN0LnVzZXJJZCwgcmVxdWVzdC50aW1lc3RhbXApO1xuXG4gICAgaWYgKG1hbmlmZXN0KSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+OpSBWaWRlbyBhbHJlYWR5IGdlbmVyYXRlZCwgc2tpcHBpbmcgdmlkZW8gZ2VuZXJhdGlvbicpO1xuICAgICAgY29uc3QgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG4gICAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICAgJ3ByZXZpZXdfY29tcGxldGVkJyxcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHJlcXVlc3QudGltZXN0YW1wLFxuICAgICAgICB7IG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkIH0sXG4gICAgICAgICdWaWRlbyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBtZXNzYWdlOiAnVmlkZW8gYWxyZWFkeSBnZW5lcmF0ZWQnLFxuICAgICAgICBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHNjZW5lcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IHJlcXVlc3Quc2NlbmVDb3VudCB9LCAoXywgaSkgPT4gKHtcbiAgICAgICAgaWQ6IGksXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnJyxcbiAgICAgICAgZHVyYXRpb246IHNjZW5lRHVyYXRpb24sXG4gICAgICAgIG5hcnJhdGlvbjogJycsXG4gICAgICB9KSk7XG5cbiAgICAgIC8vIENyZWF0ZSBtYW5pZmVzdCBhbmQgdXBsb2FkIHRvIHMzXG4gICAgICBhd2FpdCBjcmVhdGVNYW5pZmVzdChcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgc2NlbmVzLFxuICAgICAgICByZXF1ZXN0LnRvdGFsRHVyYXRpb24sXG4gICAgICApO1xuXG4gICAgICBtYW5pZmVzdCA9IGF3YWl0IGdldE1hbmlmZXN0KHJlcXVlc3QudXNlcklkLCByZXF1ZXN0LnRpbWVzdGFtcCk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgdGhlcmUgaXMgYWxyZWFkeSBzY3JpcHQgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBjb25zdCBzY3JpcHRLZXkgPSBgJHtyZXF1ZXN0LnVzZXJJZH0vJHt0aW1lc3RhbXB9LnNjcmlwdC50eHRgO1xuICAgIGNvbnN0IGV4aXN0aW5nU2NyaXB0ID0gYXdhaXQgZ2V0T2JqZWN0RnJvbVMzKHNjcmlwdEtleSk7XG5cbiAgICAvLyBTdGVwIDE6IEdlbmVyYXRlIHNjcmlwdC9zdG9yeSBicmVha2Rvd24gdXNpbmcgR1BULTRcbiAgICBpZiAoZXhpc3RpbmdTY3JpcHQpIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBTY3JpcHQgYWxyZWFkeSBnZW5lcmF0ZWQgZm9yIHRoZSB0aW1lc3RhbXAsIHVzaW5nIGV4aXN0aW5nIHNjcmlwdCcsXG4gICAgICApO1xuICAgICAgc2NlbmVzID0gYWRkU2NlbmVJZHMoZXhpc3RpbmdTY3JpcHQuc2NlbmVzKTtcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uID0gZXhpc3RpbmdTY3JpcHQudm9pY2VUb25lSW5zdHJ1Y3Rpb247XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBObyBleGlzdGluZyBzY3JpcHQgZm91bmQsIGdlbmVyYXRpbmcgbmV3IHN0b3J5IGJyZWFrZG93bicsXG4gICAgICApO1xuXG4gICAgICBpZiAoIXJlcXVlc3QucHJvbXB0KSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIHByb21wdCBwcm92aWRlZCcpO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHByb21wdCBwcm92aWRlZCcpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzdG9yeUJyZWFrZG93biA9IGF3YWl0IGdlbmVyYXRlU3RvcnlCcmVha2Rvd24oXG4gICAgICAgIHJlcXVlc3QucHJvbXB0ISxcbiAgICAgICAgcmVxdWVzdC5zY2VuZUNvdW50LFxuICAgICAgICBzY2VuZUR1cmF0aW9uLFxuICAgICAgICByZXF1ZXN0LnRvdGFsRHVyYXRpb24sXG4gICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICApO1xuICAgICAgc2NlbmVzID0gc3RvcnlCcmVha2Rvd24uc2NlbmVzO1xuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPSBzdG9yeUJyZWFrZG93bi52b2ljZVRvbmVJbnN0cnVjdGlvbjtcbiAgICB9XG5cbiAgICBpZiAoIXNjZW5lcyB8fCBzY2VuZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBGYWlsZWQgdG8gZ2V0IG9yIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2V0IG9yIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKCfwn46lIE1hbmlmZXN0IGNyZWF0ZWQgYW5kIHVwbG9hZGVkOicpO1xuXG4gICAgY29uc29sZS5sb2coJ/CfjqUgU3RvcnkgYnJlYWtkb3duIGdlbmVyYXRlZDonLCBzY2VuZXMpO1xuXG4gICAgLy8gU3RlcCAyOiBHZW5lcmF0ZSBpbWFnZXMgZm9yIGVhY2ggc2NlbmUgaW4gcGFyYWxsZWxcbiAgICAvLyBDaGVjayBpZiB0aGVyZSBhcmUgYWxyZWFkeSBpbWFnZXMgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBsZXQgaW1hZ2VVcmxzID0gYXdhaXQgZ2V0SW1hZ2VVcmxzKHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXApO1xuXG4gICAgaWYgKGltYWdlVXJscy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+OpSBJbWFnZXMgYWxyZWFkeSBnZW5lcmF0ZWQgZm9yIHRoZSB0aW1lc3RhbXA6JywgaW1hZ2VVcmxzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3Qgc2VlZCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwMDApO1xuXG4gICAgICBjb25zb2xlLmxvZygn8J+OqCBHZW5lcmF0aW5nIGltYWdlcyBmb3IgZWFjaCBzY2VuZSBpbiBwYXJhbGxlbC4uLicpO1xuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gc2NlbmVzLm1hcChhc3luYyAoc2NlbmU6IGFueSwgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBg8J+OqCBHZW5lcmF0aW5nIGltYWdlIGZvciBzY2VuZSAke2kgKyAxfTpgLFxuICAgICAgICAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnN0IGltYWdlVXJsID0gYXdhaXQgZ2VuZXJhdGVJbWFnZShcbiAgICAgICAgICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgaSxcbiAgICAgICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICAgICAgc2VlZCxcbiAgICAgICAgICAgIHNjZW5lLmlkLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pyFIFNjZW5lICR7aSArIDF9IGltYWdlIGdlbmVyYXRlZDpgLCBpbWFnZVVybCk7XG4gICAgICAgICAgcmV0dXJuIGltYWdlVXJsO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBXYWl0IGZvciBhbGwgaW1hZ2VzIHRvIGJlIGdlbmVyYXRlZFxuICAgICAgICBjb25zdCBnZW5lcmF0ZWRJbWFnZVVybHMgPSBhd2FpdCBQcm9taXNlLmFsbChpbWFnZVByb21pc2VzKTtcblxuICAgICAgICBpZiAoZ2VuZXJhdGVkSW1hZ2VVcmxzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIGltYWdlcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gaW1hZ2VzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB1cGxvYWQgaW1hZ2VVcmxzIHRvIHMzIHVzaW5nIHVwbG9hZEltYWdlVG9TM1xuICAgICAgICBjb25zdCB1cGxvYWRQcm9taXNlcyA9IGdlbmVyYXRlZEltYWdlVXJscy5tYXAoKGltYWdlVXJsLCBpKSA9PlxuICAgICAgICAgIHVwbG9hZEltYWdlVG9TMyhpbWFnZVVybCwgcmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCwgc2NlbmVzW2ldLmlkKSxcbiAgICAgICAgKTtcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwodXBsb2FkUHJvbWlzZXMpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5a877iPIEltYWdlcyB1cGxvYWRlZCB0byBTMycpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEZhaWxlZCB0byBnZW5lcmF0ZSBpbWFnZXM6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKCfwn5a877iPIEltYWdlIFVSTHMgZ2VuZXJhdGVkOicsIGltYWdlVXJscyk7XG5cbiAgICAvLyBjaGVjayBpZiBhbGwgdG9nZXRoZXIgaWYgLm1wMywgLnN1YnRpdGxlLmpzb24sIC5hc3MgZmlsZXMgYXJlIGFscmVhZHkgZXhpc3RzIGluIHRoZSBzMyBidWNrZXQgYW5kIHJldHVybiBib29sZWFuXG4gICAgY29uc3QgYXVkaW9DYXB0aW9uRmlsZXNFeGlzdCA9IGF3YWl0IGNoZWNrQXVkaW9DYXB0aW9uRXhpc3RzKFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgKTtcbiAgICBpZiAoYXVkaW9DYXB0aW9uRmlsZXNFeGlzdCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIEF1ZGlvLCBzdWJ0aXRsZSwgYW5kIGFzcyBmaWxlcyBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcDonLFxuICAgICAgICBhdWRpb0NhcHRpb25GaWxlc0V4aXN0LFxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIE5vIGV4aXN0aW5nIGF1ZGlvLCBzdWJ0aXRsZSwgYW5kIGFzcyBmaWxlcyBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgbmFycmF0aW9uJyxcbiAgICAgICk7XG5cbiAgICAgIC8vIFN0ZXAgMzogR2VuZXJhdGUgYXVkaW8gZmlsZXMgd2l0aCB3b3JkLWxldmVsIHRpbWVzdGFtcHNcbiAgICAgIGNvbnN0IHsgc3VidGl0bGVzIH0gPSBhd2FpdCBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgICAgICAgc2NlbmVzLFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbixcbiAgICAgICk7XG5cbiAgICAgIC8vIFN0ZXAgNDogR2VuZXJhdGUgc3VidGl0bGUgZmlsZVxuICAgICAgYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZXMoc2NlbmVzLCByZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCBzdWJ0aXRsZXMpO1xuICAgIH1cblxuICAgIGxldCBtYW5pZmVzdEh5ZHJhdGVkID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgJ2F1ZGlvX3N1YnRpdGxlX2NyZWF0ZWQnLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICB7XG4gICAgICAgIG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkLFxuICAgICAgfSxcbiAgICAgICdBdWRpbyBhbmQgU3VidGl0bGVzIGNvbXBsZXRlZCcsXG4gICAgKTtcblxuICAgIC8vIFN0ZXAgNDogR2VuZXJhdGUgY2FtZXJhIG1vdmVtZW50cyBmcm9tIGltYWdlXG4gICAgLy8gY2hlY2sgaWYgdGhlcmUgYXJlIGFscmVhZHkgYWxsIHRoZSB2aWRlbyBlZmZlY3RzIGdlbmVyYXRlZCBpbiB0aGUgczMgYnVja2V0IGZvciB0aGUgdGltZXN0YW1wXG4gICAgYXdhaXQgZ2V0VmlkZW9FZmZlY3RVcmxzKHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXAsIHNjZW5lcyk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OrCBWaWRlbyBlZmZlY3RzIFVSTHMgZ2VuZXJhdGVkOicpO1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgJ/CfjqwgTWFuaWZlc3QgcHJldmlldyBjb21wbGV0ZWQ6JyxcbiAgICAgIEpTT04uc3RyaW5naWZ5KG1hbmlmZXN0LCBudWxsLCAyKSxcbiAgICApO1xuXG4gICAgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICdwcmV2aWV3X2NvbXBsZXRlZCcsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHsgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQgfSxcbiAgICAgICdWaWRlbyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICApO1xuXG4gICAgLy8gU3RlcCA2OiBDb21iaW5lIHZpZGVvIHBhcnRzIGFuZCB1cGxvYWQgdG8gczNcbiAgICBjb25zdCBmaW5hbFZpZGVvVXJsID0gYXdhaXQgY29tYmluZVZpZGVvQW5kQXVkaW8oXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHNjZW5lcyxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/CfjqwgVmlkZW8gY29tYmluZWQgY29tcGxldGVkJywgZmluYWxWaWRlb1VybCk7XG5cbiAgICAvLyBJZiB0aGlzIHdhcyB0cmlnZ2VyZWQgYnkgU1FTLCBkZWxldGUgdGhlIG1lc3NhZ2UgZnJvbSB0aGUgcXVldWVcbiAgICBpZiAocmVjb3JkICYmIHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCkge1xuICAgICAgY29uc3QgZGVsZXRlQ29tbWFuZCA9IG5ldyBEZWxldGVNZXNzYWdlQ29tbWFuZCh7XG4gICAgICAgIFF1ZXVlVXJsOiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwsXG4gICAgICAgIFJlY2VpcHRIYW5kbGU6IHJlY29yZC5yZWNlaXB0SGFuZGxlLFxuICAgICAgfSk7XG4gICAgICBhd2FpdCBzcXMuc2VuZChkZWxldGVDb21tYW5kKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgbWVzc2FnZTogJ1ZpZGVvIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gdmlkZW8gZ2VuZXJhdGlvbjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==