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
const broadcastProgress_1 = require("../utils/broadcastProgress");
const user_1 = require("../utils/user");
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
            const storyBreakdown = await (0, script_2.generateStoryBreakdown)(request.prompt, request.sceneCount, sceneDuration, request.totalDuration);
            scenes = storyBreakdown.scenes;
            voiceToneInstruction = storyBreakdown.voiceToneInstruction;
        }
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to get or generate story breakdown');
            throw new Error('Failed to get or generate story breakdown');
        }
        console.log('🎥 Story breakdown generated:', scenes);
        console.log('🖼️ Received imageTemplate:', request.imageTemplate);
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
                    const imageDescription = `[${request.imageTemplate}]: ${scene.description}`;
                    const result = await (0, imageNanoBanana_1.generateNanoBananaImage)(imageDescription, scene.id, request.userId, timestamp, seed);
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
        await (0, manifestUtils_1.createManifest)(request.userId, timestamp, scenes, request.totalDuration, voiceToneInstruction, request.voice || DEFAULT_VOICE, request.language || DEFAULT_LANGUAGE, request.imageTemplate);
        manifest = await (0, manifestUtils_1.getManifest)(request.userId, request.timestamp);
        let manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
        await (0, broadcastProgress_1.broadcastProgress)('audio_subtitle_created', request.userId, timestamp, {
            manifest: manifestHydrated,
        }, 'Audio and Subtitles completed');
        // get the user's subscription
        const user = await (0, user_1.getUser)(request.userId);
        console.log('User fetched:', JSON.stringify(user, null, 2));
        // Step 4: Generate camera movements from image
        // check if there are already all the video effects generated in the s3 bucket for the timestamp
        await (0, videoEffects_1.getVideoEffectUrls)(request.userId, timestamp, scenes, user);
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
        throw Error('Video generation failed');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NWaWRlb0dlbmVyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUE2Q0Esd0RBeVFDO0FBclRELG9EQUFzRTtBQUV0RSwwQ0FBbUQ7QUFDbkQsa0RBQXVEO0FBQ3ZELDRDQUE4QztBQUM5Qyw0Q0FBZ0U7QUFDaEUsb0RBQWtFO0FBQ2xFLGtEQUE0RDtBQUM1RCxvREFBbUQ7QUFDbkQsOERBQW1FO0FBRW5FLFlBQVk7QUFDWixNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUM7QUFDNUIsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7QUFDOUIsd0RBQTJEO0FBQzNELDBEQUlnQztBQUNoQyxrRUFBK0Q7QUFDL0Qsd0NBQXdDO0FBRXhDLE1BQU0sR0FBRyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBcUJ0RSxLQUFLLFVBQVUsc0JBQXNCLENBQzFDLE9BQStCLEVBQy9CLE1BQWtCO0lBRWxCLElBQUksQ0FBQztRQUNILE9BQU8sQ0FBQyxHQUFHLENBQUMseUJBQXlCLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFaEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFN0MsZ0JBQWdCO1FBQ2hCLE1BQU0sU0FBUyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUM7UUFFcEMsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FDOUIsT0FBTyxDQUFDLGFBQWEsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUMzQyxDQUFDO1FBRUYsSUFBSSxNQUFNLEdBQVksRUFBRSxDQUFDO1FBQ3pCLElBQUksb0JBQW9CLEdBQVcsRUFBRSxDQUFDO1FBRXRDLDBDQUEwQztRQUMxQyxJQUFJLFFBQVEs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QzdDLFFBQVEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWU7Z0JBQ3JDLGFBQWEsRUFBRSxNQUFNLENBQUMsYUFBYTthQUNwQyxDQUFDLENBQUM7WUFDSCxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDaEMsQ0FBQztRQUVELE9BQU87WUFDTCxPQUFPLEVBQUUsZ0NBQWdDO1NBQzFDLENBQUM7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsNEJBQTRCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbkQsTUFBTSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQztJQUN6QyxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNRU1JlY29yZCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgU1FTQ2xpZW50LCBEZWxldGVNZXNzYWdlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVJbWFnZSB9IGZyb20gJy4uL3V0aWxzL2ltYWdlJztcbmltcG9ydCB7IGdlbmVyYXRlTmFycmF0aW9uIH0gZnJvbSAnLi4vdXRpbHMvYXVkaW8nO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdWJ0aXRsZXMgfSBmcm9tICcuLi91dGlscy9zdWJ0aXRsZXMnO1xuaW1wb3J0IHsgYWRkU2NlbmVJZHMgfSBmcm9tICcuLi91dGlscy9zY3JpcHQnO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdG9yeUJyZWFrZG93biwgU2NlbmUgfSBmcm9tICcuLi91dGlscy9zY3JpcHQnO1xuaW1wb3J0IHsgdXBsb2FkVG9TMywgZ2V0T2JqZWN0RnJvbVMzIH0gZnJvbSAnLi4vdXRpbHMvczNVcGxvYWRlcic7XG5pbXBvcnQgeyBjaGVja0F1ZGlvQ2FwdGlvbkV4aXN0cyB9IGZyb20gJy4vdXRpbC9hdWRpb1V0aWxzJztcbmltcG9ydCB7IGdldEltYWdlVXJscyB9IGZyb20gJy4uL3V0aWxzL2ltYWdlVXRpbHMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVOYW5vQmFuYW5hSW1hZ2UgfSBmcm9tICcuLi91dGlscy9pbWFnZU5hbm9CYW5hbmEnO1xuXG4vLyBDb25zdGFudHNcbmNvbnN0IERFRkFVTFRfVk9JQ0UgPSAnYXNoJztcbmNvbnN0IERFRkFVTFRfTEFOR1VBR0UgPSAnZW4nO1xuaW1wb3J0IHsgZ2V0VmlkZW9FZmZlY3RVcmxzIH0gZnJvbSAnLi4vdXRpbHMvdmlkZW9FZmZlY3RzJztcbmltcG9ydCB7XG4gIGNyZWF0ZU1hbmlmZXN0LFxuICBnZXRNYW5pZmVzdCxcbiAgaHlkcmF0ZU1hbmlmZXN0LFxufSBmcm9tICcuLi91dGlscy9tYW5pZmVzdFV0aWxzJztcbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi4vdXRpbHMvYnJvYWRjYXN0UHJvZ3Jlc3MnO1xuaW1wb3J0IHsgZ2V0VXNlciB9IGZyb20gJy4uL3V0aWxzL3VzZXInO1xuXG5jb25zdCBzcXMgPSBuZXcgU1FTQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZpZGVvR2VuZXJhdGlvblJlcXVlc3Qge1xuICB0eXBlPzpcbiAgICB8ICdnZW5lcmF0ZS12aWRlbydcbiAgICB8ICdzYXZlLWltYWdlJ1xuICAgIHwgJ2FuaW1hdGUtaW1hZ2UnXG4gICAgfCAnY29tYmluZS12aWRlbydcbiAgICB8ICdjcmVhdGUtc2NlbmUnXG4gICAgfCAncmVnZW5lcmF0ZS1zY2VuZSc7XG4gIHByb21wdD86IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogc3RyaW5nO1xuICB0b3RhbER1cmF0aW9uOiBudW1iZXI7XG4gIHNjZW5lQ291bnQ6IG51bWJlcjtcbiAgc3RlcDogbnVtYmVyO1xuICB2b2ljZT86IHN0cmluZztcbiAgbGFuZ3VhZ2U/OiBzdHJpbmc7XG4gIGltYWdlVGVtcGxhdGU6IHN0cmluZztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NWaWRlb0dlbmVyYXRpb24oXG4gIHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3QsXG4gIHJlY29yZD86IFNRU1JlY29yZCxcbik6IFByb21pc2U8YW55PiB7XG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ3Byb2Nlc3NWaWRlb0dlbmVyYXRpb246JywgcmVxdWVzdCk7XG5cbiAgICBjb25zb2xlLmxvZygncmVxdWVzdC52b2ljZTonLCByZXF1ZXN0LnZvaWNlKTtcblxuICAgIC8vIFVzZSB0aW1lc3RhbXBcbiAgICBjb25zdCB0aW1lc3RhbXAgPSByZXF1ZXN0LnRpbWVzdGFtcDtcblxuICAgIGNvbnN0IHNjZW5lRHVyYXRpb24gPSBNYXRoLmZsb29yKFxuICAgICAgcmVxdWVzdC50b3RhbER1cmF0aW9uIC8gcmVxdWVzdC5zY2VuZUNvdW50LFxuICAgICk7XG5cbiAgICBsZXQgc2NlbmVzOiBTY2VuZVtdID0gW107XG4gICAgbGV0IHZvaWNlVG9uZUluc3RydWN0aW9uOiBzdHJpbmcgPSAnJztcblxuICAgIC8vIGNoZWNrIGlmIHRoZSB2aWRlbyBpcyBhbHJlYWR5IGdlbmVyYXRlZFxuICAgIGxldCBtYW5pZmVzdCA9IGF3YWl0IGdldE1hbmlmZXN0KHJlcXVlc3QudXNlcklkLCByZXF1ZXN0LnRpbWVzdGFtcCk7XG5cbiAgICBpZiAobWFuaWZlc3QpIHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn46lIFZpZGVvIGFscmVhZHkgZ2VuZXJhdGVkLCBza2lwcGluZyB2aWRlbyBnZW5lcmF0aW9uJyk7XG4gICAgICBjb25zdCBtYW5pZmVzdEh5ZHJhdGVkID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcbiAgICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgICAncHJldmlld19jb21wbGV0ZWQnLFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgcmVxdWVzdC50aW1lc3RhbXAsXG4gICAgICAgIHsgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQgfSxcbiAgICAgICAgJ1ZpZGVvIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG1lc3NhZ2U6ICdWaWRlbyBhbHJlYWR5IGdlbmVyYXRlZCcsXG4gICAgICAgIG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiB0aGVyZSBpcyBhbHJlYWR5IHNjcmlwdCBnZW5lcmF0ZWQgaW4gdGhlIHMzIGJ1Y2tldCBmb3IgdGhlIHRpbWVzdGFtcFxuICAgIGNvbnN0IHNjcmlwdEtleSA9IGAke3JlcXVlc3QudXNlcklkfS8ke3RpbWVzdGFtcH0uc2NyaXB0LnR4dGA7XG4gICAgY29uc3QgZXhpc3RpbmdTY3JpcHQgPSBhd2FpdCBnZXRPYmplY3RGcm9tUzMoc2NyaXB0S2V5KTtcblxuICAgIC8vIFN0ZXAgMTogR2VuZXJhdGUgc2NyaXB0L3N0b3J5IGJyZWFrZG93biB1c2luZyBHUFQtNFxuICAgIGlmIChleGlzdGluZ1NjcmlwdCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIFNjcmlwdCBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcCwgdXNpbmcgZXhpc3Rpbmcgc2NyaXB0JyxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBhZGRTY2VuZUlkcyhleGlzdGluZ1NjcmlwdC5zY2VuZXMpO1xuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPSBleGlzdGluZ1NjcmlwdC52b2ljZVRvbmVJbnN0cnVjdGlvbjtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIE5vIGV4aXN0aW5nIHNjcmlwdCBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgc3RvcnkgYnJlYWtkb3duJyxcbiAgICAgICk7XG5cbiAgICAgIGlmICghcmVxdWVzdC5wcm9tcHQpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogTm8gcHJvbXB0IHByb3ZpZGVkJyk7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gcHJvbXB0IHByb3ZpZGVkJyk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHN0b3J5QnJlYWtkb3duID0gYXdhaXQgZ2VuZXJhdGVTdG9yeUJyZWFrZG93bihcbiAgICAgICAgcmVxdWVzdC5wcm9tcHQhLFxuICAgICAgICByZXF1ZXN0LnNjZW5lQ291bnQsXG4gICAgICAgIHNjZW5lRHVyYXRpb24sXG4gICAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbixcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBzdG9yeUJyZWFrZG93bi5zY2VuZXM7XG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9IHN0b3J5QnJlYWtkb3duLnZvaWNlVG9uZUluc3RydWN0aW9uO1xuICAgIH1cblxuICAgIGlmICghc2NlbmVzIHx8IHNjZW5lcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IEZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CfjqUgU3RvcnkgYnJlYWtkb3duIGdlbmVyYXRlZDonLCBzY2VuZXMpO1xuICAgIGNvbnNvbGUubG9nKCfwn5a877iPIFJlY2VpdmVkIGltYWdlVGVtcGxhdGU6JywgcmVxdWVzdC5pbWFnZVRlbXBsYXRlKTtcblxuICAgIC8vIFN0ZXAgMjogR2VuZXJhdGUgaW1hZ2VzIGZvciBlYWNoIHNjZW5lIGluIHBhcmFsbGVsXG4gICAgLy8gQ2hlY2sgaWYgdGhlcmUgYXJlIGFscmVhZHkgaW1hZ2VzIGdlbmVyYXRlZCBpbiB0aGUgczMgYnVja2V0IGZvciB0aGUgdGltZXN0YW1wXG4gICAgbGV0IGltYWdlVXJscyA9IGF3YWl0IGdldEltYWdlVXJscyhyZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wKTtcblxuICAgIGlmIChpbWFnZVVybHMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coJ/CfjqUgSW1hZ2VzIGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wOicsIGltYWdlVXJscyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHNlZWQgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMDAwKTtcblxuICAgICAgY29uc29sZS5sb2coJ/CfjqggR2VuZXJhdGluZyBpbWFnZXMgZm9yIGVhY2ggc2NlbmUgaW4gcGFyYWxsZWwuLi4nKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHNjZW5lcy5tYXAoYXN5bmMgKHNjZW5lOiBhbnksIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYPCfjqggR2VuZXJhdGluZyBpbWFnZSBmb3Igc2NlbmUgJHtpICsgMX06YCxcbiAgICAgICAgICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zdCBpbWFnZURlc2NyaXB0aW9uID0gYFske3JlcXVlc3QuaW1hZ2VUZW1wbGF0ZX1dOiAke3NjZW5lLmRlc2NyaXB0aW9ufWA7XG5cbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnZW5lcmF0ZU5hbm9CYW5hbmFJbWFnZShcbiAgICAgICAgICAgIGltYWdlRGVzY3JpcHRpb24sXG4gICAgICAgICAgICBzY2VuZS5pZCxcbiAgICAgICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICAgICAgc2VlZCxcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc29sZS5sb2coYOKchSBTY2VuZSAke2kgKyAxfSBpbWFnZSBnZW5lcmF0ZWQ6IGRvbmVgKTtcbiAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBXYWl0IGZvciBhbGwgaW1hZ2VzIHRvIGJlIGdlbmVyYXRlZCB1c2luZyBhbGxTZXR0bGVkIGZvciBiZXR0ZXIgZXJyb3IgaGFuZGxpbmdcbiAgICAgICAgY29uc29sZS5sb2coJ+KPsyBXYWl0aW5nIGZvciBhbGwgaW1hZ2UgZ2VuZXJhdGlvbiB0byBjb21wbGV0ZS4uLicpO1xuICAgICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKGltYWdlUHJvbWlzZXMpO1xuXG4gICAgICAgIC8vIExvZyByZXN1bHRzIGFuZCBoYW5kbGUgZmFpbHVyZXNcbiAgICAgICAgY29uc3Qgc3VjY2Vzc2Z1bCA9IHJlc3VsdHMuZmlsdGVyKFxuICAgICAgICAgIChyZXN1bHQpID0+IHJlc3VsdC5zdGF0dXMgPT09ICdmdWxmaWxsZWQnLFxuICAgICAgICApO1xuICAgICAgICBjb25zdCBmYWlsZWQgPSByZXN1bHRzLmZpbHRlcigocmVzdWx0KSA9PiByZXN1bHQuc3RhdHVzID09PSAncmVqZWN0ZWQnKTtcblxuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBg4pyFIEltYWdlIGdlbmVyYXRpb24gcmVzdWx0czogJHtzdWNjZXNzZnVsLmxlbmd0aH0gc3VjY2Vzc2Z1bCwgJHtmYWlsZWQubGVuZ3RofSBmYWlsZWRgLFxuICAgICAgICApO1xuXG4gICAgICAgIC8vIExvZyBmYWlsZWQgcHJvbWlzZXMgd2l0aCBkZXRhaWxlZCBlcnJvciBpbmZvXG4gICAgICAgIGZhaWxlZC5mb3JFYWNoKChyZXN1bHQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdC5zdGF0dXMgPT09ICdyZWplY3RlZCcpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICAgIGDinYwgU2NlbmUgJHtpbmRleH0gaW1hZ2UgZ2VuZXJhdGlvbiBmYWlsZWQ6YCxcbiAgICAgICAgICAgICAgcmVzdWx0LnJlYXNvbixcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBDb250aW51ZSBwcm9jZXNzaW5nIGV2ZW4gaWYgc29tZSBpbWFnZXMgZmFpbGVkXG4gICAgICAgIGlmIChzdWNjZXNzZnVsLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQWxsIGltYWdlIGdlbmVyYXRpb24gYXR0ZW1wdHMgZmFpbGVkJyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBg8J+OqCBTdWNjZXNzZnVsbHkgZ2VuZXJhdGVkICR7c3VjY2Vzc2Z1bC5sZW5ndGh9IG91dCBvZiAke3Jlc3VsdHMubGVuZ3RofSBpbWFnZXNgLFxuICAgICAgICApO1xuXG4gICAgICAgIC8vIGlmIChnZW5lcmF0ZWRJbWFnZVVybHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIC8vICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogTm8gaW1hZ2VzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgICAgIC8vICAgdGhyb3cgbmV3IEVycm9yKCdObyBpbWFnZXMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAgICAgLy8gfVxuXG4gICAgICAgIC8vIC8vIHVwbG9hZCBpbWFnZVVybHMgdG8gczMgdXNpbmcgdXBsb2FkSW1hZ2VUb1MzXG4gICAgICAgIC8vIGNvbnN0IHVwbG9hZFByb21pc2VzID0gZ2VuZXJhdGVkSW1hZ2VVcmxzLm1hcCgoaW1hZ2VVcmwsIGkpID0+XG4gICAgICAgIC8vICAgdXBsb2FkSW1hZ2VUb1MzKGltYWdlVXJsLCByZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCBzY2VuZXNbaV0uaWQpLFxuICAgICAgICAvLyApO1xuICAgICAgICAvLyBhd2FpdCBQcm9taXNlLmFsbChpbWFnZVByb21pc2VzKTtcblxuICAgICAgICBjb25zb2xlLmxvZygn8J+WvO+4jyBJbWFnZXMgdXBsb2FkZWQgdG8gUzMnKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gZ2VuZXJhdGUgaW1hZ2VzOicsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjaGVjayBpZiBhbGwgdG9nZXRoZXIgaWYgLm1wMywgLnN1YnRpdGxlLmpzb24sIC5hc3MgZmlsZXMgYXJlIGFscmVhZHkgZXhpc3RzIGluIHRoZSBzMyBidWNrZXQgYW5kIHJldHVybiBib29sZWFuXG4gICAgY29uc3QgYXVkaW9DYXB0aW9uRmlsZXNFeGlzdCA9IGF3YWl0IGNoZWNrQXVkaW9DYXB0aW9uRXhpc3RzKFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgKTtcbiAgICBpZiAoYXVkaW9DYXB0aW9uRmlsZXNFeGlzdCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIEF1ZGlvLCBzdWJ0aXRsZSwgYW5kIGFzcyBmaWxlcyBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcDonLFxuICAgICAgICBhdWRpb0NhcHRpb25GaWxlc0V4aXN0LFxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIE5vIGV4aXN0aW5nIGF1ZGlvLCBzdWJ0aXRsZSwgYW5kIGFzcyBmaWxlcyBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgbmFycmF0aW9uJyxcbiAgICAgICk7XG5cbiAgICAgIC8vIFN0ZXAgMzogR2VuZXJhdGUgYXVkaW8gZmlsZXMgd2l0aCB3b3JkLWxldmVsIHRpbWVzdGFtcHNcbiAgICAgIGNvbnN0IHsgc3VidGl0bGVzIH0gPSBhd2FpdCBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgICAgICAgc2NlbmVzLFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbixcbiAgICAgICAgcmVxdWVzdC52b2ljZSB8fCBERUZBVUxUX1ZPSUNFLFxuICAgICAgICByZXF1ZXN0Lmxhbmd1YWdlIHx8IERFRkFVTFRfTEFOR1VBR0UsXG4gICAgICApO1xuXG4gICAgICAvLyB1cGRhdGUgc2NlbmVzIGR1cmF0aW9uXG4gICAgICBzY2VuZXMuZm9yRWFjaCgoc2NlbmUsIGkpID0+IHtcbiAgICAgICAgc2NlbmUuZHVyYXRpb24gPSBzdWJ0aXRsZXNbaV0uZHVyYXRpb24gfHwgMTA7XG4gICAgICAgIGNvbnNvbGUubG9nKCdzdWJ0aXRsZXNbaV0uZHVyYXRpb246Jywgc3VidGl0bGVzW2ldLmR1cmF0aW9uKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBTdGVwIDQ6IEdlbmVyYXRlIHN1YnRpdGxlIGZpbGVcbiAgICAgIGF3YWl0IGdlbmVyYXRlU3VidGl0bGVzKHNjZW5lcywgcmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCwgc3VidGl0bGVzKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICfwn46lIFNjZW5lcyBiZWZvcmUgY3JlYXRpbmcgbWFuaWZlc3Q6JyxcbiAgICAgIEpTT04uc3RyaW5naWZ5KHNjZW5lcywgbnVsbCwgMiksXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBtYW5pZmVzdCBhbmQgdXBsb2FkIHRvIHMzXG4gICAgYXdhaXQgY3JlYXRlTWFuaWZlc3QoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHNjZW5lcyxcbiAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbixcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uLFxuICAgICAgcmVxdWVzdC52b2ljZSB8fCBERUZBVUxUX1ZPSUNFLFxuICAgICAgcmVxdWVzdC5sYW5ndWFnZSB8fCBERUZBVUxUX0xBTkdVQUdFLFxuICAgICAgcmVxdWVzdC5pbWFnZVRlbXBsYXRlLFxuICAgICk7XG5cbiAgICBtYW5pZmVzdCA9IGF3YWl0IGdldE1hbmlmZXN0KHJlcXVlc3QudXNlcklkLCByZXF1ZXN0LnRpbWVzdGFtcCk7XG5cbiAgICBsZXQgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICdhdWRpb19zdWJ0aXRsZV9jcmVhdGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAge1xuICAgICAgICBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCxcbiAgICAgIH0sXG4gICAgICAnQXVkaW8gYW5kIFN1YnRpdGxlcyBjb21wbGV0ZWQnLFxuICAgICk7XG5cbiAgICAvLyBnZXQgdGhlIHVzZXIncyBzdWJzY3JpcHRpb25cbiAgICBjb25zdCB1c2VyID0gYXdhaXQgZ2V0VXNlcihyZXF1ZXN0LnVzZXJJZCk7XG4gICAgY29uc29sZS5sb2coJ1VzZXIgZmV0Y2hlZDonLCBKU09OLnN0cmluZ2lmeSh1c2VyLCBudWxsLCAyKSk7XG5cbiAgICAvLyBTdGVwIDQ6IEdlbmVyYXRlIGNhbWVyYSBtb3ZlbWVudHMgZnJvbSBpbWFnZVxuICAgIC8vIGNoZWNrIGlmIHRoZXJlIGFyZSBhbHJlYWR5IGFsbCB0aGUgdmlkZW8gZWZmZWN0cyBnZW5lcmF0ZWQgaW4gdGhlIHMzIGJ1Y2tldCBmb3IgdGhlIHRpbWVzdGFtcFxuICAgIGF3YWl0IGdldFZpZGVvRWZmZWN0VXJscyhyZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCBzY2VuZXMsIHVzZXIpO1xuXG4gICAgY29uc29sZS5sb2coJ/CfjqwgVmlkZW8gZWZmZWN0cyBVUkxzIGdlbmVyYXRlZDonKTtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICfwn46sIE1hbmlmZXN0IHByZXZpZXcgY29tcGxldGVkOicsXG4gICAgICBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCwgbnVsbCwgMiksXG4gICAgKTtcblxuICAgIG1hbmlmZXN0SHlkcmF0ZWQgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAncHJldmlld19jb21wbGV0ZWQnLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICB7IG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkIH0sXG4gICAgICAnVmlkZW8gZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgKTtcblxuICAgIC8vIElmIHRoaXMgd2FzIHRyaWdnZXJlZCBieSBTUVMsIGRlbGV0ZSB0aGUgbWVzc2FnZSBmcm9tIHRoZSBxdWV1ZVxuICAgIGlmIChyZWNvcmQgJiYgcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMKSB7XG4gICAgICBjb25zdCBkZWxldGVDb21tYW5kID0gbmV3IERlbGV0ZU1lc3NhZ2VDb21tYW5kKHtcbiAgICAgICAgUXVldWVVcmw6IHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCxcbiAgICAgICAgUmVjZWlwdEhhbmRsZTogcmVjb3JkLnJlY2VpcHRIYW5kbGUsXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHNxcy5zZW5kKGRlbGV0ZUNvbW1hbmQpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBtZXNzYWdlOiAnUHJldmlldyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGluIHZpZGVvIGdlbmVyYXRpb246JywgZXJyb3IpO1xuICAgIHRocm93IEVycm9yKCdWaWRlbyBnZW5lcmF0aW9uIGZhaWxlZCcpO1xuICB9XG59XG4iXX0=