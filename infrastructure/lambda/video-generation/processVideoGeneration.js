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
            // update scenes duration
            scenes.forEach((scene, i) => {
                scene.duration = subtitles[i].duration || 10;
                console.log('subtitles[i].duration:', subtitles[i].duration);
            });
            // Step 4: Generate subtitle file
            await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, subtitles);
        }
        console.log('🎥 Scenes before creating manifest:', JSON.stringify(scenes, null, 2));
        // Create manifest and upload to s3
        await (0, manifestUtils_1.createManifest)(request.userId, timestamp, scenes, request.totalDuration, voiceToneInstruction, request.voice || DEFAULT_VOICE, request.language || DEFAULT_LANGUAGE);
        manifest = await (0, manifestUtils_1.getManifest)(request.userId, request.timestamp);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NWaWRlb0dlbmVyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUE0Q0Esd0RBbVFDO0FBOVNELG9EQUFzRTtBQUV0RSwwQ0FBbUQ7QUFDbkQsa0RBQXVEO0FBQ3ZELDRDQUE4QztBQUM5Qyw0Q0FBZ0U7QUFDaEUsb0RBQWtFO0FBQ2xFLGtEQUE0RDtBQUM1RCxvREFBbUQ7QUFDbkQsOERBQW1FO0FBRW5FLFlBQVk7QUFDWixNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUM7QUFDNUIsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7QUFDOUIsd0RBQTJEO0FBRTNELDBEQUlnQztBQUVoQywyREFBd0Q7QUFFeEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFtQnRFLEtBQUssVUFBVSxzQkFBc0IsQ0FDMUMsT0FBK0IsRUFDL0IsTUFBa0I7SUFFbEIsSUFBSSxDQUFDO1FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVoRCxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU3QyxnQkFBZ0I7UUFDaEIsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQztRQUVwQyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUM5QixPQUFPLENBQUMsYUFBYSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQzNDLENBQUM7UUFFRixJQUFJLE1BQU0sR0FBWSxFQUFFLENBQUM7UUFDekIsSUFBSSxvQkFBb0IsR0FBVyxFQUFFLENBQUM7UUFFdEMsMENBQTBDO1FBQzFDLElBQUksUUFBUSxHQUFHLE1BQU0sSUFB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dXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNRU1JlY29yZCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgU1FTQ2xpZW50LCBEZWxldGVNZXNzYWdlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVJbWFnZSB9IGZyb20gJy4uL3V0aWxzL2ltYWdlJztcbmltcG9ydCB7IGdlbmVyYXRlTmFycmF0aW9uIH0gZnJvbSAnLi4vdXRpbHMvYXVkaW8nO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdWJ0aXRsZXMgfSBmcm9tICcuLi91dGlscy9zdWJ0aXRsZXMnO1xuaW1wb3J0IHsgYWRkU2NlbmVJZHMgfSBmcm9tICcuLi91dGlscy9zY3JpcHQnO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdG9yeUJyZWFrZG93biwgU2NlbmUgfSBmcm9tICcuLi91dGlscy9zY3JpcHQnO1xuaW1wb3J0IHsgdXBsb2FkVG9TMywgZ2V0T2JqZWN0RnJvbVMzIH0gZnJvbSAnLi4vdXRpbHMvczNVcGxvYWRlcic7XG5pbXBvcnQgeyBjaGVja0F1ZGlvQ2FwdGlvbkV4aXN0cyB9IGZyb20gJy4vdXRpbC9hdWRpb1V0aWxzJztcbmltcG9ydCB7IGdldEltYWdlVXJscyB9IGZyb20gJy4uL3V0aWxzL2ltYWdlVXRpbHMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVOYW5vQmFuYW5hSW1hZ2UgfSBmcm9tICcuLi91dGlscy9pbWFnZU5hbm9CYW5hbmEnO1xuXG4vLyBDb25zdGFudHNcbmNvbnN0IERFRkFVTFRfVk9JQ0UgPSAnYXNoJztcbmNvbnN0IERFRkFVTFRfTEFOR1VBR0UgPSAnZW4nO1xuaW1wb3J0IHsgZ2V0VmlkZW9FZmZlY3RVcmxzIH0gZnJvbSAnLi4vdXRpbHMvdmlkZW9FZmZlY3RzJztcbmltcG9ydCB7IGNvbWJpbmVWaWRlb0FuZEF1ZGlvIH0gZnJvbSAnLi92aWRlb0NvbWJpbmVyJztcbmltcG9ydCB7XG4gIGNyZWF0ZU1hbmlmZXN0LFxuICBnZXRNYW5pZmVzdCxcbiAgaHlkcmF0ZU1hbmlmZXN0LFxufSBmcm9tICcuLi91dGlscy9tYW5pZmVzdFV0aWxzJztcbmltcG9ydCB7IHVwbG9hZEltYWdlVG9TMyB9IGZyb20gJy4uL3V0aWxzL3MzVXBsb2FkZXInO1xuaW1wb3J0IHsgYnJvYWRjYXN0UHJvZ3Jlc3MgfSBmcm9tICcuL2Jyb2FkY2FzdFByb2dyZXNzJztcblxuY29uc3Qgc3FzID0gbmV3IFNRU0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyB9KTtcblxuZXhwb3J0IGludGVyZmFjZSBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0IHtcbiAgdHlwZT86XG4gICAgfCAnZ2VuZXJhdGUtdmlkZW8nXG4gICAgfCAnc2F2ZS1pbWFnZSdcbiAgICB8ICdhbmltYXRlLWltYWdlJ1xuICAgIHwgJ2NvbWJpbmUtdmlkZW8nXG4gICAgfCAnY3JlYXRlLXNjZW5lJztcbiAgcHJvbXB0Pzogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG4gIHRvdGFsRHVyYXRpb246IG51bWJlcjtcbiAgc2NlbmVDb3VudDogbnVtYmVyO1xuICBzdGVwOiBudW1iZXI7XG4gIHZvaWNlPzogc3RyaW5nO1xuICBsYW5ndWFnZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NWaWRlb0dlbmVyYXRpb24oXG4gIHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3QsXG4gIHJlY29yZD86IFNRU1JlY29yZCxcbik6IFByb21pc2U8YW55PiB7XG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ3Byb2Nlc3NWaWRlb0dlbmVyYXRpb246JywgcmVxdWVzdCk7XG5cbiAgICBjb25zb2xlLmxvZygncmVxdWVzdC52b2ljZTonLCByZXF1ZXN0LnZvaWNlKTtcblxuICAgIC8vIFVzZSB0aW1lc3RhbXBcbiAgICBjb25zdCB0aW1lc3RhbXAgPSByZXF1ZXN0LnRpbWVzdGFtcDtcblxuICAgIGNvbnN0IHNjZW5lRHVyYXRpb24gPSBNYXRoLmZsb29yKFxuICAgICAgcmVxdWVzdC50b3RhbER1cmF0aW9uIC8gcmVxdWVzdC5zY2VuZUNvdW50LFxuICAgICk7XG5cbiAgICBsZXQgc2NlbmVzOiBTY2VuZVtdID0gW107XG4gICAgbGV0IHZvaWNlVG9uZUluc3RydWN0aW9uOiBzdHJpbmcgPSAnJztcblxuICAgIC8vIGNoZWNrIGlmIHRoZSB2aWRlbyBpcyBhbHJlYWR5IGdlbmVyYXRlZFxuICAgIGxldCBtYW5pZmVzdCA9IGF3YWl0IGdldE1hbmlmZXN0KHJlcXVlc3QudXNlcklkLCByZXF1ZXN0LnRpbWVzdGFtcCk7XG5cbiAgICBpZiAobWFuaWZlc3QpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn46lIFZpZGVvIGFscmVhZHkgZ2VuZXJhdGVkLCBza2lwcGluZyB2aWRlbyBnZW5lcmF0aW9uJyk7XG4gICAgICBjb25zdCBtYW5pZmVzdEh5ZHJhdGVkID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcbiAgICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgICAncHJldmlld19jb21wbGV0ZWQnLFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgcmVxdWVzdC50aW1lc3RhbXAsXG4gICAgICAgIHsgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQgfSxcbiAgICAgICAgJ1ZpZGVvIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG1lc3NhZ2U6ICdWaWRlbyBhbHJlYWR5IGdlbmVyYXRlZCcsXG4gICAgICAgIG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiB0aGVyZSBpcyBhbHJlYWR5IHNjcmlwdCBnZW5lcmF0ZWQgaW4gdGhlIHMzIGJ1Y2tldCBmb3IgdGhlIHRpbWVzdGFtcFxuICAgIGNvbnN0IHNjcmlwdEtleSA9IGAke3JlcXVlc3QudXNlcklkfS8ke3RpbWVzdGFtcH0uc2NyaXB0LnR4dGA7XG4gICAgY29uc3QgZXhpc3RpbmdTY3JpcHQgPSBhd2FpdCBnZXRPYmplY3RGcm9tUzMoc2NyaXB0S2V5KTtcblxuICAgIC8vIFN0ZXAgMTogR2VuZXJhdGUgc2NyaXB0L3N0b3J5IGJyZWFrZG93biB1c2luZyBHUFQtNFxuICAgIGlmIChleGlzdGluZ1NjcmlwdCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIFNjcmlwdCBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcCwgdXNpbmcgZXhpc3Rpbmcgc2NyaXB0JyxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBhZGRTY2VuZUlkcyhleGlzdGluZ1NjcmlwdC5zY2VuZXMpO1xuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPSBleGlzdGluZ1NjcmlwdC52b2ljZVRvbmVJbnN0cnVjdGlvbjtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIE5vIGV4aXN0aW5nIHNjcmlwdCBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgc3RvcnkgYnJlYWtkb3duJyxcbiAgICAgICk7XG5cbiAgICAgIGlmICghcmVxdWVzdC5wcm9tcHQpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogTm8gcHJvbXB0IHByb3ZpZGVkJyk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gcHJvbXB0IHByb3ZpZGVkJyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHN0b3J5QnJlYWtkb3duID0gYXdhaXQgZ2VuZXJhdGVTdG9yeUJyZWFrZG93bihcbiAgICAgICAgcmVxdWVzdC5wcm9tcHQhLFxuICAgICAgICByZXF1ZXN0LnNjZW5lQ291bnQsXG4gICAgICAgIHNjZW5lRHVyYXRpb24sXG4gICAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbixcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBzdG9yeUJyZWFrZG93bi5zY2VuZXM7XG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9IHN0b3J5QnJlYWtkb3duLnZvaWNlVG9uZUluc3RydWN0aW9uO1xuICAgIH1cblxuICAgIGlmICghc2NlbmVzIHx8IHNjZW5lcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IEZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CfjqUgU3RvcnkgYnJlYWtkb3duIGdlbmVyYXRlZDonLCBzY2VuZXMpO1xuXG4gICAgLy8gU3RlcCAyOiBHZW5lcmF0ZSBpbWFnZXMgZm9yIGVhY2ggc2NlbmUgaW4gcGFyYWxsZWxcbiAgICAvLyBDaGVjayBpZiB0aGVyZSBhcmUgYWxyZWFkeSBpbWFnZXMgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBsZXQgaW1hZ2VVcmxzID0gYXdhaXQgZ2V0SW1hZ2VVcmxzKHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXApO1xuXG4gICAgaWYgKGltYWdlVXJscy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+OpSBJbWFnZXMgYWxyZWFkeSBnZW5lcmF0ZWQgZm9yIHRoZSB0aW1lc3RhbXA6JywgaW1hZ2VVcmxzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3Qgc2VlZCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwMDApO1xuXG4gICAgICBjb25zb2xlLmxvZygn8J+OqCBHZW5lcmF0aW5nIGltYWdlcyBmb3IgZWFjaCBzY2VuZSBpbiBwYXJhbGxlbC4uLicpO1xuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gc2NlbmVzLm1hcChhc3luYyAoc2NlbmU6IGFueSwgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBg8J+OqCBHZW5lcmF0aW5nIGltYWdlIGZvciBzY2VuZSAke2kgKyAxfTpgLFxuICAgICAgICAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGdlbmVyYXRlTmFub0JhbmFuYUltYWdlKFxuICAgICAgICAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICBzY2VuZS5pZCxcbiAgICAgICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICAgICAgc2VlZCxcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc29sZS5sb2coYOKchSBTY2VuZSAke2kgKyAxfSBpbWFnZSBnZW5lcmF0ZWQ6IGRvbmVgKTtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBXYWl0IGZvciBhbGwgaW1hZ2VzIHRvIGJlIGdlbmVyYXRlZCB1c2luZyBhbGxTZXR0bGVkIGZvciBiZXR0ZXIgZXJyb3IgaGFuZGxpbmdcbiAgICAgICAgY29uc29sZS5sb2coJ+KPsyBXYWl0aW5nIGZvciBhbGwgaW1hZ2UgZ2VuZXJhdGlvbiB0byBjb21wbGV0ZS4uLicpO1xuICAgICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKGltYWdlUHJvbWlzZXMpO1xuXG4gICAgICAgIC8vIExvZyByZXN1bHRzIGFuZCBoYW5kbGUgZmFpbHVyZXNcbiAgICAgICAgY29uc3Qgc3VjY2Vzc2Z1bCA9IHJlc3VsdHMuZmlsdGVyKFxuICAgICAgICAgIChyZXN1bHQpID0+IHJlc3VsdC5zdGF0dXMgPT09ICdmdWxmaWxsZWQnLFxuICAgICAgICApO1xuICAgICAgICBjb25zdCBmYWlsZWQgPSByZXN1bHRzLmZpbHRlcigocmVzdWx0KSA9PiByZXN1bHQuc3RhdHVzID09PSAncmVqZWN0ZWQnKTtcblxuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBg4pyFIEltYWdlIGdlbmVyYXRpb24gcmVzdWx0czogJHtzdWNjZXNzZnVsLmxlbmd0aH0gc3VjY2Vzc2Z1bCwgJHtmYWlsZWQubGVuZ3RofSBmYWlsZWRgLFxuICAgICAgICApO1xuXG4gICAgICAgIC8vIExvZyBmYWlsZWQgcHJvbWlzZXMgd2l0aCBkZXRhaWxlZCBlcnJvciBpbmZvXG4gICAgICAgIGZhaWxlZC5mb3JFYWNoKChyZXN1bHQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdC5zdGF0dXMgPT09ICdyZWplY3RlZCcpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICAgIGDinYwgU2NlbmUgJHtpbmRleH0gaW1hZ2UgZ2VuZXJhdGlvbiBmYWlsZWQ6YCxcbiAgICAgICAgICAgICAgcmVzdWx0LnJlYXNvbixcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBDb250aW51ZSBwcm9jZXNzaW5nIGV2ZW4gaWYgc29tZSBpbWFnZXMgZmFpbGVkXG4gICAgICAgIGlmIChzdWNjZXNzZnVsLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQWxsIGltYWdlIGdlbmVyYXRpb24gYXR0ZW1wdHMgZmFpbGVkJyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBg8J+OqCBTdWNjZXNzZnVsbHkgZ2VuZXJhdGVkICR7c3VjY2Vzc2Z1bC5sZW5ndGh9IG91dCBvZiAke3Jlc3VsdHMubGVuZ3RofSBpbWFnZXNgLFxuICAgICAgICApO1xuXG4gICAgICAgIC8vIGlmIChnZW5lcmF0ZWRJbWFnZVVybHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIC8vICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogTm8gaW1hZ2VzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgICAgIC8vICAgdGhyb3cgbmV3IEVycm9yKCdObyBpbWFnZXMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAgICAgLy8gfVxuXG4gICAgICAgIC8vIC8vIHVwbG9hZCBpbWFnZVVybHMgdG8gczMgdXNpbmcgdXBsb2FkSW1hZ2VUb1MzXG4gICAgICAgIC8vIGNvbnN0IHVwbG9hZFByb21pc2VzID0gZ2VuZXJhdGVkSW1hZ2VVcmxzLm1hcCgoaW1hZ2VVcmwsIGkpID0+XG4gICAgICAgIC8vICAgdXBsb2FkSW1hZ2VUb1MzKGltYWdlVXJsLCByZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCBzY2VuZXNbaV0uaWQpLFxuICAgICAgICAvLyApO1xuICAgICAgICAvLyBhd2FpdCBQcm9taXNlLmFsbChpbWFnZVByb21pc2VzKTtcblxuICAgICAgICBjb25zb2xlLmxvZygn8J+WvO+4jyBJbWFnZXMgdXBsb2FkZWQgdG8gUzMnKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gZ2VuZXJhdGUgaW1hZ2VzOicsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjaGVjayBpZiBhbGwgdG9nZXRoZXIgaWYgLm1wMywgLnN1YnRpdGxlLmpzb24sIC5hc3MgZmlsZXMgYXJlIGFscmVhZHkgZXhpc3RzIGluIHRoZSBzMyBidWNrZXQgYW5kIHJldHVybiBib29sZWFuXG4gICAgY29uc3QgYXVkaW9DYXB0aW9uRmlsZXNFeGlzdCA9IGF3YWl0IGNoZWNrQXVkaW9DYXB0aW9uRXhpc3RzKFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgKTtcbiAgICBpZiAoYXVkaW9DYXB0aW9uRmlsZXNFeGlzdCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIEF1ZGlvLCBzdWJ0aXRsZSwgYW5kIGFzcyBmaWxlcyBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcDonLFxuICAgICAgICBhdWRpb0NhcHRpb25GaWxlc0V4aXN0LFxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIE5vIGV4aXN0aW5nIGF1ZGlvLCBzdWJ0aXRsZSwgYW5kIGFzcyBmaWxlcyBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgbmFycmF0aW9uJyxcbiAgICAgICk7XG5cbiAgICAgIC8vIFN0ZXAgMzogR2VuZXJhdGUgYXVkaW8gZmlsZXMgd2l0aCB3b3JkLWxldmVsIHRpbWVzdGFtcHNcbiAgICAgIGNvbnN0IHsgc3VidGl0bGVzIH0gPSBhd2FpdCBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgICAgICAgc2NlbmVzLFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbixcbiAgICAgICAgcmVxdWVzdC52b2ljZSB8fCBERUZBVUxUX1ZPSUNFLFxuICAgICAgICByZXF1ZXN0Lmxhbmd1YWdlIHx8IERFRkFVTFRfTEFOR1VBR0UsXG4gICAgICApO1xuXG4gICAgICAvLyB1cGRhdGUgc2NlbmVzIGR1cmF0aW9uXG4gICAgICBzY2VuZXMuZm9yRWFjaCgoc2NlbmUsIGkpID0+IHtcbiAgICAgICAgc2NlbmUuZHVyYXRpb24gPSBzdWJ0aXRsZXNbaV0uZHVyYXRpb24gfHwgMTA7XG4gICAgICAgIGNvbnNvbGUubG9nKCdzdWJ0aXRsZXNbaV0uZHVyYXRpb246Jywgc3VidGl0bGVzW2ldLmR1cmF0aW9uKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBTdGVwIDQ6IEdlbmVyYXRlIHN1YnRpdGxlIGZpbGVcbiAgICAgIGF3YWl0IGdlbmVyYXRlU3VidGl0bGVzKHNjZW5lcywgcmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCwgc3VidGl0bGVzKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICfwn46lIFNjZW5lcyBiZWZvcmUgY3JlYXRpbmcgbWFuaWZlc3Q6JyxcbiAgICAgIEpTT04uc3RyaW5naWZ5KHNjZW5lcywgbnVsbCwgMiksXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBtYW5pZmVzdCBhbmQgdXBsb2FkIHRvIHMzXG4gICAgYXdhaXQgY3JlYXRlTWFuaWZlc3QoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHNjZW5lcyxcbiAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbixcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uLFxuICAgICAgcmVxdWVzdC52b2ljZSB8fCBERUZBVUxUX1ZPSUNFLFxuICAgICAgcmVxdWVzdC5sYW5ndWFnZSB8fCBERUZBVUxUX0xBTkdVQUdFLFxuICAgICk7XG5cbiAgICBtYW5pZmVzdCA9IGF3YWl0IGdldE1hbmlmZXN0KHJlcXVlc3QudXNlcklkLCByZXF1ZXN0LnRpbWVzdGFtcCk7XG5cbiAgICBsZXQgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICdhdWRpb19zdWJ0aXRsZV9jcmVhdGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAge1xuICAgICAgICBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCxcbiAgICAgIH0sXG4gICAgICAnQXVkaW8gYW5kIFN1YnRpdGxlcyBjb21wbGV0ZWQnLFxuICAgICk7XG5cbiAgICAvLyBTdGVwIDQ6IEdlbmVyYXRlIGNhbWVyYSBtb3ZlbWVudHMgZnJvbSBpbWFnZVxuICAgIC8vIGNoZWNrIGlmIHRoZXJlIGFyZSBhbHJlYWR5IGFsbCB0aGUgdmlkZW8gZWZmZWN0cyBnZW5lcmF0ZWQgaW4gdGhlIHMzIGJ1Y2tldCBmb3IgdGhlIHRpbWVzdGFtcFxuICAgIGF3YWl0IGdldFZpZGVvRWZmZWN0VXJscyhyZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCBzY2VuZXMpO1xuXG4gICAgY29uc29sZS5sb2coJ/CfjqwgVmlkZW8gZWZmZWN0cyBVUkxzIGdlbmVyYXRlZDonKTtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICfwn46sIE1hbmlmZXN0IHByZXZpZXcgY29tcGxldGVkOicsXG4gICAgICBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCwgbnVsbCwgMiksXG4gICAgKTtcblxuICAgIG1hbmlmZXN0SHlkcmF0ZWQgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAncHJldmlld19jb21wbGV0ZWQnLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICB7IG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkIH0sXG4gICAgICAnVmlkZW8gZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgKTtcblxuICAgIC8vIElmIHRoaXMgd2FzIHRyaWdnZXJlZCBieSBTUVMsIGRlbGV0ZSB0aGUgbWVzc2FnZSBmcm9tIHRoZSBxdWV1ZVxuICAgIGlmIChyZWNvcmQgJiYgcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMKSB7XG4gICAgICBjb25zdCBkZWxldGVDb21tYW5kID0gbmV3IERlbGV0ZU1lc3NhZ2VDb21tYW5kKHtcbiAgICAgICAgUXVldWVVcmw6IHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCxcbiAgICAgICAgUmVjZWlwdEhhbmRsZTogcmVjb3JkLnJlY2VpcHRIYW5kbGUsXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHNxcy5zZW5kKGRlbGV0ZUNvbW1hbmQpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBtZXNzYWdlOiAnUHJldmlldyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGluIHZpZGVvIGdlbmVyYXRpb246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG4iXX0=