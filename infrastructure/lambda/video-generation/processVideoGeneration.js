"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVideoGeneration = processVideoGeneration;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const audio_1 = require("../utils/audio");
const subtitles_1 = require("../utils/subtitles");
const script_1 = require("../utils/script");
const script_2 = require("../utils/script");
const s3Uploader_1 = require("../utils/s3Uploader");
const audioUtils_1 = require("./util/audioUtils");
const imageUtils_1 = require("../utils/imageUtils");
const imageNanoBanana_1 = require("../utils/imageNanoBanana");
// Constants
const DEFAULT_VOICE = 'ash';
const DEFAULT_LANGUAGE = 'en';
const videoEffects_1 = require("../utils/videoEffects");
const manifestUtils_1 = require("../utils/manifestUtils");
const broadcastProgress_1 = require("./broadcastProgress");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
async function processVideoGeneration(request, record) {
    try {
        console.log('processVideoGeneration:', request);
        console.log('request.voice:', request.voice);
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
                    const result = await (0, imageNanoBanana_1.generateNanoBananaImage)(scene.description, scene.id, request.userId, timestamp, seed);
                    console.log(`✅ Scene ${i + 1} image generated: done`);
                    return result;
                });
                // Wait for all images to be generated using allSettled for better error handling
                console.log('⏳ Waiting for all image generation to complete...');
                const results = await Promise.allSettled(imagePromises);
                // Log results and handle failures
                const successful = results.filter((result) => result.status === 'fulfilled');
                const failed = results.filter((result) => result.status === 'rejected');
                console.log(`✅ Image generation results: ${successful.length} successful, ${failed.length} failed`);
                // Log failed promises with detailed error info
                failed.forEach((result, index) => {
                    if (result.status === 'rejected') {
                        console.error(`❌ Scene ${index} image generation failed:`, result.reason);
                    }
                });
                // Continue processing even if some images failed
                if (successful.length === 0) {
                    throw new Error('All image generation attempts failed');
                }
                console.log(`🎨 Successfully generated ${successful.length} out of ${results.length} images`);
                // if (generatedImageUrls.length === 0) {
                //   console.log('❌ Error: No images were generated');
                //   throw new Error('No images were generated');
                // }
                // // upload imageUrls to s3 using uploadImageToS3
                // const uploadPromises = generatedImageUrls.map((imageUrl, i) =>
                //   uploadImageToS3(imageUrl, request.userId, timestamp, scenes[i].id),
                // );
                // await Promise.all(imagePromises);
                console.log('🖼️ Images uploaded to S3');
            }
            catch (error) {
                console.error('❌ Failed to generate images:', error);
            }
        }
        // check if all together if .mp3, .subtitle.json, .ass files are already exists in the s3 bucket and return boolean
        const audioCaptionFilesExist = await (0, audioUtils_1.checkAudioCaptionExists)(request.userId, timestamp);
        if (audioCaptionFilesExist) {
            console.log('🎥 Audio, subtitle, and ass files already generated for the timestamp:', audioCaptionFilesExist);
        }
        else {
            console.log('🎥 No existing audio, subtitle, and ass files found, generating new narration');
            // Step 3: Generate audio files with word-level timestamps
            const { subtitles } = await (0, audio_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction, request.voice || DEFAULT_VOICE, request.language || DEFAULT_LANGUAGE);
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
        // If this was triggered by SQS, delete the message from the queue
        if (record && process.env.VIDEO_QUEUE_URL) {
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
        }
        return {
            message: 'Preview generated successfully',
        };
    }
    catch (error) {
        console.error('Error in video generation:', error);
        throw error;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NWaWRlb0dlbmVyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUF1Q0Esd0RBOFBDO0FBcFNELG9EQUFzRTtBQUV0RSwwQ0FBbUQ7QUFDbkQsa0RBQXVEO0FBQ3ZELDRDQUE4QztBQUM5Qyw0Q0FBZ0U7QUFDaEUsb0RBQWtFO0FBQ2xFLGtEQUE0RDtBQUM1RCxvREFBbUQ7QUFDbkQsOERBQW1FO0FBRW5FLFlBQVk7QUFDWixNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUM7QUFDNUIsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7QUFDOUIsd0RBQTJEO0FBRTNELDBEQUlnQztBQUVoQywyREFBd0Q7QUFFeEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFjdEUsS0FBSyxVQUFVLHNCQUFzQixDQUMxQyxPQUErQixFQUMvQixNQUFrQjtJQUVsQixJQUFJLENBQUM7UUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRWhELE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTdDLGdCQUFnQjtRQUNoQixNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDO1FBRXBDLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQzlCLE9BQU8sQ0FBQyxhQUFhLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FDM0MsQ0FBQztRQUVGLElBQUksTUFBTSxHQUFZLEVBQUUsQ0FBQztRQUN6QixJQUFJLG9CQUFvQixHQUFXLEVBQUUsQ0FBQztRQUV0QywwQ0FBMEM7UUFDMUMsSUFBSSxRQUFRLEdBQUcsTUFBTSxJQUFB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LEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFNUQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQ2hELE9BQU8sQ0FBQyxHQUFHLENBQ1QsZ0NBQWdDLEVBQ2hDLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FDbEMsQ0FBQztRQUVGLGdCQUFnQixHQUFHLE1BQU0sSUFBQSwrQkFBZSxFQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRW5ELE1BQU0sSUFBQSxxQ0FBaUIsRUFDckIsbUJBQW1CLEVBQ25CLE9BQU8sQ0FBQyxNQUFNLEVBQ2QsU0FBUyxFQUNULEVBQUUsUUFBUSxFQUFFLGdCQUFnQixFQUFFLEVBQzlCLDhCQUE4QixDQUMvQixDQUFDO1FBRUYsa0VBQWtFO1FBQ2xFLElBQUksTUFBTSxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDMUMsTUFBTSxhQUFhLEdBQUcsSUFBSSxpQ0FBb0IsQ0FBQztnQkFDN0MsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZTtnQkFDckMsYUFBYSxFQUFFLE1BQU0sQ0FBQyxhQUFhO2FBQ3BDLENBQUMsQ0FBQztZQUNILE1BQU0sR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBRUQsT0FBTztZQUNMLE9BQU8sRUFBRSxnQ0FBZ0M7U0FDMUMsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNuRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU1FTUmVjb3JkIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBTUVNDbGllbnQsIERlbGV0ZU1lc3NhZ2VDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZUltYWdlIH0gZnJvbSAnLi4vdXRpbHMvaW1hZ2UnO1xuaW1wb3J0IHsgZ2VuZXJhdGVOYXJyYXRpb24gfSBmcm9tICcuLi91dGlscy9hdWRpbyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVN1YnRpdGxlcyB9IGZyb20gJy4uL3V0aWxzL3N1YnRpdGxlcyc7XG5pbXBvcnQgeyBhZGRTY2VuZUlkcyB9IGZyb20gJy4uL3V0aWxzL3NjcmlwdCc7XG5pbXBvcnQgeyBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duLCBTY2VuZSB9IGZyb20gJy4uL3V0aWxzL3NjcmlwdCc7XG5pbXBvcnQgeyB1cGxvYWRUb1MzLCBnZXRPYmplY3RGcm9tUzMgfSBmcm9tICcuLi91dGlscy9zM1VwbG9hZGVyJztcbmltcG9ydCB7IGNoZWNrQXVkaW9DYXB0aW9uRXhpc3RzIH0gZnJvbSAnLi91dGlsL2F1ZGlvVXRpbHMnO1xuaW1wb3J0IHsgZ2V0SW1hZ2VVcmxzIH0gZnJvbSAnLi4vdXRpbHMvaW1hZ2VVdGlscyc7XG5pbXBvcnQgeyBnZW5lcmF0ZU5hbm9CYW5hbmFJbWFnZSB9IGZyb20gJy4uL3V0aWxzL2ltYWdlTmFub0JhbmFuYSc7XG5cbi8vIENvbnN0YW50c1xuY29uc3QgREVGQVVMVF9WT0lDRSA9ICdhc2gnO1xuY29uc3QgREVGQVVMVF9MQU5HVUFHRSA9ICdlbic7XG5pbXBvcnQgeyBnZXRWaWRlb0VmZmVjdFVybHMgfSBmcm9tICcuLi91dGlscy92aWRlb0VmZmVjdHMnO1xuaW1wb3J0IHsgY29tYmluZVZpZGVvQW5kQXVkaW8gfSBmcm9tICcuL3ZpZGVvQ29tYmluZXInO1xuaW1wb3J0IHtcbiAgY3JlYXRlTWFuaWZlc3QsXG4gIGdldE1hbmlmZXN0LFxuICBoeWRyYXRlTWFuaWZlc3QsXG59IGZyb20gJy4uL3V0aWxzL21hbmlmZXN0VXRpbHMnO1xuaW1wb3J0IHsgdXBsb2FkSW1hZ2VUb1MzIH0gZnJvbSAnLi4vdXRpbHMvczNVcGxvYWRlcic7XG5pbXBvcnQgeyBicm9hZGNhc3RQcm9ncmVzcyB9IGZyb20gJy4vYnJvYWRjYXN0UHJvZ3Jlc3MnO1xuXG5jb25zdCBzcXMgPSBuZXcgU1FTQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZpZGVvR2VuZXJhdGlvblJlcXVlc3Qge1xuICB0eXBlPzogJ2dlbmVyYXRlLXZpZGVvJyB8ICdzYXZlLWltYWdlJyB8ICdhbmltYXRlLWltYWdlJyB8ICdjb21iaW5lLXZpZGVvJztcbiAgcHJvbXB0Pzogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG4gIHRvdGFsRHVyYXRpb246IG51bWJlcjtcbiAgc2NlbmVDb3VudDogbnVtYmVyO1xuICBzdGVwOiBudW1iZXI7XG4gIHZvaWNlPzogc3RyaW5nO1xuICBsYW5ndWFnZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NWaWRlb0dlbmVyYXRpb24oXG4gIHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3QsXG4gIHJlY29yZD86IFNRU1JlY29yZCxcbik6IFByb21pc2U8YW55PiB7XG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ3Byb2Nlc3NWaWRlb0dlbmVyYXRpb246JywgcmVxdWVzdCk7XG5cbiAgICBjb25zb2xlLmxvZygncmVxdWVzdC52b2ljZTonLCByZXF1ZXN0LnZvaWNlKTtcblxuICAgIC8vIFVzZSB0aW1lc3RhbXBcbiAgICBjb25zdCB0aW1lc3RhbXAgPSByZXF1ZXN0LnRpbWVzdGFtcDtcblxuICAgIGNvbnN0IHNjZW5lRHVyYXRpb24gPSBNYXRoLmZsb29yKFxuICAgICAgcmVxdWVzdC50b3RhbER1cmF0aW9uIC8gcmVxdWVzdC5zY2VuZUNvdW50LFxuICAgICk7XG5cbiAgICBsZXQgc2NlbmVzOiBTY2VuZVtdID0gW107XG4gICAgbGV0IHZvaWNlVG9uZUluc3RydWN0aW9uOiBzdHJpbmcgPSAnJztcblxuICAgIC8vIGNoZWNrIGlmIHRoZSB2aWRlbyBpcyBhbHJlYWR5IGdlbmVyYXRlZFxuICAgIGxldCBtYW5pZmVzdCA9IGF3YWl0IGdldE1hbmlmZXN0KHJlcXVlc3QudXNlcklkLCByZXF1ZXN0LnRpbWVzdGFtcCk7XG5cbiAgICBpZiAobWFuaWZlc3QpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn46lIFZpZGVvIGFscmVhZHkgZ2VuZXJhdGVkLCBza2lwcGluZyB2aWRlbyBnZW5lcmF0aW9uJyk7XG4gICAgICBjb25zdCBtYW5pZmVzdEh5ZHJhdGVkID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcbiAgICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgICAncHJldmlld19jb21wbGV0ZWQnLFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgcmVxdWVzdC50aW1lc3RhbXAsXG4gICAgICAgIHsgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQgfSxcbiAgICAgICAgJ1ZpZGVvIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG1lc3NhZ2U6ICdWaWRlbyBhbHJlYWR5IGdlbmVyYXRlZCcsXG4gICAgICAgIG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkLFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2NlbmVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogcmVxdWVzdC5zY2VuZUNvdW50IH0sIChfLCBpKSA9PiAoe1xuICAgICAgICBpZDogaSxcbiAgICAgICAgZGVzY3JpcHRpb246ICcnLFxuICAgICAgICBkdXJhdGlvbjogc2NlbmVEdXJhdGlvbixcbiAgICAgICAgbmFycmF0aW9uOiAnJyxcbiAgICAgIH0pKTtcblxuICAgICAgLy8gQ3JlYXRlIG1hbmlmZXN0IGFuZCB1cGxvYWQgdG8gczNcbiAgICAgIGF3YWl0IGNyZWF0ZU1hbmlmZXN0KFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICBzY2VuZXMsXG4gICAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbixcbiAgICAgICk7XG5cbiAgICAgIG1hbmlmZXN0ID0gYXdhaXQgZ2V0TWFuaWZlc3QocmVxdWVzdC51c2VySWQsIHJlcXVlc3QudGltZXN0YW1wKTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiB0aGVyZSBpcyBhbHJlYWR5IHNjcmlwdCBnZW5lcmF0ZWQgaW4gdGhlIHMzIGJ1Y2tldCBmb3IgdGhlIHRpbWVzdGFtcFxuICAgIGNvbnN0IHNjcmlwdEtleSA9IGAke3JlcXVlc3QudXNlcklkfS8ke3RpbWVzdGFtcH0uc2NyaXB0LnR4dGA7XG4gICAgY29uc3QgZXhpc3RpbmdTY3JpcHQgPSBhd2FpdCBnZXRPYmplY3RGcm9tUzMoc2NyaXB0S2V5KTtcblxuICAgIC8vIFN0ZXAgMTogR2VuZXJhdGUgc2NyaXB0L3N0b3J5IGJyZWFrZG93biB1c2luZyBHUFQtNFxuICAgIGlmIChleGlzdGluZ1NjcmlwdCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIFNjcmlwdCBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcCwgdXNpbmcgZXhpc3Rpbmcgc2NyaXB0JyxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBhZGRTY2VuZUlkcyhleGlzdGluZ1NjcmlwdC5zY2VuZXMpO1xuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPSBleGlzdGluZ1NjcmlwdC52b2ljZVRvbmVJbnN0cnVjdGlvbjtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIE5vIGV4aXN0aW5nIHNjcmlwdCBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgc3RvcnkgYnJlYWtkb3duJyxcbiAgICAgICk7XG5cbiAgICAgIGlmICghcmVxdWVzdC5wcm9tcHQpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogTm8gcHJvbXB0IHByb3ZpZGVkJyk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gcHJvbXB0IHByb3ZpZGVkJyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHN0b3J5QnJlYWtkb3duID0gYXdhaXQgZ2VuZXJhdGVTdG9yeUJyZWFrZG93bihcbiAgICAgICAgcmVxdWVzdC5wcm9tcHQhLFxuICAgICAgICByZXF1ZXN0LnNjZW5lQ291bnQsXG4gICAgICAgIHNjZW5lRHVyYXRpb24sXG4gICAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbixcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBzdG9yeUJyZWFrZG93bi5zY2VuZXM7XG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9IHN0b3J5QnJlYWtkb3duLnZvaWNlVG9uZUluc3RydWN0aW9uO1xuICAgIH1cblxuICAgIGlmICghc2NlbmVzIHx8IHNjZW5lcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IEZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CfjqUgTWFuaWZlc3QgY3JlYXRlZCBhbmQgdXBsb2FkZWQ6Jyk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OpSBTdG9yeSBicmVha2Rvd24gZ2VuZXJhdGVkOicsIHNjZW5lcyk7XG5cbiAgICAvLyBTdGVwIDI6IEdlbmVyYXRlIGltYWdlcyBmb3IgZWFjaCBzY2VuZSBpbiBwYXJhbGxlbFxuICAgIC8vIENoZWNrIGlmIHRoZXJlIGFyZSBhbHJlYWR5IGltYWdlcyBnZW5lcmF0ZWQgaW4gdGhlIHMzIGJ1Y2tldCBmb3IgdGhlIHRpbWVzdGFtcFxuICAgIGxldCBpbWFnZVVybHMgPSBhd2FpdCBnZXRJbWFnZVVybHMocmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCk7XG5cbiAgICBpZiAoaW1hZ2VVcmxzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn46lIEltYWdlcyBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcDonLCBpbWFnZVVybHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBzZWVkID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMDAwMCk7XG5cbiAgICAgIGNvbnNvbGUubG9nKCfwn46oIEdlbmVyYXRpbmcgaW1hZ2VzIGZvciBlYWNoIHNjZW5lIGluIHBhcmFsbGVsLi4uJyk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBzY2VuZXMubWFwKGFzeW5jIChzY2VuZTogYW55LCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgIGDwn46oIEdlbmVyYXRpbmcgaW1hZ2UgZm9yIHNjZW5lICR7aSArIDF9OmAsXG4gICAgICAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ2VuZXJhdGVOYW5vQmFuYW5hSW1hZ2UoXG4gICAgICAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAgICAgICAgIHNjZW5lLmlkLFxuICAgICAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgICAgICBzZWVkLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pyFIFNjZW5lICR7aSArIDF9IGltYWdlIGdlbmVyYXRlZDogZG9uZWApO1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFdhaXQgZm9yIGFsbCBpbWFnZXMgdG8gYmUgZ2VuZXJhdGVkIHVzaW5nIGFsbFNldHRsZWQgZm9yIGJldHRlciBlcnJvciBoYW5kbGluZ1xuICAgICAgICBjb25zb2xlLmxvZygn4o+zIFdhaXRpbmcgZm9yIGFsbCBpbWFnZSBnZW5lcmF0aW9uIHRvIGNvbXBsZXRlLi4uJyk7XG4gICAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoaW1hZ2VQcm9taXNlcyk7XG5cbiAgICAgICAgLy8gTG9nIHJlc3VsdHMgYW5kIGhhbmRsZSBmYWlsdXJlc1xuICAgICAgICBjb25zdCBzdWNjZXNzZnVsID0gcmVzdWx0cy5maWx0ZXIoXG4gICAgICAgICAgKHJlc3VsdCkgPT4gcmVzdWx0LnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcsXG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IGZhaWxlZCA9IHJlc3VsdHMuZmlsdGVyKChyZXN1bHQpID0+IHJlc3VsdC5zdGF0dXMgPT09ICdyZWplY3RlZCcpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGDinIUgSW1hZ2UgZ2VuZXJhdGlvbiByZXN1bHRzOiAke3N1Y2Nlc3NmdWwubGVuZ3RofSBzdWNjZXNzZnVsLCAke2ZhaWxlZC5sZW5ndGh9IGZhaWxlZGAsXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gTG9nIGZhaWxlZCBwcm9taXNlcyB3aXRoIGRldGFpbGVkIGVycm9yIGluZm9cbiAgICAgICAgZmFpbGVkLmZvckVhY2goKHJlc3VsdCwgaW5kZXgpID0+IHtcbiAgICAgICAgICBpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJykge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgICAgYOKdjCBTY2VuZSAke2luZGV4fSBpbWFnZSBnZW5lcmF0aW9uIGZhaWxlZDpgLFxuICAgICAgICAgICAgICByZXN1bHQucmVhc29uLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIENvbnRpbnVlIHByb2Nlc3NpbmcgZXZlbiBpZiBzb21lIGltYWdlcyBmYWlsZWRcbiAgICAgICAgaWYgKHN1Y2Nlc3NmdWwubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdBbGwgaW1hZ2UgZ2VuZXJhdGlvbiBhdHRlbXB0cyBmYWlsZWQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGDwn46oIFN1Y2Nlc3NmdWxseSBnZW5lcmF0ZWQgJHtzdWNjZXNzZnVsLmxlbmd0aH0gb3V0IG9mICR7cmVzdWx0cy5sZW5ndGh9IGltYWdlc2AsXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gaWYgKGdlbmVyYXRlZEltYWdlVXJscy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgLy8gICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyBpbWFnZXMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAgICAgLy8gICB0aHJvdyBuZXcgRXJyb3IoJ05vIGltYWdlcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgICAgICAvLyB9XG5cbiAgICAgICAgLy8gLy8gdXBsb2FkIGltYWdlVXJscyB0byBzMyB1c2luZyB1cGxvYWRJbWFnZVRvUzNcbiAgICAgICAgLy8gY29uc3QgdXBsb2FkUHJvbWlzZXMgPSBnZW5lcmF0ZWRJbWFnZVVybHMubWFwKChpbWFnZVVybCwgaSkgPT5cbiAgICAgICAgLy8gICB1cGxvYWRJbWFnZVRvUzMoaW1hZ2VVcmwsIHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXAsIHNjZW5lc1tpXS5pZCksXG4gICAgICAgIC8vICk7XG4gICAgICAgIC8vIGF3YWl0IFByb21pc2UuYWxsKGltYWdlUHJvbWlzZXMpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5a877iPIEltYWdlcyB1cGxvYWRlZCB0byBTMycpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEZhaWxlZCB0byBnZW5lcmF0ZSBpbWFnZXM6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGNoZWNrIGlmIGFsbCB0b2dldGhlciBpZiAubXAzLCAuc3VidGl0bGUuanNvbiwgLmFzcyBmaWxlcyBhcmUgYWxyZWFkeSBleGlzdHMgaW4gdGhlIHMzIGJ1Y2tldCBhbmQgcmV0dXJuIGJvb2xlYW5cbiAgICBjb25zdCBhdWRpb0NhcHRpb25GaWxlc0V4aXN0ID0gYXdhaXQgY2hlY2tBdWRpb0NhcHRpb25FeGlzdHMoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICApO1xuICAgIGlmIChhdWRpb0NhcHRpb25GaWxlc0V4aXN0KSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgQXVkaW8sIHN1YnRpdGxlLCBhbmQgYXNzIGZpbGVzIGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wOicsXG4gICAgICAgIGF1ZGlvQ2FwdGlvbkZpbGVzRXhpc3QsXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgTm8gZXhpc3RpbmcgYXVkaW8sIHN1YnRpdGxlLCBhbmQgYXNzIGZpbGVzIGZvdW5kLCBnZW5lcmF0aW5nIG5ldyBuYXJyYXRpb24nLFxuICAgICAgKTtcblxuICAgICAgLy8gU3RlcCAzOiBHZW5lcmF0ZSBhdWRpbyBmaWxlcyB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wc1xuICAgICAgY29uc3QgeyBzdWJ0aXRsZXMgfSA9IGF3YWl0IGdlbmVyYXRlTmFycmF0aW9uKFxuICAgICAgICBzY2VuZXMsXG4gICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uLFxuICAgICAgICByZXF1ZXN0LnZvaWNlIHx8IERFRkFVTFRfVk9JQ0UsXG4gICAgICAgIHJlcXVlc3QubGFuZ3VhZ2UgfHwgREVGQVVMVF9MQU5HVUFHRSxcbiAgICAgICk7XG5cbiAgICAgIC8vIFN0ZXAgNDogR2VuZXJhdGUgc3VidGl0bGUgZmlsZVxuICAgICAgYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZXMoc2NlbmVzLCByZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCBzdWJ0aXRsZXMpO1xuICAgIH1cblxuICAgIGxldCBtYW5pZmVzdEh5ZHJhdGVkID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgJ2F1ZGlvX3N1YnRpdGxlX2NyZWF0ZWQnLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICB7XG4gICAgICAgIG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkLFxuICAgICAgfSxcbiAgICAgICdBdWRpbyBhbmQgU3VidGl0bGVzIGNvbXBsZXRlZCcsXG4gICAgKTtcblxuICAgIC8vIFN0ZXAgNDogR2VuZXJhdGUgY2FtZXJhIG1vdmVtZW50cyBmcm9tIGltYWdlXG4gICAgLy8gY2hlY2sgaWYgdGhlcmUgYXJlIGFscmVhZHkgYWxsIHRoZSB2aWRlbyBlZmZlY3RzIGdlbmVyYXRlZCBpbiB0aGUgczMgYnVja2V0IGZvciB0aGUgdGltZXN0YW1wXG4gICAgYXdhaXQgZ2V0VmlkZW9FZmZlY3RVcmxzKHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXAsIHNjZW5lcyk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OrCBWaWRlbyBlZmZlY3RzIFVSTHMgZ2VuZXJhdGVkOicpO1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgJ/CfjqwgTWFuaWZlc3QgcHJldmlldyBjb21wbGV0ZWQ6JyxcbiAgICAgIEpTT04uc3RyaW5naWZ5KG1hbmlmZXN0LCBudWxsLCAyKSxcbiAgICApO1xuXG4gICAgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICdwcmV2aWV3X2NvbXBsZXRlZCcsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHsgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQgfSxcbiAgICAgICdWaWRlbyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICApO1xuXG4gICAgLy8gSWYgdGhpcyB3YXMgdHJpZ2dlcmVkIGJ5IFNRUywgZGVsZXRlIHRoZSBtZXNzYWdlIGZyb20gdGhlIHF1ZXVlXG4gICAgaWYgKHJlY29yZCAmJiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwpIHtcbiAgICAgIGNvbnN0IGRlbGV0ZUNvbW1hbmQgPSBuZXcgRGVsZXRlTWVzc2FnZUNvbW1hbmQoe1xuICAgICAgICBRdWV1ZVVybDogcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMLFxuICAgICAgICBSZWNlaXB0SGFuZGxlOiByZWNvcmQucmVjZWlwdEhhbmRsZSxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgc3FzLnNlbmQoZGVsZXRlQ29tbWFuZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIG1lc3NhZ2U6ICdQcmV2aWV3IGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gdmlkZW8gZ2VuZXJhdGlvbjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==