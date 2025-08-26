"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
const image_1 = require("./image");
const narration_1 = require("./narration");
const subtitles_1 = require("./subtitles");
const script_1 = require("./script");
const s3Uploader_1 = require("./util/s3Uploader");
const imageUtils_1 = require("./util/imageUtils");
const videoEffects_1 = require("./util/videoEffects");
const videoCombiner_1 = require("./videoCombiner");
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
        // Use timestamp from request body
        const timestamp = request.timestamp;
        const sceneDuration = Math.floor(request.totalDuration / request.sceneCount);
        // Check if there is already script generated in the s3 bucket for the timestamp
        const scriptKey = `${request.userId}/${timestamp}.script.txt`;
        const existingScript = await (0, s3Uploader_1.getObjectFromS3)(scriptKey);
        let scenes = [];
        let voiceToneInstruction = '';
        if (existingScript) {
            console.log('🎥 Script already generated for the timestamp, using existing script');
            scenes = (0, script_1.addSceneIds)(existingScript.scenes);
            voiceToneInstruction = existingScript.voiceToneInstruction;
        }
        else {
            console.log('🎥 No existing script found, generating new story breakdown');
            // Step 1: Generate script/story breakdown using GPT-4
            const storyBreakdown = await (0, narration_1.generateStoryBreakdown)(request.prompt, request.sceneCount, sceneDuration, request.totalDuration, request.userId, timestamp);
            scenes = storyBreakdown.scenes;
            voiceToneInstruction = storyBreakdown.voiceToneInstruction;
        }
        if (!scenes || scenes.length === 0) {
            console.log('❌ Error: Failed to get or generate story breakdown');
            throw new Error('Failed to get or generate story breakdown');
        }
        console.log('🎥 Story breakdown generated:', scenes);
        await broadcastProgress('script_created', request.userId, timestamp, {
            scenes,
        }, 'Story breakdown completed');
        // Check if there are already images generated in the s3 bucket for the timestamp
        let imageUrls = await (0, imageUtils_1.getImageUrls)(request.userId, timestamp);
        if (imageUrls.length > 0) {
            console.log('🎥 Images already generated for the timestamp:', imageUrls);
        }
        else {
            const seed = Math.floor(Math.random() * 1000000);
            // Step 2: Generate images for each scene in parallel
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
        await broadcastProgress('image_created', request.userId, timestamp, imageUrls, 'Images generated');
        console.log('🎥 No existing audio files found, generating new narration');
        // Step 3: Generate audio narration with word-level timestamps
        const { subtitles, narrationUrls } = await (0, narration_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction);
        const subtitleContent = await (0, subtitles_1.generateSubtitleContent)(scenes, request.userId, timestamp, subtitles);
        console.log('📝 Subtitle content generated:', subtitleContent);
        console.log('🎤 Narration URLs generated:', narrationUrls);
        await broadcastProgress('audio_subtitle_created', request.userId, timestamp, {
            subtitles: subtitles.map((subtitle) => ({
                [`${timestamp}.scene-${subtitle.sceneIndex}.subtitle`]: {
                    text: subtitle.fullText,
                },
            })),
            subtitleContent,
            narrationUrls,
        }, 'Audio and Subtitles completed');
        // Step 4: Generate video clips from images
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
        // Step 4: Generate video effects and camera movement using the images
        const videoEffectsUrls = await (0, videoEffects_1.generateVideoEffects)(scenes, request.userId, timestamp);
        await broadcastProgress('video_scene_created', request.userId, timestamp, {
            videoEffectsUrls,
        }, 'Video effects completed');
        console.log('🎬 Video effects URLs generated:', videoEffectsUrls);
        // Step 6: Combine video clips, audio, and subtitles
        await broadcastProgress('video_scene_created', request.userId, timestamp, undefined, 'Combining final video started');
        const finalVideo = await (0, videoCombiner_1.combineVideoAndAudio)(request.userId, timestamp, scenes);
        if (!finalVideo) {
            throw new Error('Failed to combine video, audio, and subtitles');
        }
        // Step 6: Upload to S3
        const videoKey = await (0, s3Uploader_1.uploadToS3)(finalVideo, request.userId, timestamp);
        // If this was triggered by SQS, delete the message from the queue
        if (record && process.env.VIDEO_QUEUE_URL) {
            const deleteCommand = new client_sqs_1.DeleteMessageCommand({
                QueueUrl: process.env.VIDEO_QUEUE_URL,
                ReceiptHandle: record.receiptHandle,
            });
            await sqs.send(deleteCommand);
        }
        // Broadcast video generation completed event
        await broadcastProgress('video_completed', request.userId, timestamp, { videoKey }, 'Video generation completed');
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFHQSxvREFBc0U7QUFFdEUsbUNBQXdDO0FBQ3hDLDJDQUErRTtBQUMvRSwyQ0FBeUU7QUFDekUscUNBQXVDO0FBQ3ZDLGtEQUFnRTtBQUNoRSxrREFBaUQ7QUFDakQsc0RBQTJEO0FBQzNELG1EQUF1RDtBQUN2RCxnRUFBMEQ7QUFVMUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFdEUsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLEtBQWUsRUFBNkIsRUFBRTtJQUMxRSxPQUFPLENBQUMsR0FBRyxDQUNULHlFQUF5RSxDQUMxRSxDQUFDO0lBQ0YsT0FBTyxNQUFNLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNyQyxDQUFDLENBQUM7QUFMVyxRQUFBLE9BQU8sV0FLbEI7QUFFRixLQUFLLFVBQVUsY0FBYyxDQUFDLEtBQWU7SUFDM0MsTUFBTSxpQkFBaUIsR0FBaUMsRUFBRSxDQUFDO0lBRTNELEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQztZQUNILHlCQUF5QjtZQUN6QixNQUFNLE9BQU8sR0FBMkIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFaEUsa0RBQWtEO1lBQ2xELE1BQU0sc0JBQXNCLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2hELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3JFLGlCQUFpQixDQUFDLElBQUksQ0FB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LElBQUksRUFBRTtnQkFDSixNQUFNO2dCQUNOLFNBQVM7Z0JBQ1QsT0FBTztnQkFDUCxHQUFHLElBQUk7YUFDUjtTQUNGLENBQUM7UUFFRixnRUFBZ0U7UUFDaEUsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQztRQUNyRCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsSUFBSSxNQUFNLENBQUM7UUFFcEQsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBQSxzQ0FBZ0IsRUFBQyxlQUFlLEVBQUUsVUFBVSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztZQUNuRSxPQUFPLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxNQUFNLE1BQU0sT0FBTyxFQUFFLENBQUMsQ0FBQztRQUN6RSxDQUFDO2FBQU0sQ0FBQztZQUNOLE9BQU8sQ0FBQyxHQUFHLENBQ1Qsb0RBQW9ELE1BQU0sTUFBTSxPQUFPLEVBQUUsQ0FDMUUsQ0FBQztRQUNKLENBQUM7SUFDSCxDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsb0NBQW9DLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDM0QsdURBQXVEO0lBQ3pELENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gVXBkYXRlZDogQWRkZWQgZmx1ZW50LWZmbXBlZyBkZXBlbmRlbmN5IHN1cHBvcnRcbmltcG9ydCB7IFNRU0V2ZW50LCBTUVNSZWNvcmQsIFNRU0JhdGNoUmVzcG9uc2UgfSBmcm9tICdhd3MtbGFtYmRhJztcblxuaW1wb3J0IHsgU1FTQ2xpZW50LCBEZWxldGVNZXNzYWdlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zcXMnO1xuXG5pbXBvcnQgeyBnZW5lcmF0ZUltYWdlIH0gZnJvbSAnLi9pbWFnZSc7XG5pbXBvcnQgeyBnZW5lcmF0ZU5hcnJhdGlvbiwgZ2VuZXJhdGVTdG9yeUJyZWFrZG93biwgU2NlbmUgfSBmcm9tICcuL25hcnJhdGlvbic7XG5pbXBvcnQgeyBnZW5lcmF0ZVN1YnRpdGxlcywgZ2VuZXJhdGVTdWJ0aXRsZUNvbnRlbnQgfSBmcm9tICcuL3N1YnRpdGxlcyc7XG5pbXBvcnQgeyBhZGRTY2VuZUlkcyB9IGZyb20gJy4vc2NyaXB0JztcbmltcG9ydCB7IHVwbG9hZFRvUzMsIGdldE9iamVjdEZyb21TMyB9IGZyb20gJy4vdXRpbC9zM1VwbG9hZGVyJztcbmltcG9ydCB7IGdldEltYWdlVXJscyB9IGZyb20gJy4vdXRpbC9pbWFnZVV0aWxzJztcbmltcG9ydCB7IGdlbmVyYXRlVmlkZW9FZmZlY3RzIH0gZnJvbSAnLi91dGlsL3ZpZGVvRWZmZWN0cyc7XG5pbXBvcnQgeyBjb21iaW5lVmlkZW9BbmRBdWRpbyB9IGZyb20gJy4vdmlkZW9Db21iaW5lcic7XG5pbXBvcnQgeyBicm9hZGNhc3RNZXNzYWdlIH0gZnJvbSAnLi4vd2Vic29ja2V0LWJyb2FkY2FzdCc7XG5cbmludGVyZmFjZSBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0IHtcbiAgcHJvbXB0OiBzdHJpbmc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyO1xuICBzY2VuZUNvdW50OiBudW1iZXI7XG59XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBTUVNFdmVudCk6IFByb21pc2U8U1FTQmF0Y2hSZXNwb25zZT4gPT4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+UhCBWaWRlbyBHZW5lcmF0aW9uIExhbWJkYSBzdGFydGVkIC0gVXBkYXRlZCB3aXRoIGZsdWVudC1mZm1wZWcgc3VwcG9ydCcsXG4gICk7XG4gIHJldHVybiBhd2FpdCBoYW5kbGVTUVNFdmVudChldmVudCk7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTUVNFdmVudChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+IHtcbiAgY29uc3QgYmF0Y2hJdGVtRmFpbHVyZXM6IHsgaXRlbUlkZW50aWZpZXI6IHN0cmluZyB9W10gPSBbXTtcblxuICBmb3IgKGNvbnN0IHJlY29yZCBvZiBldmVudC5SZWNvcmRzKSB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIFBhcnNlIHRoZSBtZXNzYWdlIGJvZHlcbiAgICAgIGNvbnN0IHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3QgPSBKU09OLnBhcnNlKHJlY29yZC5ib2R5KTtcblxuICAgICAgLy8gUHJvY2VzcyB0aGUgdmlkZW8gZ2VuZXJhdGlvbiB3aXRoIG9yZGVyZWQgc3RlcHNcbiAgICAgIGF3YWl0IHByb2Nlc3NWaWRlb0dlbmVyYXRpb24ocmVxdWVzdCwgcmVjb3JkKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIHByb2Nlc3NpbmcgcmVjb3JkOicsIHJlY29yZC5tZXNzYWdlSWQsIGVycm9yKTtcbiAgICAgIGJhdGNoSXRlbUZhaWx1cmVzLnB1c2goeyBpdGVtSWRlbnRpZmllcjogcmVjb3JkLm1lc3NhZ2VJZCB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJhdGNoSXRlbUZhaWx1cmVzLFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBwcm9jZXNzVmlkZW9HZW5lcmF0aW9uKFxuICByZXF1ZXN0OiBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0LFxuICByZWNvcmQ/OiBTUVNSZWNvcmQsXG4pOiBQcm9taXNlPGFueT4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKCdwcm9jZXNzVmlkZW9HZW5lcmF0aW9uOicsIHJlcXVlc3QpO1xuXG4gICAgLy8gVXNlIHRpbWVzdGFtcCBmcm9tIHJlcXVlc3QgYm9keVxuICAgIGNvbnN0IHRpbWVzdGFtcCA9IHJlcXVlc3QudGltZXN0YW1wO1xuXG4gICAgY29uc3Qgc2NlbmVEdXJhdGlvbiA9IE1hdGguZmxvb3IoXG4gICAgICByZXF1ZXN0LnRvdGFsRHVyYXRpb24gLyByZXF1ZXN0LnNjZW5lQ291bnQsXG4gICAgKTtcblxuICAgIC8vIENoZWNrIGlmIHRoZXJlIGlzIGFscmVhZHkgc2NyaXB0IGdlbmVyYXRlZCBpbiB0aGUgczMgYnVja2V0IGZvciB0aGUgdGltZXN0YW1wXG4gICAgY29uc3Qgc2NyaXB0S2V5ID0gYCR7cmVxdWVzdC51c2VySWR9LyR7dGltZXN0YW1wfS5zY3JpcHQudHh0YDtcbiAgICBjb25zdCBleGlzdGluZ1NjcmlwdCA9IGF3YWl0IGdldE9iamVjdEZyb21TMyhzY3JpcHRLZXkpO1xuXG4gICAgbGV0IHNjZW5lczogU2NlbmVbXSA9IFtdO1xuICAgIGxldCB2b2ljZVRvbmVJbnN0cnVjdGlvbjogc3RyaW5nID0gJyc7XG5cbiAgICBpZiAoZXhpc3RpbmdTY3JpcHQpIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBTY3JpcHQgYWxyZWFkeSBnZW5lcmF0ZWQgZm9yIHRoZSB0aW1lc3RhbXAsIHVzaW5nIGV4aXN0aW5nIHNjcmlwdCcsXG4gICAgICApO1xuICAgICAgc2NlbmVzID0gYWRkU2NlbmVJZHMoZXhpc3RpbmdTY3JpcHQuc2NlbmVzKTtcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uID0gZXhpc3RpbmdTY3JpcHQudm9pY2VUb25lSW5zdHJ1Y3Rpb247XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAn8J+OpSBObyBleGlzdGluZyBzY3JpcHQgZm91bmQsIGdlbmVyYXRpbmcgbmV3IHN0b3J5IGJyZWFrZG93bicsXG4gICAgICApO1xuXG4gICAgICAvLyBTdGVwIDE6IEdlbmVyYXRlIHNjcmlwdC9zdG9yeSBicmVha2Rvd24gdXNpbmcgR1BULTRcblxuICAgICAgY29uc3Qgc3RvcnlCcmVha2Rvd24gPSBhd2FpdCBnZW5lcmF0ZVN0b3J5QnJlYWtkb3duKFxuICAgICAgICByZXF1ZXN0LnByb21wdCxcbiAgICAgICAgcmVxdWVzdC5zY2VuZUNvdW50LFxuICAgICAgICBzY2VuZUR1cmF0aW9uLFxuICAgICAgICByZXF1ZXN0LnRvdGFsRHVyYXRpb24sXG4gICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICApO1xuICAgICAgc2NlbmVzID0gc3RvcnlCcmVha2Rvd24uc2NlbmVzO1xuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPSBzdG9yeUJyZWFrZG93bi52b2ljZVRvbmVJbnN0cnVjdGlvbjtcbiAgICB9XG5cbiAgICBpZiAoIXNjZW5lcyB8fCBzY2VuZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBGYWlsZWQgdG8gZ2V0IG9yIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2V0IG9yIGdlbmVyYXRlIHN0b3J5IGJyZWFrZG93bicpO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKCfwn46lIFN0b3J5IGJyZWFrZG93biBnZW5lcmF0ZWQ6Jywgc2NlbmVzKTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgJ3NjcmlwdF9jcmVhdGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAge1xuICAgICAgICBzY2VuZXMsXG4gICAgICB9LFxuICAgICAgJ1N0b3J5IGJyZWFrZG93biBjb21wbGV0ZWQnLFxuICAgICk7XG5cbiAgICAvLyBDaGVjayBpZiB0aGVyZSBhcmUgYWxyZWFkeSBpbWFnZXMgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBsZXQgaW1hZ2VVcmxzID0gYXdhaXQgZ2V0SW1hZ2VVcmxzKHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXApO1xuXG4gICAgaWYgKGltYWdlVXJscy5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zb2xlLmxvZygn8J+OpSBJbWFnZXMgYWxyZWFkeSBnZW5lcmF0ZWQgZm9yIHRoZSB0aW1lc3RhbXA6JywgaW1hZ2VVcmxzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3Qgc2VlZCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIDEwMDAwMDApO1xuXG4gICAgICAvLyBTdGVwIDI6IEdlbmVyYXRlIGltYWdlcyBmb3IgZWFjaCBzY2VuZSBpbiBwYXJhbGxlbFxuICAgICAgY29uc29sZS5sb2coJ/CfjqggR2VuZXJhdGluZyBpbWFnZXMgZm9yIGVhY2ggc2NlbmUgaW4gcGFyYWxsZWwuLi4nKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgaW1hZ2VQcm9taXNlcyA9IHNjZW5lcy5tYXAoYXN5bmMgKHNjZW5lOiBhbnksIGk6IG51bWJlcikgPT4ge1xuICAgICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgYPCfjqggR2VuZXJhdGluZyBpbWFnZSBmb3Igc2NlbmUgJHtpICsgMX06YCxcbiAgICAgICAgICAgIHNjZW5lLmRlc2NyaXB0aW9uLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICBjb25zdCBpbWFnZVVybCA9IGF3YWl0IGdlbmVyYXRlSW1hZ2UoXG4gICAgICAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAgICAgICAgIGksXG4gICAgICAgICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgICAgIHNlZWQsXG4gICAgICAgICAgICBzY2VuZS5pZCxcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc29sZS5sb2coYOKchSBTY2VuZSAke2kgKyAxfSBpbWFnZSBnZW5lcmF0ZWQ6YCwgaW1hZ2VVcmwpO1xuICAgICAgICAgIHJldHVybiBpbWFnZVVybDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gV2FpdCBmb3IgYWxsIGltYWdlcyB0byBiZSBnZW5lcmF0ZWRcbiAgICAgICAgY29uc3QgZ2VuZXJhdGVkSW1hZ2VVcmxzID0gYXdhaXQgUHJvbWlzZS5hbGwoaW1hZ2VQcm9taXNlcyk7XG5cbiAgICAgICAgaWYgKGdlbmVyYXRlZEltYWdlVXJscy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyBpbWFnZXMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGltYWdlcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ29udmVydCBnZW5lcmF0ZWQgaW1hZ2UgVVJMcyB0byB0aGUgbmV3IGZvcm1hdFxuICAgICAgICBpbWFnZVVybHMgPSBnZW5lcmF0ZWRJbWFnZVVybHMubWFwKChpbWFnZVVybCwgaW5kZXgpID0+IHtcbiAgICAgICAgICBjb25zdCBmaWxlbmFtZSA9IGAke3RpbWVzdGFtcH0uc2NlbmUtJHtzY2VuZXNbaW5kZXhdLmlkfS5qcGdgO1xuICAgICAgICAgIHJldHVybiB7IFtmaWxlbmFtZV06IGltYWdlVXJsIH07XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgIGDwn46lIEdlbmVyYXRlZCAke2ltYWdlVXJscy5sZW5ndGh9IGltYWdlcyBpbiBwYXJhbGxlbDpgLFxuICAgICAgICAgIGltYWdlVXJscyxcbiAgICAgICAgKTtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gZ2VuZXJhdGUgaW1hZ2VzOicsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZ2VuZXJhdGUgaW1hZ2VzOiAke2Vycm9yfWApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKCfwn5a877iPIEltYWdlIFVSTHMgZ2VuZXJhdGVkOicsIGltYWdlVXJscyk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICdpbWFnZV9jcmVhdGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgaW1hZ2VVcmxzLFxuICAgICAgJ0ltYWdlcyBnZW5lcmF0ZWQnLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OpSBObyBleGlzdGluZyBhdWRpbyBmaWxlcyBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgbmFycmF0aW9uJyk7XG5cbiAgICAvLyBTdGVwIDM6IEdlbmVyYXRlIGF1ZGlvIG5hcnJhdGlvbiB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wc1xuXG4gICAgY29uc3QgeyBzdWJ0aXRsZXMsIG5hcnJhdGlvblVybHMgfSA9IGF3YWl0IGdlbmVyYXRlTmFycmF0aW9uKFxuICAgICAgc2NlbmVzLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbixcbiAgICApO1xuXG4gICAgY29uc3Qgc3VidGl0bGVDb250ZW50ID0gYXdhaXQgZ2VuZXJhdGVTdWJ0aXRsZUNvbnRlbnQoXG4gICAgICBzY2VuZXMsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHN1YnRpdGxlcyxcbiAgICApO1xuXG4gICAgY29uc29sZS5sb2coJ/Cfk50gU3VidGl0bGUgY29udGVudCBnZW5lcmF0ZWQ6Jywgc3VidGl0bGVDb250ZW50KTtcbiAgICBjb25zb2xlLmxvZygn8J+OpCBOYXJyYXRpb24gVVJMcyBnZW5lcmF0ZWQ6JywgbmFycmF0aW9uVXJscyk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RQcm9ncmVzcyhcbiAgICAgICdhdWRpb19zdWJ0aXRsZV9jcmVhdGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAge1xuICAgICAgICBzdWJ0aXRsZXM6IHN1YnRpdGxlcy5tYXAoKHN1YnRpdGxlKSA9PiAoe1xuICAgICAgICAgIFtgJHt0aW1lc3RhbXB9LnNjZW5lLSR7c3VidGl0bGUuc2NlbmVJbmRleH0uc3VidGl0bGVgXToge1xuICAgICAgICAgICAgdGV4dDogc3VidGl0bGUuZnVsbFRleHQsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSkpLFxuICAgICAgICBzdWJ0aXRsZUNvbnRlbnQsXG4gICAgICAgIG5hcnJhdGlvblVybHMsXG4gICAgICB9LFxuICAgICAgJ0F1ZGlvIGFuZCBTdWJ0aXRsZXMgY29tcGxldGVkJyxcbiAgICApO1xuXG4gICAgLy8gU3RlcCA0OiBHZW5lcmF0ZSB2aWRlbyBjbGlwcyBmcm9tIGltYWdlc1xuICAgIC8vIGNvbnNvbGUubG9nKCfwn46lIEdlbmVyYXRpbmcgdmlkZW8gY2xpcHMgZnJvbSBpbWFnZXMuLi4nKTtcbiAgICAvLyBjb25zdCB2aWRlb0NsaXBzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgLy8gZm9yIChsZXQgaSA9IDA7IGkgPCBzY2VuZXMubGVuZ3RoOyBpKyspIHtcbiAgICAvLyAgIGNvbnN0IHNjZW5lID0gc2NlbmVzW2ldO1xuICAgIC8vICAgY29uc3QgaW1hZ2VVcmwgPSBpbWFnZVVybHNbaV07XG4gICAgLy8gICBjb25zb2xlLmxvZyhcbiAgICAvLyAgICAgYPCfjqwgR2VuZXJhdGluZyB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX0gZnJvbSBpbWFnZTpgLFxuICAgIC8vICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAvLyAgICk7XG4gICAgLy8gICB0cnkge1xuICAgIC8vICAgICBjb25zdCB2aWRlb0NsaXAgPSBhd2FpdCBnZW5lcmF0ZVZpZGVvQ2xpcChcbiAgICAvLyAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAvLyAgICAgICBzY2VuZS5kdXJhdGlvbixcbiAgICAvLyAgICAgICBpLFxuICAgIC8vICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgIC8vICAgICAgIHRpbWVzdGFtcCxcbiAgICAvLyAgICAgICBzZWVkLFxuICAgIC8vICAgICAgIHNjZW5lLmlkLFxuICAgIC8vICAgICAgIGltYWdlVXJsLFxuICAgIC8vICAgICApO1xuICAgIC8vICAgICB2aWRlb0NsaXBzLnB1c2godmlkZW9DbGlwKTtcbiAgICAvLyAgICAgY29uc29sZS5sb2coYOKchSBTY2VuZSAke2kgKyAxfSB2aWRlbyBnZW5lcmF0ZWQ6YCwgdmlkZW9DbGlwKTtcbiAgICAvLyAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9OmAsIGVycm9yKTtcbiAgICAvLyAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgIC8vICAgICAgIGBGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9OiAke2Vycm9yfWAsXG4gICAgLy8gICAgICk7XG4gICAgLy8gICB9XG4gICAgLy8gfVxuXG4gICAgLy8gaWYgKHZpZGVvQ2xpcHMubGVuZ3RoID09PSAwKSB7XG4gICAgLy8gICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyB2aWRlbyBjbGlwcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgIC8vICAgdGhyb3cgbmV3IEVycm9yKCdObyB2aWRlbyBjbGlwcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgIC8vIH1cblxuICAgIC8vIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkICR7dmlkZW9DbGlwcy5sZW5ndGh9IHZpZGVvIGNsaXBzYCk7XG5cbiAgICAvLyBTdGVwIDQ6IEdlbmVyYXRlIHZpZGVvIGVmZmVjdHMgYW5kIGNhbWVyYSBtb3ZlbWVudCB1c2luZyB0aGUgaW1hZ2VzXG5cbiAgICBjb25zdCB2aWRlb0VmZmVjdHNVcmxzID0gYXdhaXQgZ2VuZXJhdGVWaWRlb0VmZmVjdHMoXG4gICAgICBzY2VuZXMsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICApO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAndmlkZW9fc2NlbmVfY3JlYXRlZCcsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHtcbiAgICAgICAgdmlkZW9FZmZlY3RzVXJscyxcbiAgICAgIH0sXG4gICAgICAnVmlkZW8gZWZmZWN0cyBjb21wbGV0ZWQnLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OrCBWaWRlbyBlZmZlY3RzIFVSTHMgZ2VuZXJhdGVkOicsIHZpZGVvRWZmZWN0c1VybHMpO1xuXG4gICAgLy8gU3RlcCA2OiBDb21iaW5lIHZpZGVvIGNsaXBzLCBhdWRpbywgYW5kIHN1YnRpdGxlc1xuICAgIGF3YWl0IGJyb2FkY2FzdFByb2dyZXNzKFxuICAgICAgJ3ZpZGVvX3NjZW5lX2NyZWF0ZWQnLFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICB1bmRlZmluZWQsXG4gICAgICAnQ29tYmluaW5nIGZpbmFsIHZpZGVvIHN0YXJ0ZWQnLFxuICAgICk7XG5cbiAgICBjb25zdCBmaW5hbFZpZGVvID0gYXdhaXQgY29tYmluZVZpZGVvQW5kQXVkaW8oXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHNjZW5lcyxcbiAgICApO1xuXG4gICAgaWYgKCFmaW5hbFZpZGVvKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBjb21iaW5lIHZpZGVvLCBhdWRpbywgYW5kIHN1YnRpdGxlcycpO1xuICAgIH1cblxuICAgIC8vIFN0ZXAgNjogVXBsb2FkIHRvIFMzXG4gICAgY29uc3QgdmlkZW9LZXkgPSBhd2FpdCB1cGxvYWRUb1MzKGZpbmFsVmlkZW8sIHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXApO1xuXG4gICAgLy8gSWYgdGhpcyB3YXMgdHJpZ2dlcmVkIGJ5IFNRUywgZGVsZXRlIHRoZSBtZXNzYWdlIGZyb20gdGhlIHF1ZXVlXG4gICAgaWYgKHJlY29yZCAmJiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwpIHtcbiAgICAgIGNvbnN0IGRlbGV0ZUNvbW1hbmQgPSBuZXcgRGVsZXRlTWVzc2FnZUNvbW1hbmQoe1xuICAgICAgICBRdWV1ZVVybDogcHJvY2Vzcy5lbnYuVklERU9fUVVFVUVfVVJMLFxuICAgICAgICBSZWNlaXB0SGFuZGxlOiByZWNvcmQucmVjZWlwdEhhbmRsZSxcbiAgICAgIH0pO1xuICAgICAgYXdhaXQgc3FzLnNlbmQoZGVsZXRlQ29tbWFuZCk7XG4gICAgfVxuXG4gICAgLy8gQnJvYWRjYXN0IHZpZGVvIGdlbmVyYXRpb24gY29tcGxldGVkIGV2ZW50XG4gICAgYXdhaXQgYnJvYWRjYXN0UHJvZ3Jlc3MoXG4gICAgICAndmlkZW9fY29tcGxldGVkJyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgeyB2aWRlb0tleSB9LFxuICAgICAgJ1ZpZGVvIGdlbmVyYXRpb24gY29tcGxldGVkJyxcbiAgICApO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIG1lc3NhZ2U6ICdWaWRlbyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGluIHZpZGVvIGdlbmVyYXRpb246JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBicm9hZGNhc3QgdmlkZW8gZ2VuZXJhdGlvbiBwcm9ncmVzcyB2aWEgV2ViU29ja2V0XG5hc3luYyBmdW5jdGlvbiBicm9hZGNhc3RQcm9ncmVzcyhcbiAgYWN0aW9uOlxuICAgIHwgJ3NjcmlwdF9jcmVhdGVkJ1xuICAgIHwgJ2ltYWdlX2NyZWF0ZWQnXG4gICAgfCAnYXVkaW9fc3VidGl0bGVfY3JlYXRlZCdcbiAgICB8ICd2aWRlb19zY2VuZV9jcmVhdGVkJ1xuICAgIHwgJ3ZpZGVvX2NvbXBsZXRlZCcsXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgZGF0YT86IGFueSxcbiAgbWVzc2FnZT86IHN0cmluZyxcbik6IFByb21pc2U8dm9pZD4ge1xuICB0cnkge1xuICAgIGNvbnN0IHByb2dyZXNzTWVzc2FnZSA9IHtcbiAgICAgIGFjdGlvbixcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgdXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgIG1lc3NhZ2UsXG4gICAgICAgIC4uLmRhdGEsXG4gICAgICB9LFxuICAgIH07XG5cbiAgICAvLyBHZXQgdGhlIFdlYlNvY2tldCBkb21haW4gYW5kIHN0YWdlIGZyb20gZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAgY29uc3QgZG9tYWluTmFtZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9ET01BSU5fTkFNRTtcbiAgICBjb25zdCBzdGFnZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9TVEFHRSB8fCAncHJvZCc7XG5cbiAgICBpZiAoZG9tYWluTmFtZSkge1xuICAgICAgYXdhaXQgYnJvYWRjYXN0TWVzc2FnZShwcm9ncmVzc01lc3NhZ2UsIGRvbWFpbk5hbWUsIHN0YWdlLCB1c2VySWQpO1xuICAgICAgY29uc29sZS5sb2coYPCfk6EgV2ViU29ja2V0IHByb2dyZXNzIGJyb2FkY2FzdDogJHthY3Rpb259IC0gJHttZXNzYWdlfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgYPCfk6EgV2ViU29ja2V0IG5vdCBjb25maWd1cmVkLCBza2lwcGluZyBicm9hZGNhc3Q6ICR7YWN0aW9ufSAtICR7bWVzc2FnZX1gLFxuICAgICAgKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgYnJvYWRjYXN0aW5nIHZpZGVvIHByb2dyZXNzOicsIGVycm9yKTtcbiAgICAvLyBEb24ndCB0aHJvdyBlcnJvciB0byBhdm9pZCBicmVha2luZyB0aGUgbWFpbiBwcm9jZXNzXG4gIH1cbn1cbiJdfQ==