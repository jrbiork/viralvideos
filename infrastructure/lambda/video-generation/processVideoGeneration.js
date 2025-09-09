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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NWaWRlb0dlbmVyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUEwQ0Esd0RBbVFDO0FBNVNELG9EQUFzRTtBQUV0RSwwQ0FBbUQ7QUFDbkQsa0RBQXVEO0FBQ3ZELDRDQUE4QztBQUM5Qyw0Q0FBZ0U7QUFDaEUsb0RBQWtFO0FBQ2xFLGtEQUE0RDtBQUM1RCxvREFBbUQ7QUFDbkQsOERBQW1FO0FBRW5FLFlBQVk7QUFDWixNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUM7QUFDNUIsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7QUFDOUIsd0RBQTJEO0FBQzNELDBEQUlnQztBQUNoQyxrRUFBK0Q7QUFFL0QsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFtQnRFLEtBQUssVUFBVSxzQkFBc0IsQ0FDMUMsT0FBK0IsRUFDL0IsTUFBa0I7SUFFbEIsSUFBSSxDQUFDO1FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVoRCxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU3QyxnQkFBZ0I7UUFDaEIsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQztRQUVwQyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUM5QixPQUFPLENBQUMsYUFBYSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQzNDLENBQUM7UUFFRixJQUFJLE1BQU0sR0FBWSxFQUFFLENBQUM7UUFDekIsSUFBSSxvQkFBb0IsR0FBVyxFQUFFLENBQUM7UUFFdEMsMENBQTBDO1FBQzFDLElBQUksUUFBUSxHQUFHLE1BQU0sSUFB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dXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNRU1JlY29yZCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgU1FTQ2xpZW50LCBEZWxldGVNZXNzYWdlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVJbWFnZSB9IGZyb20gJy4uL3V0aWxzL2ltYWdlJztcbmltcG9ydCB7IGdlbmVyYXRlTmFycmF0aW9uIH0gZnJvbSAnLi4vdXRpbHMvYXVkaW8nO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdWJ0aXRsZXMgfSBmcm9tICcuLi91dGlscy9zdWJ0aXRsZXMnO1xuaW1wb3J0IHsgYWRkU2NlbmVJZHMgfSBmcm9tICcuLi91dGlscy9zY3JpcHQnO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdG9yeUJyZWFrZG93biwgU2NlbmUgfSBmcm9tICcuLi91dGlscy9zY3JpcHQnO1xuaW1wb3J0IHsgdXBsb2FkVG9TMywgZ2V0T2JqZWN0RnJvbVMzIH0gZnJvbSAnLi4vdXRpbHMvczNVcGxvYWRlcic7XG5pbXBvcnQgeyBjaGVja0F1ZGlvQ2FwdGlvbkV4aXN0cyB9IGZyb20gJy4vdXRpbC9hdWRpb1V0aWxzJztcbmltcG9ydCB7IGdldEltYWdlVXJscyB9IGZyb20gJy4uL3V0aWxzL2ltYWdlVXRpbHMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVOYW5vQmFuYW5hSW1hZ2UgfSBmcm9tICcuLi91dGlscy9pbWFnZU5hbm9CYW5hbmEnO1xuXG4vLyBDb25zdGFudHNcbmNvbnN0IERFRkFVTFRfVk9JQ0UgPSAnYXNoJztcbmNvbnN0IERFRkFVTFRfTEFOR1VBR0UgPSAnZW4nO1xuaW1wb3J0IHsgZ2V0VmlkZW9FZmZlY3RVcmxzIH0gZnJvbSAnLi4vdXRpbHMvdmlkZW9FZmZlY3RzJztcbmltcG9ydCB7XG4gIGNyZWF0ZU1hbmlmZXN0LFxuICBnZXRNYW5pZmVzdCxcbiAgaHlkcmF0ZU1hbmlmZXN0LFxufSBmcm9tICcuLi91dGlscy9tYW5pZmVzdFV0aWxzJztcbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi4vdXRpbHMvYnJvYWRjYXN0UHJvZ3Jlc3MnO1xuXG5jb25zdCBzcXMgPSBuZXcgU1FTQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZpZGVvR2VuZXJhdGlvblJlcXVlc3Qge1xuICB0eXBlPzpcbiAgICB8ICdnZW5lcmF0ZS12aWRlbydcbiAgICB8ICdzYXZlLWltYWdlJ1xuICAgIHwgJ2FuaW1hdGUtaW1hZ2UnXG4gICAgfCAnY29tYmluZS12aWRlbydcbiAgICB8ICdjcmVhdGUtc2NlbmUnO1xuICBwcm9tcHQ/OiBzdHJpbmc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyO1xuICBzY2VuZUNvdW50OiBudW1iZXI7XG4gIHN0ZXA6IG51bWJlcjtcbiAgdm9pY2U/OiBzdHJpbmc7XG4gIGxhbmd1YWdlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbihcbiAgcmVxdWVzdDogVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCxcbiAgcmVjb3JkPzogU1FTUmVjb3JkLFxuKTogUHJvbWlzZTxhbnk+IHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZygncHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbjonLCByZXF1ZXN0KTtcblxuICAgIGNvbnNvbGUubG9nKCdyZXF1ZXN0LnZvaWNlOicsIHJlcXVlc3Qudm9pY2UpO1xuXG4gICAgLy8gVXNlIHRpbWVzdGFtcFxuICAgIGNvbnN0IHRpbWVzdGFtcCA9IHJlcXVlc3QudGltZXN0YW1wO1xuXG4gICAgY29uc3Qgc2NlbmVEdXJhdGlvbiA9IE1hdGguZmxvb3IoXG4gICAgICByZXF1ZXN0LnRvdGFsRHVyYXRpb24gLyByZXF1ZXN0LnNjZW5lQ291bnQsXG4gICAgKTtcblxuICAgIGxldCBzY2VuZXM6IFNjZW5lW10gPSBbXTtcbiAgICBsZXQgdm9pY2VUb25lSW5zdHJ1Y3Rpb246IHN0cmluZyA9ICcnO1xuXG4gICAgLy8gY2hlY2sgaWYgdGhlIHZpZGVvIGlzIGFscmVhZHkgZ2VuZXJhdGVkXG4gICAgbGV0IG1hbmlmZXN0ID0gYXdhaXQgZ2V0TWFuaWZlc3QocmVxdWVzdC51c2VySWQsIHJlcXVlc3QudGltZXN0YW1wKTtcblxuICAgIGlmIChtYW5pZmVzdCkge1xuICAgICAgY29uc29sZS5sb2coJ/CfjqUgVmlkZW8gYWxyZWFkeSBnZW5lcmF0ZWQsIHNraXBwaW5nIHZpZGVvIGdlbmVyYXRpb24nKTtcbiAgICAgIGNvbnN0IG1hbmlmZXN0SHlkcmF0ZWQgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuICAgICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAgICdwcmV2aWV3X2NvbXBsZXRlZCcsXG4gICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICByZXF1ZXN0LnRpbWVzdGFtcCxcbiAgICAgICAgeyBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCB9LFxuICAgICAgICAnVmlkZW8gZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICApO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgbWVzc2FnZTogJ1ZpZGVvIGFscmVhZHkgZ2VuZXJhdGVkJyxcbiAgICAgICAgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQsXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoZXJlIGlzIGFscmVhZHkgc2NyaXB0IGdlbmVyYXRlZCBpbiB0aGUgczMgYnVja2V0IGZvciB0aGUgdGltZXN0YW1wXG4gICAgY29uc3Qgc2NyaXB0S2V5ID0gYCR7cmVxdWVzdC51c2VySWR9LyR7dGltZXN0YW1wfS5zY3JpcHQudHh0YDtcbiAgICBjb25zdCBleGlzdGluZ1NjcmlwdCA9IGF3YWl0IGdldE9iamVjdEZyb21TMyhzY3JpcHRLZXkpO1xuXG4gICAgLy8gU3RlcCAxOiBHZW5lcmF0ZSBzY3JpcHQvc3RvcnkgYnJlYWtkb3duIHVzaW5nIEdQVC00XG4gICAgaWYgKGV4aXN0aW5nU2NyaXB0KSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgU2NyaXB0IGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wLCB1c2luZyBleGlzdGluZyBzY3JpcHQnLFxuICAgICAgKTtcbiAgICAgIHNjZW5lcyA9IGFkZFNjZW5lSWRzKGV4aXN0aW5nU2NyaXB0LnNjZW5lcyk7XG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9IGV4aXN0aW5nU2NyaXB0LnZvaWNlVG9uZUluc3RydWN0aW9uO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgTm8gZXhpc3Rpbmcgc2NyaXB0IGZvdW5kLCBnZW5lcmF0aW5nIG5ldyBzdG9yeSBicmVha2Rvd24nLFxuICAgICAgKTtcblxuICAgICAgaWYgKCFyZXF1ZXN0LnByb21wdCkge1xuICAgICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyBwcm9tcHQgcHJvdmlkZWQnKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBwcm9tcHQgcHJvdmlkZWQnKTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc3RvcnlCcmVha2Rvd24gPSBhd2FpdCBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duKFxuICAgICAgICByZXF1ZXN0LnByb21wdCEsXG4gICAgICAgIHJlcXVlc3Quc2NlbmVDb3VudCxcbiAgICAgICAgc2NlbmVEdXJhdGlvbixcbiAgICAgICAgcmVxdWVzdC50b3RhbER1cmF0aW9uLFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgKTtcbiAgICAgIHNjZW5lcyA9IHN0b3J5QnJlYWtkb3duLnNjZW5lcztcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uID0gc3RvcnlCcmVha2Rvd24udm9pY2VUb25lSW5zdHJ1Y3Rpb247XG4gICAgfVxuXG4gICAgaWYgKCFzY2VuZXMgfHwgc2NlbmVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogRmFpbGVkIHRvIGdldCBvciBnZW5lcmF0ZSBzdG9yeSBicmVha2Rvd24nKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdldCBvciBnZW5lcmF0ZSBzdG9yeSBicmVha2Rvd24nKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZygn8J+OpSBTdG9yeSBicmVha2Rvd24gZ2VuZXJhdGVkOicsIHNjZW5lcyk7XG5cbiAgICAvLyBTdGVwIDI6IEdlbmVyYXRlIGltYWdlcyBmb3IgZWFjaCBzY2VuZSBpbiBwYXJhbGxlbFxuICAgIC8vIENoZWNrIGlmIHRoZXJlIGFyZSBhbHJlYWR5IGltYWdlcyBnZW5lcmF0ZWQgaW4gdGhlIHMzIGJ1Y2tldCBmb3IgdGhlIHRpbWVzdGFtcFxuICAgIGxldCBpbWFnZVVybHMgPSBhd2FpdCBnZXRJbWFnZVVybHMocmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCk7XG5cbiAgICBpZiAoaW1hZ2VVcmxzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn46lIEltYWdlcyBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcDonLCBpbWFnZVVybHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBzZWVkID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMDAwMCk7XG5cbiAgICAgIGNvbnNvbGUubG9nKCfwn46oIEdlbmVyYXRpbmcgaW1hZ2VzIGZvciBlYWNoIHNjZW5lIGluIHBhcmFsbGVsLi4uJyk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBzY2VuZXMubWFwKGFzeW5jIChzY2VuZTogYW55LCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgIGDwn46oIEdlbmVyYXRpbmcgaW1hZ2UgZm9yIHNjZW5lICR7aSArIDF9OmAsXG4gICAgICAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZ2VuZXJhdGVOYW5vQmFuYW5hSW1hZ2UoXG4gICAgICAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAgICAgICAgIHNjZW5lLmlkLFxuICAgICAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgICAgICBzZWVkLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pyFIFNjZW5lICR7aSArIDF9IGltYWdlIGdlbmVyYXRlZDogZG9uZWApO1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFdhaXQgZm9yIGFsbCBpbWFnZXMgdG8gYmUgZ2VuZXJhdGVkIHVzaW5nIGFsbFNldHRsZWQgZm9yIGJldHRlciBlcnJvciBoYW5kbGluZ1xuICAgICAgICBjb25zb2xlLmxvZygn4o+zIFdhaXRpbmcgZm9yIGFsbCBpbWFnZSBnZW5lcmF0aW9uIHRvIGNvbXBsZXRlLi4uJyk7XG4gICAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoaW1hZ2VQcm9taXNlcyk7XG5cbiAgICAgICAgLy8gTG9nIHJlc3VsdHMgYW5kIGhhbmRsZSBmYWlsdXJlc1xuICAgICAgICBjb25zdCBzdWNjZXNzZnVsID0gcmVzdWx0cy5maWx0ZXIoXG4gICAgICAgICAgKHJlc3VsdCkgPT4gcmVzdWx0LnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcsXG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IGZhaWxlZCA9IHJlc3VsdHMuZmlsdGVyKChyZXN1bHQpID0+IHJlc3VsdC5zdGF0dXMgPT09ICdyZWplY3RlZCcpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGDinIUgSW1hZ2UgZ2VuZXJhdGlvbiByZXN1bHRzOiAke3N1Y2Nlc3NmdWwubGVuZ3RofSBzdWNjZXNzZnVsLCAke2ZhaWxlZC5sZW5ndGh9IGZhaWxlZGAsXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gTG9nIGZhaWxlZCBwcm9taXNlcyB3aXRoIGRldGFpbGVkIGVycm9yIGluZm9cbiAgICAgICAgZmFpbGVkLmZvckVhY2goKHJlc3VsdCwgaW5kZXgpID0+IHtcbiAgICAgICAgICBpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJykge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgICAgYOKdjCBTY2VuZSAke2luZGV4fSBpbWFnZSBnZW5lcmF0aW9uIGZhaWxlZDpgLFxuICAgICAgICAgICAgICByZXN1bHQucmVhc29uLFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIENvbnRpbnVlIHByb2Nlc3NpbmcgZXZlbiBpZiBzb21lIGltYWdlcyBmYWlsZWRcbiAgICAgICAgaWYgKHN1Y2Nlc3NmdWwubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdBbGwgaW1hZ2UgZ2VuZXJhdGlvbiBhdHRlbXB0cyBmYWlsZWQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGDwn46oIFN1Y2Nlc3NmdWxseSBnZW5lcmF0ZWQgJHtzdWNjZXNzZnVsLmxlbmd0aH0gb3V0IG9mICR7cmVzdWx0cy5sZW5ndGh9IGltYWdlc2AsXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gaWYgKGdlbmVyYXRlZEltYWdlVXJscy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgLy8gICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyBpbWFnZXMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAgICAgLy8gICB0aHJvdyBuZXcgRXJyb3IoJ05vIGltYWdlcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgICAgICAvLyB9XG5cbiAgICAgICAgLy8gLy8gdXBsb2FkIGltYWdlVXJscyB0byBzMyB1c2luZyB1cGxvYWRJbWFnZVRvUzNcbiAgICAgICAgLy8gY29uc3QgdXBsb2FkUHJvbWlzZXMgPSBnZW5lcmF0ZWRJbWFnZVVybHMubWFwKChpbWFnZVVybCwgaSkgPT5cbiAgICAgICAgLy8gICB1cGxvYWRJbWFnZVRvUzMoaW1hZ2VVcmwsIHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXAsIHNjZW5lc1tpXS5pZCksXG4gICAgICAgIC8vICk7XG4gICAgICAgIC8vIGF3YWl0IFByb21pc2UuYWxsKGltYWdlUHJvbWlzZXMpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5a877iPIEltYWdlcyB1cGxvYWRlZCB0byBTMycpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEZhaWxlZCB0byBnZW5lcmF0ZSBpbWFnZXM6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIGNoZWNrIGlmIGFsbCB0b2dldGhlciBpZiAubXAzLCAuc3VidGl0bGUuanNvbiwgLmFzcyBmaWxlcyBhcmUgYWxyZWFkeSBleGlzdHMgaW4gdGhlIHMzIGJ1Y2tldCBhbmQgcmV0dXJuIGJvb2xlYW5cbiAgICBjb25zdCBhdWRpb0NhcHRpb25GaWxlc0V4aXN0ID0gYXdhaXQgY2hlY2tBdWRpb0NhcHRpb25FeGlzdHMoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICApO1xuICAgIGlmIChhdWRpb0NhcHRpb25GaWxlc0V4aXN0KSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgQXVkaW8sIHN1YnRpdGxlLCBhbmQgYXNzIGZpbGVzIGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wOicsXG4gICAgICAgIGF1ZGlvQ2FwdGlvbkZpbGVzRXhpc3QsXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgTm8gZXhpc3RpbmcgYXVkaW8sIHN1YnRpdGxlLCBhbmQgYXNzIGZpbGVzIGZvdW5kLCBnZW5lcmF0aW5nIG5ldyBuYXJyYXRpb24nLFxuICAgICAgKTtcblxuICAgICAgLy8gU3RlcCAzOiBHZW5lcmF0ZSBhdWRpbyBmaWxlcyB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wc1xuICAgICAgY29uc3QgeyBzdWJ0aXRsZXMgfSA9IGF3YWl0IGdlbmVyYXRlTmFycmF0aW9uKFxuICAgICAgICBzY2VuZXMsXG4gICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uLFxuICAgICAgICByZXF1ZXN0LnZvaWNlIHx8IERFRkFVTFRfVk9JQ0UsXG4gICAgICAgIHJlcXVlc3QubGFuZ3VhZ2UgfHwgREVGQVVMVF9MQU5HVUFHRSxcbiAgICAgICk7XG5cbiAgICAgIC8vIHVwZGF0ZSBzY2VuZXMgZHVyYXRpb25cbiAgICAgIHNjZW5lcy5mb3JFYWNoKChzY2VuZSwgaSkgPT4ge1xuICAgICAgICBzY2VuZS5kdXJhdGlvbiA9IHN1YnRpdGxlc1tpXS5kdXJhdGlvbiB8fCAxMDtcbiAgICAgICAgY29uc29sZS5sb2coJ3N1YnRpdGxlc1tpXS5kdXJhdGlvbjonLCBzdWJ0aXRsZXNbaV0uZHVyYXRpb24pO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFN0ZXAgNDogR2VuZXJhdGUgc3VidGl0bGUgZmlsZVxuICAgICAgYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZXMoc2NlbmVzLCByZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCBzdWJ0aXRsZXMpO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKFxuICAgICAgJ/CfjqUgU2NlbmVzIGJlZm9yZSBjcmVhdGluZyBtYW5pZmVzdDonLFxuICAgICAgSlNPTi5zdHJpbmdpZnkoc2NlbmVzLCBudWxsLCAyKSxcbiAgICApO1xuXG4gICAgLy8gQ3JlYXRlIG1hbmlmZXN0IGFuZCB1cGxvYWQgdG8gczNcbiAgICBhd2FpdCBjcmVhdGVNYW5pZmVzdChcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc2NlbmVzLFxuICAgICAgcmVxdWVzdC50b3RhbER1cmF0aW9uLFxuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24sXG4gICAgICByZXF1ZXN0LnZvaWNlIHx8IERFRkFVTFRfVk9JQ0UsXG4gICAgICByZXF1ZXN0Lmxhbmd1YWdlIHx8IERFRkFVTFRfTEFOR1VBR0UsXG4gICAgKTtcblxuICAgIG1hbmlmZXN0ID0gYXdhaXQgZ2V0TWFuaWZlc3QocmVxdWVzdC51c2VySWQsIHJlcXVlc3QudGltZXN0YW1wKTtcblxuICAgIGxldCBtYW5pZmVzdEh5ZHJhdGVkID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgJ2F1ZGlvX3N1YnRpdGxlX2NyZWF0ZWQnLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICB7XG4gICAgICAgIG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkLFxuICAgICAgfSxcbiAgICAgICdBdWRpbyBhbmQgU3VidGl0bGVzIGNvbXBsZXRlZCcsXG4gICAgKTtcblxuICAgIC8vIFN0ZXAgNDogR2VuZXJhdGUgY2FtZXJhIG1vdmVtZW50cyBmcm9tIGltYWdlXG4gICAgLy8gY2hlY2sgaWYgdGhlcmUgYXJlIGFscmVhZHkgYWxsIHRoZSB2aWRlbyBlZmZlY3RzIGdlbmVyYXRlZCBpbiB0aGUgczMgYnVja2V0IGZvciB0aGUgdGltZXN0YW1wXG4gICAgYXdhaXQgZ2V0VmlkZW9FZmZlY3RVcmxzKHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXAsIHNjZW5lcyk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OrCBWaWRlbyBlZmZlY3RzIFVSTHMgZ2VuZXJhdGVkOicpO1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgJ/CfjqwgTWFuaWZlc3QgcHJldmlldyBjb21wbGV0ZWQ6JyxcbiAgICAgIEpTT04uc3RyaW5naWZ5KG1hbmlmZXN0LCBudWxsLCAyKSxcbiAgICApO1xuXG4gICAgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICdwcmV2aWV3X2NvbXBsZXRlZCcsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHsgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQgfSxcbiAgICAgICdWaWRlbyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICApO1xuXG4gICAgLy8gSWYgdGhpcyB3YXMgdHJpZ2dlcmVkIGJ5IFNRUywgZGVsZXRlIHRoZSBtZXNzYWdlIGZyb20gdGhlIHF1ZXVlXG4gICAgaWYgKHJlY29yZCAmJiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwpIHtcbiAgICAgIGNvbnN0IGRlbGV0ZUNvbW1hbmQgPSBuZXcgRGVsZXRlTWVzc2FnZUNvbW1hbmQoe1xuICAgICAgICBRdWV1ZVVybDogcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMLFxuICAgICAgICBSZWNlaXB0SGFuZGxlOiByZWNvcmQucmVjZWlwdEhhbmRsZSxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgc3FzLnNlbmQoZGVsZXRlQ29tbWFuZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIG1lc3NhZ2U6ICdQcmV2aWV3IGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gdmlkZW8gZ2VuZXJhdGlvbjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cbiJdfQ==