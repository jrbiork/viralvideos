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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NWaWRlb0dlbmVyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUEyQ0Esd0RBbVFDO0FBN1NELG9EQUFzRTtBQUV0RSwwQ0FBbUQ7QUFDbkQsa0RBQXVEO0FBQ3ZELDRDQUE4QztBQUM5Qyw0Q0FBZ0U7QUFDaEUsb0RBQWtFO0FBQ2xFLGtEQUE0RDtBQUM1RCxvREFBbUQ7QUFDbkQsOERBQW1FO0FBRW5FLFlBQVk7QUFDWixNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUM7QUFDNUIsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUM7QUFDOUIsd0RBQTJEO0FBQzNELDBEQUlnQztBQUNoQyxrRUFBK0Q7QUFFL0QsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFvQnRFLEtBQUssVUFBVSxzQkFBc0IsQ0FDMUMsT0FBK0IsRUFDL0IsTUFBa0I7SUFFbEIsSUFBSSxDQUFDO1FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVoRCxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU3QyxnQkFBZ0I7UUFDaEIsTUFBTSxTQUFTLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQztRQUVwQyxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUM5QixPQUFPLENBQUMsYUFBYSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQzNDLENBQUM7UUFFRixJQUFJLE1BQU0sR0FBWSxFQUFFLENBQUM7UUFDekIsSUFBSSxvQkFBb0IsR0FBVyxFQUFFLENBQUM7UUFFdEMsMENBQTBDO1FBQzFDLElBQUksUUFBUSxHQUFHLE1BQU0sSUFB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dXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNRU1JlY29yZCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgU1FTQ2xpZW50LCBEZWxldGVNZXNzYWdlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVJbWFnZSB9IGZyb20gJy4uL3V0aWxzL2ltYWdlJztcbmltcG9ydCB7IGdlbmVyYXRlTmFycmF0aW9uIH0gZnJvbSAnLi4vdXRpbHMvYXVkaW8nO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdWJ0aXRsZXMgfSBmcm9tICcuLi91dGlscy9zdWJ0aXRsZXMnO1xuaW1wb3J0IHsgYWRkU2NlbmVJZHMgfSBmcm9tICcuLi91dGlscy9zY3JpcHQnO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdG9yeUJyZWFrZG93biwgU2NlbmUgfSBmcm9tICcuLi91dGlscy9zY3JpcHQnO1xuaW1wb3J0IHsgdXBsb2FkVG9TMywgZ2V0T2JqZWN0RnJvbVMzIH0gZnJvbSAnLi4vdXRpbHMvczNVcGxvYWRlcic7XG5pbXBvcnQgeyBjaGVja0F1ZGlvQ2FwdGlvbkV4aXN0cyB9IGZyb20gJy4vdXRpbC9hdWRpb1V0aWxzJztcbmltcG9ydCB7IGdldEltYWdlVXJscyB9IGZyb20gJy4uL3V0aWxzL2ltYWdlVXRpbHMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVOYW5vQmFuYW5hSW1hZ2UgfSBmcm9tICcuLi91dGlscy9pbWFnZU5hbm9CYW5hbmEnO1xuXG4vLyBDb25zdGFudHNcbmNvbnN0IERFRkFVTFRfVk9JQ0UgPSAnYXNoJztcbmNvbnN0IERFRkFVTFRfTEFOR1VBR0UgPSAnZW4nO1xuaW1wb3J0IHsgZ2V0VmlkZW9FZmZlY3RVcmxzIH0gZnJvbSAnLi4vdXRpbHMvdmlkZW9FZmZlY3RzJztcbmltcG9ydCB7XG4gIGNyZWF0ZU1hbmlmZXN0LFxuICBnZXRNYW5pZmVzdCxcbiAgaHlkcmF0ZU1hbmlmZXN0LFxufSBmcm9tICcuLi91dGlscy9tYW5pZmVzdFV0aWxzJztcbmltcG9ydCB7IGJyb2FkY2FzdFByb2dyZXNzIH0gZnJvbSAnLi4vdXRpbHMvYnJvYWRjYXN0UHJvZ3Jlc3MnO1xuXG5jb25zdCBzcXMgPSBuZXcgU1FTQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZpZGVvR2VuZXJhdGlvblJlcXVlc3Qge1xuICB0eXBlPzpcbiAgICB8ICdnZW5lcmF0ZS12aWRlbydcbiAgICB8ICdzYXZlLWltYWdlJ1xuICAgIHwgJ2FuaW1hdGUtaW1hZ2UnXG4gICAgfCAnY29tYmluZS12aWRlbydcbiAgICB8ICdjcmVhdGUtc2NlbmUnXG4gICAgfCAncmVnZW5lcmF0ZS1zY2VuZSc7XG4gIHByb21wdD86IHN0cmluZztcbiAgdXNlcklkOiBzdHJpbmc7XG4gIHRpbWVzdGFtcDogc3RyaW5nO1xuICB0b3RhbER1cmF0aW9uOiBudW1iZXI7XG4gIHNjZW5lQ291bnQ6IG51bWJlcjtcbiAgc3RlcDogbnVtYmVyO1xuICB2b2ljZT86IHN0cmluZztcbiAgbGFuZ3VhZ2U/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwcm9jZXNzVmlkZW9HZW5lcmF0aW9uKFxuICByZXF1ZXN0OiBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0LFxuICByZWNvcmQ/OiBTUVNSZWNvcmQsXG4pOiBQcm9taXNlPGFueT4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKCdwcm9jZXNzVmlkZW9HZW5lcmF0aW9uOicsIHJlcXVlc3QpO1xuXG4gICAgY29uc29sZS5sb2coJ3JlcXVlc3Qudm9pY2U6JywgcmVxdWVzdC52b2ljZSk7XG5cbiAgICAvLyBVc2UgdGltZXN0YW1wXG4gICAgY29uc3QgdGltZXN0YW1wID0gcmVxdWVzdC50aW1lc3RhbXA7XG5cbiAgICBjb25zdCBzY2VuZUR1cmF0aW9uID0gTWF0aC5mbG9vcihcbiAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbiAvIHJlcXVlc3Quc2NlbmVDb3VudCxcbiAgICApO1xuXG4gICAgbGV0IHNjZW5lczogU2NlbmVbXSA9IFtdO1xuICAgIGxldCB2b2ljZVRvbmVJbnN0cnVjdGlvbjogc3RyaW5nID0gJyc7XG5cbiAgICAvLyBjaGVjayBpZiB0aGUgdmlkZW8gaXMgYWxyZWFkeSBnZW5lcmF0ZWRcbiAgICBsZXQgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdChyZXF1ZXN0LnVzZXJJZCwgcmVxdWVzdC50aW1lc3RhbXApO1xuXG4gICAgaWYgKG1hbmlmZXN0KSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+OpSBWaWRlbyBhbHJlYWR5IGdlbmVyYXRlZCwgc2tpcHBpbmcgdmlkZW8gZ2VuZXJhdGlvbicpO1xuICAgICAgY29uc3QgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG4gICAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICAgJ3ByZXZpZXdfY29tcGxldGVkJyxcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHJlcXVlc3QudGltZXN0YW1wLFxuICAgICAgICB7IG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkIH0sXG4gICAgICAgICdWaWRlbyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBtZXNzYWdlOiAnVmlkZW8gYWxyZWFkeSBnZW5lcmF0ZWQnLFxuICAgICAgICBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgdGhlcmUgaXMgYWxyZWFkeSBzY3JpcHQgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBjb25zdCBzY3JpcHRLZXkgPSBgJHtyZXF1ZXN0LnVzZXJJZH0vJHt0aW1lc3RhbXB9LnNjcmlwdC50eHRgO1xuICAgIGNvbnN0IGV4aXN0aW5nU2NyaXB0ID0gYXdhaXQgZ2V0T2JqZWN0RnJvbVMzKHNjcmlwdEtleSk7XG5cbiAgICAvLyBTdGVwIDE6IEdlbmVyYXRlIHNjcmlwdC9zdG9yeSBicmVha2Rvd24gdXNpbmcgR1BULTRcbiAgICBpZiAoZXhpc3RpbmdTY3JpcHQpIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBTY3JpcHQgYWxyZWFkeSBnZW5lcmF0ZWQgZm9yIHRoZSB0aW1lc3RhbXAsIHVzaW5nIGV4aXN0aW5nIHNjcmlwdCcsXG4gICAgICApO1xuICAgICAgc2NlbmVzID0gYWRkU2NlbmVJZHMoZXhpc3RpbmdTY3JpcHQuc2NlbmVzKTtcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uID0gZXhpc3RpbmdTY3JpcHQudm9pY2VUb25lSW5zdHJ1Y3Rpb247XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBObyBleGlzdGluZyBzY3JpcHQgZm91bmQsIGdlbmVyYXRpbmcgbmV3IHN0b3J5IGJyZWFrZG93bicsXG4gICAgICApO1xuXG4gICAgICBpZiAoIXJlcXVlc3QucHJvbXB0KSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIHByb21wdCBwcm92aWRlZCcpO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHByb21wdCBwcm92aWRlZCcpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzdG9yeUJyZWFrZG93biA9IGF3YWl0IGdlbmVyYXRlU3RvcnlCcmVha2Rvd24oXG4gICAgICAgIHJlcXVlc3QucHJvbXB0ISxcbiAgICAgICAgcmVxdWVzdC5zY2VuZUNvdW50LFxuICAgICAgICBzY2VuZUR1cmF0aW9uLFxuICAgICAgICByZXF1ZXN0LnRvdGFsRHVyYXRpb24sXG4gICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICApO1xuICAgICAgc2NlbmVzID0gc3RvcnlCcmVha2Rvd24uc2NlbmVzO1xuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPSBzdG9yeUJyZWFrZG93bi52b2ljZVRvbmVJbnN0cnVjdGlvbjtcbiAgICB9XG5cbiAgICBpZiAoIXNjZW5lcyB8fCBzY2VuZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBGYWlsZWQgdG8gZ2V0IG9yIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2V0IG9yIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKCfwn46lIFN0b3J5IGJyZWFrZG93biBnZW5lcmF0ZWQ6Jywgc2NlbmVzKTtcblxuICAgIC8vIFN0ZXAgMjogR2VuZXJhdGUgaW1hZ2VzIGZvciBlYWNoIHNjZW5lIGluIHBhcmFsbGVsXG4gICAgLy8gQ2hlY2sgaWYgdGhlcmUgYXJlIGFscmVhZHkgaW1hZ2VzIGdlbmVyYXRlZCBpbiB0aGUgczMgYnVja2V0IGZvciB0aGUgdGltZXN0YW1wXG4gICAgbGV0IGltYWdlVXJscyA9IGF3YWl0IGdldEltYWdlVXJscyhyZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wKTtcblxuICAgIGlmIChpbWFnZVVybHMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coJ/CfjqUgSW1hZ2VzIGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wOicsIGltYWdlVXJscyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHNlZWQgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMDAwKTtcblxuICAgICAgY29uc29sZS5sb2coJ/CfjqggR2VuZXJhdGluZyBpbWFnZXMgZm9yIGVhY2ggc2NlbmUgaW4gcGFyYWxsZWwuLi4nKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHNjZW5lcy5tYXAoYXN5bmMgKHNjZW5lOiBhbnksIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYPCfjqggR2VuZXJhdGluZyBpbWFnZSBmb3Igc2NlbmUgJHtpICsgMX06YCxcbiAgICAgICAgICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBnZW5lcmF0ZU5hbm9CYW5hbmFJbWFnZShcbiAgICAgICAgICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgc2NlbmUuaWQsXG4gICAgICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgICAgIHNlZWQsXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtpICsgMX0gaW1hZ2UgZ2VuZXJhdGVkOiBkb25lYCk7XG4gICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gV2FpdCBmb3IgYWxsIGltYWdlcyB0byBiZSBnZW5lcmF0ZWQgdXNpbmcgYWxsU2V0dGxlZCBmb3IgYmV0dGVyIGVycm9yIGhhbmRsaW5nXG4gICAgICAgIGNvbnNvbGUubG9nKCfij7MgV2FpdGluZyBmb3IgYWxsIGltYWdlIGdlbmVyYXRpb24gdG8gY29tcGxldGUuLi4nKTtcbiAgICAgICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChpbWFnZVByb21pc2VzKTtcblxuICAgICAgICAvLyBMb2cgcmVzdWx0cyBhbmQgaGFuZGxlIGZhaWx1cmVzXG4gICAgICAgIGNvbnN0IHN1Y2Nlc3NmdWwgPSByZXN1bHRzLmZpbHRlcihcbiAgICAgICAgICAocmVzdWx0KSA9PiByZXN1bHQuc3RhdHVzID09PSAnZnVsZmlsbGVkJyxcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgZmFpbGVkID0gcmVzdWx0cy5maWx0ZXIoKHJlc3VsdCkgPT4gcmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJyk7XG5cbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYOKchSBJbWFnZSBnZW5lcmF0aW9uIHJlc3VsdHM6ICR7c3VjY2Vzc2Z1bC5sZW5ndGh9IHN1Y2Nlc3NmdWwsICR7ZmFpbGVkLmxlbmd0aH0gZmFpbGVkYCxcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBMb2cgZmFpbGVkIHByb21pc2VzIHdpdGggZGV0YWlsZWQgZXJyb3IgaW5mb1xuICAgICAgICBmYWlsZWQuZm9yRWFjaCgocmVzdWx0LCBpbmRleCkgPT4ge1xuICAgICAgICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSAncmVqZWN0ZWQnKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFxuICAgICAgICAgICAgICBg4p2MIFNjZW5lICR7aW5kZXh9IGltYWdlIGdlbmVyYXRpb24gZmFpbGVkOmAsXG4gICAgICAgICAgICAgIHJlc3VsdC5yZWFzb24sXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ29udGludWUgcHJvY2Vzc2luZyBldmVuIGlmIHNvbWUgaW1hZ2VzIGZhaWxlZFxuICAgICAgICBpZiAoc3VjY2Vzc2Z1bC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FsbCBpbWFnZSBnZW5lcmF0aW9uIGF0dGVtcHRzIGZhaWxlZCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgYPCfjqggU3VjY2Vzc2Z1bGx5IGdlbmVyYXRlZCAke3N1Y2Nlc3NmdWwubGVuZ3RofSBvdXQgb2YgJHtyZXN1bHRzLmxlbmd0aH0gaW1hZ2VzYCxcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBpZiAoZ2VuZXJhdGVkSW1hZ2VVcmxzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAvLyAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIGltYWdlcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgICAgICAvLyAgIHRocm93IG5ldyBFcnJvcignTm8gaW1hZ2VzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgICAgIC8vIH1cblxuICAgICAgICAvLyAvLyB1cGxvYWQgaW1hZ2VVcmxzIHRvIHMzIHVzaW5nIHVwbG9hZEltYWdlVG9TM1xuICAgICAgICAvLyBjb25zdCB1cGxvYWRQcm9taXNlcyA9IGdlbmVyYXRlZEltYWdlVXJscy5tYXAoKGltYWdlVXJsLCBpKSA9PlxuICAgICAgICAvLyAgIHVwbG9hZEltYWdlVG9TMyhpbWFnZVVybCwgcmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCwgc2NlbmVzW2ldLmlkKSxcbiAgICAgICAgLy8gKTtcbiAgICAgICAgLy8gYXdhaXQgUHJvbWlzZS5hbGwoaW1hZ2VQcm9taXNlcyk7XG5cbiAgICAgICAgY29uc29sZS5sb2coJ/CflrzvuI8gSW1hZ2VzIHVwbG9hZGVkIHRvIFMzJyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRmFpbGVkIHRvIGdlbmVyYXRlIGltYWdlczonLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gY2hlY2sgaWYgYWxsIHRvZ2V0aGVyIGlmIC5tcDMsIC5zdWJ0aXRsZS5qc29uLCAuYXNzIGZpbGVzIGFyZSBhbHJlYWR5IGV4aXN0cyBpbiB0aGUgczMgYnVja2V0IGFuZCByZXR1cm4gYm9vbGVhblxuICAgIGNvbnN0IGF1ZGlvQ2FwdGlvbkZpbGVzRXhpc3QgPSBhd2FpdCBjaGVja0F1ZGlvQ2FwdGlvbkV4aXN0cyhcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICk7XG4gICAgaWYgKGF1ZGlvQ2FwdGlvbkZpbGVzRXhpc3QpIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBBdWRpbywgc3VidGl0bGUsIGFuZCBhc3MgZmlsZXMgYWxyZWFkeSBnZW5lcmF0ZWQgZm9yIHRoZSB0aW1lc3RhbXA6JyxcbiAgICAgICAgYXVkaW9DYXB0aW9uRmlsZXNFeGlzdCxcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBObyBleGlzdGluZyBhdWRpbywgc3VidGl0bGUsIGFuZCBhc3MgZmlsZXMgZm91bmQsIGdlbmVyYXRpbmcgbmV3IG5hcnJhdGlvbicsXG4gICAgICApO1xuXG4gICAgICAvLyBTdGVwIDM6IEdlbmVyYXRlIGF1ZGlvIGZpbGVzIHdpdGggd29yZC1sZXZlbCB0aW1lc3RhbXBzXG4gICAgICBjb25zdCB7IHN1YnRpdGxlcyB9ID0gYXdhaXQgZ2VuZXJhdGVOYXJyYXRpb24oXG4gICAgICAgIHNjZW5lcyxcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24sXG4gICAgICAgIHJlcXVlc3Qudm9pY2UgfHwgREVGQVVMVF9WT0lDRSxcbiAgICAgICAgcmVxdWVzdC5sYW5ndWFnZSB8fCBERUZBVUxUX0xBTkdVQUdFLFxuICAgICAgKTtcblxuICAgICAgLy8gdXBkYXRlIHNjZW5lcyBkdXJhdGlvblxuICAgICAgc2NlbmVzLmZvckVhY2goKHNjZW5lLCBpKSA9PiB7XG4gICAgICAgIHNjZW5lLmR1cmF0aW9uID0gc3VidGl0bGVzW2ldLmR1cmF0aW9uIHx8IDEwO1xuICAgICAgICBjb25zb2xlLmxvZygnc3VidGl0bGVzW2ldLmR1cmF0aW9uOicsIHN1YnRpdGxlc1tpXS5kdXJhdGlvbik7XG4gICAgICB9KTtcblxuICAgICAgLy8gU3RlcCA0OiBHZW5lcmF0ZSBzdWJ0aXRsZSBmaWxlXG4gICAgICBhd2FpdCBnZW5lcmF0ZVN1YnRpdGxlcyhzY2VuZXMsIHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXAsIHN1YnRpdGxlcyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coXG4gICAgICAn8J+OpSBTY2VuZXMgYmVmb3JlIGNyZWF0aW5nIG1hbmlmZXN0OicsXG4gICAgICBKU09OLnN0cmluZ2lmeShzY2VuZXMsIG51bGwsIDIpLFxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgbWFuaWZlc3QgYW5kIHVwbG9hZCB0byBzM1xuICAgIGF3YWl0IGNyZWF0ZU1hbmlmZXN0KFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBzY2VuZXMsXG4gICAgICByZXF1ZXN0LnRvdGFsRHVyYXRpb24sXG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbixcbiAgICAgIHJlcXVlc3Qudm9pY2UgfHwgREVGQVVMVF9WT0lDRSxcbiAgICAgIHJlcXVlc3QubGFuZ3VhZ2UgfHwgREVGQVVMVF9MQU5HVUFHRSxcbiAgICApO1xuXG4gICAgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdChyZXF1ZXN0LnVzZXJJZCwgcmVxdWVzdC50aW1lc3RhbXApO1xuXG4gICAgbGV0IG1hbmlmZXN0SHlkcmF0ZWQgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAnYXVkaW9fc3VidGl0bGVfY3JlYXRlZCcsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHtcbiAgICAgICAgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQsXG4gICAgICB9LFxuICAgICAgJ0F1ZGlvIGFuZCBTdWJ0aXRsZXMgY29tcGxldGVkJyxcbiAgICApO1xuXG4gICAgLy8gU3RlcCA0OiBHZW5lcmF0ZSBjYW1lcmEgbW92ZW1lbnRzIGZyb20gaW1hZ2VcbiAgICAvLyBjaGVjayBpZiB0aGVyZSBhcmUgYWxyZWFkeSBhbGwgdGhlIHZpZGVvIGVmZmVjdHMgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBhd2FpdCBnZXRWaWRlb0VmZmVjdFVybHMocmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCwgc2NlbmVzKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46sIFZpZGVvIGVmZmVjdHMgVVJMcyBnZW5lcmF0ZWQ6Jyk7XG4gICAgY29uc29sZS5sb2coXG4gICAgICAn8J+OrCBNYW5pZmVzdCBwcmV2aWV3IGNvbXBsZXRlZDonLFxuICAgICAgSlNPTi5zdHJpbmdpZnkobWFuaWZlc3QsIG51bGwsIDIpLFxuICAgICk7XG5cbiAgICBtYW5pZmVzdEh5ZHJhdGVkID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgJ3ByZXZpZXdfY29tcGxldGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgeyBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCB9LFxuICAgICAgJ1ZpZGVvIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICk7XG5cbiAgICAvLyBJZiB0aGlzIHdhcyB0cmlnZ2VyZWQgYnkgU1FTLCBkZWxldGUgdGhlIG1lc3NhZ2UgZnJvbSB0aGUgcXVldWVcbiAgICBpZiAocmVjb3JkICYmIHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCkge1xuICAgICAgY29uc3QgZGVsZXRlQ29tbWFuZCA9IG5ldyBEZWxldGVNZXNzYWdlQ29tbWFuZCh7XG4gICAgICAgIFF1ZXVlVXJsOiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwsXG4gICAgICAgIFJlY2VpcHRIYW5kbGU6IHJlY29yZC5yZWNlaXB0SGFuZGxlLFxuICAgICAgfSk7XG4gICAgICBhd2FpdCBzcXMuc2VuZChkZWxldGVDb21tYW5kKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgbWVzc2FnZTogJ1ByZXZpZXcgZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiB2aWRlbyBnZW5lcmF0aW9uOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19