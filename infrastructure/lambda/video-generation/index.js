"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
exports.broadcastProgress = broadcastProgress;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const image_1 = require("./image");
const audio_1 = require("../utils/audio");
const subtitles_1 = require("../utils/subtitles");
const script_1 = require("../utils/script");
const script_2 = require("../utils/script");
const s3Uploader_1 = require("./util/s3Uploader");
const audioUtils_1 = require("./util/audioUtils");
const imageUtils_1 = require("../utils/imageUtils");
const videoEffects_1 = require("./util/videoEffects");
const videoCombiner_1 = require("./videoCombiner");
const manifestUtils_1 = require("./util/manifestUtils");
const websocket_broadcast_1 = require("../websocket-broadcast");
const s3Uploader_2 = require("../utils/s3Uploader");
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
            await broadcastProgress('preview_completed', request.userId, request.timestamp, { manifest: manifestHydrated }, 'Video generated successfully');
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
        await broadcastProgress('audio_subtitle_created', request.userId, timestamp, {
            manifest: manifestHydrated,
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
        await (0, videoEffects_1.getVideoEffectUrls)(request.userId, timestamp, scenes);
        console.log('🎬 Video effects URLs generated:');
        console.log('🎬 Manifest preview completed:', JSON.stringify(manifest, null, 2));
        manifestHydrated = await (0, manifestUtils_1.hydrateManifest)(manifest);
        await broadcastProgress('preview_completed', request.userId, timestamp, { manifest: manifestHydrated }, 'Video generated successfully');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFnVkEsOENBeUNDO0FBdFhELG9EQUFzRTtBQUV0RSxtQ0FBd0M7QUFDeEMsMENBQW1EO0FBQ25ELGtEQUF1RDtBQUN2RCw0Q0FBOEM7QUFDOUMsNENBQWdFO0FBQ2hFLGtEQUFnRTtBQUNoRSxrREFBNEQ7QUFDNUQsb0RBQW1EO0FBQ25ELHNEQUF5RDtBQUN6RCxtREFBdUQ7QUFDdkQsd0RBSThCO0FBQzlCLGdFQUEwRDtBQUMxRCxvREFBc0Q7QUFXdEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFdEUsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLEtBQWUsRUFBNkIsRUFBRTtJQUMxRSxPQUFPLENBQUMsR0FBRyxDQUNULHlFQUF5RSxDQUMxRSxDQUFDO0lBQ0YsT0FBTyxNQUFNLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNyQyxDQUFDLENBQUM7QUFMVyxRQUFBLE9BQU8sV0FLbEI7QUFFRixLQUFLLFVBQVUsY0FBYyxDQUFDLEtBQWU7SUFDM0MsTUFBTSxpQkFBaUIsR0FBaUMsRUFBRSxDQUFDO0lBRTNELEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQztZQUNILHlCQUF5QjtZQUN6QixNQUFNLE9BQU8sR0FBMkIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFaEUsa0RBQWtEO1lBQ2xELE1BQU0sc0JBQXNCLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2hELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIs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RSxNQUFNLENBQUMsQ0FBQztZQUNuRSxPQUFPLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxNQUFNLE1BQU0sT0FBTyxFQUFFLENBQUMsQ0FBQztRQUN6RSxDQUFDO2FBQU0sQ0FBQztZQUNOLE9BQU8sQ0FBQyxHQUFHLENBQ1Qsb0RBQW9ELE1BQU0sTUFBTSxPQUFPLEVBQUUsQ0FDMUUsQ0FBQztRQUNKLENBQUM7SUFDSCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsb0NBQW9DLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0QsdURBQXVEO0lBQ3pELENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gVXBkYXRlZDogQWRkZWQgZmx1ZW50LWZmbXBlZyBkZXBlbmRlbmN5IHN1cHBvcnRcbmltcG9ydCB7IFNRU0V2ZW50LCBTUVNSZWNvcmQsIFNRU0JhdGNoUmVzcG9uc2UgfSBmcm9tICdhd3MtbGFtYmRhJztcblxuaW1wb3J0IHsgU1FTQ2xpZW50LCBEZWxldGVNZXNzYWdlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuXG5pbXBvcnQgeyBnZW5lcmF0ZUltYWdlIH0gZnJvbSAnLi9pbWFnZSc7XG5pbXBvcnQgeyBnZW5lcmF0ZU5hcnJhdGlvbiB9IGZyb20gJy4uL3V0aWxzL2F1ZGlvJztcbmltcG9ydCB7IGdlbmVyYXRlU3VidGl0bGVzIH0gZnJvbSAnLi4vdXRpbHMvc3VidGl0bGVzJztcbmltcG9ydCB7IGFkZFNjZW5lSWRzIH0gZnJvbSAnLi4vdXRpbHMvc2NyaXB0JztcbmltcG9ydCB7IGdlbmVyYXRlU3RvcnlCcmVha2Rvd24sIFNjZW5lIH0gZnJvbSAnLi4vdXRpbHMvc2NyaXB0JztcbmltcG9ydCB7IHVwbG9hZFRvUzMsIGdldE9iamVjdEZyb21TMyB9IGZyb20gJy4vdXRpbC9zM1VwbG9hZGVyJztcbmltcG9ydCB7IGNoZWNrQXVkaW9DYXB0aW9uRXhpc3RzIH0gZnJvbSAnLi91dGlsL2F1ZGlvVXRpbHMnO1xuaW1wb3J0IHsgZ2V0SW1hZ2VVcmxzIH0gZnJvbSAnLi4vdXRpbHMvaW1hZ2VVdGlscyc7XG5pbXBvcnQgeyBnZXRWaWRlb0VmZmVjdFVybHMgfSBmcm9tICcuL3V0aWwvdmlkZW9FZmZlY3RzJztcbmltcG9ydCB7IGNvbWJpbmVWaWRlb0FuZEF1ZGlvIH0gZnJvbSAnLi92aWRlb0NvbWJpbmVyJztcbmltcG9ydCB7XG4gIGNyZWF0ZU1hbmlmZXN0LFxuICBnZXRNYW5pZmVzdCxcbiAgaHlkcmF0ZU1hbmlmZXN0LFxufSBmcm9tICcuL3V0aWwvbWFuaWZlc3RVdGlscyc7XG5pbXBvcnQgeyBicm9hZGNhc3RNZXNzYWdlIH0gZnJvbSAnLi4vd2Vic29ja2V0LWJyb2FkY2FzdCc7XG5pbXBvcnQgeyB1cGxvYWRJbWFnZVRvUzMgfSBmcm9tICcuLi91dGlscy9zM1VwbG9hZGVyJztcblxuaW50ZXJmYWNlIFZpZGVvR2VuZXJhdGlvblJlcXVlc3Qge1xuICBwcm9tcHQ/OiBzdHJpbmc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyO1xuICBzY2VuZUNvdW50OiBudW1iZXI7XG4gIHN0ZXA6IG51bWJlcjtcbn1cblxuY29uc3Qgc3FzID0gbmV3IFNRU0NsaWVudCh7IHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAndXMtZWFzdC0xJyB9KTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IFNRU0V2ZW50KTogUHJvbWlzZTxTUVNCYXRjaFJlc3BvbnNlPiA9PiB7XG4gIGNvbnNvbGUubG9nKFxuICAgICfwn5SEIFZpZGVvIEdlbmVyYXRpb24gTGFtYmRhIHN0YXJ0ZWQgLSBVcGRhdGVkIHdpdGggZmx1ZW50LWZmbXBlZyBzdXBwb3J0JyxcbiAgKTtcbiAgcmV0dXJuIGF3YWl0IGhhbmRsZVNRU0V2ZW50KGV2ZW50KTtcbn07XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVNRU0V2ZW50KGV2ZW50OiBTUVNFdmVudCk6IFByb21pc2U8U1FTQmF0Y2hSZXNwb25zZT4ge1xuICBjb25zdCBiYXRjaEl0ZW1GYWlsdXJlczogeyBpdGVtSWRlbnRpZmllcjogc3RyaW5nIH1bXSA9IFtdO1xuXG4gIGZvciAoY29uc3QgcmVjb3JkIG9mIGV2ZW50LlJlY29yZHMpIHtcbiAgICB0cnkge1xuICAgICAgLy8gUGFyc2UgdGhlIG1lc3NhZ2UgYm9keVxuICAgICAgY29uc3QgcmVxdWVzdDogVmlkZW9HZW5lcmF0aW9uUmVxdWVzdCA9IEpTT04ucGFyc2UocmVjb3JkLmJvZHkpO1xuXG4gICAgICAvLyBQcm9jZXNzIHRoZSB2aWRlbyBnZW5lcmF0aW9uIHdpdGggb3JkZXJlZCBzdGVwc1xuICAgICAgYXdhaXQgcHJvY2Vzc1ZpZGVvR2VuZXJhdGlvbihyZXF1ZXN0LCByZWNvcmQpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgRXJyb3IgcHJvY2Vzc2luZyByZWNvcmQ6JywgcmVjb3JkLm1lc3NhZ2VJZCwgZXJyb3IpO1xuICAgICAgYmF0Y2hJdGVtRmFpbHVyZXMucHVzaCh7IGl0ZW1JZGVudGlmaWVyOiByZWNvcmQubWVzc2FnZUlkIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgYmF0Y2hJdGVtRmFpbHVyZXMsXG4gIH07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NWaWRlb0dlbmVyYXRpb24oXG4gIHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3QsXG4gIHJlY29yZD86IFNRU1JlY29yZCxcbik6IFByb21pc2U8YW55PiB7XG4gIHRyeSB7XG4gICAgY29uc29sZS5sb2coJ3Byb2Nlc3NWaWRlb0dlbmVyYXRpb246JywgcmVxdWVzdCk7XG5cbiAgICAvLyBVc2UgdGltZXN0YW1wXG4gICAgY29uc3QgdGltZXN0YW1wID0gcmVxdWVzdC50aW1lc3RhbXA7XG5cbiAgICBjb25zdCBzY2VuZUR1cmF0aW9uID0gTWF0aC5mbG9vcihcbiAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbiAvIHJlcXVlc3Quc2NlbmVDb3VudCxcbiAgICApO1xuXG4gICAgbGV0IHNjZW5lczogU2NlbmVbXSA9IFtdO1xuICAgIGxldCB2b2ljZVRvbmVJbnN0cnVjdGlvbjogc3RyaW5nID0gJyc7XG5cbiAgICAvLyBjaGVjayBpZiB0aGUgdmlkZW8gaXMgYWxyZWFkeSBnZW5lcmF0ZWRcbiAgICBsZXQgbWFuaWZlc3QgPSBhd2FpdCBnZXRNYW5pZmVzdChyZXF1ZXN0LnVzZXJJZCwgcmVxdWVzdC50aW1lc3RhbXApO1xuXG4gICAgaWYgKG1hbmlmZXN0KSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+OpSBWaWRlbyBhbHJlYWR5IGdlbmVyYXRlZCwgc2tpcHBpbmcgdmlkZW8gZ2VuZXJhdGlvbicpO1xuICAgICAgY29uc3QgbWFuaWZlc3RIeWRyYXRlZCA9IGF3YWl0IGh5ZHJhdGVNYW5pZmVzdChtYW5pZmVzdCk7XG4gICAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICAgJ3ByZXZpZXdfY29tcGxldGVkJyxcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHJlcXVlc3QudGltZXN0YW1wLFxuICAgICAgICB7IG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkIH0sXG4gICAgICAgICdWaWRlbyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBtZXNzYWdlOiAnVmlkZW8gYWxyZWFkeSBnZW5lcmF0ZWQnLFxuICAgICAgICBtYW5pZmVzdDogbWFuaWZlc3RIeWRyYXRlZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHNjZW5lcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IHJlcXVlc3Quc2NlbmVDb3VudCB9LCAoXywgaSkgPT4gKHtcbiAgICAgICAgaWQ6IGksXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnJyxcbiAgICAgICAgZHVyYXRpb246IHNjZW5lRHVyYXRpb24sXG4gICAgICAgIG5hcnJhdGlvbjogJycsXG4gICAgICB9KSk7XG5cbiAgICAgIC8vIENyZWF0ZSBtYW5pZmVzdCBhbmQgdXBsb2FkIHRvIHMzXG4gICAgICBhd2FpdCBjcmVhdGVNYW5pZmVzdChcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgc2NlbmVzLFxuICAgICAgICByZXF1ZXN0LnRvdGFsRHVyYXRpb24sXG4gICAgICApO1xuXG4gICAgICBtYW5pZmVzdCA9IGF3YWl0IGdldE1hbmlmZXN0KHJlcXVlc3QudXNlcklkLCByZXF1ZXN0LnRpbWVzdGFtcCk7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgdGhlcmUgaXMgYWxyZWFkeSBzY3JpcHQgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBjb25zdCBzY3JpcHRLZXkgPSBgJHtyZXF1ZXN0LnVzZXJJZH0vJHt0aW1lc3RhbXB9LnNjcmlwdC50eHRgO1xuICAgIGNvbnN0IGV4aXN0aW5nU2NyaXB0ID0gYXdhaXQgZ2V0T2JqZWN0RnJvbVMzKHNjcmlwdEtleSk7XG5cbiAgICAvLyBTdGVwIDE6IEdlbmVyYXRlIHNjcmlwdC9zdG9yeSBicmVha2Rvd24gdXNpbmcgR1BULTRcbiAgICBpZiAoZXhpc3RpbmdTY3JpcHQpIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBTY3JpcHQgYWxyZWFkeSBnZW5lcmF0ZWQgZm9yIHRoZSB0aW1lc3RhbXAsIHVzaW5nIGV4aXN0aW5nIHNjcmlwdCcsXG4gICAgICApO1xuICAgICAgc2NlbmVzID0gYWRkU2NlbmVJZHMoZXhpc3RpbmdTY3JpcHQuc2NlbmVzKTtcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uID0gZXhpc3RpbmdTY3JpcHQudm9pY2VUb25lSW5zdHJ1Y3Rpb247XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBObyBleGlzdGluZyBzY3JpcHQgZm91bmQsIGdlbmVyYXRpbmcgbmV3IHN0b3J5IGJyZWFrZG93bicsXG4gICAgICApO1xuXG4gICAgICBpZiAoIXJlcXVlc3QucHJvbXB0KSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIHByb21wdCBwcm92aWRlZCcpO1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHByb21wdCBwcm92aWRlZCcpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzdG9yeUJyZWFrZG93biA9IGF3YWl0IGdlbmVyYXRlU3RvcnlCcmVha2Rvd24oXG4gICAgICAgIHJlcXVlc3QucHJvbXB0ISxcbiAgICAgICAgcmVxdWVzdC5zY2VuZUNvdW50LFxuICAgICAgICBzY2VuZUR1cmF0aW9uLFxuICAgICAgICByZXF1ZXN0LnRvdGFsRHVyYXRpb24sXG4gICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICApO1xuICAgICAgc2NlbmVzID0gc3RvcnlCcmVha2Rvd24uc2NlbmVzO1xuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPSBzdG9yeUJyZWFrZG93bi52b2ljZVRvbmVJbnN0cnVjdGlvbjtcbiAgICB9XG5cbiAgICBpZiAoIXNjZW5lcyB8fCBzY2VuZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBGYWlsZWQgdG8gZ2V0IG9yIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2V0IG9yIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKCfwn46lIE1hbmlmZXN0IGNyZWF0ZWQgYW5kIHVwbG9hZGVkOicpO1xuXG4gICAgY29uc29sZS5sb2coJ/CfjqUgU3RvcnkgYnJlYWtkb3duIGdlbmVyYXRlZDonLCBzY2VuZXMpO1xuXG4gICAgLy8gU3RlcCAyOiBHZW5lcmF0ZSBpbWFnZXMgZm9yIGVhY2ggc2NlbmUgaW4gcGFyYWxsZWxcbiAgICAvLyBDaGVjayBpZiB0aGVyZSBhcmUgYWxyZWFkeSBpbWFnZXMgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBsZXQgaW1hZ2VVcmxzID0gYXdhaXQgZ2V0SW1hZ2VVcmxzKHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXApO1xuXG4gICAgaWYgKGltYWdlVXJscy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+OpSBJbWFnZXMgYWxyZWFkeSBnZW5lcmF0ZWQgZm9yIHRoZSB0aW1lc3RhbXA6JywgaW1hZ2VVcmxzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3Qgc2VlZCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwMDApO1xuXG4gICAgICBjb25zb2xlLmxvZygn8J+OqCBHZW5lcmF0aW5nIGltYWdlcyBmb3IgZWFjaCBzY2VuZSBpbiBwYXJhbGxlbC4uLicpO1xuXG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBpbWFnZVByb21pc2VzID0gc2NlbmVzLm1hcChhc3luYyAoc2NlbmU6IGFueSwgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBg8J+OqCBHZW5lcmF0aW5nIGltYWdlIGZvciBzY2VuZSAke2kgKyAxfTpgLFxuICAgICAgICAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnN0IGltYWdlVXJsID0gYXdhaXQgZ2VuZXJhdGVJbWFnZShcbiAgICAgICAgICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICAgaSxcbiAgICAgICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICAgICAgc2VlZCxcbiAgICAgICAgICAgIHNjZW5lLmlkLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zb2xlLmxvZyhg4pyFIFNjZW5lICR7aSArIDF9IGltYWdlIGdlbmVyYXRlZDpgLCBpbWFnZVVybCk7XG4gICAgICAgICAgcmV0dXJuIGltYWdlVXJsO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBXYWl0IGZvciBhbGwgaW1hZ2VzIHRvIGJlIGdlbmVyYXRlZFxuICAgICAgICBjb25zdCBnZW5lcmF0ZWRJbWFnZVVybHMgPSBhd2FpdCBQcm9taXNlLmFsbChpbWFnZVByb21pc2VzKTtcblxuICAgICAgICBpZiAoZ2VuZXJhdGVkSW1hZ2VVcmxzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IE5vIGltYWdlcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTm8gaW1hZ2VzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyB1cGxvYWQgaW1hZ2VVcmxzIHRvIHMzIHVzaW5nIHVwbG9hZEltYWdlVG9TM1xuICAgICAgICBjb25zdCB1cGxvYWRQcm9taXNlcyA9IGdlbmVyYXRlZEltYWdlVXJscy5tYXAoKGltYWdlVXJsLCBpKSA9PlxuICAgICAgICAgIHVwbG9hZEltYWdlVG9TMyhpbWFnZVVybCwgcmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCwgc2NlbmVzW2ldLmlkKSxcbiAgICAgICAgKTtcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5hbGwodXBsb2FkUHJvbWlzZXMpO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5a877iPIEltYWdlcyB1cGxvYWRlZCB0byBTMycpO1xuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcign4p2MIEZhaWxlZCB0byBnZW5lcmF0ZSBpbWFnZXM6JywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKCfwn5a877iPIEltYWdlIFVSTHMgZ2VuZXJhdGVkOicsIGltYWdlVXJscyk7XG5cbiAgICAvLyBjaGVjayBpZiBhbGwgdG9nZXRoZXIgaWYgLm1wMywgLnN1YnRpdGxlLmpzb24sIC5hc3MgZmlsZXMgYXJlIGFscmVhZHkgZXhpc3RzIGluIHRoZSBzMyBidWNrZXQgYW5kIHJldHVybiBib29sZWFuXG4gICAgY29uc3QgYXVkaW9DYXB0aW9uRmlsZXNFeGlzdCA9IGF3YWl0IGNoZWNrQXVkaW9DYXB0aW9uRXhpc3RzKFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgKTtcbiAgICBpZiAoYXVkaW9DYXB0aW9uRmlsZXNFeGlzdCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIEF1ZGlvLCBzdWJ0aXRsZSwgYW5kIGFzcyBmaWxlcyBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcDonLFxuICAgICAgICBhdWRpb0NhcHRpb25GaWxlc0V4aXN0LFxuICAgICAgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIE5vIGV4aXN0aW5nIGF1ZGlvLCBzdWJ0aXRsZSwgYW5kIGFzcyBmaWxlcyBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgbmFycmF0aW9uJyxcbiAgICAgICk7XG5cbiAgICAgIC8vIFN0ZXAgMzogR2VuZXJhdGUgYXVkaW8gZmlsZXMgd2l0aCB3b3JkLWxldmVsIHRpbWVzdGFtcHNcbiAgICAgIGNvbnN0IHsgc3VidGl0bGVzIH0gPSBhd2FpdCBnZW5lcmF0ZU5hcnJhdGlvbihcbiAgICAgICAgc2NlbmVzLFxuICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbixcbiAgICAgICk7XG5cbiAgICAgIC8vIFN0ZXAgNDogR2VuZXJhdGUgc3VidGl0bGUgZmlsZVxuICAgICAgYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZXMoc2NlbmVzLCByZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCBzdWJ0aXRsZXMpO1xuICAgIH1cblxuICAgIGxldCBtYW5pZmVzdEh5ZHJhdGVkID0gYXdhaXQgaHlkcmF0ZU1hbmlmZXN0KG1hbmlmZXN0KTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgJ2F1ZGlvX3N1YnRpdGxlX2NyZWF0ZWQnLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICB7XG4gICAgICAgIG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkLFxuICAgICAgfSxcbiAgICAgICdBdWRpbyBhbmQgU3VidGl0bGVzIGNvbXBsZXRlZCcsXG4gICAgKTtcblxuICAgIC8vIFN0ZXAgNTogQ2hlY2sgZXhpc3RpbmcgdmlkZW8gaWYgbm90LCBnZW5lcmF0ZSB2aWRlbyBjbGlwcyBmcm9tIGltYWdlc1xuICAgIC8vIGNvbnNvbGUubG9nKCfwn46lIEdlbmVyYXRpbmcgdmlkZW8gY2xpcHMgZnJvbSBpbWFnZXMuLi4nKTtcbiAgICAvLyBjb25zdCB2aWRlb0NsaXBzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgLy8gZm9yIChsZXQgaSA9IDA7IGkgPCBzY2VuZXMubGVuZ3RoOyBpKyspIHtcbiAgICAvLyAgIGNvbnN0IHNjZW5lID0gc2NlbmVzW2ldO1xuICAgIC8vICAgY29uc3QgaW1hZ2VVcmwgPSBpbWFnZVVybHNbaV07XG4gICAgLy8gICBjb25zb2xlLmxvZyhcbiAgICAvLyAgICAgYPCfjqwgR2VuZXJhdGluZyB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX0gZnJvbSBpbWFnZTpgLFxuICAgIC8vICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAvLyAgICk7XG4gICAgLy8gICB0cnkge1xuICAgIC8vICAgICBjb25zdCB2aWRlb0NsaXAgPSBhd2FpdCBnZW5lcmF0ZVZpZGVvQ2xpcChcbiAgICAvLyAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAvLyAgICAgICBzY2VuZS5kdXJhdGlvbixcbiAgICAvLyAgICAgICBpLFxuICAgIC8vICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgIC8vICAgICAgIHRpbWVzdGFtcCxcbiAgICAvLyAgICAgICBzZWVkLFxuICAgIC8vICAgICAgIHNjZW5lLmlkLFxuICAgIC8vICAgICAgIGltYWdlVXJsLFxuICAgIC8vICAgICApO1xuICAgIC8vICAgICB2aWRlb0NsaXBzLnB1c2godmlkZW9DbGlwKTtcbiAgICAvLyAgICAgY29uc29sZS5sb2coYOKchSBTY2VuZSAke2kgKyAxfSB2aWRlbyBnZW5lcmF0ZWQ6YCwgdmlkZW9DbGlwKTtcbiAgICAvLyAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9OmAsIGVycm9yKTtcbiAgICAvLyAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgIC8vICAgICAgIGBGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9OiAke2Vycm9yfWAsXG4gICAgLy8gICAgICk7XG4gICAgLy8gICB9XG4gICAgLy8gfVxuXG4gICAgLy8gaWYgKHZpZGVvQ2xpcHMubGVuZ3RoID09PSAwKSB7XG4gICAgLy8gICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyB2aWRlbyBjbGlwcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgIC8vICAgdGhyb3cgbmV3IEVycm9yKCdObyB2aWRlbyBjbGlwcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgIC8vIH1cblxuICAgIC8vIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkICR7dmlkZW9DbGlwcy5sZW5ndGh9IHZpZGVvIGNsaXBzYCk7XG5cbiAgICAvLyBTdGVwIDQ6IEdlbmVyYXRlIGNhbWVyYSBtb3ZlbWVudHMgZnJvbSBpbWFnZVxuICAgIC8vIGNoZWNrIGlmIHRoZXJlIGFyZSBhbHJlYWR5IGFsbCB0aGUgdmlkZW8gZWZmZWN0cyBnZW5lcmF0ZWQgaW4gdGhlIHMzIGJ1Y2tldCBmb3IgdGhlIHRpbWVzdGFtcFxuICAgIGF3YWl0IGdldFZpZGVvRWZmZWN0VXJscyhyZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wLCBzY2VuZXMpO1xuXG4gICAgY29uc29sZS5sb2coJ/CfjqwgVmlkZW8gZWZmZWN0cyBVUkxzIGdlbmVyYXRlZDonKTtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgICfwn46sIE1hbmlmZXN0IHByZXZpZXcgY29tcGxldGVkOicsXG4gICAgICBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCwgbnVsbCwgMiksXG4gICAgKTtcblxuICAgIG1hbmlmZXN0SHlkcmF0ZWQgPSBhd2FpdCBoeWRyYXRlTWFuaWZlc3QobWFuaWZlc3QpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAncHJldmlld19jb21wbGV0ZWQnLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICB7IG1hbmlmZXN0OiBtYW5pZmVzdEh5ZHJhdGVkIH0sXG4gICAgICAnVmlkZW8gZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgKTtcblxuICAgIC8vIFN0ZXAgNjogQ29tYmluZSB2aWRlbyBwYXJ0cyBhbmQgdXBsb2FkIHRvIHMzXG4gICAgY29uc3QgZmluYWxWaWRlb1VybCA9IGF3YWl0IGNvbWJpbmVWaWRlb0FuZEF1ZGlvKFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBzY2VuZXMsXG4gICAgKTtcblxuICAgIGNvbnNvbGUubG9nKCfwn46sIFZpZGVvIGNvbWJpbmVkIGNvbXBsZXRlZCcsIGZpbmFsVmlkZW9VcmwpO1xuXG4gICAgLy8gSWYgdGhpcyB3YXMgdHJpZ2dlcmVkIGJ5IFNRUywgZGVsZXRlIHRoZSBtZXNzYWdlIGZyb20gdGhlIHF1ZXVlXG4gICAgaWYgKHJlY29yZCAmJiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwpIHtcbiAgICAgIGNvbnN0IGRlbGV0ZUNvbW1hbmQgPSBuZXcgRGVsZXRlTWVzc2FnZUNvbW1hbmQoe1xuICAgICAgICBRdWV1ZVVybDogcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMLFxuICAgICAgICBSZWNlaXB0SGFuZGxlOiByZWNvcmQucmVjZWlwdEhhbmRsZSxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgc3FzLnNlbmQoZGVsZXRlQ29tbWFuZCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIG1lc3NhZ2U6ICdWaWRlbyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGluIHZpZGVvIGdlbmVyYXRpb246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBicm9hZGNhc3QgdmlkZW8gZ2VuZXJhdGlvbiBwcm9ncmVzcyB2aWEgV2ViU29ja2V0XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gIGFjdGlvbjpcbiAgICB8ICdzY3JpcHRfY3JlYXRlZCdcbiAgICB8ICdpbWFnZV9jcmVhdGVkJ1xuICAgIHwgJ2F1ZGlvX3N1YnRpdGxlX2NyZWF0ZWQnXG4gICAgfCAndmlkZW9fc2NlbmVfY3JlYXRlZCdcbiAgICB8ICdwcmV2aWV3X2NvbXBsZXRlZCdcbiAgICB8ICd2aWRlb19jb21wbGV0ZWQnXG4gICAgfCAnY3JlZGl0X3VwZGF0ZWQnLFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIGRhdGE/OiBhbnksXG4gIG1lc3NhZ2U/OiBzdHJpbmcsXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBwcm9ncmVzc01lc3NhZ2UgPSB7XG4gICAgICBhY3Rpb24sXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICBtZXNzYWdlLFxuICAgICAgICAuLi5kYXRhLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgLy8gR2V0IHRoZSBXZWJTb2NrZXQgZG9tYWluIGFuZCBzdGFnZSBmcm9tIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgIGNvbnN0IGRvbWFpbk5hbWUgPSBwcm9jZXNzLmVudi5XRUJTT0NLRVRfRE9NQUlOX05BTUU7XG4gICAgY29uc3Qgc3RhZ2UgPSBwcm9jZXNzLmVudi5XRUJTT0NLRVRfU1RBR0UgfHwgJ3Byb2QnO1xuXG4gICAgaWYgKGRvbWFpbk5hbWUpIHtcbiAgICAgIGF3YWl0IGJyb2FkY2FzdE1lc3NhZ2UocHJvZ3Jlc3NNZXNzYWdlLCBkb21haW5OYW1lLCBzdGFnZSwgdXNlcklkKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OhIFdlYlNvY2tldCBwcm9ncmVzcyBicm9hZGNhc3Q6ICR7YWN0aW9ufSAtICR7bWVzc2FnZX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGDwn5OhIFdlYlNvY2tldCBub3QgY29uZmlndXJlZCwgc2tpcHBpbmcgYnJvYWRjYXN0OiAke2FjdGlvbn0gLSAke21lc3NhZ2V9YCxcbiAgICAgICk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGJyb2FkY2FzdGluZyB2aWRlbyBwcm9ncmVzczonLCBlcnJvcik7XG4gICAgLy8gRG9uJ3QgdGhyb3cgZXJyb3IgdG8gYXZvaWQgYnJlYWtpbmcgdGhlIG1haW4gcHJvY2Vzc1xuICB9XG59XG4iXX0=