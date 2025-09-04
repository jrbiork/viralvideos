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
                // Re-fetch image URLs after upload
                imageUrls = await (0, imageUtils_1.getImageUrls)(request.userId, timestamp);
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
            const { subtitles } = await (0, audio_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction, request.voice || 'ash');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInByb2Nlc3NWaWRlb0dlbmVyYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFpQ0Esd0RBOE9DO0FBOVFELG9EQUFzRTtBQUN0RSxtQ0FBd0M7QUFDeEMsMENBQW1EO0FBQ25ELGtEQUF1RDtBQUN2RCw0Q0FBOEM7QUFDOUMsNENBQWdFO0FBQ2hFLG9EQUFrRTtBQUNsRSxrREFBNEQ7QUFDNUQsb0RBQW1EO0FBQ25ELHdEQUEyRDtBQUMzRCxtREFBdUQ7QUFDdkQsMERBSWdDO0FBQ2hDLG9EQUFzRDtBQUN0RCwyREFBd0Q7QUFFeEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFhdEUsS0FBSyxVQUFVLHNCQUFzQixDQUMxQyxPQUErQixFQUMvQixNQUFrQjtJQUVsQixJQUFJLENBQUM7UUFDSCxPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRWhELE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLEVBQUUsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTdDLGdCQUFnQjtRQUNoQixNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDO1FBRXBDLE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQzlCLE9BQU8sQ0FBQyxhQUFhLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FDM0MsQ0FBQztRQUVGLElBQUksTUFBTSxHQUFZLEVBQUUsQ0FBQztRQUN6QixJQUFJLG9CQUFvQixHQUFXLEVBQUUsQ0FBQztRQUV0QywwQ0FBMEM7UUFDMUMsSUFBSSxRQUFRLEdBQUcsTUFBTSxJQUFBLDJCQUFXLEVBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsU0FBUyxD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Q1QsTUFBTSxDQUNQLENBQUM7UUFFRixPQUFPLENBQUMsR0FBRyxDQUFDLDZCQUE2QixFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBRTFELGtFQUFrRTtRQUNsRSxJQUFJLE1BQU0sSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQzFDLE1BQU0sYUFBYSxHQUFHLElBQUksaUNBQW9CLENBQUM7Z0JBQzdDLFFBQVEsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWU7Z0JBQ3JDLGFBQWEsRUFBRSxNQUFNLENBQUMsYUFBYTthQUNwQyxDQUFDLENBQUM7WUFDSCxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDaEMsQ0FBQztRQUVELE9BQU87WUFDTCxPQUFPLEVBQUUsOEJBQThCO1NBQ3hDLENBQUM7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsNEJBQTRCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbkQsTUFBTSxLQUFLLENBQUM7SUFDZCxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFNRU1JlY29yZCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgU1FTQ2xpZW50LCBEZWxldGVNZXNzYWdlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVJbWFnZSB9IGZyb20gJy4vaW1hZ2UnO1xuaW1wb3J0IHsgZ2VuZXJhdGVOYXJyYXRpb24gfSBmcm9tICcuLi91dGlscy9hdWRpbyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVN1YnRpdGxlcyB9IGZyb20gJy4uL3V0aWxzL3N1YnRpdGxlcyc7XG5pbXBvcnQgeyBhZGRTY2VuZUlkcyB9IGZyb20gJy4uL3V0aWxzL3NjcmlwdCc7XG5pbXBvcnQgeyBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duLCBTY2VuZSB9IGZyb20gJy4uL3V0aWxzL3NjcmlwdCc7XG5pbXBvcnQgeyB1cGxvYWRUb1MzLCBnZXRPYmplY3RGcm9tUzMgfSBmcm9tICcuLi91dGlscy9zM1VwbG9hZGVyJztcbmltcG9ydCB7IGNoZWNrQXVkaW9DYXB0aW9uRXhpc3RzIH0gZnJvbSAnLi91dGlsL2F1ZGlvVXRpbHMnO1xuaW1wb3J0IHsgZ2V0SW1hZ2VVcmxzIH0gZnJvbSAnLi4vdXRpbHMvaW1hZ2VVdGlscyc7XG5pbXBvcnQgeyBnZXRWaWRlb0VmZmVjdFVybHMgfSBmcm9tICcuLi91dGlscy92aWRlb0VmZmVjdHMnO1xuaW1wb3J0IHsgY29tYmluZVZpZGVvQW5kQXVkaW8gfSBmcm9tICcuL3ZpZGVvQ29tYmluZXInO1xuaW1wb3J0IHtcbiAgY3JlYXRlTWFuaWZlc3QsXG4gIGdldE1hbmlmZXN0LFxuICBoeWRyYXRlTWFuaWZlc3QsXG59IGZyb20gJy4uL3V0aWxzL21hbmlmZXN0VXRpbHMnO1xuaW1wb3J0IHsgdXBsb2FkSW1hZ2VUb1MzIH0gZnJvbSAnLi4vdXRpbHMvczNVcGxvYWRlcic7XG5pbXBvcnQgeyBicm9hZGNhc3RQcm9ncmVzcyB9IGZyb20gJy4vYnJvYWRjYXN0UHJvZ3Jlc3MnO1xuXG5jb25zdCBzcXMgPSBuZXcgU1FTQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICd1cy1lYXN0LTEnIH0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIFZpZGVvR2VuZXJhdGlvblJlcXVlc3Qge1xuICB0eXBlPzogJ2dlbmVyYXRlLXZpZGVvJyB8ICdzYXZlLWltYWdlJyB8ICdhbmltYXRlLWltYWdlJztcbiAgcHJvbXB0Pzogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG4gIHRvdGFsRHVyYXRpb246IG51bWJlcjtcbiAgc2NlbmVDb3VudDogbnVtYmVyO1xuICBzdGVwOiBudW1iZXI7XG4gIHZvaWNlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbihcbiAgcmVxdWVzdDogVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCxcbiAgcmVjb3JkPzogU1FTUmVjb3JkLFxuKTogUHJvbWlzZTxhbnk+IHtcbiAgdHJ5IHtcbiAgICBjb25zb2xlLmxvZygncHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbjonLCByZXF1ZXN0KTtcblxuICAgIGNvbnNvbGUubG9nKCdyZXF1ZXN0LnZvaWNlOicsIHJlcXVlc3Qudm9pY2UpO1xuXG4gICAgLy8gVXNlIHRpbWVzdGFtcFxuICAgIGNvbnN0IHRpbWVzdGFtcCA9IHJlcXVlc3QudGltZXN0YW1wO1xuXG4gICAgY29uc3Qgc2NlbmVEdXJhdGlvbiA9IE1hdGguZmxvb3IoXG4gICAgICByZXF1ZXN0LnRvdGFsRHVyYXRpb24gLyByZXF1ZXN0LnNjZW5lQ291bnQsXG4gICAgKTtcblxuICAgIGxldCBzY2VuZXM6IFNjZW5lW10gPSBbXTtcbiAgICBsZXQgdm9pY2VUb25lSW5zdHJ1Y3Rpb246IHN0cmluZyA9ICcnO1xuXG4gICAgLy8gY2hlY2sgaWYgdGhlIHZpZGVvIGlzIGFscmVhZHkgZ2VuZXJhdGVkXG4gICAgbGV0IG1hbmlmZXN0ID0gYXdhaXQgZ2V0TWFuaWZlc3QocmVxdWVzdC51c2VySWQsIHJlcXVlc3QudGltZXN0YW1wKTtcblxuICAgIGlmIChtYW5pZmVzdCkge1xuICAgICAgY29uc29sZS5sb2coJ/CfjqUgVmlkZW8gYWxyZWFkeSBnZW5lcmF0ZWQsIHNraXBwaW5nIHZpZGVvIGdlbmVyYXRpb24nKTtcbiAgICAgIGNvbnN0IG1hbmlmZXN0SHlkcmF0ZWQgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuICAgICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAgICdwcmV2aWV3X2NvbXBsZXRlZCcsXG4gICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICByZXF1ZXN0LnRpbWVzdGFtcCxcbiAgICAgICAgeyBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCB9LFxuICAgICAgICAnVmlkZW8gZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICApO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgbWVzc2FnZTogJ1ZpZGVvIGFscmVhZHkgZ2VuZXJhdGVkJyxcbiAgICAgICAgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBzY2VuZXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiByZXF1ZXN0LnNjZW5lQ291bnQgfSwgKF8sIGkpID0+ICh7XG4gICAgICAgIGlkOiBpLFxuICAgICAgICBkZXNjcmlwdGlvbjogJycsXG4gICAgICAgIGR1cmF0aW9uOiBzY2VuZUR1cmF0aW9uLFxuICAgICAgICBuYXJyYXRpb246ICcnLFxuICAgICAgfSkpO1xuXG4gICAgICAvLyBDcmVhdGUgbWFuaWZlc3QgYW5kIHVwbG9hZCB0byBzM1xuICAgICAgYXdhaXQgY3JlYXRlTWFuaWZlc3QoXG4gICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgIHNjZW5lcyxcbiAgICAgICAgcmVxdWVzdC50b3RhbER1cmF0aW9uLFxuICAgICAgKTtcblxuICAgICAgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdChyZXF1ZXN0LnVzZXJJZCwgcmVxdWVzdC50aW1lc3RhbXApO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoZXJlIGlzIGFscmVhZHkgc2NyaXB0IGdlbmVyYXRlZCBpbiB0aGUgczMgYnVja2V0IGZvciB0aGUgdGltZXN0YW1wXG4gICAgY29uc3Qgc2NyaXB0S2V5ID0gYCR7cmVxdWVzdC51c2VySWR9LyR7dGltZXN0YW1wfS5zY3JpcHQudHh0YDtcbiAgICBjb25zdCBleGlzdGluZ1NjcmlwdCA9IGF3YWl0IGdldE9iamVjdEZyb21TMyhzY3JpcHRLZXkpO1xuXG4gICAgLy8gU3RlcCAxOiBHZW5lcmF0ZSBzY3JpcHQvc3RvcnkgYnJlYWtkb3duIHVzaW5nIEdQVC00XG4gICAgaWYgKGV4aXN0aW5nU2NyaXB0KSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgU2NyaXB0IGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wLCB1c2luZyBleGlzdGluZyBzY3JpcHQnLFxuICAgICAgKTtcbiAgICAgIHNjZW5lcyA9IGFkZFNjZW5lSWRzKGV4aXN0aW5nU2NyaXB0LnNjZW5lcyk7XG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9IGV4aXN0aW5nU2NyaXB0LnZvaWNlVG9uZUluc3RydWN0aW9uO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgTm8gZXhpc3Rpbmcgc2NyaXB0IGZvdW5kLCBnZW5lcmF0aW5nIG5ldyBzdG9yeSBicmVha2Rvd24nLFxuICAgICAgKTtcblxuICAgICAgaWYgKCFyZXF1ZXN0LnByb21wdCkge1xuICAgICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyBwcm9tcHQgcHJvdmlkZWQnKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBwcm9tcHQgcHJvdmlkZWQnKTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc3RvcnlCcmVha2Rvd24gPSBhd2FpdCBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duKFxuICAgICAgICByZXF1ZXN0LnByb21wdCEsXG4gICAgICAgIHJlcXVlc3Quc2NlbmVDb3VudCxcbiAgICAgICAgc2NlbmVEdXJhdGlvbixcbiAgICAgICAgcmVxdWVzdC50b3RhbER1cmF0aW9uLFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgKTtcbiAgICAgIHNjZW5lcyA9IHN0b3J5QnJlYWtkb3duLnNjZW5lcztcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uID0gc3RvcnlCcmVha2Rvd24udm9pY2VUb25lSW5zdHJ1Y3Rpb247XG4gICAgfVxuXG4gICAgaWYgKCFzY2VuZXMgfHwgc2NlbmVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogRmFpbGVkIHRvIGdldCBvciBnZW5lcmF0ZSBzdG9yeSBicmVha2Rvd24nKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdldCBvciBnZW5lcmF0ZSBzdG9yeSBicmVha2Rvd24nKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZygn8J+OpSBNYW5pZmVzdCBjcmVhdGVkIGFuZCB1cGxvYWRlZDonKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46lIFN0b3J5IGJyZWFrZG93biBnZW5lcmF0ZWQ6Jywgc2NlbmVzKTtcblxuICAgIC8vIFN0ZXAgMjogR2VuZXJhdGUgaW1hZ2VzIGZvciBlYWNoIHNjZW5lIGluIHBhcmFsbGVsXG4gICAgLy8gQ2hlY2sgaWYgdGhlcmUgYXJlIGFscmVhZHkgaW1hZ2VzIGdlbmVyYXRlZCBpbiB0aGUgczMgYnVja2V0IGZvciB0aGUgdGltZXN0YW1wXG4gICAgbGV0IGltYWdlVXJscyA9IGF3YWl0IGdldEltYWdlVXJscyhyZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wKTtcblxuICAgIGlmIChpbWFnZVVybHMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coJ/CfjqUgSW1hZ2VzIGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wOicsIGltYWdlVXJscyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHNlZWQgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMDAwKTtcblxuICAgICAgY29uc29sZS5sb2coJ/CfjqggR2VuZXJhdGluZyBpbWFnZXMgZm9yIGVhY2ggc2NlbmUgaW4gcGFyYWxsZWwuLi4nKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHNjZW5lcy5tYXAoYXN5bmMgKHNjZW5lOiBhbnksIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYPCfjqggR2VuZXJhdGluZyBpbWFnZSBmb3Igc2NlbmUgJHtpICsgMX06YCxcbiAgICAgICAgICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zdCBpbWFnZVVybCA9IGF3YWl0IGdlbmVyYXRlSW1hZ2UoXG4gICAgICAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAgICAgICAgIGksXG4gICAgICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgICAgIHNlZWQsXG4gICAgICAgICAgICBzY2VuZS5pZCxcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc29sZS5sb2coYOKchSBTY2VuZSAke2kgKyAxfSBpbWFnZSBnZW5lcmF0ZWQ6YCwgaW1hZ2VVcmwpO1xuICAgICAgICAgIHJldHVybiBpbWFnZVVybDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gV2FpdCBmb3IgYWxsIGltYWdlcyB0byBiZSBnZW5lcmF0ZWRcbiAgICAgICAgY29uc3QgZ2VuZXJhdGVkSW1hZ2VVcmxzID0gYXdhaXQgUHJvbWlzZS5hbGwoaW1hZ2VQcm9taXNlcyk7XG5cbiAgICAgICAgaWYgKGdlbmVyYXRlZEltYWdlVXJscy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyBpbWFnZXMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGltYWdlcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdXBsb2FkIGltYWdlVXJscyB0byBzMyB1c2luZyB1cGxvYWRJbWFnZVRvUzNcbiAgICAgICAgY29uc3QgdXBsb2FkUHJvbWlzZXMgPSBnZW5lcmF0ZWRJbWFnZVVybHMubWFwKChpbWFnZVVybCwgaSkgPT5cbiAgICAgICAgICB1cGxvYWRJbWFnZVRvUzMoaW1hZ2VVcmwsIHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXAsIHNjZW5lc1tpXS5pZCksXG4gICAgICAgICk7XG4gICAgICAgIGF3YWl0IFByb21pc2UuYWxsKHVwbG9hZFByb21pc2VzKTtcblxuICAgICAgICBjb25zb2xlLmxvZygn8J+WvO+4jyBJbWFnZXMgdXBsb2FkZWQgdG8gUzMnKTtcblxuICAgICAgICAvLyBSZS1mZXRjaCBpbWFnZSBVUkxzIGFmdGVyIHVwbG9hZFxuICAgICAgICBpbWFnZVVybHMgPSBhd2FpdCBnZXRJbWFnZVVybHMocmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRmFpbGVkIHRvIGdlbmVyYXRlIGltYWdlczonLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CflrzvuI8gSW1hZ2UgVVJMcyBnZW5lcmF0ZWQ6JywgaW1hZ2VVcmxzKTtcblxuICAgIC8vIGNoZWNrIGlmIGFsbCB0b2dldGhlciBpZiAubXAzLCAuc3VidGl0bGUuanNvbiwgLmFzcyBmaWxlcyBhcmUgYWxyZWFkeSBleGlzdHMgaW4gdGhlIHMzIGJ1Y2tldCBhbmQgcmV0dXJuIGJvb2xlYW5cbiAgICBjb25zdCBhdWRpb0NhcHRpb25GaWxlc0V4aXN0ID0gYXdhaXQgY2hlY2tBdWRpb0NhcHRpb25FeGlzdHMoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICApO1xuICAgIGlmIChhdWRpb0NhcHRpb25GaWxlc0V4aXN0KSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgQXVkaW8sIHN1YnRpdGxlLCBhbmQgYXNzIGZpbGVzIGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wOicsXG4gICAgICAgIGF1ZGlvQ2FwdGlvbkZpbGVzRXhpc3QsXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgTm8gZXhpc3RpbmcgYXVkaW8sIHN1YnRpdGxlLCBhbmQgYXNzIGZpbGVzIGZvdW5kLCBnZW5lcmF0aW5nIG5ldyBuYXJyYXRpb24nLFxuICAgICAgKTtcblxuICAgICAgLy8gU3RlcCAzOiBHZW5lcmF0ZSBhdWRpbyBmaWxlcyB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wc1xuICAgICAgY29uc3QgeyBzdWJ0aXRsZXMgfSA9IGF3YWl0IGdlbmVyYXRlTmFycmF0aW9uKFxuICAgICAgICBzY2VuZXMsXG4gICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uLFxuICAgICAgICByZXF1ZXN0LnZvaWNlIHx8ICdhc2gnLFxuICAgICAgKTtcblxuICAgICAgLy8gU3RlcCA0OiBHZW5lcmF0ZSBzdWJ0aXRsZSBmaWxlXG4gICAgICBhd2FpdCBnZW5lcmF0ZVN1YnRpdGxlcyhzY2VuZXMsIHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXAsIHN1YnRpdGxlcyk7XG4gICAgfVxuXG4gICAgbGV0IG1hbmlmZXN0SHlkcmF0ZWQgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAnYXVkaW9fc3VidGl0bGVfY3JlYXRlZCcsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHtcbiAgICAgICAgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQsXG4gICAgICB9LFxuICAgICAgJ0F1ZGlvIGFuZCBTdWJ0aXRsZXMgY29tcGxldGVkJyxcbiAgICApO1xuXG4gICAgLy8gU3RlcCA0OiBHZW5lcmF0ZSBjYW1lcmEgbW92ZW1lbnRzIGZyb20gaW1hZ2VcbiAgICAvLyBjaGVjayBpZiB0aGVyZSBhcmUgYWxyZWFkeSBhbGwgdGhlIHZpZGVvIGVmZmVjdHMgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBhd2FpdCBnZXRWaWRlb0VmZmVjdFVybHMocmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCwgc2NlbmVzKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46sIFZpZGVvIGVmZmVjdHMgVVJMcyBnZW5lcmF0ZWQ6Jyk7XG4gICAgY29uc29sZS5sb2coXG4gICAgICAn8J+OrCBNYW5pZmVzdCBwcmV2aWV3IGNvbXBsZXRlZDonLFxuICAgICAgSlNPTi5zdHJpbmdpZnkobWFuaWZlc3QsIG51bGwsIDIpLFxuICAgICk7XG5cbiAgICBtYW5pZmVzdEh5ZHJhdGVkID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgJ3ByZXZpZXdfY29tcGxldGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgeyBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCB9LFxuICAgICAgJ1ZpZGVvIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICk7XG5cbiAgICAvLyBTdGVwIDY6IENvbWJpbmUgdmlkZW8gcGFydHMgYW5kIHVwbG9hZCB0byBzM1xuICAgIGNvbnN0IGZpbmFsVmlkZW9VcmwgPSBhd2FpdCBjb21iaW5lVmlkZW9BbmRBdWRpbyhcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc2NlbmVzLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OrCBWaWRlbyBjb21iaW5lZCBjb21wbGV0ZWQnLCBmaW5hbFZpZGVvVXJsKTtcblxuICAgIC8vIElmIHRoaXMgd2FzIHRyaWdnZXJlZCBieSBTUVMsIGRlbGV0ZSB0aGUgbWVzc2FnZSBmcm9tIHRoZSBxdWV1ZVxuICAgIGlmIChyZWNvcmQgJiYgcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMKSB7XG4gICAgICBjb25zdCBkZWxldGVDb21tYW5kID0gbmV3IERlbGV0ZU1lc3NhZ2VDb21tYW5kKHtcbiAgICAgICAgUXVldWVVcmw6IHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCxcbiAgICAgICAgUmVjZWlwdEhhbmRsZTogcmVjb3JkLnJlY2VpcHRIYW5kbGUsXG4gICAgICB9KTtcbiAgICAgIGF3YWl0IHNxcy5zZW5kKGRlbGV0ZUNvbW1hbmQpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICBtZXNzYWdlOiAnVmlkZW8gZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiB2aWRlbyBnZW5lcmF0aW9uOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuIl19