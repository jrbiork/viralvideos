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
        // Send initial progress update
        await broadcastVideoProgress(request.userId, timestamp, 'Video generation started');
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
        await broadcastVideoProgress(request.userId, timestamp, 'Story breakdown completed', {
            scenes,
        });
        broadcastVideoProgress(request.userId, timestamp, 'Generating images');
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
        await broadcastVideoProgress(request.userId, timestamp, 'Images generated', imageUrls);
        console.log('🎥 No existing audio files found, generating new narration');
        // Step 3: Generate audio narration with word-level timestamps
        await broadcastVideoProgress(request.userId, timestamp, 'Generating subtitles and audio');
        const { subtitles, narrationUrls } = await (0, narration_1.generateNarration)(scenes, request.userId, timestamp, voiceToneInstruction);
        const subtitleUrls = await (0, subtitles_1.generateSubtitles)(scenes, request.userId, timestamp, subtitles);
        console.log('📝 Subtitle URLs generated:', subtitleUrls);
        console.log('🎤 Narration URLs generated:', narrationUrls);
        await broadcastVideoProgress(request.userId, timestamp, 'Audio and Subtitles completed', {
            imageUrls,
            subtitleUrls,
            narrationUrls,
        });
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
        await broadcastVideoProgress(request.userId, timestamp, 'Generating video effects');
        const videoEffectsUrls = await (0, videoEffects_1.generateVideoEffects)(scenes, request.userId, timestamp);
        await broadcastVideoProgress(request.userId, timestamp, 'Video effects completed', {
            imageUrls,
            videoEffectsUrls,
        });
        console.log('🎬 Video effects URLs generated:', videoEffectsUrls);
        // Step 6: Combine video clips, audio, and subtitles
        await broadcastVideoProgress(request.userId, timestamp, 'Combining final video started');
        const finalVideo = await (0, videoCombiner_1.combineVideoAndAudio)(request.userId, timestamp, scenes);
        await broadcastVideoProgress(request.userId, timestamp, 'Final video combined');
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
        await broadcastVideoGenerationCompleted(request.userId, timestamp, videoKey);
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
async function broadcastVideoProgress(userId, timestamp, message, data) {
    try {
        const progressMessage = {
            action: 'video_generation_progress',
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
            console.log(`📡 WebSocket progress broadcast: ${message}`);
        }
        else {
            console.log(`📡 WebSocket not configured, skipping broadcast: ${message}`);
        }
    }
    catch (error) {
        console.error('Error broadcasting video progress:', error);
        // Don't throw error to avoid breaking the main process
    }
}
// Helper function to broadcast subtitle files completed event
async function broadcastSubtitleFilesCompleted(userId, timestamp, subtitleUrls) {
    try {
        const subtitleMessage = {
            action: 'subtitle_files_completed',
            data: {
                userId,
                timestamp,
                subtitleFiles: subtitleUrls,
            },
        };
        const domainName = process.env.WEBSOCKET_DOMAIN_NAME;
        const stage = process.env.WEBSOCKET_STAGE || 'prod';
        if (domainName) {
            await (0, websocket_broadcast_1.broadcastMessage)(subtitleMessage, domainName, stage, userId);
            console.log(`📡 WebSocket subtitle files completed broadcast`);
        }
        else {
            console.log(`📡 WebSocket not configured, skipping subtitle broadcast`);
        }
    }
    catch (error) {
        console.error('Error broadcasting subtitle files completed:', error);
    }
}
// Helper function to broadcast media files completed event
async function broadcastMediaFilesCompleted(userId, timestamp, videoEffectsUrls, imageUrls) {
    try {
        const mediaMessage = {
            action: 'media_files_completed',
            data: {
                userId,
                timestamp,
                mediaFiles: {
                    videoEffects: videoEffectsUrls,
                    images: imageUrls,
                },
                assFiles: {}, // This will be populated by the frontend when needed
            },
        };
        const domainName = process.env.WEBSOCKET_DOMAIN_NAME;
        const stage = process.env.WEBSOCKET_STAGE || 'prod';
        if (domainName) {
            await (0, websocket_broadcast_1.broadcastMessage)(mediaMessage, domainName, stage, userId);
            console.log(`📡 WebSocket media files completed broadcast`);
        }
        else {
            console.log(`📡 WebSocket not configured, skipping media broadcast`);
        }
    }
    catch (error) {
        console.error('Error broadcasting media files completed:', error);
    }
}
// Helper function to broadcast video generation completed event
async function broadcastVideoGenerationCompleted(userId, timestamp, videoKey) {
    try {
        const completionMessage = {
            action: 'video_generation_completed',
            data: {
                userId,
                timestamp,
                videoKey,
                message: 'Video generation completed successfully',
            },
        };
        const domainName = process.env.WEBSOCKET_DOMAIN_NAME;
        const stage = process.env.WEBSOCKET_STAGE || 'prod';
        if (domainName) {
            await (0, websocket_broadcast_1.broadcastMessage)(completionMessage, domainName, stage, userId);
            console.log(`📡 WebSocket video generation completed broadcast`);
        }
        else {
            console.log(`📡 WebSocket not configured, skipping completion broadcast`);
        }
    }
    catch (error) {
        console.error('Error broadcasting video generation completed:', error);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFHQSxvREFBc0U7QUFFdEUsbUNBQXdDO0FBQ3hDLDJDQUErRTtBQUMvRSwyQ0FBZ0Q7QUFDaEQscUNBQXVDO0FBQ3ZDLGtEQUFnRTtBQUNoRSxrREFBaUQ7QUFDakQsc0RBQTJEO0FBQzNELG1EQUF1RDtBQUN2RCxnRUFBMEQ7QUFVMUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLFdBQVcsRUFBRSxDQUFDLENBQUM7QUFFdEUsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLEtBQWUsRUFBNkIsRUFBRTtJQUMxRSxPQUFPLENBQUMsR0FBRyxDQUNULHlFQUF5RSxDQUMxRSxDQUFDO0lBQ0YsT0FBTyxNQUFNLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNyQyxDQUFDLENBQUM7QUFMVyxRQUFBLE9BQU8sV0FLbEI7QUFFRixLQUFLLFVBQVUsY0FBYyxDQUFDLEtBQWU7SUFDM0MsTUFBTSxpQkFBaUIsR0FBaUMsRUFBRSxDQUFDO0lBRTNELEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQztZQUNILHlCQUF5QjtZQUN6QixNQUFNLE9BQU8sR0FBMkIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFFaEUsa0RBQWtEO1lBQ2xELE1BQU0sc0JBQXNCLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2hELENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyw0QkFBNEIsRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQ3JFLGlCQUFpQixDQUFDLElBQUksQ0FB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Ii8vIFVwZGF0ZWQ6IEFkZGVkIGZsdWVudC1mZm1wZWcgZGVwZW5kZW5jeSBzdXBwb3J0XG5pbXBvcnQgeyBTUVNFdmVudCwgU1FTUmVjb3JkLCBTUVNCYXRjaFJlc3BvbnNlIH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5cbmltcG9ydCB7IFNRU0NsaWVudCwgRGVsZXRlTWVzc2FnZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3FzJztcblxuaW1wb3J0IHsgZ2VuZXJhdGVJbWFnZSB9IGZyb20gJy4vaW1hZ2UnO1xuaW1wb3J0IHsgZ2VuZXJhdGVOYXJyYXRpb24sIGdlbmVyYXRlU3RvcnlCcmVha2Rvd24sIFNjZW5lIH0gZnJvbSAnLi9uYXJyYXRpb24nO1xuaW1wb3J0IHsgZ2VuZXJhdGVTdWJ0aXRsZXMgfSBmcm9tICcuL3N1YnRpdGxlcyc7XG5pbXBvcnQgeyBhZGRTY2VuZUlkcyB9IGZyb20gJy4vc2NyaXB0JztcbmltcG9ydCB7IHVwbG9hZFRvUzMsIGdldE9iamVjdEZyb21TMyB9IGZyb20gJy4vdXRpbC9zM1VwbG9hZGVyJztcbmltcG9ydCB7IGdldEltYWdlVXJscyB9IGZyb20gJy4vdXRpbC9pbWFnZVV0aWxzJztcbmltcG9ydCB7IGdlbmVyYXRlVmlkZW9FZmZlY3RzIH0gZnJvbSAnLi91dGlsL3ZpZGVvRWZmZWN0cyc7XG5pbXBvcnQgeyBjb21iaW5lVmlkZW9BbmRBdWRpbyB9IGZyb20gJy4vdmlkZW9Db21iaW5lcic7XG5pbXBvcnQgeyBicm9hZGNhc3RNZXNzYWdlIH0gZnJvbSAnLi4vd2Vic29ja2V0LWJyb2FkY2FzdCc7XG5cbmludGVyZmFjZSBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0IHtcbiAgcHJvbXB0OiBzdHJpbmc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICB0aW1lc3RhbXA6IHN0cmluZztcbiAgdG90YWxEdXJhdGlvbjogbnVtYmVyO1xuICBzY2VuZUNvdW50OiBudW1iZXI7XG59XG5cbmNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ3VzLWVhc3QtMScgfSk7XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBTUVNFdmVudCk6IFByb21pc2U8U1FTQmF0Y2hSZXNwb25zZT4gPT4ge1xuICBjb25zb2xlLmxvZyhcbiAgICAn8J+UhCBWaWRlbyBHZW5lcmF0aW9uIExhbWJkYSBzdGFydGVkIC0gVXBkYXRlZCB3aXRoIGZsdWVudC1mZm1wZWcgc3VwcG9ydCcsXG4gICk7XG4gIHJldHVybiBhd2FpdCBoYW5kbGVTUVNFdmVudChldmVudCk7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVTUVNFdmVudChldmVudDogU1FTRXZlbnQpOiBQcm9taXNlPFNRU0JhdGNoUmVzcG9uc2U+IHtcbiAgY29uc3QgYmF0Y2hJdGVtRmFpbHVyZXM6IHsgaXRlbUlkZW50aWZpZXI6IHN0cmluZyB9W10gPSBbXTtcblxuICBmb3IgKGNvbnN0IHJlY29yZCBvZiBldmVudC5SZWNvcmRzKSB7XG4gICAgdHJ5IHtcbiAgICAgIC8vIFBhcnNlIHRoZSBtZXNzYWdlIGJvZHlcbiAgICAgIGNvbnN0IHJlcXVlc3Q6IFZpZGVvR2VuZXJhdGlvblJlcXVlc3QgPSBKU09OLnBhcnNlKHJlY29yZC5ib2R5KTtcblxuICAgICAgLy8gUHJvY2VzcyB0aGUgdmlkZW8gZ2VuZXJhdGlvbiB3aXRoIG9yZGVyZWQgc3RlcHNcbiAgICAgIGF3YWl0IHByb2Nlc3NWaWRlb0dlbmVyYXRpb24ocmVxdWVzdCwgcmVjb3JkKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcign4p2MIEVycm9yIHByb2Nlc3NpbmcgcmVjb3JkOicsIHJlY29yZC5tZXNzYWdlSWQsIGVycm9yKTtcbiAgICAgIGJhdGNoSXRlbUZhaWx1cmVzLnB1c2goeyBpdGVtSWRlbnRpZmllcjogcmVjb3JkLm1lc3NhZ2VJZCB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGJhdGNoSXRlbUZhaWx1cmVzLFxuICB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBwcm9jZXNzVmlkZW9HZW5lcmF0aW9uKFxuICByZXF1ZXN0OiBWaWRlb0dlbmVyYXRpb25SZXF1ZXN0LFxuICByZWNvcmQ/OiBTUVNSZWNvcmQsXG4pOiBQcm9taXNlPGFueT4ge1xuICB0cnkge1xuICAgIGNvbnNvbGUubG9nKCdwcm9jZXNzVmlkZW9HZW5lcmF0aW9uOicsIHJlcXVlc3QpO1xuXG4gICAgLy8gVXNlIHRpbWVzdGFtcCBmcm9tIHJlcXVlc3QgYm9keVxuICAgIGNvbnN0IHRpbWVzdGFtcCA9IHJlcXVlc3QudGltZXN0YW1wO1xuXG4gICAgLy8gU2VuZCBpbml0aWFsIHByb2dyZXNzIHVwZGF0ZVxuICAgIGF3YWl0IGJyb2FkY2FzdFZpZGVvUHJvZ3Jlc3MoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgICdWaWRlbyBnZW5lcmF0aW9uIHN0YXJ0ZWQnLFxuICAgICk7XG5cbiAgICBjb25zdCBzY2VuZUR1cmF0aW9uID0gTWF0aC5mbG9vcihcbiAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbiAvIHJlcXVlc3Quc2NlbmVDb3VudCxcbiAgICApO1xuXG4gICAgLy8gQ2hlY2sgaWYgdGhlcmUgaXMgYWxyZWFkeSBzY3JpcHQgZ2VuZXJhdGVkIGluIHRoZSBzMyBidWNrZXQgZm9yIHRoZSB0aW1lc3RhbXBcbiAgICBjb25zdCBzY3JpcHRLZXkgPSBgJHtyZXF1ZXN0LnVzZXJJZH0vJHt0aW1lc3RhbXB9LnNjcmlwdC50eHRgO1xuICAgIGNvbnN0IGV4aXN0aW5nU2NyaXB0ID0gYXdhaXQgZ2V0T2JqZWN0RnJvbVMzKHNjcmlwdEtleSk7XG5cbiAgICBsZXQgc2NlbmVzOiBTY2VuZVtdID0gW107XG4gICAgbGV0IHZvaWNlVG9uZUluc3RydWN0aW9uOiBzdHJpbmcgPSAnJztcblxuICAgIGlmIChleGlzdGluZ1NjcmlwdCkge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIFNjcmlwdCBhbHJlYWR5IGdlbmVyYXRlZCBmb3IgdGhlIHRpbWVzdGFtcCwgdXNpbmcgZXhpc3Rpbmcgc2NyaXB0JyxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBhZGRTY2VuZUlkcyhleGlzdGluZ1NjcmlwdC5zY2VuZXMpO1xuICAgICAgdm9pY2VUb25lSW5zdHJ1Y3Rpb24gPSBleGlzdGluZ1NjcmlwdC52b2ljZVRvbmVJbnN0cnVjdGlvbjtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICfwn46lIE5vIGV4aXN0aW5nIHNjcmlwdCBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgc3RvcnkgYnJlYWtkb3duJyxcbiAgICAgICk7XG5cbiAgICAgIC8vIFN0ZXAgMTogR2VuZXJhdGUgc2NyaXB0L3N0b3J5IGJyZWFrZG93biB1c2luZyBHUFQtNFxuXG4gICAgICBjb25zdCBzdG9yeUJyZWFrZG93biA9IGF3YWl0IGdlbmVyYXRlU3RvcnlCcmVha2Rvd24oXG4gICAgICAgIHJlcXVlc3QucHJvbXB0LFxuICAgICAgICByZXF1ZXN0LnNjZW5lQ291bnQsXG4gICAgICAgIHNjZW5lRHVyYXRpb24sXG4gICAgICAgIHJlcXVlc3QudG90YWxEdXJhdGlvbixcbiAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICk7XG4gICAgICBzY2VuZXMgPSBzdG9yeUJyZWFrZG93bi5zY2VuZXM7XG4gICAgICB2b2ljZVRvbmVJbnN0cnVjdGlvbiA9IHN0b3J5QnJlYWtkb3duLnZvaWNlVG9uZUluc3RydWN0aW9uO1xuICAgIH1cblxuICAgIGlmICghc2NlbmVzIHx8IHNjZW5lcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUubG9nKCfinYwgRXJyb3I6IEZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZXQgb3IgZ2VuZXJhdGUgc3RvcnkgYnJlYWtkb3duJyk7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coJ/CfjqUgU3RvcnkgYnJlYWtkb3duIGdlbmVyYXRlZDonLCBzY2VuZXMpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0VmlkZW9Qcm9ncmVzcyhcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgJ1N0b3J5IGJyZWFrZG93biBjb21wbGV0ZWQnLFxuICAgICAge1xuICAgICAgICBzY2VuZXMsXG4gICAgICB9LFxuICAgICk7XG5cbiAgICBicm9hZGNhc3RWaWRlb1Byb2dyZXNzKHJlcXVlc3QudXNlcklkLCB0aW1lc3RhbXAsICdHZW5lcmF0aW5nIGltYWdlcycpO1xuXG4gICAgLy8gQ2hlY2sgaWYgdGhlcmUgYXJlIGFscmVhZHkgaW1hZ2VzIGdlbmVyYXRlZCBpbiB0aGUgczMgYnVja2V0IGZvciB0aGUgdGltZXN0YW1wXG4gICAgbGV0IGltYWdlVXJscyA9IGF3YWl0IGdldEltYWdlVXJscyhyZXF1ZXN0LnVzZXJJZCwgdGltZXN0YW1wKTtcblxuICAgIGlmIChpbWFnZVVybHMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc29sZS5sb2coJ/CfjqUgSW1hZ2VzIGFscmVhZHkgZ2VuZXJhdGVkIGZvciB0aGUgdGltZXN0YW1wOicsIGltYWdlVXJscyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHNlZWQgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAxMDAwMDAwKTtcblxuICAgICAgLy8gU3RlcCAyOiBHZW5lcmF0ZSBpbWFnZXMgZm9yIGVhY2ggc2NlbmUgaW4gcGFyYWxsZWxcbiAgICAgIGNvbnNvbGUubG9nKCfwn46oIEdlbmVyYXRpbmcgaW1hZ2VzIGZvciBlYWNoIHNjZW5lIGluIHBhcmFsbGVsLi4uJyk7XG5cbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGltYWdlUHJvbWlzZXMgPSBzY2VuZXMubWFwKGFzeW5jIChzY2VuZTogYW55LCBpOiBudW1iZXIpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgIGDwn46oIEdlbmVyYXRpbmcgaW1hZ2UgZm9yIHNjZW5lICR7aSArIDF9OmAsXG4gICAgICAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAgICAgICApO1xuXG4gICAgICAgICAgY29uc3QgaW1hZ2VVcmwgPSBhd2FpdCBnZW5lcmF0ZUltYWdlKFxuICAgICAgICAgICAgc2NlbmUuZGVzY3JpcHRpb24sXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgICAgICBzZWVkLFxuICAgICAgICAgICAgc2NlbmUuaWQsXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIGNvbnNvbGUubG9nKGDinIUgU2NlbmUgJHtpICsgMX0gaW1hZ2UgZ2VuZXJhdGVkOmAsIGltYWdlVXJsKTtcbiAgICAgICAgICByZXR1cm4gaW1hZ2VVcmw7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFdhaXQgZm9yIGFsbCBpbWFnZXMgdG8gYmUgZ2VuZXJhdGVkXG4gICAgICAgIGNvbnN0IGdlbmVyYXRlZEltYWdlVXJscyA9IGF3YWl0IFByb21pc2UuYWxsKGltYWdlUHJvbWlzZXMpO1xuXG4gICAgICAgIGlmIChnZW5lcmF0ZWRJbWFnZVVybHMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ+KdjCBFcnJvcjogTm8gaW1hZ2VzIHdlcmUgZ2VuZXJhdGVkJyk7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBpbWFnZXMgd2VyZSBnZW5lcmF0ZWQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENvbnZlcnQgZ2VuZXJhdGVkIGltYWdlIFVSTHMgdG8gdGhlIG5ldyBmb3JtYXRcbiAgICAgICAgaW1hZ2VVcmxzID0gZ2VuZXJhdGVkSW1hZ2VVcmxzLm1hcCgoaW1hZ2VVcmwsIGluZGV4KSA9PiB7XG4gICAgICAgICAgY29uc3QgZmlsZW5hbWUgPSBgJHt0aW1lc3RhbXB9LnNjZW5lLSR7c2NlbmVzW2luZGV4XS5pZH0uanBnYDtcbiAgICAgICAgICByZXR1cm4geyBbZmlsZW5hbWVdOiBpbWFnZVVybCB9O1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBg8J+OpSBHZW5lcmF0ZWQgJHtpbWFnZVVybHMubGVuZ3RofSBpbWFnZXMgaW4gcGFyYWxsZWw6YCxcbiAgICAgICAgICBpbWFnZVVybHMsXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCfinYwgRmFpbGVkIHRvIGdlbmVyYXRlIGltYWdlczonLCBlcnJvcik7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGdlbmVyYXRlIGltYWdlczogJHtlcnJvcn1gKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zb2xlLmxvZygn8J+WvO+4jyBJbWFnZSBVUkxzIGdlbmVyYXRlZDonLCBpbWFnZVVybHMpO1xuXG4gICAgYXdhaXQgYnJvYWRjYXN0VmlkZW9Qcm9ncmVzcyhcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgJ0ltYWdlcyBnZW5lcmF0ZWQnLFxuICAgICAgaW1hZ2VVcmxzLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OpSBObyBleGlzdGluZyBhdWRpbyBmaWxlcyBmb3VuZCwgZ2VuZXJhdGluZyBuZXcgbmFycmF0aW9uJyk7XG5cbiAgICAvLyBTdGVwIDM6IEdlbmVyYXRlIGF1ZGlvIG5hcnJhdGlvbiB3aXRoIHdvcmQtbGV2ZWwgdGltZXN0YW1wc1xuICAgIGF3YWl0IGJyb2FkY2FzdFZpZGVvUHJvZ3Jlc3MoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgICdHZW5lcmF0aW5nIHN1YnRpdGxlcyBhbmQgYXVkaW8nLFxuICAgICk7XG5cbiAgICBjb25zdCB7IHN1YnRpdGxlcywgbmFycmF0aW9uVXJscyB9ID0gYXdhaXQgZ2VuZXJhdGVOYXJyYXRpb24oXG4gICAgICBzY2VuZXMsXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHZvaWNlVG9uZUluc3RydWN0aW9uLFxuICAgICk7XG5cbiAgICBjb25zdCBzdWJ0aXRsZVVybHMgPSBhd2FpdCBnZW5lcmF0ZVN1YnRpdGxlcyhcbiAgICAgIHNjZW5lcyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc3VidGl0bGVzLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+TnSBTdWJ0aXRsZSBVUkxzIGdlbmVyYXRlZDonLCBzdWJ0aXRsZVVybHMpO1xuICAgIGNvbnNvbGUubG9nKCfwn46kIE5hcnJhdGlvbiBVUkxzIGdlbmVyYXRlZDonLCBuYXJyYXRpb25VcmxzKTtcblxuICAgIGF3YWl0IGJyb2FkY2FzdFZpZGVvUHJvZ3Jlc3MoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgICdBdWRpbyBhbmQgU3VidGl0bGVzIGNvbXBsZXRlZCcsXG4gICAgICB7XG4gICAgICAgIGltYWdlVXJscyxcbiAgICAgICAgc3VidGl0bGVVcmxzLFxuICAgICAgICBuYXJyYXRpb25VcmxzLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gU3RlcCA0OiBHZW5lcmF0ZSB2aWRlbyBjbGlwcyBmcm9tIGltYWdlc1xuICAgIC8vIGNvbnNvbGUubG9nKCfwn46lIEdlbmVyYXRpbmcgdmlkZW8gY2xpcHMgZnJvbSBpbWFnZXMuLi4nKTtcbiAgICAvLyBjb25zdCB2aWRlb0NsaXBzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgLy8gZm9yIChsZXQgaSA9IDA7IGkgPCBzY2VuZXMubGVuZ3RoOyBpKyspIHtcbiAgICAvLyAgIGNvbnN0IHNjZW5lID0gc2NlbmVzW2ldO1xuICAgIC8vICAgY29uc3QgaW1hZ2VVcmwgPSBpbWFnZVVybHNbaV07XG4gICAgLy8gICBjb25zb2xlLmxvZyhcbiAgICAvLyAgICAgYPCfjqwgR2VuZXJhdGluZyB2aWRlbyBmb3Igc2NlbmUgJHtpICsgMX0gZnJvbSBpbWFnZTpgLFxuICAgIC8vICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAvLyAgICk7XG4gICAgLy8gICB0cnkge1xuICAgIC8vICAgICBjb25zdCB2aWRlb0NsaXAgPSBhd2FpdCBnZW5lcmF0ZVZpZGVvQ2xpcChcbiAgICAvLyAgICAgICBzY2VuZS5kZXNjcmlwdGlvbixcbiAgICAvLyAgICAgICBzY2VuZS5kdXJhdGlvbixcbiAgICAvLyAgICAgICBpLFxuICAgIC8vICAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgIC8vICAgICAgIHRpbWVzdGFtcCxcbiAgICAvLyAgICAgICBzZWVkLFxuICAgIC8vICAgICAgIHNjZW5lLmlkLFxuICAgIC8vICAgICAgIGltYWdlVXJsLFxuICAgIC8vICAgICApO1xuICAgIC8vICAgICB2aWRlb0NsaXBzLnB1c2godmlkZW9DbGlwKTtcbiAgICAvLyAgICAgY29uc29sZS5sb2coYOKchSBTY2VuZSAke2kgKyAxfSB2aWRlbyBnZW5lcmF0ZWQ6YCwgdmlkZW9DbGlwKTtcbiAgICAvLyAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gICAgIGNvbnNvbGUuZXJyb3IoYOKdjCBGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9OmAsIGVycm9yKTtcbiAgICAvLyAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgIC8vICAgICAgIGBGYWlsZWQgdG8gZ2VuZXJhdGUgdmlkZW8gZm9yIHNjZW5lICR7aSArIDF9OiAke2Vycm9yfWAsXG4gICAgLy8gICAgICk7XG4gICAgLy8gICB9XG4gICAgLy8gfVxuXG4gICAgLy8gaWYgKHZpZGVvQ2xpcHMubGVuZ3RoID09PSAwKSB7XG4gICAgLy8gICBjb25zb2xlLmxvZygn4p2MIEVycm9yOiBObyB2aWRlbyBjbGlwcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgIC8vICAgdGhyb3cgbmV3IEVycm9yKCdObyB2aWRlbyBjbGlwcyB3ZXJlIGdlbmVyYXRlZCcpO1xuICAgIC8vIH1cblxuICAgIC8vIGNvbnNvbGUubG9nKGDinIUgR2VuZXJhdGVkICR7dmlkZW9DbGlwcy5sZW5ndGh9IHZpZGVvIGNsaXBzYCk7XG5cbiAgICAvLyBTdGVwIDQ6IEdlbmVyYXRlIHZpZGVvIGVmZmVjdHMgYW5kIGNhbWVyYSBtb3ZlbWVudCB1c2luZyB0aGUgaW1hZ2VzXG4gICAgYXdhaXQgYnJvYWRjYXN0VmlkZW9Qcm9ncmVzcyhcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgJ0dlbmVyYXRpbmcgdmlkZW8gZWZmZWN0cycsXG4gICAgKTtcblxuICAgIGNvbnN0IHZpZGVvRWZmZWN0c1VybHMgPSBhd2FpdCBnZW5lcmF0ZVZpZGVvRWZmZWN0cyhcbiAgICAgIHNjZW5lcyxcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RWaWRlb1Byb2dyZXNzKFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICAnVmlkZW8gZWZmZWN0cyBjb21wbGV0ZWQnLFxuICAgICAge1xuICAgICAgICBpbWFnZVVybHMsXG4gICAgICAgIHZpZGVvRWZmZWN0c1VybHMsXG4gICAgICB9LFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZygn8J+OrCBWaWRlbyBlZmZlY3RzIFVSTHMgZ2VuZXJhdGVkOicsIHZpZGVvRWZmZWN0c1VybHMpO1xuXG4gICAgLy8gU3RlcCA2OiBDb21iaW5lIHZpZGVvIGNsaXBzLCBhdWRpbywgYW5kIHN1YnRpdGxlc1xuICAgIGF3YWl0IGJyb2FkY2FzdFZpZGVvUHJvZ3Jlc3MoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgICdDb21iaW5pbmcgZmluYWwgdmlkZW8gc3RhcnRlZCcsXG4gICAgKTtcblxuICAgIGNvbnN0IGZpbmFsVmlkZW8gPSBhd2FpdCBjb21iaW5lVmlkZW9BbmRBdWRpbyhcbiAgICAgIHJlcXVlc3QudXNlcklkLFxuICAgICAgdGltZXN0YW1wLFxuICAgICAgc2NlbmVzLFxuICAgICk7XG5cbiAgICBhd2FpdCBicm9hZGNhc3RWaWRlb1Byb2dyZXNzKFxuICAgICAgcmVxdWVzdC51c2VySWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICAnRmluYWwgdmlkZW8gY29tYmluZWQnLFxuICAgICk7XG5cbiAgICBpZiAoIWZpbmFsVmlkZW8pIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGNvbWJpbmUgdmlkZW8sIGF1ZGlvLCBhbmQgc3VidGl0bGVzJyk7XG4gICAgfVxuXG4gICAgLy8gU3RlcCA2OiBVcGxvYWQgdG8gUzNcbiAgICBjb25zdCB2aWRlb0tleSA9IGF3YWl0IHVwbG9hZFRvUzMoZmluYWxWaWRlbywgcmVxdWVzdC51c2VySWQsIHRpbWVzdGFtcCk7XG5cbiAgICAvLyBJZiB0aGlzIHdhcyB0cmlnZ2VyZWQgYnkgU1FTLCBkZWxldGUgdGhlIG1lc3NhZ2UgZnJvbSB0aGUgcXVldWVcbiAgICBpZiAocmVjb3JkICYmIHByb2Nlc3MuZW52LlZJREVPX1FVRVVFX1VSTCkge1xuICAgICAgY29uc3QgZGVsZXRlQ29tbWFuZCA9IG5ldyBEZWxldGVNZXNzYWdlQ29tbWFuZCh7XG4gICAgICAgIFF1ZXVlVXJsOiBwcm9jZXNzLmVudi5WSURFT19RVUVVRV9VUkwsXG4gICAgICAgIFJlY2VpcHRIYW5kbGU6IHJlY29yZC5yZWNlaXB0SGFuZGxlLFxuICAgICAgfSk7XG4gICAgICBhd2FpdCBzcXMuc2VuZChkZWxldGVDb21tYW5kKTtcbiAgICB9XG5cbiAgICAvLyBCcm9hZGNhc3QgdmlkZW8gZ2VuZXJhdGlvbiBjb21wbGV0ZWQgZXZlbnRcbiAgICBhd2FpdCBicm9hZGNhc3RWaWRlb0dlbmVyYXRpb25Db21wbGV0ZWQoXG4gICAgICByZXF1ZXN0LnVzZXJJZCxcbiAgICAgIHRpbWVzdGFtcCxcbiAgICAgIHZpZGVvS2V5LFxuICAgICk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgbWVzc2FnZTogJ1ZpZGVvIGdlbmVyYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gdmlkZW8gZ2VuZXJhdGlvbjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGJyb2FkY2FzdCB2aWRlbyBnZW5lcmF0aW9uIHByb2dyZXNzIHZpYSBXZWJTb2NrZXRcbmFzeW5jIGZ1bmN0aW9uIGJyb2FkY2FzdFZpZGVvUHJvZ3Jlc3MoXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgbWVzc2FnZTogc3RyaW5nLFxuICBkYXRhPzogYW55LFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIHRyeSB7XG4gICAgY29uc3QgcHJvZ3Jlc3NNZXNzYWdlID0ge1xuICAgICAgYWN0aW9uOiAndmlkZW9fZ2VuZXJhdGlvbl9wcm9ncmVzcycsXG4gICAgICBkYXRhOiB7XG4gICAgICAgIHVzZXJJZCxcbiAgICAgICAgdGltZXN0YW1wLFxuICAgICAgICBtZXNzYWdlLFxuICAgICAgICAuLi5kYXRhLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgLy8gR2V0IHRoZSBXZWJTb2NrZXQgZG9tYWluIGFuZCBzdGFnZSBmcm9tIGVudmlyb25tZW50IHZhcmlhYmxlc1xuICAgIGNvbnN0IGRvbWFpbk5hbWUgPSBwcm9jZXNzLmVudi5XRUJTT0NLRVRfRE9NQUlOX05BTUU7XG4gICAgY29uc3Qgc3RhZ2UgPSBwcm9jZXNzLmVudi5XRUJTT0NLRVRfU1RBR0UgfHwgJ3Byb2QnO1xuXG4gICAgaWYgKGRvbWFpbk5hbWUpIHtcbiAgICAgIGF3YWl0IGJyb2FkY2FzdE1lc3NhZ2UocHJvZ3Jlc3NNZXNzYWdlLCBkb21haW5OYW1lLCBzdGFnZSwgdXNlcklkKTtcbiAgICAgIGNvbnNvbGUubG9nKGDwn5OhIFdlYlNvY2tldCBwcm9ncmVzcyBicm9hZGNhc3Q6ICR7bWVzc2FnZX1gKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGDwn5OhIFdlYlNvY2tldCBub3QgY29uZmlndXJlZCwgc2tpcHBpbmcgYnJvYWRjYXN0OiAke21lc3NhZ2V9YCxcbiAgICAgICk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGJyb2FkY2FzdGluZyB2aWRlbyBwcm9ncmVzczonLCBlcnJvcik7XG4gICAgLy8gRG9uJ3QgdGhyb3cgZXJyb3IgdG8gYXZvaWQgYnJlYWtpbmcgdGhlIG1haW4gcHJvY2Vzc1xuICB9XG59XG5cbi8vIEhlbHBlciBmdW5jdGlvbiB0byBicm9hZGNhc3Qgc3VidGl0bGUgZmlsZXMgY29tcGxldGVkIGV2ZW50XG5hc3luYyBmdW5jdGlvbiBicm9hZGNhc3RTdWJ0aXRsZUZpbGVzQ29tcGxldGVkKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHN1YnRpdGxlVXJsczogQXJyYXk8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT4sXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBzdWJ0aXRsZU1lc3NhZ2UgPSB7XG4gICAgICBhY3Rpb246ICdzdWJ0aXRsZV9maWxlc19jb21wbGV0ZWQnLFxuICAgICAgZGF0YToge1xuICAgICAgICB1c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgc3VidGl0bGVGaWxlczogc3VidGl0bGVVcmxzLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgY29uc3QgZG9tYWluTmFtZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9ET01BSU5fTkFNRTtcbiAgICBjb25zdCBzdGFnZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9TVEFHRSB8fCAncHJvZCc7XG5cbiAgICBpZiAoZG9tYWluTmFtZSkge1xuICAgICAgYXdhaXQgYnJvYWRjYXN0TWVzc2FnZShzdWJ0aXRsZU1lc3NhZ2UsIGRvbWFpbk5hbWUsIHN0YWdlLCB1c2VySWQpO1xuICAgICAgY29uc29sZS5sb2coYPCfk6EgV2ViU29ja2V0IHN1YnRpdGxlIGZpbGVzIGNvbXBsZXRlZCBicm9hZGNhc3RgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coYPCfk6EgV2ViU29ja2V0IG5vdCBjb25maWd1cmVkLCBza2lwcGluZyBzdWJ0aXRsZSBicm9hZGNhc3RgKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgYnJvYWRjYXN0aW5nIHN1YnRpdGxlIGZpbGVzIGNvbXBsZXRlZDonLCBlcnJvcik7XG4gIH1cbn1cblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGJyb2FkY2FzdCBtZWRpYSBmaWxlcyBjb21wbGV0ZWQgZXZlbnRcbmFzeW5jIGZ1bmN0aW9uIGJyb2FkY2FzdE1lZGlhRmlsZXNDb21wbGV0ZWQoXG4gIHVzZXJJZDogc3RyaW5nLFxuICB0aW1lc3RhbXA6IHN0cmluZyxcbiAgdmlkZW9FZmZlY3RzVXJsczogQXJyYXk8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT4sXG4gIGltYWdlVXJsczogQXJyYXk8eyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT4sXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBtZWRpYU1lc3NhZ2UgPSB7XG4gICAgICBhY3Rpb246ICdtZWRpYV9maWxlc19jb21wbGV0ZWQnLFxuICAgICAgZGF0YToge1xuICAgICAgICB1c2VySWQsXG4gICAgICAgIHRpbWVzdGFtcCxcbiAgICAgICAgbWVkaWFGaWxlczoge1xuICAgICAgICAgIHZpZGVvRWZmZWN0czogdmlkZW9FZmZlY3RzVXJscyxcbiAgICAgICAgICBpbWFnZXM6IGltYWdlVXJscyxcbiAgICAgICAgfSxcbiAgICAgICAgYXNzRmlsZXM6IHt9LCAvLyBUaGlzIHdpbGwgYmUgcG9wdWxhdGVkIGJ5IHRoZSBmcm9udGVuZCB3aGVuIG5lZWRlZFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgY29uc3QgZG9tYWluTmFtZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9ET01BSU5fTkFNRTtcbiAgICBjb25zdCBzdGFnZSA9IHByb2Nlc3MuZW52LldFQlNPQ0tFVF9TVEFHRSB8fCAncHJvZCc7XG5cbiAgICBpZiAoZG9tYWluTmFtZSkge1xuICAgICAgYXdhaXQgYnJvYWRjYXN0TWVzc2FnZShtZWRpYU1lc3NhZ2UsIGRvbWFpbk5hbWUsIHN0YWdlLCB1c2VySWQpO1xuICAgICAgY29uc29sZS5sb2coYPCfk6EgV2ViU29ja2V0IG1lZGlhIGZpbGVzIGNvbXBsZXRlZCBicm9hZGNhc3RgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS5sb2coYPCfk6EgV2ViU29ja2V0IG5vdCBjb25maWd1cmVkLCBza2lwcGluZyBtZWRpYSBicm9hZGNhc3RgKTtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgYnJvYWRjYXN0aW5nIG1lZGlhIGZpbGVzIGNvbXBsZXRlZDonLCBlcnJvcik7XG4gIH1cbn1cblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGJyb2FkY2FzdCB2aWRlbyBnZW5lcmF0aW9uIGNvbXBsZXRlZCBldmVudFxuYXN5bmMgZnVuY3Rpb24gYnJvYWRjYXN0VmlkZW9HZW5lcmF0aW9uQ29tcGxldGVkKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgdGltZXN0YW1wOiBzdHJpbmcsXG4gIHZpZGVvS2V5OiBzdHJpbmcsXG4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCBjb21wbGV0aW9uTWVzc2FnZSA9IHtcbiAgICAgIGFjdGlvbjogJ3ZpZGVvX2dlbmVyYXRpb25fY29tcGxldGVkJyxcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgdXNlcklkLFxuICAgICAgICB0aW1lc3RhbXAsXG4gICAgICAgIHZpZGVvS2V5LFxuICAgICAgICBtZXNzYWdlOiAnVmlkZW8gZ2VuZXJhdGlvbiBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIGNvbnN0IGRvbWFpbk5hbWUgPSBwcm9jZXNzLmVudi5XRUJTT0NLRVRfRE9NQUlOX05BTUU7XG4gICAgY29uc3Qgc3RhZ2UgPSBwcm9jZXNzLmVudi5XRUJTT0NLRVRfU1RBR0UgfHwgJ3Byb2QnO1xuXG4gICAgaWYgKGRvbWFpbk5hbWUpIHtcbiAgICAgIGF3YWl0IGJyb2FkY2FzdE1lc3NhZ2UoY29tcGxldGlvbk1lc3NhZ2UsIGRvbWFpbk5hbWUsIHN0YWdlLCB1c2VySWQpO1xuICAgICAgY29uc29sZS5sb2coYPCfk6EgV2ViU29ja2V0IHZpZGVvIGdlbmVyYXRpb24gY29tcGxldGVkIGJyb2FkY2FzdGApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmxvZyhg8J+ToSBXZWJTb2NrZXQgbm90IGNvbmZpZ3VyZWQsIHNraXBwaW5nIGNvbXBsZXRpb24gYnJvYWRjYXN0YCk7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGJyb2FkY2FzdGluZyB2aWRlbyBnZW5lcmF0aW9uIGNvbXBsZXRlZDonLCBlcnJvcik7XG4gIH1cbn1cbiJdfQ==