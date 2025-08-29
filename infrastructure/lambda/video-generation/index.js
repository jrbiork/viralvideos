"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
exports.broadcastProgress = broadcastProgress;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const image_1 = require("./image");
const narration_1 = require("./narration");
const subtitles_1 = require("./subtitles");
const script_1 = require("./script");
const s3Uploader_1 = require("./util/s3Uploader");
const imageUtils_1 = require("./util/imageUtils");
const videoEffects_1 = require("./util/videoEffects");
const videoCombiner_1 = require("./videoCombiner");
const manifestUtils_1 = require("./util/manifestUtils");
const websocket_broadcast_1 = require("../websocket-broadcast");
const sqs = new client_sqs_1.SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const handler = async (event) => {
    console.log('🔄 Video Generation Lambda started - Updated with fluent-ffmpeg support');
    return await handleSQSEvent(event);
};
exports.handler = handler;
async function handleSQSEvent(event) {
    const batchItemFailures = [];
    for (const record of event.Records) {
        try {
            // Parse the message body
            const request = JSON.parse(record.body);
            // Process the video generation with ordered steps
            await processVideoGeneration(request, record);
        }
        catch (error) {
            console.error('❌ Error processing record:', record.messageId, error);
            batchItemFailures.push({ itemIdentifier: record.messageId });
        }
    }
    return {
        batchItemFailures,
    };
}
async function processVideoGeneration(request, record) {
    try {
        console.log('processVideoGeneration:', request);
        // check if the video is already generated
        let manifest = await (0, manifestUtils_1.getManifest)(request.userId, request.timestamp);
        if (manifest) {
            const manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
            console.log('🎥 Video already generated, skipping video generation');
            await broadcastProgress('video_completed', request.userId, request.timestamp, { manifest: manifestHydrated }, 'Video generated successfully');
            return {
                message: 'Video already generated',
                manifest: manifestHydrated,
            };
        }
        // Use timestamp
        const timestamp = request.timestamp;
        const sceneDuration = Math.floor(request.totalDuration / request.sceneCount);
        // Check if there is already script generated in the s3 bucket for the timestamp
        const scriptKey = `${request.userId}/${timestamp}.script.txt`;
        const existingScript = await (0, s3Uploader_1.getObjectFromS3)(scriptKey);
        let scenes = [];
        let voiceToneInstruction = '';
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
            const storyBreakdown = await (0, narration_1.generateStoryBreakdown)(request.prompt, request.sceneCount, sceneDuration, request.totalDuration, request.userId, timestamp);
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
                // Convert generated image URLs to the new format
                imageUrls = generatedImageUrls.map((imageUrl, index) => {
                    const filename = `${timestamp}.scene-${scenes[index].id}.jpg`;
                    return { [filename]: imageUrl };
                });
                console.log(`🎥 Generated ${imageUrls.length} images in parallel:`, imageUrls);
            }
            catch (error) {
                console.error('❌ Failed to generate images:', error);
                throw new Error(`Failed to generate images: ${error}`);
            }
        }
        console.log('🖼️ Image URLs generated:', imageUrls);
        // Update manifest with image URLs
        const updatedScenes = manifest.scenes.map((scene) => {
            const imageUrlObj = imageUrls[scene.sceneIndex];
            const imageUrl = imageUrlObj
                ? Object.values(imageUrlObj)[0]
                : scene.files.jpg;
            return {
                ...scene,
                files: {
                    ...scene.files,
                    jpg: imageUrl,
                },
            };
        });
        manifest = await (0, manifestUtils_1.updateManifest)(manifest, {
            scenes: updatedScenes,
        });
        await broadcastProgress('image_created', request.userId, timestamp, {
            manifest,
        }, 'Images generated');
        console.log('🎥 No existing audio files found, generating new narration');
        // Step 3: Generate audio files with word-level timestamps
        const { subtitles, narrationUrls } = await (0, narration_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction);
        // Step 4: Generate subtitle file
        const assContent = await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, subtitles);
        console.log('📝 Subtitle content generated');
        console.log('🎤 Narration URLs generated:', narrationUrls);
        // update manifest with subtitle content, ass content and audio urls
        const updatedScenesWithAudio = manifest.scenes.map((manifestScene) => {
            const narrationUrlObj = narrationUrls[manifestScene.sceneIndex];
            const narrationUrl = narrationUrlObj
                ? Object.values(narrationUrlObj)[0]
                : manifestScene.files.mp3;
            const assContentStr = typeof assContent === 'string' ? assContent : '';
            return {
                ...manifestScene,
                files: {
                    ...manifestScene.files,
                    mp3: narrationUrl,
                    ass: assContentStr,
                    subtitle: subtitles[manifestScene.sceneIndex].fullText,
                },
            };
        });
        manifest = await (0, manifestUtils_1.updateManifest)(manifest, {
            scenes: updatedScenesWithAudio,
        });
        await broadcastProgress('audio_subtitle_created', request.userId, timestamp, {
            manifest,
        }, 'Audio and Subtitles completed');
        // Step 5: Check existing video if not, generate video clips from images
        // console.log('🎥 Generating video clips from images...');
        // const videoClips: string[] = [];
        // for (let i = 0; i < scenes.length; i++) {
        //   const scene = scenes[i];
        //   const imageUrl = imageUrls[i];
        //   console.log(
        //     `🎬 Generating video for scene ${i + 1} from image:`,
        //     scene.description,
        //   );
        //   try {
        //     const videoClip = await generateVideoClip(
        //       scene.description,
        //       scene.duration,
        //       i,
        //       request.userId,
        //       timestamp,
        //       seed,
        //       scene.id,
        //       imageUrl,
        //     );
        //     videoClips.push(videoClip);
        //     console.log(`✅ Scene ${i + 1} video generated:`, videoClip);
        //   } catch (error) {
        //     console.error(`❌ Failed to generate video for scene ${i + 1}:`, error);
        //     throw new Error(
        //       `Failed to generate video for scene ${i + 1}: ${error}`,
        //     );
        //   }
        // }
        // if (videoClips.length === 0) {
        //   console.log('❌ Error: No video clips were generated');
        //   throw new Error('No video clips were generated');
        // }
        // console.log(`✅ Generated ${videoClips.length} video clips`);
        // Step 4: Generate camera movements from image
        // check if there are already all the video effects generated in the s3 bucket for the timestamp
        let videoEffectsUrls = [];
        videoEffectsUrls = await (0, videoEffects_1.getVideoEffectUrls)(request.userId, timestamp, scenes);
        const updatedScenesWithVideo = manifest.scenes.map((manifestScene) => {
            const videoUrlObj = videoEffectsUrls[manifestScene.sceneIndex];
            const videoUrl = videoUrlObj
                ? Object.values(videoUrlObj)[0]
                : manifestScene.files.mp4;
            return {
                ...manifestScene,
                files: {
                    ...manifestScene.files,
                    mp4: videoUrl,
                },
            };
        });
        manifest = await (0, manifestUtils_1.updateManifest)(manifest, {
            scenes: updatedScenesWithVideo,
        });
        await broadcastProgress('video_scene_created', request.userId, timestamp, {
            manifest,
        }, 'Video effects completed');
        console.log('🎬 Video effects URLs generated:', videoEffectsUrls);
        // Step 6: Combine video parts and upload to s3
        const finalVideoUrl = await (0, videoCombiner_1.combineVideoAndAudio)(request.userId, timestamp, scenes);
        console.log('🎬 Video combined completed', finalVideoUrl);
        manifest = await (0, manifestUtils_1.updateManifest)(manifest, {
            finalVideoUrl,
            totalDuration: request.totalDuration,
        });
        await broadcastProgress('video_completed', request.userId, timestamp, { manifest }, 'Video generated successfully');
        // If this was triggered by SQS, delete the message from the queue
        if (record && process.env.VIDEO_QUEUE_URL) {
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
        }
        // Step 7: Create manifest and upload to s3
        await (0, manifestUtils_1.createManifest)(request.userId, timestamp, scenes, finalVideoUrl, request.totalDuration);
        console.log('manifest created');
        return {
            message: 'Video generated successfully',
        };
    }
    catch (error) {
        console.error('Error in video generation:', error);
        throw error;
    }
}
// Helper function to broadcast video generation progress via WebSocket
async function broadcastProgress(action, userId, timestamp, data, message) {
    try {
        const progressMessage = {
            action,
            data: {
                userId,
                timestamp,
                message,
                ...data,
            },
        };
        // Get the WebSocket domain and stage from environment variables
        const domainName = process.env.WEBSOCKET_DOMAIN_NAME;
        const stage = process.env.WEBSOCKET_STAGE || 'prod';
        if (domainName) {
            await (0, websocket_broadcast_1.broadcastMessage)(progressMessage, domainName, stage, userId);
            console.log(`📡 WebSocket progress broadcast: ${action} - ${message}`);
        }
        else {
            console.log(`📡 WebSocket not configured, skipping broadcast: ${action} - ${message}`);
        }
    }
    catch (error) {
        console.error('Error broadcasting video progress:', error);
        // Don't throw error to avoid breaking the main process
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUEyWkEsOENBdUNDO0FBL2JELG9EQUFzRTtBQUV0RSxtQ0FBd0M7QUFDeEMsMkNBQStFO0FBQy9FLDJDQUFnRDtBQUNoRCxxQ0FBdUM7QUFDdkMsa0RBQWdFO0FBQ2hFLGtEQUFpRDtBQUNqRCxzREFBK0U7QUFDL0UsbURBQXVEO0FBQ3ZELHdEQUs4QjtBQUM5QixnRUFBMEQ7QUFZMUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFdEUsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLEtBQWUsRUFBNkIsRUFBRTtJQUMxRSxPQUFPLENBQUMsR0FBRyxDQUNULHlFQUF5RSxDQUMxRSxDQUFDO0lBQ0YsT0FBTyxNQUFNLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNyQyxDQUFDLENBQUM7QUFMVyxRQUFBLE9BQU8sV0FLbEI7QUFFRixLQUFLLFVBQVUsY0FBYyxDQUFDLEtBQWU7SUFDM0MsTUFBTSxpQkFBaUIsR0FBaUMsRUFBRSxDQUFDO0lBRTNELEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQztZQUNILHlCQUF5QjtZQUN6QixNQUFNLE9BQU8sR0FBMkIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFaEUsa0RBQWtEO1lBQ2xELE1BQU0sc0JBQXNCLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2hELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFD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RSxLQUFLLENBQUMsQ0FBQztRQUNuRCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDO0FBRUQsdUVBQXVFO0FBQ2hFLEtBQUssVUFBVSxpQkFBaUIsQ0FDckMsTUFLcUIsRUFDckIsTUFBYyxFQUNkLFNBQWlCLEVBQ2pCLElBQVUsRUFDVixPQUFnQjtJQUVoQixJQUFJLENBQUM7UUFDSCxNQUFNLGVBQWUsR0FBRztZQUN0QixNQUFNO1lBQ04sSUFBSSxFQUFFO2dCQUNKLE1BQU07Z0JBQ04sU0FBUztnQkFDVCxPQUFPO2dCQUNQLEdBQUcsSUFBSTthQUNSO1NBQ0YsQ0FBQztRQUVGLGdFQUFnRTtRQUNoRSxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDO1FBQ3JELE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxJQUFJLE1BQU0sQ0FBQztRQUVwRCxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2YsTUFBTSxJQUFBLHNDQUFnQixFQUFDLGVBQWUsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ25FLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0NBQW9DLE1BQU0sTUFBTSxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQ3pFLENBQUM7YUFBTSxDQUFDO1lBQ04sT0FBTyxDQUFDLEdBQUcsQ0FDVCxvREFBb0QsTUFBTSxNQUFNLE9BQU8sRUFBRSxDQUMxRSxDQUFDO1FBQ0osQ0FBQztJQUNILENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxvQ0FBb0MsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMzRCx1REFBdUQ7SUFDekQsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBVcGRhdGVkOiBBZGRlZCBmbHVlbnQtZmZtcGVnIGRlcGVuZGVuY3kgc3VwcG9ydFxuaW1wb3J0IHsgU1FTRXZlbnQsIFNRU1JlY29yZCwgU1FTQmF0Y2hSZXNwb25zZSB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuXG5pbXBvcnQgeyBTUVNDbGllbnQsIERlbGV0ZU1lc3NhZ2VDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNxcyc7XG5cbmltcG9ydCB7IGdlbmVyYXRlSW1hZ2UgfSBmcm9tICcuL2ltYWdlJztcbmltcG9ydCB7IGdlbmVyYXRlTmFycmF0aW9uLCBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duLCBTY2VuZSB9IGZyb20gJy4vbmFycmF0aW9uJztcbmltcG9ydCB7IGdlbmVyYXRlU3VidGl0bGVzIH0gZnJvbSAnLi9zdWJ0aXRsZXMnO1xuaW1wb3J0IHsgYWRkU2NlbmVJZHMgfSBmcm9tICcuL3NjcmlwdCc7XG5pbXBvcnQgeyB1cGxvYWRUb1MzLCBnZXRPYmplY3RGcm9tUzMgfSBmcm9tICcuL3V0aWwvczNVcGxvYWRlcic7XG5pbXBvcnQgeyBnZXRJbWFnZVVybHMgfSBmcm9tICcuL3V0aWwvaW1hZ2VVdGlscyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVZpZGVvRWZmZWN0cywgZ2V0VmlkZW9FZmZlY3RVcmxzIH0gZnJvbSAnLi91dGlsL3ZpZGVvRWZmZWN0cyc7XG5pbXBvcnQgeyBjb21iaW5lVmlkZW9BbmRBdWRpbyB9IGZyb20gJy4vdmlkZW9Db21iaW5lcic7XG5pbXBvcnQge1xuICBjcmVhdGVNYW5pZmVzdCxcbiAgZ2V0TWFuaWZlc3QsXG4gIGh5ZHJhdGVNYW5pZmVzdCxcbiAgdXBkYXRlTWFuaWZlc3QsXG59IGZyb20gJy4vdXRpbC9tYW5pZmVzdFV0aWxzJztcbmltcG9ydCB7IGJyb2FkY2FzdE1lc3NhZ2UgfSBmcm9tICcuLi93ZWJzb2NrZXQtYnJvYWRjYXN0JztcbmltcG9ydCB7IE1hbmlmZXN0IH0gZnJvbSAnLi4vdHlwZXMvczNUeXBlcyc7XG5cbmludGVyZmFjZSBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0IHtcbiAgcHJvbXB0Pzogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG4gIHRvdGFsRHVyYXRpb246IG51bWJlcjtcbiAgc2NlbmVDb3VudDogbnVtYmVyO1xuICBzdGVwOiBudW1iZXI7XG59XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBTUVNFdmVudCk6IFByb21pc2U8U1FTQmF0Y2hSZXNwb25zZT4gPT4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+UhCBWaWRlbyBHZW5lcmF0aW9uIExhbWJkYSBzdGFydGVkIC0gVXBkYXRlZCB3aXRoIGZsdWVudC1mZm1wZWcgc3VwcG9ydCcsXG4gICk7XG4gIHJldHVybiBhd2FpdCBoYW5kbGVTUVNFdmVudChldmVudCk7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTUVNFdmVudChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+IHtcbiAgY29uc3QgYmF0Y2hJdGVtRmFpbHVyZXM6IHsgaXRlbUlkZW50aWZpZXI6IHN0cmluZyB9W10gPSBbXTtcblxuICBmb3IgKGNvbnN0IHJlY29yZCBvZiBldmVudC5SZWNvcmRzKSB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIFBhcnNlIHRoZSBtZXNzYWdlIGJvZHlcbiAgICAgIGNvbnN0IHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3QgPSBKU09OLnBhcnNlKHJlY29yZC5ib2R5KTtcblxuICAgICAgLy8gUHJvY2VzcyB0aGUgdmlkZW8gZ2VuZXJhdGlvbiB3aXRoIG9yZGVyZWQgc3RlcHNcbiAgICAgIGF3YWl0IHByb2Nlc3NWaWRlb0dlbmVyYXRpb24ocmVxdWVzdCwgcmVjb3JkKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIHByb2Nlc3NpbmcgcmVjb3JkOicsIHJlY29yZC5tZXNzYWdlSWQsIGVycm9yKTtcbiAgICAgIGJhdGNoSXRlbUZhaWx1cmVzLnB1c2goeyBpdGVtSWRlbnRpZmllcjogcmVjb3JkLm1lc3NhZ2VJZCB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJhdGNoSXRlbUZhaWx1cmVzLFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBwcm9jZXNzVmlkZW9HZW5lcmF0aW9uKFxuICByZXF1ZXN0OiBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0LFxuICByZWNvcmQ/OiBTUVNSZWNvcmQsXG4pOiBQcm9taXNlPGFueT4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKCdwcm9jZXNzVmlkZW9HZW5lcmF0aW9uOicsIHJlcXVlc3QpO1xuXG4gICAgLy8gY2hlY2sgaWYgdGhlIHZpZGVvIGlzIGFscmVhZHkgZ2VuZXJhdGVkXG4gICAgbGV0IG1hbmlmZXN0ID0gYXdhaXQgZ2V0TWFuaWZlc3QocmVxdWVzdC51c2VySWQsIHJlcXVlc3QudGltZXN0YW1wKTtcblxuICAgIGlmIChtYW5pZmVzdCkge1xuICAgICAgY29uc3QgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG4gICAgICBjb25zb2xlLmxvZygn8J+OpSBWaWRlbyBhbHJlYWR5IGdlbmVyYXRlZCwgc2tpcHBpbmcgdmlkZW8gZ2VuZXJhdGlvbicpO1xuICAgICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAgICd2aWRlb19jb21wbGV0ZWQnLFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgcmVxdWVzdC50aW1lc3RhbXAsXG4gICAgICAgIHsgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQgfSxcbiAgICAgICAgJ1ZpZGVvIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgKTtcblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgbWVzc2FnZTogJ1ZpZGVvIGFscmVhZHkgZ2VuZXJhdGVkJyxcbiAgICAgICAgbWFuaWZlc3Q6IG1hbmlmZXN0SHlkcmF0ZWQsXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFVzZSB0aW1lc3RhbXBcbiAgICBjb25zdCB0aW1lc3RhbXAgPSByZXF1ZXN0LnRpbWVzdGFtcDtcblxuICAgIGNvbnN0IHNjZW5lRHVyYXRpb24gPSBNYXRoLmZsb29yKFxuICAgICAgcmVxdWVzdC50b3RhbER1cmF0aW9uIC8gcmVxdWVzdC5zY2VuZUNvdW50LFxuICAgICk7XG5cbiAgICAvLyBDaGVjayBpZiB0aGVyZSBpcyBhbHJlYWR5IHNjcmlwdCBnZW5lcmF0ZWQgaW4gdGhlIHMzIGJ1Y2tldCBmb3IgdGhlIHRpbWVzdGFtcFxuICAgIGNvbnN0IHNjcmlwdEtleSA9IGAke3JlcXVlc3QudXNlcklkfS8ke3RpbWVzdGFtcH0uc2NyaXB0LnR4dGA7XG4gICAgY29uc3QgZXhpc3RpbmdTY3JpcHQgPSBhd2FpdCBnZXRPYmplY3RGcm9tUzMoc2NyaXB0S2V5KTtcblxuICAgIGxldCBzY2VuZXM6IFNjZW5lW10gPSBbXTtcbiAgICBsZXQgdm9pY2VUb25lSW5zdHJ1Y3Rpb246IHN0cmluZyA9ICcnO1xuXG4gICAgLy8gU3RlcCAxOiBHZW5lcmF0ZSBzY3JpcHQvc3RvcnkgYnJlYWtkb3duIHVzaW5nIEdQVC00XG4gICAgaWYgKGV4aXN0aW5nU2NyaXB0KSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgU2NyaXB0IGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wLCB1c2luZyBleGlzdGluZyBzY3JpcHQnLFxuICAgICAgKTtcbiAgICAgIHNjZW5lcyA9IGFkZFNjZW5lSWRzKGV4aXN0aW5nU2NyaXB0LnNjZW5lcyk7XG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9IGV4aXN0aW5nU2NyaXB0LnZvaWNlVG9uZUluc3RydWN0aW9uO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgJ/CfjqUgTm8gZXhpc3Rpbmcgc2NyaXB0IGZvdW5kLCBnZW5lcmF0aW5nIG5ldyBzdG9yeSBicmVha2Rvd24nLFxuICAgICAgKTtcblxuICAgICAgaWYgKCFyZXF1ZXN0LnByb21wdCkge1xuICAgICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyBwcm9tcHQgcHJvdmlkZWQnKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBwcm9tcHQgcHJvdmlkZWQnKTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc3RvcnlCcmVha2Rvd24gPSBhd2FpdCBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duKFxuICAgICAgICByZXF1ZXN0LnByb21wdCEsXG4gICAgICAgIHJlcXVlc3Quc2NlbmVDb3VudCxcbiAgICAgICAgc2NlbmVEdXJhdGlvbixcbiAgICAgICAgcmVxdWVzdC50b3RhbER1cmF0aW9uLFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgKTtcbiAgICAgIHNjZW5lcyA9IHN0b3J5QnJlYWtkb3duLnNjZW5lcztcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uID0gc3RvcnlCcmVha2Rvd24udm9pY2VUb25lSW5zdHJ1Y3Rpb247XG4gICAgfVxuXG4gICAgaWYgKCFzY2VuZXMgfHwgc2NlbmVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogRmFpbGVkIHRvIGdldCBvciBnZW5lcmF0ZSBzdG9yeSBicmVha2Rvd24nKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdldCBvciBnZW5lcmF0ZSBzdG9yeSBicmVha2Rvd24nKTtcbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZygn8J+OpSBTdG9yeSBicmVha2Rvd24gZ2VuZXJhdGVkOicsIHNjZW5lcyk7XG5cbiAgICAvLyBTdGVwIDI6IEdlbmVyYXRlIGltYWdlcyBmb3IgZWFjaCBzY2VuZSBpbiBwYXJhbGxlbFxuICAgIC8vIENoZWNrIGlmIHRoZXJlIGFyZSBhbHJlYWR5IGltYWdlcyBnZW5lcmF0ZWQgaW4gdGhlIHMzIGJ1Y2tldCBmb3IgdGhlIHRpbWVzdGFtcFxuICAgIGxldCBpbWFnZVVybHMgPSBhd2FpdCBnZXRJbWFnZVVybHMocmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCk7XG5cbiAgICBpZiAoaW1hZ2VVcmxzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfwn46lIEltYWdlcyBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcDonLCBpbWFnZVVybHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBzZWVkID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogMTAwMDAwMCk7XG5cbiAgICAgIGNvbnNvbGUubG9nKCfwn46oIEdlbmVyYXRpbmcgaW1hZ2VzIGZvciBlYWNoIHNjZW5lIGluIHBhcmFsbGVsLi4uJyk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBzY2VuZXMubWFwKGFzeW5jIChzY2VuZTogYW55LCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgIGDwn46oIEdlbmVyYXRpbmcgaW1hZ2UgZm9yIHNjZW5lICR7aSArIDF9OmAsXG4gICAgICAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc3QgaW1hZ2VVcmwgPSBhd2FpdCBnZW5lcmF0ZUltYWdlKFxuICAgICAgICAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgICAgICBzZWVkLFxuICAgICAgICAgICAgc2NlbmUuaWQsXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtpICsgMX0gaW1hZ2UgZ2VuZXJhdGVkOmAsIGltYWdlVXJsKTtcbiAgICAgICAgICByZXR1cm4gaW1hZ2VVcmw7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFdhaXQgZm9yIGFsbCBpbWFnZXMgdG8gYmUgZ2VuZXJhdGVkXG4gICAgICAgIGNvbnN0IGdlbmVyYXRlZEltYWdlVXJscyA9IGF3YWl0IFByb21pc2UuYWxsKGltYWdlUHJvbWlzZXMpO1xuXG4gICAgICAgIGlmIChnZW5lcmF0ZWRJbWFnZVVybHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogTm8gaW1hZ2VzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBpbWFnZXMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENvbnZlcnQgZ2VuZXJhdGVkIGltYWdlIFVSTHMgdG8gdGhlIG5ldyBmb3JtYXRcbiAgICAgICAgaW1hZ2VVcmxzID0gZ2VuZXJhdGVkSW1hZ2VVcmxzLm1hcCgoaW1hZ2VVcmwsIGluZGV4KSA9PiB7XG4gICAgICAgICAgY29uc3QgZmlsZW5hbWUgPSBgJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmVzW2luZGV4XS5pZH0uanBnYDtcbiAgICAgICAgICByZXR1cm4geyBbZmlsZW5hbWVdOiBpbWFnZVVybCB9O1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBg8J+OpSBHZW5lcmF0ZWQgJHtpbWFnZVVybHMubGVuZ3RofSBpbWFnZXMgaW4gcGFyYWxsZWw6YCxcbiAgICAgICAgICBpbWFnZVVybHMsXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRmFpbGVkIHRvIGdlbmVyYXRlIGltYWdlczonLCBlcnJvcik7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGdlbmVyYXRlIGltYWdlczogJHtlcnJvcn1gKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZygn8J+WvO+4jyBJbWFnZSBVUkxzIGdlbmVyYXRlZDonLCBpbWFnZVVybHMpO1xuXG4gICAgLy8gVXBkYXRlIG1hbmlmZXN0IHdpdGggaW1hZ2UgVVJMc1xuICAgIGNvbnN0IHVwZGF0ZWRTY2VuZXMgPSBtYW5pZmVzdCEuc2NlbmVzLm1hcCgoc2NlbmUpID0+IHtcbiAgICAgIGNvbnN0IGltYWdlVXJsT2JqID0gaW1hZ2VVcmxzW3NjZW5lLnNjZW5lSW5kZXhdO1xuICAgICAgY29uc3QgaW1hZ2VVcmwgPSBpbWFnZVVybE9ialxuICAgICAgICA/IE9iamVjdC52YWx1ZXMoaW1hZ2VVcmxPYmopWzBdXG4gICAgICAgIDogc2NlbmUuZmlsZXMuanBnO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICAuLi5zY2VuZSxcbiAgICAgICAgZmlsZXM6IHtcbiAgICAgICAgICAuLi5zY2VuZS5maWxlcyxcbiAgICAgICAgICBqcGc6IGltYWdlVXJsLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICB9KTtcblxuICAgIG1hbmlmZXN0ID0gYXdhaXQgdXBkYXRlTWFuaWZlc3QobWFuaWZlc3QhLCB7XG4gICAgICBzY2VuZXM6IHVwZGF0ZWRTY2VuZXMsXG4gICAgfSk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICdpbWFnZV9jcmVhdGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAge1xuICAgICAgICBtYW5pZmVzdCxcbiAgICAgIH0sXG4gICAgICAnSW1hZ2VzIGdlbmVyYXRlZCcsXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46lIE5vIGV4aXN0aW5nIGF1ZGlvIGZpbGVzIGZvdW5kLCBnZW5lcmF0aW5nIG5ldyBuYXJyYXRpb24nKTtcblxuICAgIC8vIFN0ZXAgMzogR2VuZXJhdGUgYXVkaW8gZmlsZXMgd2l0aCB3b3JkLWxldmVsIHRpbWVzdGFtcHNcbiAgICBjb25zdCB7IHN1YnRpdGxlcywgbmFycmF0aW9uVXJscyB9ID0gYXdhaXQgZ2VuZXJhdGVOYXJyYXRpb24oXG4gICAgICBzY2VuZXMsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uLFxuICAgICk7XG5cbiAgICAvLyBTdGVwIDQ6IEdlbmVyYXRlIHN1YnRpdGxlIGZpbGVcbiAgICBjb25zdCBhc3NDb250ZW50ID0gYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZXMoXG4gICAgICBzY2VuZXMsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHN1YnRpdGxlcyxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/Cfk50gU3VidGl0bGUgY29udGVudCBnZW5lcmF0ZWQnKTtcbiAgICBjb25zb2xlLmxvZygn8J+OpCBOYXJyYXRpb24gVVJMcyBnZW5lcmF0ZWQ6JywgbmFycmF0aW9uVXJscyk7XG5cbiAgICAvLyB1cGRhdGUgbWFuaWZlc3Qgd2l0aCBzdWJ0aXRsZSBjb250ZW50LCBhc3MgY29udGVudCBhbmQgYXVkaW8gdXJsc1xuICAgIGNvbnN0IHVwZGF0ZWRTY2VuZXNXaXRoQXVkaW8gPSBtYW5pZmVzdCEuc2NlbmVzLm1hcCgobWFuaWZlc3RTY2VuZSkgPT4ge1xuICAgICAgY29uc3QgbmFycmF0aW9uVXJsT2JqID0gbmFycmF0aW9uVXJsc1ttYW5pZmVzdFNjZW5lLnNjZW5lSW5kZXhdO1xuICAgICAgY29uc3QgbmFycmF0aW9uVXJsID0gbmFycmF0aW9uVXJsT2JqXG4gICAgICAgID8gT2JqZWN0LnZhbHVlcyhuYXJyYXRpb25VcmxPYmopWzBdXG4gICAgICAgIDogbWFuaWZlc3RTY2VuZS5maWxlcy5tcDM7XG5cbiAgICAgIGNvbnN0IGFzc0NvbnRlbnRTdHIgPSB0eXBlb2YgYXNzQ29udGVudCA9PT0gJ3N0cmluZycgPyBhc3NDb250ZW50IDogJyc7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIC4uLm1hbmlmZXN0U2NlbmUsXG4gICAgICAgIGZpbGVzOiB7XG4gICAgICAgICAgLi4ubWFuaWZlc3RTY2VuZS5maWxlcyxcbiAgICAgICAgICBtcDM6IG5hcnJhdGlvblVybCxcbiAgICAgICAgICBhc3M6IGFzc0NvbnRlbnRTdHIsXG4gICAgICAgICAgc3VidGl0bGU6IHN1YnRpdGxlc1ttYW5pZmVzdFNjZW5lLnNjZW5lSW5kZXhdLmZ1bGxUZXh0LFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICB9KTtcblxuICAgIG1hbmlmZXN0ID0gYXdhaXQgdXBkYXRlTWFuaWZlc3QobWFuaWZlc3QhLCB7XG4gICAgICBzY2VuZXM6IHVwZGF0ZWRTY2VuZXNXaXRoQXVkaW8sXG4gICAgfSk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICdhdWRpb19zdWJ0aXRsZV9jcmVhdGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAge1xuICAgICAgICBtYW5pZmVzdCxcbiAgICAgIH0sXG4gICAgICAnQXVkaW8gYW5kIFN1YnRpdGxlcyBjb21wbGV0ZWQnLFxuICAgICk7XG5cbiAgICAvLyBTdGVwIDU6IENoZWNrIGV4aXN0aW5nIHZpZGVvIGlmIG5vdCwgZ2VuZXJhdGUgdmlkZW8gY2xpcHMgZnJvbSBpbWFnZXNcbiAgICAvLyBjb25zb2xlLmxvZygn8J+OpSBHZW5lcmF0aW5nIHZpZGVvIGNsaXBzIGZyb20gaW1hZ2VzLi4uJyk7XG4gICAgLy8gY29uc3QgdmlkZW9DbGlwczogc3RyaW5nW10gPSBbXTtcblxuICAgIC8vIGZvciAobGV0IGkgPSAwOyBpIDwgc2NlbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gICBjb25zdCBzY2VuZSA9IHNjZW5lc1tpXTtcbiAgICAvLyAgIGNvbnN0IGltYWdlVXJsID0gaW1hZ2VVcmxzW2ldO1xuICAgIC8vICAgY29uc29sZS5sb2coXG4gICAgLy8gICAgIGDwn46sIEdlbmVyYXRpbmcgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9IGZyb20gaW1hZ2U6YCxcbiAgICAvLyAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgLy8gICApO1xuICAgIC8vICAgdHJ5IHtcbiAgICAvLyAgICAgY29uc3QgdmlkZW9DbGlwID0gYXdhaXQgZ2VuZXJhdGVWaWRlb0NsaXAoXG4gICAgLy8gICAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgLy8gICAgICAgc2NlbmUuZHVyYXRpb24sXG4gICAgLy8gICAgICAgaSxcbiAgICAvLyAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAvLyAgICAgICB0aW1lc3RhbXAsXG4gICAgLy8gICAgICAgc2VlZCxcbiAgICAvLyAgICAgICBzY2VuZS5pZCxcbiAgICAvLyAgICAgICBpbWFnZVVybCxcbiAgICAvLyAgICAgKTtcbiAgICAvLyAgICAgdmlkZW9DbGlwcy5wdXNoKHZpZGVvQ2xpcCk7XG4gICAgLy8gICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtpICsgMX0gdmlkZW8gZ2VuZXJhdGVkOmAsIHZpZGVvQ2xpcCk7XG4gICAgLy8gICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIGdlbmVyYXRlIHZpZGVvIGZvciBzY2VuZSAke2kgKyAxfTpgLCBlcnJvcik7XG4gICAgLy8gICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAvLyAgICAgICBgRmFpbGVkIHRvIGdlbmVyYXRlIHZpZGVvIGZvciBzY2VuZSAke2kgKyAxfTogJHtlcnJvcn1gLFxuICAgIC8vICAgICApO1xuICAgIC8vICAgfVxuICAgIC8vIH1cblxuICAgIC8vIGlmICh2aWRlb0NsaXBzLmxlbmd0aCA9PT0gMCkge1xuICAgIC8vICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogTm8gdmlkZW8gY2xpcHMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAvLyAgIHRocm93IG5ldyBFcnJvcignTm8gdmlkZW8gY2xpcHMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAvLyB9XG5cbiAgICAvLyBjb25zb2xlLmxvZyhg4pyFIEdlbmVyYXRlZCAke3ZpZGVvQ2xpcHMubGVuZ3RofSB2aWRlbyBjbGlwc2ApO1xuXG4gICAgLy8gU3RlcCA0OiBHZW5lcmF0ZSBjYW1lcmEgbW92ZW1lbnRzIGZyb20gaW1hZ2VcbiAgICAvLyBjaGVjayBpZiB0aGVyZSBhcmUgYWxyZWFkeSBhbGwgdGhlIHZpZGVvIGVmZmVjdHMgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBsZXQgdmlkZW9FZmZlY3RzVXJscyA9IFtdO1xuXG4gICAgdmlkZW9FZmZlY3RzVXJscyA9IGF3YWl0IGdldFZpZGVvRWZmZWN0VXJscyhcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc2NlbmVzLFxuICAgICk7XG5cbiAgICBjb25zdCB1cGRhdGVkU2NlbmVzV2l0aFZpZGVvID0gbWFuaWZlc3QhLnNjZW5lcy5tYXAoKG1hbmlmZXN0U2NlbmUpID0+IHtcbiAgICAgIGNvbnN0IHZpZGVvVXJsT2JqID0gdmlkZW9FZmZlY3RzVXJsc1ttYW5pZmVzdFNjZW5lLnNjZW5lSW5kZXhdO1xuICAgICAgY29uc3QgdmlkZW9VcmwgPSB2aWRlb1VybE9ialxuICAgICAgICA/IE9iamVjdC52YWx1ZXModmlkZW9VcmxPYmopWzBdXG4gICAgICAgIDogbWFuaWZlc3RTY2VuZS5maWxlcy5tcDQ7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIC4uLm1hbmlmZXN0U2NlbmUsXG4gICAgICAgIGZpbGVzOiB7XG4gICAgICAgICAgLi4ubWFuaWZlc3RTY2VuZS5maWxlcyxcbiAgICAgICAgICBtcDQ6IHZpZGVvVXJsLFxuICAgICAgICB9LFxuICAgICAgfTtcbiAgICB9KTtcblxuICAgIG1hbmlmZXN0ID0gYXdhaXQgdXBkYXRlTWFuaWZlc3QobWFuaWZlc3QhLCB7XG4gICAgICBzY2VuZXM6IHVwZGF0ZWRTY2VuZXNXaXRoVmlkZW8sXG4gICAgfSk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICd2aWRlb19zY2VuZV9jcmVhdGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAge1xuICAgICAgICBtYW5pZmVzdCxcbiAgICAgIH0sXG4gICAgICAnVmlkZW8gZWZmZWN0cyBjb21wbGV0ZWQnLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OrCBWaWRlbyBlZmZlY3RzIFVSTHMgZ2VuZXJhdGVkOicsIHZpZGVvRWZmZWN0c1VybHMpO1xuXG4gICAgLy8gU3RlcCA2OiBDb21iaW5lIHZpZGVvIHBhcnRzIGFuZCB1cGxvYWQgdG8gczNcbiAgICBjb25zdCBmaW5hbFZpZGVvVXJsID0gYXdhaXQgY29tYmluZVZpZGVvQW5kQXVkaW8oXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHNjZW5lcyxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/CfjqwgVmlkZW8gY29tYmluZWQgY29tcGxldGVkJywgZmluYWxWaWRlb1VybCk7XG5cbiAgICBtYW5pZmVzdCA9IGF3YWl0IHVwZGF0ZU1hbmlmZXN0KG1hbmlmZXN0ISwge1xuICAgICAgZmluYWxWaWRlb1VybCxcbiAgICAgIHRvdGFsRHVyYXRpb246IHJlcXVlc3QudG90YWxEdXJhdGlvbixcbiAgICB9KTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgJ3ZpZGVvX2NvbXBsZXRlZCcsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHsgbWFuaWZlc3QgfSxcbiAgICAgICdWaWRlbyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICApO1xuXG4gICAgLy8gSWYgdGhpcyB3YXMgdHJpZ2dlcmVkIGJ5IFNRUywgZGVsZXRlIHRoZSBtZXNzYWdlIGZyb20gdGhlIHF1ZXVlXG4gICAgaWYgKHJlY29yZCAmJiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwpIHtcbiAgICAgIGNvbnN0IGRlbGV0ZUNvbW1hbmQgPSBuZXcgRGVsZXRlTWVzc2FnZUNvbW1hbmQoe1xuICAgICAgICBRdWV1ZVVybDogcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMLFxuICAgICAgICBSZWNlaXB0SGFuZGxlOiByZWNvcmQucmVjZWlwdEhhbmRsZSxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgc3FzLnNlbmQoZGVsZXRlQ29tbWFuZCk7XG4gICAgfVxuXG4gICAgLy8gU3RlcCA3OiBDcmVhdGUgbWFuaWZlc3QgYW5kIHVwbG9hZCB0byBzM1xuICAgIGF3YWl0IGNyZWF0ZU1hbmlmZXN0KFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBzY2VuZXMsXG4gICAgICBmaW5hbFZpZGVvVXJsLFxuICAgICAgcmVxdWVzdC50b3RhbER1cmF0aW9uLFxuICAgICk7XG4gICAgY29uc29sZS5sb2coJ21hbmlmZXN0IGNyZWF0ZWQnKTtcblxuICAgIHJldHVybiB7XG4gICAgICBtZXNzYWdlOiAnVmlkZW8gZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiB2aWRlbyBnZW5lcmF0aW9uOicsIGVycm9yKTtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gYnJvYWRjYXN0IHZpZGVvIGdlbmVyYXRpb24gcHJvZ3Jlc3MgdmlhIFdlYlNvY2tldFxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGJyb2FkY2FzdFByb2dyZXNzKFxuICBhY3Rpb246XG4gICAgfCAnc2NyaXB0X2NyZWF0ZWQnXG4gICAgfCAnaW1hZ2VfY3JlYXRlZCdcbiAgICB8ICdhdWRpb19zdWJ0aXRsZV9jcmVhdGVkJ1xuICAgIHwgJ3ZpZGVvX3NjZW5lX2NyZWF0ZWQnXG4gICAgfCAndmlkZW9fY29tcGxldGVkJyxcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHRpbWVzdGFtcDogc3RyaW5nLFxuICBkYXRhPzogYW55LFxuICBtZXNzYWdlPzogc3RyaW5nLFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcHJvZ3Jlc3NNZXNzYWdlID0ge1xuICAgICAgYWN0aW9uLFxuICAgICAgZGF0YToge1xuICAgICAgICB1c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgLi4uZGF0YSxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIC8vIEdldCB0aGUgV2ViU29ja2V0IGRvbWFpbiBhbmQgc3RhZ2UgZnJvbSBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBjb25zdCBkb21haW5OYW1lID0gcHJvY2Vzcy5lbnYuV0VCU09DS0VUX0RPTUFJTl9OQU1FO1xuICAgIGNvbnN0IHN0YWdlID0gcHJvY2Vzcy5lbnYuV0VCU09DS0VUX1NUQUdFIHx8ICdwcm9kJztcblxuICAgIGlmIChkb21haW5OYW1lKSB7XG4gICAgICBhd2FpdCBicm9hZGNhc3RNZXNzYWdlKHByb2dyZXNzTWVzc2FnZSwgZG9tYWluTmFtZSwgc3RhZ2UsIHVzZXJJZCk7XG4gICAgICBjb25zb2xlLmxvZyhg8J+ToSBXZWJTb2NrZXQgcHJvZ3Jlc3MgYnJvYWRjYXN0OiAke2FjdGlvbn0gLSAke21lc3NhZ2V9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBg8J+ToSBXZWJTb2NrZXQgbm90IGNvbmZpZ3VyZWQsIHNraXBwaW5nIGJyb2FkY2FzdDogJHthY3Rpb259IC0gJHttZXNzYWdlfWAsXG4gICAgICApO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBicm9hZGNhc3RpbmcgdmlkZW8gcHJvZ3Jlc3M6JywgZXJyb3IpO1xuICAgIC8vIERvbid0IHRocm93IGVycm9yIHRvIGF2b2lkIGJyZWFraW5nIHRoZSBtYWluIHByb2Nlc3NcbiAgfVxufVxuIl19